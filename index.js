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
			...actions,
			...feedbacks,
			...variables,
			// ...presets,
			...utils,
			...constants
		})

		this.firmwareVersion = '0';
		this.counter = 0;
		this.state = 0;

		this.socket = undefined;

		this.INFO = {};

		this.INTERVAL = undefined;
	}

 	async destroy() {
		let self = this;

		if (self.socket !== undefined) {
			self.socket.destroy();
		}

		if (self.INTERVAL !== undefined) {
			clearInterval(self.INTERVAL);
			self.INTERVAL = undefined;
		}
	
		self.requests = {};
	}

	async init(config) {
		this.configUpdated(config)
	}

	async configUpdated(config) {
		this.config = config
	
		this.updateStatus(InstanceStatus.Connecting);
		
		this.initActions()
		this.initFeedbacks()
		this.initVariables()
		// this.initPresets()

		// this.checkVariables();
		// this.checkFeedbacks();

		this.initTCP();
	}
}

runEntrypoint(pbInstance, UpgradeScripts);
