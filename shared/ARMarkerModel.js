var THREE = require('three');
var jsonfile = require('jsonfile');

var MARKER_SIZE_MM_DEFAULT = 287.89;

var Marker = function(id, sizeInMM) {
	this.id = id;
	if(sizeInMM === undefined) {
		this.sizeMM = MARKER_SIZE_MM_DEFAULT;
	}
	else {
		this.sizeMM = sizeInMM;
	}
	this.pos = new THREE.Vector3();
	this.quat = new THREE.Quaternion();
	this.confidence = 0.0;
	this.myMonitor = undefined;
	this.xPixelPos = 0;
	this.yPixelPos = 0;
}

exports.Marker = Marker;

var markerList = {};
exports.markerList = markerList;

var makeMarker = function (markerID, sizeInMM) {
	var marker = markerList[markerID];
	if(marker) { //already made, probably by calibration file loader
		marker.sizeMM = sizeInMM; //in case different;
	}
	else {
		marker = new Marker(markerID, sizeInMM);
		markerList[markerID] = marker;
	}
	return marker;
}
exports.makeMarker = makeMarker;

var getMarker = function (markerID) {
	var marker = markerList[markerID];
	return marker;
}
exports.getMarker = getMarker;


