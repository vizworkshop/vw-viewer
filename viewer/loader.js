
(function(exports) {

//var model;

function removeReferences(removeme){
  try{
    removeme.traverse(function(ob){
      try{
        ob.geometry.dispose();
      }catch(e){}
      try{
        ob.material.dispose();
      }catch(e){} 
      try{
        ob.dispose()
      }catch(e){}
    });
  }catch(e){}
}


function setScene(scene, modelID, callback) {
	var rooty = new THREE.Object3D();	
	while ( scene.children.length > 0 ) {
		rooty.add(scene.children[ 0 ]);
	}
	loadedCallbackFunc(rooty, modelID);
}

exports.loadURL = function(url, loadedCallback, modelID) {
	if(url != '') {
		var ext = url.substr(url.lastIndexOf('.') + 1).toLowerCase();
		if(ext === 'dae') {
			var loader = new THREE.ColladaLoader();
			loader.options.convertUpAxis = true;
			loader.load(url, function ( collada ) {
				loadedCallback(collada.scene, modelID);
			} );
		}
		else if(ext === 'obj') {
			var loader = new THREE.OBJLoader();
			loader.load(url, function ( objectData ) {
				loadedCallback( objectData, modelID );
			} );
		}
		else if(ext === 'stl') {
			var loader = new THREE.STLLoader();
			loader.load(url, function ( geometry ) {
				var material = new THREE.MeshPhongMaterial();
				var mesh = new THREE.Mesh( geometry, material );
				loadedCallback( mesh, modelID );
			} );
		}
		else if(ext === 'fbx') {
			var loader = new THREE.FBXLoader();
			loader.load(url, function ( object3d ) {
				console.log(url);
				loadedCallback( object3d, modelID );
			} );
		}
		else if(ext === 'json') {
			var loader = new THREE.ObjectLoader();
			loader.load(url, function ( objectData ) {
				loadedCallback( objectData, modelID );
			} );
		}
		else {
			alert( 'Unsupported file format (' + ext +  ').' );
		}
	}
}

exports.loadModel = function(serverAddress, modelData, loadedCallback) {
	if(modelData.type ==  'objmtl') {
		//mtlFile
		var mtlLoader = new THREE.MTLLoader();
		mtlLoader.setPath( serverAddress + '/loadModel/' + modelData.id + '/');
		var onLoaded = function( materials ) {
			materials.preload();
			var objLoader = new THREE.OBJLoader();
			objLoader.setMaterials( materials );
			objLoader.setPath( serverAddress + '/' );
			objLoader.load(modelData.objFile, function ( object ) {
				loadedCallback(object, modelData.id);
			});
		}
		mtlLoader.load(modelData.mtlFile, onLoaded);
	}
}

})(this.LOADER = {});