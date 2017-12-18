
var THREE = require('three');

var ViewerModel = function(id, monitorManager, monitorFoundCallback) {
	this.id = id;
	this.monitorManager = monitorManager;
	this.monitorFoundCallback = monitorFoundCallback;
	this.pxBox = {};
	this.pxBox.innerScreenY = 0;
	this.pxBox.bottom = 0;
	this.pxBox.innerScreenX = 0;
	this.pxBox.right = 0;
	this.lastMonitor;
	this.perspectiveMatrix = new THREE.Matrix4();
	return this;
}
exports.ViewerModel = ViewerModel;

ViewerModel.prototype.setMarkerList = function(theMarkerList) {
	this.markerIDList = theMarkerList;
}


ViewerModel.prototype.setScreenPixels = function(innerScreenY, bottom, innerScreenX, right) {
	this.pxBox.innerScreenY = innerScreenY;
	this.pxBox.bottom = bottom;
	this.pxBox.innerScreenX = innerScreenX;
	this.pxBox.right = right;
	this.updateMonitorFromPixelChange();
}

ViewerModel.prototype.updateMonitorFromPixelChange = function() {
	var center = this.getCenterPixel();
	var monitor = this.monitorManager.getMonitorWithPixel(center.x, center.y);
	if(monitor !== undefined) {
		var firstTime = false;
		if(this.lastMonitor === undefined) {
			firstTime = true;
		}
		this.lastMonitor = monitor;
		if(firstTime && this.monitorFoundCallback) {
			this.monitorFoundCallback();
		}
	}
}

ViewerModel.prototype.computePerspective = function(eyePos, nearClip, farClip) {
	if(this.lastMonitor !== undefined) {
		var upperLeft = this.lastMonitor.getPosOfPixel(this.pxBox.innerScreenX, this.pxBox.innerScreenY);
		var lowerRight = this.lastMonitor.getPosOfPixel(this.pxBox.right, this.pxBox.bottom);
		var lowerLeft = this.lastMonitor.getPosOfPixel(this.pxBox.innerScreenX, this.pxBox.bottom);
		getPerspectiveMatrix(this.perspectiveMatrix, lowerLeft, lowerRight, upperLeft, eyePos, nearClip, farClip);
		return this.perspectiveMatrix;
	}
}


ViewerModel.prototype.getCenterPixel = function() {
	var xCenter = ((this.pxBox.right - this.pxBox.innerScreenX) / 2) + this.pxBox.innerScreenX;
	var yCenter = ((this.pxBox.bottom - this.pxBox.innerScreenY) / 2) + this.pxBox.innerScreenY;
	return {x: xCenter, y: yCenter};
}

ViewerModel.prototype.getCenterPoint = function() {
	if(this.lastMonitor !== undefined) {
		var xy = this.getCenterPixel();
		return this.lastMonitor.getPosOfPixel(xy.x, xy.y);
	}
}

ViewerModel.prototype.getCenterTopPos = function() {
	if(this.lastMonitor !== undefined) {
		return this.lastMonitor.getPosOfPixel(
			((this.pxBox.right - this.pxBox.innerScreenX) / 2) + this.pxBox.innerScreenX, 
			this.pxBox.innerScreenY);
	}
}


function getPerspectiveMatrix(inMatrix, pa, pb, pc, pe, n, f) {
	// Compute an orthonormal basis for the screen.
	var vr = new THREE.Vector3().subVectors(pb, pa);
	var vu = new THREE.Vector3().subVectors(pc, pa);
	vr.normalize();
	vu.normalize();
	var vn = new THREE.Vector3().crossVectors(vr, vu);
	vn.normalize();
	// Compute the screen corner vectors.
	var va = new THREE.Vector3().subVectors(pa, pe);
	var vb = new THREE.Vector3().subVectors(pb, pe);
	var vc = new THREE.Vector3().subVectors(pc, pe);
	// Find the distance from the eye to screen plane.
	var d = -va.dot(vn);
	// Find the extent of the perpendicular projection.
	var l = vr.dot(va) * n / d;
	var r = vr.dot(vb) * n / d;
	var b = vu.dot(va) * n / d;
	var t = vu.dot(vc) * n / d;
	// Load the perpendicular projection.
	inMatrix.makeFrustum(l, r, b, t, n, f);
	// Rotate the projection to be non-perpendicular.
	var rotationMatrix = new THREE.Matrix4();
	rotationMatrix.elements[0] = vr.x; rotationMatrix.elements[4] = vr.y; rotationMatrix.elements[8] = vr.z;
	rotationMatrix.elements[1] = vu.x; rotationMatrix.elements[5] = vu.y; rotationMatrix.elements[9] = vu.z;
	rotationMatrix.elements[2] = vn.x; rotationMatrix.elements[6] = vn.y; rotationMatrix.elements[10] = vn.z;
	rotationMatrix.elements[15] = 1.0;
	inMatrix.multiply(rotationMatrix);
	// Move the apex of the frustum to the origin.
	var eyeOffset = new THREE.Matrix4().makeTranslation(-pe.x, -pe.y, -pe.z);
	inMatrix.multiply(eyeOffset);
	return inMatrix;
}