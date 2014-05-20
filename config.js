// configure your variables here

var config = {}

config.opentok = {};
config.db = {};
config.web = {};

config.opentok.key = process.env.TB_KEY || 'Your opentok key';
config.opentok.secret=  process.env.TB_SECRET || 'Your opentok secret';

config.db.redis = false; // are you using redis?
config.db.REDISTOGO_URL = process.env.REDISTOGO_URL;

config.web.port = process.env.PORT || 9393;

module.exports = config;
