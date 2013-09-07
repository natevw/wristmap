var http = require('http'),
	f = require('fermata'),
	q = require('queue-async'),
    c = require('lru-cache'),
	concat = require('concat-stream'),
	Canvas = require('canvas');

var MAP_KEY_ULAT = 0,
	MAP_KEY_ULON = 1,
	MAP_KEY_ZOOM = 2,
	MAP_KEY_ROW = 3;

var W = 144, H = 168;

var __img_cache = c({max:1250}),
    __ctx_cache = Object.create(null);

function getPixelsFor(view, cb) {
	EARTH_RADIUS = 6378137.0;
	DEG_TO_RAD = Math.PI / 180.0;
	TILE_MAGNITUDE = 20037508.34;
	TILE_SIZE = 256;
	function mercator_project(c) {
		return {
			x: EARTH_RADIUS * c.lon * DEG_TO_RAD,
			y: EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + c.lat * DEG_TO_RAD / 2))
		};
	}
	
	var pt = mercator_project(view),
		xFrac = (pt.x + TILE_MAGNITUDE) / (2 * TILE_MAGNITUDE),
		yFrac = (TILE_MAGNITUDE - pt.y) / (2 * TILE_MAGNITUDE),
		tilesPerSide = 1 << view.zoom,
		tileX = xFrac * tilesPerSide,
		tileY = yFrac * tilesPerSide;
	//console.log("Tile coords:", xFrac * TILE_SIZE, yFrac * TILE_SIZE);
	
	function toTileNum(x) { x = Math.floor(x); return Math.min(Math.max(x,0), tilesPerSide-1); }
	var HALF_W = W/2, HALF_H = H/2,
		tileMinX = toTileNum(tileX - HALF_W / TILE_SIZE),
		tileMaxX = toTileNum(tileX + HALF_W / TILE_SIZE),
		tileMinY = toTileNum(tileY - HALF_H / TILE_SIZE),
		tileMaxY = toTileNum(tileY + HALF_H / TILE_SIZE);
	
	var tiles = q(),
		ctx = new Canvas(W,H).getContext('2d');
	function loadTile(x,y,cb) {
		var tileBase = f.raw({base:"http://tile.stamen.com"})('toner'),
			tileURL = tileBase(view.zoom,x,y+'.png'),
			_cachedImg = __img_cache.get(tileURL()),
			img = _cachedImg || new Canvas.Image();
		console.log("Loading", tileURL(), (_cachedImg) ? "(from cache)":'');
		if (_cachedImg) {
			process.nextTick(drawImg);
		} else tileURL.get(Buffer(0), function (e,d) {
			if (e) return cb(e);
			else if (d.status !== 200) cb(new Error("Bad status code from tile server: "+d.status));
			img.onload = function () {
				__img_cache.set(tileURL(), img);
				drawImg();
			}
			img.onerror = cb;
			img.src = d.data;
		});
		function drawImg() {
			var drawX = HALF_W + (x - tileX) * TILE_SIZE,
				drawY = HALF_H + (y - tileY) * TILE_SIZE;
			//console.log("Drawing",x,y,"@",drawX,drawY);
			ctx.drawImage(img,drawX,drawY);
			cb();
		}
	}
	for (var y = tileMinY; y <= tileMaxY; y += 1) {
		for (var x = tileMinX; x <= tileMaxX; x += 1) {
			tiles.defer(loadTile,x,y);
		}
	}
	tiles.await(function (e) {
		if (e) return cb(e);
		var px = ctx.getImageData(0,0,W,H).data;
		setTimeout(cb.bind(null,null,px));
	});
}

function bufferFromPx(px, row) {
	var pxOffset = 4 * row * W,
		b = new Buffer(3*W/8);
	b.fill(0);
	for (var i = 0; i < 3*W; i += 1) {
		val = px[pxOffset+4*i];
		var set = px[pxOffset+4*i] > 235,
			bit = /*7 -*/ i % 8;
		b[i/8 << 0] |= set << bit;
	}
	return b;
}

http.createServer(function (req, res) {
	req.pipe(concat(function (d) {
        try {
            d = JSON.parse(d);
        } catch (e) {
            res.writeHead(400, {'Content-Type': 'text/plain'});
            res.end("Invalid JSON");
        }
		var lat = d[MAP_KEY_ULAT] / 1e6,
			lon = d[MAP_KEY_ULON] / 1e6,
			zzz = d[MAP_KEY_ZOOM],
			row = d[MAP_KEY_ROW];
		console.log("Got request",lat,lon,zzz,row);
        
        var k = [d[MAP_KEY_ULAT],d[MAP_KEY_ULON],zzz].join(),
            px = __ctx_cache[k];
        if (px) respondWithPx(null, px);
        else getPixelsFor({lat:lat,lon:lon,zoom:zzz}, function (e,d) {
            if (!e) {
                __ctx_cache[k] = d;
                setTimeout(function () { delete __ctx_cache[k]; }, 10e3);
            }
            respondWithPx(e,d);
        });
        function respondWithPx(e,px) {
            if (e) {
				res.writeHead(502, {'Content-Type': 'text/plain'});
				res.end("Couldn't get map");
			} else {
				var data = {},
					b = bufferFromPx(px,row);
				data[MAP_KEY_ROW] = ['d', b.toString('base64')];
				res.writeHead(200, {'Content-Type': 'application/json'});
				res.end(JSON.stringify(data));
			}
        }
        
	}));
}).listen(process.env.PORT || 8000);