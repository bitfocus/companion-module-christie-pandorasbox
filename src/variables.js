module.exports = {
		initVariables: function() {
		var self = this;

		var variables = [];
		
		variables.push({ variableId: 'seqid', name: 'Selected Sequence for Sequence Time' });
		variables.push({ variableId: 'seqstate', name: 'State of the timeline (Running, Stopped, Paused)' });
		variables.push({ variableId: 'seqtime', name: 'Current time of Sequence (hh:mm:ss)' });
		variables.push({ variableId: 'seqtime_h', name: 'Current time of Sequence (hours)' });
		variables.push({ variableId: 'seqtime_m', name: 'Current time of Sequence (minutes)' });
		variables.push({ variableId: 'seqtime_s', name: 'Current time of Sequence (seconds)' });
		variables.push({ variableId: 'seqtime_f', name: 'Current time of Sequence (frames)' });
		variables.push({ variableId: 'nextqid', name: 'Selected Sequence Remaining Cue Time' });
		variables.push({ variableId: 'nextqtime', name: 'Time until next Cue (hh:mm:ss)' });
		variables.push({ variableId: 'nextqtime_h', name: 'Time until next Cue (hours)' });
		variables.push({ variableId: 'nextqtime_m', name: 'Time until next Cue (minutes)' });
		variables.push({ variableId: 'nextqtime_s', name: 'Time until next Cue (seconds)' });
		variables.push({ variableId: 'nextqtime_f', name: 'Time until next Cue (frames)' });

		self.updateNextQID(1);
		self.updateSeqID(1);
		self.setVariableDefinitions(variables);
	},

	checkVariables: function () {
		let self = this;

		let variableObj = {};

		try {
			if ('seqid' in self.INFO) {
				variableObj['seqid'] = self.INFO['seqid'];
			}

			if ('seqstate' in self.INFO) {
				variableObj['seqstate'] = self.INFO['seqstate'];
			}
		}
		catch(errot) {
			self.log('error', 'Error Processing Variables: ' + String(error));
		}
	},

	updateSeqID: function(changeseqid) {
		var self = this;
		seqid = changeseqid;
		CurrentSeqID = changeseqid;
		CurrentRemeiningSeqID = undefined;
		self.send_getTimer(CurrentSeqID, CurrentRemainingSeqID);
	},

	updateNextQID: function(changenextqid) {
		var self = this;
		nextqid = changenextqid;
		CurrentSeqID = undefined;
		CurrentRemainingSeqID = changenextqid;
		self.send_getTimer(CurrentSeqID, CurrentRemainingSeqID);
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
		var seq_time = '00:00:00:00'
		var nextq_h = '00';
		var nextq_m = '00';
		var nextq_s = '00';
		var nextq_f = '00';
		var nextq_time = '00:00:00:00'

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
