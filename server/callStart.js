




(function(){
	
try {
	console.log("my test");
	s = require('./server_main');
	s.start();
	
} catch (err) {
    console.log( "Error: " + err);
}

})();


