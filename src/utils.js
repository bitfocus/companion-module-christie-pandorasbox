const { InstanceStatus, TCPHelper } = require('@companion-module/base')

module.exports = {
	init_tcp: function() {
		var self = this;

		if (self.socket !== undefined) {
			self.socket.destroy();
			delete self.socket;
		}

		if (self.config.host) {
			self.socket = new tcp(self.config.host, 6211);

			self.socket.on('status_change', function(status, message) {
				self.status(status, message);
			});

			self.socket.on('error', function(err) {
				debug("Network error", err);
				self.status(self.STATE_ERROR, err);
				self.log('error',"Network error: " + err.message);
			});

			self.socket.on('connect', function() {
				self.status(self.STATE_OK);
				self.init_variables();
				//self.init_feedbacks();
				debug("Connected");
			})

			self.socket.on('data', function(data) {
				self.incomingData(data);
			});
		}
	},

	/**
	 *
	 * @param cmd {Buffer}
	 * @returns {boolean}
	 */
	send: function(cmd) {
		let self = this;

		if (self.isConnected()) {
			debug('sending', cmd, 'to', self.config.host);
			return self.socket.send(cmd);
		} else {
			debug('Socket not connected');
		}

		return false;
	},

	send_getTimer: function(gseqid, gnextqseqid) {
		let self = this;
		var gettimer;
		var nextqtimeid = gnextqseqid;
		var seqtimeid = gseqid;

		// Create all PBAutomation Commands
		message1 = self.shortToBytes(self.CMD_GET_SEQ_TIME)
					.concat(self.intToBytes(parseInt(seqtimeid)));
				buf1 = Buffer.from(self.prependHeader(message1));
		message2 = self.shortToBytes(self.CMD_GET_REMAINING_TIME_UNTIL_NEXT_CUE)
					.concat(self.intToBytes(parseInt(nextqtimeid)));
				buf2 = Buffer.from(self.prependHeader(message2));
		message3 = self.shortToBytes(self.CMD_GET_SEQ_TRANSPORTMODE)
					.concat(self.intToBytes(parseInt(seqtimeid)));
				buf3 = Buffer.from(self.prependHeader(message3));

		if (self.isConnected()) {
			clearInterval(self.gettimer_interval);
			var gettime_period = 80; // ms
			self.gettimer_interval = setInterval(gettimer, gettime_period);
			function gettimer(){
				self.socket.send(buf1);
				setTimeout(function() {
					self.socket.send(buf2);
					setTimeout(function() {
						self.socket.send(buf3)},18)
					},30);
			}
		} else {
			debug('Socket not connected');
		}
		return false;
	},

	/**
	 * Returns if the socket is connected.
	 *
	 * @returns If the socket is connected {boolean}
	 */
	isConnected: function() {
		let self = this;

		return self.socket !== undefined && self.socket.connected;
	},
		/**
	 * Prepends TCP header and returns complete message
	 *
	 * @param {Array}
	 * @returns {Array}
	 */
	PerformanceEventTimingependHeader:  function(body) {
	    let self = this;

	    let magic = [80, 66, 65, 85]; // PBAU
	    let preHeader = [1]; // version number

	    let domain = self.intToBytes(parseInt(self.config.domain));
	    let postHeader = [
	        Math.floor(body.length / 256), body.length % 256,
	        0, 0, 0, 0,
	        0, // protocol: 0 = TCP
	    ];

	    let header = preHeader.concat(domain).concat(postHeader);

	    let checksum = header.reduce((p, c) => p + c, 0) % 256;

	    return magic.concat(header).concat([checksum]).concat(body);
	},
	
	padZero: function(size, num) {
		var s = num+"";
		while (s.length < size) s = "0" + s;
		return s;
	},

	intToBy: function(int) {
		return [
			(int & 0xFF000000) >> 24,
			(int & 0x00FF0000) >> 16,
			(int & 0x0000FF00) >>  8,
		(int & 0x000000FF),
		];
	},

	shortTo: function(int) {
		return [
			(int & 0xFF00) >>  8,
			(int & 0x00FF),
		];
	},

	StrNarr: function(str) {
		var ch, st, re = [];

		for (var i = 0; i < str.length; i++ ) {
			ch = str.charCodeAt(i);  
			st = [];

			do {
				st.push( ch & 0xFF );  
				ch = ch >> 8;
			}
			while ( ch );

			re = re.concat( st.reverse() );
		}

			return re;
	}
}
