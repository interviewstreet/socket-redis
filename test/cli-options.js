var assert = require('chai').assert;
var cliOptions = require('../lib/cli-options');

describe('CLI options', function() {
  it('keeps existing defaults and flag names', function() {
    var argv = cliOptions.parse([]);

    assert.strictEqual(argv['log-dir'], null);
    assert.strictEqual(argv['redis-host'], 'localhost');
    assert.strictEqual(argv['redis-port'], 6379);
    assert.strictEqual(argv['redis-pass'], null);
    assert.strictEqual(argv['socket-ports'], '8090');
    assert.strictEqual(argv['status-port'], '8085');
  });

  it('parses existing Redis, socket, status, SockJS, SSL, and log flags', function() {
    var argv = cliOptions.parse([
      '--log-dir=/tmp/socket-redis',
      '--redis-host=redis.internal',
      '--redis-port=6380',
      '--redis-pass=secret',
      '--socket-ports=8090,8091',
      '--status-port=8086',
      '--status-secret=status-secret',
      '--sockjs-client-url=https://cdn.example/sockjs.js',
      '--ssl-key=/certs/key.pem',
      '--ssl-cert=/certs/cert.pem',
      '--ssl-pfx=/certs/cert.pfx',
      '--ssl-passphrase=/certs/passphrase'
    ]);

    assert.strictEqual(argv['log-dir'], '/tmp/socket-redis');
    assert.strictEqual(argv['redis-host'], 'redis.internal');
    assert.strictEqual(argv['redis-port'], 6380);
    assert.strictEqual(argv['redis-pass'], 'secret');
    assert.strictEqual(argv['socket-ports'], '8090,8091');
    assert.strictEqual(argv['status-port'], '8086');
    assert.strictEqual(argv['status-secret'], 'status-secret');
    assert.strictEqual(argv['sockjs-client-url'], 'https://cdn.example/sockjs.js');
    assert.strictEqual(argv['ssl-key'], '/certs/key.pem');
    assert.strictEqual(argv['ssl-cert'], '/certs/cert.pem');
    assert.strictEqual(argv['ssl-pfx'], '/certs/cert.pfx');
    assert.strictEqual(argv['ssl-passphrase'], '/certs/passphrase');
  });

  it('parses legacy space-separated flag values', function() {
    var argv = cliOptions.parse([
      '--redis-host', 'redis.internal',
      '--redis-port', '6380',
      '--socket-ports', '8090,8091'
    ]);

    assert.strictEqual(argv['redis-host'], 'redis.internal');
    assert.strictEqual(argv['redis-port'], 6380);
    assert.strictEqual(argv['socket-ports'], '8090,8091');
  });
});
