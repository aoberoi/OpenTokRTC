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

    @layout = TB.initLayoutContainer( document.getElementById( "streams_container"), {
      fixedRatio: true
      animate: true
      bigClass: "OT_big"
      bigPercentage: 0.85
      bigFixedRatio: false
      easing: "swing"
    }).layout

    # set up OpenTok
    @publisher = TB.initPublisher( @apiKey, "myPublisher", {width:"100%", height:"100%", publishAudio: false} )
    @session = TB.initSession( @sid )
    @session.on( "sessionConnected", @sessionConnectedHandler )
    @session.on( "sessionDisconnected", @sessionDisconnectedHandler )
    @session.on( "streamCreated", @streamCreatedHandler )
    @session.on( "streamDestroyed", @streamDestroyedHandler )
    @session.on( "connectionCreated", @connectionCreatedHandler )
    @session.on( "connectionDestroyed", @connectionDestroyedHandler )
    @session.on( "signal:initialize", @signalInitializeHandler )
    @session.on( "signal:chat", @signalChatHandler )
    @session.on( "signal:focus", @signalFocusHandler )
    @session.on( "signal:unfocus", @signalUnfocusHandler )
    @session.on( "signal:filter", @signalFilterHandler )
    @session.on( "signal:name", @signalNameHandler )
    @session.connect( @apiKey, @token )

    # add event listeners
    self = @
    $(".filterOption").click ->
      $(".filterOption").removeClass("optionSelected")
      prop = $(@).data('value')
      self.applyClassFilter( prop, "#myPublisher" )
      $(@).addClass("optionSelected")
      self.session.signal( {type: "filter", data: {cid: self.session.connection.connectionId, filter: prop }}, self.errorSignal )
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
  sessionConnectedHandler: (event) =>
    console.log "session connected"
    @subscribeStreams(event.streams)
    @session.publish( @publisher )
    @layout()

    @myConnectionId = @session.connection.connectionId
    @name = "Guest-#{@myConnectionId.substring( @myConnectionId.length - 8, @myConnectionId.length )}"
    @allUsers[ @myConnectionId ] = @name
    $("#messageInput").removeAttr( "disabled" )
    $('#messageInput').focus()
  sessionDisconnectedHandler: (event) =>
    console.log event.reason
    if( event.reason == "forceDisconnected" )
      alert "Someone in the room found you offensive and removed you. Please evaluate your behavior"
    else
      alert "You have been disconnected! Please try again"
    window.location = "/"
  streamCreatedHandler: (event) =>
    console.log "streamCreated"
    @subscribeStreams(event.streams)
    @layout()
  streamDestroyedHandler: (event) =>
    for stream in event.streams
      if @session.connection.connectionId == stream.connection.connectionId
        return
      @removeStream( stream.connection.connectionId )
    @layout()
  connectionCreatedHandler: ( event ) =>
    console.log "new connection created"
    cid = "#{event.connections[0].id}"
    guestName = "Guest-#{cid.substring( cid.length - 8, cid.length )}"
    console.log "signaling over!"
    @allUsers[cid] = guestName
    @writeChatData( {name: @name, text:"/serv #{guestName} has joined the room"  } )
    @session.signal( { type: "initialize", to: event.connection, data: {
      chat: @chatData, filter: @filterData, users: @allUsers, random:[1,2,3], leader: @leader
    }}, @errorSignal )
    console.log "signal new connection room info"
  connectionDestroyedHandler: ( event ) =>
    cid = "#{event.connections[0].id}"
    @writeChatData( {name: @name, text:"/serv #{@allUsers[cid]} has left the room"  } )
    if @subscribers[ cid ]
      delete @subscribers[cid]
    delete @allUsers[cid]
  signalInitializeHandler: ( event ) =>
    console.log "initialize handler"
    console.log event.data
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
  signalChatHandler: ( event ) =>
    @writeChatData( event.data )
  signalFocusHandler: ( event ) =>
    # restrict frame rate - first handle publishers
    @leader = event.data
    for e in $(".streamContainer")
      @setLeaderProperties( e )
    if @myConnectionId == @leader
      $("#myPublisherContainer").addClass( "OT_big" )
    @layout()
    @writeChatData( {name: @allUsers[event.data], text:"/serv #{@allUsers[event.data]} is leading the group. Everybody else's video bandwidth is restricted."  } )
  signalUnfocusHandler: ( event ) =>
    @leader = false
    $("#myPublisherContainer").removeClass( "OT_big" )
    for e in $(".streamContainer")
      $(e).removeClass( "OT_big" )
      streamConnectionId = $(e).data('connectionid')
      if @subscribers[ streamConnectionId ]
        @subscribers[ streamConnectionId ].restrictFrameRate( false )
    @layout()
    @writeChatData( {name: @allUsers[event.data], text:"/serv Everybody is now on equal standing. No one leading the group."  } )
  signalFilterHandler: ( event ) =>
    val = event.data
    console.log "filter received"
    @applyClassFilter( val.filter, ".stream#{val.cid}" )
  signalNameHandler: ( event ) =>
    console.log "name signal received"
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
        $('#messageInput').val('')
      when "/focus"
        @session.signal( {type: "focus", data: @myConnectionId}, @errorSignal )
      when "/unfocus"
        @session.signal( {type: "unfocus", data: @myConnectionId}, @errorSignal )
      when "/name", "/nick"
        for k, v of @allUsers
          if v == parts[1] or parts[1].length <= 2
            alert("Sorry, but that name has already been taken or is too short.")
            return
        @name = parts[1]
        @session.signal( {type: "name", data: [@myConnectionId, @name]}, @errorSignal )
      else
        msgData = {name: @name, text: text}
        @session.signal( {type: "chat", data: msgData}, @errorSignal )
    $('#messageInput').val('')

  # helpers
  setLeaderProperties: ( e ) =>
    streamConnectionId = $(e).data('connectionid')
    if streamConnectionId == @leader && @subscribers[ streamConnectionId ]
      $(e).addClass( "OT_big" )
      @subscribers[ streamConnectionId ].restrictFrameRate( false )
    else
      $(e).removeClass( "OT_big" )
      if @subscribers[ streamConnectionId ]
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
  subscribeStreams: (streams) =>
    for stream in streams
      streamConnectionId = stream.connection.connectionId
      if @session.connection.connectionId == streamConnectionId
        return
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
    @displayChatMessage( @notifyTemplate( {message: "Welcome to OpenTokRTC."} ) )
    @displayChatMessage( @notifyTemplate( {message: "Type /nick your_name to change your name"} ) )
    @displayChatMessage( @notifyTemplate( {message: "Type /list to see list of users in the room"} ) )
    @displayChatMessage( @notifyTemplate( {message: "Type /help to see a list of commands"} ) )
    @displayChatMessage( @notifyTemplate( {message: "Type /hide to hide chat bar"} ) )
    @displayChatMessage( @notifyTemplate( {message: "Type /focus to lead the group"} ) )
    @displayChatMessage( @notifyTemplate( {message: "Type /unfocus to put everybody on equal standing"} ) )
    @displayChatMessage( @notifyTemplate( {message: "-----------"} ) )
    $(".chatMessage:first").css("margin-top", $("#title").outerHeight()+"px")
window.User = User
