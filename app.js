// ***
// *** Required modules
// ***
var express = require('express');
var OpenTokLibrary = require('opentok');

// middleware
var cors = require('cors'),
    tlsCheck = require('./lib/tls-check'),
    format = require('./lib/format'),
    p2pCheck = require('./lib/p2p-check');

// ***
// *** OpenTok Constants for creating Session and Token values
// ***
var OTKEY = process.env.TB_KEY;
var OTSECRET = process.env.TB_SECRET;
var OpenTokObject = new OpenTokLibrary(OTKEY, OTSECRET);

// ***
// *** Setup Express to handle static files in public folder
// *** Express is also great for handling url routing
// ***
var app = express();
app.set( 'views', __dirname + "/views");
app.set( 'view engine', 'ejs' );
app.use(express.static(__dirname + '/public'));

// ***
// *** Load middleware
// ***
app.use(cors({methods:'GET'}));
tlsCheck(app);
format(app);
p2pCheck(app);
// reservations may or may not exist
try {
  var reservations = require('./lib/reservations');
  reservations(app);
} catch (err) {
  if (err.code !== 'MODULE_NOT_FOUND') {
    throw err;
  }
}


// ***
// *** When user goes to root directory, render index page
// ***
app.get("/", function( req, res ){
  res.render('index');
});

var rooms = {};

app.get("/:rid", function( req, res ){
  // final function to be called when all the necessary data is gathered
  var sendRoomResponse = function(apiKey, sessionId, token) {
    var data = {
      rid: rid,
      sid: sessionId,
      apiKey : apiKey,
      token: token
    };
    if (req.format === 'json') {
      res.json(data);
    } else {
      res.render('room', data);
    }
  };

  console.log(req.url);

  var rid = req.params.rid.split('.json')[0];
  var room_uppercase = rid.toUpperCase();

  // When a room is given through a reservation
  if (req.sessionId && req.apiKey && req.token) {
    sendRoomResponse(req.apiKey, req.sessionId, req.token);

  // When a room has already been created
  } else if (rooms[room_uppercase]) {
    req.sessionId = rooms[room_uppercase];
    sendRoomResponse(OTKEY, req.sessionId, OpenTokObject.generateToken(req.sessionId, {role: 'moderator'}));

  // When a room needs to be created
  } else {
    OpenTokObject.createSession( req.sessionProperties || {} , function(err, session){
      if (err) {
        return res.send(500, "could not generate opentok session");
      }
      console.log('opentok session generated:', session.sessionId);
      rooms[room_uppercase] = session.sessionId;
      sendRoomResponse(OTKEY, session.sessionId, OpenTokObject.generateToken(session.sessionId, {role: 'moderator'}));
    });
  }
});


// ***
// *** start server, listen to port (predefined or 9393)
// ***
var port = process.env.PORT || 9393;
app.listen(port);
