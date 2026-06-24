var path = require('path');
var _ = require('underscore');
var spawn = require('child-process-promise').spawn;
var Promise = require('bluebird');

function Server() {
  this._process = null;

  this._processList = [];
}

/**
 * @param {..Number} port
 * @returns {Promise}
 */
Server.prototype.start = function(port) {
  var ports = Array.prototype.slice.call(arguments);
  var command = 'node';
  var commandArgs = [
    'bin/socket-redis.js',
    '--redis-host', process.env.REDIS_HOST || 'localhost',
    '--redis-port', process.env.REDIS_PORT || '6379',
    '--socket-ports', ports.join(',')
  ];
  if (process.env.REDIS_PASS) {
    commandArgs.push('--redis-pass', process.env.REDIS_PASS);
  }
  var options = {
    cwd: require('app-root-path').path,
    detached: false,
    capture: ['stdout', 'stderr']
  };
  var promise = spawn(command, commandArgs, options);
  this._process = promise.childProcess;
  this._processList.push(this._process);

  return new Promise(function(resolve, reject) {
    setTimeout(function() {
      reject(new Error('Server start timeout'));
    }, 1000 * 10);

    promise.childProcess.stdout.on('data', _.debounce(function() {
      promise.childProcess.stdout.removeAllListeners('data');
      resolve(promise.childProcess);
    }, 500));
  });
};

/**
 * @returns {Promise}
 */
Server.prototype.stop = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    setTimeout(function() {
      reject(new Error('Server stop timeout'));
    }, 1900);

    self._process.on('exit', function() {
      self._process.removeAllListeners();
      self._processList = _.without(self._processList, self._process);
      resolve();
    });
    self._process.kill();
  }).then(function() {
    this._process = null;
  }.bind(this));
};

Server.prototype.terminate = function() {
  this._processList.forEach(function(childProcess) {
    try {
      childProcess.kill();
    } catch (err) {
    }
  });
};

module.exports = Server;
