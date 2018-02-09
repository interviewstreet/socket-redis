var assert = require('chai').assert;
var _ = require('underscore');
var requestPromise = require('request-promise');
var redis = require('redis');
var Server = require('../lib/server');

describe('Server tests', function() {

  var redis_connection = {
    'host': process.env.REDIS_HOST || 'localhost',
    'port': process.env.REDIS_PORT || 6379,
    'password': process.env.REDIS_PASS || null
  }
  var STATUS_PORT = process.env.STATUS_PORT || 9993;
  var STATUS_SECRET = process.env.STATUS_SECRET || 'secret';

  function getWorkerStub() {
    return {pid: 'pid', kill: _.noop, send: _.noop};
  }

  beforeEach(function(done) {
    this.server = new Server(redis_connection, STATUS_PORT, STATUS_SECRET);
    setTimeout(done, 100);
  });

  afterEach(function(done) {
    this.server.stop();
    setTimeout(done, 100);
  });

  it('creates Server', function() {
    var server = this.server;
    assert(server._redisClientDown.connected);
    assert(server._redisClientUp.connected);
    assert(server._statusServer._server.listening);
  });

  it('stops Server', function(done) {
    var server = this.server;
    server.stop();
    _.delay(function() {
      assert(!server._redisClientDown.connected);
      assert(!server._redisClientUp.connected);
      assert(!server._statusServer.listening);
      done();
    }, 200);
  });

  context('triggerEventUp', function() {
    context('up messages', function() {
      var originalPublish;
      beforeEach(function() {
        originalPublish = this.server._redisClientUp.publish;
      });
      afterEach(function() {
        this.server._redisClientUp.publish = originalPublish;
      });

      it('up-message', function(done) {
        var sampleMessage = {clientKey: 'up-message-clientKey', data: 'up-message-data'};
        this.server._redisClientUp.publish = function(type, message) {
          assert.equal(type, 'socket-redis-up');
          message = JSON.parse(message);
          assert.equal(message.type, 'message');
          assert.deepEqual(message.data, sampleMessage);
          done();
        };
        this.server.triggerEventUp('up-message', sampleMessage);
      });

      it('up-subscribe', function(done) {
        var sampleMessage = {clientKey: 'up-subscribe-clientKey', data: 'up-subscribe-data', channel: 'up-subscribe-channel'};
        this.server._redisClientUp.publish = function(type, message) {
          assert.equal(type, 'socket-redis-up');
          message = JSON.parse(message);
          assert.equal(message.type, 'subscribe');
          assert.deepEqual(message.data, sampleMessage);
          done();
        };
        this.server.triggerEventUp('up-subscribe', sampleMessage);
      });

      it('up-unsubscribe', function(done) {
        var sampleMessage = {clientKey: 'up-unsubscribe-clientKey', channel: 'up-unsubscribe-channel'};
        this.server._redisClientUp.publish = function(type, message) {
          assert.equal(type, 'socket-redis-up');
          message = JSON.parse(message);
          assert.equal(message.type, 'unsubscribe');
          assert.deepEqual(message.data, sampleMessage);
          done();
        };
        this.server.triggerEventUp('up-unsubscribe', sampleMessage);
      });
    });

    context('down messages', function() {
      var worker;
      beforeEach(function() {
        worker = getWorkerStub();
        this.server.addWorker(worker);
      });
      afterEach(function() {
        this.server.removeWorker(worker);
      });

      it('up-publish', function(done) {
        worker.send = function(message) {
          assert.equal(message.type, 'down-publish');
          assert.deepEqual(message.data, sampleMessage);
          done();
        };
        var sampleMessage = {channel: 'up-publish-channel', event: 'up-publish-clientKey', data: 'up-publish-data'};
        this.server.triggerEventUp('up-publish', sampleMessage);
      });
    });

    context('up-status-request', function() {
      var statusRequest;
      beforeEach(function() {
        statusRequest = {
          getId: function() {
            return 111;
          }
        };
        this.server._statusServer.addStatusRequest(statusRequest);
      });

      afterEach(function() {
        this.server._statusServer.removeStatusRequest(statusRequest);
      });

      it('up-status-request', function(done) {
        var sampleMessage = {requestId: statusRequest.getId(), channels: {channelId: []}};
        statusRequest.addResponse = function(channels) {
          assert.deepEqual(channels, sampleMessage.channels);
          done();
        };
        this.server.triggerEventUp('up-status-request', sampleMessage);
      });

    });
  });

  context('status server', function() {
    var statusServerUri = 'http://localhost:' + STATUS_PORT;

    var worker;
    beforeEach(function() {
      worker = getWorkerStub();
      this.server.addWorker(worker);
    });
    afterEach(function() {
      this.server.removeWorker(worker);
    });

    it('statusRequest is added/removed', function(done) {
      requestPromise({uri: statusServerUri, headers: {'Authorization': 'Token ' + STATUS_SECRET}, simple: false});

      _.delay(function() {
        var statusRequests = this.server._statusServer.getStatusRequests();
        assert.strictEqual(_.size(statusRequests), 1);
        var statusRequest = statusRequests[Object.keys(statusRequests)[0]];
        statusRequest.emit('complete');
        assert.strictEqual(_.size(statusRequests), 0);
        done();
      }.bind(this), 100);
    });

    it('request is sent down', function(done) {
      worker.send = function(message) {
        assert.equal(message.type, 'down-status-request');
        var statusRequests = this.server._statusServer.getStatusRequests();
        var statusRequest = statusRequests[Object.keys(statusRequests)[0]];
        assert.deepEqual(message.data, {requestId: statusRequest.getId()});
        done();
      }.bind(this);
      requestPromise({uri: statusServerUri, headers: {'Authorization': 'Token ' + STATUS_SECRET}});
    });

    it('rejects unauthenticated', function(done) {
      requestPromise(statusServerUri)
        .then(function() {
          done(new Error('Unauthenticated request must be rejected'));
        })
        .catch(function(error) {
          assert.include(error.message, 'not authenticated');
          done();
        });
    });

    it('returns prometheus format on /metrics', function(done) {
      var response = requestPromise({uri: statusServerUri + '/metrics', headers: {'Authorization': 'Token ' + STATUS_SECRET}});

      _.delay(function() {
        var statusRequests = this.server._statusServer.getStatusRequests();
        assert.strictEqual(_.size(statusRequests), 1);
        var statusRequest = statusRequests[Object.keys(statusRequests)[0]];
        statusRequest.addResponse({
          'channel1': [{'clientKey': 'susbcriber1'}],
          'channel2': [{'clientKey': 'susbcriber1'}, {'clientKey': 'susbcriber2'}]
        });
        statusRequest.emit('complete');
        assert.strictEqual(_.size(statusRequests), 0);
      }.bind(this), 100);

      response.then(function(response) {
        assert.include(response, 'socketredis_channels_total 2');
        assert.include(response, 'socketredis_subscribers_total 3');
        done();
      });
    });
  });

  context('redisClientDown', function() {
    var downPublisher;
    var publishDown;
    var worker;
    beforeEach(function() {
      worker = getWorkerStub();
      this.server.addWorker(worker);

      downPublisher = redis.createClient(redis_connection);
      publishDown = function(message) {
        downPublisher.publish('socket-redis-down', JSON.stringify(message));
      };
    });

    afterEach(function() {
      this.server.removeWorker(worker);
      downPublisher.quit();
    });

    it('handles publish event', function(done) {
      var sampleMessage = {type: 'publish', data: {channel: 'publish-channel', event: 'publish-event', data: 'publish-data'}};
      worker.send = function(message) {
        assert.equal(message.type, 'down-publish');
        assert.deepEqual(message.data, sampleMessage.data);
        done();
      };
      publishDown(sampleMessage);
    });
  });

});

