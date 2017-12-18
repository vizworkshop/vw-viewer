var THREE = require('three');

function filterPos(oldVector, targetVector, percentOfOld) {
	//filter in position
	var posOffset = new THREE.Vector3();
	posOffset.subVectors(targetVector, oldVector);
	posOffset.multiplyScalar(1.0-percentOfOld);
	oldVector.addVectors(oldVector, posOffset);
}

exports.filterPos = filterPos;

function filterQuat(oldQuat, targetQuat, percentOfOld) {
	oldQuat.slerp(targetQuat, 1.0 - percentOfOld);
}

exports.filterQuat = filterQuat;

var DoubleExponentialFilter = function(smoothingValue, correctionValue, predictionValue, jitterRadiusValue, maxDeviationRadiusValue) {
	this.smoothing = smoothingValue;
	this.correction = correctionValue;
	this.prediction = predictionValue;
	this.jitterRadius = jitterRadiusValue;
	this.maxDeviationRadius = maxDeviationRadiusValue;
	this.dataHistory = DoubleExponentialData();
	return this;
}
exports.DoubleExponentialFilter = DoubleExponentialFilter;

DoubleExponentialFilter.prototype.getState = function() {
	//console.log('getting satate', this.lastTime);
	return {rawPos: new THREE.Vector3().copy(this.dataHistory.rawPos), 
				filteredPos:  new THREE.Vector3().copy(this.dataHistory.filteredPos), 
				trend:  new THREE.Vector3().copy(this.dataHistory.trend), 
				frameCount: this.dataHistory.frameCount};
}

DoubleExponentialFilter.prototype.setState = function(state) {
	this.dataHistory.rawPos.copy(state.rawPos);
	this.dataHistory.filteredPos.copy(state.filteredPos);
	this.dataHistory.trend.copy(state.trend);
	this.dataHistory.frameCount = state.frameCount;
}

DoubleExponentialFilter.prototype.updatePos = function(observedPos) {
	var filteredPos = new THREE.Vector3();
	var trend = new THREE.Vector3();
	var diffVec = new THREE.Vector3();
	var diffMag;
	if(this.dataHistory.frameCount == 0) {
		filteredPos.copy(observedPos);
	}
	else if(this.dataHistory.frameCount == 1) {
		filteredPos.addVectors(observedPos, this.dataHistory.rawPos);
		filteredPos.multiplyScalar(.5);
	} else {
		// First apply jitter filter
		diffVec.subVectors(filteredPos, this.dataHistory.filteredPos);
		diffMag = Math.abs(diffVec.length());
		if(diffMag <= this.jitterRadius) {
			filteredPos.addVectors(observedPos.clone().multiplyScalar(diffMag / this.jitterRadius), this.dataHistory.filteredPos.clone().multiplyScalar( 1-(diffMag / this.jitterRadius) ));
		}
		else {
			filteredPos.copy(observedPos);
		}
		//double exponential smoothing filter
		var guessFromTrend = this.dataHistory.filteredPos.clone().add(this.dataHistory.trend);
		filteredPos.addVectors(filteredPos.multiplyScalar(1 - this.smoothing), guessFromTrend.multiplyScalar(this.smoothing));
	}	
	diffVec.subVectors(filteredPos, this.dataHistory.filteredPos);//find trend
	trend.addVectors(diffVec.multiplyScalar(this.correction),  this.dataHistory.trend.multiplyScalar(1 - this.correction));
	
	var predictionOffset = trend.clone().multiplyScalar(this.prediction);
	var predictedPos = new THREE.Vector3().addVectors(filteredPos, predictionOffset);
	// Check that we are not too far away from raw data
	diffVec.subVectors(predictedPos, observedPos);
	diffMag = Math.abs(diffVec.length());
	if(diffMag > this.maxDeviationRadius) { //average observed and predicted
		var clampedPredictOffset = predictedPos.multiplyScalar(this.maxDeviationRadius / diffMag);
		var observedComponet = observedPos.clone().multiplyScalar(1.0 - (this.maxDeviationRadius / diffMag));
		predictedPos.addVectors(predictedPos, observedComponet);
	}
	
	this.dataHistory.rawPos = observedPos;
	this.dataHistory.filteredPos = filteredPos;
	this.dataHistory.trend = trend;
	this.dataHistory.frameCount = this.dataHistory.frameCount + 1;
	
	return predictedPos;
}

DoubleExponentialFilter.prototype.predict = function(time) {
	var predictionOffset = this.dataHistory.trend.clone().multiplyScalar(this.prediction);
	var predictedPos = new THREE.Vector3().addVectors(this.dataHistory.filteredPos, predictionOffset);
	// Check that we are not too far away from raw data
	var diffVec = new THREE.Vector3();
	diffVec.subVectors(predictedPos, this.dataHistory.rawPos);
	diffMag = Math.abs(diffVec.length());
	if(diffMag > this.maxDeviationRadius) { //average observed and predicted
		var clampedPredictOffset = predictedPos.multiplyScalar(this.maxDeviationRadius / diffMag);
		var observedComponet = this.dataHistory.rawPos.clone().multiplyScalar(1.0 - (this.maxDeviationRadius / diffMag));
		predictedPos.addVectors(predictedPos, observedComponet);
	}
	return predictedPos;
}

DoubleExponentialFilter.prototype.updateAccel = function(accel, time) {
	return this.predict();
}

var DoubleExponentialData = function() {
	this.rawPos = new THREE.Vector3();
	this.filteredPos = new THREE.Vector3();
	this.trend = new THREE.Vector3();
	this.frameCount = 0;
	return this;
}



