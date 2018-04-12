import {GridLayer} from './GridLayer';
import * as Browser from '../../core/Browser';
import * as Util from '../../core/Util';
import * as DomEvent from '../../dom/DomEvent';
import * as DomUtil from '../../dom/DomUtil';


/*
 * @class TileLayer
 * @inherits GridLayer
 * @aka L.TileLayer
 * Used to load and display tile layers on the map. Extends `GridLayer`.
 *
 * @example
 *
 * ```js
 * L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png?{foo}', {foo: 'bar'}).addTo(map);
 * ```
 *
 * @section URL template
 * @example
 *
 * A string of the following form:
 *
 * ```
 * 'http://{s}.somedomain.com/blabla/{z}/{x}/{y}{r}.png'
 * ```
 *
 * `{s}` means one of the available subdomains (used sequentially to help with browser parallel requests per domain limitation; subdomain values are specified in options; `a`, `b` or `c` by default, can be omitted), `{z}` — zoom level, `{x}` and `{y}` — tile coordinates. `{r}` can be used to add "&commat;2x" to the URL to load retina tiles.
 *
 * You can use custom keys in the template, which will be [evaluated](#util-template) from TileLayer options, like this:
 *
 * ```
 * L.tileLayer('http://{s}.somedomain.com/{foo}/{z}/{x}/{y}.png', {foo: 'bar'});
 * ```
 */


export var TileLayer = GridLayer.extend({

	// @section
	// @aka TileLayer options
	options: {
		// @option minZoom: Number = 0
		// The minimum zoom level down to which this layer will be displayed (inclusive).
		minZoom: 0,

		// @option maxZoom: Number = 18
		// The maximum zoom level up to which this layer will be displayed (inclusive).
		maxZoom: 18,

		// @option subdomains: String|String[] = 'abc'
		// Subdomains of the tile service. Can be passed in the form of one string (where each letter is a subdomain name) or an array of strings.
		subdomains: 'abc',

		// @option errorTileUrl: String = ''
		// URL to the tile image to show in place of the tile that failed to load.
		errorTileUrl: '',

		// @option zoomOffset: Number = 0
		// The zoom number used in tile URLs will be offset with this value.
		zoomOffset: 0,

		// @option tms: Boolean = false
		// If `true`, inverses Y axis numbering for tiles (turn this on for [TMS](https://en.wikipedia.org/wiki/Tile_Map_Service) services).
		tms: false,

		// @option zoomReverse: Boolean = false
		// If set to true, the zoom number used in tile URLs will be reversed (`maxZoom - zoom` instead of `zoom`)
		zoomReverse: false,

		// @option detectRetina: Boolean = false
		// If `true` and user is on a retina display, it will request four tiles of half the specified size and a bigger zoom level in place of one to utilize the high resolution.
		detectRetina: false,

		// @option crossOrigin: Boolean|String = false
		// Whether the crossOrigin attribute will be added to the tiles.
		// If a String is provided, all tiles will have their crossOrigin attribute set to the String provided. This is needed if you want to access tile pixel data.
		// Refer to [CORS Settings](https://developer.mozilla.org/en-US/docs/Web/HTML/CORS_settings_attributes) for valid String values.
		crossOrigin: false
	},

	initialize: function (url, options) {

		this._url = url;

		options = Util.setOptions(this, options);

		// detecting retina displays, adjusting tileSize and zoom levels
		if (options.detectRetina && Browser.retina && options.maxZoom > 0) {

			options.tileSize = Math.floor(options.tileSize / 2);

			if (!options.zoomReverse) {
				options.zoomOffset++;
				options.maxZoom--;
			} else {
				options.zoomOffset--;
				options.minZoom++;
			}

			options.minZoom = Math.max(0, options.minZoom);
		}

		if (typeof options.subdomains === 'string') {
			options.subdomains = options.subdomains.split('');
		}

		// for https://github.com/Leaflet/Leaflet/issues/137
		if (!Browser.android) {
			this.on('tileunload', this._onTileRemove);
		}
	},

	// @method setUrl(url: String, noRedraw?: Boolean): this
	// Updates the layer's URL template and redraws it (unless `noRedraw` is set to `true`).
	setUrl: function (url, noRedraw) {
		this._url = url;

		if (!noRedraw) {
			this.redraw();
		}
		return this;
	},

	// @method createTile(coords: Object, done?: Function): HTMLElement
	// Called only internally, overrides GridLayer's [`createTile()`](#gridlayer-createtile)
	// to return an `<img>` HTML element with the appropriate image URL given `coords`. The `done`
	// callback is called when the tile has been loaded.
	createTile: function (coords, done) {
		var tile = document.createElement('img');

		DomEvent.on(tile, 'load', Util.bind(this._tileOnLoad, this, done, tile));
		DomEvent.on(tile, 'error', Util.bind(this._tileOnError, this, done, tile));

		if (this.options.crossOrigin || this.options.crossOrigin === '') {
			tile.crossOrigin = this.options.crossOrigin === true ? '' : this.options.crossOrigin;
		}

		/*
		 Alt tag is set to empty string to keep screen readers from reading URL and for compliance reasons
		 http://www.w3.org/TR/WCAG20-TECHS/H67
		*/
		tile.alt = '';

		/*
		 Set role="presentation" to force screen readers to ignore this
		 https://www.w3.org/TR/wai-aria/roles#textalternativecomputation
		*/
		tile.setAttribute('role', 'presentation');

		tile.src = this.getTileUrl(coords);

		return tile;
	},

	// @section Extension methods
	// @uninheritable
	// Layers extending `TileLayer` might reimplement the following method.
	// @method getTileUrl(coords: Object): String
	// Called only internally, returns the URL for a tile given its coordinates.
	// Classes extending `TileLayer` can override this function to provide custom tile URL naming schemes.
	getTileUrl: function (coords) {
		var data = {
			r: Browser.retina ? '@2x' : '',
			s: this._getSubdomain(coords),
			x: coords.x,
			y: coords.y,
			z: this._getZoomForUrl()
		};
		if (this._map && !this._map.options.crs.infinite) {
			var invertedY = this._globalTileRange.max.y - coords.y;
			if (this.options.tms) {
				data['y'] = invertedY;
			}
			data['-y'] = invertedY;
		}

		return Util.template(this._url, Util.extend(data, this.options));
	},

	_tileOnLoad: function (done, tile) {
		// For https://github.com/Leaflet/Leaflet/issues/3332
		if (Browser.ielt9) {
			setTimeout(Util.bind(done, this, null, tile), 0);
		} else {
			done(null, tile);
		}
	},

	_tileOnError: function (done, tile, e) {
		var errorUrl = this.options.errorTileUrl;
		if (errorUrl && tile.getAttribute('src') !== errorUrl) {
			tile.src = errorUrl;
		}
		done(e, tile);
	},

	_onTileRemove: function (e) {
		e.tile.onload = null;
	},

	_getZoomForUrl: function () {
		var zoom = this._tileZoom,
		maxZoom = this.options.maxZoom,
		zoomReverse = this.options.zoomReverse,
		zoomOffset = this.options.zoomOffset;

		if (zoomReverse) {
			zoom = maxZoom - zoom;
		}

		return zoom + zoomOffset;
	},

	_getSubdomain: function (tilePoint) {
		var index = Math.abs(tilePoint.x + tilePoint.y) % this.options.subdomains.length;
		return this.options.subdomains[index];
	},

	// stops loading all tiles in the background layer
	_abortLoading: function () {
		var i, tile;
		for (i in this._tiles) {
			if (this._tiles[i].coords.z !== this._tileZoom) {
				tile = this._tiles[i].el;

				tile.onload = Util.falseFn;
				tile.onerror = Util.falseFn;

				if (!tile.complete) {
					tile.src = Util.emptyImageUrl;
					DomUtil.remove(tile);
					delete this._tiles[i];
				}
			}
		}
	}
});



TileLayer.addInitHook(function() {

  if (!this.options.useCache) {
    this._db     = null;
    this._canvas = null;
    return;
  }

  this._db = new PouchDB('offline-tiles');
  console.log(this._db);
  this._canvas = document.createElement('canvas');
  console.log(this._canvas);

  if (!(this._canvas.getContext && this._canvas.getContext('2d'))) {
    // HTML5 canvas is needed to pack the tiles as base64 data. If
    //   the browser doesn't support canvas, the code will forcefully
    //   skip caching the tiles.
    this._canvas = null;
    console.log("canvas fail");
  }
});

// 🍂namespace TileLayer
// 🍂section PouchDB tile caching options
// 🍂option useCache: Boolean = false
// Whether to use a PouchDB cache on this tile layer, or not
TileLayer.prototype.options.useCache     = false;

// 🍂option saveToCache: Boolean = true
// When caching is enabled, whether to save new tiles to the cache or not
TileLayer.prototype.options.saveToCache  = true;

// 🍂option useOnlyCache: Boolean = false
// When caching is enabled, whether to request new tiles from the network or not
TileLayer.prototype.options.useOnlyCache = false;

// 🍂option useCache: String = 'image/png'
// The image format to be used when saving the tile images in the cache
TileLayer.prototype.options.cacheFormat = 'image/png';

// 🍂option cacheMaxAge: Number = 24*3600*1000
// Maximum age of the cache, in milliseconds
TileLayer.prototype.options.cacheMaxAge  = 24*3600*1000;


TileLayer.include({

  // Overwrites L.TileLayer.prototype.createTile
  createTile: function(coords, done) {
    var tile = document.createElement('img');

    tile.onerror = L.bind(this._tileOnError, this, done, tile);

    if (this.options.crossOrigin) {
      tile.crossOrigin = '';
    }

    /*
     Alt tag is *set to empty string to keep screen readers from reading URL and for compliance reasons
     http://www.w3.org/TR/WCAG20-TECHS/H67
     */
    tile.alt = '';

    var tileUrl = this.getTileUrl(coords);

    if (this.options.useCache && this._canvas) {
      this._db.get(tileUrl, {revs_info: true}, this._onCacheLookup(tile, tileUrl, done));
    } else {
      // Fall back to standard behaviour
      tile.onload = L.bind(this._tileOnLoad, this, done, tile);
    }

    tile.src = tileUrl;
    return tile;
  },

  // Returns a callback (closure over tile/key/originalSrc) to be run when the DB
  //   backend is finished with a fetch operation.
  _onCacheLookup: function(tile, tileUrl, done) {
    return function(err, data) {
      if (data) {
        this.fire('tilecachehit', {
          tile: tile,
          url: tileUrl
        });
        if (Date.now() > data.timestamp + this.options.cacheMaxAge && !this.options.useOnlyCache) {
          // Tile is too old, try to refresh it
          //console.log('Tile is too old: ', tileUrl);

          if (this.options.saveToCache) {
            tile.onload = L.bind(this._saveTile, this, tile, tileUrl, data._revs_info[0].rev, done);
          }
          tile.crossOrigin = 'Anonymous';
          tile.src = tileUrl;
          tile.onerror = function(ev) {
            // If the tile is too old but couldn't be fetched from the network,
            //   serve the one still in cache.
            this.src = data.dataUrl;
          }
        } else {
          // Serve tile from cached data
          //console.log('Tile is cached: ', tileUrl);
          tile.onload = L.bind(this._tileOnLoad, this, done, tile);
          tile.src = data.dataUrl;    // data.dataUrl is already a base64-encoded PNG image.
        }
      } else {
        this.fire('tilecachemiss', {
          tile: tile,
          url: tileUrl
        });
        if (this.options.useOnlyCache) {
          // Offline, not cached
          // 					console.log('Tile not in cache', tileUrl);
          tile.onload = L.Util.falseFn;
          tile.src = L.Util.emptyImageUrl;
        } else {
          //Online, not cached, request the tile normally
          // 					console.log('Requesting tile normally', tileUrl);
          if (this.options.saveToCache) {
            tile.onload = L.bind(this._saveTile, this, tile, tileUrl, null, done);
          } else {
            tile.onload = L.bind(this._tileOnLoad, this, done, tile);
          }
          tile.crossOrigin = 'Anonymous';
          tile.src = tileUrl;
        }
      }
    }.bind(this);
  },

  // Returns an event handler (closure over DB key), which runs
  //   when the tile (which is an <img>) is ready.
  // The handler will delete the document from pouchDB if an existing revision is passed.
  //   This will keep just the latest valid copy of the image in the cache.
  _saveTile: function(tile, tileUrl, existingRevision, done) {
    if (this._canvas === null) return;
    this._canvas.width  = tile.naturalWidth  || tile.width;
    this._canvas.height = tile.naturalHeight || tile.height;

    var context = this._canvas.getContext('2d');
    context.drawImage(tile, 0, 0);

    var dataUrl;
    try {
      dataUrl = this._canvas.toDataURL(this.options.cacheFormat);
    } catch(err) {
      this.fire('tilecacheerror', { tile: tile, error: err });
      return done();
    }
    var doc = {dataUrl: dataUrl, timestamp: Date.now()};

    if (existingRevision) {
      this._db.remove(tileUrl, existingRevision);
    }
    /// FIXME: There is a deprecation warning about parameters in the
    ///   this._db.put() call.
    this._db.put(doc, tileUrl, doc.timestamp);

    if (done) { done(); }
  },

  // 🍂section PouchDB tile caching options
  // 🍂method seed(bbox: LatLngBounds, minZoom: Number, maxZoom: Number): this
  // Starts seeding the cache given a bounding box and the minimum/maximum zoom levels
  // Use with care! This can spawn thousands of requests and flood tileservers!
  seed: function(bbox, minZoom, maxZoom) {
    if (!this.options.useCache) return;
    if (minZoom > maxZoom) return;
    if (!this._map) return;

    var queue = [];

    for (var z = minZoom; z<=maxZoom; z++) {

      var northEastPoint = this._map.project(bbox.getNorthEast(),z);
      var southWestPoint = this._map.project(bbox.getSouthWest(),z);

      // Calculate tile indexes as per L.TileLayer._update and
      //   L.TileLayer._addTilesFromCenterOut
      var tileSize = this.getTileSize();
      var tileBounds = L.bounds(
          L.point(Math.floor(northEastPoint.x / tileSize.x), Math.floor(northEastPoint.y / tileSize.y)),
          L.point(Math.floor(southWestPoint.x / tileSize.x), Math.floor(southWestPoint.y / tileSize.y)));

      for (var j = tileBounds.min.y; j <= tileBounds.max.y; j++) {
        for (var i = tileBounds.min.x; i <= tileBounds.max.x; i++) {
          point = new L.Point(i, j);
          point.z = z;
          queue.push(this._getTileUrl(point));
        }
      }
    }

    var seedData = {
      bbox: bbox,
      minZoom: minZoom,
      maxZoom: maxZoom,
      queueLength: queue.length
    }
    this.fire('seedstart', seedData);
    var tile = this._createTile();
    tile._layer = this;
    this._seedOneTile(tile, queue, seedData);
    return this;
  },

  _createTile: function () {
    return document.createElement('img');
  },

  // Modified L.TileLayer.getTileUrl, this will use the zoom given by the parameter coords
  //  instead of the maps current zoomlevel.
  _getTileUrl: function (coords) {
    var zoom = coords.z;
    if (this.options.zoomReverse) {
      zoom = this.options.maxZoom - zoom;
    }
    zoom += this.options.zoomOffset;
    return L.Util.template(this._url, L.extend({
      r: this.options.detectRetina && L.Browser.retina && this.options.maxZoom > 0 ? '@2x' : '',
      s: this._getSubdomain(coords),
      x: coords.x,
      y: this.options.tms ? this._globalTileRange.max.y - coords.y : coords.y,
      z: this.options.maxNativeZoom ? Math.min(zoom, this.options.maxNativeZoom) : zoom
    }, this.options));
  },

  // Uses a defined tile to eat through one item in the queue and
  //   asynchronously recursively call itself when the tile has
  //   finished loading.
  _seedOneTile: function(tile, remaining, seedData) {
    if (!remaining.length) {
      this.fire('seedend', seedData);
      return;
    }
    this.fire('seedprogress', {
      bbox:    seedData.bbox,
      minZoom: seedData.minZoom,
      maxZoom: seedData.maxZoom,
      queueLength: seedData.queueLength,
      remainingLength: remaining.length
    });

    var url = remaining.pop();

    this._db.get(url, function(err, data) {
      if (!data) {
        /// FIXME: Do something on tile error!!
        tile.onload = function(ev) {
          this._saveTile(tile, url, null); //(ev)
          this._seedOneTile(tile, remaining, seedData);
        }.bind(this);
        tile.crossOrigin = 'Anonymous';
        tile.src = url;
      } else {
        this._seedOneTile(tile, remaining, seedData);
      }
    }.bind(this));

  }

});




// @factory L.tilelayer(urlTemplate: String, options?: TileLayer options)
// Instantiates a tile layer object given a `URL template` and optionally an options object.

export function tileLayer(url, options) {
	return new TileLayer(url, options);
}
