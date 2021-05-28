"use strict";

window.AudioContext = window.AudioContext || window.webkitAudioContext;

function walContext() {
	this.ctx = new window.AudioContext();
	this.destination = this.ctx.destination;
	this.filters = this.createFilters();
	this.buffers = [];
	this.compositions = [];
	this.nbPlaying = 0;
	this.filters.connect( this.destination );
	this.nodeIn = this.filters.nodeIn;
	delete this.filters.connect;
};

walContext.prototype = {
	gain: function( vol ) {
		if ( !arguments.length ) {
			return this.filter.gain();
		}
		this.filter.gain( vol );
		return this;
	},
	createSample: function() {
		return new walContext.Sample( this );
	},
	createBuffer: function( file ) {
		var that = this;

		return new Promise( function( res, rej ) {
			new walContext.Buffer( that, file, res, rej );
		} ).then( function( buf ) {
			that.buffers.push( buf );
			return buf;
		} );
	},
	createFilters: function() {
		return new walContext.Filters( this );
	},
	createComposition: function() {
		var compo = new walContext.Composition( this );

		this.compositions.push( compo );
		return compo;
	}
};
