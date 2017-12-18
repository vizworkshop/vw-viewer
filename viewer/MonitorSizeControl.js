(function(exports) {

var socket;
var ipAddressList;
var portNumber;
var monitorManager;
exports.closeMeCallbackFunc;

exports.setup = function(socketUsed, mm) {
	socket = socketUsed;
	socket.on('serverIPAddresses', onServerIPAddresses);
	monitorManager = mm;
}

var onServerIPAddresses = function (liosty, portNumbery) {
	ipAddressList = liosty;
	portNumber = portNumbery;
}

exports.sendSizes = function () {
	var screenSizes = [];
	for (var i = 0; i < monitorManager.mList.length; i++) {
		var ssData = {};
		var monitor = monitorManager.mList[i];
		ssData.pixelX = monitor.xPosPX;
		ssData.pixelY = monitor.yPosPX;
		ssData.width = Number(document.getElementById('mWidth' + monitor.id).value);
		ssData.height = Number(document.getElementById('mHeight' + monitor.id).value);
		screenSizes.push(ssData);
	}
	socket.emit('updateMonitorSizes', screenSizes);
}

exports.getHtml = function() {
	var html = '<div class="setupBox">';
	var monitors = '<p>For each display at the operating system\'s pixel position, enter the image width and height in meters.</p>';
	var table = [];
	table.push(["Display Pixel Position", 'Width in Meters', 'Height in Meters']);
	for (var i = 0; i < monitorManager.mList.length; i++) {
		var monitor = monitorManager.mList[i];
		table.push(['X: ' + monitor.xPosPX + ' Y: ' + monitor.yPosPX,
						'<input type="number" value="' + monitor.widthM  + '" id="'+ 'mWidth' + monitor.id + '">',
						'<input type="number" value="' + monitor.heightM  + '" id="'+ 'mHeight' + monitor.id + '">']);
	}
	var newArray = table[0].map(function(col, i) { 
	  return table.map(function(row) { 
		return row[i] 
	  })
	});
	var tableHTML = '<table class="table">'
	for (var i = 0; i < newArray.length; i++) {
		tableHTML = tableHTML + '<tr>';
		for(var j = 0; j < newArray[i].length; j++) {
			if(j == 0) {
				tableHTML = tableHTML + '<th>' + newArray[i][j] + '</th>';
			}
			else {
				tableHTML = tableHTML + '<td>' + newArray[i][j] + '</td>';
			}
		}
		tableHTML = tableHTML + '</tr>';
	}
	html = html + monitors + tableHTML + '</table>';
	html = html + '<hr>';
	if(ipAddressList) {
		var appHTML = '<h4>Phone App Setup</h4> <p>To download the phone app: Find the network connection shared betwen the phone and computer.  Then scan the QR Code or type the web address into the phone\'s web browser.</p>';
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
			var rowHTML =  '<td>http://' + ipObj.address + ':' + portNumber + '/android</td>';
			appHTML = appHTML + rowHTML;
		}
		appHTML = appHTML + '</tr>';
		
		appHTML = appHTML + '<tr>';
		for(var i = 0; i < ipAddressList.length; i++) {
			var ipObj = ipAddressList[i];
			var rowHTML =  '<td><div id="appaddressqrcode' + i +'"></div></td>';
			appHTML = appHTML + rowHTML;
		}
		appHTML = appHTML + '</tr> </table>';
		html = html + appHTML;
	}
	else {
		html = html + '<h4>Ooops, we have not gotten network adapter information yet.  Try closing this dialog then opening again.</h4>'
	}
	
	html = html + '</div>';  //setupBox
	return html;
}

exports.showQRCodes = function() {
	if(ipAddressList) {
		for(var i = 0; i < ipAddressList.length; i++) {
			var ipObj = ipAddressList[i];
			var address = 'http://' + ipObj.address + ':' + portNumber + '/android'
			new QRCode(document.getElementById("appaddressqrcode"+i), {
				text: address,
				width: 128,
				height: 128});
		}
	}
}


})(this.MONITOR_SIZE_CONTROL = {});