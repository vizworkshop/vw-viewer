


var socket;
var elementList;

function drawMarkerImages(markerIDList) {
	for (var i = 0; i < markerIDList.length; i++) {
		var element = elementList[i];
		var id = markerIDList[i];
		element.innerHTML = "<img src='marker_images/" + id + ".png'>" 
	}
}

// exports.add = function(theSocket, domElementList) {
	// socket = theSocket;
	// elementList = domElementList;
	// socket.on('assingedMarkerIDs', drawMarkerImages);
	// socket.emit('reserveMarkerIDs', domElementList.length);
// }

exports.add = function(element, markerID) {
	
}



	// var pixels = getScreenPixels();
	// socket.emit("getPerspective", pixels[0],  pixels[1], pixels[2], pixels[3]);
	// requestNewCenterCalc();
	// var box = marker.getBoundingClientRect();
	// var x =  box.left + ((box.right - box.left) / 2) + pixels[2];
	// var y =  box.top + ((box.bottom - box.top) / 2) + pixels[0];
	// socket.emit("markerPixelPos", 'tag_0', x, y);
	// var box = document.getElementById("marker2").getBoundingClientRect();
	// var x =  box.left + ((box.right - box.left) / 2) + pixels[2];
	// var y =  box.top + ((box.bottom - box.top) / 2) + pixels[0];
	// socket.emit("markerPixelPos", 'tag_1', x, y);