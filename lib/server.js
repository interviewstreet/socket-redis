var redis = require('redis');
var _ = require('underscore');
var Promise = require('bluebird');
var StatusServer = require('./status-server');

function isMissing(value) {
  return typeof value === 'undefined' || value === null || value === '';
}

/**
 * @param {Object} redisConnection
 * @param {Number} statusPort
 * @param {String} [statusSecret]
 * @constructor
 */
function Server(redisConnection, statusPort, statusSecret) {
  /** @type {Object.<String, ChildProcess>} */
  this._workers = {};
  /** @type {RedisClient} */
  this._redisClientDown = this._createRedisClientDown(redisConnection);
  /** @type {RedisClient} */
  this._redisClientUp = this._createRedisClientUp(redisConnection);
  /** @type {StatusServer} */
  this._statusServer = this._createStatusServer(statusPort, statusSecret);
}

/**
 * @returns {Promise}
 */
Server.prototype.stop = function() {
  return Promise.all([
    this._killWorkers(),
    this._killRedisClient(this._redisClientDown),
    this._killRedisClient(this._redisClientUp),
    this._statusServer.stop()
  ]);
};

/**
 * @param {ChildProcess} worker
 */
Server.prototype.addWorker = function(worker) {
  this._workers[worker.pid] = worker;
};

/**
 * @param {ChildProcess} worker
 */
Server.prototype.removeWorker = function(worker) {
  delete this._workers[worker.pid];
};

/**
 * @param {String} type
 * @param {Object} data
 */
Server.prototype.triggerEventUp = function(type, data) {
  switch (type) {
    case 'up-message':
      this._sendUpMessage(data.clientKey, data.data);
      break;
    case 'up-publish':
      this._sendDownPublish(data.channel, data.event, data.data);
      break;
    case 'up-subscribe':
      this._sendUpSubscribe(data.channel, data.clientKey, data.data);
      break;
    case 'up-unsubscribe':
      this._sendUpUnsubscribe(data.channel, data.clientKey);
      break;
    case 'up-status-request':
      var request = this._statusServer.getStatusRequest(data.requestId);
      if (!request) {
        break;
      }
      request.addResponse(data.channels);
      break;
    default:
      console.log('Invalid up event type: `' + type + '`');
      break;
  }
};

/**
 * @param {String} type
 * @param {Object} data
 */
Server.prototype._sendUp = function(type, data) {
  this._redisClientUp.publish('socket-redis-up', JSON.stringify({type: type, data: data}));
};

/**
 * @param {String} type
 * @param {Object} data
 */
Server.prototype._sendDown = function(type, data) {
  _.each(this._workers, function(worker) {
    worker.send({type: type, data: data});
  });
};

/**
 * @param {String} clientKey
 * @param {Object} data
 */
Server.prototype._sendUpMessage = function(clientKey, data) {
  this._sendUp('message', {clientKey: clientKey, data: data});
};

/**
 * @param {String} channel
 * @param {String} clientKey
 * @param {Object} data
 */
Server.prototype._sendUpSubscribe = function(channel, clientKey, data) {
  this._sendUp('subscribe', {channel: channel, clientKey: clientKey, data: data});
};

/**
 * @param {String} channel
 * @param {String} clientKey
 */
Server.prototype._sendUpUnsubscribe = function(channel, clientKey) {
  this._sendUp('unsubscribe', {channel: channel, clientKey: clientKey});
};

/**
 * @param {String} channel
 * @param {String} event
 * @param {Object} data
 */
Server.prototype._sendDownPublish = function(channel, event, data) {
  this._sendDown('down-publish', {channel: channel, event: event, data: data});
};

/**
 * @param {StatusRequest} request
 */
Server.prototype._sendDownStatusRequest = function(request) {
  this._sendDown('down-status-request', {requestId: request.getId()});
};

/**
 * @param {Object} connection
 * @returns {RedisClient}
 */
Server.prototype._createRedisClientDown = function(connection) {
  var client = this._createRedisClient(connection, 'down');
  client.on('connect', function() {
    client.subscribe('socket-redis-down');
  });
  client.on('message', function(channel, event) {
    try {
      this._handleClientDownMessage(event)
    } catch (error) {
      console.error('Error processing Redis data: ' + error);
    }
  }.bind(this));

  return client;
};

/**
 * @param {Object} connection
 * @returns {RedisClient}
 */
Server.prototype._createRedisClientUp = function(connection) {
  return this._createRedisClient(connection, 'up')
};

/**
 * @param {Object} connection
 * @param {String} alias
 * @returns {RedisClient}
 */
Server.prototype._createRedisClient = function(connection, alias) {
  var retry_strategy = function(options) {
    return Math.min(options.attempt * 100, 1000);
  };
  var options = _.extend({}, connection, {retry_strategy: retry_strategy});
  if (isMissing(options.password)) {
    delete options.password;
  }
  var client = redis.createClient(options);

  ['error', 'warning', 'connect', 'ready', 'reconnecting', 'end'].forEach(function(event) {
    client.on(event, function() {
      var connectionStub = '  ' + alias + '#' + client.connection_id;
      var functionArguments = Array.prototype.slice.call(arguments);
      console.log.apply(null, [connectionStub, event].concat(functionArguments));
    });
  });

  return client;
};

/**
 * @param {Number} statusPort
 * @param {String} statusSecret
 * @returns {StatusServer}
 */
Server.prototype._createStatusServer = function(statusPort, statusSecret) {
  var statusServer = new StatusServer(statusPort, statusSecret);
  statusServer.on('request', function(statusRequest) {
    statusRequest.setThreshold(_.size(this._workers));
    this._sendDownStatusRequest(statusRequest);
  }.bind(this));

  return statusServer;
};

/**
 * @param {RedisClient} client
 * @returns {Promise}
 */
Server.prototype._killRedisClient = function(client) {
  return new Promise(function(resolve, reject) {
    var timeout;
    if (client.connected) {
      timeout = setTimeout(function() {
        reject(new Error('Redis client kill failed by timeout'));
      }, 2000);
    }
    client.on('end', function() {
      clearTimeout(timeout);
      resolve();
    });
    client.quit();
  });
};

/**
 * @param {Object} event
 */
Server.prototype._handleClientDownMessage = function(event) {
  event = JSON.parse(event);
  var eventData = event.data;
  switch (event.type) {
    case 'publish':
      if (typeof eventData.data === 'undefined') {
        eventData.data = null;
      }
      if (isMissing(eventData.channel) || isMissing(eventData.event)) {
        throw new Error('Missing channel or event: `' + JSON.stringify(eventData) + '`')
      }
      this._sendDownPublish(eventData.channel, eventData.event, eventData.data);
      break;
    default:
      console.error('Invalid down event type: `' + event.type + '`');
      break;
  }
};

/**
 * @returns {Promise}
 */
Server.prototype._killWorkers = function() {
  var killPromises = _.map(this._workers, function(worker) {
    return new Promise(function(resolve, reject) {
      var timeout = setTimeout(function() {
        reject(new Error('Server worker kill failed by timeout'));
      }, 2000);
      worker.on('exit', function() {
        clearTimeout(timeout);
        resolve();
      });
      worker.kill();
    });
  });
  return Promise.all(killPromises);
};

module.exports = Server;
