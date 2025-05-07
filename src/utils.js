const { InstanceStatus, TCPHelper } = require('@companion-module/base')
const constants = require('./constants')

module.exports = {
	initTCP: function() {
		let self = this;
		var run_once = false;

		self.updateStatus(InstanceStatus.Connecting)

		if (self.config.host) {
						
			self.log('info', 'Setting up Host: ' + self.config.host + ' and Port: ' + constants.PR_PORT);
			self.socket = new TCPHelper(self.config.host, constants.PR_PORT);

			self.socket.on('status_change', function(status, message) {
				self.updateStatus(status, message);
			 })

			self.socket.on('error', function(err) {
				self.log('error',"Network error: " + err.message);
			})

			self.socket.on('connect', function() {
				self.log('info', 'Connecting to host ' + self.config.host + ' with domain ' + self.config.domain);
				self.updateStatus(InstanceStatus.Ok, 'Connected');
				self.log('info', 'Connected to host ' + self.config.host);
				// self.initVariables();
			})

			self.socket.on('data', function(data) {
				if (!run_once) {
					self.log('debug', 'Listening for data.');
					run_once = true;
				};	
				self.incomingData(data);
			});
		}
	},


	/**
	 *
	 * @param cmd {Buffer}
	 * @returns {boolean}
	 */
	sendCmd: function (cmd) {
		let self = this;

		// var dbg = ('Sending ' + String(cmd) + ' to ' + String(self.config.host));
		// self.log('debug', dbg);
		if (self.socket !== undefined && self.socket.isConnected) {
			self.socket.send(cmd);
		}
	},

	sendGetTimer: function (gseqid, gnextqseqid) {
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

		clearInterval(self.gettimer_interval);
		var gettime_period = 80; // ms
		self.gettimer_interval = setInterval(gettimer, gettime_period);
		function gettimer(){
				self.sendCmd(buf1);
				setTimeout(function () {
					self.sendCmd(buf2);
					setTimeout(function () {
						self.sendCmd(buf3)
						}, 18)
					}, 30);
				}
		return false;
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

	incomingData: function(data) {
		let self = this;
		let magic = 'PBAU'; 
		let domain = parseInt(self.config.domain);	
		var receivebuffer = data;

		var rcv_cmd_id = 0;
		var seq_state = 0;
		var seq_h = '00';
		var seq_m = '00';
		var seq_s = '00';
		var seq_f = '00';
		// var seq_time = '00:00:00:00';
		var nextq_h = '00';
		var nextq_m = '00';
		var nextq_s = '00';
		var nextq_f = '00';
		// var nextq_time = '00:00:00:00';

		// self.log('debug', 'Processing data.');

		if (receivebuffer.toString('utf8',0,4) == magic && receivebuffer.readInt32BE(5) == domain) {
			rcv_cmd_id = receivebuffer.readInt16BE(17);
			switch (rcv_cmd_id) {
				case constants.CMD_GET_SEQ_TRANSPORTMODE : 
					seq_state = receivebuffer.readInt32BE(19);
					if (seq_state == 1){	
						self.feedbackstate.seqstate = 'Play';
						self.seqstate = 'Play';
					} else if (seq_state == 2) {	
						self.feedbackstate.seqstate = 'Stop';
						self.seqstate = 'Stop';
					} else if (seq_state == 3) {	
						self.feedbackstate.seqstate = 'Pause';
						self.seqstate = 'Pause';
					};
					self.setVariableValues({ 'seqstate': self.seqstate, });
					self.checkFeedbacks('state_color');
					break;
				case constants.CMD_GET_SEQ_TIME : 
					seq_h = receivebuffer.readInt32BE(19);
					seq_m = receivebuffer.readInt32BE(23);
					seq_s = receivebuffer.readInt32BE(27);
					seq_f = receivebuffer.readInt32BE(31);

					self.seqtime_h = self.padZero(2,seq_h);
					self.seqtime_m = self.padZero(2,seq_m);
					self.seqtime_s = self.padZero(2,seq_s);
					self.seqtime_f = self.padZero(2,seq_f);
					self.seqtime   = self.padZero(2,seq_h) +':'+self.padZero(2,seq_m)+':'+self.padZero(2,seq_s)+':'+self.padZero(2,seq_f);
					self.setVariableValues({
								'seqtime': self.seqtime,
								'seqtime_h': self.seqtime_h,
								'seqtime_m': self.seqtime_m,
								'seqtime_s': self.seqtime_s,
								'seqtime_f': self.seqtime_f,
							});
					break;
				case constants.CMD_GET_REMAINING_TIME_UNTIL_NEXT_CUE : 
					nextq_h = receivebuffer.readInt32BE(19);
					nextq_m = receivebuffer.readInt32BE(23);
					nextq_s = receivebuffer.readInt32BE(27);
					nextq_f = receivebuffer.readInt32BE(31);

					self.nextqtime_h = self.padZero(2,nextq_h);
					self.nextqtime_m = self.padZero(2,nextq_m);
					self.nextqtime_s = self.padZero(2,nextq_s);
					self.nextqtime_f = self.padZero(2,nextq_f);
					self.nextqtime   = self.padZero(2,nextq_h) +':'+self.padZero(2,nextq_m)+':'+self.padZero(2,nextq_s)+':'+self.padZero(2,nextq_f);

					if (nextq_h == 0 && nextq_m == 0 && nextq_s < 5) {
						self.feedbackstate.remainingQtime = 'Less05';
					} else if  (nextq_h == 0 && nextq_m == 0 && nextq_s < 10) {
						self.feedbackstate.remainingQtime = 'Less10';
					} else {
						self.feedbackstate.remainingQtime = 'Normal';
					};
					self.setVariableValues({
						'nextqtime': self.nextqtime,
						'nextqtime_h': self.nextqtime_h,
						'nextqtime_m': self.nextqtime_m,
						'nextqtime_s': self.nextqtime_s,
						'nextqtime_f': self.nextqtime_f,
					});
					self.checkFeedbacks('next_Q_color');
					break;
			}
		}
			// self.log('info', "Buffer : " + receivebuffer + " - " + rcv_cmd_id);
			// console.log(receivebuffer)
	}
}
