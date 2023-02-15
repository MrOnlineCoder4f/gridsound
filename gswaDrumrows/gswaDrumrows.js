"use strict";

class gswaDrumrows {
	constructor() {
		const ctrl = new DAWCore.controllers.drumrows( {
				dataCallbacks: {
					addDrumrow: GSUtils.noop,
					removeDrumrow: this._removeDrumrow.bind( this ),
					changeDrumrow: this._changeDrumrow.bind( this ),
				},
			} );

		this.ctx =
		this.onstartdrum =
		this.onstartdrumcut = null;
		this.getAudioBuffer =
		this.getChannelInput = GSUtils.noop;
		this._startedDrums = new Map();
		this._bps = 1;
		this._ctrl = ctrl;
		Object.seal( this );
	}

	// .........................................................................
	setContext( ctx ) {
		this.stopAllDrums();
		this.ctx = ctx;
	}
	setBPM( bpm ) {
		this._bps = bpm / 60;
	}
	change( obj ) {
		this._ctrl.change( obj );
	}
	clear() {
		this._ctrl.clear();
	}
	getPatternDurationByRowId( rowId ) {
		const d = this._ctrl.data;

		return d.patterns[ d.drumrows[ rowId ].pattern ].duration;
	}

	// start/stop
	// .........................................................................
	startLiveDrum( rowId ) {
		return this._startDrum( rowId, this.ctx.currentTime, 0, null, true );
	}
	stopLiveDrum( rowId ) {
		this._startedDrums.forEach( ( nodes, id ) => {
			// if ( nodes.live && nodes.rowId === rowId ) {
			if ( nodes.rowId === rowId ) {
				this.stopDrum( id, "-f" );
			}
		} );
	}
	startDrumcut( drumcut, when ) {
		const cutDur = .001,
			whenCutStart = when - cutDur;

		this._startedDrums.forEach( ( nodes, id ) => {
			if ( nodes.absn && nodes.rowId === drumcut.row && nodes.when < whenCutStart && when < nodes.endAt ) {
				nodes.endAt = when;
				nodes.gainCut.gain.setValueCurveAtTime( new Float32Array( [ 1, 0 ] ), whenCutStart, cutDur );
				nodes.absn.stop( when + cutDur );
				if ( this.onstartdrumcut ) {
					const fn = this.onstartdrumcut.bind( null, nodes.rowId ),
						time = whenCutStart - this.ctx.currentTime;

					nodes.startDrumcutTimeoutId = setTimeout( fn, time * 1000 );
				}
			}
		} );
	}
	startDrum( drum, when, off, dur ) {
		return this._startDrum( drum.row, when, off, dur, false );
	}
	_startDrum( rowId, when, off, durUser, live ) {
		const data = this._ctrl.data,
			row = data.drumrows[ rowId ],
			pat = data.patterns[ row.pattern ],
			buffer = this.getAudioBuffer( pat.buffer ),
			dur = durUser !== null ? durUser : buffer ? buffer.duration : 0,
			id = ++gswaDrumrows._startedMaxId.value,
			nodes = { rowId, live, when, dur, endAt: when + dur };

		if ( buffer ) {
			const absn = this.ctx.createBufferSource(),
				gainRow = this.ctx.createGain(),
				gainCut = this.ctx.createGain(),
				dest = this.getChannelInput( pat.dest );

			nodes.absn = absn;
			nodes.gainCut = gainCut;
			nodes.gainRow = gainRow;
			absn.buffer = buffer;
			absn.detune.setValueAtTime( row.detune * 100, this.ctx.currentTime );
			gainRow.gain.setValueAtTime( row.toggle ? row.gain : 0, this.ctx.currentTime );
			absn.connect( gainCut ).connect( gainRow ).connect( dest );
			absn.start( when, off, dur );
			if ( this.onstartdrum ) {
				const timeoutMs = ( when - this.ctx.currentTime ) * 1000;

				nodes.startDrumTimeoutId = setTimeout( () => this.onstartdrum( rowId ), timeoutMs );
			}
		}
		this._startedDrums.set( id, nodes );
		this._startedDrums.forEach( ( nodes, id ) => {
			if ( nodes.when + nodes.dur <= this.ctx.currentTime ) {
				this._stopDrum( id, nodes );
			}
		} );
		return id;
	}
	stopAllDrums() {
		this._startedDrums.forEach( ( _nodes, id ) => this.stopDrum( id, "-f" ) );
	}
	stopDrum( id, force ) {
		const nodes = this._startedDrums.get( id );

		if ( nodes && ( force === "-f" ||
			nodes.when + nodes.dur <= this.ctx.currentTime ||
			nodes.when >= this.ctx.currentTime
		) ) {
			this._stopDrum( id, nodes );
		}
	}
	_stopDrum( id, nodes ) {
		this._startedDrums.delete( id );
		clearTimeout( nodes.startDrumTimeoutId );
		clearTimeout( nodes.startDrumcutTimeoutId );
		if ( nodes.absn ) {
			nodes.absn.stop();
			nodes.gainCut.disconnect();
			nodes.gainRow.disconnect();
		}
	}

	// add/remove/update
	// .........................................................................
	_removeDrumrow( id ) {
		this._startedDrums.forEach( ( nodes, startedId ) => {
			if ( nodes.rowId === id ) {
				this.stopDrum( startedId, "-f" );
			}
		} );
	}
	_changeDrumrow( id, prop, val ) {
		const row = this._ctrl.data.drumrows[ id ];

		switch ( prop ) {
			case "toggle":
				this.__changeDrumrow( id, nodes => {
					nodes.gainRow.gain.setValueAtTime( val ? row.gain : 0, this.ctx.currentTime );
				} );
				break;
			case "dest":
				this.__changeDrumrow( id, nodes => {
					nodes.gainRow.disconnect();
					nodes.gainRow.connect( this.getChannelInput( val ) );
				} );
				break;
			case "detune":
				this.__changeDrumrow( id, nodes => {
					nodes.absn.detune.setValueAtTime( val * 100, this.ctx.currentTime );
				} );
				break;
			case "gain":
				this.__changeDrumrow( id, nodes => {
					nodes.gainRow.gain.setValueAtTime( val, this.ctx.currentTime );
				} );
				break;
		}
	}
	__changeDrumrow( rowId, fn ) {
		this._startedDrums.forEach( nodes => {
			if ( nodes.rowId === rowId && nodes.absn ) {
				fn( nodes );
			}
		} );
	}
}

gswaDrumrows._startedMaxId = Object.seal( { value: 0 } );

Object.freeze( gswaDrumrows );
