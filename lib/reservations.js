var opentok = require('opentok');

var reservations = {
  tnwdemo: {
    opentok: opentok(process.env.TNW_KEY, process.env.TNW_SECRET),
    apiKey: process.env.TNW_KEY
  }
}

for (var reservation in reservations) {
  (function(r) {
    r.opentok.createSession(function(err, session) {
      if (err) return console.error('could not create session for a reservation');
      r.sessionId = session.sessionId;
    });
  }(reservations[reservation]));
}

module.exports = function(app) {
  app.get(/^\/tnwdemo(.json)?$/, function(req, res, next) {
    req.sessionId = reservations.tnwdemo.sessionId;
    req.token = reservations.tnwdemo.opentok.generateToken(req.sessionId, { role: 'moderator' });
    req.apiKey = reservations.tnwdemo.apiKey;
    console.log('attached reservation data to request');
    next();
  });
};
