const { InstanceBase, InstanceStatus, runEntrypoint } = require('@companion-module/base')
const UpgradeScripts = require('./upgrades')
const config = require('./config')
const constants = require('./constants')
const actions = require('./actions')
const upgrade= require('./upgrades.js')
const feedbacks = require('./feedbacks')
//const presets = require('./presets')
const utils = require('./utils')
const variables = require('./variables')

class pbInstance extends InstanceBase {
	constructor(internal) {
		super(internal)

		// Assign the methods from the listed files to this class
		Object.assign(this, {
			...config,
			...constants,
			...actions,
			...feedbacks,
			...variables,
			// ...presets,
			...utils,
		})

		this.feedbackstate = {
			seqstate: 'Stop',
			remainingQtime: 'Normal',
		}

		this.state = 0

		this.socket = undefined

	}
	async init(config) {
		this.configUpdated(config)
	}

 	async destroy() {
		let self = this;

		if (self.socket !== undefined) {
			self.socket.destroy();
		}

	}

	async configUpdated(config) {
		this.config = config
		this.updateStatus(InstanceStatus.Connecting)
		this.initActions()
		this.initFeedbacks()
		this.initVariables() // we initalise those when the connection is established.^
		// this.initPresets()

		this.checkVariables();
		this.checkFeedbacks();
		this.initTCP()
	}
}

runEntrypoint(pbInstance, UpgradeScripts)
