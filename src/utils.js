const { TCPHelper, InstanceStatus } = require("@companion-module/base");
const constants = require("./constants");

module.exports = {
	initTCP: function() {
		let self = this;

		if (self.socket !== undefined) {
			self.socket.destroy();
			delete self.socket;
		}

		if (self.config.host) {
			if (!self.config.port) {
				self.config.port = constants.PR_PORT;
			}
			
			self.log('info', 'Host: ' + self.config.host + ' Port: ' + self.config.port);
			self.socket = new TCPHelper(self.config.host, self.config.port);

			self.socket.on('status_change', function(status, message) {
				self.updateStatus(status, message);
			});

			self.socket.on('error', function(err) {
				self.log('error',"Network error: " + err.message);
			});

			self.socket.on('connect', function() {
				self.updateStatus(InstanceStatus.Ok, 'Connected');
				self.initVariables();
				self.log('info', 'Connected to host ' + self.config.host + ' with domain ' + self.config.domain);
			})

			self.socket.on('data', function(data) {
				self.log('debug', 'Listening for dada.');
				self.incomingData(data);
			});
		}

		if (self.config.domain) {
			self.domain = self.intToBytes(parseInt(self.config.domain));
		}
	},


	/**
	 *
	 * @param cmd {Buffer}
	 * @returns {boolean}
	 */
	sendCmd: function(cmd) {
		let self = this;

		if (self.isConnected()) {
			var dbg = (String(cmd) + 'to' + String(self.config.host));
			self.log('debug', dbg);
			return self.socket.sendCmd(cmd);
		} else {
			self.log('debug', 'Send: Socket not connected');
		}

		return false;
	},

	sendGetTimer: function(gseqid, gnextqseqid) {
		let self = this;
		var gettimer;
		var nextqtimeid = gnextqseqid;
		var seqtimeid = gseqid;

		// Create all PBAutomation Commands
		message1 = self.shortToBytes(constants.CMD_GET_SEQ_TIME)
					.concat(self.intToBytes(parseInt(seqtimeid)));
				buf1 = Buffer.from(self.prependHeader(message1));
		message2 = self.shortToBytes(constants.CMD_GET_REMAINING_TIME_UNTIL_NEXT_CUE)
					.concat(self.intToBytes(parseInt(nextqtimeid)));
				buf2 = Buffer.from(self.prependHeader(message2));
		message3 = self.shortToBytes(constants.CMD_GET_SEQ_TRANSPORTMODE)
					.concat(self.intToBytes(parseInt(seqtimeid)));
				buf3 = Buffer.from(self.prependHeader(message3));

		if (self.isConnected()) {
			clearInterval(self.gettimer_interval);
			var gettime_period = 80; // ms
			self.gettimer_interval = setInterval(gettimer, gettime_period);
			function gettimer(){
				self.socket.sendCmd(buf1);
				setTimeout(function() {
					self.socket.sendCmd(buf2);
					setTimeout(function() {
						self.socket.sendCmd(buf3)},18)
					},30);
			}
		} else {
			// self.log('debug', 'Get Timer: Socket not connected');
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
	prependHeader:  function(body) {
	    let self = this;

	    let magic = [80, 66, 65, 85]; // PBAU
	    let preHeader = [1]; // version number

	    // let domain = self.intToBytes(parseInt(self.config.domain));
	    let postHeader = [
	        Math.floor(body.length / 256), body.length % 256,
	        0, 0, 0, 0,
	        0, // protocol: 0 = TCP
	    ];

	    let header = preHeader.concat(self.domain).concat(postHeader);

	    let checksum = header.reduce((p, c) => p + c, 0) % 256;

	    return magic.concat(header).concat([checksum]).concat(body);
	},
	
	padZero: function(size, num) {
		var s = num+"";
		while (s.length < size) s = "0" + s;
		return s;
	},

	intToBytes: function(int) {
		return [
			(int & 0xFF000000) >> 24,
			(int & 0x00FF0000) >> 16,
			(int & 0x0000FF00) >>  8,
		(int & 0x000000FF),
		];
	},

	shortToBytes: function(int) {
		return [
			(int & 0xFF00) >>  8,
			(int & 0x00FF),
		];
	},

	strNarrowToBytes: function(str) {
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
	},

	updateSeqID: function(changeseqid) {
		var self = this;
		seqid = changeseqid;
		CurrentSeqID = changeseqid;
		CurrentRemeiningSeqID = undefined;
		self.sendGetTimer(CurrentSeqID, CurrentRemainingSeqID);
	},

	updateNextQID: function(changenextqid) {
		var self = this;
		nextqid = changenextqid;
		CurrentSeqID = undefined;
		CurrentRemainingSeqID = changenextqid;
		self.sendGetTimer(CurrentSeqID, CurrentRemainingSeqID);
	},

	incomingData: function(data) {
		var self = this;

		let magic = 'PBAU';
		let domain = parseInt(self.config.domain);	
		var receivebuffer = data;

		var rcv_cmd_id = 0;
		var seq_state = 0;
		var seq_h = '00';
		var seq_m = '00';
		var seq_s = '00';
		var seq_f = '00';
		var seq_time = '00:00:00:00';
		var nextq_h = '00';
		var nextq_m = '00';
		var nextq_s = '00';
		var nextq_f = '00';
		var nextq_time = '00:00:00:00';

		self.log('debug', 'Processing data.');

		if (receivebuffer.toString('utf8',0,4) == magic && receivebuffer.readInt32BE(5) == domain) {
			rcv_cmd_id = receivebuffer.readInt16BE(17);

			switch (rcv_cmd_id) {
				case 72 :
					seq_state = receivebuffer.readInt32BE(19);
					if (seq_state == 1){	
						self.feedbackstate.seqstate = 'Play';
						seqstate = 'Play';
					} else if (seq_state == 2) {	
						self.feedbackstate.seqstate = 'Stop';
						seqstate = 'Stop';
					} else if (seq_state == 3) {	
						self.feedbackstate.seqstate = 'Pause';
						seqstate = 'Pause';
					};
					self.checkFeedbacks('state_color');
					break;

				case 73 :
					seq_h = receivebuffer.readInt32BE(19);
					seq_m = receivebuffer.readInt32BE(23);
					seq_s = receivebuffer.readInt32BE(27);
					seq_f = receivebuffer.readInt32BE(31);

					seqtime_h = self.padZero(2,seq_h);
					seqtime_m = self.padZero(2,seq_m);
					seqtime_s = self.padZero(2,seq_s);
					seqtime_f = self.padZero(2,seq_f);
					seqtime = self.padZero(2,seq_h) +':'+self.padZero(2,seq_m)+':'+self.padZero(2,seq_s)+':'+self.padZero(2,seq_f);
					break;

				case 78 :
					nextq_h = receivebuffer.readInt32BE(19);
					nextq_m = receivebuffer.readInt32BE(23);
					nextq_s = receivebuffer.readInt32BE(27);
					nextq_f = receivebuffer.readInt32BE(31);

					nextqtime_h = self.padZero(2,nextq_h);
					nextqtime_m = self.padZero(2,nextq_m);
					nextqtime_s = self.padZero(2,nextq_s);
					nextqtime_f = self.padZero(2,nextq_f);
					nextqtime = self.padZero(2,nextq_h) +':'+self.padZero(2,nextq_m)+':'+self.padZero(2,nextq_s)+':'+self.padZero(2,nextq_f);

					if (nextq_h == 0 && nextq_m == 0 && nextq_s < 5) {
						self.feedbackstate.remainingQtime = 'Less05';
					} else if  (nextq_h == 0 && nextq_m == 0 && nextq_s < 10) {
						self.feedbackstate.remainingQtime = 'Less10';
					} else {
						self.feedbackstate.remainingQtime = 'Normal';
					};
					self.checkFeedbacks('next_Q_color');
					break;
			}
		}
		//self.log("Buffer : " + receivebuffer + " - " + rcv_cmd_id);
		//debug("Buffer : ", receivebuffer);
	}
}
