
function startViewer(serverAddress) {
	
var ORBIT_TARGET_BALL_SIZE_FACTOR = .2;
var TARGET_SPHERE_RADIUS = .05;

var ARMARKER_MODEL = require('../shared/ARMarkerModel');
var VIEWER_MODEL = require('../shared/ViewerModel');

var NEAR_CLIP_DISTANCE = .1;  //in camera rig space
var INITAL_FAR_CLIP_DISTANCE = 100;  //changes based on scene size

var WALK_MOVE_SPEED = .8;
var WALK_TURN_SPEED = Math.PI / 8; 

var SKY_MESH_SIZE = 450000;
var BACKGROUND_NEAR_CLIP = SKY_MESH_SIZE * .2;
var BACKGROUND_FAR_CLIP = SKY_MESH_SIZE * 1.2;

var HEMI_LIGHT_LUMASITY = .9; //.5
var HEMI_LIGHT_GROUND_LUMASITY = .95; //.5

var gui = require('nw.gui');

var renderingContainer = document.getElementById("renderingSpace");

var isHighQualityOn;
var postprocessing = {enabled: true, renderMode : 0};

var onRenderFcts= [];
var renderer = null;

var clearColor;
if(localStorage.getItem("clearColorSetting")) {
	clearColor = new THREE.Color(localStorage.getItem("clearColorSetting"));
}
else {
	clearColor = new THREE.Color( 0xd0d0cd ); //default to gray
}

var isWalkNavMode;
if(localStorage.getItem("navigationMode")) {
	isWalkNavMode = localStorage.getItem("navigationMode") == 'true';
}
else {
	isWalkNavMode = false;
}


var effectComposer = null;
var renderPass = null;
var ssaoPass = null;
var camera = {};
var backgroundScene = {};
var globalScene = {};
var worldRoot = {};
var loadedModelGroup = {};
var modelsBoundingBox = new THREE.Box3();
var modelsBoundingSphere = new THREE.Sphere();
var modelToWorldRootOffset = new THREE.Vector3();

var modelBoxParentInverse = new THREE.Matrix4();
var modelBoxOffset = new THREE.Matrix4();
var movedBoundingBox = new THREE.Box3();

var system3DRoot;
var headPose = { pos : new THREE.Vector3(), quat : new THREE.Quaternion(), 
				posLocal : new THREE.Vector3(), quatLocal : new THREE.Quaternion()};
var hemiLight;
var sunLight;
var SUN_LIGHT_DIRECTION = (new THREE.Vector3(1, 1, 0)).normalize();
var sky;
var skydomeUniforms;

var shinyThing = {};
var shinyThingId;
var isShinyGone = false;
var localWandMatrix = new THREE.Matrix4();

var viewerID;

var isStatsVisible = true;
var stats;
var controls;
var orbitObject;
var targetSphere;


var cameraRigMatrix = new THREE.Matrix4();
var cameraRig;
var head;
var orbitOffsetToCameraRig = new THREE.Matrix4();
var distnaceToHead;

var modelObjMap = new Object();
var grabGeometryList = [];

var nwWindow = gui.Window.get();
nwWindow.on('close', function() {
	if(socket) {
		socket.disconnect(); // keep events from coming in and trigering accessing of window.* objects which are no loger valid.
	}  
	if(ipc) {
		removeIPCListeners(); // keep events from coming in and trying to create webglrenderer
	}
	if(viewersSocket) {
		viewersSocket.removeAllListeners(); // keep events from coming in and trying to create webglrenderer
	}
	Grabable.grabSignal.removeAllListeners();	
	nwWindow.close(true);
});

var IO = require('../node_modules/socket.io-client'); //../node_modules/ needed for nwjs zip package.
var socket = IO(serverAddress);
var viewersSocket = new EventEmitter();

//in nw.js this is in shared node context, so shared between windows.  Thus ipc.disconnect in one windows affects all.
var ipc = require('../node_modules/node-ipc'); //../node_modules/ needed for nwjs zip package.
ipc.config.id   = 'hello';
ipc.config.silent = true;

var ipcListenderMap = {}; //local storage of listener for this window context to remove when window closes
function addIPCCallback(eventName, functionHandle) {
	ipc.of.vwserver.on(eventName, functionHandle);
	ipcListenderMap[eventName] = functionHandle;
}

function removeIPCListeners() {
	for (var key in ipcListenderMap) {
	  if (ipcListenderMap.hasOwnProperty(key)) {
		ipc.of.vwserver.unSubscribe(key, ipcListenderMap[key]);
	  }
	}
}

ipc.connectTo(
	'vwserver',
	function(){
		addIPCCallback(
			'wandMatrix',
			function(data){
				updateWand(data);
			}
		);		
		addIPCCallback(
			'destroyWand', 
			function(data){
				destroyWand(data);
			}
		);
		addIPCCallback(
			'wandIsBack', 
			function(data){
				wandIsBack(data);
			}
		);		
		addIPCCallback(
			'wandGrabbing', 
			function(data){
				onIsWandGrabbing(data);
			}
		);		
		addIPCCallback(
			'wandSelect', 
			function(data){
				onWandSelecting(data);
			}
		);		
		addIPCCallback(
			'wandCalibrate', 
			function(data){
				onWandCalibrate(data);
			}
		);		
		addIPCCallback(
			'onIsFixedPosMode', 
			function(data){
				onWandIsFixedPosMode(data);
			}
		);		
		addIPCCallback(
			'setIsWandTouched', 
			function(data){
				onSetIsWandTouched(data);
			}
		);		
		addIPCCallback(
			'wandOrbit', 
			function(data){
				onWandOrbit(data);
			}
		);
		addIPCCallback(
			'wandPan', 
			function(data){
				onWandPan(data);
			}
		);
		addIPCCallback(
			'wandScale', 
			function(data){
				onWandScale(data);
			}
		);		
		addIPCCallback(
			'wandRoll', 
			function(data){
				onWandRoll(data);
			}
		);		
		addIPCCallback(
			'cameraRigPose', 
			function(data){
				onCameraRigMatrix(data);
			}
		);	
		
		addIPCCallback(
			'reflect', 
			function(data){
				if(data.mViD != viewerID) {
					viewersSocket.emit('reflect', data);
				}
			}
		);		
		addIPCCallback(
			'newConnection', 
			function(data){
				if(isMasterViewerInit && isMasterViewer) {
					shareState();
				}
			}
		);
	}
);



function shareState() {
	viewersSocket.emit('mirror', {msgID: 'WorldMatrix', worldMatrix: worldRoot.matrix});
	viewersSocket.emit('mirror', {msgID: 'setIsHighQualityOn', isEnabled: isHighQualityOn});
	viewersSocket.emit('mirror', {msgID: 'setClearColor', newColor: clearColor});
	viewersSocket.emit('mirror', {msgID: 'setIsWalkModeOn', isEnabled: isWalkNavMode});
	for(key in modelObjMap) {
		var modelObj = modelObjMap[key];
		syncModelPose(modelObj);
		viewersSocket.emit('mirror', {msgID: 'grabbableState', modelID: key, 
												isHighlighted: modelObj.isHighlighted,
												isSelected: modelObj.isSelected,
												isisGrabbed: modelObj.isGrabbed});
	}
	for(key in wandDictionary) {
		var wand = wandDictionary[key];
		viewersSocket.emit('mirror', {msgID: 'wandInit', wandID: key, initInfo: wand.model.getInitInfo()});
	}
}
viewersSocket.on('newConnection', shareState);  //side effect is exsiting viewers get this set again if new one joins

viewersSocket.on('reflect', function(data) {
	if(data.msgID == 'WorldMatrix') {
		for (var i = 0; i < 16; i++) {
			worldRoot.matrix.elements[i] = data.worldMatrix.elements[i];
		}
		worldRoot.matrix.decompose(worldRoot.position, worldRoot.quaternion, worldRoot.scale);
		worldRoot.vizworkshopUpdate();
	}
	else if(data.msgID == 'setModelMatrix') {
		onUpdateModelMatrix(data.modelID, data.matrix);
	}
	else if(data.msgID == 'wandInit') {		
		if(wandDictionary[data.wandID] == undefined) {
			createWand(data.wandID);
			var grabblable = null;
			if(data.initInfo.grabbedModelID != undefined) {
				grabblable = getGrabable(data.initInfo.grabbedModelID);
			}
			var selectedModel = data.initInfo.selectedModelID !== undefined ? 
				getGrabable(data.initInfo.selectedModelID) : null;
			var intersectedModel = data.initInfo.intersectedID !== undefined ? 
				getGrabable(data.initInfo.intersectedID) : null;
			wandDictionary[data.wandID].model.init(data.initInfo, grabblable, selectedModel, intersectedModel);
		}
	}
	else if(data.msgID == 'newConnection') {
		if(isMasterViewerInit && isMasterViewer) {
			shareState();
		}
	}
	else if(data.msgID == 'setIsHighQualityOn') {
		setIsHighQualityOn(data.isEnabled);
	}
	else if(data.msgID == 'setClearColor') {
		setClearColor(data.newColor);
	}
	else if(data.msgID == 'setIsWalkModeOn') {
		setNavMode(data.isEnabled);
	}
	else if(data.msgID == 'exitFullscreen') {
		if(isMasterViewer && isFullScreen) {
			goFullscreen(); //turn off
		}
	}
});

viewersSocket.on('mirror', function(data) {
	data.mViD = viewerID;
	ipc.of.vwserver.emit('mirror', data);
});

Grabable.initNetworkSyncer(viewersSocket);


//Mouse and keyboard control code follows
var orbitObjectMatrix = new THREE.Matrix4();
function startCameraClick() {
	isControlInputStarted = true;
	var targetPos = viewerModel.getCenterPoint();
	targetPos.applyMatrix4(cameraRigMatrix);
	
	var vectorUp = viewerModel.getCenterTopPos();
	vectorUp.applyMatrix4(cameraRigMatrix);
	vectorUp.sub(targetPos);
	
	vectorUp.normalize();
	orbitObject.up.copy(vectorUp);
	orbitObject.position.copy(headPose.pos);
	
	//distance between targetSphere and head for new pivot point or target pos
	distnaceToHead = targetPos.clone().sub( headPose.pos ).length();
	
	targetSphere.position.copy(targetPos);		
	controls.target.copy( targetPos );
	orbitObject.lookAt(targetPos);
	
	controls.target0.copy(targetPos);
	
	controls.position0.copy(headPose.pos);
	controls.up0.copy(vectorUp);
	
	//calc offset for cameraRigMatrix.  
	//Must be after controls.update to have proper orbitObject.quaternion
	orbitObjectMatrix.makeRotationFromQuaternion(orbitObject.quaternion);
	orbitObjectMatrix.setPosition(orbitObject.position);
	orbitObjectMatrix.getInverse(orbitObjectMatrix);
	orbitOffsetToCameraRig.multiplyMatrices(orbitObjectMatrix, cameraRigMatrix);
	
	targetSphere.visible = true;
	var scale = distnaceToHead * ORBIT_TARGET_BALL_SIZE_FACTOR;
	targetSphere.scale.set(scale,scale,scale);
}

function controlChange(){
	orbitObject.updateMatrix();
	cameraRigMatrix.multiplyMatrices(orbitObject.matrix, orbitOffsetToCameraRig);
	cameraRigUpdated(false);
			
	var targetPos = viewerModel.getCenterPoint();
	targetPos.applyMatrix4(cameraRigMatrix);
	targetSphere.position.copy(targetPos);
}

function controlEnd() {	
	var targetPos = viewerModel.getCenterPoint();
	targetPos.applyMatrix4(cameraRigMatrix);
	targetSphere.position.copy(targetPos);
	targetSphere.visible = false;
	turnOffControlInput = true;
}

var turnOffControlInput = false;
var isControlInputStarted = false;
function updateControl(delta) {
	if(controls && isControlInputStarted) {
		controls.update(delta);
	}
	if(turnOffControlInput) {
		isControlInputStarted = false;
		turnOffControlInput = false;
	}
}


function createControl() {
	var targetPos = viewerModel.getCenterPoint();
	if(targetPos === undefined) {
		console.log("Trying to create control but monitor not set yet for viewer")
		return;
	}	
	targetPos.applyMatrix4(cameraRigMatrix);		
	var vectorUp = viewerModel.getCenterTopPos();
	vectorUp.applyMatrix4(cameraRigMatrix);
	vectorUp.sub(targetPos);
	
	vectorUp.normalize();
	orbitObject.up.copy(vectorUp);
	orbitObject.position.copy(headPose.pos);
	orbitObject.lookAt(targetPos);
		
	if(isWalkNavMode) {
		isControlInputStarted = true;
		controls = new THREE.FlyControlsDesktop( orbitObject );
		controls.rollSpeed = WALK_TURN_SPEED;
		controls.domElement = renderingContainer;
		controls.autoForward = false;
		controls.dragToLook = true;
		controls.setChangedCallback(controlChange);
		calculateOffsetToOrbit();
	}
	else {
		controls = new THREE.TrackballControls(orbitObject, renderingContainer, targetPos);
		controls.noRoll = true;
		controls.panSpeed = .7 //.5 default is 0.3
		controls.rotateSpeed = 2.0;
		controls.staticMoving = true; //if false, then need to check for delayed changes overrighting server camerarig for mouse wheel or other windows
		controls.noZoom = true; 
		controls.addEventListener('start', startCameraClick);	
		controls.addEventListener('change', controlChange);
		controls.addEventListener('end', controlEnd);
	}
}

//todo have perminant trackballcontrols object and remove this hack
var onMousedown = function() {
	if(controls === undefined){
		createControl();
	}
}
window.addEventListener('mousedown', onMousedown, true);

function calculateOffsetToOrbit() {
	var targetPos = viewerModel.getCenterPoint();
	if(targetPos) { //may not be intialized
		targetPos.applyMatrix4(cameraRigMatrix);
		var vectorUp = viewerModel.getCenterTopPos();	
		vectorUp.applyMatrix4(cameraRigMatrix);
		vectorUp.sub(targetPos);
		vectorUp.normalize();
		orbitObject.up.copy(vectorUp);
		orbitObject.position.copy(headPose.pos);
		orbitObject.lookAt(targetPos);
		orbitObjectMatrixTemp.makeRotationFromQuaternion(orbitObject.quaternion); //todo just copy matrix
		orbitObjectMatrixTemp.setPosition(orbitObject.position);
		orbitObjectMatrixTemp.getInverse(orbitObjectMatrixTemp);
		orbitOffsetToCameraRig.multiplyMatrices(orbitObjectMatrixTemp, cameraRigMatrix);
		if(controls && controls.movementSpeed) {
			controls.movementSpeed = WALK_MOVE_SPEED * cameraRig.scale.z //assume uniform scale
		}
		
	}
}

function resetControls() {
	if(controls && !isWalkNavMode) { //hack as I don't know how trackballcontrols works
		controls.dispose();
		controls.enabled = false;
		controls = undefined;
	}
	else {		
		calculateOffsetToOrbit();
	}
}

function setNavMode(isWalkMode) {
	if(isWalkNavMode !== isWalkMode){ //if not the same mode
		if(controls) {
			controls.dispose();
			controls.enabled = false;
			controls = undefined;
		}
		isWalkNavMode = isWalkMode;
		createControl();
	}
	if(isMasterViewer) {
		if(isWalkNavMode) {
			toggleNavModeButton.innerHTML = "Orbit movement";
		}
		else {
			toggleNavModeButton.innerHTML = "WASD + Mouse movement";
		}
		localStorage.setItem("navigationMode", isWalkNavMode);
	}
}

var toggleNavModeButton = document.getElementById("toggleNavMode");
function onToggleNavModeButton() {
	setNavMode(!isWalkNavMode);
	viewersSocket.emit('mirror', {msgID: 'setIsWalkModeOn', isEnabled: isWalkNavMode});
}
toggleNavModeButton.onclick = onToggleNavModeButton;

function onMouseWheel(event) { // start, update and end event order is wrong 
	event.preventDefault();
	event.stopPropagation();
	var delta = 0;
	if ( event.wheelDelta !== undefined ) { // WebKit / Opera / Explorer 9
		delta = event.wheelDelta;
	} else if ( event.detail !== undefined ) { // Firefox
		delta = - event.detail;
	}	
	if(viewerModel) {
		var target = viewerModel.getCenterPoint();
		if(target) {  //maybe not intialized yet
			target.applyMatrix4(cameraRigMatrix);			
			var grabPos = new THREE.Vector3().setFromMatrixPosition(cameraRigMatrix);
			var wandToGrabPos = grabPos.sub(target);
			var factor = (-delta * .0005) + 1;
			wandToGrabPos.multiplyScalar(factor);
			cameraRigMatrix.scale(new THREE.Vector3(factor, factor, factor));			
			wandToGrabPos.add(target);
			cameraRigMatrix.setPosition(wandToGrabPos);			
			cameraRigUpdated();
		}
	}
}
document.addEventListener('mousewheel', onMouseWheel, true);	


function initRenderer() {
	globalScene = new THREE.Scene();
	
	worldRoot = new THREE.Object3D();
	worldRoot.vizworkshopUpdate = onWorldRootUpdated;
	globalScene.add(worldRoot);
	
	loadedModelGroup = new THREE.Object3D();
	loadedModelGroup.name = 'loadedModelGroup';
	worldRoot.add(loadedModelGroup);
	
	cameraRig = new THREE.Object3D();
	globalScene.add(cameraRig);
	
	head = new THREE.Object3D();
	cameraRig.add(head);
	
	camera = new THREE.Camera();
	head.add(camera); //must have camera position at head for specularity to look right
	backgroundCamera = new THREE.Camera();
	head.add(backgroundCamera);
	
	targetSphere = new THREE.Object3D();
	var radius = TARGET_SPHERE_RADIUS;
	var curve = new THREE.EllipseCurve( 0, 0, radius, radius, 0, 2 * Math.PI -.001, false); 
	var points = curve.getPoints( 20 );
	var geometry = new THREE.BufferGeometry().setFromPoints( points );
	var material = new THREE.LineBasicMaterial( { color : 0x00FF00, linewidth : 1} ); // 8484FF
	material.depthWrite = false;
	material.depthTest = false;
	material.transparent = true;
	var ellipse = new THREE.Line( geometry, material );
	ellipse.renderOrder = 1;
	ellipse.rotateOnAxis(new THREE.Vector3().set(1, 0, 0), Math.PI / 2);
	targetSphere.add(ellipse);
	
	material = new THREE.LineBasicMaterial({ color : 0x0000FF, linewidth : 1}); // 8484FF
	material.depthWrite = false;
	material.depthTest = false;
	material.transparent = true;
	var line = new THREE.Line( geometry, material );
	line.renderOrder = 1;
	targetSphere.add(line);
	
	geometry = new THREE.SphereGeometry(TARGET_SPHERE_RADIUS, 16, 16); //.005
	material = new THREE.MeshBasicMaterial({color: 0xFFFFFF});
	material.opacity = .3
	material.transparent = true;
	var sphere = new THREE.Mesh(geometry, material);
	targetSphere.add(sphere);
	
	targetSphere.visible = false;
	globalScene.add(targetSphere);
	
	
	system3DRoot = new THREE.Object3D();
	ARMARKER_3D_VIEW.setupMarkerView(system3DRoot);
	MONITOR_3D_VIEW.setupView(system3DRoot);	
	
	sunLight = new THREE.DirectionalLight(0xffffff, .5);
	sunLight.position.copy(SUN_LIGHT_DIRECTION);
	sunLight.castShadow = true;
	sunLight.shadow.shadowDarkness = .3;
	sunLight.shadow.bias = -0.005;
	sunLight.shadow.mapSize.x = 1024;
	sunLight.shadow.mapSize.y = 1024;
	
	worldRoot.add( sunLight );
	worldRoot.add( sunLight.target );	
	
	hemiLight = new THREE.HemisphereLight();
	hemiLight.color.setHSL( 0.6, .75, HEMI_LIGHT_LUMASITY );
	hemiLight.intensity = .7;
	globalScene.add( hemiLight ); 
	
	// SKYDOME
	backgroundScene = new THREE.Scene();
	skyGroup = new THREE.Object3D();
	backgroundScene.add( skyGroup );	
	sky = new THREE.Sky();
	skyGroup.add( sky.mesh );
	sky.mesh.material.depthTest = false;
	// Sun
	var sunSphere = new THREE.Mesh(
		new THREE.SphereBufferGeometry( 20000, 16, 8 ),
		new THREE.MeshBasicMaterial( { color: 0xffffff } )
	);
	sunSphere.visible = false;
	skyGroup.add( sunSphere );
	sky.uniforms.bottomColor.value.set(clearColor);		
	var distance = 400000;
	var uniforms = sky.uniforms;
	uniforms.turbidity.value = 10;
	uniforms.rayleigh.value = 2;
	uniforms.luminance.value = 1;
	uniforms.mieCoefficient.value = 0.005;
	uniforms.mieDirectionalG.value = 0.8;
	sunSphere.position.copy(SUN_LIGHT_DIRECTION);
	sunSphere.position.multiplyScalar(distance);
	sky.uniforms.sunPosition.value.copy( sunSphere.position );
			
	stats = new Stats();
	stats.domElement.style.position = 'absolute';
	stats.domElement.style.right = '10px';
	stats.domElement.style.top = '5px';
	stats.domElement.style.zIndex = 100;
	toggleFramerateShowButton(); //turn stats off
		
	orbitObject = new THREE.Object3D();	
	
	// init renderer
	setIsHighQualityOn(true); //calls createRenderer
	setClearColor(clearColor);
	window.addEventListener('resize', resizeRenderer, false);
	
	onRenderFcts.push(updateControl);
		
	GRABMODELS.setup(grabGeometryList, camera, headPose.pos, renderingContainer, cameraRig, syncModelPose, modelObjMap);
	onRenderFcts.push(GRABMODELS.update);
	
	updateModelGroup();
}

function createWandController(wandModel, key) {
	var wandController;
	if(isMasterViewerInit) { //might have to wait until viewer ID assigned
		if(isMasterViewer) {
			wandDictionary[key].controller = new WandController.WandMasterController(viewersSocket, wandModel, worldRoot, modelObjMap, grabGeometryList);
		}
		else {
			wandDictionary[key].controller = new WandController.WandController(viewersSocket, wandModel, worldRoot, modelObjMap);
		}
	}
}

var wandDictionary = [];
function createWand(key) {
	var wandModel = new WandModel.WandModel(key);
	var wandView = new WandView.WandView(wandModel, modelObjMap);
	globalScene.add(wandView.wandGroup);
	var camRigView = new WandCameraRigView.WandCameraRigView(wandModel, cameraRigMatrix, viewerModel, headPose, targetSphere);
	if(hasFocus) {
		camRigView.enable();
	}
	wandDictionary[key] = {model: wandModel, view: wandView, cameraRigView: camRigView};
	createWandController(wandModel, key);
}

function destroyWand(data) {
	var wand = wandDictionary[data.wid];
	if(wand) {
		wand.model.disable();
	}
	else {
		console.log('Error: destory wand that does not exist');
	}
}


function wandIsBack(data) {
	var wand = wandDictionary[data.wid];
	if(wand) {
		wand.model.enable();
	}
	else {
		console.log('Error: Tried to turn on wand that does not exist in wand Dic.');
	}
}

var oldPos = new THREE.Vector3();
var newPos = new THREE.Vector3();
function updateWand(data) {
	if(isMasterViewerInit) {
		var wand = wandDictionary[data.wid];
		if(wand != undefined) {
			var wandModel = wand.model;
			oldPos.setFromMatrixPosition(wandModel.localMatrix);
			wandModel.localMatrix.fromArray(data.m);
			wandModel.matrix.multiplyMatrices(cameraRigMatrix, wandModel.localMatrix);
			wandModel.matrixUpdated();
			newPos.setFromMatrixPosition(wandModel.localMatrix);
			if(!oldPos.equals(newPos)) {  //most updates are just for rotation.
				updatePerspective();//to keep wand in view, update far frustum
			}
		}
	}
}

function updateAllWands() {
	for(key in wandDictionary) {
		var wand = wandDictionary[key].model;
		wand.matrix.multiplyMatrices(cameraRigMatrix, wand.localMatrix);
		wand.matrixUpdated();
		wand.update(); //doing this to avoid 1 frame delay when mouse moves.
	}
	updatePerspective();//to keep wand in view, update far frustum
}


onRenderFcts.push(function () {
	for(key in wandDictionary) {
		wandDictionary[key].model.update();
	}
});

function onIsWandGrabbing(data) {
	var wand = wandDictionary[data.wid];
	if(wand) {
		wand.model.setIsGrabbing(data.is); //probably better to hand this to controller
	}
}
function onWandSelecting(data) {
	var wand = wandDictionary[data.wid];
	if(wand) {
		wand.model.setIsSelecting(data.is); //probably better to hand this to controller
	}
}



var wentFullscreenAutomaticaly = false;
function onWandCalibrate(data) {
	var wand = wandDictionary[data.wid];
	if(wand) {
		wand.model.onCalibrate(data.isCalibrating);
		if(isMasterViewer) {
			if(data.isCalibrating && !isFullScreen) {
				goFullscreen();
				wentFullscreenAutomaticaly = true;
			}
			else if(!data.isCalibrating && isFullScreen && wentFullscreenAutomaticaly) {
				goFullscreen();
			}
		}
	}
}

function onWandIsFixedPosMode(data) {
	var wand = wandDictionary[data.wI];
	if(wand) {
		wand.model.setIsFixedPosMode(data.isFixed);
	}
}

function onSetIsWandTouched(data) {
	var wand = wandDictionary[data.wI];
	if(wand) {
		wand.model.setIsTouched(data.isT);
	}
}

function onWandOrbit(data) {
	var wand = wandDictionary[data.wI];
	if(wand) {
		wand.model.onOrbit(data);
	}
}

function onWandPan(data) {
	var wand = wandDictionary[data.wI];
	if(wand) {
		wand.model.onPan(data);
	}
}

function onWandRoll(data) {
	var wand = wandDictionary[data.wI];
	if(wand) {
		wand.model.onRoll(data);
	}
}

function onWandScale(data) {
	var wand = wandDictionary[data.wI];
	if(wand) {
		wand.model.onScale(data);
	}
}

function onIsSystemVisible(isShowing) {
	system3DRoot.visible = isShowing;
}
socket.on('isSystemVisible', onIsSystemVisible);

function toggleSystemView() {
	socket.emit("toggleSystemViewClicked");
}


function setClearColor(color) {
	clearColor.set(color);
	renderer.setClearColor(clearColor);
	var hsl = clearColor.getHSL();
	hemiLight.groundColor.setHSL(hsl.h, hsl.s, HEMI_LIGHT_GROUND_LUMASITY);
	sky.uniforms.bottomColor.value.set(color);
}

var colorPickerElement = $('#backgroundColorPicker').colorpicker({ format: 'hex', 
	color: clearColor.getHexString(), inline: true, container: '#backgroundColorPicker'});
colorPickerElement.on('changeColor', function (e) {
	var hexcolor = e.color.toHex();
	setClearColor(hexcolor);
	viewersSocket.emit('mirror', {msgID: 'setClearColor', newColor: hexcolor});
	localStorage.setItem("clearColorSetting", hexcolor);
});

var setBackgroundButton = document.getElementById("setBackgroundButton");
function onSetBackgroundColorButton() {
	$('#backgroundModal').modal();
	$('#backgroundModal').data('bs.modal').$backdrop.css('background-color','transparent');  //set to transparent so we don't gray out back
}
setBackgroundButton.onclick = onSetBackgroundColorButton;

var framerateShowButton = document.getElementById("framerateShow");
function toggleFramerateShowButton() {
	isStatsVisible = !isStatsVisible;
	if(isStatsVisible) {
		framerateShowButton.innerHTML = "Framerate hide";
		stats.domElement.style.visibility = "visible";
	}
	else {
		framerateShowButton.innerHTML = "Framerate show";
		stats.domElement.style.visibility = "hidden";
	}
}
framerateShowButton.onclick = toggleFramerateShowButton;


function setIsHighQualityOn(isEnabled) {
	if(isHighQualityOn != isEnabled) {  //do nothing if already on
		isHighQualityOn = isEnabled;
		if(isHighQualityOn) {
			toggleShaderButton.innerHTML = "Visual quality show low";
		}
		else {
			toggleShaderButton.innerHTML = "Visual quality show high";
		}
		createRenderer();
	}
}

var toggleShaderButton = document.getElementById("toggleShaderEffects");
function onToggleShaderButton() {
	setIsHighQualityOn(!isHighQualityOn);
	viewersSocket.emit('mirror', {msgID: 'setIsHighQualityOn', isEnabled: isHighQualityOn});
}
toggleShaderButton.onclick = onToggleShaderButton;

initRenderer();  //todo should probably only init this when viewer is init


socket.on('wandUpdated', function(data){
	updateWand(data);
	
})

var orbitObjectMatrixTemp = new THREE.Matrix4();
function cameraRigUpdated(isControlOffsetCalcNeeded, rebroadcast) {
	cameraRigMatrix.decompose(cameraRig.position, cameraRig.quaternion, cameraRig.scale);
	updateHead();
	updateAllWands();
	CutPlane.needsUpdate = true;
	
	if(isControlOffsetCalcNeeded === undefined || isControlOffsetCalcNeeded) { //default is true
		calculateOffsetToOrbit();
	}
	if(rebroadcast === undefined || rebroadcast) { //default is true
		socket.emit('updateCameraRig', cameraRigMatrix);
	}
}

function onCameraRigMatrix(camRigMatrix) {
	for (var i = 0; i < camRigMatrix.length; i++) {
		cameraRigMatrix.elements[i] = camRigMatrix[i];
	}
	cameraRigUpdated(true, false);
}

socket.on('cameraRigPose', onCameraRigMatrix);

function updateHead() {
	headPose.pos.copy(headPose.posLocal).applyMatrix4(cameraRigMatrix);
	var parentQuat = new THREE.Quaternion().setFromRotationMatrix(cameraRigMatrix);
	headPose.quat.copy(parentQuat.multiply(headPose.quatLocal));
	
	skyGroup.position.copy(headPose.pos);
	skyGroup.scale.setFromMatrixScale(cameraRigMatrix);
	
	updatePerspective();
}

socket.on('pose', function(d){
	var name = d.name;
	var pos = d.pos;
	var quat = d.quat;
	if(name == 'head') {
		headPose.posLocal.fromArray(pos);
		headPose.quatLocal.set(quat[0], quat[1], quat[2], quat[3]);
		
		head.position.fromArray(pos);
		//head.quaternion.set(quat[0], quat[1], quat[2], quat[3]); //not used by anything yet and would need to change camera parent
		
		updateHead();
	}	
  });
  

function arrayToMatrix(array, matrix) {
	if(matrix == null) {
		matrix = new THREE.Matrix4();
	}
	for (var i = 0; i < array.length; i++) {
		matrix.elements[i] = array[i];
	}
	return matrix;
}


function onWorldRootUpdated() {	
	skyGroup.rotation.copy(worldRoot.rotation);	
	hemiLight.position.copy( hemiLight.up ).applyQuaternion( worldRoot.quaternion );	
	CutPlane.needsUpdate = true;
	updatePerspective();
}

var grabOffsetMatrix = new THREE.Matrix4();

function getScreenPixels() {
	var borderWidth = (window.outerWidth - window.innerWidth) / 2;  //hack guessing x pixel "chrome" boarder thickness
	var innerScreenX = window.screenX + borderWidth;
	var innerScreenY = (window.outerHeight - window.innerHeight - borderWidth) + window.screenY;
	var bottom = innerScreenY + window.innerHeight;
	var right = innerScreenX + window.innerWidth;
	return [innerScreenY, bottom, innerScreenX, right];
}

function updateScreenPixels() {
	var pixels = getScreenPixels(); //innerScreenY, bottom, innerScreenX, right
	socket.emit("setScreenPixels", viewerID, pixels[0],  pixels[1], pixels[2], pixels[3]);
	viewerModel.setScreenPixels(pixels[0],  pixels[1], pixels[2], pixels[3]);
	updatePerspective();
	if(markerList) {
		for (var i = 0; i < markerList.length; i++) {
			var marker = markerList[i];
			if(marker.pixelWidth) {  //have to wait for image to load
				setMarkerPixelSize(marker, markerImage);
				var x =  marker.pixelWidth / 2 + pixels[2];
				var y =  marker.pixelHeight / 2 + pixels[0];
				socket.emit("markerPixelPos", marker.id, x, y, marker.pixelWidth, marker.pixelHeight);
			}
		}
	}
}

var isPerspectiveDirty = true;
function updatePerspective() {
	isPerspectiveDirty = true;
}

var offsetMatrix = new THREE.Matrix4();
var modelCenterWorld = new THREE.Vector3();
var posVector_updateP = new THREE.Vector3();
function realUpdatePerspective() {
	if(viewerModel) {
		//add in current worldRoot position as wand may have moved it
		modelCenterWorld.copy(modelToWorldRootOffset);
		modelCenterWorld.add(worldRoot.position);
		//far clip calc: scene distance to head + scene radius
		var far = headPose.pos.distanceTo(modelCenterWorld) + modelsBoundingSphere.radius;
		//fit in orbit ball
		var sphereRadius = targetSphere.scale.x * TARGET_SPHERE_RADIUS;
		var orbitSphereDistance = headPose.pos.distanceTo(targetSphere.position) + sphereRadius;		
		far = Math.max(far, orbitSphereDistance);
		//fit in wands
		for(key in wandDictionary) {
			var wandModel = wandDictionary[key].model;
			posVector_updateP.setFromMatrixPosition(wandModel.matrix);
			var wandSize = wandModel.length * wandModel.matrix.getMaxScaleOnAxis();
			var wandDistance = headPose.pos.distanceTo(posVector_updateP) + wandSize;
			far = Math.max(far, wandDistance);
		}
		if(effectComposer !== null) {
			var worldNear = NEAR_CLIP_DISTANCE * cameraRig.scale.z;
			ssaoPass.uniforms[ 'cameraNear' ].value = worldNear;		
			ssaoPass.uniforms[ 'cameraFar' ].value = far;
		}
		
		var farInCameraRig = far / cameraRig.scale.z;  //put in cameraRig space from world space
		var perspectiveMatrix = viewerModel.computePerspective(headPose.posLocal, NEAR_CLIP_DISTANCE, farInCameraRig);
		if(perspectiveMatrix) { //calc background camera frustum
			//undo head/camera offset from camera rig because computePerspective returns in camera rig space.
			offsetMatrix.setPosition(head.position);
			perspectiveMatrix.multiplyMatrices(perspectiveMatrix, offsetMatrix);
			camera.projectionMatrix.copy(perspectiveMatrix);
			perspectiveMatrix = viewerModel.computePerspective(headPose.posLocal, BACKGROUND_NEAR_CLIP, BACKGROUND_FAR_CLIP)
			perspectiveMatrix.multiplyMatrices(perspectiveMatrix, offsetMatrix);
			backgroundCamera.projectionMatrix.copy(perspectiveMatrix);
		}
	}
}

function setMarkerPixelSize(marker, imageElement) {
	if(imageElement.offsetWidth > imageElement.offsetHeight) {
		if(imageElement.offsetWidth > imageElement.width) {
			marker.pixelWidth = imageElement.offsetWidth;
		}
		else {
			marker.pixelWidth = imageElement.width;
		}
		marker.pixelHeight = imageElement.height;
	}
	else {
		if(imageElement.offsetHeight > imageElement.height) {
			marker.pixelHeight = imageElement.offsetHeight;
		}
		else {
			marker.pixelHeight = imageElement.height;
		}
		marker.pixelWidth = imageElement.width;
	}
}

var markerList, markerImage;
function createARMarkerImages(markerIDList) {
	markerList = [];
	var marker = new ARMARKER_MODEL.Marker(markerIDList[0]);
	var fileName;
	if(marker.id.startsWith("MarkerID")) {
		fileName = "./marker_img/" + marker.id + ".png"
	}
	else if(marker.id.startsWith("v")) {
		fileName = "./marker_img/" + marker.id + ".png"
	}
	else {
		fileName = "./marker_img/" + marker.id + ".png"
	}
	
	var element = document.getElementById('markerHolder');	
	marker.domElement = element;
	marker.domElement.style.visibility = "hidden";
	
	markerImage = new Image();
	element.appendChild(markerImage);
	function getWidthAndHeight() {
		setMarkerPixelSize(marker, this);
		updateScreenPixels();
	}
	markerImage.onload = getWidthAndHeight;
	markerImage.src = fileName;	
	markerList.push(marker);
}
socket.on('createARMarkerImages', createARMarkerImages);
	

function onSetIsMarkersShowing(isShowing) {
	if(markerList) {
		for (var i = 0; i < markerList.length; i++) {
			var marker = markerList[i];
			if(isShowing) {
				marker.domElement.style.visibility = "visible";
				system3DRoot.visible = true;
			}
			else {
				marker.domElement.style.visibility = "hidden";
				system3DRoot.visible = false;
			}
		}
	}
}
socket.on('setIsMarkersShowing', onSetIsMarkersShowing);

socket.on('connect', function () {
	socket.emit('viewerClientConnected');
});

socket.on('connect_error', function (error) {
	console.log("error connected");
});

ARMARKER_3D_VIEW.registerClientNetowrkListeners(socket);
MONITOR_3D_VIEW.registerClientNetworkListeners(socket);
MONITOR_SIZE_CONTROL.setup(socket, MONITOR_3D_VIEW.getMM());

var screenConfigForm = document.getElementById("screenConfigForm-body");
var setupPageButton = document.getElementById("showSetupPage");
function showConfigureScreens() {
	screenConfigForm.innerHTML = MONITOR_SIZE_CONTROL.getHtml();
	MONITOR_SIZE_CONTROL.showQRCodes();
	$('#screenConfigFormModal').modal();
}
setupPageButton.onclick = showConfigureScreens;

$('#screenConfigFormModal').on('hide.bs.modal', function (e) {
	MONITOR_SIZE_CONTROL.sendSizes();
})

socket.on('isMissingMonitorCalibrationFile', function () {
	if(isMasterViewer) {
		showConfigureScreens();
	}
})


// VR Viewer Screen
var showVRControlScreenButton = document.getElementById("showVRControlScreen");
function showVRControlScreen() {
	$('#vr-control-screen').modal();
}
showVRControlScreenButton.onclick = showVRControlScreen;

var vrControlScreenBody = document.getElementById("vr-control-screen-body");

var onServerIPAddressesSetupVRViewerModal = function (liosty, portNumbery) {
	ipAddressList = liosty;
	portNumber = portNumbery;
	var html = "";
	if(ipAddressList) {
		var appHTML = '<p>To view the scene on a WebVR compatable device, open one of the web addresses below in the WebVR browser.</p>'; 
		appHTML = appHTML + '<p>For Google Cardboard VR: Identify the network connection shared between the phone and this computer below.  Then scan the QR Code or type the web address into the phone\'s web browser.  Google Chrome browser is recommended.</p>';
		
		appHTML = appHTML + '<table class="table">';
		
		appHTML = appHTML + '<tr>';
		for(var i = 0; i < ipAddressList.length; i++) {
			var ipObj = ipAddressList[i];
			var rowHTML =  '<th>' + ipObj.name + '</th>';
			appHTML = appHTML + rowHTML;
		}
		appHTML = appHTML + '</tr>';
		appHTML = appHTML + '<tr>';
		for(var i = 0; i < ipAddressList.length; i++) {
			var ipObj = ipAddressList[i];
			var rowHTML =  '<td>http://' + ipObj.address + ':' + portNumber + '/vr</td>';
			appHTML = appHTML + rowHTML;
		}
		appHTML = appHTML + '</tr>';
		
		appHTML = appHTML + '<tr>';
		for(var i = 0; i < ipAddressList.length; i++) {
			var ipObj = ipAddressList[i];
			var rowHTML =  '<td><div id="appaddressqrcodeVR' + i +'"></div></td>';
			appHTML = appHTML + rowHTML;
		}
		appHTML = appHTML + '</tr> </table>';
		html = html + appHTML;
	}
	
	else {
		html = html + '<p>Error:  We have not gotten network adapter information yet.  Try closing this dialog then opening again.</p>'
	}
	vrControlScreenBody.innerHTML = html;	
	if(ipAddressList) { 
		for(var i = 0; i < ipAddressList.length; i++) {
			var ipObj = ipAddressList[i];
			var address = 'http://' + ipObj.address + ':' + portNumber + '/vr'
			new QRCode(document.getElementById("appaddressqrcodeVR"+i), {//how to pass in just created elment to move this code up?
				text: address,
				width: 128,
				height: 128});
		}
	}
}
socket.on('serverIPAddresses', onServerIPAddressesSetupVRViewerModal);

function onViewerMonitorSet() {
	updateScreenPixels();
	setNavMode(isWalkNavMode); //from saved setting
	createControl();
	resetControls();
}

var viewerModel = new VIEWER_MODEL.ViewerModel(undefined, MONITOR_3D_VIEW.getMM(), onViewerMonitorSet);

var isMasterViewerInit = false;
var isMasterViewer;

socket.on('idAssigned', function (id) {
	viewerID = id;
	if(viewerID == 0) {
		isMasterViewer = true;
		gui.Screen.Init();
		socket.emit('screenInfo', id, gui.Screen.screens);
		socket.emit('requestLoadFile', '.shinyThing');
		document.body.appendChild( stats.domElement );
		onRenderFcts.push(function(){
			if(isStatsVisible) {
				stats.update();
			}
		});
		socket.on('createWand', onCreateWand);
		document.getElementById("menuButtons").style.display = "initial"; //"initial" says go to default
		exitFullscreenButton = document.getElementById("exitFullscreenButton");
		exitFullscreenButton.style.display = "none";
		exitFullscreenButton.onclick = function() {
			goFullscreen();
		};		
		onRenderFcts.unshift(checkForMovedWindow); //puts in front of array
	}
	else {
		isMasterViewer = false;		
	}
	updateScreenPixels();
	isMasterViewerInit = true;
	for(key in wandDictionary) {
		createWandController(wandDictionary[key].model, key);
	}
	if(isFocusQueued) {
		isFocusQueued = false;
		onFocus();		
	}
});

function onCreateWand(data) { //only called if master viewer
	var wand = wandDictionary[data.wid];
	if(wand == undefined) {
		createWand(data.wid);
		wand = wandDictionary[data.wid]
	}
	var wandModel = wand.model;
	
	wandModel.setIsFixedPosMode(data.isFixedPosMode);
	wandModel.onCalibrate(data.isCalibrating);
	wandModel.localMatrix.fromArray(data.m);
	wandModel.matrix.multiplyMatrices(cameraRigMatrix, wandModel.localMatrix);
	wandModel.matrixUpdated();
	
	//let other viewers know about wand
	viewersSocket.emit('mirror', {msgID: 'wandInit', wandID: data.wid, initInfo: wand.model.getInitInfo()});

}

socket.on("createMonitor", updateScreenPixels);
socket.on("setMonitorPose", function(id, pos, quat, poseConfidence){
	if(viewerModel.lastMonitor && viewerModel.lastMonitor.id == id) {
		updatePerspective();
	}
});

socket.on("updateMonitorSize", function(id, width, height){  //must be after MONITOR_3D_VIEW.registerClientNetworkListeners(socket);
	if(viewerModel.lastMonitor && viewerModel.lastMonitor.id == id) {
		updateScreenPixels(); //calls updatePerspective();
	}
});

var isJustDoneWithFullscreen = false; //keeps shift from happaning
function handelWindowMoved() {
	if(isMasterViewer && !isFullScreen && !isJustDoneWithFullscreen && viewerModel.lastMonitor) { //dragged window bar
		//move rig to follow dragged window
		//get old center, get new center, find offset with new^-1 * old		
		var oldCenter = viewerModel.getCenterPoint();
		updateScreenPixels();
		var newCenter = viewerModel.getCenterPoint();
		oldCenter.applyMatrix4(cameraRigMatrix);
		newCenter.applyMatrix4(cameraRigMatrix);
		newCenter.negate();
		newCenter.addVectors(newCenter, oldCenter);
		//add to rig
		var offset = new THREE.Matrix4();
		offset.setPosition(newCenter);
		
		cameraRigMatrix.premultiply(offset);
		cameraRigUpdated();
	}
    else {
		updateScreenPixels();
	}
}

window.addEventListener('resize', function(){ handelWindowMoved(); }, false)

var oldX = window.screenX, oldY = window.screenY;
var checkForMovedWindow = function(){
  if(oldX != window.screenX || oldY != window.screenY){  //to detect move of browser
	handelWindowMoved();
	oldX = window.screenX;
	oldY = window.screenY;
  }  
}

var isFullScreen = false;
var exitFullscreenButton;
function goFullscreen() {
	if(isMasterViewer) {
		isFullScreen = !isFullScreen;
		if(isFullScreen) {
			WindowManager.goFullscreen();
			fullscreenLink.innerHTML = "Exit fullscreen";
			exitFullscreenButton.style.display = "initial";
		}
		else {
			WindowManager.leaveFullscreen();
			isJustDoneWithFullscreen = true; //keeps perspective shift from happaning
			setTimeout(function(){ isJustDoneWithFullscreen = false; }, 1000);
			fullscreenLink.innerHTML = "Fullscreen";
			exitFullscreenButton.style.display = "none";
		}
	}
}
var fullscreenLink = document.getElementById("fullscreenLink");

fullscreenLink.onclick = function() {
	wentFullscreenAutomaticaly = false;
	goFullscreen();
};

function onKeyDown(e) {
	if (e.keyCode == 27) { // escape key maps to keycode `27`
		if(isFullScreen && isMasterViewer) {
			goFullscreen();//toggle it off
		}
		else {
			viewersSocket.emit('mirror', {msgID: 'exitFullscreen'});
		}
	}
}

window.addEventListener('keydown', onKeyDown, false);

function resetView() {	
	var bbox = new THREE.Box3().setFromObject(loadedModelGroup);
	var boundingSphere = bbox.getBoundingSphere();
	
	var centerPos = viewerModel.getCenterPoint();
	var vectorUp = viewerModel.getCenterTopPos();
	vectorUp.sub(centerPos);
	centerPos.sub(headPose.posLocal); //finds distance between head and screen
	var fov = Math.atan(vectorUp.length() / centerPos.length());
	var objectSize = boundingSphere.radius * 2;
	if(objectSize == 0) {
		objectSize = 1;
	}
	var distance = objectSize / 2 /  centerPos.length() / 2 / Math.tan(fov);
	var rigScale = distance / centerPos.length();
	//what moves center screen to target
	var centerPosScaled = viewerModel.getCenterPoint();
	centerPosScaled.multiplyScalar(rigScale);
	var translateVec = boundingSphere.center.sub(centerPosScaled);	
	
	cameraRigMatrix.makeScale(rigScale, rigScale, rigScale);
	cameraRigMatrix.setPosition(translateVec);
	
	cameraRigUpdated();
	targetSphere.position.copy(centerPosScaled);
}
var resetViewButton = document.getElementById("resetview");
resetViewButton.onclick = resetView;

var isFocusQueued = false;
function onFocus() {
	socket.emit('gotFocus', viewerID);
	gotFocus();
	
}
window.onfocus = function () { //todo if we get focus before ID assigned, server won't know.
	if(viewerID) {
		onFocus();
	}
	else {
		isFocusQueued = true;
	}
};

var hasFocus = false;
function gotFocus() { 
	if(!hasFocus) { //prevents broadcast from re-resetting
		hasFocus = true;
		resetControls();
		for(key in wandDictionary) {
			wandDictionary[key].cameraRigView.enable();
		}
	}
}

socket.on('setLastFocusedViewer', function(vID) {
	if(viewerID == vID) {
		gotFocus();
	}
	else {
		hasFocus = false;
		for(key in wandDictionary) {
			wandDictionary[key].cameraRigView.disable();
		}
	}
});

var thisViewerCreatedCutPlane = false;
function onCutPlane() {
	thisViewerCreatedCutPlane = true;
	socket.emit('requestLoadFile', '.cutplane');
}
var cuttingPlaneButton = document.getElementById("cuttingPlane");
cuttingPlaneButton.onclick = onCutPlane;


//  File Loading Code
var remaningAsyoOps = 0;
function traverseFileTree(item, fileArray, path) {
  var path = path || "";
  if (item.isFile) {
    // Get file
    ++remaningAsyoOps;
    item.file(function(file) {
    	var pathToSave;
		if(path == "") {
			pathToSave = null;
		}
		else {
			pathToSave = path;
		}

      fileArray.push({pathOfFile: pathToSave, fileObj:file});
      --remaningAsyoOps;
    });
  } else if (item.isDirectory) {
    // Get folder contents
    var dirReader = item.createReader();
    ++remaningAsyoOps;
    dirReader.readEntries(function(entries) {
      for (var i=0; i<entries.length; i++) {
        traverseFileTree(entries[i], fileArray, path + item.name + "/");
      }
      --remaningAsyoOps;
    });
  }
}


var clearModelsButton = document.getElementById("clearModels");
function sendClearModels() {
	socket.emit('clearModels');
}
clearModelsButton.onclick = sendClearModels;

function disposeNode(parentObject) {
	parentObject.traverse(function (node) {
		if (node instanceof THREE.Mesh) {
			if (node.geometry) {
				node.geometry.dispose();
			}
			if (node.material) {
				var materialArray;
				if (node.material instanceof THREE.MeshFaceMaterial || node.material instanceof THREE.MultiMaterial) {
					materialArray = node.material.materials;
				}
				else if(node.material instanceof Array) {
					materialArray = node.material;
				}
				if(materialArray) {
					materialArray.forEach(function (mtrl, idx) {
						if (mtrl.map) mtrl.map.dispose();
						if (mtrl.lightMap) mtrl.lightMap.dispose();
						if (mtrl.bumpMap) mtrl.bumpMap.dispose();
						if (mtrl.normalMap) mtrl.normalMap.dispose();
						if (mtrl.specularMap) mtrl.specularMap.dispose();
						if (mtrl.envMap) mtrl.envMap.dispose();
						mtrl.dispose();
					});
				}
				else {
					if (node.material.map) node.material.map.dispose();
					if (node.material.lightMap) node.material.lightMap.dispose();
					if (node.material.bumpMap) node.material.bumpMap.dispose();
					if (node.material.normalMap) node.material.normalMap.dispose();
					if (node.material.specularMap) node.material.specularMap.dispose();
					if (node.material.envMap) node.material.envMap.dispose();
					node.material.dispose();
				}
			}
		}
	});
}

function onClearModels() {
	disposeNode(loadedModelGroup);
	
	for(key in modelObjMap) {
		modelObjMap[key].grabParent.remove(modelObjMap[key].mesh);
		loadedModelGroup.remove(modelObjMap[key].grabParent);
		modelObjMap[key].destroy();
		delete modelObjMap[key];
	}
	grabGeometryList.splice(0, grabGeometryList.length);
	
	if (loadedModelGroup.children !== undefined) {
		while (loadedModelGroup.children.length > 0) {
			loadedModelGroup.remove(loadedModelGroup.children[0]);
		}
	}
	isShinyGone = true;
	updateModelGroup();
}
socket.on('clearModels', onClearModels);

function removeGrabable(id) {
	disposeNode(modelObjMap[id].mesh);
	modelObjMap[id].grabParent.remove(modelObjMap[id].mesh);
	loadedModelGroup.remove(modelObjMap[id].grabParent);
	modelObjMap[id].destroy();
	delete modelObjMap[id];
}

if(window.FileReader) { 
  window.addEventListener('load', function() {
	var drop = window; //if they drop a file on the window
  	
    function cancel(e) {
      if (e.preventDefault) { e.preventDefault(); }
	  e.dataTransfer.dropEffect = 'copy';
      return false;
    }
  
    // Tells the browser that we *can* drop on this target
	drop.addEventListener('dragover', cancel, false);
	drop.addEventListener('dragenter', cancel, false);
	drop.addEventListener('drop', onFileDragAndDrop, false);
  });
} else {
  document.getElementById('fileStatus').innerHTML = 'Your browser does not support the HTML5 FileReader.';
}



var didThisClientRequestFile = false;
var isModelAtOrigin = false;
function onFileDragAndDrop(e) {
	//e = e || window.event; // get window.event if e argument missing (in IE)
	e.preventDefault(); // stops the browser from redirecting off to the file
	for (var i = 0; i < e.dataTransfer.files.length; ++i) {
		var path = e.dataTransfer.files[i].path; //nwjs hack
		var ext = path.substr(path.lastIndexOf('.') + 1).toLowerCase();
		if(ext === 'json' || ext === 'dae' || ext === 'obj' || ext === 'stl' || ext === 'fbx') {
			didThisClientRequestFile = true;
			socket.emit('requestLoadFile', path);
		}
	}
	return false;
}
//setup drag and drop
function ready(fn) {
	if (document.readyState != 'loading'){
	  fn();
	} else {
	  document.addEventListener('DOMContentLoaded', fn);
	}
  }
  
ready(function(){
	// prevent default behavior from changing page on dropped file
	window.ondragover = function(e) { e.preventDefault(); return false };
	// NOTE: ondrop events WILL NOT WORK if you do not "preventDefault" in the ondragover event!!
	window.ondrop = function(e) { e.preventDefault(); return false };

	var holder = document.getElementById('body');
	holder.ondragover = function () { return false; };
	holder.ondragleave = function () { return false; };
	holder.ondrop = onFileDragAndDrop;
  });

var fileInput = document.getElementById("openFile");
fileInput.addEventListener('change', function(e) {
	var fileList = e.target.files;
	for (var i = 0; i < fileList.length; ++i) {
		var path = fileList[i].path; //nwjs hack
		var ext = path.substr(path.lastIndexOf('.') + 1).toLowerCase();
		if(ext === 'json' || ext === 'dae' || ext === 'obj' || ext === 'stl' || ext === 'fbx') {
			didThisClientRequestFile = true;
			isModelAtOrigin = true;
			socket.emit('requestLoadFile', path);
		}
	}
	fileInput.value = '';
}, false);

var openFileLink = document.getElementById("openFileButton");
function openFileDialog() {
	fileInput.click(); //nwjs hack
	openFileLink.blur();
}
openFileLink.onclick = openFileDialog;//nwjs hack


function getScreenCenterPixel() {
	pixels = getScreenPixels();
	xCenter = Math.floor((pixels[3] - pixels[2]) / 2 + pixels[2]);
	yCenter = Math.floor((pixels[1] - pixels[0]) / 2 + pixels[0]);
	return [xCenter, yCenter];
}
	

function addGrabable(grabable) {
	loadedModelGroup.add(grabable.grabParent);
	grabGeometryList.push(grabable.intersectObj);
}



function updateModelGroup() {
	modelsBoundingBox.setFromObject(worldRoot); //globalScene or worldRoot or loadedModelGroup
	modelsBoundingBox.getBoundingSphere(modelsBoundingSphere);
	
	modelToWorldRootOffset.copy(modelsBoundingSphere.center);
	modelToWorldRootOffset.sub(worldRoot.position); //position needs to be global which it is if worldroot has no parent
	
	worldRoot.updateMatrixWorld();
	modelBoxParentInverse.getInverse(worldRoot.matrixWorld); //save so we can offset box when worldroot moves.
	
	areModelVisualsDirty = true;	
}

function getModelsBoundingBoxMovedByWorldRoot() {
	worldRoot.updateMatrixWorld();
	modelBoxOffset.multiplyMatrices(worldRoot.matrixWorld, modelBoxParentInverse);
	movedBoundingBox.copy(modelsBoundingBox);
	// box1.update(modelsBoundingBox);
	movedBoundingBox.applyMatrix4(modelBoxOffset);
	// box2.update(movedBoundingBox);
	return movedBoundingBox;
}

var areModelVisualsDirty = true;
var parentInverseAjustVisualsForModelChanges = new THREE.Matrix4();
function ajustVisualsForModelChanges() {
	//put in worldRoot space from globalworld space
	parentInverseAjustVisualsForModelChanges.getInverse(worldRoot.matrixWorld);
	var center = modelsBoundingSphere.center.applyMatrix4(parentInverseAjustVisualsForModelChanges);
	var maxDimsHalf = modelsBoundingSphere.radius;
	var distance = .1;
	if(sunLight) {
		sunLight.position.copy(SUN_LIGHT_DIRECTION);
		sunLight.position.multiplyScalar(maxDimsHalf + distance);
		sunLight.position.add(center)
		sunLight.target.position.copy(center);
		sunLight.shadow.camera.near = distance;
		sunLight.shadow.camera.far = maxDimsHalf * 2 + distance;
		sunLight.shadow.camera.right = maxDimsHalf;
		sunLight.shadow.camera.left = -maxDimsHalf;
		sunLight.shadow.camera.top	= maxDimsHalf;
		sunLight.shadow.camera.bottom = -maxDimsHalf;
		sunLight.shadow.camera.updateProjectionMatrix();
		sunLight.shadow.camera.updateMatrixWorld();
		//sunlightHelper.update();
	}
	
	updatePerspective(); //for new far clip distance;
}


var lastMovedGrabable;
var grabyBox = new THREE.Box3();
var preGrabWorldBox = new THREE.Box3();
var newWorldBox = new THREE.Box3();
var boxOrigenInverse = new THREE.Matrix4();
var boxOffset = new THREE.Matrix4();
var grabyBoxOffset = new THREE.Box3();
var oldBox = new THREE.Box3();

//todo xxx does not handel multiple objects being grabed at once?
function onStartGrab(grabable) {
	if(grabable.mesh) { //if not loaded mesh yet and master is trying to set matrix of grab objects
		grabyBox.setFromObject(grabable.mesh);
		grabable.grabParent.updateMatrixWorld();
		boxOrigenInverse.getInverse(grabable.grabParent.matrixWorld);
		preGrabWorldBox.copy(getModelsBoundingBoxMovedByWorldRoot());
	}
}
Grabable.grabSignal.on('startGrab', onStartGrab)


function onGrabableMoved(grabable) {
	//update model bounding box for visuals
	if(grabable.isGrabbed) {   //hack to fix when grabable.setMatrix is called after stopGrab.  ToDo: reorder messages.
		grabable.grabParent.updateMatrixWorld();
		boxOffset.multiplyMatrices(grabable.grabParent.matrixWorld, boxOrigenInverse);
		
		grabyBoxOffset.copy(grabyBox);
		grabyBoxOffset.applyMatrix4(boxOffset);
		
		newWorldBox.copy(preGrabWorldBox);
		newWorldBox.union(grabyBoxOffset);
		
		if(!newWorldBox.equals(modelsBoundingBox)) {
			modelsBoundingBox.copy(newWorldBox);
			modelsBoundingBox.getBoundingSphere(modelsBoundingSphere);
			modelToWorldRootOffset.copy(modelsBoundingSphere.center);
			modelToWorldRootOffset.sub(worldRoot.position); //position needs to be global which it is if worldroot has no parent
			areModelVisualsDirty = true;
		}
	}
	
	
	/*
	// updateModelGroup();
	// box2.update(modelsBoundingBox);
	if(grabable.mesh) { //if not loaded mesh yet and master is trying to set matrix of grab objects
		if(lastMovedGrabable != grabable) { //is a start grab? but what if world matrix is changed in between by wand?
			grabyBox.setFromObject(grabable.mesh);
			grabable.grabParent.updateMatrixWorld();
			boxOrigenInverse.getInverse(grabable.grabParent.matrixWorld);
			preGrabWorldBox.copy(modelsBoundingBox);
			
			box2.update(modelsBoundingBox);
			lastMovedGrabable = grabable;
		}
		else {
			//expand models bounding box from model movement
			grabable.grabParent.updateMatrixWorld();
			boxOffset.multiplyMatrices(grabable.grabParent.matrixWorld, boxOrigenInverse);
			
			grabyBoxOffset.copy(grabyBox);
			grabyBoxOffset.applyMatrix4(boxOffset);
			box1.update(grabyBoxOffset);
			
			newWorldBox.copy(preGrabWorldBox);
			newWorldBox.union(grabyBoxOffset);
			
			if(!newWorldBox.equals(modelsBoundingBox)) {
				modelsBoundingBox.copy(newWorldBox);
				modelsBoundingBox.getBoundingSphere(modelsBoundingSphere);
				modelToWorldRootOffset.copy(modelsBoundingSphere.center);
				modelToWorldRootOffset.sub(worldRoot.position); //position needs to be global which it is if worldroot has no parent
				areModelVisualsDirty = true;
			}
		}
	}
	*/
}
Grabable.grabSignal.on('setMatrixCalled', onGrabableMoved)

function onStopGrab(grabable) {
	updateModelGroup(); //tighen up bounding box
}
Grabable.grabSignal.on('stopGrab', onStopGrab)


function onModelLoaded(object3D, modelID) {	
	var graby = getGrabable(modelID);
	graby.setMesh(object3D);
	graby.setCutPlanes(CutPlane.cutPlanes);
	addGrabable(graby);
	
	object3D.traverse( function( node ) {
		if ( node instanceof THREE.Mesh ) {
			node.castShadow = true;
			node.receiveShadow = true;
		}
	} );

	// object3D.matrixAutoUpdate = false;
	if(didThisClientRequestFile) {
		var bbox = new THREE.Box3().setFromObject(object3D);
		var boundingSphere = bbox.getBoundingSphere();
		var targetPosWorld;
		if(isModelAtOrigin) {
			 targetPosWorld = new THREE.Vector3().copy(boundingSphere.center);
		}
		else {			
			targetPosWorld = viewerModel.getCenterPoint();
			targetPosWorld.applyMatrix4(cameraRigMatrix);
			
			var grabOffsetInverse = new THREE.Matrix4().getInverse(worldRoot.matrix); //todo fix world grab offset
			var targetPosMatrix = new THREE.Matrix4();
			var bsC = new THREE.Vector3().copy(boundingSphere.center);
			var offsetPos = targetPosWorld.clone().sub(bsC);
			targetPosMatrix.setPosition(offsetPos);
			targetPosMatrix.multiplyMatrices(grabOffsetInverse, targetPosMatrix); //now model matrix offset from grab offset is found
			var targetInGrabSpace = new THREE.Vector3(targetPosMatrix.elements[12],targetPosMatrix.elements[13],targetPosMatrix.elements[14]);
			
			graby.grabParent.matrix.setPosition(targetInGrabSpace);
			graby.setMatrix(graby.grabParent.matrix);
			syncModelPose(graby);			
		}		
		// distance between orbit target and head
		var orbitPosWorld = viewerModel.getCenterPoint();
		orbitPosWorld.applyMatrix4(cameraRigMatrix);
		var orbitToHead = orbitPosWorld.clone().sub(headPose.pos);
		var distnaceToHead = orbitToHead.length();
		
		//move cameraRig to see model		
		var centerPos = viewerModel.getCenterPoint();
		var vectorUp = viewerModel.getCenterTopPos();
		vectorUp.sub(centerPos);
		centerPos.sub(head.position); //finds distance between head and screen
		var fov = Math.atan(vectorUp.length() / centerPos.length());
		var objectSize = boundingSphere.radius * 2;
		if(objectSize == 0) {
			objectSize = 1;
		}
		var distacneToHeadTarget = objectSize / 2 /  centerPos.length() / 2 / Math.tan(fov);
		var scaleTargetFactor =  distacneToHeadTarget / distnaceToHead;		
		
		//find new head pos
		orbitToHead.normalize(); 
		orbitToHead.multiplyScalar( -distacneToHeadTarget );
		var targetHeadPos = targetPosWorld.clone().add(orbitToHead)
		
		//scale rig
		var pos = new THREE.Vector3();
		var scale = new THREE.Vector3();
		var quat = new THREE.Quaternion();
		cameraRigMatrix.decompose(pos, quat, scale);
		scale.multiplyScalar(scaleTargetFactor);
		cameraRigMatrix.compose(pos, quat, scale);
		
		//find offset from scaled head position to target head
		var scaledHead = head.position.clone().applyMatrix4(cameraRigMatrix);
		var crHeadToTargetHead = targetHeadPos.clone().sub(scaledHead);
		
		//apply offset to rig pos to keep scaled head at target head
		pos.add(crHeadToTargetHead);
		cameraRigMatrix.compose(pos, quat, scale);
		cameraRigUpdated();
		
		resetControls(); //otherwise could get jump when next moving camera controls
		
		didThisClientRequestFile = false;
		isModelAtOrigin = false;
	}
	
	if(object3D != shinyThing && !isShinyGone) {
		removeGrabable(shinyThingId);
		isShinyGone = true;
	}
	
	updateModelGroup();
}

function loadFile(uri, modelID) {
	var ext = uri.substr(uri.lastIndexOf('.') + 1);
	if(ext == 'shinything') {
		shinyThingId = modelID;
		var geometry	= new THREE.TorusKnotGeometry(0.5-0.12, 0.12);
		//var material	= new THREE.MeshNormalMaterial(); //does not support cut planes
		var material	= new THREE.MeshPhongMaterial();
		material.shininess = 60;
		shinyThing = new THREE.Mesh(geometry, material);
		shinyThing.castShadow = true;
		shinyThing.receiveShadow = true;
		onModelLoaded(shinyThing, modelID);
	}
	else if(ext == 'cutplane') {
		modelObjMap[modelID] = new CutPlane.CutPlane(modelID, cameraRigMatrix);
		addGrabable(modelObjMap[modelID]);
		if(thisViewerCreatedCutPlane) {
			thisViewerCreatedCutPlane = false;
			var centerPos = viewerModel.getCenterPoint();
			var vectorUp = viewerModel.getCenterTopPos();
			centerPos.applyMatrix4(cameraRigMatrix);
			vectorUp.applyMatrix4(cameraRigMatrix);
			vectorUp.sub(centerPos);
			vectorUp.normalize();
			var cutMatrix = new THREE.Matrix4();
			cutMatrix.lookAt(headPose.pos, centerPos, vectorUp);
			cutMatrix.setPosition(centerPos);
			var world = new THREE.Matrix4().getInverse(loadedModelGroup.matrixWorld); //find offset from parent to reach world target
			cutMatrix.multiplyMatrices(world, cutMatrix);
			modelObjMap[modelID].setMatrix(cutMatrix);
			syncModelPose(modelObjMap[modelID]);
		}
	}
	else {
		LOADER.loadURL(serverAddress + '/' + uri, onModelLoaded, modelID);
	}
}
socket.on('loadFile', loadFile);

function onLoadModel(modelInfo) {
	LOADER.loadModel(serverAddress, modelInfo, onModelLoaded);
}
socket.on('loadModel', onLoadModel);  //only used on mtl obj files now

function isParented(parent, child) {
	if(parent == child) {
		return true;
	}
	else if(child.parent !== undefined && child.parent != loadedModelGroup){
		return isParented(parent, child.parent);
	}
	else {
		return false;
	}	
}

function getGrabable(modelID) {
	if(modelObjMap[modelID] === undefined) {
		var graby = new Grabable.Grabable(modelID);//no mesh yet, save matrix for when it loads
		modelObjMap[modelID] = graby;
		loadedModelGroup.add(graby.grabParent);
	}
	return modelObjMap[modelID];
}

var mForonUpdateModelMatrix = new THREE.Matrix4();
var onUpdateModelMatrix = function(modelID, matrixArray) {
	var grabable = getGrabable(modelID);
	mForonUpdateModelMatrix.fromArray(matrixArray);
	grabable.setMatrix(mForonUpdateModelMatrix);
}
socket.on('modelMatrixUpdate', onUpdateModelMatrix);

function syncModelPose(grabbable) {
	viewersSocket.emit('mirror', {msgID: 'setModelMatrix', modelID: grabbable.id, matrix: grabbable.grabParent.matrix.toArray()});
}

onRenderFcts.push(CutPlane.updateCutPlanes);

function createRenderer() {
	if ( renderer !== null ) {  //todo xxx memory leak here
		renderingContainer.removeChild( renderer.domElement );
		renderer.dispose();
	}
	renderer = new THREE.WebGLRenderer({
		antialias : isHighQualityOn
	});
	renderer.setClearColor(clearColor, 1)
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderingContainer.appendChild( renderer.domElement );
	renderer.localClippingEnabled = true;
	renderer.autoClear = false;
	
	if(isHighQualityOn) {
		renderer.shadowMap.enabled = true;
	}
	else {
		renderer.shadowMap.enabled = false;
	}
	
	if ( effectComposer == null ) {
		// Setup render pass
		renderPass2 = new THREE.RenderPass( backgroundScene, backgroundCamera );
		renderPass = new THREE.RenderPass( globalScene, camera );
		renderPass.clear = false;		
		// Setup depth pass
		depthMaterial = new THREE.MeshDepthMaterial();
		depthMaterial.depthPacking = THREE.RGBADepthPacking;
		depthMaterial.blending = THREE.NoBlending;
		var pars = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };
		depthRenderTarget = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, pars );
		// Setup SSAO pass
		ssaoPass = new THREE.ShaderPass( THREE.SSAOShader );
		ssaoPass.renderToScreen = true;
		ssaoPass.clear = false;
		//ssaoPass.uniforms[ "tDiffuse" ].value will be set by ShaderPass
		ssaoPass.uniforms[ "tDepth" ].value = depthRenderTarget.texture;
		ssaoPass.uniforms[ 'size' ].value.set( window.innerWidth, window.innerHeight );
		ssaoPass.uniforms[ 'cameraNear' ].value = NEAR_CLIP_DISTANCE;
		ssaoPass.uniforms[ 'cameraFar' ].value = INITAL_FAR_CLIP_DISTANCE;
		ssaoPass.uniforms[ 'onlyAO' ].value = ( postprocessing.renderMode == 1 );
		ssaoPass.uniforms[ 'aoClamp' ].value = .3; //.3
		ssaoPass.uniforms[ 'lumInfluence' ].value = .5; //.5
	}	
	effectComposer = new THREE.EffectComposer( renderer );
	effectComposer.addPass( renderPass2 );
	effectComposer.addPass( renderPass );
	effectComposer.addPass( ssaoPass );	
}

function resizeRenderer() {
	var width = window.innerWidth;
	var height = window.innerHeight;	
	renderer.setSize( width, height );
	
	if(effectComposer !== null) {
		ssaoPass.uniforms[ 'size' ].value.set( width, height );
		var pixelRatio = renderer.getPixelRatio();
		var newWidth  = Math.floor( width / pixelRatio ) || 1;
		var newHeight = Math.floor( height / pixelRatio ) || 1;
		depthRenderTarget.setSize( newWidth, newHeight );
		effectComposer.setSize( newWidth, newHeight );
	}
}

var clock = new THREE.Clock();
function render() {
	// call each update function
	var delta = clock.getDelta();
	onRenderFcts.forEach(function(onRenderFct){
		onRenderFct(delta);
	});
	
	if(areModelVisualsDirty) {
		ajustVisualsForModelChanges();
		areModelVisualsDirty = false;
	}
	if(isPerspectiveDirty) {
		realUpdatePerspective();
		isPerspectiveDirty = false;
	}
	
	renderer.clear();
	if (isHighQualityOn && postprocessing.enabled) {
		// Render depth into depthRenderTarget
		globalScene.overrideMaterial = depthMaterial;
		renderer.render(globalScene, camera, depthRenderTarget, true);
		// Render renderPass and SSAO shaderPass
		globalScene.overrideMaterial = null;
		effectComposer.render();
	} else {
		renderer.render(globalScene, camera);
	}
}

(function animate(nowMsec){
	// run the rendering loop
	requestAnimationFrame(animate);
	render();
})();
	
}

//find server address
var mdns = require('mdns');
var foundDisplayService = false;
var browser = mdns.createBrowser(mdns.tcp('vizworkshop'));
browser.on('serviceUp', function(service) {
  if(service.name === "VizWorkshopDisplayServer" && !foundDisplayService) {
	  foundDisplayService = true;
	  browser.stop();
	  var serverAddressString = 'http://' + service.host + ':' + service.port;  //likly 'http://localhost:4481'
	  startViewer(serverAddressString);
  }
});
browser.start();
