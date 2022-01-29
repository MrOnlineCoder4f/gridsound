"use strict";

window.gswaSynth = function() {
	this._currId = 0;
	this.simplePlayStack = [];
	this.data = {
		oscillators: {}
	};
};

gswaSynth.prototype = {
	setContext( ctx ) {
		this.ctx = ctx;
	},
	connect( nodeDest ) {
		this.connectedTo = nodeDest;
		Object.values( this.data.oscillators )
			.forEach( osc => osc._gain.connect( nodeDest ) );
	},
	disconnect() {
		this.connectedTo = null;
		Object.values( this.data.oscillators )
			.forEach( osc => osc._gain.disconnect() );
	},
	simpleStart( key ) {
		var oscId, oscNode;

		for ( oscId in this.data.oscillators ) {
			oscNode = this._oscNewNode( this.data.oscillators[ oscId ], key );
			if ( oscNode ) {
				this.simplePlayStack.push( oscNode );
				oscNode.start( 0 );
			}
		}
	},
	start( key, when, offset, duration ) {
		var oscObj, oscId, oscNode;

		for ( oscId in this.data.oscillators ) {
			oscObj = this.data.oscillators[ oscId ];
			oscNode = this._oscNewNode( oscObj, key );

			if ( oscNode ) {
				oscNode._when = when;
				oscNode._duration = duration;
				oscNode._key = key;
				oscObj.nodeStack[ this._currId ] = oscNode;
				oscNode.onended = this._removeOscNode.bind( this, oscObj, this._currId );
				++this._currId;
				++oscObj.nodeStackLength;
				oscNode.start( when || 0 ); // ?
				if ( arguments.length > 3 ) {
					oscNode.stop( when + duration );
				}
			}
		}
	},
	stop() {
		this._forEachNode( node => node.stop() );
		this.simplePlayStack.length = 0;
	},
	change( obj ) {
		var osc, oscId, firstOscData,
		 	data = this.data;

		// Check if data.oscillators is empty
		// If not, save the first oscillator.
		// If the change occurs during the playback
		// The first oscillator will be used to create the nodeStack of the new oscillators
		for ( oscId in data.oscillators ) {
			firstOscData = data[ oscId ];
			break;
		}

		for ( oscId in obj.oscillators ) {
			var oscSrc = obj.oscillators[ oscId ];

			// If the oscillators object exists
			// And if it's not empty
			// And if there is already an oscillator with the ID oscId
			// Update or remove
			// Else create
			firstOscData && oscId in data.oscillators ?
				oscSrc ? this._updateOscillator( oscSrc, data.oscillators[ oscId ] )
					   : this._deleteOscillator( oscSrc, data.oscillators[ oscId ] )
			: this._createOscillator( firstOscData, oscSrc, oscId );
		}
	},

	// private:
	_forEachNode( fn ) {
		this.simplePlayStack.forEach( fn );
		Object.values( this.data.oscillators ).forEach( osc => {
			Object.values( osc.nodeStack ).forEach( fn );
		} );
	},
	_oscNewNode( osc, key ) {
		var node = this.ctx.createOscillator();

		node.type = osc.type;
		node.detune.value = osc.detune;
		node.frequency.value = gswaSynth.keyToHz[ key ];
		node.connect( osc._gain );
		return node;
	},
	_removeOscNode( oscObj, id ) {
		delete oscObj.nodeStack[ id ];
		--oscObj.nodeStackLength;
	},
	_createOscillator( firstOscData, oscSrc, oscId ) {
		var newOscNode,
			oscNodeBase,
			newOsc = this.data.oscillators[ oscId ] = {
				_gain: this.ctx.createGain(),
				gain: oscSrc.gain,
				type: oscSrc.type,
				detune: oscSrc.detune,
				nodeStack: {},
				nodeStackLength: 0
			};

		newOsc._gain.gain.value = oscSrc.gain;
		newOsc._gain.connect( this.connectedTo );

		// If there are at least one oscillator and its nodeStack's not empty (when playing)
		// Use it to fill the new oscillator's nodeStack
		if ( firstOscData && firstOscData.nodeStackLength > 0 ) {
			for ( nodeId in firstOscData.nodeStack ) {
				oscNodeSrc = firstOscData.nodeStack[ nodeId ];
				newOscNode = this._oscNewNode( firstOscData, oscNodeSrc.key );
				newOsc.nodeStack.push( newOscNode );
				++newOsc.nodeStackLength;
				newOsc.onended = this._removeOscNode.bind( this, newOscNode, oscId );
				newOsc._when = oscNodeSrc._when;
				newOsc._duration = oscNodeSrc._duration;
				newOscNode.start( newOsc._when );
				oscNode.stop( newOsc._when + newOsc._duration );
			}
		}
	},
	_updateOscillator( oscSrc, oscDest ) {
		oscDest.type = oscSrc.type;
		oscDest.detune = oscSrc.detune;
		oscDest.gainValue =
		oscDest.gain.gain.value = oscSrc.gainValue;
		for ( nodeId in oscDest.nodeStack ) {
			oscDest.nodeStack[ nodeId ].type = oscDest.type;
			oscDest.nodeStack[ nodeId ].detune.value = oscDest.detune;
		}
	},
	_deleteOscillator( osc ) {
		for ( nodeId in osc.nodeStack ) {
			osc.nodeStack[ nodeId ].stop();
		}
		osc = undefined;
	}
};

gswaSynth.keyToHz = {
	"A0":    27.5,
	"A#0":   29.1353,
	"B0":    30.8677,
	"C1":    32.7032,
	"C#1":   34.6479,
	"D1":    36.7081,
	"D#1":   38.8909,
	"E1":    41.2035,
	"F1":    43.6536,
	"F#1":   46.2493,
	"G1":    48.9995,
	"G#1":   51.9130,
	"A1":    55,
	"A#1":   58.2705,
	"B1":    61.7354,
	"C2":    65.4064,
	"C#2":   69.2957,
	"D2":    73.4162,
	"D#2":   77.7817,
	"E2":    82.4069,
	"F2":    87.3071,
	"F#2":   92.4986,
	"G2":    97.9989,
	"G#2":  103.826,
	"A2":   110,
	"A#2":  116.541,
	"B2":   123.471,
	"C3":   130.813,
	"C#3":  138.591,
	"D3":   146.832,
	"D#3":  155.563,
	"E3":   164.814,
	"F3":   174.614,
	"F#3":  184.997,
	"G3":   195.998,
	"G#3":  207.652,
	"A3":   220,
	"A#3":  233.082,
	"B3":   246.942,
	"C4":   261.626,
	"C#4":  277.183,
	"D4":   293.665,
	"D#4":  311.127,
	"E4":   329.628,
	"F4":   349.228,
	"F#4":  369.994,
	"G4":   391.995,
	"G#4":  415.305,
	"A4":   440,
	"A#4":  466.164,
	"B4":   493.883,
	"C5":   523.251,
	"C#5":  554.365,
	"D5":   587.33,
	"D#5":  622.254,
	"F#5":  739.989,
	"E5":   659.255,
	"F5":   698.456,
	"G5":   783.991,
	"G#5":  830.609,
	"A5":   880,
	"A#5":  932.328,
	"B5":   987.767,
	"C6":  1046.5,
	"C#6": 1108.73,
	"D6":  1174.66,
	"D#6": 1244.51,
	"E6":  1318.51,
	"F6":  1396.91,
	"F#6": 1479.98,
	"G6":  1567.98,
	"G#6": 1661.22,
	"A6":  1760,
	"A#6": 1864.66,
	"B6":  1975.53,
	"C7":  2093,
	"C#7": 2217.46,
	"D7":  2349.32,
	"D#7": 2489.02,
	"E7":  2637.02,
	"F7":  2793.83,
	"F#7": 2959.96,
	"G7":  3135.96,
	"G#7": 3322.44,
	"A7":  3520,
	"A#7": 3729.31,
	"B7":  3951.07,
	"C8":  4186.01
};
