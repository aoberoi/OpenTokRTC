// checks request to see if the extension is .json
module.exports = function(app) {
  app.get(/.*\.json$/, function(req, res, next) {
    req.format = 'json';
    next();
  });
};
