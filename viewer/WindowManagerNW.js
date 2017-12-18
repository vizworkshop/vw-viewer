(function(exports) {
	var gui = require('nw.gui');
	var win = gui.Window.get();
	gui.Screen.Init();
	var windowedPosX, windowedPosY;
	var subWindows = [];
	var idOfScreenThatMasterIsOn = undefined;
	var freeScreens = [];
	
	
	var setupSubWindow = function(subWindow) {
		if(subWindow) {
			var aScreen = freeScreens.pop();
			subWindow.x = aScreen.bounds.x;
			subWindow.y = aScreen.bounds.y;
			subWindow.enterFullscreen();
			//subWindow.setShowInTaskbar(false); //seems to make windows not cover taskbar
			subWindows.push(subWindow);
			subWindow.focus();
		}
	}
	
	exports.goFullscreen = function() {
		windowedPosX = win.x;
		windowedPosY = win.y;
		//find screen main window should go on
		idOfScreenThatMasterIsOn = undefined;
		//look for center of window match
		winCenterX = win.x + win.width / 2;
		winCenterY = win.y + win.height / 2;
		for (var i = 0; i < gui.Screen.screens.length; i++) {
			var sp = gui.Screen.screens[i].bounds;
			if(sp.x <= winCenterX && sp.x + sp.width > winCenterX &&
				sp.y <= winCenterY && sp.y + sp.height > winCenterY) {
				idOfScreenThatMasterIsOn = gui.Screen.screens[i].id;
			}
		}
		if(idOfScreenThatMasterIsOn === undefined) {
			//look for upper left window match
			for (var i = 0; i < gui.Screen.screens.length; i++) {
				var sp = gui.Screen.screens[i].bounds;
				if(sp.x <= win.x && sp.x + sp.width > win.x &&
					sp.y <= win.y && sp.y + sp.height > win.y) {
					console.log(sp, win.x)
					idOfScreenThatMasterIsOn = gui.Screen.screens[i].id;
				}
			}
		}
		if(idOfScreenThatMasterIsOn === undefined) {
			//put on origin screen
			winCenterX = win.x + win.width / 2;
			winCenterY = win.y + win.height / 2;
			for (var i = 0; i < gui.Screen.screens.length; i++) {
				var sp = gui.Screen.screens[i].bounds;
				if(sp.x === 0 && sp.y === 0) {
					idOfScreenThatMasterIsOn = gui.Screen.screens[i].id;
				}
			}
		}
		if(idOfScreenThatMasterIsOn === undefined) {
			//just put on first screen in list
			idOfScreenThatMasterIsOn = gui.Screen.screens[0].id
		}
				
		freeScreens = [];
		for (var i = 0; i < gui.Screen.screens.length; i++) {
			var screen = gui.Screen.screens[i];
			if(screen.id === idOfScreenThatMasterIsOn) {					
				win.x = gui.Screen.screens[i].bounds.x;
				win.y = gui.Screen.screens[i].bounds.y;
				win.enterFullscreen();
				win.show();
				win.focus();
				win.setAlwaysOnTop(true);
			}
			else {
				freeScreens.push(screen);
				gui.Window.open('viewer/index.html', {'new_instance': false}, setupSubWindow);			
			}
		}
	}
		
	exports.leaveFullscreen = function() {
		win.setAlwaysOnTop(false);
		win.leaveFullscreen();
		win.focus();
		win.x = windowedPosX;
		win.y = windowedPosY;
		for(var i = 0; i < subWindows.length; i++) {
			subWindows[i].close();
		}
		subWindows = [];
	}

})(this.WindowManager = {});
