var THREE = require('three');

var monitorCount = 0;
exports.monitorCount = monitorCount;
var Monitor = function(widthM, heightM, widthPX, heightPX, xPosPX, yPosPX, poseConfidence) {
	this.id = monitorCount;
	monitorCount = monitorCount + 1;
	this.widthM = widthM;
	this.heightM = heightM;
	this.widthPX = widthPX;
	this.heightPX = heightPX;
	this.xPosPX = xPosPX;
	this.yPosPX = yPosPX;
	if(poseConfidence) {
		this.poseConfidence = poseConfidence;
	}
	else {
		this.poseConfidence = 0;
	}
	this.pos = new THREE.Vector3();
	this.quat = new THREE.Quaternion();
	
	this.tempQuat = new THREE.Quaternion();  //without this cannot switch nwjs context?
}

Monitor.prototype.isPixelOnMonitor = function(x, y) {
	var xInMonitorSpace = x - this.xPosPX;
	var yInMonitorSpace = y - this.yPosPX;
	if (xInMonitorSpace > 0 && xInMonitorSpace < this.widthPX && yInMonitorSpace > 0 && yInMonitorSpace < this.heightPX) {
		return true;
	}
	else {
		return false;
	}
}

Monitor.prototype.getPosOfPixelInMonitorSpace = function(x, y) {
	var xPos = ((x - this.xPosPX) / this.widthPX) * this.widthM;
	var yPos = -(((y - this.yPosPX) / this.heightPX) * this.heightM) + this.heightM;  //transform pixels from top to lower left
	return new THREE.Vector3(xPos, yPos, 0);
}

	
Monitor.prototype.getPosOfPixel = function(x, y) {
	var pixelPos = this.getPosOfPixelInMonitorSpace(x, y);
	this.tempQuat._w = this.quat._w;
	this.tempQuat._x = this.quat._x;
	this.tempQuat._y = this.quat._y;
	this.tempQuat._z = this.quat._z;
	
	pixelPos.applyQuaternion(this.tempQuat);  //without temp quat this becomves NaN
	pixelPos.add(this.pos);
	
	return pixelPos;
}

Monitor.prototype.setPixelInfo = function(widthPX, heightPX, xPosPX, yPosPX) {
	this.widthPX = widthPX;
	this.heightPX = heightPX;
	this.xPosPX = xPosPX;
	this.yPosPX = yPosPX;
}

exports.Monitor = Monitor;

var MonitorManager = function() {
	this.mList = [];
}
exports.MonitorManager = MonitorManager;

MonitorManager.prototype.addMonitor = function (monitor) {
	//this.mList[monitor.id] = monitor;
	this.mList.push(monitor)
}

MonitorManager.prototype.getMonitor = function (id) {
	for (var i = 0; i < this.mList.length; i++) {
		if(this.mList[i].id == id) {
			return this.mList[i];
		}
	}
	return null;
}

MonitorManager.prototype.getMonitorWithPixel = function (x, y) {
	for (var i = 0; i < this.mList.length; i++) {
		var m = this.mList[i];		
		if(m.isPixelOnMonitor(x, y)) {
			return m;
		}
	}
}