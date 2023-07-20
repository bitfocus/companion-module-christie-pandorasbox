const variables = require("./variables");

module.exports = {
	/**
	 * Creates the actions for this module.
	 */
	initActions: function() {
		let self = this;
		let actions = {};

			actions.seq_transport = {
				label: 'Sequence Transport',
				options: [
					{
						type: 'dropdown',
						label: 'Transport',
						id: 'mode',
						default: '1',
						choices: [
							{id: 1, label: 'Play'},
							{id: 3, label: 'Pause'},
							{id: 2, label: 'Stop'}
						]
					},
					{
						type: 'textinput',
						label: 'Sequence ID',
						id: 'seq',
						default: '1',
						regex: '/^0*[1-9][0-9]*$/'
					}
				]
			}

			actions.seq_to_cue = {
				label: 'Goto Cue',
				options: [
					{
						type: 'textinput',
						label: 'Sequence ID',
						id: 'seq',
						default: '1',
						regex: '/^0*[1-9][0-9]*$/'
					},
					{
						type: 'textinput',
						label: 'Cue ID',
						id: 'cueid',
						default: '1',
						regex: '/^0*[1-9][0-9]*$/'
					}
				]
			}

			actions.seq_nextlast_cue = {
				label: 'Goto Next/Last Cue',
				options: [
					{
						type: 'textinput',
						label: 'Sequence ID',
						id: 'seq',
						default: '1',
						regex: '/^0*[1-9][0-9]*$/'
					},
					{
						type: 'dropdown',
						label: 'Next or Last',
						id: 'nextmode',
						default: '1',
						choices: [
							{id: 0, label: 'Last CUE'},
							{id: 1, label: 'Next CUE'}
						]
					}
				]
			}

			actions.seq_ignorenextcue = {
				label: 'Ignore Next CUE on Sequence',
				options: [
					{
						type: 'textinput',
						label: 'Sequence ID',
						id: 'seq',
						default: '1',
						regex: '/^0*[1-9][0-9]*$/'
					},
					{
						type: 'dropdown',
						label: 'Ignore / Not ignore next Cue',
						id: 'doignore',
						default: '1',
						choices: [
							{id: 0, label: 'Do not ignore next CUE'},
							{id: 1, label: 'Ignore next CUE'}
						]
					}
				]
			}

			actions.seq_selection = {
				label: 'Select Editing Sequence',
				options: [
					{
						type: 'textinput',
						label: 'Sequence ID',
						id: 'seq',
						default: '1',
						regex: '/^0*[1-9][0-9]*$/'
					}
				]
			}

			actions.recall_view = {
				label: 'Recall GUI View',
				options: [
					{
						type: 'textinput',
						label: 'View ID',
						id: 'view',
						default: '1',
						regex: '/^0*[1-9][0-9]*$/'
					}
				]
			}

			actions.save_project = { label: 'Save PandorasBox Project' },
			actions.toggle_fullscreenbyid = {
				label: 'Toggle Fullscreen by SiteID',
				options: [
					{
						type: 'textinput',
						label: 'SiteID',
						id: 'site',
						default: '1',
						regex: '/^0*[1-9][0-9]*$/'
					}
				]
			}

			actions.set_SiteIPbyid = {
				label: 'Set the IP Adress of a Site (Client) by its ID',
				options: [
					{
						type: 'textinput',
						label: 'SiteID',
						id: 'site',
						default: '1',
						regex: '/^0*[1-9][0-9]*$/'
					},
					{
						type: 'textinput',
						id: 'siteip',
						label: 'IP for Site',
						width: 6,
						regex: self.REGEX_IP
					}
				]
			}

			actions.clear_allactive = { label: 'Clear ALL Active Values' },
			actions.store_allactive = {
				label: 'Store ALL Active Values to Sequence',
				options: [
					{
						type: 'textinput',
						label: 'Sequence ID',
						id: 'seq',
						default: '1',
						regex: '/^0*[1-9][0-9]*$/'
					}
				]
			}

			actions.clear_selection = { label: 'Clear Device Selection' },
			actions.reset_all = { label: 'Reset All Values to Defaults' },
			actions.get_seq_state =   {
				label: 'Get State of Sequence',
				options: [
					{
						type: 'textinput',
						label: 'Sequence ID',
						id: 'seq',
						default: '1',
						regex: '/^0*[1-9][0-9]*$/'
					}
				]
			}

			actions.timer_seq_id = {
				label: 'Change Timer Seq ID',
				options: [
					{
						type: 'textinput',
						label: 'Timer Sequence ID',
						id: 'timerseq',
						default: '1',
						regex: '/^0*[1-9][0-9]*$/'
					}
				]
			}

			actions.nextq_seq_id = {
				label: 'Change Remaining Cue Time Seq ID',
				options: [
					{
						type: 'textinput',
						label: 'Remaining Cue Time Sequence ID',
						id: 'nextqseq',
						default: '1',
						regex: '/^0*[1-9][0-9]*$/'
					}
				]
			}
	},

 /**
 * Executes the action and sends the TCP packet to Pandoras Box
 *
 * @param action      The action to perform
 */
	action: function(action) {
		let self = this;
		var opt = action.options;

		let buf = undefined;
		let message = '';

		switch (action.action) {
			case 'seq_transport':
				message = self.shortToBytes(self.CMD_SET_SEQ_TRANSPORT_MODE)
					.concat(self.intToBytes(parseInt(opt.seq)))
					.concat(self.intToBytes(parseInt(opt.mode)));
				buf = Buffer.from(self.prependHeader(message));
				break;

			case 'seq_to_cue':
				message = self.shortToBytes(self.CMD_MOVE_SEQ_TO_CUE)
					.concat(self.intToBytes(parseInt(opt.seq)))
					.concat(self.intToBytes(parseInt(opt.cueid)));
				buf = Buffer.from(self.prependHeader(message));
				break;

			case 'seq_nextlast_cue':
				message = self.shortToBytes(self.CMD_MOVE_SEQ_TO_LASTNEXTCUE)
					.concat(self.intToBytes(parseInt(opt.seq)))
					.concat([parseInt(opt.nextmode)]);
				buf = Buffer.from(self.prependHeader(message));
				break;

			case 'seq_ignorenextcue':
				message = self.shortToBytes(self.CMD_IGNORE_NEXT_CUE)
					.concat(self.intToBytes(parseInt(opt.seq)))
					.concat([parseInt(opt.doignore)]);
				buf = Buffer.from(self.prependHeader(message));
				break;

			case 'seq_selection':
				message = self.shortToBytes(self.CMD_SET_SEQ_SELECTION)
					.concat(self.intToBytes(parseInt(opt.seq)));
				buf = Buffer.from(self.prependHeader(message));
				break;

			case 'recall_view':
				message = self.shortToBytes(self.CMD_APPLY_VIEW)
					.concat(self.intToBytes(parseInt(opt.view)));
				buf = Buffer.from(self.prependHeader(message));
				break;

			case 'save_project':
				message = self.shortToBytes(self.CMD_SAVE_PROJECT);
				buf = Buffer.from(self.prependHeader(message));
				break;

			case 'toggle_fullscreenbyid':
				message = self.shortToBytes(self.CMD_TOGGLE_FULLSCREEN)
					.concat(self.intToBytes(parseInt(opt.site)));
				buf = Buffer.from(self.prependHeader(message));
				break;

			case 'set_SiteIPbyid':
				message = self.shortToBytes(self.CMD_SET_SITE_IP)
					.concat(self.intToBytes(parseInt(opt.site)))
					.concat(self.shortToBytes(opt.siteip.length))
					.concat(self.StrNarrowToBytes(opt.siteip));
				buf = Buffer.from(self.prependHeader(message));
				break;

			case 'clear_allactive':
				message = self.shortToBytes(self.CMD_CLEAR_ALL_ACTIVE);
				buf = Buffer.from(self.prependHeader(message));
				break;

			case 'store_allactive':
				message = self.shortToBytes(self.CMD_STORE_ACTIVE)
					.concat(self.intToBytes(parseInt(opt.seq)));
				buf = Buffer.from(self.prependHeader(message));
				break;

			case 'clear_selection':
				message = self.shortToBytes(self.CMD_CLEAR_SELECTION);
				buf = Buffer.from(self.prependHeader(message));
				break;

			case 'reset_all':
				message = self.shortToBytes(self.CMD_RESET_ALL);
				buf = Buffer.from(self.prependHeader(message));
				break;
		
			case 'timer_seq_id':
				variables.updateSeqID(opt.timerseq);
				break;
		
			case 'nextq_seq_id':
				variables.updateNextQID(opt.nextqseq);
				break;
			}

			if (buf !== undefined) {
				self.send(buf);
		}
	}
}