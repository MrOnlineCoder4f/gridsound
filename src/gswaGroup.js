"use strict";

function gswaGroup() {
	this.id = ++gswaGroup.id;
	this.parents = {};
	this.samples = [];
	this.samplesRev = [];
	this._onendedResolve = [];
	this.setBpm( 60 );
};

gswaGroup.id = 0;
gswaGroup.prototype = {
	setContext( ctx ) {
		this.ctx = ctx;
	},
	setBpm( bpm ) {
		if ( this.bpm !== bpm ) {
			this.bpm = bpm;
			this.bps = bpm / 60;
			this.samples.forEach( function( smp ) {
				if ( smp.source instanceof gswaGroup ) {
					smp.source.setBpm( bpm );
				}
			} );
			this._updateDur();
		}
	},
	empty() {
		var id = this.id;

		this.samples.forEach( function( smp ) {
			delete smp.source.parents[ id ];
		} );
		this.samples.length = 0;
		this.samplesRev.length = 0;
		this.update();
	},
	start( when, offset, duration ) {
		return new Promise( resolve => {
			this._onendedResolve.push( resolve );
			setTimeout( resolve, this._start( when, offset, duration ) * 1000 );
		} );
	},
	stop() {
		this.samples.forEach( function( smp ) {
			smp.source.stop();
		} );
		this._onendedResolve.forEach( function( resolve ) {
			resolve();
		} );
		this._onendedResolve.length = 0;
	},
	addSample( smp ) {
		var par = smp.source.parents,
			id = this.id;

		if ( par ) {
			if ( !par[ id ] ) {
				par[ id ] = { obj: this, nb: 1 };
			} else {
				++par[ id ].nb;
			}
		}
		smp.offset = smp.offset || 0;
		this.samples.push( smp );
		this.samplesRev.push( smp );
	},
	addSamples( arr ) {
		arr.forEach( this.addSample.bind( this ) );
	},
	removeSample( smp ) {
		var par = smp.source.parents,
			ind = this.samples.indexOf( smp );

		if ( ind > 0 ) {
			if ( par && --par[ this.id ].nb <= 0 ) {
				delete par[ this.id ];
			}
			this.samples.splice( ind, 1 );
			this.samplesRev.splice( this.samplesRev.indexOf( smp ), 1 );
		}
	},
	removeSamples( arr ) {
		arr.forEach( this.removeSample.bind( this ) );
	},
	update() {
		var par = this.parents;

		this._sortSmp();
		this._updateDur();
		for ( var id in par ) {
			par[ id ].obj.update();
		}
	},

	// private:
	_start( when, offset, duration ) {
		var bps = this.bps,
			maxdur = this.duration;

		if ( maxdur ) {
			when = when > 0 ? when : this.ctx.currentTime;
			offset = ( offset || 0 ) / bps;
			duration = maxdur =
				( duration != null ? duration : maxdur ) / bps;
			this.samples.forEach( function( smp ) {
				var src = smp.source,
					isgroup = src instanceof gswaGroup,
					smpwhen = smp.when / bps - offset,
					smpoff = smp.offset,
					smpdur = smp.duration != null ? smp.duration : src.duration;

				if ( isgroup ) {
					smpoff /= bps;
					smpdur /= bps;
				}
				if ( smpwhen < 0 ) {
					smpoff -= smpwhen;
					smpdur += smpwhen;
				}
				smpdur += Math.min( duration - smpwhen - smpdur, 0 );
				if ( smpdur > 0 ) {
					smpwhen = when + Math.max( 0, smpwhen );
					isgroup
						? src._start( smpwhen, smpoff * bps, smpdur * bps )
						: src.start( smpwhen, smpoff, smpdur );
				}
			} );
		}
		return maxdur;
	},
	_updateDur() {
		var smp = this.samplesRev[ 0 ];

		this.duration = smp ? this._beatEnd( smp ) : 0;
	},
	_sortSmp() {
		this.samples.sort( function( a, b ) {
			return cmp( a.when, b.when );
		} );
		this.samplesRev.sort( ( a, b ) => {
			return cmp( this._beatEnd( b ), this._beatEnd( a ) );
		} );

		function cmp( a, b ) {
			return a < b ? -1 : a > b ? 1 : 0;
		}
	},
	_beatEnd( smp ) {
		var src = smp.source,
			dur = smp.duration != null ? smp.duration : src.duration;

		return smp.when + ( src._beatEnd ? dur : dur * this.bps );
	}
};
