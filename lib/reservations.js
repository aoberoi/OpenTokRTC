var opentok = require('opentok');

var reservations = {};

// if there are rooms that we want to reserve
if( process.env.TNW_KEY && process.env.TNW_SECRET ){
  reservations.tnwdemo = {
    opentok: opentok(process.env.TNW_KEY, process.env.TNW_SECRET),
    apiKey: process.env.TNW_KEY,
    parseRequest: function(app) {
      app.get(/^\/tnwdemo(.json)?$/, function(req, res, next) {
        req.sessionId = reservations.tnwdemo.sessionId;
        req.token = reservations.tnwdemo.opentok.generateToken(req.sessionId, { role: 'moderator' });
        req.apiKey = reservations.tnwdemo.apiKey;
        console.log('attached reservation data to request');
        next();
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

