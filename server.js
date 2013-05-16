var sp = require('./sphero.js');

var _ = require('underscore');
var sphero = new sp.Sphero();
var express = require('express');
var $ = require('jquery');
var app = express();

var fs = require('fs'),
    xml2js = require('xml2js');

var parser = new xml2js.Parser();
var desc_regex = /(\d+)<br \/>(.*)/;



//
// Read and format Velib.xml file
//
var readVelibXml = function(callback) {
	console.log('Reading velib.xml...');
	fs.readFile(__dirname + '/velib.xml', function(err, data) {
	    parser.parseString(data, function (err, result) {	    	

	    	var rawStations = result["Document"]["Placemark"];
	    	//console.log(rawStations[0]);
	    	var stations = [];

	    	// Re-format data
	    	stations = _.map(rawStations, function(rawStation) {

	    		var station = {}

	    		// Get station name
	    		station.name = rawStation.name[0];

	    		// Get station coordinates
	    		var rawCoordinates = rawStation.Point[0].coordinates[0].split(',');
	    		station.coordinates = {latitude: rawCoordinates[0], longitude: rawCoordinates[1]};

	    		// Extract station number and address from description
	    		var rawDesc = rawStation.description.toString();
	    		if(desc_regex.test(rawDesc)) {
	    			var matcher = rawDesc.match(desc_regex);
	    			var number = matcher[1];
	    			var address = matcher[2].toString();
					
					address = address.replace('- 0', '');
	    			address = address.replace('- ', '');
	    			address = address.replace('/', '');

		    		station.number = number;
		    		station.address = address;
	    		} else {
	    			console.log('Not match: ', rawDesc);
	    		}

	    		return station;
	    	});

	        callback(stations);
	    });
	});
}


/**
*
*/
var getVelibStationDatas = function(stationNumber, callback) {
	var velibURL = 'http://www.velib.paris.fr/service/stationdetails/paris';

	// Check if station exists
	if(_.find(velibStations, function(station){ return station.number == stationNumber })) {


		$.ajax({
			url: velibURL + '/' + stationNumber,
			type: "GET",
			dataType: "html"
		}).complete(function(res) {
			if(res.status == 200) {
				parser.parseString(res.responseText, function (err, result) {

					var station = {
						available: parseInt(result.station.available[0]),
						free: parseInt(result.station.free[0]),
						total: parseInt(result.station.total[0]),
						ticket: parseInt(result.station.ticket[0]),
						open: parseInt(result.station.open[0]),
						updated: parseInt(result.station.updated[0]),
						connected: parseInt(result.station.connected[0])
					}
					callback(station);
				});
			}
		});
	}
}


// After reading Velib.xml file save it to JSON and set velib stations variable
var velibStations;
readVelibXml(function(_velibDatas) {
	// Save velib datas to JSON file
	fs.writeFile(__dirname+'/velib.json', JSON.stringify(_velibDatas));
	velibStations = _velibDatas;
});


///////////////////////////////////////////////////////////////////////////////
var connected = false;
var ball;

sphero.on("connected", function(_ball){
	console.log("Connected to Sphero !");
	ball = ball;
	connected = true;
});


var connectToSphero = function(callback) {
	console.log('Trying to connect to Sphero...');
	sphero.connect();
	setTimeout(function() {
		if(!connected) {
			connectToSphero(callback);
		} else {
			callback();
		}
	}, 8000);
}



var currentVelibStation = 1005;
var previousStationStatus;
var stationHasChanged = false;


connectToSphero(function() {

	var red = [255, 0, 0];
	var green = [0, 255, 0];
	var orange = [255, 140, 0];
	var blue = [0, 140, 255];

	var setSpheroColor = function(color) {
		sphero.setRGBLED(color[0], color[1], color[2], false);
	}


	//
	// Create a Job to update Velib station status
	//
	var job = function() {

		console.log('Get datas for station: ' + currentVelibStation);

		// Get station datas
		getVelibStationDatas(currentVelibStation, function(station) {
			console.log(station);

			if(stationHasChanged) {
				setSpheroColor(blue);
				sphero.setBackLED(1);
				sphero.setHeading(180);
				setTimeout(function() {
					sphero.setHeading(180);
					setTimeout(function() {
						sphero.setHeading(180);
						setTimeout(function() {
							sphero.setHeading(180);
							sphero.setBackLED(0);
						}, 500); 
					}, 500); 
				}, 500); 
				
				
				
				stationHasChanged = false;
			}

			if(station.available >= 10) {
				setSpheroColor(green);
			} else if(station.available >= 5 && station.available < 10 ) {
				setSpheroColor(orange);
			} else {
				setSpheroColor(red);
			}

			previousStationStatus = station;
		});

	}

	// Start http server
	app.listen(3000);

	// Launch job
	job();

	// Execute job each 10 seconds
	setInterval(job, 5000);


});



app.get('/station/:id', function(req, res) {
	var newVelibStation = parseInt(req.param('id'));
	if(newVelibStation != currentVelibStation) {
		stationHasChanged = true;
		currentVelibStation = newVelibStation;
	}
	res.send({currentVelibStation: currentVelibStation});
});
