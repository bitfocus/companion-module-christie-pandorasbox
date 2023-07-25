const { runEntrypoint, InstanceBase, InstanceStatus } = require('@companion-module/base') 

const actions = require('./src/actions')
const config = require('./src/config')
const constants = require('./src/constants');
const feedbacks = require('./src/feedbacks')
// const presets = require('./src/presets')
const UpgradeScripts = require('./src/upgrades')
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
			...utils
		})

		this.feedbackstate = {
			seqstate: 'Stop',
			remainingQtime: 'Normal',
		}

		this.state = 0;

		this.socket = undefined;

	}

 	async destroy() {
		let self = this;

		if (self.socket !== undefined) {
			self.socket.destroy();
		}

	}

	async init(config) {
		this.configUpdated(config)
	}

	async configUpdated(config) {
		this.config = config
	
		this.updateStatus(InstanceStatus.Connecting);
		
		this.initActions()
		this.initFeedbacks()
		// this.initVariables()
		// this.initPresets()

		// this.checkVariables();
		// this.checkFeedbacks();

		this.initTCP();
	}
}

runEntrypoint(pbInstance, UpgradeScripts);
