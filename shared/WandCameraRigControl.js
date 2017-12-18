
(function(exports) {
	
if(require) {
	var THREE = require('three');
}

var SCALE_WORLD_FACTOR = 1.0; // (getCurrentSpan() / getPreviousSpan()).
var ORBIT_SENSATIVITY = .005; //pixels to radians
var PAN_SESNATIVITY = .00025; //pixels to meters
var ROLL_FACTOR = 1;
var D2R = Math.PI / 180;

var pivotMatrix = new THREE.Matrix4();
var offsetToCameraRig = new THREE.Matrix4();
var rotM = new THREE.Matrix4();
exports.orbit = function(data, cameraRig, viewerModel, headPosSystem) {
	var centerPos = viewerModel.getCenterPoint();
	var vectorUp = viewerModel.getCenterTopPos();
	vectorUp.sub(centerPos);
	vectorUp.normalize();
	pivotMatrix.lookAt(centerPos, headPosSystem, vectorUp);
	pivotMatrix.setPosition(centerPos);
	pivotMatrix.multiplyMatrices(cameraRig, pivotMatrix);
	
	//calc offset for cameraRigMatrix
	offsetToCameraRig.getInverse(pivotMatrix);
	offsetToCameraRig.multiplyMatrices(offsetToCameraRig, cameraRig);
	
	rotM.makeRotationY(data.x * -ORBIT_SENSATIVITY);//move pivotMatrix
	pivotMatrix.multiply(rotM);
	rotM.makeRotationX(data.y * ORBIT_SENSATIVITY);
	pivotMatrix.multiply(rotM);
	
	cameraRig.multiplyMatrices(pivotMatrix, offsetToCameraRig);
}


var target = new THREE.Vector3();
var grabPos = new THREE.Vector3();
var scaleFactor = new THREE.Vector3();
var currentMatrix = new THREE.Matrix4();
exports.scale = function(data, cameraRig, wandModel) {
	currentMatrix.multiplyMatrices(cameraRig, wandModel.localMatrix);
	target.setFromMatrixPosition(currentMatrix);
	grabPos.setFromMatrixPosition(cameraRig);
	var wandToGrabPos = grabPos.sub(target);
	var mody = data.scaleFactor - 1;
	mody = mody * SCALE_WORLD_FACTOR;
	mody = mody + 1;
	var factor = 1 / mody;
	wandToGrabPos.multiplyScalar(factor);
	scaleFactor.set(factor, factor, factor);
	cameraRig.scale(scaleFactor);
	wandToGrabPos.add(target);
	cameraRig.setPosition(wandToGrabPos);
}

var offsetOrigin = new THREE.Matrix4();
var offsetMatrix = new THREE.Matrix4();
exports.pan = function(data, cameraRig, viewerModel, headPosSystem) {
	var centerPos = viewerModel.getCenterPoint();
	var vectorUp = viewerModel.getCenterTopPos();
	vectorUp.sub(centerPos);
	vectorUp.normalize();
	
	offsetOrigin.lookAt(headPosSystem, centerPos, vectorUp);
	offsetOrigin.setPosition(headPosSystem);
	offsetOrigin.multiplyMatrices(cameraRig, offsetOrigin);
	
	offsetMatrix.identity();
	offsetMatrix.setPosition( new THREE.Vector3(data.offX * -PAN_SESNATIVITY, data.offY * PAN_SESNATIVITY, 0) );
	offsetMatrix.multiplyMatrices(offsetOrigin, offsetMatrix);  //offset in offsetOrigin space
	
	offsetOrigin.getInverse(offsetOrigin);//find wandToRigOffset
	offsetOrigin.multiply(cameraRig);
	
	cameraRig.multiplyMatrices(offsetMatrix, offsetOrigin); //move rig in offsetMatrix space
}

exports.roll = function(data, cameraRig, viewerModel, headPosSystem) {
		var centerPos = viewerModel.getCenterPoint();
		var vectorUp = viewerModel.getCenterTopPos();
		vectorUp.sub(centerPos);
		vectorUp.normalize();
		
		offsetOrigin.lookAt(headPosSystem, centerPos, vectorUp);
		offsetOrigin.setPosition(headPosSystem);
		offsetOrigin.multiplyMatrices(cameraRig, offsetOrigin);
		
		offsetMatrix.makeRotationZ(data.angleChange * D2R * ROLL_FACTOR);
		offsetMatrix.multiplyMatrices(offsetOrigin, offsetMatrix);
		
		//find wandToRigOffset
		offsetOrigin.getInverse(offsetOrigin);
		offsetOrigin.multiply(cameraRig);
		
		cameraRig.multiplyMatrices(offsetMatrix, offsetOrigin); //move rig in offsetMatrix space
	}

})(this.WandCameraRigControl = {});