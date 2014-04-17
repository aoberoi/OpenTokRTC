class User
  constructor: (@rid, @apiKey, @sid, @token) ->
    # templates
    @messageTemplate = Handlebars.compile( $("#messageTemplate").html() )
    @userStreamTemplate = Handlebars.compile( $("#userStreamTemplate").html() )
    @notifyTemplate = Handlebars.compile( $("#notifyTemplate").html() )

    # variables
    @initialized = false
    @chatData = []
    @filterData = {}
    @allUsers = {}
    @printCommands() # welcome users into the room
    @subscribers = {}
    @leader = false

    @layout = OT.initLayoutContainer( document.getElementById( "streams_container"), {
      fixedRatio: true
      animate: true
      bigClass: "OT_big"
      bigPercentage: 0.85
      bigFixedRatio: false
      easing: "swing"
    }).layout

    # set up OpenTok
    @publisher = OT.initPublisher( @apiKey, "myPublisher", {width:"100%", height:"100%"} )
    @session = OT.initSession( @apiKey, @sid )
    @session.on
      "sessionDisconnected": @sessionDisconnectedHandler
      "streamCreated": @streamCreatedHandler
      "streamDestroyed": @streamDestroyedHandler
      "connectionCreated": @connectionCreatedHandler
      "connectionDestroyed": @connectionDestroyedHandler
      "signal": @signalReceivedHandler
    @session.connect @token, (err) =>
      if( err )
        alert "Unable to connect to session. Sorry"
        return
      @myConnectionId = @session.connection.connectionId
      @name = "Guest-#{@myConnectionId.substring( @myConnectionId.length - 8, @myConnectionId.length )}"
      @allUsers[ @myConnectionId ] = @name
      @session.publish( @publisher )
      @layout()
      $("#messageInput").removeAttr( "disabled" )
      $('#messageInput').focus()

    # add event listeners
    self = @
    $(".filterOption").click ->
      $(".filterOption").removeClass("optionSelected")
      prop = $(@).data('value')
      self.applyClassFilter( prop, "#myPublisher" )
      $(@).addClass("optionSelected")
      self.sendSignal( "filter", {cid: self.session.connection.connectionId, filter: prop })
      self.filterData[self.session.connection.connectionId] = prop
    $('#chatroom').click ->
      $(".container").css( 'right', '0px' )
      $("#messageInput").focus()
    $('#messageInput').keypress @inputKeypress
    $("#streams_container").click ->
      $('.container').css('right', '-300px')
    $(".container").on "transitionend webkitTransitionEnd oTransitionEnd otransitionend", (event) ->
      self.layout()
    window.onresize = ->
      self.layout()

  # session and signaling events
  sessionDisconnectedHandler: (event) =>
    console.log event.reason
    if( event.reason == "forceDisconnected" )
      alert "Someone in the room found you offensive and removed you. Please evaluate your behavior"
    else
      alert "You have been disconnected! Please try again"
    window.location = "/"
  streamCreatedHandler: (event) =>
    console.log "streamCreated"
    stream = event.stream
    streamConnectionId = stream.connection.connectionId

    # create new div container for stream, subscribe, apply filter
    divId = "stream#{streamConnectionId}"
    $("#streams_container").append( @userStreamTemplate({ id: divId, connectionId: streamConnectionId }) )
    @subscribers[ streamConnectionId ] = @session.subscribe( stream, divId , {width:"100%", height:"100%"} )

    # bindings to mark offensive users
    divId$ = $(".#{divId}")
    divId$.mouseenter ->
      $(@).find('.flagUser').show()
    divId$.mouseleave ->
      $(@).find('.flagUser').hide()

    # mark user as offensive
    self = @
    divId$.find('.flagUser').click ->
      streamConnection = $(@).data('streamconnection')
      if confirm("Is this user being inappropriate? If so, we are sorry that you had to go through that. Click confirm to remove user")
        self.applyClassFilter("Blur", ".#{streamConnection}")
        self.session.forceDisconnect( streamConnection.split("stream")[1] )
    @syncStreamsProperty()
    @layout()
  streamDestroyedHandler: (event) =>
    @removeStream( event.stream.connection.connectionId )
    @layout()
  connectionCreatedHandler: ( event ) =>
    cid = "#{event.connection.connectionId}"
    if !@allUsers[cid]
      guestName = "Guest-#{cid.substring( cid.length - 8, cid.length )}"
      @allUsers[cid] = guestName
    @sendSignal( "initialize", {chat: @chatData, filter: @filterData, users: @allUsers, random:[1,2,3], leader: @leader}, event.connection)
    @displayChatMessage( @notifyTemplate( {message:"#{@allUsers[cid]} has joined the room"   } ) )
  connectionDestroyedHandler: ( event ) =>
    cid = "#{event.connection.connectionId}"
    @displayChatMessage( @notifyTemplate( {message:"#{@allUsers[cid]} has left the room"   } ) )
    if @subscribers[ cid ]
      delete @subscribers[cid]
    delete @allUsers[cid]
  signalReceivedHandler: ( event ) =>
    console.log "hello world"
    event.data = JSON.parse( event.data )
    console.log event
    switch event.type
      when "signal:initialize"
        console.log "initialize handler"
        if @initialized then return
        @leader = event.data.leader
        for k,v of event.data.users
          @allUsers[k] = v
        for k,v of event.data.filter
          @filterData[k] = v
        for e in event.data.chat
          @writeChatData( e )
        @initialized = true
        @syncStreamsProperty()
      when "signal:chat"
        @writeChatData( event.data )
      when "signal:focus"
        # restrict frame rate - first handle publishers
        @leader = event.data
        for e in $(".streamContainer")
          @setLeaderProperties( e )
        if @myConnectionId == @leader
          $("#myPublisherContainer").addClass( "OT_big" )
        @layout()
        @writeChatData( {name: @allUsers[event.data], text:"/serv #{@allUsers[event.data]} is leading the group. Everybody else's video bandwidth is restricted."  } )
      when "signal:unfocus"
        @leader = false
        $("#myPublisherContainer").removeClass( "OT_big" )
        for e in $(".streamContainer")
          $(e).removeClass( "OT_big" )
          streamConnectionId = $(e).data('connectionid')
          if @subscribers[ streamConnectionId ]
            @subscribers[ streamConnectionId ].restrictFrameRate( false )
        @layout()
        @writeChatData( {name: @allUsers[event.data], text:"/serv Everybody is now on equal standing. No one leading the group."  } )
      when "signal:filter"
        val = event.data
        @applyClassFilter( val.filter, ".stream#{val.cid}" )
      when "signal:name"
        oldName = @allUsers[ event.data[0] ]
        @allUsers[ event.data[0] ] = event.data[1]
        @writeChatData( {name: @allUsers[ event.data[0] ], text: "/serv #{oldName} is now known as #{@allUsers[ event.data[0] ]}" } )
  # events
  inputKeypress: (e) =>
    msgData = {}
    if (e.keyCode != 13) then return
    text = $('#messageInput').val().trim()
    if text.length < 1 then return

    parts = text.split(' ')
    switch parts[0]
      when "/hide"
        $('#messageInput').blur()
        $('.container').css('right', '-300px')
      when "/help"
        @printCommands()
      when "/list"
        @displayChatMessage( @notifyTemplate( {message: "-----------"} ) )
        @displayChatMessage( @notifyTemplate( {message: "Users currently in the room"} ) )
        for k,v of @allUsers
          @displayChatMessage( @notifyTemplate( {message: "- #{v}" } ) )
        @displayChatMessage( @notifyTemplate( {message: "-----------"} ) )
      when "/focus"
        @sendSignal( "focus", @myConnectionId)
      when "/unfocus"
        @sendSignal( "unfocus", @myConnectionId)
      when "/name", "/nick"
        for k, v of @allUsers
          if v == parts[1] or parts[1].length <= 2
            alert("Sorry, but that name has already been taken or is too short.")
            return
        @name = parts[1]
        @sendSignal("name", [@myConnectionId, @name])
      else
        @sendSignal("chat", {name: @name, text: text})
    $('#messageInput').val('')

  # helpers
  sendSignal: ( type, data, to ) =>
    data = {type: type, data: JSON.stringify(data)}
    if to? then data.to = to
    @session.signal( data, @errorSignal )

  setLeaderProperties: ( e ) =>
    streamConnectionId = $(e).data('connectionid')
    if streamConnectionId == @leader && @subscribers[ @leader ]
      $(e).addClass( "OT_big" )
      @subscribers[ @leader ].restrictFrameRate( false )
    else
      $(e).removeClass( "OT_big" )
      if @subscribers[ streamConnectionId ] && (@subscribers[ @leader ] || @leader==@myConnectionId)
        console.log "restricting frame rate of non leader"
        @subscribers[ streamConnectionId ].restrictFrameRate( true )
  syncStreamsProperty: =>
    for e in $(".streamContainer")
      @setLeaderProperties( e )
      streamConnectionId = $(e).data( 'connectionid' )
      if @filterData && @filterData[ streamConnectionId ]
        @applyClassFilter( @filterData[ streamConnectionId ], ".stream#{streamConnectionId}" )
    if @myConnectionId == @leader
      $("#myPublisherContainer").addClass( "OT_big" )
    @layout()
  errorSignal: (error) =>
    if (error)
      console.log("signal error: " + error.reason)
  applyClassFilter: (prop, selector) =>
    if prop
      $(selector).removeClass( "Blur Sepia Grayscale Invert" )
      $(selector).addClass( prop )
      console.log "applyclassfilter..."+prop
  removeStream: (cid) =>
    element$ = $(".stream#{cid}")
    element$.remove()
  writeChatData: (val) =>
    @chatData.push( {name: val.name, text: unescape(val.text) } )
    text = val.text.split(' ')
    if text[0] == "/serv"
      @displayChatMessage( @notifyTemplate( {message: val.text.split("/serv")[1] } ) )
      return
    message = ""
    urlRegex = /(https?:\/\/)?([\da-z\.-]+)\.([a-z]{2,6})(\/.*)?$/g
    for e in text
      if e.length<2000 and e.match( urlRegex ) and e.split("..").length < 2 and e[e.length-1] != "."
        message += e.replace( urlRegex,"<a href='http://$2.$3$4' target='_blank'>$1$2.$3$4<a>" )+" "
      else
        message += Handlebars.Utils.escapeExpression(e) + " "
    val.text = message
    @displayChatMessage( @messageTemplate( val ) )
  displayChatMessage: (message)->
    $("#displayChat").append message
    $('#displayChat')[0].scrollTop = $('#displayChat')[0].scrollHeight
  printCommands: ->
    @displayChatMessage( @notifyTemplate( {message: "-----------"} ) )
    @displayChatMessage( @notifyTemplate( {message: "Welcome to OpenTokRTC by TokBox"} ) )
    @displayChatMessage( @notifyTemplate( {message: "Type /nick your_name to change your name"} ) )
    @displayChatMessage( @notifyTemplate( {message: "Type /list to see list of users in the room"} ) )
    @displayChatMessage( @notifyTemplate( {message: "Type /help to see a list of commands"} ) )
    @displayChatMessage( @notifyTemplate( {message: "Type /hide to hide chat bar"} ) )
    @displayChatMessage( @notifyTemplate( {message: "Type /focus to lead the group"} ) )
    @displayChatMessage( @notifyTemplate( {message: "Type /unfocus to put everybody on equal standing"} ) )
    @displayChatMessage( @notifyTemplate( {message: "-----------"} ) )
    $(".chatMessage:first").css("margin-top", $("#title").outerHeight()+"px")
    $(".chatMessage:contains('Welcome to OpenTokRTC')").find('em').css("color", "#000")
window.User = User
