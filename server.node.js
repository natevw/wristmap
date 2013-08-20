var http = require('http'),
	concat = require('concat-stream'),
	Canvas = require('canvas');

var MAP_KEY_ULAT = 0,
	MAP_KEY_ULON = 1,
	MAP_KEY_ZOOM = 2,
	MAP_KEY_ROW = 3;

var W = 144, H = 168,
	ctx = new Canvas(W,H).getContext('2d');

http.request("http://d.tile.stamen.com/toner/12/690/1452.png", function (res) {
	res.pipe(concat(function (d) {
		console.log("Image data loaded");
		var img = new Canvas.Image();
		img.src = d;
		ctx.drawImage(img,0,0);
	}));
}).end();

function getPixelsFor(view, cb) {
	var px = ctx.getImageData(0,0,W,H).data;
	setTimeout(cb.bind(null,null,px));
}

function bufferFromPx(px, row) {
	var pxOffset = 4 * row * W,
		b = new Buffer(3*W/8);
	b.fill(0);
	for (var i = 0; i < 3*W; i += 1) {
		val = px[pxOffset+4*i];
		if (val > 0 && val < 255) console.log(val);
		var set = px[pxOffset+4*i] > 235,
			bit = /*7 -*/ i % 8;
		b[i/8 << 0] |= set << bit;
	}
	return b;
}

http.createServer(function (req, res) {
	req.pipe(concat(function (d) {
		d = JSON.parse(d);
		var lat = d[MAP_KEY_ULAT] / 1e6,
			lon = d[MAP_KEY_ULON] / 1e6,
			zzz = d[MAP_KEY_ZOOM],
			row = d[MAP_KEY_ROW];
		console.log("Got request",lat,lon,zzz,row);
		
		getPixelsFor({lat:lat,lon:lon,z:zzz}, function (e,px) {
			if (e) {
				res.writeHead(502, {'Content-Type': 'text/plain'});
				res.end("Couldn't get map");
			} else {
				var data = {},
					b = bufferFromPx(px,row);
				//data[MAP_KEY_ROW] = ['d', Buffer(20).toString('base64')];
				data[MAP_KEY_ROW] = ['d', b.toString('base64')];
				res.writeHead(200, {'Content-Type': 'application/json'});
				res.end(JSON.stringify(data));
			}
		});
	}));
}).listen(8000);