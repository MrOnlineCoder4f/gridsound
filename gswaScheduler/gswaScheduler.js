"use strict";

function gswaScheduler() {};

gswaScheduler.prototype = {
	setBPM( bpm ) {
		this.bps = bpm / 60;
		this._updateDur();
	},
	setData( data ) {
		this.data = data;
		this._updateDur();
	},
	stop() {
		if ( this._smps ) {
			clearTimeout( this._timeout );
			this.onstop && this._smps.forEach( this.onstop );
			delete this._smps;
			this._onended();
		}
	},
	startBeat( whenBeat, offsetBeat, durationBeat ) {
		return this.start(
			whenBeat / this.bps,
			offsetBeat / this.bps,
			durationBeat / this.bps );
	},
	start( when, off, dur ) {
		when = when || 0;
		off = off || 0;
		dur = dur || dur === 0 ? dur : this.duration;
		this._smps = [];
		this.data.forEach( smp => {
			var sWhn = this._sWhn( smp ) - off,
				sOff = this._sOff( smp ),
				sDur = this._sDur( smp ),
				sEnd = sWhn + sDur;

			if ( sWhn < 0 ) {
				sOff -= sWhn;
				sDur += sWhn;
				sWhn = 0;
			}
			if ( sEnd > dur ) {
				sDur -= sEnd - dur;
			}
			if ( sDur > 0 ) {
				this._smps.push( smp );
				this.onstart( smp, when + sWhn, sOff, sDur );
			}
		} );
		this._timeout = setTimeout( this._onended.bind( this ), dur * 1000 );
	},

	// private:
	_updateDur() {
		this.duration = this.data.reduce( ( dur, smp ) => {
			return Math.max( dur, this._sWhn( smp ) + this._sDur( smp ) );
		}, 0 );
	},
	_sWhn( smp ) { return "whenBeat" in smp ? smp.whenBeat / this.bps : smp.when; },
	_sOff( smp ) { return "offsetBeat" in smp ? smp.offsetBeat / this.bps : smp.offset || 0; },
	_sDur( smp ) { return "durationBeat" in smp ? smp.durationBeat / this.bps : smp.duration; },
	_onended() {
		this.onended && this.onended( this.data );
	}
};
