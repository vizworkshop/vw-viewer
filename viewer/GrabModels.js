(function(exports) {

var camera;
var headPos;
var domElement;
var raycaster;
var mouse;
var grabModelsList;
var cameraRig;
var movedCallback;
var modelDic;

var plane, INTERSECTED, SELECTED;
var offset = new THREE.Vector3();
var line;
var geometry;

exports.setup = function(agrabModelsList, thecamera, aheadPos, adomElement, aworldRoot, themovedCallback, amodelDic) {
	camera = thecamera;
	headPos = aheadPos;
	domElement = ( adomElement !== undefined ) ? adomElement : document;
	raycaster = new THREE.Raycaster();
	mouse = new THREE.Vector2();
	movedCallback = themovedCallback;
	modelDic = amodelDic;
	
	onResized();

	window.addEventListener('resize', onResized, false );
	domElement.addEventListener('mousemove', onMouseMove, false );
	domElement.addEventListener( 'mousedown', onDocumentMouseDown, true );
	domElement.addEventListener( 'mouseup', onDocumentMouseUp, false );
	
	grabModelsList = agrabModelsList;
	cameraRig = aworldRoot;
	plane = new THREE.Mesh(
		new THREE.PlaneBufferGeometry( 50, 50, 1, 1 ),
		new THREE.MeshBasicMaterial()//{ color: 0x0000cc, opacity: 0.5, transparent: true }
	);
	plane.matrixAutoUpdate = false;
	plane.material.visible = false;
	cameraRig.add( plane );
};

var getMouseIntersections = function() {
	var vector = new THREE.Vector3();
	vector.x = mouse.x;
	vector.y = mouse.y;
	vector.z = .5;
	vector.unproject( camera ).sub( headPos ).normalize(); //taken from raycaster.setFromCamera
	raycaster.set( headPos, vector );
	
	if ( SELECTED ) {
		var intersects = raycaster.intersectObject( plane );
		if(intersects.length > 0) {
			var newPos = new THREE.Vector3().copy(intersects[ 0 ].point).sub(offset);
			
			
			var target = new THREE.Matrix4().copy(SELECTED.grabParent.matrixWorld);
			target.setPosition(newPos);
			var parentMatrix = new THREE.Matrix4().getInverse(SELECTED.grabParent.parent.matrixWorld);
			SELECTED.setMatrix(parentMatrix.multiply(target));
			movedCallback(SELECTED);
		}
	}
	//to highlight selectable objects
	/*
	var intersects = raycaster.intersectObjects( grabModelsList, true );
	if ( intersects.length > 0 ) {
		if ( INTERSECTED != intersects[ 0 ].object ) { //new interested obj
			if ( INTERSECTED && INTERSECTED.material.color) INTERSECTED.material.color.setHex( INTERSECTED.currentHex );
			INTERSECTED = intersects[ 0 ].object;
			if(INTERSECTED.material.color) {
				INTERSECTED.currentHex = INTERSECTED.material.color.getHex();
			}
		}
		domElement.documentElement.style.cursor = 'pointer';
	} else {
		if ( INTERSECTED && INTERSECTED.material && INTERSECTED.material.color) INTERSECTED.material.color.setHex( INTERSECTED.currentHex );
		INTERSECTED = null;
		domElement.documentElement.style.cursor = 'auto';
	}
	*/
}

function isParented(parent, child) {
	if(parent == child) {
		return true;
	}
	else if(child.parent !== undefined && child.parent != cameraRig && child.parent){
		return isParented(parent, child.parent);
	}
	else {
		return false;
	}	
}

function onDocumentMouseDown( event ) {
	if(event.which === 2) { //middle mouse 
		event.preventDefault();
		var intersects = raycaster.intersectObjects( grabModelsList, true );
		if ( intersects.length > 0 ) {
			
			//SELECTED could be deep in higherarchy of model
			planeMatrixGlobal = new THREE.Matrix4();
			planeMatrixGlobal.setPosition(intersects[0].point);
			planeMatrixGlobal.lookAt(intersects[0].point, headPos, new THREE.Vector3(0, 1, 0));
			
			planeMatrixGlobal.multiply(new THREE.Matrix4().makeRotationY(Math.PI)); //plane is facing the wrong way without this
			
			planeMatrixGlobal.scale(plane.parent.scale);
			
			//plane.updateMatrixWorld(true);
			plane.parent.updateMatrixWorld();
			var parent = new THREE.Matrix4().getInverse(plane.parent.matrixWorld);
			plane.matrix.multiplyMatrices(parent, planeMatrixGlobal);
			plane.updateMatrixWorld(); //keeps from intersecting on mouse move before updated
		
			var selectedSubMesh = intersects[ 0 ].object;
			for(key in modelDic) {
				var modelObj = modelDic[key];
				//console.log('looking in model', modelObj);
				if(isParented(modelObj.mesh, selectedSubMesh))	{
					SELECTED = modelObj;
				}
			}
			SELECTED.grabParent.updateMatrixWorld();
			var selectedGlobalPos = new THREE.Vector3().setFromMatrixPosition(SELECTED.grabParent.matrixWorld)
			offset.copy( intersects[ 0 ].point ).sub( selectedGlobalPos );
			
			SELECTED.startGrab();
			
			document.documentElement.style.cursor = 'move';			
		}
	}

}

function onDocumentMouseUp( event ) {
	if(event.which === 2) {
		event.preventDefault();
		if(SELECTED) {
			SELECTED.stopGrab();
		}
		SELECTED = null;
		document.documentElement.style.cursor = 'auto';
	}
}

var windowWidthInverted;
var windowHeightInverted;

function onResized() {
	windowWidthInverted = 1.0 / window.innerWidth;
	windowHeightInverted = 1.0 / window.innerHeight;
}

var isDirty = false;

var lastMouseEvent; 
function onMouseMove( event ) {
	// calculate mouse position in normalized device coordinates
	// (-1 to +1) for both components
	lastMouseEvent = event;
	isDirty = true;
}

exports.update = function update() {
	if(isDirty) {  //wait for last one as this happens many times a frame
		mouse.x = ( lastMouseEvent.clientX * windowWidthInverted) * 2 - 1;
		mouse.y = - ( lastMouseEvent.clientY * windowHeightInverted ) * 2 + 1;
		getMouseIntersections();
		isDirty = false;
	}
}

})(this.GRABMODELS = {});
