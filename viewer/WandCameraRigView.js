
(function(exports) {

var ORBIT_TARGET_BALL_SIZE_FACTOR = .2;

//todo move into server for one less network hop to other viewers.
function WandCameraRigView(wandModel, cameraRig, viewer, headPose, tS) {
	var _this = {};
	_this.wandModel = wandModel;
	_this.rig = cameraRig;
	_this.viewer = viewer;
	_this.headPose = headPose;
	_this.targetSphere = tS;
	
	
	_this.onWandTouched = function() {
		if(!_this.wandModel.isTouched) {
			updatePivotPos(true);
			_this.targetSphere.visible = false;			
		}
		else if(_this.wandModel.isFixedPosMode) {
			updatePivotPos(true);			
			_this.targetSphere.visible = true;
		}
	}	
	
	var updatePivotPos = function(updateScale) {
		var centerPos = _this.viewer.getCenterPoint();
		centerPos.applyMatrix4(_this.rig);
		_this.targetSphere.position.copy(centerPos);
		if(updateScale) {
			var scalefactor = centerPos.sub(_this.headPose.pos).length() * ORBIT_TARGET_BALL_SIZE_FACTOR;
			_this.targetSphere.scale.set(scalefactor,scalefactor,scalefactor);
		}
	}
	
	var updatePivotBall = function() {
		updatePivotPos();
		if(_this.wandModel.isTouched) { //onWandTouched false may come in before last scroll/UDP message
			_this.targetSphere.visible = true;
		}
	}
	
	_this.enable = function() {
		_this.wandModel.on('onOrbit', updatePivotBall);
		_this.wandModel.on('onScale', updatePivotBall);
		_this.wandModel.on('onPan', updatePivotBall);
		_this.wandModel.on('onRoll', updatePivotBall);
		_this.wandModel.on('onSetIsTouched', _this.onWandTouched);
	}
	
	_this.disable = function() {
		_this.wandModel.removeListener('onOrbit', updatePivotBall);
		_this.wandModel.removeListener('onScale', updatePivotBall);
		_this.wandModel.removeListener('onPan', updatePivotBall);
		_this.wandModel.removeListener('onRoll', updatePivotBall);
		_this.wandModel.removeListener('onSetIsTouched', _this.onWandTouched);
	}
	
	return _this;
}

exports.WandCameraRigView = WandCameraRigView;

})(this.WandCameraRigView = {});