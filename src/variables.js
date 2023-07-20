module.exports = {
		init_variables: function() {
		var self = this;

		var variables = [
			{
				label: 'Selected Sequence for Sequence Time',
				name: 'seqid'
			},
			{
				label: 'State of the timeline (Running, Stopped, Paused)',
				name: 'seqstate'
			},
			{
				label: 'Current time of Sequence (hh:mm:ss)',
				name: 'seqtime'
			},
			{
				label: 'Current time of Sequence (hours)',
				name: 'seqtime_h'
			},
			{
				label: 'Current time of Sequence (minutes)',
				name: 'seqtime_m'
			},
			{
				label: 'Current time of Sequence (seconds)',
				name: 'seqtime_s'
			},
			{
				label: 'Current time of Sequence (frames)',
				name: 'seqtime_f'
			},
			{
				label: 'Selected Sequence Remaining Cue Time',
				name: 'nextqid'
			},
			{
				label: 'Time until next Cue (hh:mm:ss)',
				name: 'nextqtime'
			},
			{
				label: 'Time until next Cue (hours)',
				name: 'nextqtime_h'
			},
			{
				label: 'Time until next Cue (minutes)',
				name: 'nextqtime_m'
			},
			{
				label: 'Time until next Cue (seconds)',
				name: 'nextqtime_s'
			},
			{
				label: 'Time until next Cue (frames)',
				name: 'nextqtime_f'
			}
		];

		self.updateNextQID(1);
		self.updateSeqID(1);
		self.setVariableDefinitions(variables);
	},

pupdateSeqID: function(changeseqid) {
	var self = this;
	self.setVariable('seqid', changeseqid);
	CurrentSeqID = changeseqid;
	self.send_getTimer(CurrentSeqID, CurrentRemainingSeqID);
},

pupdateNextQID: function(changenextqid) {
	var self = this;
	self.setVariable('nextqid', changenextqid);
	CurrentRemainingSeqID = changenextqid;
	self.send_getTimer(CurrentSeqID, CurrentRemainingSeqID);
},

pincomingData: function(data) {
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
					self.setVariable('seqstate', 'Play');
				} else if (seq_state == 2) {	
					self.feedbackstate.seqstate = 'Stop';
					self.setVariable('seqstate', 'Stop');
				} else if (seq_state == 3) {	
					self.feedbackstate.seqstate = 'Pause';
					self.setVariable('seqstate', 'Pause');
				};
				self.checkFeedbacks('state_color');
				break;

			case 73 :
				seq_h = receivebuffer.readInt32BE(19);
				seq_m = receivebuffer.readInt32BE(23);
				seq_s = receivebuffer.readInt32BE(27);
				seq_f = receivebuffer.readInt32BE(31);

				self.setVariable('seqtime_h', self.padZero(2,seq_h));
				self.setVariable('seqtime_m', self.padZero(2,seq_m));
				self.setVariable('seqtime_s', self.padZero(2,seq_s));
				self.setVariable('seqtime_f', self.padZero(2,seq_f));
				self.setVariable('seqtime', self.padZero(2,seq_h) +':'+self.padZero(2,seq_m)+':'+self.padZero(2,seq_s)+':'+self.padZero(2,seq_f));
				break;

			case 78 :
				nextq_h = receivebuffer.readInt32BE(19);
				nextq_m = receivebuffer.readInt32BE(23);
				nextq_s = receivebuffer.readInt32BE(27);
				nextq_f = receivebuffer.readInt32BE(31);

				self.setVariable('nextqtime_h', self.padZero(2,nextq_h));
				self.setVariable('nextqtime_m', self.padZero(2,nextq_m));
				self.setVariable('nextqtime_s', self.padZero(2,nextq_s));
				self.setVariable('nextqtime_f', self.padZero(2,nextq_f));
				self.setVariable('nextqtime', self.padZero(2,nextq_h) +':'+self.padZero(2,nextq_m)+':'+self.padZero(2,nextq_s)+':'+self.padZero(2,nextq_f));

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
