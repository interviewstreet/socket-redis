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
    appenders: {file: {type: 'file', filename: logFile}},
    categories: {default: {appenders: ['file'], level: 'debug'}}
  });
  var logger = log4js.getLogger();
  process.stdout.write = function(content) {
    return logger.debug(content);
  };
  process.stderr.write = function(content) {
    return logger.error(content);
  };
};

module.exports = {
  logProcessInto: logProcessInto
};
