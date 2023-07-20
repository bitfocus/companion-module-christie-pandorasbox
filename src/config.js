module.exports = {
	/**
	 * The user updated the config.
	 *
	 * @param config         The new config object
	 */
	updateConfig: function(config) {
		let self = this;

		// Reconnect to Pandoras Box if the IP changed
		if (self.config.host !== config.host || self.isConnected() === false) {
			self.config.host = config.host;
			self.init_tcp();
		}

		// Keep config around
		self.config = config;

		// Build actions
		self.actions();
	},

 /**
 * Return config fields for web config.
 *
 * @returns      The config fields for the module {Object}
 */
	getConfigFields: function() {
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
