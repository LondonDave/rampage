var express = require('express');
var https = require('https');
var socketio = require('socket.io');
var socketioclient = require('socket.io/node_modules/socket.io-client');
var assert = require('assert');
var redis = require('redis');
var fs = require('fs');
var winston = require('winston');

/////////////////////////////////////////////////////////////////////////////////////////////////

var playerNumber = 0; // for robots
var playerSocket = {};  // socket.id => player
var playerId = {}; // userID => player

/////////////////////////////////////////////////////////////////////////////////////////////////
winston.add(winston.transports.File, { filename: 'logs/socket.log', handleExceptions: true });
// winston.remove(winston.transports.Console);
// winston.add(winston.transports.Console, { level : "error"});
// var log = winston;
var log = { info: function(){}, error: function(err){ console.error(err);}};



var createPlayer = function(socket, end){

	var action = function(data){
		// data.name=player.name;
		data.id=player.id;
		if(ioclient){
			ioclient.emit('action', data);
		} else {
			//dbclient.hget("player", player.name, function(err, result){
			//	if(err||result===null){
			//		player.level=0;
			//		player.stake = 0;
			//		socket.emit("message", {lobby:{chips:player.stake, level:player.level, ingame:false}})
			//	}else{
			//		result = JSON.parse(result);
			//		player.level = result.level;
			//		player.stake = result.chips;
			//	}
			send([{delay:5000},{lobby:{ingame:false}}]);
			// });
		}
	};

	var send = function(data){
		log.info(data);
		socket.emit("message", data);
	};

	var player =  {
			socket:socket,
			// name: socket.handshake.query.name || ("Player"+(++playerNumber)),
			id: socket.handshake.query.userID || ++playerNumber,
			// accessToken: socket.handshake.query.accessToken || null,
			action:action,
			send:send
	};


	//dbclient.hget("player", player.name, function(err, result){
	//	if(err||result===null){
	//		player.level=0;
	//		player.stake = 0;
	//	}else{
	//		result = JSON.parse(result);
	//		player.level = result.level;
	//		player.stake = result.chips;
	//	}
	end(player);
	// });

};

////////////////////////////////////////////////////////////////////////////

var connect = function(socket, end){
	var userID;
	log.info(socket.id+" connect");
	log.info(JSON.stringify(socket.handshake));
	userID = socket.handshake.query.userID;
	if (!(userID && playerId[userID])){ // not already connected
		createPlayer(socket, function(player){
			playerSocket[socket.id] = player;
			playerId[player.id] = player;
			player.action({connect:true, accessToken:socket.handshake.query.accessToken || null});
			if(end){end();}
		});
	} else {
		var player = playerId[userID];
		if(player.socket){player.socket.disconnect();} // disconnect old socket
		player.socket = socket;       // connect new socket
		playerSocket[socket.id] = player;
		player.action({connect:true, accessToken:socket.handshake.query.accessToken || null});
		if(end){end();}
	}
};

var action = function(socket, data){
	log.info(socket.id+" action: "+JSON.stringify(data));
	playerSocket[socket.id].action(data);
};

var disconnect = function(socket){
	log.info(socket.id+" disconnect");
	playerSocket[socket.id].action({disconnect:true});
	delete playerId[playerSocket[socket.id].id];
	delete playerSocket[socket.id];
};

////////////////////////////////////////////////////////////////////////////

dbclient = redis.createClient();


var connectClient = function(url, end){
	log.info("entering connectClient");
	var ioclient = socketioclient.connect(url,{
		"transports":['websocket'],
		"connect timeout":10000,
		"auto connect":true,
		"try multiple transports":false,
		// "reconnect":false,  // fix for stale messages
		"reconnect":true,
		"max reconnection attempts":100,
		"reconnection limit":Infinity,
		"reconnection delay":500,
		"force new connection": true
	});
	ioclient.on("connecting", function(){
		log.info("client connecting");
	});
	ioclient.on("connect", function(){
		log.info("client connected");
		if(end){end(ioclient);}
	});
	ioclient.on("connect_failed", function(){
		log.info("client connect_failed");
	});
	ioclient.on("reconnecting", function(){
		log.info("client reconnecting");
	});
	ioclient.on("reconnect", function(){
		log.info("client reconnected");
		//send connect for all connected players
		//for (var id in playerId){
		//	playerId[id].action({connect:true, accessToken:playerId[id].socket.handshake.query.accessToken || null});
		//}
	});
	ioclient.on("reconnect_failed", function(){
		log.info("client reconnect_failed");
	});
	ioclient.on('message', function(message){
		log.info(message);
		if (playerId[message[0]]){
			playerId[message.shift()].send(message);
			if(message[0].disconnect){
				log.info("disconnecting");
				playerId[message[0]].socket.disconnect();
				delete playerSocket[playerId[message[0]].socket.id];
				delete playerId[message[0]];
			}
		}
	});
	ioclient.on('disconnect', function(){
		log.info("client disconnected");
		// connectClient(url,end); // fix for stale messages
	});
	ioclient.on('error', function(err){ // server not started
		log.info("client error\n"+err);
		setTimeout(function(){connectClient(url,end);}, 5000);
	});
};

var ioclient=null;
connectClient("http://127.0.0.1:1338", function(response){ioclient = response;});

var app = express();
var server = https.createServer(
	{key : fs.readFileSync('localhost.key'),
	cert : fs.readFileSync('localhost.crt')},
	app
);

var io = socketio.listen(server);
io.configure(function(){
	io.set('log level', 1);
});

server.listen(1337);

app.configure(function(){
	app.use(express.static(__dirname+'/client')); // client subdir contains table.html table.js require.js jquery-1.7.js
});

// server.post('/', function(req, res){ // facebook canvas support
// 	res.sendfile(__dirname+'/client/TableFB.html');
// });

io.sockets.on('connection', function(socket) {
	connect(socket);
	socket.on('action', function(data) {action(socket, data);});
	socket.on('disconnect', function(){ disconnect(socket);});
});


