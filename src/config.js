module.exports = {
 /**
 * Return config fields for web config.
 *
 * @returns      The config fields for the module {Object}
 */
	config_fields: function() {
		let self = this;
		return [
			{
				type: 'text',
				id: 'info',
				width: 12,
				label: 'Information',
				value: "Christie Pandoras Box V6 Control using PBAutomation SDK"
			},
			{
				type: 'textinput',
				id: 'host',
				label: 'Target IP',
				width: 6,
				regex: self.REGEX_IP
			},
			{
				type: 'textinput',
				id: 'domain',
				width: 5,
				label: 'Domain',
				value: "0",
				regex: self.REGEX_NUMBER
			}
		];
	}
}
