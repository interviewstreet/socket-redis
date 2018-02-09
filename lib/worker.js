var _ = require('underscore');
var redis = require('redis');
var sockjs = require('sockjs');
var validator = require('validator');
var ChannelList = require('./channel-list');
var WorkerSender = require('./worker-util');
var WorkerConnection = require('./worker-connection');

/**
 * @param {Object} process
 * @param {Number} port
 * @param {String} [sockjsClientUrl]
 * @param {Object}  [sslOptions]
 * @constructor
 */
function Worker(process, port, sockjsClientUrl, sslOptions) {
  /** @type {ChannelList} */
  this._channelList = new ChannelList();
  /** @type {Array} */
  this._connections = [];
  /** @type {WorkerSender} */
  this._workerSender = new WorkerSender(process);

  /** @type {Server} */
  this._sockjsServer = this._createSockServer(sockjsClientUrl);
  /** @type {Server} */
  this._httpServer = this._createHttpServer(sslOptions);
  this._listen(port);
}

Worker.prototype.stop = function() {
  this._httpServer.close();
};

/**
 * @param {String} type
 * @param {Object} data
 */
Worker.prototype.triggerEventDown = function(type, data) {
  switch (type) {
    case 'down-publish':
      this.sendDownPublish(data.channel, data.event, data.data);
      break;
    case 'down-status-request':
      this._workerSender.sendUpStatusRequest(data.requestId, this._getChannelsData());
      break;
    default:
      console.log("Invalid down event type: `" + type + "`");
      break;
  }
};

/**
 * @param {Number} port
 */
Worker.prototype._listen = function(port) {
  var self = this;
  this._sockjsServer.on('connection', function(connection) {
    if (!connection) {
      // See https://github.com/cargomedia/socket-redis/issues/41
      console.error('Empty WebSocket connection');
      return;
    }
    self._addConnection(new WorkerConnection(connection, self._channelList, self._workerSender));
  });

  this._sockjsServer.installHandlers(this._httpServer);
  this._httpServer.listen(port);
  console.log('WebSocket worker listening on port ' + port);
};

/**
 * @param {WorkerConnection} connection
 * @private
 */
Worker.prototype._addConnection = function(connection) {
  connection.on('close', this._removeConnection.bind(this, connection));
  this._connections.push(connection);
};

/**
 * @param {WorkerConnection} connection
 * @private
 */
Worker.prototype._removeConnection = function(connection) {
  this._connections = _.without(this._connections, connection);
};

/**
 * @param {String} channelId
 * @param {String} event
 * @param {Object} data
 */
Worker.prototype.sendDownPublish = function(channelId, event, data) {
  var channel = this._channelList.get(channelId);
  if (!channel) {
    channel = this._channelList.create(channelId);
    this._channelList.delayedClose(channelId);
  }
  var content = {channel: channelId, event: event, data: data};
  channel.addMessage(content);
  _.each(channel.getSubscribers(), function(subscriber) {
    subscriber.connection.write(content);
  });
};

/**
 * @return {Object}
 */
Worker.prototype._getChannelsData = function() {
  var channelsData = {};
  _.each(this._channelList.getAll(), function(channel, channelId) {
    channelsData[channelId] = _.map(channel.getSubscribers(), function(subscriber) {
      return {clientKey: subscriber.connection.id, data: subscriber.data, subscribeStamp: subscriber.createStamp};
    });
  });
  return channelsData;
};

/**
 * @param {String} [sockjsClientUrl]
 * @return {Server}
 */
Worker.prototype._createSockServer = function(sockjsClientUrl) {
  var allowedLogs = ['error'];
  var sockjsOptions = {};

  sockjsOptions.log = function(severity, message) {
    if (allowedLogs.indexOf(severity) > -1) {
      console.log(severity + "\t" + message);
    }
  };
  if (sockjsClientUrl) {
    sockjsOptions.sockjs_url = sockjsClientUrl;
  }
  return sockjs.createServer(sockjsOptions);
};

/**
 * @param {Object} [sslOptions]
 * @returns {Server}
 */
Worker.prototype._createHttpServer = function(sslOptions) {
  var server;
  if (sslOptions) {
    server = require('https').createServer(sslOptions);
  } else {
    server = require('http').createServer();
  }
  return server;
};

module.exports = Worker;
