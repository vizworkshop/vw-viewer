(function(exports) {

//var WandModel = require('../shared/WandModel.js');

var SOLID_OPACITY = .7;
var WAND_SOLID_COLORS = [0x8484FF, 0xFF8484, 0x84FF84];
var WAND_ACTIVE_COLORS = [0x3333FF, 0xFF3333, 0x33FF33];

var OUTLINE_COLOR = 0xEEEEEE;
var OUTLINE_SELECTED_COLOR = 0x58cc58;
var OUTLINE_GRAB_COLOR = 0x22CC22;
var OUTLINE_THICKNESS_FACTOR = .03;
var PHONE_SCALE = .35;
var PHONE_LENGTH = .10;  //should refactor this with model.length
var GRAB_COLOR = 0x000000;
//var GRAB_OPACITY = .9;
var TOOL_ROTATION = 45;

var ACTIVE_EMMISIVE_INTENSITY = 1;
var SELECTED_EMMISIVE_INTENSITY = .5;
var DEFAULT_EMMISIVE_INTENSITY = .1;
var LIGHT_REAL_WORLD_DISTANCE = .1; //tough as small size screen makes this distance feel bigger.
var LIGHT_INTENSITY = .2;

function WandView(wandModel, loadedModelDic) {
	var wandView = {};
	wandView.wandModel = wandModel;
	wandView.modelDic = loadedModelDic;
	wandView.isHidden = false;
	var wandGroup = new THREE.Object3D();
	var wandSolid = new THREE.Object3D();
	var colorID = wandModel.id % WAND_SOLID_COLORS.length;
	var colorDefault = WAND_SOLID_COLORS[colorID];
	var colorActive = WAND_ACTIVE_COLORS[colorID];
	
	var solidMaterial = new THREE.MeshLambertMaterial({ color: colorDefault })
	//var solidMaterial = new THREE.MeshLambertMaterial()
	solidMaterial.transparent = true;
	solidMaterial.emissive.setHex(colorDefault);
	solidMaterial.emissiveIntensity = DEFAULT_EMMISIVE_INTENSITY;
	//solidMaterial.opacity = SOLID_OPACITY;
	//solidMaterial.side = THREE.DoubleSide;
	
	var noDepthWrite = new THREE.MeshLambertMaterial({ color: OUTLINE_COLOR })
	noDepthWrite.depthWrite = false;
	noDepthWrite.depthTest = false;
	noDepthWrite.transparent = true;
	noDepthWrite.opacity = SOLID_OPACITY;
	noDepthWrite.emissive.setHex(OUTLINE_COLOR);
	noDepthWrite.emissiveIntensity = .5;
	
	var phoneWidth = PHONE_LENGTH * .6;
	var phoneHeight = PHONE_LENGTH;
	var phoneDepth = PHONE_LENGTH * .05;
	var wandGeo = new THREE.BoxGeometry(phoneWidth, phoneHeight, phoneDepth);
	//possible hack to get self transparncy on faces right https://github.com/mrdoob/three.js/issues/2476
	//create indvidual mesh for each face for proper transparncy
	// for(faceIndex in wandGeo.faces) { 
		// var face = wandGeo.faces[faceIndex];
		// var tri = new THREE.Geometry();
		// tri.faces.push( face );
		
		
		// var vertCenter = new THREE.Vector3();//find center of verts
		// vertCenter.add(wandGeo.vertices[face.a]);//for each vert, newPos = vertPos - center, and geo.pos = center
		// vertCenter.add(wandGeo.vertices[face.b]);
		// vertCenter.add(wandGeo.vertices[face.c]);
		// vertCenter.multiplyScalar(1/3.0);
		
		// tri.vertices.push(
			// new THREE.Vector3().subVectors(wandGeo.vertices[face.a], vertCenter),
			// new THREE.Vector3().subVectors(wandGeo.vertices[face.b], vertCenter),
			// new THREE.Vector3().subVectors(wandGeo.vertices[face.c], vertCenter)
		// );
		// face.a = 0; face.b = 1; face.c = 2;
		// var triMesh = new THREE.Mesh(tri, solidMaterial);
		// triMesh.position.copy(vertCenter);
		// wandSolid.add(triMesh);
	// }
	
	var phoneGroup = new THREE.Object3D(); 
	phoneGroup.position.y = -PHONE_LENGTH/2 * PHONE_SCALE;
	phoneGroup.scale.set(PHONE_SCALE, PHONE_SCALE, PHONE_SCALE);
	wandSolid.add(phoneGroup);
	
	//wandGeo.translate(0, 0, wandModel.length/4.0);
	//var solid = new THREE.Mesh(wandGeo, solidMaterial);
	var solid = new THREE.Mesh(wandGeo, noDepthWrite);
	solid.castShadow = true;
	phoneGroup.add(solid);
	
	
	// var transparentWireframe = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR })
	// transparentWireframe.transparent = true;
	
	// solid = new THREE.Mesh(wandGeo, transparentWireframe);
	// solid.position.y = -wandModel.length/4.0;
	// solid.scale.x = 1.1;
	// solid.scale.y = 1.1;
	// solid.scale.z = .9;
	// wandSolid.add(solid);
	
	//make another wireframe that shows through all (solid?) models.
		
	var outlineThickness = wandModel.length * OUTLINE_THICKNESS_FACTOR;
	
	var outline = new THREE.BoxGeometry(phoneWidth, outlineThickness, phoneDepth * 1.01);
	solid = new THREE.Mesh(outline, solidMaterial);
	solid.position.y = phoneHeight/2 + outlineThickness / 2;
	solid.renderOrder = 1;
	phoneGroup.add(solid);
	
	outline = new THREE.BoxGeometry(phoneWidth, outlineThickness, phoneDepth * 1.01);
	solid = new THREE.Mesh(outline, solidMaterial);
	solid.position.y = -1 * (phoneHeight/2 + outlineThickness / 2);
	solid.renderOrder = 1;
	phoneGroup.add(solid);
	
	outline = new THREE.BoxGeometry(outlineThickness, phoneHeight + (outlineThickness * 2), phoneDepth * 1.01);
	solid = new THREE.Mesh(outline, solidMaterial);
	solid.position.x = phoneWidth/2 + outlineThickness / 2;
	solid.renderOrder = 1;
	phoneGroup.add(solid);
	
	outline = new THREE.BoxGeometry(outlineThickness, phoneHeight + (outlineThickness * 2), phoneDepth * 1.01);
	solid = new THREE.Mesh(outline, solidMaterial);
	solid.position.x = -1 * (phoneWidth/2 + outlineThickness / 2);
	solid.renderOrder = 1;
	phoneGroup.add(solid);
	
	wandSolid.rotation.x = TOOL_ROTATION * Math.PI / 180;
	wandGroup.add(wandSolid);
	
	// var length = wandModel.length/2.0;
	// var line = buildAxis( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, length ), OUTLINE_COLOR, false );
	// wandGroup.add(line);
	
	//var lineMaterial = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR })
	
	var lineGeo = new THREE.CylinderGeometry(PHONE_LENGTH/200.0, PHONE_LENGTH/200.0, wandModel.length/2.0, 6, 1, false);
	var line = new THREE.Mesh(lineGeo, solidMaterial);
	solid.renderOrder = 1;
	line.rotation.x = 90 * Math.PI / 180;
	line.position.z = wandModel.length/4.0 + wandModel.length/500; //push it out along z just a bit to keep back from sticking out of square.
	wandGroup.add(line);
	
	// var wandLight = new THREE.PointLight(colorDefault, LIGHT_INTENSITY, LIGHT_REAL_WORLD_DISTANCE, 2); //.6
	// wandGroup.add(wandLight);
	
	wandView.wandGroup = wandGroup;
	wandGroup.matrixAutoUpdate = false;
	
	wandModel.on('newMatrix', function() {
		wandGroup.matrix.copy(wandModel.matrix);
		// wandLight.distance = LIGHT_REAL_WORLD_DISTANCE * wandModel.matrix.getMaxScaleOnAxis();
		wandGroup.updateMatrixWorld(true);
	});
	
	wandModel.on('newToolMode', function(newMode, oldMode, optionalData) {
		wandView.update();
	});
	
	wandModel.on('newIntersectModel', function() {
		wandView.update();
	});
	
	wandModel.on('newIntersectModel', function() {
		wandView.update();
	});
	
	wandModel.on('newSelectedModel', function() {
		wandView.update();
	});
	
	wandView.update = function() {
		//feedback for model selection state
		if(wandModel.intersectedModel) {
			solidMaterial.color.setHex(colorActive);
		}
		else if(wandModel.selectedModel) {
			solidMaterial.color.setHex(colorDefault);
			noDepthWrite.emissive.setHex(OUTLINE_GRAB_COLOR);
			noDepthWrite.emissiveIntensity = SELECTED_EMMISIVE_INTENSITY;
		}
		else {
			solidMaterial.color.setHex(colorDefault);
		}
		
		//feedback for grabbing
		var currentMode = wandView.wandModel.toolMode;
		if(currentMode == wandModel.modes.GRABBING) {			
			noDepthWrite.color.setHex(OUTLINE_GRAB_COLOR);
			noDepthWrite.emissive.setHex(OUTLINE_GRAB_COLOR);
			noDepthWrite.emissiveIntensity = ACTIVE_EMMISIVE_INTENSITY;
		}
		else if(currentMode == wandModel.modes.SELECT_POSSIBLE) { //overlaps with if(wandModel.intersectedModel) {
		}
		else if(currentMode == wandModel.modes.SELECTING) {
			noDepthWrite.color.setHex(OUTLINE_GRAB_COLOR);
			noDepthWrite.emissive.setHex(OUTLINE_GRAB_COLOR);
			noDepthWrite.emissiveIntensity = ACTIVE_EMMISIVE_INTENSITY;
		}
		else if(currentMode == wandModel.modes.MODEL_GRAB) {
			noDepthWrite.color.setHex(OUTLINE_GRAB_COLOR);
			noDepthWrite.emissive.setHex(OUTLINE_GRAB_COLOR);
			noDepthWrite.emissiveIntensity = ACTIVE_EMMISIVE_INTENSITY;
		}
		else { //idle
			noDepthWrite.color.setHex(OUTLINE_COLOR);
			noDepthWrite.emissive.setHex(OUTLINE_COLOR);
			noDepthWrite.emissiveIntensity = ACTIVE_EMMISIVE_INTENSITY;
			if(wandModel.selectedModel) {			
				noDepthWrite.color.setHex(OUTLINE_SELECTED_COLOR);
			}
		}
		
		if(wandModel.selectedModel) {
			noDepthWrite.emissive.setHex(OUTLINE_GRAB_COLOR);
			noDepthWrite.emissiveIntensity = SELECTED_EMMISIVE_INTENSITY;
		}
	}

	wandView.hide = function() {
		wandView.isHidden = true;
		wandView.wandGroup.visible = false;
	}
	wandView.show = function() {
		wandView.isHidden = false;
		wandView.wandGroup.visible = true;
	}
	
	wandModel.on('disable', function() {
		wandView.hide();
	});
	// wandModel.on('enable', function() {
		// wandView.show();
	// });
	
	wandModel.on('onCalibrating', function() {
		if(wandModel.isCalibrating) {
			wandView.hide();
		}
		else if(!wandModel.isFixedPosMode) {
			wandView.show();
		}
	});
	
	wandModel.on('onIsFixedPosMode', function() {
		if(wandModel.isFixedPosMode) {
			if(!wandView.isHidden) {
				wandView.hide();
			}
		}
		else if(!wandModel.isCalibrating) {
			wandView.show();
		}
	});
	
	//to show wand when grabbing while fixed in place
	// wandModel.on('onSetIsTouched', function() { 
		// if(wandModel.isFixedPosMode) {
			// if(wandModel.isTouched) {
				// wandView.show();
			// }
			// else {
				// wandView.hide();
			// }
		// }
	// });	
	// function gotViewerBasedInput() {
		// if(wandModel.isFixedPosMode && !wandView.isHidden) {
			// wandView.hide();
		// }
	// }
	// wandModel.on('onOrbit', gotViewerBasedInput);
	// wandModel.on('onScale', gotViewerBasedInput);
	// wandModel.on('onPan', gotViewerBasedInput);
	// wandModel.on('onRoll', gotViewerBasedInput);
	
	return wandView;
}
exports.WandView = WandView;

function buildAxis( src, dst, colorHex, dashed ) {
        var geom = new THREE.Geometry(),
            mat; 
        if(dashed) {
                mat = new THREE.LineDashedMaterial({ linewidth: 3, color: colorHex, dashSize: 3, gapSize: 3 });
        } else {
                mat = new THREE.LineBasicMaterial({ linewidth: 3, color: colorHex });
        }
        geom.vertices.push( src.clone() );
        geom.vertices.push( dst.clone() );
        geom.computeLineDistances(); // otherwise dashed lines will appear as simple plain lines
        var axis = new THREE.Line( geom, mat, THREE.LineSegments );
        return axis;
}

})(this.WandView = {});
