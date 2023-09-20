const { Regex } = require('@companion-module/base')
const constants = require("./constants")

module.exports = {
 /**
 * Return config fields for web config.
 * 
 * @returns      The config fields for the module {Object}
 */
	getConfigFields() {
		return [
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'Information',
				value: "Christie Pandoras Box V6 Control using PBAutomation SDK"
			},
			{
				type: 'textinput',
				id: 'host',
				width: 6,
				label: 'Target IP',
				regex: Regex.IP
			},
			{
				type: 'textinput',
				id: 'domain',
				width: 5,
				label: 'Domain',
				default: "0",
				regex: Regex.NUMBER
			}
		]
	}
}
