var fs = require('fs'),
  path = require('path'),
  log4js = require('log4js');

var mkdirRecursive = function(directory) {
  var pathParts = path.normalize(directory).replace(/\/$/, '').split(path.sep);
  for (var i = 0; i < pathParts.length; i++) {
    var parentDirectory = pathParts.slice(0, i + 1).join(path.sep) + '/';
    if (!fs.existsSync(parentDirectory)) {
      fs.mkdirSync(parentDirectory);
    }
  }
};

var logProcessInto = function(process, logFile) {
  mkdirRecursive(path.dirname(logFile));
  log4js.configure({
    appenders: {
      socketRedis: {
        type: 'file',
        filename: logFile
      }
    },
    categories: {
      default: {
        appenders: ['socketRedis'],
        level: 'debug'
      }
    }
  });
  var logger = log4js.getLogger();
  process.stdout.write = function(content, encoding, callback) {
    logger.debug(content);
    if (typeof encoding === 'function') {
      encoding();
    }
    if (typeof callback === 'function') {
      callback();
    }
    return true;
  };
  process.stderr.write = function(content, encoding, callback) {
    logger.error(content);
    if (typeof encoding === 'function') {
      encoding();
    }
    if (typeof callback === 'function') {
      callback();
    }
    return true;
  };
};

module.exports = {
  logProcessInto: logProcessInto
};
