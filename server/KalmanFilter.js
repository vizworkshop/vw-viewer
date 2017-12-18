var THREE = require('three');
var sylvester = require('sylvester');
var Matrix       = sylvester.Matrix;
var Vector       = sylvester.Vector;

var PROCESS_ACCEL_COVARIANCE = 1; //.0005 Higher is more uncercnty for model.
var POS_SENSOR_COVARIANCE = .0000031557 * 10; //  .0000031557 = 3.1557E-06 .00001444  .00001  .0038 * 2 = .001444
var ACCEL_SENSOR_COVARIANCE = 10.001268356;  //0.001268356  0.00065536  .0256 is rms
var INTERTIAL_HALFLIFE = .1;
var VEL_HALFLIFE = .1;
var ACCEL_HALFLIFE = 5.0;

var R_k_POS = Matrix.create([ [POS_SENSOR_COVARIANCE] ]);  // noise of sensor
var H_k_POS = Matrix.create([ [1, 0, 0] ]);// Describes relationship between model and observation:  sensor = H * state

var R_k_ACCEL = Matrix.create([ [ACCEL_SENSOR_COVARIANCE] ]);  // noise of sensor //Describes noise from sensor.  For pos its meters squared
var H_k_ACCEL = Matrix.create([ [0, 0, 1] ]);// Describes relationship between model and observation:  sensor = H * state

var PosKalmanFilter = function(posArray) {
	this.isNotInititalized = true;
	this.kFList = [];
	for(var i = 0; i < posArray.length; i++) {
		var x_0 = Vector.create([posArray[i], 0, 0]);
		var P_0 = Matrix.I(3); //identity matrix. Initial covariance. Set to 1
		this.kFList.push(new KalmanModel(x_0, P_0, undefined, undefined));
	}
	this.lastTime = 0;
	this.lastPosTime = 0;
	this.accelMag = 0;
	return this;
}
exports.PosKalmanFilter = PosKalmanFilter;

PosKalmanFilter.prototype.init = function(posInit, timestamp) {
	this.lastTime = timestamp;
	this.lastPosTime = timestamp;
	var posArray = [];
	posInit.toArray(posArray);
	for(var i = 0; i < posArray.length; i++) {
		var x_0 = Vector.create([posArray[i], 0, 0]);
		this.kFList[i].x_k = x_0;
	}
	this.isNotInititalized = false;
}

PosKalmanFilter.prototype.makeProcesseNoiseMatrix = function(dt) {
	//Estimation with Applications to Tracking and Navigation, page 272 or 290 equation (6.2.3-8) 	
	var q = PROCESS_ACCEL_COVARIANCE + this.accelMag;
	
	var t5 = (1/20)*Math.pow(dt, 5)*q;
	var t4 = (1/8)*Math.pow(dt, 4)*q;
	var t3 = (1/6)*Math.pow(dt, 3)*q;
	var t33 = (1/3)*Math.pow(dt, 3)*q;
	var t2 = (1/2)*Math.pow(dt, 2)*q;
	var t1 = dt*q;
	
	for(var i = 0; i < this.kFList.length; i++) {
		this.kFList[i].Q_k = Matrix.create([
			[t5,t4,t3], 
			[t4,t33,t2],
			[t3,t2,t1]
		]);
	}
}

PosKalmanFilter.prototype.updatePos = function(newPos, timestamp) {
	if(this.isNotInititalized || (timestamp - this.lastPosTime) / 1000000000 > 1) {
		this.init(newPos, timestamp);
		return newPos;
	}
	
	var deltaT = (timestamp - this.lastTime) / 1000000000; // divide by 1000 million to get seconds divide by a million to get nano to milli

	if(deltaT < 0) {  //got accel that is later than this one arealdy so dont do model calculations again. 
		deltaT = 0; //But does this  favor info from other source concerning vel and accel
		console.log('POS mesurment in past happend.');
	}
	var timeSinceLastTime = (timestamp - this.lastTime) / 1000000000; // 1000000000
	var df = Math.pow(2, -timeSinceLastTime/VEL_HALFLIFE);
	this.lastTime = timestamp;
	this.lastPosTime = timestamp;
	var deltaT2 = deltaT*deltaT;
	
	var posArray = [];
	newPos.toArray(posArray);
	this.makeProcesseNoiseMatrix(deltaT);
	for(var i = 0; i < this.kFList.length; i++) {
		var kf = this.kFList[i];
		kf.F_k = Matrix.create([
			  [1, deltaT, deltaT2*.5],
			  [0, df, deltaT],
			  [0, 0, 1]
		]);
		var z_k = Vector.create([posArray[i]]);	
		
		var KO = new KalmanObservation(z_k, H_k_POS, R_k_POS);
		kf.update(KO);
	}
	return this.getPos();
}


PosKalmanFilter.prototype.updateAccel = function(newAccel, timestamp) {
	
	var updatedPos = new THREE.Vector3();
	
	this.accelMag = newAccel.length();	
	
	if(!this.isNotInititalized) {
		var deltaT;
		if(timestamp > this.lastTime) {
			deltaT = (timestamp - this.lastTime) / 1000000000; // 1000000000 divide by 1000 million to get seconds
			if(deltaT > .5) { //long time since last sample, so reset
				this.isNotInititalized = true;
				return this.getPos();
			}
		}
		else {
			deltaT = 0;
		}
		
		var deltaT2 = deltaT*deltaT;
		
		var timeSincePos = (timestamp - this.lastPosTime) / 1000000000;
		
		var timeSinceLastTime = (timestamp - this.lastTime) / 1000000000;
		var df = Math.pow(2, -timeSinceLastTime/VEL_HALFLIFE) * Math.pow(2, -timeSincePos/INTERTIAL_HALFLIFE);
		var dfAccel = Math.pow(2, -timeSincePos/ACCEL_HALFLIFE);
		this.lastTime = timestamp;
		
		var posArray = [];
		newAccel.toArray(posArray);
		this.makeProcesseNoiseMatrix(deltaT);
		for(var i = 0; i < this.kFList.length; i++) {
			var kf = this.kFList[i];
			kf.F_k = Matrix.create([
				  [1, deltaT, deltaT2*.5],
				  [0, df, deltaT],
				  [0, 0, dfAccel]
				  //[0, 0, 1]
			]);
			// kf.F_k = Matrix.create([
				  // [1, deltaT*df, .5*deltaT2*df],
				  // [0, 1, deltaT],
				  // [0, 0, 1]
			// ]);
			var z_k = Vector.create([posArray[i]]);
			kf.update(new KalmanObservation(z_k, H_k_ACCEL, R_k_ACCEL));
		}
		
	}
	
	return this.getPos();
}

// PosKalmanFilter.prototype.predict = function(deltaT) {
	// var deltaT2 = deltaT*deltaT;
	
	// var updatedPos = new THREE.Vector3();
	// for(var i = 0; i < this.kFList.length; i++) {
		// var kf = this.kFList[i];
		// kf.F_k = Matrix.create([
			  // [1, deltaT, deltaT2*.5],
			  // [0, 1, deltaT],
			  // [0, 0, 1]
		// ]);
		// var x_k_k_ = kf.F_k.x(kf.x_k);
		// arrayToVector(updatedPos, i, x_k_k_.elements[0]);
	// }
	// return updatedPos;
// }



PosKalmanFilter.prototype.getState = function() {
	//console.log('getting satate', this.lastTime);
	var kfStates = [];
	for(var i = 0; i < this.kFList.length; i++) {
		var kf = this.kFList[i];
		kfStates.push({state: kf.x_k.dup(), pMat: kf.P_k.dup()})
	}
	return {kfStateList: kfStates, 
				lastTime: this.lastTime, lastPosTime: this.lastPosTime,
				accelMag: this.accelMag};
}


PosKalmanFilter.prototype.setState = function(state) {
	for(var i = 0; i < this.kFList.length; i++) {
		var kf = this.kFList[i];
		kf.x_k = state.kfStateList[i].state.dup();
		kf.P_k = state.kfStateList[i].pMat.dup();
	}
	this.lastTime = state.lastTime;
	this.lastPosTime = state.lastPosTime;
	this.accelMag = state.accelMag;
}

var updatedPos = new THREE.Vector3();
PosKalmanFilter.prototype.getPos = function() {
	for(var i = 0; i < this.kFList.length; i++) {
		arrayToVector(updatedPos, i, this.kFList[i].x_k.elements[0]);
	}
	return updatedPos;
}

// Copyright (c) 2012 Itamar Weiss
// 
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the "Software"),
// to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense,
// and/or sell copies of the Software, and to permit persons to whom the
// Software is furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
// THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.

var Kalman = {
  version: '0.0.1'
};

var KalmanModel = (function(){

  function KalmanModel(x_0,P_0,F_k,Q_k){
    this.x_k  = x_0;
    this.P_k  = P_0;
    this.F_k  = F_k;
    this.Q_k  = Q_k;
  }
  
  KalmanModel.prototype.update =  function(o){
    this.I = Matrix.I(this.P_k.rows());
    //init
    this.x_k_ = this.x_k;
    this.P_k_ = this.P_k;

    //Predict
    this.x_k_k_ = this.F_k.x(this.x_k_);
    this.P_k_k_ = this.F_k.x(this.P_k_.x(this.F_k.transpose())).add(this.Q_k);
    
	//update
    this.y_k = o.z_k.subtract(o.H_k.x(this.x_k_k_));//observation residual
    this.S_k = o.H_k.x(this.P_k_k_.x(o.H_k.transpose())).add(o.R_k);//residual covariance
    this.K_k = this.P_k_k_.x(o.H_k.transpose().x(this.S_k.inverse()));//Optimal Kalman gain
    this.x_k = this.x_k_k_.add(this.K_k.x(this.y_k));
    this.P_k = this.I.subtract(this.K_k.x(o.H_k)).x(this.P_k_k_);
  }
  
  return KalmanModel;
})();

var KalmanObservation = (function(){

  function KalmanObservation(z_k,H_k,R_k){
    this.z_k = z_k;//observation
    this.H_k = H_k;//observation model
    this.R_k = R_k;//observation noise covariance
  }
  
  return KalmanObservation;
})();



function arrayToVector(vec, index, value) {
	if(index == 0) {
		vec.x = value;
	}
	else if(index == 1) {
		vec.y = value;
	}
	else {
		vec.z = value;
	}
}