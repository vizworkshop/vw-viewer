
var socketIO = io();//for server served socket.io-client.js

var renderer = new THREE.WebGLRenderer({antialias: false});
renderer.setPixelRatio(Math.floor(window.devicePixelRatio));

document.body.appendChild(renderer.domElement);

var scene = new THREE.Scene();

var vrSystemRoot = new THREE.Object3D();

var vrHeadSet = new THREE.Object3D();
var vrControls = new THREE.VRControls(vrHeadSet);
vrSystemRoot.add(vrHeadSet)

var camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 10000);
vrHeadSet.add(camera);

var effect = new THREE.VREffect(renderer);
effect.setSize(window.innerWidth, window.innerHeight);

var onRenderFunctions = [];

function onResize() {
  effect.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function onVRDisplayPresentChange() {
  onResize();
}

// Resize the WebGL canvas when we resize and also when we change modes.
window.addEventListener('resize', onResize);
window.addEventListener('vrdisplaypresentchange', onVRDisplayPresentChange);

var options = {
        color: 'white',
        background: false,
        corners: 'square'
    };
var enterVR = new webvrui.EnterVRButton(renderer.domElement, options)
		.on("enter", function(){
			console.log("enter VR")
		})
		.on("exit", function(){
			console.log("exit VR");
		})
		.on("error", function(error){
			//console.error(error); //did not find display
		})
		.on("hide", function(){
			document.getElementById("ui").style.display = "none";
			// On iOS there is no button to close fullscreen mode, so we need to provide one
			if(enterVR.state == webvrui.State.PRESENTING_FULLSCREEN) document.getElementById("exit").style.display = "initial";
		})
		.on("show", function(){
			document.getElementById("ui").style.display = "inherit";
			document.getElementById("exit").style.display = "none";
		});
// Add button to the #button element
document.getElementById("button").appendChild(enterVR.domElement);


// Get the HMD
var animationDisplay;
enterVR.getVRDisplay()
	.then(function(display) {
		animationDisplay = display;
		display.requestAnimationFrame(animate);
	})
	.catch(function(){
		// If there is no display available, fallback to window
		animationDisplay = window;
		window.requestAnimationFrame(animate);
	});


function animate(timestamp) {

	// Update VR headset position and apply to camera.
	vrControls.update();
  
	onRenderFunctions.forEach(function(onRenderFct){
		onRenderFct();
	});
  
	if(enterVR.isPresenting()){
		renderer.render(scene,camera);
		effect.render(scene, camera);
	} else {
		renderer.render(scene,camera);
	}
    
  animationDisplay.requestAnimationFrame(animate);// Keep looping.
}

var wrappedSocket = new EventEmitter(); //so we can use different transport libs

// socketIO.on("*", function(event, data) { //only catches first arg, need to add more parameteters to catch more.
socketIO.onevent = function (packet) { //only catches custom events, not connect/disconnect etc	
    var args = packet.data || [];
    // onevent.call (this, packet);    // original call
	// packet.data = ["*"].concat(args);	
    // onevent.call(this, packet);      // additional call to catch-all
	if(args.length == 1){
		wrappedSocket.emit(args[0]);
	}
	else if(args.length == 2){
		wrappedSocket.emit(args[0], args[1]);
	}
	else if(args.length == 3){
		wrappedSocket.emit(args[0], args[1], args[2]);
	}
	else if(args.length == 4){
		wrappedSocket.emit(args[0], args[1], args[2], args[3]);
	}
	else if(args.length == 5){
		wrappedSocket.emit(args[0], args[1], args[2], args[3], args[4]);
	}
    
};

wrappedSocket.on('mirror', function(data) {
	socketIO.emit('mirror', data);
});

var viewerID;
var vWorld;
wrappedSocket.on('idAssigned', function(vID) {
	viewerID = vID;
	vWorld = WorldView.WorldView("", wrappedSocket, renderer, vID, onRenderFunctions);
	vWorld.headNoOri.add(vrSystemRoot);
});

//todo use wand pose to orient and perhaps position VR view in system space.
// var vrViewControlerFromWand;
// wrappedSocket.on('gyroOffset', function(wandID, gyroOffsetQuat, wandQuat) {
	// if(vrViewControlerFromWand === undefined) {
		// var gyroOffQuat = new THREE.Quaternion();
		// gyroOffQuat.set(gyroOffsetQuat[0], gyroOffsetQuat[1], gyroOffsetQuat[2], gyroOffsetQuat[3]);
		// var wandqyay = new THREE.Quaternion();
		// wandqyay.set(wandQuat[0], wandQuat[1], wandQuat[2], wandQuat[3]);
		
		// vrViewControlerFromWand = VRControlerWandHeadset.
			// VRControlerWandHeadset(vrSystemRoot, vrHeadSet, gyroOffQuat, wandqyay);
	// }
	
// });

socketIO.emit("viewerVRClientConnected");

socketIO.on('reconnect', function(attempts) {
	if(vWorld) {
		vWorld.reset();
		socketIO.emit("viewerVRClientConnected", viewerID);
	}
	else {
		socketIO.emit("viewerVRClientConnected");
	}
});




