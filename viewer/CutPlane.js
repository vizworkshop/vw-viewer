

(function(exports) {
	
var SIZE = .25;
	
var OUTLINE_IDLE_COLOR = 0x000000;
var X_CROSS_COLOR = 0xAAAAAA;
var CROSS_SELECT_COLOR = 0x000000;
var MODEL_SELECT_COLOR = 0xffffff;
var MODEL_GRAB_COLOR = 0x00FF00;
	
// var cutMap = new THREE.TextureLoader().load( "images/square.png" );
// cutMap.wrapS = THREE.RepeatWrapping;
// cutMap.wrapT = THREE.RepeatWrapping;
// cutMap.repeat.set( CUT_SIZE*100, CUT_SIZE*100 );
// cutMap.magFilter = THREE.NearestFilter;
//cutMap.minFilter = THREE.NearestFilter;
// cutMap.anisotropy = 0;
var cutPlanes = [];
exports.cutPlanes = cutPlanes;

var cutPlaneObjs = [];
exports.needsUpdate = false;
exports.updateCutPlanes = function() {
	if(exports.needsUpdate) {
		exports.needsUpdate = false;
		for(key in cutPlaneObjs) {
			cutPlaneObjs[key].update();
		}
	}
}

exports.disable = function() {
	for(key in cutPlaneObjs) {
		cutPlaneObjs[key].disable();
	}
}
exports.enable = function() {
	for(key in cutPlaneObjs) {
		cutPlaneObjs[key].enable();
	}
}

//ouline free grid
function gridMaker( size, step, color1, color2 ) {

	color1 = new THREE.Color( color1 !== undefined ? color1 : 0x444444 );
	color2 = new THREE.Color( color2 !== undefined ? color2 : 0x888888 );

	var vertices = [];
	var colors = [];

	for ( var i = - size + step, j = 0; i < size; i += step ) {

		vertices.push( - size, 0, i, size, 0, i );
		vertices.push( i, 0, - size, i, 0, size );

		var color = i === 0 ? color1 : color2;

		color.toArray( colors, j ); j += 3;
		color.toArray( colors, j ); j += 3;
		color.toArray( colors, j ); j += 3;
		color.toArray( colors, j ); j += 3;

	}

	var geometry = new THREE.BufferGeometry();
	geometry.addAttribute( 'position', new THREE.Float32Attribute( vertices, 3 ) );
	geometry.addAttribute( 'color', new THREE.Float32Attribute( colors, 3 ) );

	var material = new THREE.LineBasicMaterial( { vertexColors: THREE.VertexColors } );

	return new THREE.LineSegments( geometry, material );
	
};

function CutPlane(id, cameraRigMatrix) {
	var me = this;
	cutPlaneObjs.push(me);
	me.group = new THREE.Group();
	
	Grabable.Grabable.call(me, id, me.group);
	
	me.camRig = cameraRigMatrix;
	
	var size = SIZE/2;  //actualy double this
	// var step = .01;
	// me.grid = gridMaker(size, step, new THREE.Color( 0xffffff ),  new THREE.Color( 0xCCCCCC ));
	// me.grid.rotation.x = Math.PI / 2;
	// me.group.add(me.grid);
	
	var plany = new THREE.Mesh(
		new THREE.PlaneBufferGeometry( size*2.001, size*2.001, 1, 1 ), // little biggers so select box shows
		new THREE.MeshBasicMaterial( { visible: false, side: THREE.DoubleSide } )
	);	
	me.group.add(plany);
	me.intersectObj = plany;
	
	
	var material = new THREE.LineBasicMaterial({
		color: OUTLINE_IDLE_COLOR
	});
	var geometry = new THREE.Geometry();
	var outlineSize = size;  
	geometry.vertices.push(
		new THREE.Vector3( -outlineSize, outlineSize, 0 ),
		new THREE.Vector3( outlineSize, outlineSize, 0 ),
		new THREE.Vector3( outlineSize, -outlineSize, 0 ),
		new THREE.Vector3( -outlineSize, -outlineSize, 0 ),
		new THREE.Vector3( -outlineSize, outlineSize, 0 )
	);
	me.outline = new THREE.Line( geometry, material );
	me.group.add(me.outline);
	
	//x cross
	geometry = new THREE.Geometry();
	geometry.vertices.push(
		new THREE.Vector3( -size, size, 0 ),
		new THREE.Vector3( size, -size, 0 )
	);
	material = new THREE.LineBasicMaterial({
		color: X_CROSS_COLOR
	});
	me.xcross1 = new THREE.Line( geometry, material );
	me.group.add(me.xcross1);
	geometry = new THREE.Geometry();
	geometry.vertices.push(
		new THREE.Vector3( -size, -size, 0 ),
		new THREE.Vector3( size, size, 0 )
	);
	material = new THREE.LineBasicMaterial({
		color: X_CROSS_COLOR
	});
	me.xcross2 = new THREE.Line( geometry, material );
	me.group.add(me.xcross2);
	
	
	
	me.mathPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
	cutPlanes.push(me.mathPlane);
	
	
	me.setMatrix = function(matrix) {
		//Grabable.Grabable.setMatrix.call(me, matrix); //function does not have atributes
		if(matrix) {
			me.grabParent.matrix.copy(matrix);
			me.grabParent.matrix.decompose(me.grabParent.position, me.grabParent.quaternion, me.grabParent.scale);
		}// else got haxed by wandcontrol so no need to update
		me.update();
		Grabable.grabSignal.emit('setMatrixCalled', me);
		//exports.needsUpdate = true;
	}
	
	me.update = function() {
		me.grabParent.updateMatrixWorld(true);
		var point = new THREE.Vector3().setFromMatrixPosition(me.grabParent.matrixWorld);
		var scale = new THREE.Vector3().setFromMatrixScale(me.camRig);
		var rotation = new THREE.Quaternion().setFromRotationMatrix(me.grabParent.matrixWorld)
		var normal = new THREE.Vector3(0, 0, -1).applyQuaternion(rotation);
		normal.normalize();
		me.mathPlane.setFromNormalAndCoplanarPoint(normal, point);
		me.mesh.scale.copy(scale); //keep visual same phisical size
	}
	me.update();
	
	me.setCutPlanes = function(list) { //do nothing here
	}
	
	me.startHighlightPossible = function() {
		me.isHighlighted = true;
		//me.grid.visible = true;
		if(!me.isSelected) {
			me.outline.material.color.setHex(MODEL_SELECT_COLOR);
			me.xcross1.material.color.setHex(CROSS_SELECT_COLOR);
			me.xcross2.material.color.setHex(CROSS_SELECT_COLOR);
		}
	}

	me.stopHighlightPossible = function() {
		me.isHighlighted = false;
		if(!me.isSelected) {
			//me.grid.visible = false;
			me.outline.material.color.setHex(OUTLINE_IDLE_COLOR);
			me.xcross1.material.color.setHex(X_CROSS_COLOR);
			me.xcross2.material.color.setHex(X_CROSS_COLOR);
		}
	}
	
	me.stopHighlightPossible();
	
	me.setIsSelected = function (isSelected) {
		if(isSelected) {
			//me.isSelected = true;
			me.outline.material.color.setHex(MODEL_GRAB_COLOR);
			me.xcross1.material.color.setHex(CROSS_SELECT_COLOR);
			me.xcross2.material.color.setHex(CROSS_SELECT_COLOR);
			me.isSelected = true;
		}
		else {
			if(me.isHighlighted) {
				me.outline.material.color.setHex(MODEL_SELECT_COLOR);
				me.xcross1.material.color.setHex(CROSS_SELECT_COLOR);
				me.xcross2.material.color.setHex(CROSS_SELECT_COLOR);
			}
			else {
				//me.grid.visible = false;
				me.outline.material.color.setHex(OUTLINE_IDLE_COLOR);
				me.xcross1.material.color.setHex(X_CROSS_COLOR);
				me.xcross2.material.color.setHex(X_CROSS_COLOR);
			}
			me.isSelected = false;			
		}
		
	}
	
	me.startGrab = function() {		
		me.isGrabbed = true;
		Grabable.grabSignal.emit('startGrab', me);
	}

	me.stopGrab = function() {		
		me.isGrabbed = false;
		Grabable.grabSignal.emit('stopGrab', me);
	}
	
	me.disable = function() {
		//me.grid.visible = false;
		me.outline.visible = false;
		me.intersectObj.visible = false;
	}
	me.enable = function() {
		me.stopHighlightPossible();
		me.intersectObj.visible = true;
	}
	
	me.destroy = function() {
		var index = cutPlaneObjs.indexOf(me);
		cutPlaneObjs.splice(index, 1);
		index = cutPlanes.indexOf(me.mathPlane);
		cutPlanes.splice(index, 1);
	}
	
	return me;
}
exports.CutPlane = CutPlane;


})(this.CutPlane = {});