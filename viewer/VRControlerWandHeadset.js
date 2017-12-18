//todo use wand pose to orient and perhaps position VR view in system space.
(function(exports) {

var PHONE_TO_HEADSET_M = new THREE.Matrix4(); 
PHONE_TO_HEADSET_M.makeRotationY(Math.PI);
var PHONE_TO_HEADSET_Q = new THREE.Quaternion();
PHONE_TO_HEADSET_Q.setFromRotationMatrix(PHONE_TO_HEADSET_M);

//positive is counterclockwise
//VR is +z  out of back of head, +x to the right.  Wand is z + out of top of phone
var m = new THREE.Matrix4().makeRotationX(-Math.PI/2);
m.multiply( new THREE.Matrix4().makeRotationZ(Math.PI) );
var WAND_TO_CAMERA_ROTATION = new THREE.Quaternion();
WAND_TO_CAMERA_ROTATION.setFromRotationMatrix(m);
WAND_TO_CAMERA_ROTATION.inverse();

var D2R = Math.PI / 180;

var degtorad = Math.PI / 180; // Degree-to-Radian conversion

function compassHeading( alpha, beta, gamma ) {

  var _x = beta  ? beta  * degtorad : 0; // beta value
  var _y = gamma ? gamma * degtorad : 0; // gamma value
  var _z = alpha ? alpha * degtorad : 0; // alpha value

  var cX = Math.cos( _x );
  var cY = Math.cos( _y );
  var cZ = Math.cos( _z );
  var sX = Math.sin( _x );
  var sY = Math.sin( _y );
  var sZ = Math.sin( _z );

  // Calculate Vx and Vy components
  var Vx = - cZ * sY - sZ * sX * cY;
  var Vy = - sZ * sY + cZ * sX * cY;

  // Calculate compass heading
  var compassHeading = Math.atan( Vx / Vy );

  // Convert compass heading to use whole unit circle
  if( Vy < 0 ) {
    compassHeading += Math.PI;
  } else if( Vx < 0 ) {
    compassHeading += 2 * Math.PI;
  }

  return compassHeading * ( 180 / Math.PI ); // Compass Heading (in degrees)

}


exports.VRControlerWandHeadset = function(vrRoot, headSet, wandGyroOffset, wandQuat) {
	var me = {};
	me.vrRoot = vrRoot;
	me.headSet = headSet;
	me.gyroOffset = wandGyroOffset;
	me.headSetGyroOffset = new THREE.Quaternion();
	me.wandQuat = wandQuat;
	
	var q = new THREE.Quaternion();	
	var onDeviceOrientation = function(eventData) {
		if(me.vrRoot.quaternion.equals(q) && !(me.headSet.quaternion.equals(q)) ) {
			// gamma is the left-to-right tilt in degrees, where right is positive
			var tiltLR = eventData.gamma * D2R;
			// beta is the front-to-back tilt in degrees, where front is positive
			var tiltFB = eventData.beta * D2R;
			// alpha is the compass direction the device is facing in degrees
			var dir = eventData.alpha * D2R;// + Math.PI; //+ PI because alpha is 0 facing south
			//put in VR headset coordinate system
			var headSetEuler = new THREE.Euler();
			headSetEuler.setFromQuaternion(me.headSet.quaternion);
			
			var angle = compassHeading(eventData.alpha,eventData.beta ,eventData.gamma) * D2R;
			
			//console.log(headSetEuler, headSetEuler.y);
			if(headSetEuler.y > .01 || headSetEuler.y < -.01) {
				var offset = angle - headSetEuler.y; //yaw
				me.vrRoot.quaternion.setFromEuler(new THREE.Euler(0, offset, 0));
			}
		}
	}
	
	if (window.DeviceOrientationEvent) {
		window.addEventListener('deviceorientation', onDeviceOrientation, false);
	}
	
	return me;
}
	
})(this.VRControlerWandHeadset = {});