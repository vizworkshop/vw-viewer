//var THREE = require('three');
//var EventEmitter = require('events').EventEmitter; now must include <script src="event_emitter.min.js"></script>



(function(exports) {
	
if(require) {
	var THREE = require('three');
	var EventEmitter = require('events').EventEmitter; //now must include <script src="event_emitter.min.js"></script>
}

var wandModes = {IDLE: 1, GRABBING: 2, SELECT_POSSIBLE: 3, MODEL_GRAB: 4, SELECTING: 5}

var WandModel = function(id) {
	this.id = id;
	this.matrix = new THREE.Matrix4();
	this.localMatrix = new THREE.Matrix4();
	this.length = .2;
	this.toolMode = wandModes.IDLE;
	this.grabbedModel = null;
	this.selectedModel = null;	
	this.intersectedModel = null;
	this.needsUpdate = false;
	this.isCalibrating = false;
	this.isTouched = false;
	this.isFixedPosMode = false;
}
exports.WandModel = WandModel;
WandModel.prototype = Object.create(EventEmitter.prototype);
WandModel.prototype.modes = wandModes;

WandModel.prototype.matrixUpdated = function() {
	this.needsUpdate = true;
}

WandModel.prototype.update = function() {
	if(this.needsUpdate) {
		this.emit("newMatrix");
	}
	this.needsUpdate = false;
}

//If controller changes mode in its 'newToolMode' callback, then 'newMode' arg is out of date
WandModel.prototype.setToolMode = function(newMode, extraData) {
	var oldMode = this.toolMode;
	this.toolMode = newMode;
	this.emit('newToolMode', newMode, oldMode, extraData);
}

WandModel.prototype.setIsGrabbing = function(isGrabbing) {
	if(isGrabbing && !this.isFixedPosMode) {
		this.setToolMode(this.modes.GRABBING);
	}
	else {
		this.setToolMode(this.modes.IDLE);
	}
}

WandModel.prototype.setIsSelecting = function(isSelecting) {
	if(isSelecting) {
		this.setToolMode(this.modes.SELECTING);
	}
	else {
		this.setToolMode(this.modes.IDLE);
	}
}


WandModel.prototype.selectPossible = function(modelID) {
	this.emit('selectPossible', modelID);
}
WandModel.prototype.leaveSelectPossible = function(modelID) {
	if(this.grabbedModel && modelID == this.grabbedModel.id) {
		this.grabbedModel = null;
	}
	this.emit('leaveSelectPossible', modelID);
}


WandModel.prototype.setSelectedModel = function(model) {
	this.selectedModel = model;
	this.emit('newSelectedModel');
}

WandModel.prototype.setIntersectedModel = function(model) {
	this.intersectedModel = model;
	var id;
	if(this.intersectedModel) {
		id = this.intersectedModel.id;
	}
	this.emit('newIntersectModel', id);
}

WandModel.prototype.enable = function() {
	this.emit('enable');
}
WandModel.prototype.disable = function() {
	this.emit('disable');
}

WandModel.prototype.getInitInfo = function() {
	var grabbedModelID;
	if(this.grabbedModel) {
		grabbedModelID = this.grabbedModel.id
	}
	var selectedModelID;
	if(this.selectedModel) {
		selectedModelID = this.selectedModel.id
	}
	var intersectedID;
	if(this.intersectedModel) {
		intersectedID = this.intersectedModel.id
	}
	return {matrix: this.matrix.toArray(), toolMode: this.toolMode, 
				grabbedModelID: grabbedModelID, selectedModelID: selectedModelID, intersectedID: intersectedID,
				isCalibrating: this.isCalibrating,
				isFixedPosMode: this.isFixedPosMode};
}

WandModel.prototype.init = function(info, grabbedModel, selected, intersected) {
	this.matrix.fromArray(info.matrix);
	this.grabbedModel = grabbedModel;
	this.selectedModel = selected;
	this.intersectedModel = intersected;
	this.setToolMode(info.toolMode);
	this.onCalibrate(info.isCalibrating);
	this.setIsFixedPosMode(info.isFixedPosMode);
}

WandModel.prototype.onCalibrate = function(isCalibrating) {
	this.isCalibrating = isCalibrating;
	this.emit('onCalibrating');
}

WandModel.prototype.setIsFixedPosMode = function(isFixed) {
	this.isFixedPosMode = isFixed;
	this.emit('onIsFixedPosMode');
}

WandModel.prototype.setIsTouched = function(isT) {
	this.isTouched = isT;
	this.emit('onSetIsTouched');
}

WandModel.prototype.onOrbit = function(data) {
	this.emit('onOrbit', data);
}

WandModel.prototype.onScale = function(data) {
	this.emit("onScale", data);
}

WandModel.prototype.onPan = function(data) {
	this.emit("onPan", data);
}

WandModel.prototype.onRoll = function(data) {
	this.emit("onRoll", data);
}

})(this.WandModel = {});