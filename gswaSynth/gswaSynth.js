"use strict";

class gswaSynth {
	constructor() {
		this._nodes = new Map();
		this._startedKeys = new Map();
		this.data = this._proxyCreate();
	}

	// Context, dis/connect
	// ........................................................................
	setContext( ctx ) {
		const oscs = this.data.oscillators;

		this.stopAllKeys();
		this.disconnect();
		this.ctx = ctx;
		Object.keys( oscs ).forEach( this._oscsDel, this );
		Object.entries( oscs ).forEach( ( [ id, osc ] ) => this._oscsAdd( id, osc ) );
	}
	setBPM( bpm ) {
		this._bps = bpm / 60;
	}
	connect( dest ) {
		this._nodes.forEach( obj => obj.gain.connect( dest ) );
		this.connectedTo = dest;
	}
	disconnect() {
		this._nodes.forEach( obj => obj.gain.disconnect() );
		this.connectedTo = null;
	}

	// Start/stop keys
	// ........................................................................
	stopAllKeys() {
		this._startedKeys.forEach( ( _key, id ) => this.stopKey( id ) );
	}
	stopKey( id ) {
		const key = this._startedKeys.get( id );

		if ( key ) {
			key.oscs.forEach( this._destroyOscNode, this );
			this._startedKeys.delete( id );
		} else {
			console.error( "gswaSynth: stopKey id invalid", id );
		}
	}
	startKey( blocks, when, off, dur ) {
		const id = ++gswaSynth._startedMaxId,
			oscs = new Map(),
			blcsLen = blocks.length,
			blc0 = blocks[ 0 ][ 1 ],
			blc0when = blc0.when,
			bps = this._bps,
			key = {
				oscs, when, off, dur,
				midi: blc0.key,
				gain: blc0.gain,
				pan: blc0.pan,
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
						midi: [ prev.key, blc.key ],
						gain: [ prev.gain, blc.gain ],
						pan: [ prev.pan, blc.pan ],
					} );
				}
				return blc;
			}, null );
		}
		Object.keys( this.data.oscillators )
			.forEach( oscId => oscs.set( oscId, this._createOscNode( key, oscId ) ) );
		this._startedKeys.set( id, key );
		return id;
	}

	// default gain envelope
	_scheduleOscNodeGain( key, par ) {
		const va = key.variations,
			attDur = .002,
			relDur = .002,
			{ when, dur, gain } = key;

		par.cancelScheduledValues( 0 );
		if ( !va || va[ 0 ].when > key.off ) {
			if ( key.off < .0001 ) {
				par.setValueAtTime( 0, when );
				par.setValueCurveAtTime( new Float32Array( [ 0, gain ] ), when, attDur );
			} else {
				par.setValueAtTime( gain, when );
			}
		}
		if ( Number.isFinite( dur ) && dur - attDur >= relDur ) {
			const vaLast = va && va[ va.length - 1 ],
				relWhen = when + dur - relDur;

			if ( !vaLast || when - key.off + vaLast.when + vaLast.duration < relWhen ) {
				const gainEnd = vaLast ? vaLast.gain[ 1 ] : gain;

				par.setValueCurveAtTime( new Float32Array( [ gainEnd, 0 ] ), relWhen, relDur );
			}
		}
	}

	// keys linked, variations
	_scheduleVariations( key, freq, gain, pan ) {
		if ( key.variations ) {
			key.variations.forEach( va => {
				const when = key.when - key.off + va.when,
					dur = va.duration,
					freqArr = new Float32Array( [
						gswaSynth.midiKeyToHz[ va.midi[ 0 ] ],
						gswaSynth.midiKeyToHz[ va.midi[ 1 ] ]
					] );

				if ( when > this.ctx.currentTime && dur > 0 ) {
					freq.setValueCurveAtTime( freqArr, when, dur );
					gain.setValueCurveAtTime( new Float32Array( va.gain ), when, dur );
					pan.setValueCurveAtTime( new Float32Array( va.pan ), when, dur );
				}
			} );
		}
	}

	// createOscNode
	_createOscNode( key, oscId ) {
		const node = this.ctx.createOscillator(),
			gainNode = this.ctx.createGain(),
			panNode = this.ctx.createStereoPanner(),
			osc = this.data.oscillators[ oscId ],
			atTime = key.when - key.off;

		this._nodeOscSetType( node, osc.type );
		node._panNode = panNode;
		node._gainNode = gainNode;
		node.connect( panNode );
		panNode.connect( gainNode );
		gainNode.connect( this._nodes.get( oscId ).pan );
		node.frequency.setValueAtTime( gswaSynth.midiKeyToHz[ key.midi ], atTime );
		node.detune.setValueAtTime( osc.detune, atTime );
		panNode.pan.setValueAtTime( key.pan, atTime );
		this._scheduleOscNodeGain( key, gainNode.gain );
		this._scheduleVariations( key, node.frequency, gainNode.gain, panNode.pan );
		node.start( key.when );
		if ( Number.isFinite( key.dur ) ) {
			node.stop( key.when + key.dur );
		}
		return node;
	}
	_destroyOscNode( node ) {
		node.stop();
		node.disconnect();
		node._gainNode.disconnect();
	}
	_nodeOscSetType( node, type ) {
		if ( gswaSynth.nativeTypes.indexOf( type ) > -1 ) {
			node.type = type;
		} else {
			const w = gswaPeriodicWaves.get( type );

			node.setPeriodicWave( this.ctx.createPeriodicWave( w.real, w.imag ) );
		}
	}
	_oscsAdd( id, osc ) {
		const gain = this.ctx.createGain(),
			pan = this.ctx.createStereoPanner();

		this._nodes.set( id, { gain, pan } );
		pan.pan.value = osc.pan;
		gain.gain.value = osc.gain;
		pan.connect( gain );
		if ( this.connectedTo ) {
			gain.connect( this.connectedTo );
		}
		this._startedKeys.forEach( key => key.oscs.set( id, this._createOscNode( key, id ) ) );
	}
	_oscsDel( id ) {
		const obj = this._nodes.get( id );

		obj.pan.disconnect();
		obj.gain.disconnect();
		this._startedKeys.forEach( key => {
			this._destroyOscNode( key.oscs.get( id ) );
			key.oscs.delete( id );
		} );
		this._nodes.delete( id );
	}
	_oscsChangeProp( id, prop, val ) {
		switch ( prop ) {
			case "pan": this._nodes.get( id ).pan.pan.value = val; break;
			case "gain": this._nodes.get( id ).gain.gain.value = val; break;
			case "type":
			case "detune":
				this._startedKeys.forEach( prop === "detune"
					? key => key.oscs.get( id ).detune.value = val
					: key => this._nodeOscSetType( key.oscs.get( id ), val ) );
		}
	}

	// Data proxy
	// ........................................................................
	_proxyCreate() {
		return Object.freeze( {
			oscillators: new Proxy( {}, {
				set: this._proxyAddOsc.bind( this ),
				deleteProperty: this._proxyDelOsc.bind( this )
			} )
		} );
	}
	_proxyDelOsc( tar, oscId ) {
		delete tar[ oscId ];
		if ( this.ctx ) {
			this._oscsDel( oscId );
		}
		return true;
	}
	_proxyAddOsc( tar, oscId, oscObj ) {
		const oscTar = Object.assign( Object.seal( {
				order: 0,
				type: "sine",
				detune: 0,
				pan: 0,
				gain: 1,
			} ), oscObj ),
			osc = new Proxy( oscTar, {
				set: this._proxySetOscProp.bind( this, oscId )
			} );

		if ( oscId in tar && this.ctx ) {
			this._oscsDel( oscId );
		}
		tar[ oscId ] = osc;
		if ( this.ctx ) {
			this._oscsAdd( oscId, osc );
		}
		return true;
	}
	_proxySetOscProp( oscId, tar, prop, val ) {
		tar[ prop ] = val;
		if ( this.ctx ) {
			this._oscsChangeProp( oscId, prop, val );
		}
		return true;
	}
}

gswaSynth._startedMaxId = 0;
gswaSynth.nativeTypes = [ "sine", "triangle", "sawtooth", "square" ];
