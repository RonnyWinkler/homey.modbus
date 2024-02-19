'use strict';

const Homey = require('homey');

module.exports = class ModbusApp extends Homey.App {
  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('ModbusApp has been initialized');

    if (process.env.DEBUG === '1') {
      if (this.homey.platform == "local") {
        try {
          require('inspector').waitForDebugger();
        }
        catch (error) {
          require('inspector').open(9229, '0.0.0.0', true);
        }
      }

      await this._initFlowActions()
    }
  }

  async _initFlowActions(){
    this.homey.flow.getActionCard('read_register')
    .registerRunListener(async (args, state) => {
        let result = await args.device.flowActionReadRegister(args.register, args.size, args.type);
        return {
          "value": result
        }
    });

    this.homey.flow.getActionCard('write_register')
    .registerRunListener(async (args, state) => {
        await args.device.flowActionWriteRegister(args.register, args.value);
    });
  }

}
