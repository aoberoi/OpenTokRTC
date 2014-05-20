// ***
// *** Required modules
// ***
var express    = require('express'),
    opentok    = require('opentok'),
    bodyParser = require('body-parser'), // middleware
    cors       = require('cors'),
    config     = require("./config"),
    storage    = require('./lib/store.js'),
    tlsCheck   = require('./lib/tls-check'),
    format     = require('./lib/format'),
    p2pCheck   = require('./lib/p2p-check');

// ***
// *** OpenTok Constants for creating Session and Token values
// ***
var OTKEY = config.opentok.key;
var ot = new opentok(config.opentok.key, config.opentok.secret);

// ***
// *** Setup Express to handle static files in public folder
// *** Express is also great for handling url routing
// ***
var app = express();
app.set( 'views', __dirname + "/views");
app.set( 'view engine', 'ejs' );
app.use(bodyParser());
app.use(express.static(__dirname + '/public'));

// ***
// *** Load middleware
// ***
app.use(cors({methods:'GET'}));
storage.init(config);
tlsCheck(app); // check for https redirect (if needed)
format(app); // check for .json requests
p2pCheck(app); // check for p2p

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

// ***
// *** Post endpoint to start/stop archives
// ***
app.post('/archive/:sessionId', function(req, res, next) {
  // final function to be called when all the necessary data is gathered
  function sendArchiveResponse(error, archive) {
    if (error) {
      res.json({error: error});
    } else {
      res.json(archive);
    }
  }

  // When an archive is given through a reservation
  if( req.archiveInfo ){
    sendArchiveResponse( req.archiveInfo.error, req.archiveInfo.archive );
    return;
  }

  // When an archive needs to be created or stopped
  if( req.body.action === "start" ){
    ot.startArchive(req.params.sessionId, {name: req.body.roomId}, sendArchiveResponse);
  }else{
    ot.stopArchive(req.body.archiveId, sendArchiveResponse);
  }
});

// ***
// *** Renders archive page
// ***
app.get('/archive/:archiveId/:roomId', function(req, res, next) {
  // final function to be called when all the necessary data is gathered
  function sendArchiveResponse(error, archive) {
    data = error ? {error: error, archive: false} : {error: false, archive: archive}
    res.render('archive', data);
  }

  // When an archive is given through a reservation
  if( req.archiveInfo ){
    sendArchiveResponse( req.archiveInfo.error, req.archiveInfo.archive );
    return;
  }

  // When an archive needs to be created or stopped
  ot.getArchive(req.params.archiveId, sendArchiveResponse);
});

// ***
// *** When user goes to a room, render the room page
// ***
app.get("/:rid", function( req, res ){
  // final function to be called when all the necessary data is gathered
  var sendRoomResponse = function(apiKey, sessionId, token) {
    var data = {
      rid: rid,
      sid: sessionId,
      sessionId: sessionId,
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
  } else {
    // Check if room sessionId exists. If it does, render response. If not, create sessionId
    storage.get(room_uppercase, function(reply){
      if(reply){
        req.sessionId = reply;
        sendRoomResponse(OTKEY, req.sessionId, ot.generateToken(req.sessionId, {role: 'moderator'}));
      }else{
        ot.createSession( req.sessionProperties || {} , function(err, session){
          if (err) {
            return res.send(500, "could not generate opentok session");
          }
          storage.set(room_uppercase, session.sessionId, function(){
            sendRoomResponse(OTKEY, session.sessionId, ot.generateToken(session.sessionId, {role: 'moderator'}));
          });
        });
      }
    });

  }
});


// ***
// *** start server, listen to port (predefined or 9393)
// ***
app.listen(config.web.port);
