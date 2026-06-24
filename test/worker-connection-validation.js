var assert = require('chai').assert;
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var ChannelList = require('../lib/channel-list');
var WorkerConnection = require('../lib/worker-connection');

function FakeConnection() {
  EventEmitter.call(this);
  this.id = 'connection-id';
}

util.inherits(FakeConnection, EventEmitter);

FakeConnection.prototype.write = function() {};
FakeConnection.prototype.close = function() {};

function createWorkerConnection() {
  var sentMessages = [];
  var workerConnection = new WorkerConnection(new FakeConnection(), new ChannelList(), {
    sendUpSubscribe: function(channel, clientKey, data) {
      sentMessages.push({channel: channel, clientKey: clientKey, data: data});
    },
    sendUpUnsubscribe: function() {}
  });
  return {
    workerConnection: workerConnection,
    sentMessages: sentMessages
  };
}

describe('WorkerConnection validation', function() {
  var originalConsoleError;

  beforeEach(function() {
    originalConsoleError = console.error;
    console.error = function() {};
  });

  afterEach(function() {
    console.error = originalConsoleError;
  });

  it('accepts numeric and string integer subscribe start values', function() {
    [123, '123'].forEach(function(start) {
      var setup = createWorkerConnection();
      setup.workerConnection._onData(JSON.stringify({
        event: 'subscribe',
        data: {channel: 'channel-' + start, data: 'subscribe data', start: start}
      }));

      assert.lengthOf(setup.sentMessages, 1);
      setup.workerConnection.close();
    });
  });

  it('rejects subscribe start values that coerce to integers but are not integer inputs', function() {
    [null, false, true, [], [1], {}, '', ' ', '12.3'].forEach(function(start) {
      var setup = createWorkerConnection();
      setup.workerConnection._onData(JSON.stringify({
        event: 'subscribe',
        data: {channel: 'channel', data: 'subscribe data', start: start}
      }));

      assert.lengthOf(setup.sentMessages, 0);
      setup.workerConnection.close();
    });
  });
});
