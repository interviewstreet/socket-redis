socket-redis
============
*socket-redis* is a WebSocket pub/sub server and client, exposing an API over Redis
(allowing you to use WebSocket functionality in your application using a Redis client).

[![Version](https://img.shields.io/npm/v/socket-redis.svg)](https://www.npmjs.com/package/socket-redis)
[![Build Status](https://img.shields.io/travis/cargomedia/socket-redis/master.svg)](https://travis-ci.org/cargomedia/socket-redis)
[![Docker Hub](https://img.shields.io/badge/Docker_Hub-cargomedia%2Fsocket--redis-22b8eb.svg)](https://hub.docker.com/r/cargomedia/socket-redis/)

About
-----
*socket-redis* starts a WebSocket server ([SockJS](http://sockjs.org/)) where clients can connect to, and subscribe to multiple channels.
The server will let you consume client-related events like `message`, `subscribe` and `unsubscribe` on a [Redis](http://redis.io/) pub/sub channel `socket-redis-up`.
Additionally it will subscribe to another pub/sub channel `socket-redis-down` where you can send messages to all clients in a channel.

When specifying multiple `--socket-ports` the script will spawn a child process for each port. This is provided as a simple way to make use of all your CPU cores.


Server
------

### Installation & Configuration
Package is available through npm registry:
```
npm install socket-redis [-g]
socket-redis.js --redis-host=my-redis
```

Or as a Docker image:
```
docker run cargomedia/socket-redis ./bin/socket-redis.js --redis-host=my-redis
```
See also the provided [`docker-compose.yml`](docker-compose.yml) for reference.


Available options:
- `--redis-host` Specify host of redis server. Defaults to `localhost`.
- `--redis-port` Specify port. Default 6379
- `--redis-pass` Specify password if needed
- `--socket-ports` Comma separated public ports which SockJS workers will listen on. Defaults to `8090`.
- `--log-dir` Directory where log is stored. Script will try to create directory if needed. Defaults to `null` which means it will output to stdout.
- `--sockjs-client-url` Specify custom url for sockjs-client library.
- `--status-port` Specify port for http status requests. It should not be publicly accesible. Defaults to `8085`
- `--status-secret` Specify secret token to allow/deny http status requests (optional).
- `--ssl-key` Specify ssl private key file. Combine with `ssl-cert` option.
- `--ssl-cert` Specify ssl public certificate file. Combine with `ssl-key` option. Append CA-chain within this file.
- `--ssl-pfx` Specify ssl pfx file (key + cert). Overrides `ssl-key` and `ssl-cert` options.
- `--ssl-passphrase` Specify file containing the ssl passphrase.

### Redis API
#### Messages published to redis pub/sub channel `socket-redis-up`:
- `{type: "subscribe", data: {channel: <channel>, clientKey: <clientKey>, data: <subscribe-data>}}`
- `{type: "unsubscribe", data: {channel: <channel>, clientKey: <clientKey>}}`
- `{type: "message", data: {clientKey: <clientKey>, data: <data>}}`

#### Messages consumed on redis pub/sub channel `socket-redis-down`:
- `{type: "publish", data: {channel: <channel>, event: <event>, data: <data>}}`

For example you could publish messages using *Redis CLI*:
```sh
redis-cli 'publish' 'socket-redis-down' '{"type":"publish", "data": {"channel":"<channel>", "event":"<event>", "data":"<data>"}}'
```

### HTTP status API
Server also answers http status requests (on port 8085 by default).

A JSON representation of all current subscribers is returned on `/`:
```console
$ curl 'http://localhost:8085/'

{<channel>: {
	"subscribers": {
		<clientKey>: {
			"clientKey": <clientKey>,
			"subscribeStamp": <subscribe-stamp>,
			"data": {}
		}
	}
}
```

A Prometheus scraping endpoint is responding on `/metrics`:
```console
$ curl 'http://localhost:8085/metrics' 

# HELP socketredis_channels_total Number of channels
# TYPE socketredis_channels_total gauge
socketredis_channels_total 30

# HELP socketredis_subscribers_total Number of subscribers
# TYPE socketredis_subscribers_total gauge
socketredis_subscribers_total 90
```

Client
------
### Building
Client is written as a node module. If you want to access it as a global variable in browser then you need to browserify `client/index.js`. It will be exposed under `SocketRedis`. Also it requires a global variable `SockJS` that contains sockjs client.
```
browserify --standalone SocketRedis ./client/index.js -o ./client/socket-redis.js
```

### Installation
Include the SockJS and socket-redis client libraries in your html file:
```html
<script src="http://cdn.sockjs.org/sockjs-0.3.min.js"></script>
<script src="./client/socket-redis.js"></script>
```

### Example
To receive messages from the server create a new `SocketRedis` instance and subscribe to some channels:
```
var socketRedis = new SocketRedis('http://example.com:8090');
socketRedis.onopen = function() {
	socketRedis.subscribe('channel-name', null, {foo: 'bar'}, function(event, data) {
		console.log('New event `' + event + '` on channel `channel-name`:', data);
	});

	socketRedis.unsubscribe('channel-name');
};
socketRedis.open();
```

To publish messages to a channel from the client:
```
socketRedis.publish('channel-name', 'event-name', {foo: 'bar'});
```
(The event name will be prefixed with `client-` and thus become `client-event-name`.)


To send messages to the server:
```
socketRedis.send({foo: 'bar'});
```

Development
-----------
Install dependencies:
```
npm install
```

Build the docker image:
```
docker-compose build
```

#### Running Tests
```
docker-compose run --rm --volume $(pwd):/opt/socket-redis socket-redis ./script/test.sh
```

#### Running the Server
```
docker-compose run --volume $(pwd):/opt/socket-redis --service-ports socket-redis
```

#### Releasing new Versions
1. Update package.json with a new version
2. Push a new git tag with the updated package.json
3. The Travis build should deploy to NPM automatically

If it doesn't work you could release it manually with:
```
npm publish https://github.com/cargomedia/socket-redis/archive/<GitTagWithUpdatedPackageJson>.tar.gz
```
