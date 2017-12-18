
var VIEWER_MODEL = require('./ViewerModel');

var viewerModelList = [];
var viewerCount = 0;
var makeViewerModel = function(markerIDList) {
	var viewerModel = new VIEWER_MODEL.ViewerModel(viewerCount, markerIDList);
	viewerCount = viewerCount + 1;
	viewerModelList.push(viewerModel);
	return viewerModel;
}
exports.makeViewerModel = makeViewerModel;