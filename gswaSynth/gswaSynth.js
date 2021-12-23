"use strict";

window.gswaSynth = function() {
	this.nodeStack = {};
	this.nodeStackLength = 0;
	this.osc = {};
	this._currId = 0;
};

gswaSynth.prototype = {
	setContext( ctx ) {
		this.ctx = ctx;
	},
	connect( node ) {
		this.connectedTo = node;
		for ( var id in this.nodeStack ) {
			this.nodeStack[ id ].connect( node );
		}
	},
	disconnect() {
		this.connectedTo = null;
		for ( var id in this.nodeStack ) {
			this.nodeStack[ id ].disconnect();
		}
	},
	simpleStart( key ) {
		var oscNode = this._newOscNode( key );

		if ( oscNode ) {
			this._oscNode = oscNode;
			return ( this._promise = new Promise( function( resolve ) {
				oscNode.onended = resolve;
				oscNode.start();
			} ) );
		}
	},
	start( key, when, offset, duration ) {
		var oscNode = this._newOscNode();

		if ( oscNode ) {
			oscNode.onended = this._removeSource.bind( this, this._currId );
			this.nodeStack[ this._currId++ ] = oscNode;
			++this.nodeStackLength;
			oscNode.start( when || 0, offset || 0,
				arguments.length > 2 ? duration : this.duration );
			return oscNode;
		}
	},
	stop() {
		if ( this._oscNode ) {
			this._oscNode.stop();
		}
		for ( var id in this.nodeStack ) {
			this.nodeStack[ id ].stop();
		}
	},
	change( obj ) {
		var id, newOsc,
			data = this.data;

		for ( id in obj.oscillators ) {
			newOsc = obj.oscillators[ id ];
			newOsc ? data.oscillators[ id ]
				? _updateOscStack(newOsc, data.oscillators[ id ])
				: _createOscStack(newOsc, data.oscillators[ id ])
				: 2; // delete
		}
		gswaSynth.assignDeep( data, obj );
	},

	// private:
	_newOscNode( key ) {
		var oscNode,
			ctx = this.ctx;

		if ( ctx ) {
			oscNode = ctx.createOscillator();
			oscNode.connect( this.connectedTo );
			oscNode.frequency.value = gswaSynth.keyToHz[ key ];
		}
		return oscNode;
	},
	_updateOscStack( newOsc, osc ) {
		var oscNode;

		for ( oscNode in this.nodeStack ) {
			if ( "type" in newOsc )
				oscNode.type = newOsc.type;
			if ( "detune" in newOsc )
				oscNode.detune.value = newOsc.detune;
		}
	},
	_removeSource( id ) {
		delete this.nodeStack[ id ];
		--this.nodeStackLength;
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
