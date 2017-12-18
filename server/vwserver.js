var io;

var EventEmitter = require("events").EventEmitter;

var CALIBRATION_DIR = "./calibration";
var HEAD_CALIBRATION_FILE = CALIBRATION_DIR+"/head.json";
var WAND_CALIBRATION_FILE = CALIBRATION_DIR+"/wand.json";
var ARMARKER_CALIBRATION_FILE = CALIBRATION_DIR+"/ARMarkers.json";

var util = require('util')
var fs = require('fs-extra');
var path = require('path');
var express = require('express');
var dgram = require('dgram');
var ipc = require('node-ipc');

var THREE = require('three');

var ARMARKER = require('../shared/ARMarkerModel');
var MARKER_SERVER = require('./MarkerServer');
var ARMARKER_SERVER = require('./armarker_server');
var MONITORS_SERVER = require('./MonitorServer');
var VIEWER_MODEL = require('../shared/ViewerModel');
var WAND_MODEL = require('../shared/WandModel');
var WAND_CAM_CTRL = require('../shared/WandCameraRigControl');
var FILTER = require('./Filter');
var jsonfile = require('jsonfile');

var D2R = Math.PI / 180;

var TRANSLATE_SCALE_FACTOR = .005; //.001
var ROTATION_SPEED = .002;
var PITCH_ROTATION_SPEED = .0005; 

var WAND_TOOL_ROTATION = Math.PI / 4;
var WAND_TOOL_POS = new THREE.Vector3(0, 0, .05);
var HEAD_OFFSET_BEHIND_WAND_Y = .4; //.4
var HEAD_FILTER_AMOUNT = .8; //.8  higher means more filtering, more of old position
var HALF_VERTICAL_FOV_DEFAULT = 20 * D2R;

var WAND_UDP_PORT = 4482;
var socketIOPort;
var serverIPList = []; //filled in at startup with ip address
 
var headDefaultPos = [.25, .27, .6];
var headPose = {pos: new THREE.Vector3().fromArray(headDefaultPos), 
				quat: new THREE.Quaternion(),
				isCalibrated: false
				};

var isNotPackaged = false;
// @ifndef PACKAGED 
isNotPackaged = true;
// @endif 

var DISABLE_ROBOTJS = false;
if(!DISABLE_ROBOTJS) {
	var robot = require("robotjs");
}

var VIEWER_ROOM_NAME = 'viewerRoom';

var monitorManager;
var udpServer;

var worldGrabOffset = new THREE.Matrix4();

var wandToObjectTransform = new THREE.Matrix4();
function startGrab(wand) {
	wand.isGrabbing = true;
}

function stopGrab(wand) {
	wand.isGrabbing = false;
}

function shareGrabOffset(socketObject) {
	var myArr = Array.prototype.slice.call(worldGrabOffset.elements, 0);
	myArr.length = 16;
	
	if(socketObject) {
		socketObject.emit('graboffset', myArr);
	}
	else {
		io.to(VIEWER_ROOM_NAME).emit('graboffset', myArr);
	}
}

//loading files
function shareLoadFile(socketObj, fileURL, modelID) {
	if(socketObj && fileURL != '') {
		//check if .obj file
		var ext = fileURL.substr(fileURL.lastIndexOf('.') + 1).toLowerCase();
		if(ext === 'obj') {
			//if has mtllib line
			const readline = require('readline');
			const fs = require('fs');		
			const rl = readline.createInterface({
				input: fs.createReadStream(modelObjMap[modelID].file)
			});
			var isMTLFound = false;
			var onLine = function (line) {
				if(line.startsWith("mtllib")) {//get name of mtl file and send message to load mtl files too
					var mtlFileName = line.substr(7);
					var modelData = {id: modelID, type: 'objmtl',  objFile: fileURL, mtlFile: mtlFileName};
					socketObj.emit('loadModel', modelData);
					rl.removeListener('line', onLine);
					isMTLFound = true;
				}
			};
			rl.on('line', onLine);
			rl.on('close', function() {
				if(!isMTLFound) {
					socketObj.emit('loadFile', fileURL, modelID);
				}
			});
		}
		else {
			socketObj.emit('loadFile', fileURL, modelID);
		}
	}
}

var wandDictionary = [];
function createNewWand(theSocket) {
	//check if wand already connected by comparing IP addresses and port
	var didWandConnectBefore = false;
	var wandID;
	for(key in wandDictionary) {
		var oldWand = wandDictionary[key];
		if(oldWand.socket.request.connection.remoteAddress === theSocket.request.connection.remoteAddress) {
			didWandConnectBefore = true;
			wandID = key;
			break;
		}
	}	
	if(didWandConnectBefore) {
		wandDictionary[wandID].socket = theSocket;
		wandDictionary[wandID].isCalibrating = false;
		wandDictionary[wandID].isGrabbing = false;
		wandDictionary[wandID].lastQuatSampleTime = 0;
		wandDictionary[wandID].lastAccelSampleTime = 0;
		wandDictionary[wandID].lastPosSampleTime = 0;
		wandDictionary[wandID].needsUpdate = true;
		ARMARKER_SERVER.newWandConnected(wandDictionary[wandID]);
		sendToViewers('wandIsBack', {wid: wandID});
		wandDictionary[wandID].setFixedPosMode(true);
	}	
	else {  //new wand
		var savedWand; //look for file saved wand pos/quatoffset
		for(key in savedWandDic) {
			var oldWand = savedWandDic[key];
			if(oldWand.remoteAddress === theSocket.request.connection.remoteAddress) {
				savedWand = oldWand;
				break;
			}
		}
		var initPos = [0,0,0];
		var initGyroOffset = new THREE.Quaternion();
		if(savedWand) {
			initPos = savedWand.pos;
			initGyroOffset.copy(savedWand.gyroOffset);
			wandID = savedWand.id;
		}
		else { //find free wand ID number
			var isDone = false;
			var wandIDCanidate = 0;
			while(!isDone) {
				if(wandDictionary[wandIDCanidate] || savedWandDic[wandIDCanidate]) {
					wandIDCanidate = wandIDCanidate + 1;
				}
				else {
					isDone = true;
				}
			}
			wandID = wandIDCanidate;
		}
		wandDictionary[wandID] =  { id: wandID, pos: initPos, quat: new THREE.Quaternion(), 
									rawGyroQuat: new THREE.Quaternion(), gyroOffset: initGyroOffset,
									toolPos: new THREE.Vector3(),
									toolQuat: new THREE.Quaternion(),
									onGrabStartQuat: new THREE.Quaternion(),
									isGrabbing: false,
									needsUpdate: true,
									socket: theSocket,
									lastQuatSampleTime: 0,
									lastAccelSampleTime: 0,
									lastPosSampleTime: 0,
									isCalibrating: false,
									cameraRotation: 0,
									model: new WAND_MODEL.WandModel.WandModel(wandID), //todo avoid data duplication with containing obj
								  };								
		wandDictionary[wandID].setFixedPosMode = function(isPosFixed) {
			this.isFixedPosMode = isPosFixed;
			this.model.setIsFixedPosMode(this.isFixedPosMode);
			wandDictionary[wandID].socket.emit("setIsGrabEnabled", !isPosFixed);
			sendToViewers('onIsFixedPosMode', {wI: this.id, isFixed: isPosFixed});
		}
		wandDictionary[wandID].setFixedPosMode(true);		
		wandDictionary[wandID].setIsTouched = function(isTouched) {
			this.model.setIsTouched(isTouched);
			sendToViewers('setIsWandTouched', {wI: this.id, isT: isTouched});
		}		
		ARMARKER_SERVER.newWandConnected(wandDictionary[wandID]);	
		shareWands(io.to(VIEWER_ROOM_NAME));
	}
	updateWand(wandDictionary[wandID]);
	
	theSocket.emit('setWandID', parseInt(wandID));
	theSocket.on('wandCameraRotation', onWandCameraRotation);
	theSocket.on('markerStateQuatCameraMatrix', onMarkerStateQuatCameraMatrix);
	theSocket.on('grabStart', onGrabStart);
	theSocket.on('grabEnd', onGrabStop);
	theSocket.on('calibrate', onWandCalibrate);
	theSocket.on('showScreenMarkers', onShowScreenMarkers);
	theSocket.on('setHeadPos', onSetHeadPos);
	
	theSocket.on('startTouch', onWandStartTouch);
	theSocket.on('endTouch', onWandEndTouch);
	
	if(!DISABLE_ROBOTJS) {
		theSocket.on('moveMouseRelative', onMoveMouseRelative);
		theSocket.on('leftMouseDown', onLeftMouseDown);
		theSocket.on('leftMouseUp', onLeftMouseUp);
		theSocket.on('middleMouseDown', onMiddleMouseDown);
		theSocket.on('middleMouseUp', onMiddleMouseUp);
		theSocket.on('rightMouseDown', onRightMouseDown);
		theSocket.on('rightMouseUp', onRightMouseUp);
		theSocket.on('leftMouseClick', onLeftMouseClick);
		theSocket.on('middleMouseClick', onMiddleMouseClick);
		theSocket.on('rightMouseClick', onRightMouseClick);
		theSocket.on('scrollMouse', onScrollMouse);
		theSocket.on('typed', onTyped);
		theSocket.on('typedBackSpaces', onBackspace);
	}
	theSocket.on('selectUp', onSelectUp);
	theSocket.on('selectDown', onSelectDown);
	theSocket.on('disconnect', function (reason) {
		var wand = wandDictionary[wandID];
		if(wand) {
			sendToViewers('destroyWand', {wid: wandID});
			if(wand.isCalibrating) {
				onWandCalibrate(wand.id, true);//turn off calibration mode
			}
		}
		else {
			console.log("Error try to destory wand that does not exist");
		}
	});
}


var savedWandDic = {};
function loadWandCalibration() {
	try {
		savedWandDic = jsonfile.readFileSync(WAND_CALIBRATION_FILE);
	}
	catch (e) {
		//console.log('Error loading WAND_CALIBRATION_FILE');
	}
	for(key in savedWandDic) {
		var wand = savedWandDic[key];
		wand.gyroOffset = new THREE.Quaternion(wand.gyroOffset._x, wand.gyroOffset._y, wand.gyroOffset._z, wand.gyroOffset._w);
	}
}

function saveWandCalibration() {
	for(key in wandDictionary) {
		var wand = wandDictionary[key];
		savedWandDic[key] = {
			id: key,
			pos: wand.pos, 
			gyroOffset: wand.gyroOffset, 
			remoteAddress: wand.socket.request.connection.remoteAddress};			
	}	
	jsonfile.writeFileSync(WAND_CALIBRATION_FILE, savedWandDic, {spaces: 2}, function (err) {
	  console.error(err);
	});
}

var isCalibrating = false;
function onWandCalibrate(wandID, forceCalibrationOff) {
	var wand = wandDictionary[wandID];
	if(wand === undefined) {
	}
	else {
		if(forceCalibrationOff) {
			isCalibrating = false;
			wand.isCalibrating = false;
		}
		else {
			isCalibrating = true;
			wand.isCalibrating = true;
		}
		setIsMarkersShowing(isCalibrating);
		shareCalibrating(wand);
		if(!isCalibrating) { //when switched off make sure head position gets out there as volatile is used normaly
			shareHeadPose(io.to(VIEWER_ROOM_NAME));
			wand.needsUpdate = true;
			updateWand(wand);
		}
	}
}

function onShowScreenMarkers(wandID, isChecked) {
	var wand = wandDictionary[wandID];
	if(wand === undefined) {
	}
	else {		
		if(isChecked) {
			setIsMarkersShowing(true);
		}
		else {
			setIsMarkersShowing(false);
		}
	}
}

var isHeadPosUpdated = true;
function onSetHeadPos(wandID, isChecked) {
	var wand = wandDictionary[wandID];
	if(wand === undefined) {
	}
	else {
		isHeadPosUpdated = isChecked;
	}
}

function onWandStartTouch(wandID) {
	var wand = wandDictionary[wandID];
	if(wand === undefined) {
	}
	else {
		wand.setIsTouched(true);
	}
}

function onWandEndTouch(wandID) {
	var wand = wandDictionary[wandID];
	if(wand === undefined) {
	}
	else {
		wand.setIsTouched(false);
	}
}

if(!DISABLE_ROBOTJS) {
	robot.setKeyboardDelay(0);
	robot.setMouseDelay(0);
}

var xChangeHistory = 0;
var yChangeHistory = 0;
function applyMouseMovement() {
	if(xChangeHistory || yChangeHistory && !DISABLE_ROBOTJS) {
		var mouse = robot.getMousePos();	
		robot.moveMouse(mouse.x + xChangeHistory, mouse.y + yChangeHistory);
		xChangeHistory = 0;
		yChangeHistory = 0;
	}
}

function onMoveMouseRelative(xChange, yChange) {
	xChangeHistory = xChangeHistory + xChange;
	yChangeHistory = yChangeHistory + yChange;
}

function onLeftMouseDown(wandID) {
	robot.mouseToggle("down", "left");
}
function onLeftMouseUp(wandID) {
	robot.mouseToggle("up", "left");
}
function onMiddleMouseDown(wandID) {
	console.log('middle down')
	robot.mouseToggle("down", "middle");
}
function onMiddleMouseUp(wandID) {
	console.log('middle up')
	robot.mouseToggle("up", "middle");
}
function onRightMouseDown(wandID) {
	robot.mouseToggle("down", "right");
}
function onRightMouseUp(wandID) {
	robot.mouseToggle("up", "right");
}

function onLeftMouseClick(wandID) {
	robot.mouseClick("left");
}
function onMiddleMouseClick(wandID) {
	robot.mouseClick("middle");
	console.log('middle down up')
}
function onRightMouseClick(wandID) {
	robot.mouseClick("right");
}
var scrollRunningValue = 0;
function onScrollMouse(wandID, distance) {
	if(!DISABLE_ROBOTJS) {
		scrollRunningValue = scrollRunningValue + distance * .05
		if(scrollRunningValue > 1) {
			robot.scrollMouse(scrollRunningValue, "down");
			scrollRunningValue = 0;
		}
		else if(scrollRunningValue < -1) {
			robot.scrollMouse(scrollRunningValue, "up");
			scrollRunningValue = 0;
		}
	}
	
}
function onTyped(wandID, string) {
	if(string == "\n") {
		robot.keyTap("enter");
	} 
	else {
		robot.typeString(string);
	}
}
function onBackspace(wandID, backspaceCount) {
	for(var i = 0; i < backspaceCount; i++) {
		robot.keyTap("backspace");
	}
}

function dirtyWand(wand) {
	wand.needsUpdate = true;
}

var lastMousedViewer;
var toolOffset = new THREE.Vector3();
var wandPosPool = new THREE.Vector3();
var wandScalePool = new THREE.Vector3();
var quatGrabOffset = new THREE.Quaternion();
var QUAT_OFFSET = new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 1, 0, 0 ), WAND_TOOL_ROTATION);
function updateWand(wand) {
	if(wand.needsUpdate) {
		wand.needsUpdate = false;		
		if(wand.isFixedPosMode) {
			if(lastMousedViewer) {
				var centerPos = lastMousedViewer.getCenterPoint();
				if(centerPos) {
					wand.toolPos.copy(centerPos);
				}
			}
			wand.toolQuat.copy(wand.quat);
			wand.toolQuat.multiply(QUAT_OFFSET);
		}
		else {
			wandPosPool.fromArray(wand.pos);
			toolOffset.copy(WAND_TOOL_POS);
			toolOffset.applyQuaternion(wand.quat);
			wand.toolPos.copy(toolOffset.add(wandPosPool));
			wand.toolQuat.copy(wand.quat);
			wand.toolQuat.multiply(QUAT_OFFSET);
		}
		
		if(isCalibrating && wand.isCalibrating) {
			if(isHeadPosUpdated) {
				updateHead(wand);
			}
		}
		else {
			emitWand(wand);
		}
		wand.model.localMatrix.makeRotationFromQuaternion(wand.toolQuat);
		wand.model.localMatrix.setPosition(wand.toolPos);
	}
}

var wandMatrix = new THREE.Matrix4();
function emitWand(wand, thSocket) {
	wandMatrix.makeRotationFromQuaternion(wand.toolQuat);
	wandMatrix.setPosition(wand.toolPos);
	if(thSocket === undefined) {
		sendToViewers('wandMatrix', {wid: wand.id, m: wandMatrix.toArray()});
	}
	else {
		thSocket.emit('wandUpdated', {wid: wand.id, m: wandMatrix.toArray()});
	}
}

function shareCalibrating(wand) {
	sendToViewers('wandCalibrate', {wid: wand.id, isCalibrating: wand.isCalibrating});
}

function shareWands(theSocket) {
	for(key in wandDictionary) {
		var wand = wandDictionary[key];
		var wandMatrix = new THREE.Matrix4();
		wandMatrix.makeRotationFromQuaternion(wand.toolQuat);
		wandMatrix.setPosition(wand.toolPos);
		theSocket.emit('createWand', {wid: key, 
										m: wandMatrix.toArray(), 
										isCalibrating: wand.isCalibrating, 
										isFixedPosMode: wand.isFixedPosMode
		});
	}
}

/*Save me: For converting from browser deviceorientation event space to wand space.
		wand.rawGyroQuat.setFromEuler(new THREE.Euler(-data.pitch*D2R, data.yaw*D2R, data.roll*D2R, 'YXZ'));
*/ 

function onWandQuatChange(wand, data) {
	ARMARKER_SERVER.onOri(wand, {time: data.t, quat: new THREE.Quaternion().set(data.z, data.x, data.y, -data.w)});
	dirtyWand(wand);
}

function onWandAccel(wand, accelData) {
	var accelVector = new THREE.Vector3(-accelData.ax, accelData.az, accelData.ay); //android to wand space
	ARMARKER_SERVER.onWandAccel(wand, accelData.t, accelVector);
	dirtyWand(wand);
}

function onOrbit(wand, data) {
	WAND_CAM_CTRL.WandCameraRigControl.orbit(data, cameraRigMatrix, lastMousedViewer, headPose.pos);
	shareCameraRigPose();
	sendToViewers('wandOrbit', data);
}

function onWandScale(wand, data) {
	WAND_CAM_CTRL.WandCameraRigControl.scale(data, cameraRigMatrix, wand.model);
	shareCameraRigPose();
	sendToViewers("wandScale", data);
}

function onWandPan(wand, data) {
	WAND_CAM_CTRL.WandCameraRigControl.pan(data, cameraRigMatrix, lastMousedViewer, headPose.pos);
	shareCameraRigPose();
	sendToViewers("wandPan", data);
}

function onWandRoll(wand, data) {
	WAND_CAM_CTRL.WandCameraRigControl.roll(data, cameraRigMatrix, lastMousedViewer, headPose.pos);
	shareCameraRigPose();
	sendToViewers("wandRoll", data);
}

var viewerModelMap = new Object();
var viewerCount = 0;
function createNewViewer(theSocket) {	
	theSocket.join(VIEWER_ROOM_NAME);
	
	var viewsMarkers = reserveMarkerIDs(1);
	var viewsMarkerIDList = [];
	for(var i = 0; i < viewsMarkers.length; i++) {
		viewsMarkerIDList.push(viewsMarkers[i].id);
	}
	var viewerModel = new VIEWER_MODEL.ViewerModel(viewerCount, monitorManager);
	viewerModel.setMarkerList(viewsMarkerIDList);
	viewerCount = viewerCount + 1;
	viewerModelMap[viewerModel.id] = viewerModel;
	viewerModel.mySocket = theSocket;
	
	theSocket.emit('idAssigned', viewerModel.id);
	theSocket.emit('serverIPAddresses', serverIPList, socketIOPort);
	shareCameraRigPose(theSocket);
	shareHeadPose(theSocket);
	shareIsSystemVisible(theSocket);
	
	shareWands(theSocket); //must be after idAssigned
	
	theSocket.emit('createARMarkerImages', viewsMarkerIDList);
	for (var k in ARMARKER.markerList){
		var marker = ARMARKER.markerList[k];
		if(marker != undefined) {
			theSocket.emit('createMarker', {id: marker.id, pos: marker.pos, quat:marker.quat, confidence: marker.confidence} );  //sending makrer object triggers max call stack
		}
	}
	shareIsMarkersShowing(theSocket);
	monitorManager.sendMonitorList(theSocket);
	shareGrabOffset(theSocket);

	for(key in modelObjMap) {
		var modelObj = modelObjMap[key];
		var filePath = modelObj.file;
		var url = "loadModel/" + key + '/' + filePath.substr(filePath.lastIndexOf('.')).toLowerCase();
		shareLoadFile(theSocket, url, key);
	}
	
	theSocket.on('markerPixelPos', onMarkerPixelPos);
	theSocket.on('screenInfo', onScreenInfo);
	theSocket.on('setScreenPixels', setScreenPixels);
	theSocket.on('updateCameraRig', onUpdateCameraRig);
	theSocket.on('gotFocus', onGotFocus);
	theSocket.on('setNewModelMatrix', onSetNewModelMatrix);
	theSocket.on('toggleBackgroundClicked', onBackgroundClicked);
	theSocket.on('toggleSystemViewClicked', onToggleSystemVisiblity);
	theSocket.on('updateMonitorSizes', onUpdateMonitorSizes);
	theSocket.on('clearModels', onClearModels);
	theSocket.on('requestLoadFile', onRequestLoadFile);
	
	sendToViewers('newConnection'); //does a: ipc.server.broadcast('newConnection');
	
	if(lastMousedViewer == undefined) {
		lastMousedViewer = viewerModel;
		io.to(VIEWER_ROOM_NAME).emit('setLastFocusedViewer', lastMousedViewer.id);
	}
	
	return viewerModel;
}

function destroyViewer(viewer) {
	if(lastMousedViewer == viewer) {
		for (var k in viewerModelMap) { //just get the first one
			lastMousedViewer = viewerModelMap[k];
			io.to(VIEWER_ROOM_NAME).emit('setLastFocusedViewer', lastMousedViewer.id);
			break;
		}
	}
	freeMarkers(viewer.markerIDList);
	delete viewerModelMap[viewer.id];
}

function onUpdateMonitorSizes(screenSizesArray) {
	monitorManager.onUpdateMonitorSizes(screenSizesArray);
}

function onSetNewModelMatrix(modelID, matrixArray) {
	var modelObj = modelObjMap[modelID];
	modelObj.matrix.fromArray(matrixArray);
	io.to(VIEWER_ROOM_NAME).emit('modelMatrixUpdate', modelID, matrixArray)
}


var viewerMatrixTemp = new THREE.Matrix4();
var headOffsetTemp = new THREE.Matrix4();
var headOffsetVectorTemp = new THREE.Vector3();
var scaleNotUsed = new THREE.Vector3();
function setScreenPixels(id, innerScreenY, bottom, innerScreenX, right) {
	var viewerModel = viewerModelMap[id];
	if(viewerModel != undefined) {
		viewerModel.setScreenPixels(innerScreenY, bottom, innerScreenX, right);
		if(!headPose.isCalibrated && id === 0) { //if master viewer
			var centerPos = viewerModel.getCenterPoint();
			var vectorUp = viewerModel.getCenterTopPos();
			vectorUp.sub(centerPos); //vector from center to top of screen
			var headDistanceFromScreen = vectorUp.length() / Math.tan(HALF_VERTICAL_FOV_DEFAULT);
			viewerMatrixTemp.makeRotationFromQuaternion(viewerModel.lastMonitor.quat);
			viewerMatrixTemp.setPosition(viewerModel.getCenterPoint());
			headOffsetTemp.setPosition(headOffsetVectorTemp.set(0, 0, headDistanceFromScreen));
			viewerMatrixTemp.multiply(headOffsetTemp);
			viewerMatrixTemp.decompose(headPose.pos, headPose.quat, scaleNotUsed);
			shareHeadPose();
		}
	}
}


function updateHead(wandObj) {
	var headM = new THREE.Matrix4();
	headM.makeRotationFromQuaternion(wandObj.quat)
	headM.setPosition(new THREE.Vector3().fromArray(wandObj.pos)); //headM.setPosition(wandObj.toolPos);	
	var headOffsetFromWand = new THREE.Matrix4();
	headOffsetFromWand.setPosition( new THREE.Vector3(0, HEAD_OFFSET_BEHIND_WAND_Y, 0) );
	headM.multiply(headOffsetFromWand);
	var targetPos = new THREE.Vector3();
	var targetQuat = new THREE.Quaternion();
	headM.decompose(targetPos, targetQuat, new THREE.Vector3());
	if(headPose.isCalibrated) {
		FILTER.filterPos(headPose.pos, targetPos, HEAD_FILTER_AMOUNT);
		FILTER.filterQuat(headPose.quat, targetQuat, HEAD_FILTER_AMOUNT);
	}
	else { //first time setting head pose
		headPose.pos.copy(targetPos);
		headPose.quat.copy(targetQuat);
		headPose.isCalibrated = true;
	}
	shareHeadPose();
}

var cameraRigMatrix = new THREE.Matrix4();
function onUpdateCameraRig(matrix) {
	for (var i = 0; i < 16; i++) {
		cameraRigMatrix.elements[i] = matrix.elements[i];
	}
	for(key in viewerModelMap) {
		var viewer = viewerModelMap[key];
		if(viewer.mySocket != this) {
			shareCameraRigPose(viewer.mySocket);
		}
	}
}

function shareCameraRigPose(mySocket) {
	var camRigArray = Array.prototype.slice.call(cameraRigMatrix.elements, 0);
	camRigArray.length = 16;
	if(mySocket) {
		mySocket.emit('cameraRigPose', camRigArray);
	}
	else {
		sendToViewers('cameraRigPose', camRigArray);
	}
}

function shareHeadPose(mySocket) {
	if(mySocket) {
		mySocket.emit('pose', {name: 'head', pos: headPose.pos.toArray(), quat: headPose.quat.toArray()});
	} 
	else {
		for(key in viewerModelMap) {
			viewerModelMap[key].mySocket.volatile.emit('pose', {name: 'head', pos: headPose.pos.toArray(), quat: headPose.quat.toArray()});
		}
		
	}
}

function saveHeadCalibration() {
	jsonfile.writeFileSync(HEAD_CALIBRATION_FILE, headPose, {spaces: 2}, function (err) {
		  console.error(err);
		});
}

function loadHeadCalibration() {
	try {
		var obj = jsonfile.readFileSync(HEAD_CALIBRATION_FILE);
	}
	catch (e) {
		//console.log('Exception loading head cal file', e);
	}
	if(obj != undefined && obj.length !== 0) {
		headPose.pos.copy(obj.pos);
		var quatdata = obj.quat;
		headPose.quat.set(quatdata._x, quatdata._y, quatdata._z, quatdata._w);
		headPose.isCalibrated = obj.isCalibrated;
	}
}

var modelCount = 0;
var modelObjMap = new Object();
function addModel(filePath){
	modelObjMap[modelCount] = {matrix: new THREE.Matrix4(), file:filePath};
	var extension = filePath.substr(filePath.lastIndexOf('.') + 1).toLowerCase();
	if(extension == 'stl') {
		modelObjMap[modelCount].matrix.makeRotationX( -Math.PI / 2 );
	}
	var url = "loadModel/" + modelCount + '/' + filePath.substr(filePath.lastIndexOf('.')).toLowerCase();
	shareLoadFile(io, url, modelCount);
	modelCount = modelCount + 1;  //the id
}


function onRequestLoadFile(filePath) {
	addModel(filePath);
}

function onClearModels() {
	modelObjMap = new Object();
	io.to(VIEWER_ROOM_NAME).emit('clearModels');
}

function onGotFocus(viewerID) {
	var sendingViewer = viewerModelMap[viewerID];
	lastMousedViewer = sendingViewer;
	io.to(VIEWER_ROOM_NAME).emit('setLastFocusedViewer', lastMousedViewer.id);
}

var isMarkersShowing = false;
function shareIsMarkersShowing(aSocket) {
	aSocket.emit('setIsMarkersShowing', isMarkersShowing);
}

function setIsMarkersShowing(isShowing) {
	isMarkersShowing = isShowing;
	shareIsMarkersShowing(io.to(VIEWER_ROOM_NAME));
}


var isSystemVisible = false;
function setVisibilityOfSystem(isShowing) {
	isSystemVisible = isShowing;
	shareIsSystemVisible(io.to(VIEWER_ROOM_NAME));
}

function shareIsSystemVisible(socket) {
	socket.emit('isSystemVisible', isSystemVisible);
}

function onToggleSystemVisiblity() {
	isSystemVisible = !isSystemVisible;
	setVisibilityOfSystem(isSystemVisible);
}

function onBackgroundClicked() {
	if(isMarkersShowing) {
		setIsMarkersShowing(false);
	}else {
		setIsMarkersShowing(true);
	}
}

function createReservableMarker(tag, sizeMM) {
	var newMarker = MARKER_SERVER.makeMarker(tag, sizeMM);
	unusedMarkers.push(newMarker);
}

var unusedMarkers = [];
var usedMarkers = [];

function initReserveMarkers() {	
	for(var unusedMarkersIndex = 1; unusedMarkersIndex <= 7; unusedMarkersIndex++) {
		var tag = 'v' + unusedMarkersIndex;
		createReservableMarker(tag, 1);
	}
	createReservableMarker("origin", 1);
}


function reserveMarkerIDs(numberNeeded) {
	var markerIDs = [];
	for (var i = 0; i < numberNeeded; i++) {
		var marker = unusedMarkers.pop();
		if(marker !== undefined) {
			markerIDs.push(marker);
			usedMarkers.push(marker);
		}
	}
	return markerIDs;
}

function freeMarkers(markerList) {
	for (var i = markerList.length-1; i >= 0; i--) {
		var markerID = markerList[i];
		var listIndex = 0;
		for(; listIndex < usedMarkers.length; listIndex++) {
			if(usedMarkers[listIndex].id == markerID) {
				break;
			}
		}
		var markerObj = usedMarkers.splice(listIndex, 1)[0];
		markerObj.confidence = 0;
		unusedMarkers.push(markerObj);
		io.to(VIEWER_ROOM_NAME).emit("updatedMarkers", [{id: markerObj.id, pos: markerObj.pos, quat: markerObj.quat, confidence: markerObj.confidence}] );
	}
}

function onMarkerPixelPos(markerID, x, y, width, height) {
	var marker = ARMARKER.getMarker(markerID);
	var monitor = monitorManager.getMonitorWithPixel(x, y);
	marker.myMonitor = monitor;	
	if(monitor !== undefined) {
		marker.pos = monitor.getPosOfPixel(x, y); //fix marker in place
		marker.quat._w= monitor.quat._w;
		marker.quat._x= monitor.quat._x;
		marker.quat._y= monitor.quat._y;
		marker.quat._z= monitor.quat._z;
		marker.confidence = monitor.poseConfidence;
		marker.xPixelPos = x;
		marker.yPixelPos = y;
		var metersPerPixel = monitor.widthM / monitor.widthPX;
		marker.sizeMM = width * metersPerPixel * 1000;
		io.to(VIEWER_ROOM_NAME).emit("updatedMarkers", [{id: marker.id, pos: marker.pos, quat:marker.quat, confidence: marker.confidence}] );
	}
}

var MarkerUpdateData = function(id, pos, quat, confidence) { 
	this.id = id;
	this.pos = pos;
	this.quat = quat;
	this.confidence = confidence;
}

var vuforiaMatrix = new THREE.Matrix4();
var poolPos = new THREE.Vector3();
var inertialQuat = new THREE.Quaternion();
var poolScale = new THREE.Vector3();
function onMarkerStateQuatCameraMatrix(wand, data) {
	if(wand.setFixedPosMode) {
		for (var key in data.mlist) { //only turn off fixed pos if see non screen marker
			var isMarkerCalibrateMarker = false;
			for(var listIndex = 0; listIndex < usedMarkers.length; listIndex++) { //used markers are screen markers
				if(usedMarkers[listIndex].id == key) {
					isMarkerCalibrateMarker = true;
					break;
				}
			}
			var arObj = ARMARKER.getMarker(key);
			if(wand.isFixedPosMode && !isMarkerCalibrateMarker
				&& arObj !== undefined
				&& arObj.confidence > ARMARKER_SERVER.CONFIDENCE_TO_MOVE_WAND_MIN) {
				wand.setFixedPosMode(false);
				break;
			}
		}
	}
	ARMARKER_SERVER.onMarkerSampleQuatCameraMatrix(wand, data.t, data.mlist, isMarkersShowing);
	dirtyWand(wand);
}

function updatedMarkersCallback(updatedMarkerList) {
	if(updatedMarkerList.length > 0) {
		var listToSend = [];
		for(var i = 0; i < updatedMarkerList.length; i++) {
			var marker = updatedMarkerList[i];
			var markerEnsentals = new MarkerUpdateData(marker.id, marker.pos, marker.quat, marker.confidence);
			listToSend.push(markerEnsentals);
		}		
		io.to(VIEWER_ROOM_NAME).emit("updatedMarkers", listToSend );
	}
}
ARMARKER_SERVER.setUpdatedMarkersCallback(updatedMarkersCallback);


function onWandCameraRotation(wandID, rotation) {
	var wand = wandDictionary[wandID];
	if(wand === undefined) {
	}
	else {
		wand.cameraRotation = rotation
		wand.socket.send('');//hack to get ACK meesages out to stop client from buffering
	}
}

function onGrabStart(wandID) {
	var wand = wandDictionary[wandID];
	if(wand === undefined) {
	}
	else {
		startGrab(wand);
		sendToViewers('wandGrabbing', {wid: wandID, is: true});
		wand.socket.send('');//hack to get ACK meesages out to stop client from buffering
	}
}

function onGrabStop(wandID) {
	var wand = wandDictionary[wandID];
	if(wand === undefined) { //restarted server while wand client still going?
	}
	else {
		stopGrab(wand);
		sendToViewers('wandGrabbing', {wid: wandID, is: false});
		wand.socket.send('');//hack to get ACK meesages out to stop client from buffering
	}
}

function onSelectDown(wandID) {
	var wand = wandDictionary[wandID];
	if(wand === undefined) {
	}
	else {
		sendToViewers('wandSelect', {wid: wandID, is: true});
		wand.socket.send('');//hack to get ACK meesages out to stop client from buffering
	}
}

function onSelectUp(wandID) {
	var wand = wandDictionary[wandID];
	if(wand === undefined) { 
	}
	else {
		sendToViewers('wandSelect', {wid: wandID, is: false});
		wand.socket.send('');//hack to get ACK meesages out to stop client from buffering
	}
}

function onScreenInfo(viewerID, screenArray) {
	monitorManager.onScreenInfo(viewerID, screenArray);
	viewerModelMap[viewerID].updateMonitorFromPixelChange();
}

var vrViewerCount = 0;
function createNewViewerVR(theSocket, requestedID) {	
	theSocket.join(VIEWER_ROOM_NAME);
	var id;
	if(requestedID === undefined) {
		id = 'vr' + vrViewerCount;
	}
	else {
		id = requestedID;
	}
	vrViewerCount = vrViewerCount + 1
	 
	var viewerModel = {id: id, mySocket: theSocket, isSocketIONeeded: false};
	viewerModelMap[viewerModel.id] = viewerModel;
	
	if(requestedID === undefined) { //reconnected, so no need to assign
		viewerModel.mySocket.emit('idAssigned', viewerModel.id);
	}
	shareCameraRigPose(viewerModel.mySocket);
	shareHeadPose(viewerModel.mySocket);
	
	for(key in modelObjMap) {
		var modelObj = modelObjMap[key];
		var filePath = modelObj.file;
		var url = "loadModel/" + key + '/' + filePath.substr(filePath.lastIndexOf('.')).toLowerCase();
		shareLoadFile(viewerModel.mySocket, url, key);
	}
	
	// VR viewer specific stuff
	viewerModel.isSocketIONeeded = true;
	viewerModel.mySocket.on('mirror', function(data) {
		sendToViewers('reflect', data);	
	});
	
	//send wand gyro offset
	var wandOfViewer;
	for(key in wandDictionary) {
		var wandy = wandDictionary[key];
		if(wandy.socket.request.connection.remoteAddress === theSocket.request.connection.remoteAddress) {
			wandOfViewer = wandy;
			break;
		}
	}
	if(wandOfViewer) {
		viewerModel.mySocket.emit('gyroOffset', wandOfViewer.id, 
		wandOfViewer.gyroOffset.toArray(), wandOfViewer.quat.toArray());
	}
}


/**
 * This function is called by server_main.js.
 *
 * @param sio The Socket.IO library
 * @param socket The socket object for the connected client.
 */
exports.newConnection = function(sio, newSocket){
	
	//Wand events
	newSocket.on('wandClientConnected', function () {
		createNewWand(newSocket);
	});
	
	//viewer events
	newSocket.on('viewerClientConnected', function () {
		var viewer = createNewViewer(newSocket);
		newSocket.on('disconnect', function () {
			destroyViewer(viewer);
		});
	});
	
	//ViewerVR
	newSocket.on('viewerVRClientConnected', function () {
		var viewerVR = createNewViewerVR(newSocket);
	});
	newSocket.on('viewerVRClientReConnected', function (requestedID) {
		var viewerVR = viewerVRReconnect(newSocket, requestedID);
	});
	
	
}

function exitHandler() {
	if (!fs.existsSync(CALIBRATION_DIR)){
		fs.mkdirSync(CALIBRATION_DIR);
	}
	saveHeadCalibration();
	saveWandCalibration();
	MARKER_SERVER.saveCalibrations(ARMARKER_CALIBRATION_FILE);
	monitorManager.writeMonitorsFile();
	ipc.server.stop();
}
exports.exitHandler = exitHandler;

function exceptiong(error) {
	var util = require('util');
	util.log('exceptiong');
	util.log(util.inspect(error.stack));
	//exitHandler();
}

function sendToViewers(eventName, data) {
	ipc.server.broadcast(eventName, data);
	for(key in viewerModelMap){
		var viewer = viewerModelMap[key];
		if(viewer.isSocketIONeeded) {
			if(data == undefined || data.mViD != viewer.id){
				viewer.mySocket.emit(eventName, data);
			}
		}
	}
}
	
exports.init = function(app, sio, socketIOPortNumb){
	io = sio;	
	ipc.config.id = 'vwserver'; //for server to window communication
	ipc.config.retry = 1500;
	ipc.config.silent = true;
	
	ipc.serve(function(){
		ipc.server.on('mirror', function(data, tempSocket){ //for viewer to viewer communication
			sendToViewers('reflect', data);			
		});
	});
	
	ipc.server.start();
	
	function processMessage(data, wand) {
		if(wand !== undefined) {
			data.wI = wand.id;
			if(data.id == "wandQuat") {
				onWandQuatChange(wand, data);
			}
			else if(data.id == "accel") {
				onWandAccel(wand, data);
			}
			else if(data.id == "markerState") {
				onMarkerStateQuatCameraMatrix(wand, data);
			}
			else if(data.id == "orbit") {
				onOrbit(wand, data);
			}
			else if(data.id == "scale") {
				onWandScale(wand, data);
			}
			else if(data.id == "pan") {
				onWandPan(wand, data);
			}
			else if(data.id == "roll") {
				onWandRoll(wand, data);
			}
			else if(data.id == "mRel") {
				onMoveMouseRelative(data.x, data.y);
			}
			else if(data.id == "mScr") {
				onScrollMouse(undefined, data.disY)
			}
		}
	}
	
	udpServer = dgram.createSocket('udp4');
	udpServer.bind(WAND_UDP_PORT);
	udpServer.on('message', function (message, remote) {
		var data = JSON.parse(message);
		if(data.id == "agg") {
			var messageList = data.mList;
			//sort tracking messages
			var mIndexi = [];
			var list = [];
			for(var i = 0; i < messageList.length; i++) {
				var messageType = messageList[i].id
				if(messageType == "wandQuat" || messageType == "markerState" || messageType == "accel") {
					mIndexi.push(i);
					list.push(messageList[i]);
				}
			}
			for(var i = list.length-1; i >= 0; i--) {
				for(var j = 1; j <= i; j++) {
					if(list[j-1].t > list[j].t) {
						var newer = list[j-1];
						list[j-1] = list[j]
						list[j] = newer;
					}
					else if(list[j-1].t == list[j].t //preference for wandQuat earlyer
					  && (list[j-1].id == "accel" || list[j-1].id == "markerState") ) {
						var newer = list[j-1];
						list[j-1] = list[j]
						list[j] = newer;
					}
				}				
			}
			for(var i = 0; i < mIndexi.length; i++) {
				messageList[mIndexi[i]] = list[i];
			}			
			var wand = wandDictionary[data.wI];
			for(key in messageList) {
				processMessage(messageList[key], wand);
			}
		}
		else {
			processMessage(data, wandDictionary[data.wI]);
		}
		var wand = wandDictionary[data.wI];
		if(wand !== undefined) {
			updateWand(wand)
		}
		applyMouseMovement(); //if needed
	});	
	
	var os = require('os');
	var ifaces = os.networkInterfaces();
	Object.keys(ifaces).forEach(function (ifname) {
	  var alias = 0;
	  ifaces[ifname].forEach(function (iface) {
		if ('IPv4' !== iface.family || iface.internal !== false) {
		  // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
		  return;
		}
		if (alias >= 1) {
		  // this single interface has multiple ipv4 addresses
		  serverIPList.push({name:ifname + ':' + alias, address:iface.address});
		} else {
		  // this interface has only one ipv4 adress
		  serverIPList.push({name:ifname, address:iface.address});
		}
		++alias;
	  });
	});	
	socketIOPort = socketIOPortNumb;
	
	monitorManager = new MONITORS_SERVER.MonitorManagerServer(io, VIEWER_ROOM_NAME);
	loadHeadCalibration();
	loadWandCalibration();
	MARKER_SERVER.setSocket(io.to(VIEWER_ROOM_NAME));
	MARKER_SERVER.loadCalibrations(ARMARKER_CALIBRATION_FILE);
	
	initReserveMarkers();

	//Handling routes.	
	app.get('/',function(req,res){
		var dir =  path.join(__dirname, '/..');
		res.sendFile(path.join(dir, "viewer/viewer.html"));
	});

	app.post('/api/loadfile', function(req, res, next) {
		res.end("File uploaded.");
		if(req.files.fileToLoad.length === undefined) {
			var findString = '\\server\\uploads';
			var index = req.files.fileToLoad.path.lastIndexOf(findString);
			var cutIndex = index + findString.length + 1;
			var relPath = 'uploads\\' + req.files.fileToLoad.path.substr(cutIndex);
			addModel(relPath);
		}
		for(var i = 0; i < req.files.fileToLoad.length; i++) {
			fileObj = req.files.fileToLoad[i];
			if(fileObj.extension == 'dae' || 
				fileObj.extension == 'stl' ||
				fileObj.extension == 'obj' ||
				fileObj.extension == 'gltf') {
					addModel(fileObj.path);
			}
		}
	});
	
	app.get('/loadModel/*',function(req,res){
		var modelNameNoLoadModel = decodeURIComponent(req.url.substring(11));
		var modelID = parseInt(modelNameNoLoadModel.substring(0, modelNameNoLoadModel.indexOf("/")));//get model id key
		var modelEntry = modelObjMap[modelID];
		var fileName = modelNameNoLoadModel.substring(modelNameNoLoadModel.indexOf("/") + 1);
		
		if(fileName.charAt(0) == ".") {
			res.sendFile(modelEntry.file);
			console.log("load model requested", modelNameNoLoadModel);
		}
		else {
			var baseDir = path.dirname(modelEntry.file);
			res.sendFile(fileName, { root : baseDir}, function (err) {
				if (err) {
				  console.log(err);
				  res.status(err.status).end();
				}
			  });
		}		
	});
	
	app.get('/android',function(req,res){
		var dir =  path.join(__dirname, '/..');
		res.sendFile(path.join(dir, "wand/android.apk"));
	});
	
	app.use(express.static(path.join(__dirname, "../viewer")));
	app.get('/vr', function(req,res){
		var dir =  path.join(__dirname, '/..');
		res.sendFile(path.join(dir, "viewer/vr.html"));
	});
	
}

