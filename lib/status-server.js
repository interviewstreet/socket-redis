var util = require('util');
var http = require('http');
var EventEmitter = require('events').EventEmitter;
var StatusRequest = require('./status-request');

/**
 * @param {Number} port
 * @param {String} [secret]
 * @constructor
 */
function StatusServer(port, secret) {
  StatusServer.super_.call(this);

  /** @type {Object.<String, StatusRequest>} */
  this._statusRequests = {};
  /** @type {String} */
  this._secret = secret;
  /** @type {http.Server} */
  this._server = this._listen(port);
}

util.inherits(StatusServer, EventEmitter);

/**
 * @param {StatusRequest} statusRequest
 */
StatusServer.prototype.addStatusRequest = function(statusRequest) {
  this._statusRequests[statusRequest.getId()] = statusRequest;
};

/**
 * @param {String} requestId
 * @returns {StatusRequest|null}
 */
StatusServer.prototype.getStatusRequest = function(requestId) {
  return this._statusRequests[requestId] || null;
};

/**
 * @returns {Object.<String, StatusRequest>}
 */
StatusServer.prototype.getStatusRequests = function() {
  return this._statusRequests;
};

/**
 * @param {StatusRequest} statusRequest
 */
StatusServer.prototype.removeStatusRequest = function(statusRequest) {
  delete this._statusRequests[statusRequest.getId()];
};

/**
 * @returns {Promise}
 */
StatusServer.prototype.stop = function() {
  return new Promise(function(resolve, reject) {
    var timeout = setTimeout(function() {
      reject(new Error('Server close failed by timeout'));
    }, 2000);
    this._server.on('close', function() {
      clearTimeout(timeout);
      resolve();
    });
    this._server.close();
  }.bind(this));
};

/**
 * @param {Number} port
 * @returns {http.Server}
 */
StatusServer.prototype._listen = function(port) {
  var server = http.createServer(this._handleStatusRequest.bind(this));
  server.on('connection', function(socket) {
    socket.setTimeout(10000);
  });
  server.listen(port);
  console.log('Status server listening on port ' + port);
  return server;
};

/**
 * @param {http.IncomingMessage} request
 * @param {http.ServerResponse} response
 */
StatusServer.prototype._handleStatusRequest = function(request, response) {
  if (!this._isAuthenticated(request)) {
    response.writeHead(401);
    response.end('You are not authenticated to request status');
    return;
  }
  var statusRequest = new StatusRequest();
  this.addStatusRequest(statusRequest);
  var self = this;
  statusRequest.on('complete', function() {
    response.end(JSON.stringify(statusRequest.getChannelsData()));
    self.removeStatusRequest(statusRequest);
  });
  request.on('close', function() {
    self.removeStatusRequest(statusRequest);
  });
  this.emit('request', statusRequest);
};

/**
 * @param {http.IncomingMessage} request
 * @returns {boolean}
 */
StatusServer.prototype._isAuthenticated = function(request) {
  if (this._secret) {
    var header = (request.headers && request.headers['authorization']) || '';
    var result = /token\s+([^\s]+)/gi.exec(header);
    var token = result && result[1];
    return token == this._secret;
  }
  return true;
};

module.exports = StatusServer;