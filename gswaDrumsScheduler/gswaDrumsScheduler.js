"use strict";

class gswaDrumsScheduler {
	constructor( ctx ) {
		this.scheduler = new gswaScheduler();
		this._drumrows = null;
		this._startedDrums = new Map();
		Object.seal( this );

		this.scheduler.setMode( "drums" );
		this.scheduler.currentTime = () => ctx.currentTime;
		this.scheduler.ondatastart = this._onstartDrum.bind( this );
		this.scheduler.ondatastop = this._onstopDrum.bind( this );
		this.scheduler.enableStreaming( !( ctx instanceof OfflineAudioContext ) );
	}

	setDrumrows( drumrows ) {
		this._drumrows = drumrows;
	}
	change( obj ) {
		const cpy = GSUtils.deepCopy( obj );

		Object.values( cpy ).forEach( drum => {
			if ( drum && drum.when !== undefined ) {
				drum.offset = 0;
				drum.duration = this._drumrows.getPatternDurationByRowId( drum.row );
			}
		} );
		GSUtils.diffAssign( this.scheduler.data, cpy );
	}
	start( when, off, dur ) {
		this.scheduler.start( when, off, dur );
	}
	stop() {
		this.scheduler.stop();
	}

	_onstartDrum( startedId, [ drum ], when, off, dur ) {
		this._startedDrums.set( startedId,
			this._drumrows.startDrum( drum[ 1 ], when, off, dur ) );
	}
	_onstopDrum( startedId ) {
		this._drumrows.stopDrum( this._startedDrums.get( startedId ) );
		this._startedDrums.delete( startedId );
	}
}
