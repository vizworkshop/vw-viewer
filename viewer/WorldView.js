
(function(exports) {

var SUN_LIGHT_DIRECTION = (new THREE.Vector3(1, 1, 0)).normalize();
var HEMI_LIGHT_LUMASITY = .9; //.5
var HEMI_LIGHT_GROUND_LUMASITY = .95; //.5

exports.WorldView = function(serverAddress, socket, renderer, vID, onRenderFunctions) {
	var me = {};
	me.viewerID = vID;
	me.isMasterViewer = false;
	
	///renderer.setClearColor(new THREE.Color('grey'), 1);
	renderer.localClippingEnabled = true;
	
	function setClearColor(color) {
		renderer.setClearColor(color);
		var hsl = renderer.getClearColor().getHSL();
		me.hemiLight.groundColor.setHSL(hsl.h, hsl.s, HEMI_LIGHT_GROUND_LUMASITY);
	}
	
	function onWorldRootUpdated() {
		CutPlane.needsUpdate = true;
		me.hemiLight.position.copy( me.hemiLight.up ).applyQuaternion( me.worldRoot.quaternion );
	}
	onRenderFunctions.push(CutPlane.updateCutPlanes);
	
	me.worldRoot = new THREE.Object3D();
	me.worldRoot.vizworkshopUpdate = onWorldRootUpdated;
	scene.add(me.worldRoot);
	me.loadedModelGroup = new THREE.Object3D();
	me.loadedModelGroup.name = 'loadedModelGroup'; //for grab?
	me.worldRoot.add(me.loadedModelGroup);
    
	me.cameraRig = new THREE.Object3D();
	scene.add(me.cameraRig);
	me.head = new THREE.Object3D();
	me.headNoOri = new THREE.Object3D();
	me.cameraRig.add(me.head);
	me.cameraRig.add(me.headNoOri);
	
	function sendToViewers(data) {
		data.mViD = me.viewerID;
		socket.emit("mirror", data);
	}
	
	var tempMatrix = new THREE.Matrix4();
	socket.on('cameraRigPose', function(camRigMatrix){
		for (var i = 0; i < camRigMatrix.length; i++) {
			tempMatrix.elements[i] = camRigMatrix[i];
		}
		tempMatrix.decompose(me.cameraRig.position, me.cameraRig.quaternion, me.cameraRig.scale);
		//update wand as it is manually child of rig
		for(key in wandDictionary) {
			var wandModel = wandDictionary[key].model;
			me.cameraRig.updateMatrixWorld();//todo make wand offical child of cameraRig, then we can remove this
			wandModel.matrix.multiplyMatrices(me.cameraRig.matrixWorld, wandModel.localMatrix);
			wandModel.matrixUpdated();
		}
		CutPlane.needsUpdate = true;
	});
	
	socket.on('pose', function(d) {
		var name = d.name;
		var pos = d.pos;
		var quat = d.quat;
		if(name == 'head') {
			me.head.position.fromArray(pos);
			me.headNoOri.position.fromArray(pos);
			me.head.quaternion.set(quat[0], quat[1], quat[2], quat[3]);			
		}
	});
	
	var sunLight = new THREE.DirectionalLight(0xffffff, .5);
	sunLight.position.copy(SUN_LIGHT_DIRECTION);
	me.worldRoot.add( sunLight );
	me.worldRoot.add( sunLight.target );
	
	me.hemiLight = new THREE.HemisphereLight();
	me.hemiLight.color.setHSL( 0.6, .75, HEMI_LIGHT_LUMASITY );
	me.hemiLight.intensity = .7; //.7
	scene.add( me.hemiLight );
	
	function onWorldMatrix(data) {
		for (var i = 0; i < 16; i++) {
			me.worldRoot.matrix.elements[i] = data.worldMatrix.elements[i];
		}
		me.worldRoot.matrix.decompose(me.worldRoot.position, me.worldRoot.quaternion, me.worldRoot.scale);
		me.worldRoot.vizworkshopUpdate(); //for cut planes and hemilight
	}
	
	/////////  Wand Wrangling
	
	var wandDictionary = [];
	onRenderFunctions.push(function () {
		for(key in wandDictionary) {
			wandDictionary[key].model.update();
		}
	});
	
	function createWand(key) {
		var wandModel = new WandModel.WandModel(key);
		var wandController;
		if(me.isMasterViewer) {
			wandController = new WandController.WandMasterController(socket, wandModel, me.worldRoot, me.modelObjMap, me.grabGeometryList);
		}
		else {
			wandController = new WandController.WandController(socket, wandModel, me.worldRoot, me.modelObjMap);
		}
		var wandView = new WandView.WandView(wandModel, me.modelObjMap);
		scene.add(wandView.wandGroup);  //todo make wand child of cameraRig
		wandDictionary[key] = {model: wandModel, controller: wandController, view: wandView};
	}
	
	function onWandInit(data) {		
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
	
	function onWandMatrix(data) {	
		var wand = wandDictionary[data.wid];
		if(wand != undefined) {
			var wandModel = wand.model;
			wandModel.localMatrix.fromArray(data.m);
			me.cameraRig.updateMatrixWorld();//todo make wand offical child of cameraRig
			wandModel.matrix.multiplyMatrices(me.cameraRig.matrixWorld, wandModel.localMatrix);
			wandModel.matrixUpdated();
		}
		
	}	
	socket.on('wandMatrix', onWandMatrix);
	
	function onDestoryWand(data) {
		var wand = wandDictionary[data.wid];
		if(wand) {
			wand.model.disable();
		}
		else {
			console.log('Error: destory wand that does not exist');
		}
	}	
	socket.on('destroyWand', onDestoryWand);
	
	
	function onWandIsBack(data) {
		var wand = wandDictionary[data.wid];
		if(wand) {
			wand.model.enable();
		}
		else {
			console.log('Error: Tried to turn on wand that does not exist in wand Dic.');
		}
	}
	socket.on('wandIsBack', onWandIsBack);
	
	function onWandIsFixedPosMode(data) {
		var wand = wandDictionary[data.wid];
		if(wand) {
			wand.model.setIsFixedPosMode(data.isFixed);
		}
	}
	socket.on('onIsFixedPosMode', onWandIsFixedPosMode);
	
	
	function onIsWandGrabbing(data) {
		var wand = wandDictionary[data.wid];
		if(wand) {
			wand.model.setIsGrabbing(data.is); //probably better to hand this to controller
		}
	}
	socket.on('wandGrabbing', onIsWandGrabbing);
	
	function onWandSelecting(data) {
		var wand = wandDictionary[data.wid];
		if(wand) {
			wand.model.setIsSelecting(data.is); //probably better to hand this to controller
		}
	}
	socket.on('wandSelect', onWandSelecting);

	function onWandScale(data) {
		var wand = wandDictionary[data.wid];
		if(wand) {
			wand.model.onScale(data.scaleFactor);
		}
	}
	socket.on('wandScale', onWandScale);
	
	
	function onWandCalibrate(data) {
		var wand = wandDictionary[data.wid];
		if(wand) {
			wand.model.onCalibrate(data.isCalibrating);
		}
	}
	
	me.getWand = function(wandID){
		return wandDictionary[wandID];
	}
	
	
	////// Model Wrangling
	me.grabGeometryList = [];
	me.modelObjMap = {};
	me.shinyThing = undefined;
	
	Grabable.initNetworkSyncer(socket);
	
	function getGrabable(modelID) {
		if(me.modelObjMap[modelID] === undefined) {
			var graby = new Grabable.Grabable(modelID);//no mesh yet, save matrix for when it loads
			me.modelObjMap[modelID] = graby;
			me.loadedModelGroup.add(graby.grabParent);
		}
		return me.modelObjMap[modelID];
	}
	
	function addGrabable(grabable) {
		me.loadedModelGroup.add(grabable.grabParent);
		me.grabGeometryList.push(grabable.intersectObj);
	}
	
	function loadFile(uri, modelID) {
		var ext = uri.substr(uri.lastIndexOf('.') + 1);
		if(ext == 'shinything') {
			me.shinyThing = new THREE.Group();
			me.shinyThingId = modelID;
			var geometry	= new THREE.TorusKnotGeometry(0.5-0.12, 0.12);
			//var material	= new THREE.MeshNormalMaterial(); //does not support cut planes
			var material	= new THREE.MeshPhongMaterial(); 
			material.shininess = 60;
			var knot = new THREE.Mesh(geometry, material);
			me.shinyThing.add(knot)
			onModelLoaded(me.shinyThing, modelID);
			me.isShinyGone = false;
		}
		else if(ext == 'cutplane') {
			me.modelObjMap[modelID] = new CutPlane.CutPlane(modelID, me.cameraRig.matrix);
			addGrabable(me.modelObjMap[modelID]);
		}
		else {
			LOADER.loadURL(serverAddress + '/' + uri, onModelLoaded, modelID);
		}
	}
	socket.on('loadFile', loadFile);

	function onLoadModel(modelInfo) {
		LOADER.loadModel(serverAddress, modelInfo, onModelLoaded);
	}
	socket.on('loadModel', onLoadModel);  //only on mtl obj files
	
	sendToViewers({msgID: 'newConnection'})
	
	socket.on('reflect', function(data) {
		if(data.msgID == 'wandInit') {
			onWandInit(data);
		}
		else if (data.msgID == 'WorldMatrix') {
			onWorldMatrix(data);
		}
		else if (data.msgID == 'setModelMatrix') {
			onUpdateModelMatrix(data.modelID, data.matrix);
		}
		else if (data.msgID == 'setClearColor') {
			setClearColor(data.newColor);
		}
	});	
	
	function onModelLoaded(object3D, modelID) {
		var graby = getGrabable(modelID);
		graby.setMesh(object3D);
		graby.setCutPlanes(CutPlane.cutPlanes);
		addGrabable(graby);
		
		if(object3D != me.shinyThing && !me.isShinyGone) {
			//me.shinyThing.visible = false;
			removeGrabable(me.shinyThingId);
			me.isShinyGone = true;
		}
	}
	
	var mForonUpdateModelMatrix = new THREE.Matrix4();
	var onUpdateModelMatrix = function(modelID, matrixArray) {
		var grabable = getGrabable(modelID);
		mForonUpdateModelMatrix.fromArray(matrixArray);
		grabable.setMatrix(mForonUpdateModelMatrix);
	}
	socket.on('modelMatrixUpdate', onUpdateModelMatrix);
	
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
		disposeNode(me.loadedModelGroup);
		
		for(key in me.modelObjMap) {
			me.modelObjMap[key].grabParent.remove(me.modelObjMap[key].mesh);
			me.loadedModelGroup.remove(me.modelObjMap[key].grabParent);
			me.modelObjMap[key].destroy();
			delete me.modelObjMap[key];
		}
		me.grabGeometryList.splice(0, me.grabGeometryList.length); //remove everything from list
		
		if (me.loadedModelGroup.children !== undefined) {
			while (me.loadedModelGroup.children.length > 0) {
				me.loadedModelGroup.remove(loadedModelGroup.children[0]);
			}
		}		
		me.isShinyGone = true;
	}
	socket.on('clearModels', onClearModels);

	function removeGrabable(id) {
		disposeNode(me.modelObjMap[id].mesh);
		me.modelObjMap[id].grabParent.remove(me.modelObjMap[id].mesh);
		me.loadedModelGroup.remove(me.modelObjMap[id].grabParent);
		me.modelObjMap[id].destroy();
		delete me.modelObjMap[id];
	}
	
	me.reset = function() {
		onClearModels()
	}
	
	return me;
}

})(this.WorldView = {});