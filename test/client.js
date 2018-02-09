var assert = require('chai').assert;
var Server = require('./helpers/server');
var SocketRedis = require('../client/index');

describe('Client tests', function() {

  var server;

  before(function() {
    server = new Server();
  });

  after(function() {
    server.terminate();
  });

  context('one client', function() {
    var client;

    beforeEach(function(done) {
      this.timeout(5000);
      var port = 9090;
      server.start(port).then(function() {
        client = new SocketRedis('http://localhost:' + port);
        done();
      }, done);
    });

    afterEach(function(done) {
      if (client) {
        client.close();
      }
      server.stop().then(done, done);
    });

    it('pub after sub', function(done) {
      this.timeout(5000);
      var event = 'event';
      var channelName = 'channel-name';
      var testData = {foo: 'bar'};

      client.onopen = function() {
        client.subscribe(channelName, null, null, function(event, data) {
          assert.deepEqual(data, testData);
          done();
        });
        client.publish(channelName, 'message', testData);
      };

      client.open();
    });

    it('pub before sub', function(done) {
      var channelName = 'channel-name';
      var testData = {foo: 'bar'};

      client.onopen = function() {
        client.publish(channelName, 'message', testData);

        setTimeout(function() {
          client.subscribe(channelName, new Date().getTime() - 2000, null, function(event, data) {
            assert.deepEqual(data, testData);
            done();
          });
        }, 1000);
      };

      client.open();
    });
  });

  context('multiple clients', function() {
    var client1, client2;

    beforeEach(function() {
      this.timeout(5000);
      var port1 = 9090;
      var port2 = 9091;
      return server.start(port1, port2).then(function() {
        client1 = new SocketRedis('http://localhost:' + port1);
        client2 = new SocketRedis('http://localhost:' + port2);
      });
    });

    afterEach(function() {
      if (client1) {
        client1.close();
      }
      if (client2) {
        client2.close();
      }
      return server.stop();
    });

    it('pub after sub', function(done) {
      this.timeout(4000);
      var channelName = 'channel-name';
      var testData = {foo: 'bar'};

      client1.onopen = function() {
        client1.subscribe(channelName, null, null, function(event, data) {
          assert.deepEqual(data, testData);
          done();
        });
      };

      client2.onopen = function() {
        client2.publish(channelName, 'message', testData);
      };

      client1.open();
      client2.open();
    });

    it('pub before sub', function(done) {
      var channelName = 'channel-name';
      var testData = {foo: 'bar'};

      client1.onopen = function() {
        setTimeout(function() {
          client1.subscribe(channelName, new Date().getTime() - 2000, null, function(event, data) {
            assert.deepEqual(data, testData);
            done();
          });
        }, 1000);
      };

      client2.onopen = function() {
        client2.publish(channelName, 'message', testData);
      };

      client1.open();
      client2.open();
    });
  });

});

