
var THREE = require('three');
var MONITORS = require('../shared/monitors');
var jsonfile = require('jsonfile');

var SAVED_MONITOR_FILE = './calibration/monitors.json';	 //must be in same directory as CALIBRATION_DIR in vwserver

var P2M = 0.000265625 //pixels to meters for default monitor sizes

function MonitorManagerServer(socketBroadcast, room) {
	MONITORS.MonitorManager.call(this);
	this.roomName = room;
	this.broadcastSocket = socketBroadcast;
	this.isMissingMonitorCalibrationFile = false;
	try {
		this.monitorCalibrationFile = jsonfile.readFileSync(SAVED_MONITOR_FILE);
	} catch(error) {
		if (error.code !== 'ENOENT') {
			throw error;
		}
		else {
			//console.log("Did not find monitor calibartion file", SAVED_MONITOR_FILE);
			this.isMissingMonitorCalibrationFile = true;
		}
	}
}

MonitorManagerServer.prototype = Object.create( MONITORS.MonitorManager.prototype );
MonitorManagerServer.prototype.constructor = MonitorManagerServer;
exports.MonitorManagerServer = MonitorManagerServer;

MonitorManagerServer.prototype.addMonitor = function (monitor) {
	MONITORS.MonitorManager.prototype.addMonitor.call(this, monitor);
	monitor.callOnSetPose = this.onMonitorChangedCallback.bind(this);
	this.broadcastSocket.to(this.roomName).emit('createMonitor', monitor.id, monitor.widthM, monitor.heightM, monitor.widthPX, monitor.heightPX, monitor.xPosPX, monitor.yPosPX, monitor.poseConfidence );
}

MonitorManagerServer.prototype.onMonitorChangedCallback = function (monitor) {
	this.sendPoseUpdate(monitor);
}

MonitorManagerServer.prototype.onScreenInfo = function (viewerID, screenArray) { //todo for multiple computers, add viewerID to screen id
	for(var i = 0; i < screenArray.length; i++) {
		var screenLocalID = screenArray[i].id;
		var sp = screenArray[i].bounds;
		var confidence = 0;
		if(sp.x == 0 && sp.y == 0) {
			confidence = 1;
		}
		var mon = new MonitorServer(screenLocalID, sp.width*P2M, sp.height*P2M, sp.width, sp.height, sp.x, sp.y, confidence)
		
		//if monitor of ID is in cal file, use info
		var existingMonitorData = this.getMonitorInCalFileFromPixelPos(sp.x, sp.y);
		if(existingMonitorData !== null) {
			var savedPos = new THREE.Vector3();
			savedPos.copy(existingMonitorData.pos);
			var savedQuat = new THREE.Quaternion();
			savedQuat.set(existingMonitorData.quat._x, existingMonitorData.quat._y, existingMonitorData.quat._z, existingMonitorData.quat._w);
			mon.pos = savedPos;
			mon.quat = savedQuat;
			if(mon.poseConfidence !== 1) {
				mon.poseConfidence = existingMonitorData.poseConfidence;
			}
			mon.widthM = existingMonitorData.widthM;
			mon.heightM = existingMonitorData.heightM;
		}
		
		//find monitor in size cal file and set size
		// if(this.monitorSizeFile !== undefined && this.monitorSizeFile.length !== 0) {
			// for (var j = 0; j < this.monitorSizeFile.length; j++) {
				// var mData = this.monitorSizeFile[j];
				// if(mData !== undefined) {  //sometimes null due to crashes?
					// if(mData.pixel_position_x === mon.xPosPX && mData.pixel_position_y === mon.yPosPX) {
						// mon.widthM = mData.width_in_meters;
						// mon.heightM = mData.height_in_meters;
					// }
				// }
			// }
		// }
		
		this.addMonitor(mon);
		this.sendPoseUpdate(mon);		
	}
	if(this.isMissingMonitorCalibrationFile) {
		this.broadcastSocket.to(this.roomName).emit('isMissingMonitorCalibrationFile')
	}
}

MonitorManagerServer.prototype.getMonitorInCalFileFromPixelPos = function(xPos, yPos) {
	if(this.monitorCalibrationFile !== undefined && this.monitorCalibrationFile.length !== 0) {
		for (var i = 0; i < this.monitorCalibrationFile.length; i++) {
			var mData = this.monitorCalibrationFile[i];
			if(mData !== null) {  //sometimes null due to crashes?
				if(mData.xPosPX === xPos && mData.yPosPX === yPos) {
					return mData;
				}
			}
		}
	}
	return null;
}

MonitorManagerServer.prototype.sendMonitorList = function(socket) {
	for (var i = 0; i < this.mList.length; i++) {
		var m = this.mList[i];
		socket.emit('createMonitor', m.id, m.widthM, m.heightM, m.widthPX, m.heightPX, m.xPosPX, m.yPosPX, m.poseConfidence );
		socket.emit('setMonitorPose', m.id, m.pos, m.quat, m.poseConfidence);
	}
}

MonitorManagerServer.prototype.sendPoseUpdate = function (monitor) {
	this.broadcastSocket.to(this.roomName).emit('setMonitorPose', monitor.id, monitor.pos, monitor.quat, monitor.poseConfidence);
}

MonitorManagerServer.prototype.writeMonitorsFile = function() {
	if(this.mList.length > 0) {
		try {			
			jsonfile.writeFileSync(SAVED_MONITOR_FILE, this.mList, {spaces: 2}, function (err) {
				  console.error(err);
				});
		}
		catch(e) {
			console.log(e);
		}
		var mData = [];
		for (var i = 0; i < this.mList.length; i++) {
			var m = this.mList[i];
			var datam = {'pixel_position_x': m.xPosPX, 'pixel_position_y': m.yPosPX, 'width_in_meters': m.widthM, 'height_in_meters': m.heightM};
			mData.push(datam);
		}
		//check if old monitors are not there and put them in.
		if(this.monitorSizeFile !== undefined && this.monitorSizeFile.length !== 0) {
			for (var j = 0; j < this.monitorSizeFile.length; j++) {
				var oldMonitorInfo = this.monitorSizeFile[j];
				var isMissingOldMonitor = true;
				for (var i = 0; i < mData.length; i++) {
					var m = mData[i];
					if(m.pixel_position_x === oldMonitorInfo.pixel_position_x && m.pixel_position_y === oldMonitorInfo.pixel_position_y) {
						isMissingOldMonitor = false;
						break;
					}
				}
				if(isMissingOldMonitor) {
					mData.push(oldMonitorInfo);
				}				
			}
		}
	}
}

MonitorManagerServer.prototype.onUpdateMonitorSizes = function(sizeArray) {
	for (var i = 0; i < sizeArray.length; i++) {
			var sizeData = sizeArray[i];
			for (var i = 0; i < this.mList.length; i++) {
				var m = this.mList[i];
				if(sizeData.pixelX === m.xPosPX && sizeData.pixelY === m.yPosPX) {
					m.widthM = sizeData.width;
					m.heightM = sizeData.height;
					this.broadcastSocket.to(this.roomName).emit('updateMonitorSize', m.id, m.widthM, m.heightM);
					break;
				}
			}
	}
}


// MonitorManagerServer.prototype.readMonitorsFile = function () {
	// var obj = jsonfile.readFileSync(SAVED_MONITOR_FILE);
	// if(obj !== undefined && obj.length !== 0) {
		// for (var i = 0; i < obj.length; i++) {
			// mData = obj[i];
			// if(mData !== null) {  //sometimes null due to crashes?
				
				// var existingMonitor = this.getMonitorFromSystemID(mData.systemID); //if monitor of ID already exists, just update monitor with new info
				// if(existingMonitor === null) {
					// existingMonitor = new MonitorServer(mData.systemID, mData.widthM, mData.heightM, mData.widthPX, mData.heightPX, mData.xPosPX, mData.yPosPX, mData.poseConfidence);
					// this.addMonitor(existingMonitor);
				// }
				// var savedPos = new THREE.Vector3();
				// savedPos.copy(mData.pos);
				// var savedQuat = new THREE.Quaternion();
				// savedQuat.set(mData.quat._x,mData.quat._y,mData.quat._z,mData.quat._w);
				// existingMonitor.setPose(savedPos, savedQuat,  mData.poseConfidence);
			// }
		// }
		// return true;
	// }
	// return false;	
// }


function MonitorServer(aSystemID, widthM, heightM, widthPX, heightPX, xPosPX, yPosPX, poseConfidence){
	MONITORS.Monitor.call(this, widthM, heightM, widthPX, heightPX, xPosPX, yPosPX, poseConfidence);
	this.systemID = aSystemID;
};
MonitorServer.prototype = Object.create( MONITORS.Monitor.prototype );
MonitorServer.prototype.constructor = MonitorServer;
exports.MonitorServer = MonitorServer;

MonitorServer.prototype.setPose = function(pos, quat, confidence) {
	this.pos = pos;
	this.quat = quat;
	this.poseConfidence = confidence;
	this.callOnSetPose(this);
};




