
var PRINTED_MARKER_WIDTH_FILE = './printedMarkersWidth.json'

var ARMARKER_MODEL = require('../shared/ARMarkerModel');
var jsonfile = require('jsonfile');

var socket;
var printedMarkerWidths;
function setSocket(interestedInMarkersSocket) {
	socket = interestedInMarkersSocket;
	try {
		printedMarkerWidths = jsonfile.readFileSync(PRINTED_MARKER_WIDTH_FILE);
	}
	catch (e) {
		console.log('Error loading ' + PRINTED_MARKER_WIDTH_FILE, e);
	}
}
exports.setSocket = setSocket;

function initMarker(theSocket, marker) {
	theSocket.emit('createMarker', {id: marker.id, pos: marker.pos, quat:marker.quat, confidence: marker.confidence} );  //sending makrer object triggers max call stack
}
exports.initMarker = initMarker;


function makeMarker(markerID, sizeInMM) {
	var marker = ARMARKER_MODEL.makeMarker(markerID, sizeInMM);
	if(sizeInMM === undefined && printedMarkerWidths) {
		var size = printedMarkerWidths[markerID];
		if(size) {
			marker.sizeMM = size;
		}
	}
	initMarker(socket, marker);
	return marker;
}
exports.makeMarker = makeMarker;



exports.saveCalibrations = function (fileName) {
	var data = {};
	for(key in ARMARKER_MODEL.markerList) {
		var markerData = {};
		var marker = ARMARKER_MODEL.markerList[key];
		markerData.pos = marker.pos
		markerData.quat = marker.quat
		markerData.confidence = marker.confidence
		data[key] = markerData;
	}
	jsonfile.writeFileSync(fileName, data, {spaces: 2}, function (err) {
			  console.error(err);
			});
}

exports.loadCalibrations = function (fileName) {
	var oldMarkerList;
	try {
		oldMarkerList = jsonfile.readFileSync(fileName);
	}
	catch (e) {
		//console.log('Error loading ' + fileName, e);
	}
	if(oldMarkerList) {
		for(markerID in oldMarkerList) {
			var oldMarker = oldMarkerList[markerID];
			if(oldMarker) {
				var marker = makeMarker(markerID, oldMarker.sizeMM);
				marker.pos.set(oldMarker.pos.x, oldMarker.pos.y, oldMarker.pos.z);
				marker.quat.set(oldMarker.quat._x, oldMarker.quat._y, oldMarker.quat._z, oldMarker.quat._w);
				marker.confidence = oldMarker.confidence;
			}
		}
	}
	
}