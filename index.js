const { InstanceBase, InstanceStatus, runEntrypoint } = require('@companion-module/base')
const UpgradeScripts = require('./src/upgrades')
const config = require('./src/config')
const constants = require('./src/constants')
const actions = require('./src/actions')
const upgrade= require('./src/upgrades.js')
const feedbacks = require('./src/feedbacks')
//const presets = require('./src/presets')
const utils = require('./src/utils')
const variables = require('./src/variables')

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
		// this.initVariables()
		// this.initPresets()

		// this.checkVariables();
		// this.checkFeedbacks();
		this.initTCP()
	}
}

runEntrypoint(pbInstance, UpgradeScripts)
