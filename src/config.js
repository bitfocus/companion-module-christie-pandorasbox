const { Regex } = require("@companion-module/base");
const utils = require("./utils");
const actions = require("./actions");

module.exports = {
 /**
 * Return config fields for web config.
 *
 * @returns      The config fields for the module {Object}
 */
	getConfigFields() {
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
				regex: Regex.IP
			},
			{
				type: 'static-text',
				id: 'port',
				label: 'Port (static): ',
				value: '6211'
			},
			{
				type: 'textinput',
				id: 'domain',
				width: 5,
				label: 'Domain',
				default: "0",
				regex: Regex.NUMBER
			}
		];
	}
}
