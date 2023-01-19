"use strict";

class gswaSynth {
	constructor() {
		const gsdata = new GSDataSynth( {
				dataCallbacks: {
					addOsc: this._addOsc.bind( this ),
					removeOsc: this._removeOsc.bind( this ),
					changeOsc: this._changeOsc.bind( this ),
					changeLFO: this._changeLFO.bind( this ),
				},
			} );

		this._bps = 1;
		this.gsdata = gsdata;
		this.ctx =
		this.output = null;
		this.nyquist = 24000;
		this._nodes = new Map();
		this._startedKeys = new Map();
		Object.seal( this );
	}

	// Context, dis/connect
	// .........................................................................
	setContext( ctx ) {
		this.stopAllKeys();
		this.ctx = ctx;
		this.nyquist = ctx.sampleRate / 2;
		this.output = ctx.createGain();
		this.gsdata.recall();
	}
	setBPM( bpm ) {
		this._bps = bpm / 60;
	}
	change( obj ) {
		this.gsdata.change( obj );
	}

	// add/remove/update oscs
	// .........................................................................
	_removeOsc( id ) {
		const obj = this._nodes.get( id );

		obj.pan.disconnect();
		obj.gain.disconnect();
		this._startedKeys.forEach( key => {
			this._destroyOscNode( key.oscs.get( id ) );
			key.oscs.delete( id );
		} );
		this._nodes.delete( id );
	}
	_addOsc( id, osc ) {
		const gain = this.ctx.createGain(),
			pan = this.ctx.createStereoPanner();

		this._nodes.set( id, { gain, pan } );
		pan.pan.value = osc.pan;
		gain.gain.value = osc.gain;
		pan.connect( gain );
		gain.connect( this.output );
		this._startedKeys.forEach( key => key.oscs.set( id, this._createOscNode( key, id ) ) );
	}
	_changeOsc( id, obj ) {
		for ( const prop in obj ) {
			const val = obj[ prop ];

			switch ( prop ) {
				case "pan": this._nodes.get( id ).pan.pan.value = val; break;
				case "gain": this._nodes.get( id ).gain.gain.value = val; break;
				case "type":
				case "detune":
					this._startedKeys.forEach( prop === "detune"
						? key => key.oscs.get( id ).keyOsc.detune.value = val * 100
						: key => this._nodeOscSetType( key.oscs.get( id ).keyOsc, val ) );
			}
		}
	}
	_changeLFO( obj ) {
		const nobj = { ...obj };

		if ( "delay" in obj ) { nobj.delay /= this._bps; }
		if ( "attack" in obj ) { nobj.attack /= this._bps; }
		if ( "speed" in obj ) { nobj.speed *= this._bps; }
		this._startedKeys.forEach( k => k.oscs.forEach( nodes => nodes.keyLFO.change( nobj ) ) );
	}

	// start
	// .........................................................................
	startKey( blocks, when, off, dur ) {
		const id = ++gswaSynth._startedMaxId.value,
			oscs = new Map(),
			blcsLen = blocks.length,
			blc0 = blocks[ 0 ][ 1 ],
			blcLast = blocks[ blcsLen - 1 ][ 1 ],
			blc0when = blc0.when,
			bps = this._bps,
			key = {
				oscs,
				when,
				off,
				dur,
				pan: blc0.pan,
				midi: blc0.key,
				gain: blc0.gain,
				lowpass: blc0.lowpass,
				highpass: blc0.highpass,
				attack: blc0.attack / bps || .005,
				release: blcLast.release / bps || .005,
			};

		if ( blcsLen > 1 ) {
			key.variations = [];
			blocks.reduce( ( prev, [ , blc ] ) => {
				if ( prev ) {
					const prevWhen = prev.when - blc0when,
						when = ( prevWhen + prev.duration ) / bps;

					key.variations.push( {
						when,
						duration: ( blc.when - blc0when ) / bps - when,
						pan: [ prev.pan, blc.pan ],
						midi: [ prev.key, blc.key ],
						gain: [ prev.gain, blc.gain ],
						lowpass: [
							this._calcLowpass( prev.lowpass ),
							this._calcLowpass( blc.lowpass ),
						],
						highpass: [
							this._calcHighpass( prev.highpass ),
							this._calcHighpass( blc.highpass ),
						],
					} );
				}
				return blc;
			}, null );
		}
		Object.keys( this.gsdata.data.oscillators )
			.forEach( oscId => oscs.set( oscId, this._createOscNode( key, oscId ) ) );
		this._startedKeys.set( id, key );
		return id;
	}

	// stop
	// .........................................................................
	stopAllKeys() {
		this._startedKeys.forEach( ( _key, id ) => this.stopKey( id ) );
	}
	stopKey( id ) {
		const key = this._startedKeys.get( id );

		if ( key ) {
			const oscs = key.oscs;

			if ( Number.isFinite( key.dur ) ) {
				this._stopKey( id, oscs );
			} else {
				oscs.forEach( nodes => {
					nodes.keyGain.gain.setValueCurveAtTime(
						new Float32Array( [ key.gain, .1 ] ), this.ctx.currentTime + .01, .02 );
				} );
				setTimeout( this._stopKey.bind( this, id, oscs ), .033 * 1000 );
			}
		} else {
			console.error( "gswaSynth: stopKey id invalid", id );
		}
	}
	_stopKey( id, oscs ) {
		oscs.forEach( this._destroyOscNode, this );
		this._startedKeys.delete( id );
	}

	// private:
	_calcLowpass( val ) {
		return this._calcExp( val, this.nyquist, 2 );
	}
	_calcHighpass( val ) {
		return this._calcExp( 1 - val, this.nyquist, 3 );
	}
	_calcExp( x, total, exp ) {
		return exp === 0
			? x
			: Math.expm1( x ) ** exp / ( ( Math.E - 1 ) ** exp ) * total;
	}

	// default gain envelope
	_scheduleOscNodeGain( key, nodes ) {
		const va = key.variations,
			par = nodes.keyGain.gain,
			{ when, dur, gain, attack, release } = key;

		par.cancelScheduledValues( 0 );
		if ( !va || va[ 0 ].when > key.off ) {
			if ( key.off < .0001 ) {
				par.setValueAtTime( 0, when );
				par.setValueCurveAtTime( new Float32Array( [ 0, gain ] ), when, attack );
			} else {
				par.setValueAtTime( gain, when );
			}
		}
		if ( Number.isFinite( dur ) && dur - attack >= release ) {
			const vaLast = va && va[ va.length - 1 ],
				relWhen = when + dur - release;

			if ( !vaLast || when - key.off + vaLast.when + vaLast.duration < relWhen ) {
				const gainEnd = vaLast ? vaLast.gain[ 1 ] : gain;

				par.setValueCurveAtTime( new Float32Array( [ gainEnd, 0 ] ), relWhen, release );
			}
		}
	}

	// keys linked, variations
	_scheduleVariations( key, nodes ) {
		if ( key.variations ) {
			key.variations.forEach( va => {
				const when = key.when - key.off + va.when,
					dur = va.duration,
					freqArr = new Float32Array( [
						gswaSynth.midiKeyToHz[ va.midi[ 0 ] ],
						gswaSynth.midiKeyToHz[ va.midi[ 1 ] ]
					] );

				if ( when > this.ctx.currentTime && dur > 0 ) {
					nodes.keyOsc.frequency.setValueCurveAtTime( freqArr, when, dur );
					nodes.keyPan.pan.setValueCurveAtTime( new Float32Array( va.pan ), when, dur );
					nodes.keyGain.gain.setValueCurveAtTime( new Float32Array( va.gain ), when, dur );
					nodes.keyLowpass.frequency.setValueCurveAtTime( new Float32Array( va.lowpass ), when, dur );
					nodes.keyHighpass.frequency.setValueCurveAtTime( new Float32Array( va.highpass ), when, dur );
				}
			} );
		}
	}

	// createOscNode
	_createOscNode( key, oscId ) {
		const ctx = this.ctx,
			lfo = this.gsdata.data.lfo,
			osc = this.gsdata.data.oscillators[ oscId ],
			finite = Number.isFinite( key.dur ),
			atTime = key.when - key.off,
			keyLFO = new gswaLFO( ctx ),
			keyOsc = ctx.createOscillator(),
			keyPan = ctx.createStereoPanner(),
			keyGain = ctx.createGain(),
			keyLowpass = ctx.createBiquadFilter(),
			keyHighpass = ctx.createBiquadFilter(),
			nodes = Object.freeze( {
				keyOsc,
				keyLFO,
				keyPan,
				keyGain,
				keyLowpass,
				keyHighpass,
			} );

		this._nodeOscSetType( keyOsc, osc.type );
		keyOsc.detune.setValueAtTime( osc.detune * 100, atTime );
		keyPan.pan.setValueAtTime( key.pan, atTime );
		keyOsc.frequency.setValueAtTime( gswaSynth.midiKeyToHz[ key.midi ], atTime );
		keyLowpass.frequency.setValueAtTime( this._calcLowpass( key.lowpass ), atTime );
		keyHighpass.frequency.setValueAtTime( this._calcHighpass( key.highpass ), atTime );
		keyLowpass.type = "lowpass";
		keyHighpass.type = "highpass";
		this._scheduleOscNodeGain( key, nodes );
		this._scheduleVariations( key, nodes );
		keyOsc
			.connect( keyLFO.node )
			.connect( keyPan )
			.connect( keyLowpass )
			.connect( keyHighpass )
			.connect( keyGain )
			.connect( this._nodes.get( oscId ).pan );
		keyOsc.start( key.when );
		keyLFO.start( {
			toggle: lfo.toggle,
			when: key.when,
			whenStop: finite ? key.when + key.dur : 0,
			offset: key.offset,
			type: lfo.type,
			delay: lfo.delay / this._bps,
			attack: lfo.attack / this._bps,
			speed: lfo.speed * this._bps,
			amp: lfo.amp,
		} );
		if ( finite ) {
			keyOsc.stop( key.when + key.dur );
		}
		return nodes;
	}
	_destroyOscNode( nodes ) {
		nodes.keyOsc.stop();
		nodes.keyOsc.disconnect();
		nodes.keyLFO.destroy();
		nodes.keyGain.disconnect();
	}
	_nodeOscSetType( oscNode, type ) {
		if ( gswaSynth.nativeTypes.indexOf( type ) > -1 ) {
			oscNode.type = type;
		} else {
			oscNode.setPeriodicWave( gswaPeriodicWaves.get( this.ctx, type ) );
		}
	}
}

gswaSynth._startedMaxId = Object.seal( { value: 0 } );
gswaSynth.nativeTypes = Object.freeze( [ "sine", "triangle", "sawtooth", "square" ] );
gswaSynth.midiKeyToHz = [];

Object.freeze( gswaSynth );
