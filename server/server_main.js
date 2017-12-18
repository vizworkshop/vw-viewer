
var DEFAULT_PORT = 4481;

var isNotPackaged = false;
// @ifndef PACKAGED 
isNotPackaged = true;
// @endif 
if(isNotPackaged) {
}
else {
	//console.log('pacakged', execPath);
	var path = require('path');
	var execPath = path.dirname( process.execPath );
	execPath.replace(/\\/g,"/");
	process.chdir(execPath);
}

var express = require('express');

// Create a new instance of Express
var app = express();

// Create a Node.js based http server
var server = require('http').createServer(app);
server.on('error', function (err) {
	console.log('Error on server', err);
    if (err.code == 'EADDRINUSE'){
		//server.close();
		console.log('Default port: ' + DEFAULT_PORT + ' in use.  Trying random port.');
		server.listen();
	}
});
var mdns;
server.on('listening', function() {
	// var bonjour = require('bonjour')() //pure javascript library with issues
	// bonjour.publish({ name: 'VizWorkshopDisplayServer', type: 'vizworkshop', port: server.address().port })
	// console.log("Server started at port " + server.address().port);
	
	initVWServer(server);
	mdns = require('mdns');
	var ad = mdns.createAdvertisement(mdns.tcp('vizworkshop'), 
		server.address().port, {name:'VizWorkshopDisplayServer'});
	ad.start();	
	console.log('Server listening on ' + server.address().port);
});	
server = server.listen(DEFAULT_PORT);


// Import the game logic file.
var vwserver = require('../server/vwserver.js');   //needed when forking server with child process

function initVWServer(serv) {
	// Create a Socket.IO server and attach it to the http server
	//var io = require('socket.io').listen(server);
	var io = require('socket.io')(server);
	vwserver.init(app, io, serv.address().port);

	// Listen for Socket.IO Connections. Once connected, start the game logic.
	io.sockets.on('connection', function (socket) {
		vwserver.newConnection(io, socket);
	});
}

var onServerExit = function() {
	vwserver.exitHandler();
	server.close();
}
exports.onServerExit = onServerExit;

//process.send('message from worker'); 
process.on('message', function(msg) { 
	if(msg === 'closing') {
		onServerExit();
	}
});
