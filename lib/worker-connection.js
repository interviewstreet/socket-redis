var util = require('util');
var EventEmitter = require('events');
var _ = require('underscore');
var Subscriber = require('./subscriber');

function isMissing(value) {
  return typeof value === 'undefined' || value === null || value === '';
}

function isInteger(value) {
  if (typeof value === 'number') {
    return isFinite(value) && Math.floor(value) === value;
  }
  if (typeof value !== 'string') {
    return false;
  }
  return /^-?\d+$/.test(value);
}

/**
 * @param {SockJSConnection} connection
 * @param {ChannelList} workerChannels
 * @param {WorkerSender} workerSender
 * @constructor
 */
function WorkerConnection(connection, workerChannels, workerSender) {
  /** @type {String} */
  this.id = connection.id;

  /** @type {SockJSConnection} */
  this._connection = connection;

  /** @type {ChannelList} */
  this._workerChannels = workerChannels;

  /** @type {WorkerSender} */
  this._workerSender = workerSender;

  /** @type {String[]} */
  this._сhannelIds = [];

  /** @type {Number} */
  this._timeout = null;

  this._connection.on('data', this._onData.bind(this));
  this._connection.on('close', this.close.bind(this));

  this._startTimeout();
}

util.inherits(WorkerConnection, EventEmitter);

/**
 * @param {String} channelId
 * @returns {Boolean}
 */
WorkerConnection.prototype._hasChannelId = function(channelId) {
  return _.contains(this._сhannelIds, channelId);
};

/**
 * @param {String} channelId
 */
WorkerConnection.prototype._addChannelId = function(channelId) {
  this._сhannelIds.push(channelId);
};

/**
 * @param {String} channelId
 */
WorkerConnection.prototype._removeChannelId = function(channelId) {
  this._сhannelIds = _.without(this._сhannelIds, channelId);
};

/**
 * @param {String} channelId
 * @param {String} data
 * @param {Number} [msgStartTime]
 */
WorkerConnection.prototype.subscribe = function(channelId, data, msgStartTime) {
  if (this._hasChannelId(channelId)) {
    return;
  }
  msgStartTime = msgStartTime || new Date().getTime();
  this._addChannelId(channelId);
  if (!this._workerChannels.has(channelId)) {
    this._workerChannels.create(channelId);
  }
  var channel = this._workerChannels.get(channelId);
  clearTimeout(channel.closeTimeout);
  channel.addSubscriber(new Subscriber(this, data));
  _.each(channel.getMessages(), function(message) {
    if (message.createStamp > msgStartTime) {
      this.write(message.content);
    }
  }, this);
  this._workerSender.sendUpSubscribe(channelId, this.id, data);
};

/**
 * @param {String} channelId
 */
WorkerConnection.prototype.unsubscribe = function(channelId) {
  this._removeChannelId(channelId);
  if (!this._workerChannels.has(channelId)) {
    return;
  }
  var channel = this._workerChannels.get(channelId);
  this._workerSender.sendUpUnsubscribe(channelId, this.id);

  channel.unsubscribeByConnection(this);
  if (!channel.hasSubscribers()) {
    this._workerChannels.delayedClose(channelId);
  }
};

WorkerConnection.prototype.write = function(content) {
  this._connection.write(JSON.stringify(content));
};

/**
 * @param {String} channelId
 * @param {String} event
 * @param {Object} data
 */
WorkerConnection.prototype.publish = function(channelId, event, data) {
  event = 'client-' + event;
  this._workerSender.sendUpPublish(channelId, event, data);
};

/**
 * @param {String} clientKey
 * @param {Object} data
 */
WorkerConnection.prototype.message = function(clientKey, data) {
  this._workerSender.sendUpMessage(clientKey, data);
};

WorkerConnection.prototype._onData = function(data) {
  try {
    data = JSON.parse(data);

    if (isMissing(data.event)) {
      throw new Error('Missing `data.event`: `' + JSON.stringify(data) + '`')
    }
    var eventData = data.data;
    switch (data.event) {
      case 'subscribe':
        if (isMissing(eventData.channel) || isMissing(eventData.data) || !isInteger(eventData.start)) {
          throw new Error('Missing data: `' + JSON.stringify(eventData) + '`')
        }

        this.subscribe(eventData.channel, eventData.data, eventData.start);
        break;

      case 'unsubscribe':
        if (isMissing(eventData.channel)) {
          throw new Error('Missing `data.channel`: `' + JSON.stringify(eventData) + '`')
        }

        this.unsubscribe(eventData.channel);
        break;

      case 'message':
        if (isMissing(eventData.data)) {
          throw new Error('Missing `data.data`: `' + JSON.stringify(eventData) + '`')
        }

        this.message(this.id, eventData.data);
        break;

      case 'publish':
        if (typeof eventData.data === 'undefined') {
          eventData.data = null;
        }
        if (isMissing(eventData.channel) || isMissing(eventData.event)) {
          throw new Error('Missing channel or event: `' + JSON.stringify(eventData) + '`')
        }

        this.publish(eventData.channel, eventData.event, eventData.data);
        break;

      case 'heartbeat':
        /**
         * SockJS usually sends heartbeats from the server to the client.
         * If a client directly connects to the low level `/websocket` endpoint it
         * should send heartbeats itself from the client to the server.
         */
        this._startTimeout();
        break;

      default:
        throw new Error('Unexpected event type `' + data.event + '`.');
    }
  } catch (error) {
    console.error('Error processing WebSocket data: ' + error);
  }
};

WorkerConnection.prototype.close = function() {
  if (this._connection) {
    this._connection.removeAllListeners();

    this._stopTimeout();
    _.each(this._сhannelIds, function(channelId) {
      this.unsubscribe(channelId);
    }, this);

    this._connection.close();
    this._connection = null;
    this.emit('close');
  }
};

WorkerConnection.prototype._startTimeout = function() {
  this._stopTimeout();
  this._timeout = setTimeout(function() {
    this.close();
  }.bind(this), 1000 * 1000);
};

WorkerConnection.prototype._stopTimeout = function() {
  if (this._timeout) {
    clearTimeout(this._timeout);
    this._timeout = null;
  }
};

module.exports = WorkerConnection;
