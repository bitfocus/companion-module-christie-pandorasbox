module.exports = {
	initVariables: function() {
		var self = this;

		var variables = [];
		
		variables.push({ variableId: 'seqid',       name: 'Selected Sequence for Sequence Time' });
		variables.push({ variableId: 'seqstate',    name: 'State of the timeline (Running, Stopped, Paused)' });
		variables.push({ variableId: 'seqtime',     name: 'Current time of Sequence (hh:mm:ss)' });
		variables.push({ variableId: 'seqtime_h',   name: 'Current time of Sequence (hours)' });
		variables.push({ variableId: 'seqtime_m',   name: 'Current time of Sequence (minutes)' });
		variables.push({ variableId: 'seqtime_s',   name: 'Current time of Sequence (seconds)' });
		variables.push({ variableId: 'seqtime_f',   name: 'Current time of Sequence (frames)' });
		variables.push({ variableId: 'nextqid',     name: 'Selected Sequence Remaining Cue Time' });
		variables.push({ variableId: 'nextqtime',   name: 'Time until next Cue (hh:mm:ss)' });
		variables.push({ variableId: 'nextqtime_h', name: 'Time until next Cue (hours)' });
		variables.push({ variableId: 'nextqtime_m', name: 'Time until next Cue (minutes)' });
		variables.push({ variableId: 'nextqtime_s', name: 'Time until next Cue (seconds)' });
		variables.push({ variableId: 'nextqtime_f', name: 'Time until next Cue (frames)' });

		self.setVariableDefinitions(variables);

		self.updateNextQID(1);
		self.updateSeqID(1);
		self.log('debug', 'Variables initiated')
	},

	updateSeqID: function(changeseqid) {
		var self = this;
		self.seqid = changeseqid;
		currentSeqID = self.seqid;
		currentRemainingSeqID = self.nextqid;
		self.setVariableValues({ 'seqid': currentSeqID, });
		self.log('debug', "updated Seq ID " + currentSeqID);
		self.sendGetTimer(currentSeqID, currentRemainingSeqID);
	},

	updateNextQID: function(changenextqid) {
		var self = this;
		self.nextqid = changenextqid;
		currentSeqID = self.seqid;
		currentRemainingSeqID = self.nextqid;
		self.setVariableValues({ 'nextqid': currentRemainingSeqID, });
		self.log('debug', "updated remaining " + currentRemainingSeqID);
		self.sendGetTimer(currentSeqID, currentRemainingSeqID);
	},

	checkVariables: function () {
		let self = this;
		self.INFO = {}

		let variableObj = {};

		try {
			if ('seqid' in self.INFO) {
				variableObj['seqid'] = self.INFO['seqid'];
				self.log('debug', "seqid OK")
			}

			if ('seqstate' in self.INFO) {
				variableObj['seqstate'] = self.INFO['seqstate'];
				self.log('debug', "seqstate OK")
			}
		}
		catch(error) {
			self.log('error', 'Error Processing Variables: ' + String(error));
		}
	}
}
