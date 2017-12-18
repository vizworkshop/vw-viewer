var THREE = require('three');

var ARMARKER_MODEL = require('../shared/ARMarkerModel');
var MARKER_SERVER = require('./MarkerServer');
var FILTER = require('./Filter');
var KFilter = require('./KalmanFilter');

var CONFIDENCE_TO_MOVE_WAND_MIN = .5;
exports.CONFIDENCE_TO_MOVE_WAND_MIN = CONFIDENCE_TO_MOVE_WAND_MIN;
var MAX_PRINTED_CONFIDENCE = .8;

var ORI_FILTER_AMOUNT = .95;
var ANGLE_OUTLIER_THRESHOLD = .01; //.15 .005  .01  .1 //.04   0 t 1
var ANGLE_OUTLIER_WEIGHT_RANGE = ANGLE_OUTLIER_THRESHOLD; // .005  .05

var PREDICT_TIME = 0;

var SAMPLE_LIFETIME = 90 * 1000000; //millisecnods * toNano for keepingin wand.samplehistory
var ORI_SAMPLE_TYPE = 0; var ACCEL_SAMPLE_TYPE = 1; var MARKER_SAMPLE_TYPE = 2;

var POS_SMOOTHING = .2; //.25 How much soothing will occur.  Will lag when too high 
//Lower values are slower to correct towards the raw data and appear smoother, while higher values will correct toward the raw data more quickly.
var POS_CORRECTION = .25; // .05 .25  Correction = [0..1], higher values correct faster and feel more responsive.  How much to correct back from prediction.  Can make things springy.  
var POS_PREDICTION = .9; // Amount of prediction into the future to use. Can over shoot when too high
var POS_JITTER_RADIUS = .02; // .055 The deviation distance in m that defines jitter. Size of the radius where jitter is removed. Can do too much smoothing when too high
var POS_MAX_DEVIATION_RADIUS = .30; // .05 The maximum distance in m that filtered positions are allowed to deviate from raw data.  Size of the max prediction radius. Can snap back to noisy data when too high

var D2R = Math.PI / 180;

var posOffsetPool = new THREE.Vector3();
function filterPos(oldVector, targetVector, percentOfOld) {
	//filter in position
	posOffsetPool.subVectors(targetVector, oldVector);
	posOffsetPool.multiplyScalar(1.0-percentOfOld);
	oldVector.addVectors(oldVector, posOffsetPool);
}

function filterQuat(oldQuat, targetQuat, percentOfOld) {
	oldQuat.slerp(targetQuat, 1.0 - percentOfOld);
}

exports.newWandConnected = function(wand) {
	wand.wandPosFilter = new KFilter.PosKalmanFilter(wand.pos);// = new FILTER.DoubleExponentialFilter(POS_SMOOTHING, POS_CORRECTION, POS_PREDICTION, POS_JITTER_RADIUS, POS_MAX_DEVIATION_RADIUS);
	//wand.wandPosFilter = new FILTER.DoubleExponentialFilter(POS_SMOOTHING, POS_CORRECTION, POS_PREDICTION, POS_JITTER_RADIUS, POS_MAX_DEVIATION_RADIUS);
	//wand.wandPredictFilter = new FILTER.DoubleExponentialFilter(.5, POS_CORRECTION, POS_PREDICTION, POS_JITTER_RADIUS, POS_MAX_DEVIATION_RADIUS);	
	wand.sampleHistory = [];
}
	
function addSample(wand, sample) {
	var sampleHistory = wand.sampleHistory;
	sampleHistory.push(sample);
	sampleHistory.sort(function (a, b) {
		return a.time - b.time;
	});
	
	//find place of this sample, then procees from there to end of history queue
	var foundLatestSample = false;
	var clearHistory = false;
	for(var i = 0; i < sampleHistory.length && !clearHistory; i++) {
		var s = sampleHistory[i];
		if(s.afterFilterState == undefined) {
			foundLatestSample = true;  //process this sample and ones after. 
			if(i > 0) {
				wand.wandPosFilter.setState(sampleHistory[i-1].afterFilterState);
			}
			else if(sampleHistory.length > 1) {
				clearHistory = true; //if timesamples jumped way back in past (wand clock sync drift?), delete (later) samples
				sampleHistory.splice(0, sampleHistory.length-1); //just keep first 1
			}
		}
		if(foundLatestSample) {
			//process
			if(s.type == ORI_SAMPLE_TYPE) {
				wand.rawGyroQuat = s.quat;
				//if no calibration yet, use intial heading as forward, assumes origin screen is vertical/on wall.
				if(wand.gyroOffset.x == 0 && wand.gyroOffset.y == 0 && wand.gyroOffset.z == 0) {// && wand.gyroOffset.w == 0) {
					var yaw180 = new THREE.Euler();
					yaw180.setFromQuaternion(wand.rawGyroQuat);
					yaw180.set(0, yaw180.y + Math.PI, 0);
					wand.gyroOffset.setFromEuler(yaw180);
					wand.gyroOffset.inverse();
				}
				wand.quat.multiplyQuaternions(wand.gyroOffset, wand.rawGyroQuat);
			}
			else if(s.type == ACCEL_SAMPLE_TYPE) {
				var wandAccelWorld = new THREE.Vector3().copy(s.accelLocal);
				wandAccelWorld.applyQuaternion(wand.quat); //puts accel vector into world space	
				wand.wandPosFilter.updateAccel(wandAccelWorld, s.time).toArray(wand.pos);
			}
			else if(s.type == MARKER_SAMPLE_TYPE) {
				processARSample(wand, s.time, s.markersDic, s.shouldCalibrate);
			}
			s.afterFilterState = wand.wandPosFilter.getState();
		}
	}
	//wand.wandPosFilter.predict(PREDICT_TIME).toArray(wand.pos); //todo? tune prediction
	
	if(!clearHistory) { //clean out old samples from queue
		var cutOffTime = sampleHistory[sampleHistory.length-1].time - SAMPLE_LIFETIME;
		var cutOffIndex = 0;
		for(var i = 0; i < sampleHistory.length; i++) {
			if(sampleHistory[i].time < cutOffTime) {
				cutOffIndex = i;
			}
			else {
				break;
			}
		}
		sampleHistory.splice(0, cutOffIndex);
	}
}
	
exports.onOri = function(wand, sample) {
	sample.type = ORI_SAMPLE_TYPE;
	addSample(wand, sample);
}

exports.onWandAccel = function(wand, timestamp, wandAccel) {
	addSample(wand, {type: ACCEL_SAMPLE_TYPE, time: timestamp, accelLocal: wandAccel});
}

//vurforia is z + out of camera.  Wand is z + out of top of phone
var CAMERA_TO_PHONE_ROTATION = new THREE.Matrix4().makeRotationZ(Math.PI/2);
CAMERA_TO_PHONE_ROTATION.multiply( new THREE.Matrix4().makeRotationX(-Math.PI/2) );

var updateMarkersCallback;
exports.setUpdatedMarkersCallback = function (callback){
	updateMarkersCallback = callback;
}

exports.onMarkerSampleQuatCameraMatrix = function(wand, timestamp, markersDic, shouldCalibrate) {
	addSample(wand, {type: MARKER_SAMPLE_TYPE, time: timestamp,
		markersDic: markersDic, shouldCalibrate: shouldCalibrate});
}

var gyroInverseTemp = new THREE.Quaternion();
var newQuatGyroOffset = new THREE.Quaternion();
var tempQuat = new THREE.Quaternion(); 
var markerM = new THREE.Matrix4();
var isInitNewQuatGyroOffset = false;
var processARSample = function(wand, timestamp, markersDic, shouldCalibrate) {
	//sort by confidince
		//update markers
			//if marker is on origin monitor, then no update needed.
			//if on other monitor, then update monitor with new pose
		//update wand
	
	var markers = [];
	for (var key in markersDic) {
		if(key == 'dQuat') {
		}
		else {
			var mthing = {};
			mthing.arObj = ARMARKER_MODEL.getMarker(key);
			if(mthing.arObj === undefined) {
				mthing.arObj = MARKER_SERVER.makeMarker(key);
			}
			mthing.matrix = markersDic[key];
			markers.push(mthing);
		}
	}
		
	markers.sort(function(a, b) {
		if (a.arObj.confidence > b.arObj.confidence) {
			return -1;
		  }
		  if (a.arObj.confidence < b.arObj.confidence) {
			return 1;
		  }
		  return 0;
	});
	
	//var newTargetPos;
	//var newTargetQuatGyroOffset;
	var wandPoseEstimates = [];
	var updatedMarkersList = [];
	
	//first pass to determan wand movmenet filter weighting
	var totalConfidence = 0;
	for (i = 0; i < markers.length; i++){
		var arMarker = markers[i].arObj;
		if(arMarker.confidence > CONFIDENCE_TO_MOVE_WAND_MIN) {	
			totalConfidence += arMarker.confidence;
		}
	}
	for (i = 0; i < markers.length; i++){
		var arMarker = markers[i].arObj;
		if(arMarker.confidence > CONFIDENCE_TO_MOVE_WAND_MIN) {	
			arMarker.moveWandWeight = arMarker.confidence/totalConfidence;
		}
	}

	for (i = 0; i < markers.length; i++){
		var markerSample = markers[i];
		var arMarker = markerSample.arObj;
		
		var m = new THREE.Matrix4();
		for (var j = 0; j < m.elements.length; j++) {
			m.elements[j] = markerSample.matrix[j];
		}
				
		if(wand.cameraRotation) {
			m.multiplyMatrices( new THREE.Matrix4().makeRotationZ(D2R * wand.cameraRotation), m);
		}
		
		var scaleFactor = 1000 / arMarker.sizeMM;
		m.scale(new THREE.Vector3(scaleFactor, scaleFactor, scaleFactor)); //gives position of wand relative to marker
				
		m.getInverse(m);  //wand to maker vector, or maker in wand space.
		
		m.multiply( CAMERA_TO_PHONE_ROTATION ); //rotate from camera to phone/wand system.
		
		
		if(shouldCalibrate
			&& i > 0 && arMarker.confidence < 1  //if not first and not fixed in space confidence.  THus only using first marker for positoin when calibrating
			&& markers[i-1].arObj.confidence > 0  // don't try to calibrate off un-calibrated source
			&& markers[i-1].arObj.id != arMarker.id) { //don't calibrate on identical tags?
			//calibrate marker
			
			var pos = new THREE.Vector3();
			var quat = new THREE.Quaternion();
			var scale = new THREE.Vector3();
			m.decompose(pos, quat, scale);
			
			var wandMatrix = new THREE.Matrix4();
			
			wandMatrix.makeRotationFromQuaternion(wand.quat);
			// if(newTargetPos) {  //Todo incopreate best guess right now so not a frame behinde on calibration.  Maybe not such a good idea.
				// var wandPosCurrently = new THREE.Vector3();
				// wandPosCurrently.fromArray(wand.pos);
				// filterPos(wandPosCurrently, newTargetPos, .95);
				// wandMatrix.setPosition(wandPosCurrently);
			// } else {
				// wandMatrix.elements[12] = wand.pos[0];
				// wandMatrix.elements[13] = wand.pos[1];
				// wandMatrix.elements[14] = wand.pos[2];
			// }
			wandMatrix.elements[12] = wand.pos[0];
			wandMatrix.elements[13] = wand.pos[1];
			wandMatrix.elements[14] = wand.pos[2];
			
			var wandToMarkerMatrix = new THREE.Matrix4(); 
			wandToMarkerMatrix.makeRotationFromQuaternion(quat);
			wandToMarkerMatrix.elements[12] = pos.x;
			wandToMarkerMatrix.elements[13] = pos.y;
			wandToMarkerMatrix.elements[14] = pos.z;
			wandToMarkerMatrix.getInverse(wandToMarkerMatrix);
			
			markerM.multiplyMatrices(wandMatrix, wandToMarkerMatrix);
			
			var markerPos = new THREE.Vector3();
			var markerQuat = new THREE.Quaternion();
			var mscale = new THREE.Vector3();
			markerM.decompose(markerPos, markerQuat, mscale);
			
			if(arMarker.pos.x === 0 && arMarker.pos.y === 0 && arMarker.pos.z === 0) { //dont filter just set
				var newOld = new THREE.Vector3(); //hack for nw.js
				newOld.copy(markerPos);
				arMarker.pos = newOld;
			}
			else {
				var newOld = new THREE.Vector3(); //hack for nw.js does not save functions.  Just calls "arMarker.pos" an object?
				newOld.set(arMarker.pos.x, arMarker.pos.y, arMarker.pos.z);
				arMarker.pos = newOld;
				filterPos(arMarker.pos, markerPos, .99);
			}
			if(arMarker.quat.x === 0 && arMarker.quat.y === 0 && arMarker.quat.z === 0 && arMarker.quat.w === 1) { //dont filter just set
				 arMarker.quat.copy(markerQuat);
			}
			else {
				newOld = new THREE.Quaternion();
				newOld.set(arMarker.quat._x, arMarker.quat._y, arMarker.quat._z, arMarker.quat._w);
				arMarker.quat = newOld;	
				filterQuat(arMarker.quat, markerQuat, .99);
			}			
			if(arMarker.myMonitor == undefined) {  //if not on monitor, cap confidence
				arMarker.confidence = arMarker.confidence * .99 + Math.min(markers[i-1].arObj.confidence, MAX_PRINTED_CONFIDENCE) * .01;
			}
			else {
				arMarker.confidence = arMarker.confidence * .99 + markers[i-1].arObj.confidence * .01;
			}
			
			//update display position from marker pos
			if(arMarker.myMonitor !== undefined && arMarker.myMonitor.poseConfidence <= arMarker.confidence) {
				var markerOffsetFromMonitor = new THREE.Vector3();
				//markerOffsetFromMonitor.fromArray( arMarker.myMonitor.getPosOfPixelInMonitorSpace(arMarker.xPixelPos, arMarker.yPixelPos) );
				markerOffsetFromMonitor = arMarker.myMonitor.getPosOfPixelInMonitorSpace(arMarker.xPixelPos, arMarker.yPixelPos);
				markerOffsetFromMonitor.applyQuaternion(arMarker.myMonitor.quat);
				var targetPos = new THREE.Vector3();
				targetPos.subVectors(arMarker.pos, markerOffsetFromMonitor);
				
				filterPos(arMarker.myMonitor.pos, targetPos, .95);
				filterQuat(arMarker.myMonitor.quat, arMarker.quat, .95);
				var newPoseConfidence = arMarker.myMonitor.poseConfidence * .99 + arMarker.confidence * .01;
				arMarker.myMonitor.setPose(arMarker.myMonitor.pos, arMarker.myMonitor.quat, newPoseConfidence);
			}
			updatedMarkersList.push(arMarker);
		}
		else {  //move wand. Only using first marker to position wand when calibrating
			
			tempQuat._w= arMarker.quat._w; //temp quat for nw.js bug with context?
			tempQuat._x= arMarker.quat._x;
			tempQuat._y= arMarker.quat._y;
			tempQuat._z= arMarker.quat._z;
			markerM.makeRotationFromQuaternion(tempQuat);
			markerM.elements[12] = arMarker.pos.x;
			markerM.elements[13] = arMarker.pos.y;
			markerM.elements[14] = arMarker.pos.z;
			
			m.multiplyMatrices(markerM, m); //put wand in marker space into world space
			
			var wandPos = new THREE.Vector3();
			var wandQuaternionWorld = new THREE.Quaternion();
			var scaley = new THREE.Vector3();
			m.decompose(wandPos, wandQuaternionWorld, scaley);
			wandPoseEstimates.push({newPos: wandPos, wandQuat: wandQuaternionWorld, marker: arMarker});
		}
	}
	
	if(wandPoseEstimates.length > 0) {
		//find confidence of marker samples
		var totalConfidence = 0;
		for(var i = 0; i < wandPoseEstimates.length; i++) {
			//check for outlier.  If roation estimate from vision is off IMU
			//http://math.stackexchange.com/questions/90081/quaternion-distance
			//1−⟨q1,q2⟩2  0 when same, 1 when 180			
			var vQEst = wandPoseEstimates[i].wandQuat.clone();//.normalize();
			var wandQuatNorm = wand.quat.clone();//.normalize();
			//wandQuat.y = vQEst.y; //remove yaw
			wandQuatNorm.normalize();
			vQEst.normalize();
			var innerProduct = wandQuatNorm.x*vQEst.x+wandQuatNorm.y*vQEst.y+wandQuatNorm.z*vQEst.z+wandQuatNorm.w*vQEst.w;
			var angleOff = 1 - (innerProduct*innerProduct);
			var moveWandWeightFactor = 1;
			if(angleOff > ANGLE_OUTLIER_THRESHOLD && !shouldCalibrate) {
				moveWandWeightFactor = Math.max( Math.min( 1 - ( (angleOff-ANGLE_OUTLIER_THRESHOLD) / ANGLE_OUTLIER_WEIGHT_RANGE), 1), 0);
				//console.log('angle off', angleOff, moveWandWeightFactor);
			}
			wandPoseEstimates[i].moveWandConfidince = wandPoseEstimates[i].marker.confidence * moveWandWeightFactor;	
			if(wandPoseEstimates[i].moveWandConfidince > CONFIDENCE_TO_MOVE_WAND_MIN) {	
				totalConfidence += wandPoseEstimates[i].moveWandConfidince;
			}
			else {
				wandPoseEstimates[i].moveWandConfidince = 0;
			}
			
		}
		for (var i = 0; i < wandPoseEstimates.length; i++) {
			if(totalConfidence > 0) {
				wandPoseEstimates[i].moveWandWeight = wandPoseEstimates[i].moveWandConfidince / totalConfidence;
			}
			else {
				wandPoseEstimates[i].moveWandWeight = 0;
			}
			
		}
		//now move wand
		var newTargetPos;
		isInitNewQuatGyroOffset = false;
		for (var i = 0; i < wandPoseEstimates.length; i++) {
			if(wandPoseEstimates[i].moveWandWeight > 0) {
				if(newTargetPos === undefined) {
					newTargetPos = wandPoseEstimates[i].newPos;
				}
				else {
					//old, new, percent of old
					filterPos(newTargetPos, wandPoseEstimates[i].newPos, 1-wandPoseEstimates[i].moveWandWeight);
				}
			}
			if(wandPoseEstimates[i].marker.confidence > CONFIDENCE_TO_MOVE_WAND_MIN) {
				gyroInverseTemp.copy(wand.rawGyroQuat).inverse();
				gyroInverseTemp.multiplyQuaternions(wandPoseEstimates[i].wandQuat, gyroInverseTemp);
				if(!isInitNewQuatGyroOffset) { //first time through, initialize
					isInitNewQuatGyroOffset = true;
					newQuatGyroOffset.copy(gyroInverseTemp);
				}
				else {
					filterQuat(newQuatGyroOffset, gyroInverseTemp, 1/wandPoseEstimates.length); //dont throw out outliers or we never converge to angle under threshold
				}
			}
		}
		if(newTargetPos !== undefined) {
			wand.wandPosFilter.updatePos(newTargetPos, timestamp).toArray(wand.pos);
		}
		if(isInitNewQuatGyroOffset) {
			filterQuat(wand.gyroOffset, newQuatGyroOffset, ORI_FILTER_AMOUNT);
		}
	}
	//return updatedMarkersList;
	updateMarkersCallback(updatedMarkersList);
}

