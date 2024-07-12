module.exports = {
	/**
	 * Creates the actions for this module.
	 */
	initActions: function () {
		let self = this;
		let actions = {};

		actions.seq_transport = {
			name: 'Sequence Transport',
			options: [
				{
					type: 'dropdown',
					label: 'Transport',
					id: 'mode',
					default: '1',
					choices: [
						{ id: 1, label: 'Play' },
						{ id: 3, label: 'Pause' },
						{ id: 2, label: 'Stop' }
					]
				},
				{
					type: 'textinput',
					label: 'Sequence ID',
					id: 'seq',
					default: '1',
					regex: '/^0*[1-9][0-9]*$/'
				}
			],
			callback: async function (action) {
				let opt = action.options;
				let buf = undefined;
				let message = '';
				message = self.shortToBytes(self.CMD_SET_SEQ_TRANSPORT_MODE)
					.concat(self.intToBytes(parseInt(opt.seq)))
					.concat(self.intToBytes(parseInt(opt.mode)));
				buf = Buffer.from(self.prependHeader(message));
				if (buf !== undefined) {
					self.sendCmd(buf);
				}
			}
		}

		actions.seq_to_cue = {
			name: 'Goto Cue',
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
			],
			callback: async function (action) {
				let opt = action.options;
				let buf = undefined;
				let message = '';
				message = self.shortToBytes(self.CMD_MOVE_SEQ_TO_CUE)
					.concat(self.intToBytes(parseInt(opt.seq)))
					.concat(self.intToBytes(parseInt(opt.cueid)));
				buf = Buffer.from(self.prependHeader(message));
				if (buf !== undefined) {
					self.sendCmd(buf);
				}
			}
		}

		actions.seq_nextlast_cue = {
			name: 'Goto Next/Last Cue',
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
						{ id: 0, label: 'Last CUE' },
						{ id: 1, label: 'Next CUE' }
					]
				}
			],
			callback: async function (action) {
				let opt = action.options;
				let buf = undefined;
				let message = '';
				message = self.shortToBytes(self.CMD_MOVE_SEQ_TO_LASTNEXTCUE)
					.concat(self.intToBytes(parseInt(opt.seq)))
					.concat([parseInt(opt.nextmode)]);
				buf = Buffer.from(self.prependHeader(message));
				if (buf !== undefined) {
					self.sendCmd(buf);
				}
			}
		}

		actions.seq_ignorenextcue = {
			name: 'Ignore Next CUE on Sequence',
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
						{ id: 0, label: 'Do not ignore next CUE' },
						{ id: 1, label: 'Ignore next CUE' }
					]
				}
			],
			callback: async function (action) {
				let opt = action.options;
				let buf = undefined;
				let message = '';
				message = self.shortToBytes(self.CMD_IGNORE_NEXT_CUE)
					.concat(self.intToBytes(parseInt(opt.seq)))
					.concat([parseInt(opt.doignore)]);
				buf = Buffer.from(self.prependHeader(message));
				if (buf !== undefined) {
					self.sendCmd(buf);
				}
			}
		}

		actions.seq_selection = {
			name: 'Select Editing Sequence',
			options: [
				{
					type: 'textinput',
					label: 'Sequence ID',
					id: 'seq',
					default: '1',
					regex: '/^0*[1-9][0-9]*$/'
				}
			],
			callback: async function (action) {
				let opt = action.options;
				let buf = undefined;
				let message = '';
				message = self.shortToBytes(self.CMD_SET_SEQ_SELECTION)
					.concat(self.intToBytes(parseInt(opt.seq)));
				buf = Buffer.from(self.prependHeader(message));
				if (buf !== undefined) {
					self.sendCmd(buf);
				}
			}
		}

		actions.recall_view = {
			name: 'Recall GUI View',
			options: [
				{
					type: 'textinput',
					label: 'View ID',
					id: 'view',
					default: '1',
					regex: '/^0*[1-9][0-9]*$/'
				}
			],
			callback: async function (action) {
				let opt = action.options;
				let buf = undefined;
				let message = '';
				message = self.shortToBytes(self.CMD_APPLY_VIEW)
					.concat(self.intToBytes(parseInt(opt.view)));
				buf = Buffer.from(self.prependHeader(message));
				if (buf !== undefined) {
					self.sendCmd(buf);
				}
			}
		}

		actions.save_project = {
			name: 'Save PandorasBox Project',
			options: [],
			callback: async function (action) {
				let opt = action.options;
				let buf = undefined;
				let message = '';
				message = self.shortToBytes(self.CMD_SAVE_PROJECT);
				buf = Buffer.from(self.prependHeader(message));
				if (buf !== undefined) {
					self.sendCmd(buf);
				}
			}
		},

		actions.toggle_fullscreenbyid = {
				name: 'Toggle Fullscreen by SiteID',
				options: [
					{
						type: 'textinput',
						label: 'SiteID',
						id: 'site',
						default: '1',
						regex: '/^0*[1-9][0-9]*$/'
					}
				],
				callback: async function (action) {
					let opt = action.options;
					let buf = undefined;
					let message = '';
					message = self.shortToBytes(self.CMD_TOGGLE_FULLSCREEN)
						.concat(self.intToBytes(parseInt(opt.site)));
					buf = Buffer.from(self.prependHeader(message));
					if (buf !== undefined) {
						self.sendCmd(buf);
					}
				}
			}

		actions.set_SiteIPbyid = {
			name: 'Set the IP Adress of a Site (Client) by its ID',
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
			],
			callback: async function (action) {
				let opt = action.options;
				let buf = undefined;
				let message = '';
				message = self.shortToBytes(self.CMD_SET_SITE_IP)
					.concat(self.intToBytes(parseInt(opt.site)))
					.concat(self.shortToBytes(opt.siteip.length))
					.concat(self.StrNarrowToBytes(opt.siteip));
				buf = Buffer.from(self.prependHeader(message));
				if (buf !== undefined) {
					self.sendCmd(buf);
				}
			}
		}

		actions.clear_allactive = {
			name: 'Clear ALL Active Values',
			options: [],
			callback: async function (action) {
				let opt = action.options;
				let buf = undefined;
				let message = '';
				message = self.shortToBytes(self.CMD_CLEAR_ALL_ACTIVE);
				buf = Buffer.from(self.prependHeader(message));
				if (buf !== undefined) {
					self.sendCmd(buf);
				}
			}
		},

		actions.store_allactive = {
				name: 'Store ALL Active Values to Sequence',
				options: [
					{
						type: 'textinput',
						label: 'Sequence ID',
						id: 'seq',
						default: '1',
						regex: '/^0*[1-9][0-9]*$/'
					}
				],
				callback: async function (action) {
					let opt = action.options;
					let buf = undefined;
					let message = '';
					message = self.shortToBytes(self.CMD_STORE_ACTIVE)
						.concat(self.intToBytes(parseInt(opt.seq)));
					buf = Buffer.from(self.prependHeader(message));
					if (buf !== undefined) {
						self.sendCmd(buf);
					}
				}
			}

		actions.clear_selection = {
			name: 'Clear Device Selection',
			options: [],
			callback: async function (action) {
				let opt = action.options;
				let buf = undefined;
				let message = '';
				message = self.shortToBytes(self.CMD_CLEAR_SELECTION);
				buf = Buffer.from(self.prependHeader(message));
				if (buf !== undefined) {
					self.sendCmd(buf);
				}
			}
		},

		actions.reset_all = {
				name: 'Reset All Values to Defaults',
				options: [],
				callback: async function (action) {
					let opt = action.options;
					let buf = undefined;
					let message = '';
					message = self.shortToBytes(self.CMD_RESET_ALL);
					buf = Buffer.from(self.prependHeader(message));
					if (buf !== undefined) {
						self.sendCmd(buf);
					}
				}
			},

		actions.get_seq_state = {
			name: 'Get State of Sequence',
			options: [
				{
					type: 'textinput',
					label: 'Sequence ID',
					id: 'seq',
					default: '1',
					regex: '/^0*[1-9][0-9]*$/'
				}
			],
			callback: async function (action) {

			}
		}

		actions.timer_seq_id = {
			name: 'Change Timer Seq ID',
			options: [
				{
					type: 'textinput',
					label: 'Timer Sequence ID',
					id: 'timerseq',
					default: '1',
					regex: '/^0*[1-9][0-9]*$/'
				}
			],
			callback: async function (action) {
				let opt = action.options;
				utils.updateSeqID(opt.timerseq);
			}
		}

		actions.nextq_seq_id = {
			name: 'Change Remaining Cue Time Seq ID',
			options: [
				{
					type: 'textinput',
					label: 'Remaining Cue Time Sequence ID',
					id: 'nextqseq',
					default: '1',
					regex: '/^0*[1-9][0-9]*$/'
				}
			],
			callback: async function (action) {
				let opt = action.options;
				utils.updateNextQID(opt.nextqseq);
			}
		}

		self.setActionDefinitions(actions);
	},
}