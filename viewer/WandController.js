
(function(exports) {

function WandController(masterSocket, wandModel, worldRoot, amodelDic) {
	this.masterSocket = masterSocket;
	this.wandModel = wandModel;
	this.worldRoot = worldRoot;
	this.modelDic = amodelDic;
	this.wandToModelTransform = new THREE.Matrix4();
	var me = this;
	
	this.onNewToolMode = function(newMode, oldMode, optionalData) {
		if(newMode == me.wandModel.modes.GRABBING) {
			me.startGrabWorld();
		}
		else if(newMode == me.wandModel.modes.MODEL_GRAB) {
			me.startGrabModel();
		}
		
		// if(oldMode == me.wandModel.modes.MODEL_GRAB) {
			// me.wandModel.grabbedModel.stopGrab();  now handeled by grabbable
		// }
	}	
	
	this.update = function() {
		if(me.wandModel.toolMode == me.wandModel.modes.GRABBING) {
			me.updateGrabWorld();
		}
		else if(me.wandModel.toolMode == me.wandModel.modes.MODEL_GRAB) {
			me.updateGrabModel();
		}
	}
	
	this.onSelectPossible = function(modelID) {
		if(me.modelDic[modelID]) {
			me.modelDic[modelID].startHighlightPossible();
		}
		else {
			console.log("Error: starting model highlight on undefined model")
		}
	}
	
	this.onLeaveSelectPossible = function(modelID) {
		if(me.modelDic[modelID]) {
			me.modelDic[modelID].stopHighlightPossible();
		}
		else {
			console.log("Error: stopping model highlight on undefined model")
		}
	}
	
	this.enable = function() {
		wandModel.on('newMatrix', this.update);
		wandModel.on('newToolMode', this.onNewToolMode);
		wandModel.on('selectPossible', this.onSelectPossible);
		wandModel.on('leaveSelectPossible', this.onLeaveSelectPossible);
		me.masterSocket.on('reflect', me.reflectFunc);
	}
	
	this.removeListeners = function() {
		wandModel.removeListener('newToolMode', this.onNewToolMode);
		wandModel.removeListener('newMatrix', this.update);
		wandModel.removeListener('selectPossible', this.onSelectPossible);
		wandModel.removeListener('leaveSelectPossible', this.onLeaveSelectPossible);
		me.masterSocket.removeListener('reflect', me.reflectFunc);
	}
	wandModel.on('disable', function() {
		me.wandModel.setToolMode(me.wandModel.modes.IDLE);
		me.removeListeners();
	});
	wandModel.on('enable', function() {
		me.enable();
	});	
	
	this.wandToObjectTransform = new THREE.Matrix4();
	this.startGrabWorld = function() {
		var wandInverse = new THREE.Matrix4();
		wandInverse.getInverse(me.wandModel.matrix);	
		me.wandToObjectTransform.multiplyMatrices(wandInverse, me.worldRoot.matrix);		
	}
	
	this.updateGrabWorld = function() {
		me.worldRoot.matrix.multiplyMatrices(me.wandModel.matrix, me.wandToObjectTransform);
		me.worldRoot.matrix.decompose(me.worldRoot.position, me.worldRoot.quaternion, me.worldRoot.scale);
		me.worldRoot.vizworkshopUpdate();
	}
	
	this.onGrabDataSync = function(wandToObjectTransform, worldMatrix) {
		if(wandToObjectTransform) {  //optional if just overwriting possible world grab when we should model grab
			for (var i = 0; i < 16; i++) {
				me.wandToObjectTransform.elements[i] = wandToObjectTransform.elements[i];
			}
		}
		for (var i = 0; i < 16; i++) {
			me.worldRoot.matrix.elements[i] = worldMatrix.elements[i];
		}
		me.worldRoot.matrix.decompose(me.worldRoot.position, me.worldRoot.quaternion, me.worldRoot.scale);
	}
	
	this.startGrabModel = function() {
		var wandInverse = new THREE.Matrix4();
		wandInverse.getInverse(me.wandModel.matrix);
		me.wandToModelTransform.multiplyMatrices(wandInverse, me.wandModel.grabbedModel.grabParent.matrixWorld);
		//me.wandModel.grabbedModel.startGrab();  //now handeled by Grabable
	}
	
	this.updateGrabModel = function() {
		var obj = me.wandModel.grabbedModel.grabParent;
		obj.matrixWorld.multiplyMatrices(me.wandModel.matrix, me.wandToModelTransform);
		var modelParentInverted = new THREE.Matrix4().getInverse(obj.parent.matrixWorld);
		obj.matrix.multiplyMatrices(modelParentInverted, obj.matrixWorld);
		obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
		me.wandModel.grabbedModel.setMatrix();  //so cutplane and visuals can update themselves
	}
	
	this.reflectFunc = function(data) {
		if(data.wID && data.wID == me.wandModel.id) {
			if(data.msgID == 'GrabDataSync') {
				me.onGrabDataSync(data.wandToObj, data.worldMatrix);
			}
			else if(data.msgID == 'ModelGrabSync') {
				var obj = me.modelDic[data.modelID].grabParent;
				var objMatrix = data.modelMatrix;
				for (var i = 0; i < 16; i++) {
					obj.matrix.elements[i] = objMatrix.elements[i];
				}
				obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
				me.modelDic[data.modelID].setMatrix();
			}
			else if(data.msgID == 'WandMode') {
				me.wandModel.setToolMode(data.mode, data.info);
			}
			else if(data.msgID == 'ModelHighlightPossible') {
				me.wandModel.selectPossible(data.modID);
			}
			else if(data.msgID == 'ModelStopHighlightPossible') {
				me.wandModel.leaveSelectPossible(data.modID);
			}
			else if(data.msgID == 'modelSelectState') {
				if(data.is) {
					me.modelDic[data.modelID].setIsSelected(true);
					me.wandModel.setSelectedModel(me.modelDic[data.modelID]);
				}
				else {
					me.modelDic[data.modelID].setIsSelected(false);
					me.wandModel.setSelectedModel(null);
				}
			}
			else if(data.msgID == 'GrabedModelID') {
				me.wandModel.grabbedModel = me.modelDic[data.grabModelID];
			}
			else if(data.msgID == 'NewIntersectModel') {
				me.wandModel.setIntersectedModel(me.modelDic[data.modID]);
			}
			
		}
	}
	
	this.enable();
	return me;
}
exports.WandController = WandController;


function WandMasterController(masterSocket, wandModel, worldRoot, amodelDic, grabGeomList) {
	wandModel.on('disable', function() { //need this called before parent callbacks get disabled
		me.deselect();
	});
	WandController.call(this, masterSocket, wandModel, worldRoot, amodelDic);
	this.grabGeomList = grabGeomList;
	this.intersectedObj;
	this.selectedObject = null;
	var me = this;
	
	me.masterSocket.removeListener('reflect', me.reflectFunc); //mirror broadcasts to all, even me, so don't do anything on reflect.
	
	wandModel.removeListener('newMatrix', this.update); //override with subclassed method
	wandModel.on('newMatrix', function() {
		WandMasterController.prototype.update.call(me);
	});
	
	wandModel.removeListener('newToolMode', this.onNewToolMode); //override with subclassed method
	this.onNewToolMode = function(newMode, oldMode, optionalData) {
		//console.log('new tool mode', newMode);
		if(newMode == me.wandModel.modes.GRABBING) {
			//if intersecting model, then grab model, else grab world
			if(me.selectedObject) {
				me.wandModel.grabbedModel = me.selectedObject;
				me.mirror({msgID: 'GrabedModelID', grabModelID: me.wandModel.grabbedModel.id});
				me.wandModel.setToolMode(me.wandModel.modes.MODEL_GRAB);
				//sync of worldRoot matrix in case client got ahead and grabbed world
				me.mirror({msgID: 'GrabDataSync', wandToObj: me.wandToObjectTransform, worldMatrix: me.worldRoot.matrix});
			}
			else {
				me.startGrabWorld();
				me.mirror({msgID: 'GrabDataSync', wandToObj: me.wandToObjectTransform, worldMatrix: me.worldRoot.matrix});
			}
		}
		else if(newMode == me.wandModel.modes.MODEL_GRAB) {
			me.startGrabModel();
			me.wandModel.grabbedModel.startGrab();
			me.mirror({msgID: 'ModelGrabSync', wandToObj: me.wandToModelTransform, modelID: me.wandModel.grabbedModel.id, modelMatrix: me.wandModel.grabbedModel.grabParent.matrix});
			me.shareWandModelMode();
		}
		else if(newMode == me.wandModel.modes.SELECTING) {
			if(me.intersectedObj) {
				if(me.selectedObject) {
					me.selectedObject.setIsSelected(false);
					me.mirror({msgID: 'modelSelectState', modelID: me.selectedObject.id, is:false});
					if(me.selectedObject.id ==  me.intersectedObj.id) {
						me.selectedObject = null;
						me.wandModel.setSelectedModel(null);
					}
					else {
						me.selectedObject = me.intersectedObj;
						me.selectedObject.setIsSelected(true);
						me.wandModel.setSelectedModel(me.selectedObject);
						me.mirror({msgID: 'modelSelectState', modelID: me.selectedObject.id, is:true});
					}
				}
				else {
					me.selectedObject = me.intersectedObj;
					me.selectedObject.setIsSelected(true);
					me.wandModel.setSelectedModel(me.selectedObject);
					me.mirror({msgID: 'modelSelectState', modelID: me.selectedObject.id, is:true});
				}
			}
			else {
				if(me.selectedObject) {
					me.selectedObject.setIsSelected(false);
					me.wandModel.setSelectedModel(null);
					me.mirror({msgID: 'modelSelectState', modelID: me.selectedObject.id, is:false});
					me.selectedObject = null;
				}
			}
		}
		
		if(oldMode == me.wandModel.modes.GRABBING) {
			me.mirror({msgID: 'GrabDataSync', wandToObj: me.wandToObjectTransform, worldMatrix: me.worldRoot.matrix});
		}
		else if(oldMode == me.wandModel.modes.MODEL_GRAB) {
			me.mirror({msgID: 'ModelGrabSync', wandToObj: me.wandToModelTransform, modelID: me.wandModel.grabbedModel.id, modelMatrix: me.wandModel.grabbedModel.grabParent.matrix});
			me.wandModel.grabbedModel.stopGrab();
		}
		// else if(oldMode == me.wandModel.modes.SELECT_POSSIBLE) {
			// console.log(newMode, oldMode, optionalData);
			// if(optionalData) {
				// me.modelDic[optionalData].stopHighlightPossible();
			// }
		// }
	}
	wandModel.on('newToolMode', this.onNewToolMode);
	
	wandModel.removeListener('selectPossible', this.onSelectPossible); //override with subclassed method
	this.onSelectPossible = function(modelID) {
		//if(!me.selectedObject || me.selectedObject.id != modelID) {
			me.modelDic[modelID].startHighlightPossible();
			me.mirror({msgID: 'ModelHighlightPossible', modID: modelID});
		//}
	}
	wandModel.on('selectPossible', this.onSelectPossible)
	
	wandModel.removeListener('leaveSelectPossible', this.onLeaveSelectPossible); //override with subclassed method
	this.onLeaveSelectPossible = function(modelID) {
		me.modelDic[modelID].stopHighlightPossible();
		me.mirror({msgID: 'ModelStopHighlightPossible', modID: modelID});
	}
	wandModel.on('leaveSelectPossible', this.onLeaveSelectPossible)
	
	this.onNewIntersectModel = function(modelID) {
		me.mirror({msgID: 'NewIntersectModel', modID: modelID});
	}
	wandModel.on('newIntersectModel', this.onNewIntersectModel);
	
	return this;
}
WandMasterController.prototype = Object.create(WandController.prototype);
exports.WandMasterController = WandMasterController;

var offsetWandMatrix = new THREE.Matrix4();
var lazerDirection = new THREE.Vector3();
var wandPos = new THREE.Vector3();
var wandQuat = new THREE.Quaternion();
var wandScale = new THREE.Vector3();
var raycaster = new THREE.Raycaster();
WandMasterController.prototype.update = function() {
	if(this.wandModel.toolMode == this.wandModel.modes.GRABBING) {
		this.updateGrabWorld();
	}
	else if(this.wandModel.toolMode == this.wandModel.modes.IDLE) {
		this.checkForSelecting();
		if(this.intersectedObj &&
			this.wandModel.toolMode != this.wandModel.modes.SELECT_POSSIBLE &&
			this.wandModel.toolMode != this.wandModel.modes.MODEL_GRAB) {
				this.wandModel.setToolMode(this.wandModel.modes.SELECT_POSSIBLE);
				this.shareWandModelMode(this.intersectedObj.id);
		}
	}
	else if(this.wandModel.toolMode == this.wandModel.modes.SELECT_POSSIBLE) {
		//var oldGrabableID = this.intersectedObj.id;
		this.checkForSelecting();
		if(this.intersectedObj == null) {
			this.wandModel.setToolMode(this.wandModel.modes.IDLE);
			this.shareWandModelMode();
		}
	}
	else if(this.wandModel.toolMode == this.wandModel.modes.MODEL_GRAB) {
		this.updateGrabModel();
	}
}

function isParented(parent, child) {
	if(parent == child) {
		return true;
	}
	//else if(child.parent !== undefined && child.parent != cameraRig && child.parent){
	else if(child.parent){
		return isParented(parent, child.parent);
	}
	else {
		return false;
	}	
}

WandMasterController.prototype.checkForSelecting = function() {
	if(!this.wandModel.isFixedPosMode) {
		offsetWandMatrix.makeTranslation(0, 0, -this.wandModel.length/2.0);
		offsetWandMatrix.multiplyMatrices(this.wandModel.matrix, offsetWandMatrix);
		offsetWandMatrix.decompose(wandPos, wandQuat, wandScale)
		lazerDirection.set(0, 0, 1);
		lazerDirection.applyQuaternion(wandQuat);
		raycaster.set(wandPos, lazerDirection);
		//todo subtract wand length from wand pos
		raycaster.far = wandScale.z * this.wandModel.length;
		var intersects = raycaster.intersectObjects( this.grabGeomList, true );
		if(intersects.length == 0) { // check the other way
			offsetWandMatrix.makeTranslation(0, 0, this.wandModel.length/2.0);
			offsetWandMatrix.multiplyMatrices(this.wandModel.matrix, offsetWandMatrix);
			offsetWandMatrix.decompose(wandPos, wandQuat, wandScale)
			lazerDirection.set(0, 0, -1);
			lazerDirection.applyQuaternion(wandQuat);
			raycaster.set(wandPos, lazerDirection);
			intersects = raycaster.intersectObjects(this.grabGeomList, true);
		}
		if ( intersects.length > 0 ) {
			var selectCanidate;
			for(key in this.modelDic) {
				var modelObj = this.modelDic[key];
				if(isParented(modelObj.mesh, intersects[ 0 ].object))	{
					// selectCanidate = modelObj.grabParent;
					// selectCanidate.idKey = key;
					selectCanidate = modelObj;
					//console.log('found grab parent', selectCanidate, selectCanidate.idKey);
					break;
				}
			}
			if(selectCanidate) {
				if (!this.intersectedObj || this.intersectedObj.id != selectCanidate.id ) { //is new interested obj?
					this.deselect();
					this.intersectedObj = selectCanidate;
					this.wandModel.setIntersectedModel(this.intersectedObj);
					//console.log('select psossible', selectCanidate.id, selectCanidate)
					this.wandModel.selectPossible(selectCanidate.id);
				}
			} 
			else {  //intersected with unknow entity
				this.deselect();
			}
		} 
		else if(this.intersectedObj) { //no intersect, but we have old one
			this.deselect();
		}
	}
	else {
		this.deselect();
	}
}

WandMasterController.prototype.deselect = function() {
	//todo un highlight model
	// if ( this.intersectedObj && this.intersectedObj.material && this.intersectedObj.material.color) {
		// this.intersectedObj.material.color.setHex( this.intersectedObj.currentHex );
	// }
	if(this.intersectedObj) {
		this.wandModel.leaveSelectPossible(this.intersectedObj.id);
		this.intersectedObj = null;
		this.wandModel.setIntersectedModel(this.intersectedObj);
	}
}

WandMasterController.prototype.shareWandModelMode = function(extraInfo) {
	this.masterSocket.emit('mirror', {msgID: 'WandMode', wID: this.wandModel.id, mode: this.wandModel.toolMode, info: extraInfo});
}

WandMasterController.prototype.mirror = function(info) {
	info.wID = this.wandModel.id;
	this.masterSocket.emit('mirror', info);
}

})(this.WandController = {});