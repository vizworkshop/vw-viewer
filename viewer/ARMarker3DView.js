(function(exports) {

//var THREE = require('three');

var ARMARKER_MODEL = require('../shared/ARMarkerModel');


var drawMarker = function(marker) {
	if(marker.confidence <= 0) {
		marker.graphicObj.visible = false;
	}
	else {
		marker.graphicObj.visible = true;
		marker.graphicObj.position.copy(marker.pos);
		marker.graphicObj.quaternion.set( marker.quat._x, marker.quat._y, marker.quat._z, marker.quat._w);
		//localMarker.graphicObj.updateMatrix();
	}
}

var ourOwnList = {};
var onCreateMarkerMessage = function(markerData) {
	var oldMarker = ourOwnList[markerData.id];
	if(oldMarker !== undefined && oldMarker.graphicObj !== undefined ) {  //if server was restarted with client steady?
		oldMarker.graphicObj.parent.remove(oldMarker.graphicObj);
	}
	var newMarker = new ARMARKER_MODEL.Marker(markerData.id);
	ourOwnList[markerData.id] = newMarker;
	//var newMarker = ARMARKER_MODEL.makeMarker(markerData.id)
	//ARMARKER_MODEL.markerList[newMarker.id] = newMarker;
	newMarker.graphicObj = buildAxes(.3);
	parentObj.add(newMarker.graphicObj);
	onMarkerUpdateMessage( [markerData] );
}

var onMarkerUpdateMessage = function(markerDataList) {
	// var i;
	// for (i = 0; i !== markers.length; ++ i){
		// var networkMarker = markers[i];
		// var localMarker = ARMARKER_MODEL.getMarker(networkMarker.id);
		// localMarker.pos = networkMarker.pos;
		// localMarker.quat = networkMarker.quat;
		// localMarker.confidence = networkMarker.confidence;
		// drawMarker(localMarker);
	// }
	
	for(var i = 0; i < markerDataList.length; i++) {
		var markerData = markerDataList[i];
		var localMarker = ourOwnList[markerData.id];//ARMARKER_MODEL.getMarker(markerData.id);
		localMarker.pos = markerData.pos;
		localMarker.quat = markerData.quat;
		localMarker.confidence = markerData.confidence;
		drawMarker(localMarker);
	}
}



function buildAxis( src, dst, colorHex, dashed ) {
        var geom = new THREE.Geometry(),
            mat; 
        if(dashed) {
                mat = new THREE.LineDashedMaterial({ linewidth: 3, color: colorHex, dashSize: 3, gapSize: 3 });
        } else {
                mat = new THREE.LineBasicMaterial({ linewidth: 3, color: colorHex });
        }
        geom.vertices.push( src.clone() );
        geom.vertices.push( dst.clone() );
        geom.computeLineDistances(); // This one is SUPER important, otherwise dashed lines will appear as simple plain lines
        var axis = new THREE.Line( geom, mat, THREE.LineSegments );
        return axis;
}

function buildAxes( length ) {
        var axes = new THREE.Object3D();
        axes.add( buildAxis( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( length, 0, 0 ), 0xFF0000, false ) ); // +X
        //axes.add( buildAxis( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( -length, 0, 0 ), 0xFF0000, true) ); // -X
        axes.add( buildAxis( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, length, 0 ), 0x00FF00, false ) ); // +Y
        //axes.add( buildAxis( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, -length, 0 ), 0x00FF00, true ) ); // -Y
        axes.add( buildAxis( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, length ), 0x0000FF, false ) ); // +Z
       // axes.add( buildAxis( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, -length ), 0x0000FF, true ) ); // -Z
        return axes;
}

var parentObj;
exports.setupMarkerView = function(parentO) {
	parentObj = parentO;
}

exports.registerClientNetowrkListeners = function(ioSocket) {
	ioSocket.on('createMarker', onCreateMarkerMessage);
	ioSocket.on("updatedMarkers", onMarkerUpdateMessage);
}

})(this.ARMARKER_3D_VIEW = {});

