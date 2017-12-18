
(function(exports) {

//var THREE = require('three');
var MONITORS = require('../shared/monitors');

var monitorManager = new MONITORS.MonitorManager();
	
exports.getMM = function() {
	return monitorManager;
}

	
var parentObj;
exports.setupView = function(parentO) {
	parentObj = parentO;
}

function makeRectangle(rectWidth, rectLength) {
	var rectShape = new THREE.Shape();
	rectShape.moveTo( 0,0 );
	rectShape.lineTo( rectWidth, 0 );
	rectShape.lineTo( rectWidth, rectLength );
	rectShape.lineTo( 0, rectLength );
	rectShape.lineTo( 0, 0 );

	var rectGeom = new THREE.ShapeGeometry( rectShape );
	var material = new THREE.MeshBasicMaterial( { color: 0xff0000 } );
	material.opacity = .3;
	material.transparent = true;
	var rectMesh = new THREE.Mesh( rectGeom,  material) ;		

	return rectMesh;
}

exports.registerClientNetworkListeners = function(ioSocket) {
	ioSocket.on("createMonitor", onCreateMessage);
	ioSocket.on("setMonitorPose", onSetPoseMessage);
	ioSocket.on("updateMonitorSize", onUpdateMonitorSize);
}

function onCreateMessage(id, widthM, heightM, widthPX, heightPX, xPosPX, yPosPX, poseConfidence) {
	var oldMonitor = monitorManager.getMonitor(id);
	if(oldMonitor !== null && oldMonitor.graphicObj !== undefined && oldMonitor.parent) {  //if server was restarted with client steady
		oldMonitor.graphicObj.parent.remove(oldMonitor.graphicObj); //xxx ToDo why is parent sometimes null?  After computer sleep?
	}
	var m = new MONITORS.Monitor(widthM, heightM, widthPX, heightPX, xPosPX, yPosPX, poseConfidence);
	m.id = id;
	monitorManager.addMonitor( m );
	m.graphicObj = makeRectangle(widthM, heightM);
	parentObj.add(m.graphicObj);
	drawMonitor(m);
}

function onSetPoseMessage(id, pos, quat, poseConfidence) {
	var m = monitorManager.getMonitor(id);
	m.pos = pos;
	m.quat = quat;
	m.poseConfidence = poseConfidence;
	drawMonitor(m); 
}

function onUpdateMonitorSize(id, width, height) {
	var m = monitorManager.getMonitor(id);
	m.widthM = width;
	m.heightM = height;
	parentObj.remove(m.graphicObj);
	m.graphicObj = makeRectangle(m.widthM, m.heightM);
	parentObj.add(m.graphicObj);
	drawMonitor(m); 
}

function drawMonitor(monitor) {
	if(monitor.poseConfidence <= 0) {
		monitor.graphicObj.visible = false;
	}
	else {
		monitor.graphicObj.visible = true;
		monitor.graphicObj.position.copy(monitor.pos);
		monitor.graphicObj.quaternion.set( monitor.quat._x, monitor.quat._y, monitor.quat._z, monitor.quat._w);
	}
}

})(this.MONITOR_3D_VIEW = {});


