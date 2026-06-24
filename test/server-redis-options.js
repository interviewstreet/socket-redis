var assert = require('chai').assert;
var redis = require('redis');
var Server = require('../lib/server');

describe('Server Redis options', function() {
  var originalCreateClient;

  beforeEach(function() {
    originalCreateClient = redis.createClient;
  });

  afterEach(function() {
    redis.createClient = originalCreateClient;
  });

  it('does not pass an empty password to redis.createClient', function() {
    var createdOptions;
    redis.createClient = function(options) {
      createdOptions = options;
      return {
        on: function() {},
        quit: function() {}
      };
    };

    Server.prototype._createRedisClient.call({}, {
      host: 'localhost',
      port: 6379,
      password: null
    }, 'test');

    assert.notProperty(createdOptions, 'password');
    assert.property(createdOptions, 'retry_strategy');
  });
});
