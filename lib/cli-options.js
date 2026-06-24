var minimist = require('minimist');

var DEFAULTS = {
  'log-dir': null,
  'redis-host': 'localhost',
  'redis-port': 6379,
  'redis-pass': null,
  'socket-ports': '8090',
  'status-port': '8085'
};

function parse(args) {
  return minimist(args, {
    default: DEFAULTS,
    string: [
      'log-dir',
      'redis-host',
      'redis-pass',
      'socket-ports',
      'status-port',
      'status-secret',
      'sockjs-client-url',
      'ssl-key',
      'ssl-cert',
      'ssl-pfx',
      'ssl-passphrase'
    ]
  });
}

module.exports = {
  parse: parse
};
