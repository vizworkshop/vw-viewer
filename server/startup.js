var isDevMode = false;
// @ifndef PACKAGED
isDevMode = true;
// @endif 
					
isDevMode = false; //commenting in we loose console.log output from server context but fix network buffering bug
					//leave uncommented for production build

if(isDevMode) {
	servermain = require('./server/server_main.js');
}
else {
	//makes extra process for server which helps with buffering slowdown of UDP network messages
	var childprocess = require('child_process'); 
	var worker = childprocess.fork('server/server_main.js');
}

var mainWindow = nw.Window.open('../viewer/index.html', 
	{'width': 1200, 'height': 900, 'new_instance': false}, 
	function(win) {
		win.on('closed', function() {
			if(isDevMode) {
				servermain.onServerExit();
			}
			else {
				worker.send('closing');
			}
		});
});

