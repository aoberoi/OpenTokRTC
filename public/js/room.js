/*global Handlebars:false, unescape:false */

function User(roomId, apiKey, sessionId, token){
  // room information
  this.roomId = roomId;
  this.apiKey = apiKey;
  this.sessionId = sessionId;
  this.token = token;

  // templates
  this.messageTemplate = Handlebars.compile( $("#messageTemplate").html() );
  this.userStreamTemplate = Handlebars.compile( $("#userStreamTemplate").html() );
  this.notifyTemplate = Handlebars.compile( $("#notifyTemplate").html() );
  this.initialized = false;

  // variables
  this.chatData = [];
  this.filterData = {};
  this.allUsers = {};
  this.subscribers = {};
  this.leader = false; // user being focused
  this.layout = OT.initLayoutContainer( document.getElementById( "streams_container"), {
    fixedRatio: true,
    animate: true,
    bigClass: "OT_big",
    bigPercentage: 0.85,
    bigFixedRatio: false,
    easing: "swing"
  }).layout;

  // setup opentok listeners
  var self = this;
  this.publisher = OT.initPublisher( this.apiKey, "myPublisher", {width:"100%", height:"100%"} );
  this.session = OT.initSession( this.apiKey, this.sessionId );
  this.session.on({
    "sessionDisconnected": this.sessionDisconnected,
    "streamCreated": this.streamCreated,
    "streamDestroyed": this.streamDestroyed,
    "connectionCreated": this.connectionCreated,
    "connectionDestroyed": this.connectionDestroyed,
    "signal": this.signalReceived
  }, this);
  this.session.connect(this.token,function(err){
    if( err ){
      alert("Unable to connect to session. Sorry");
      return;
    }
    self.myConnectionId = self.session.connection.connectionId;
    self.name = "Guest-"+self.myConnectionId.substring( self.myConnectionId.length - 8, self.myConnectionId.length );
    self.allUsers[ self.myConnectionId ] = self.name;
    self.session.publish( self.publisher );
    self.layout();
    $("#messageInput").removeAttr( "disabled" );
    $('#messageInput').focus();
  });

  // add event listeners to dom
  $(".headerOption").click(function(){ // Header to select between filters and commands
    $(".headerOption").removeClass("selected");
    $(this).addClass("selected");
    $(".optionContainer").hide();
    var option = $(this).data('option');
    $(".optionContainer#"+option).show();
  });
  $(".controlOption").click(function(){
    if($(this).hasClass('selected')){
      $(this).removeClass('selected');
      self.triggerActivity( $(this).data('activity'), "stop" );
    } else {
      $(this).addClass('selected');
      self.triggerActivity( $(this).data('activity'), "start" );
    }
  });
  $(".filterOption").click(function(){
    $(".filterOption").removeClass("selected");
    var prop = $(this).data('value');
    self.applyClassFilter( prop, "#myPublisher" );
    $(this).addClass("selected");
    self.sendSignal( "filter", {cid: self.session.connection.connectionId, filter: prop });
    self.filterData[self.session.connection.connectionId] = prop;
  });
  $('#chatroom').click(function(){
    $(".container").css('right', '0px');
    $("#messageInput").focus();
  });
  $('#messageInput').keypress(function(e){
    self.inputKeypress(e);
  });
  $("#streams_container").click(function(){
    $('.container').css('right', '-300px');
  });
  $(".container").on("transitionend webkitTransitionEnd oTransitionEnd otransitionend", function(){
    self.layout();
  });
  window.onresize = this.layout();
  this.printCommands(); // welcome users into the room
}

// OpenTok callbacks
User.prototype.sessionDisconnected = function(event){
  var msg = (event.reason === "forceDisconnected") ? "Someone in the room found you offensive and removed you. Please evaluate your behavior" : "You have been disconnected! Please try again";
  alert(msg);
  window.location = "/";
};

User.prototype.streamCreated = function(event){
  var streamConnectionId = event.stream.connection.connectionId;

  // create new div container for stream, subscribe, apply filter
  var divId = "stream" + streamConnectionId;
  $("#streams_container").append( this.userStreamTemplate({ id: divId, connectionId: streamConnectionId }) );
  this.subscribers[ streamConnectionId ] = this.session.subscribe( event.stream, divId , {width:"100%", height:"100%"} );

  // bindings to mark offensive users
  var divId$ = $("."+divId);
  divId$.mouseenter(function(){
    $(this).find('.flagUser').show();
  });
  divId$.mouseleave(function(){
    $(this).find('.flagUser').hide();
  });

  // mark user as offensive
  var self = this;
  divId$.find('.flagUser').click(function(){
    var streamConnection = $(this).data('streamconnection');
    if(confirm("Is this user being inappropriate? If so, click confirm to remove user")){
      self.applyClassFilter("Blur", "."+streamConnection);
      self.session.forceDisconnect( streamConnection.split("stream")[1] );
    }
  });
  this.syncStreamsProperty();
  this.layout();
};

User.prototype.streamDestroyed = function(event){
  this.removeStream( event.stream.connection.connectionId );
  this.layout();
};

User.prototype.connectionCreated = function( event ){
  var cid = event.connection.connectionId;
  if( !this.allUsers[cid]){
    var guestName = "Guest-" + cid.substring( cid.length - 8, cid.length );
    this.allUsers[cid] = guestName;
  }
  var dataToSend = {chat: this.chatData, filter: this.filterData, users: this.allUsers, random:[1,2,3], leader: this.leader};
  if(this.archiveId && $("#recordButton").hasClass("selected")){
    dataToSend.archiveId = this.archiveId;
  }
  this.sendSignal( "initialize", dataToSend, event.connection);
  this.displayChatMessage( this.notifyTemplate( {message: this.allUsers[cid] + " has joined the room" }));
};

User.prototype.connectionDestroyed = function( event ){
  var cid = event.connection.connectionId;
  this.displayChatMessage( this.notifyTemplate( {message: this.allUsers[cid] + " has left the room"   } ) );
  if(this.subscribers[ cid ]){
    delete(this.subscribers[cid]);
  }
  delete this.allUsers[cid];
};

User.prototype.signalReceived = function( event ){
  var data = JSON.parse( event.data );
  var k,i,e, streamConnectionId;
  var streamContainer$ = $(".streamContainer");
  switch(event.type){
    case "signal:initialize":
      if(this.initialized){
        return;
      }
      this.leader = data.leader;
      for(k in data.users){
        this.allUsers[k] = data.users[k];
      }
      for(k in data.filter){
        this.filterData[k] = data.filter[k];
      }
      for(i in data.chat){
        this.writeChatData( data.chat[i] );
      }
      if(data.archiveId){
        this.archiveId = data.archiveId;
        $("#recordButton").addClass("selected");
      }
      this.initialized = true;
      this.syncStreamsProperty();
      break;
    case "signal:chat":
      this.writeChatData( data );
      break;
    case "signal:focus":
      // restrict frame rate - first handle publishers
      this.leader = data;
      for(i=0;i< streamContainer$.length; i++){
        this.setLeaderProperties( streamContainer$[i] );
      }
      if(this.myConnectionId === this.leader){
        $("#myPublisherContainer").addClass( "OT_big" );
      }
      this.layout();
      this.writeChatData( {name: this.allUsers[data], text:"/serv "+this.allUsers[data]+" is leading the group. Everybody else's video bandwidth is restricted."  } );
      break;
    case "signal:unfocus":
      this.leader = false;
      $("#myPublisherContainer").removeClass( "OT_big" );
      for(i=0;i< streamContainer$.length; i++){
        e = streamContainer$[i];
        $(e).removeClass( "OT_big" );
        streamConnectionId = $(e).data('connectionid');
        if(this.subscribers[ streamConnectionId ]){
          this.subscribers[ streamConnectionId ].restrictFrameRate( false );
        }
      }
      this.layout();
      this.writeChatData( {name: this.allUsers[data], text:"/serv Everybody is now on equal standing. No one leading the group."  } );
      break;
    case "signal:filter":
      this.applyClassFilter(data.filter, ".stream"+data.cid);
      break;
    case "signal:name":
      var oldName = this.allUsers[ data[0] ];
      this.allUsers[ data[0] ] = data[1];
      this.writeChatData( {name: this.allUsers[ data[0] ], text: "/serv "+oldName+" is now known as "+this.allUsers[ data[0] ] } );
      break;
    case "signal:archive":
      var actionVerb;
      if(data.action === "start"){
        actionVerb = "started";
        $(".controlOption[data-activity=record]").addClass('selected');
      } else{
        actionVerb = "stopped";
        $(".controlOption[data-activity=record]").removeClass('selected');
      }
      this.archiveId = data.archiveId;
      var archiveUrl = window.location.origin +"/archive/"+data.archiveId+"/"+this.roomId;
      this.writeChatData( {name:data.name, text: "/serv Archiving for this session has "+actionVerb+". View it here: "+ archiveUrl});
      break;
  }
};

// event
User.prototype.inputKeypress = function( e ){
  var msgData = {};
  if (e.keyCode !== 13){
    return;
  }
  var text = $('#messageInput').val().trim();
  if( text.length < 1){
    return;
  }

  var parts = text.split(' '), k;
  switch(parts[0]){
    case "/hide":
      $('#messageInput').blur();
      $('.container').css('right', '-300px');
      break;
    case "/help":
      this.printCommands();
      break;
    case "/list":
      this.displayChatMessage( this.notifyTemplate( {message: "-----------"} ) );
      this.displayChatMessage( this.notifyTemplate( {message: "Users currently in the room"} ) );
      for(k in this.allUsers){
        this.displayChatMessage( this.notifyTemplate( {message: "- "+this.allUsers[k]} ) );
      }
      this.displayChatMessage( this.notifyTemplate( {message: "-----------"} ) );
      break;
    case "/focus":
      this.sendSignal( "focus", this.myConnectionId);
      break;
    case "/unfocus":
      this.sendSignal( "unfocus", this.myConnectionId);
      break;
    case "/name":
    case "/nick":
      for(k in this.allUsers){
        if( this.allUsers[k] === parts[1] || parts[1].length <= 2){
          alert("Sorry, but that name has already been taken or is too short.");
          return;
        }
      }
      this.name = parts[1];
      this.sendSignal("name", [this.myConnectionId, this.name]);
      break;
    default:
      this.sendSignal("chat", {name: this.name, text: text});
  }
  $('#messageInput').val('');
};

// helpers
User.prototype.sendSignal = function( type, data, to ){
  var signalData = {type: type, data: JSON.stringify(data)};
  if(to){
    signalData.to = to;
  }
  this.session.signal( signalData, this.errorSignal );
};

User.prototype.setLeaderProperties = function( e ){
  var streamConnectionId = $(e).data('connectionid');
  if(streamConnectionId === this.leader && this.subscribers[ this.leader ]){
    $(e).addClass( "OT_big" );
    this.subscribers[ this.leader ].restrictFrameRate( false );
  } else{
    $(e).removeClass( "OT_big" );
    if(this.subscribers[ streamConnectionId ] && (this.subscribers[ this.leader ] || this.leader === this.myConnectionId)){
      this.subscribers[ streamConnectionId ].restrictFrameRate( true );
    }
  }
};

User.prototype.syncStreamsProperty = function(){
  var i,e,streamConnectionId;
  for(i=0;i< $(".streamContainer").length; i++){
    e = $(".streamContainer")[i];
    this.setLeaderProperties( e );
    streamConnectionId = $(e).data( 'connectionid' );
    if(this.filterData && this.filterData[ streamConnectionId ]){
      this.applyClassFilter( this.filterData[ streamConnectionId ], ".stream"+streamConnectionId );
    }
  }
  if( this.myConnectionId === this.leader){
    $("#myPublisherContainer").addClass( "OT_big" );
  }
  this.layout();
};

User.prototype.errorSignal = function(error){
  if(error){
    console.log("signal error: " + error.reason);
  }
};

User.prototype.triggerActivity = function(activity, action){
  console.log("starting activity");
  switch(activity){
    case "record":
      var data = {action: action, roomId: this.roomId}; // room Id needed for room servation credentials on server
      if(this.archiveId){
        data.archiveId = this.archiveId;
      }
      var self = this;
      $.post("/archive/"+this.sessionId, data, function(response){
        console.log("trying to start archive");
        console.log(response);
        if(response.id){
          self.archiveId = response.id;
          self.sendSignal( "archive", {name: self.name, archiveId: response.id, action:action});
        }
      });
      break;
  }
};

User.prototype.applyClassFilter = function(prop, selector){
  if(prop){
    $(selector).removeClass( "Blur Sepia Grayscale Invert" );
    $(selector).addClass( prop );
    console.log("applyclassfilter..."+prop);
  }
};

User.prototype.removeStream = function(cid){
  $(".stream"+cid).remove();
};

User.prototype.writeChatData = function(val){
  this.chatData.push( {name: val.name, text: unescape(val.text) } );
  var text = val.text.split(' ');
  var message = "";
  var urlRegex = /(https?:\/\/)?([\da-z\.-]+)\.([a-z]{2,6})(\/.*)?$/g;
  var i,e;
  for(i in text){
    e = text[i];
    if(e.length<2000 && e.match( urlRegex ) && e.split("..").length < 2 && e[e.length-1] !== "."){
      message += e.replace( urlRegex,"<a href='http://$2.$3$4' target='_blank'>$1$2.$3$4<a>" )+" ";
    } else{
      message += Handlebars.Utils.escapeExpression(e) + " ";
    }
  }
  val.text = message;
  if(text[0] === "/serv"){
    this.displayChatMessage( this.notifyTemplate( {message: val.text.split("/serv")[1] } ) );
    return;
  }
  this.displayChatMessage( this.messageTemplate( val ) );
};
  
User.prototype.displayChatMessage = function(message){
  $("#displayChat").append( message);
  $('#displayChat')[0].scrollTop = $('#displayChat')[0].scrollHeight;
};

User.prototype.printCommands = function(){
    this.displayChatMessage( this.notifyTemplate( {message: "-----------"} ) );
    this.displayChatMessage( this.notifyTemplate( {message: "Welcome to OpenTokRTC by TokBox"} ) );
    this.displayChatMessage( this.notifyTemplate( {message: "Type /nick your_name to change your name"} ) );
    this.displayChatMessage( this.notifyTemplate( {message: "Type /list to see list of users in the room"} ) );
    this.displayChatMessage( this.notifyTemplate( {message: "Type /help to see a list of commands"} ) );
    this.displayChatMessage( this.notifyTemplate( {message: "Type /hide to hide chat bar"} ) );
    this.displayChatMessage( this.notifyTemplate( {message: "Type /focus to lead the group"} ) );
    this.displayChatMessage( this.notifyTemplate( {message: "Type /unfocus to put everybody on equal standing"} ) );
    this.displayChatMessage( this.notifyTemplate( {message: "-----------"} ) );
    $(".chatMessage:first").css("margin-top", $("#title").outerHeight()+"px");
    $(".chatMessage:contains('Welcome to OpenTokRTC')").find('em').css("color", "#000");
};

window.User = User;

