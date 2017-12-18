

(function(exports) {
	
var MODEL_SELECT_COLOR = 0xffffff;
var MODEL_GRAB_COLOR = 0x00ff00;

var grabSignal = new EventEmitter();
exports.grabSignal = grabSignal;

var theSyncer;
	
exports.Grabable = function (id, mesh) {
	var me = this;
	me.id = id;
	me.grabParent = new THREE.Group();
	me.grabParent.name = 'grabParent';
	me.isHighlighted = false;
	me.isSelected = false;
	me.isGrabbed = false;
	
	me.selectHelper = new THREE.BoxHelper(undefined, MODEL_SELECT_COLOR);
	me.selectHelper.material.color.setHex(MODEL_SELECT_COLOR); //seems is needed.
	me.selectHelper.visible = false;
	me.grabParent.add(me.selectHelper);
	
	theSyncer.addGrabable(me);
			
	me.setMesh = function(aMesh) {
		me.selectHelper.setFromObject(aMesh);
		me.mesh = aMesh;
		me.grabParent.add(aMesh);
		me.intersectObj = me.mesh;
	}
	
	if(mesh) {
		me.setMesh(mesh);
	}
	
	me.setCutPlanes = function(listOfCutPlanes) {
		me.mesh.traverse( function (node) {
			if(node instanceof THREE.Mesh) {
				if(node.material) {
					var materialArray;
					if(node.material instanceof THREE.MeshFaceMaterial || node.material instanceof THREE.MultiMaterial) {
						materialArray = node.material.materials;
					}
					else if(node.material instanceof Array) {
						materialArray = node.material;
					}
					if(materialArray) {
						materialArray.forEach(function (mtrl, idx) {
							mtrl.clippingPlanes = listOfCutPlanes;
							mtrl.clipShadows = true;
						});
					}
					else {
						node.material.clippingPlanes = listOfCutPlanes;
						node.material.clipShadows = true;
					}
				}
			}			
		});
	}
	
	me.setMatrix = function(matrix) {
		if(matrix) { //is not the same object?
			me.grabParent.matrix.copy(matrix);
			me.grabParent.matrix.decompose(me.grabParent.position, me.grabParent.quaternion, me.grabParent.scale);
		}// else got haxed by wandcontrol so no need to update
		
		//some child classes need to intercept this call, so keep matrix optional. cutplane grabable needs this
		grabSignal.emit('setMatrixCalled', me);
	}
	
	me.startHighlightPossible = function() {
		me.isHighlighted = true;
		if(!me.isSelected) {
			me.selectHelper.material.color.setHex(MODEL_SELECT_COLOR);
			me.selectHelper.visible = true;
		}
	}

	me.stopHighlightPossible = function() {
		me.isHighlighted = false;
		if(!me.isSelected) {
			me.selectHelper.visible = false;
		}
	}
	
	me.setIsSelected = function (isSelected) {
		if(isSelected) {
			me.selectHelper.material.color.setHex(MODEL_GRAB_COLOR)
			me.selectHelper.visible = true;
			me.isSelected = true;
		}
		else {
			me.selectHelper.material.color.setHex(MODEL_SELECT_COLOR);
			me.isSelected = false;
			if(!me.isHighlighted) {
				me.selectHelper.visible = false;
			}
		}
		
	}
	
	me.startGrab = function() {
		me.isGrabbed = true;
		grabSignal.emit('startGrab', me);
	}

	me.stopGrab = function() {
		me.isGrabbed = false;
		grabSignal.emit('stopGrab', me);
	}
	
	me.destroy = function() { //used by inherating classes like cutplane
	}
	
	return me;
}

var GrabableNetworkSyncer = function(viewerSocket) {
	var me = this;
	me.grabableMap = {};
	me.viewerSocket = viewerSocket;
	
	me.onStartGrab = function(graby) {
		me.viewerSocket.emit('mirror', {msgID: 'grabableStartGrab', grabableID: graby.id});
	}
	
	me.onStopGrab = function(graby) {
		me.viewerSocket.emit('mirror', {msgID: 'grabableStopGrab', grabableID: graby.id});
	}
	
	me.registerForLocalEvents = function() {		
		grabSignal.on('startGrab', me.onStartGrab);
		grabSignal.on('stopGrab', me.onStopGrab);
	}
	
	me.registerForLocalEvents();
	
	me.unregisterForLocalEvents = function() {		
		grabSignal.removeListener('startGrab', me.onStartGrab);
		grabSignal.removeListener('stopGrab', me.onStopGrab);
	}
	
	//on reflect unregister listener, then apply, then register?
	me.onReflect = function(data) {
		me.unregisterForLocalEvents();
		if('grabableStartGrab' == data.msgID) {
			var grabable = me.grabableMap[data.grabableID];
			grabable.startGrab();
		}
		else if('grabableStopGrab' == data.msgID) {
			var grabable = me.grabableMap[data.grabableID];
			grabable.stopGrab();
		}
		else if('grabbableState' == data.msgID) {
			var grabable = me.grabableMap[data.modelID];
			if(data.isHighlighted) {
				grabable.startHighlightPossible();
			}
			else {
				grabable.stopHighlightPossible();
			}
			grabable.setIsSelected(data.isSelected);			
			if(data.isGrabbed) {
				grabable.startGrab();
			}
		}
		
		me.registerForLocalEvents();
	}
	
	me.viewerSocket.on('reflect', me.onReflect)
	
	me.addGrabable = function(graby) {
		me.grabableMap[graby.id] = graby;
	}
	
	return me;
}


exports.initNetworkSyncer = function(viewerSocket) {
	theSyncer = GrabableNetworkSyncer(viewerSocket);
}

})(this.Grabable = {});