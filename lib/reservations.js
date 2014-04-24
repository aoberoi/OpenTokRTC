var opentok = require('opentok');

var reservations = {};

// if there are rooms that we want to reserve
if( process.env.TNW_KEY && process.env.TNW_SECRET ){
  reservations.tnwdemo = {
    opentok: opentok(process.env.TNW_KEY, process.env.TNW_SECRET),
    apiKey: process.env.TNW_KEY,
    isReserved: function(roomId){
      return roomId.toUpperCase().split('TNWDEMO').length > 1
    },
    parseRequest: function(app) {
      app.get(/^\/tnwdemo(.json)?$/, function(req, res, next) {
        req.sessionId = reservations.tnwdemo.sessionId;
        req.token = reservations.tnwdemo.opentok.generateToken(req.sessionId, { role: 'moderator' });
        req.apiKey = reservations.tnwdemo.apiKey;
        console.log('attached reservation data to request');
        next();
      });
      app.get('/archive/:archiveId/:roomId', function(req, res, next) {
        if( !reservations.tnwdemo.isReserved( req.params.roomId )) {
          next();
          return;
        }

        reservations.tnwdemo.opentok.getArchive(req.params.archiveId, function(error,archive){
          archiveInfo = error ? {error: error} : {archive: archive}
          req.archiveInfo = archiveInfo;
          next();
        });
      });
      app.post('/archive/:sessionId', function(req, res, next) {
        if( !reservations.tnwdemo.isReserved( req.body.roomId )) {
          next();
          return;
        }

        function archiveCallback(error, archive) {
          archiveInfo = error ? {error: error} : {archive: archive}
          req.archiveInfo = archiveInfo;
          next();
        }
        if( req.body.action === "start" ){
          reservations.tnwdemo.opentok.startArchive(req.params.sessionId, {name: req.body.roomId}, archiveCallback);
        }else{
          reservations.tnwdemo.opentok.stopArchive(req.body.archiveId, archiveCallback);
        }
      });
    }
  }
}

// generate a sessionId for each room we reserve
for (var reservation in reservations) {
  (function(r) {
    r.opentok.createSession(function(err, session) {
      if (err) return console.error('could not create session for a reservation');
      r.sessionId = session.sessionId;
    });
  }(reservations[reservation]));
}

// pass requests through our reserved rooms
module.exports = function(app) {
  for (var reservation in reservations) {
    reservations[ reservation ].parseRequest(app);
  }
}

