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
          require('inspector').open(9292, '0.0.0.0', true);
        }
      }
    }

    await this._initFlowActions()
  }

  async _initFlowActions(){

    this.homey.flow.getActionCard('connect_device')
    .registerRunListener(async (args, state) => {
        await args.device.flowActionConnectDevice();
    });

    this.homey.flow.getActionCard('disconnect_device')
    .registerRunListener(async (args, state) => {
        await args.device.flowActionDisconnectDevice();
    });

    this.homey.flow.getActionCard('read_register')
    .registerRunListener(async (args, state) => {
        let register =  args.register;
        if (args.addressing == "1"){
          register = args.register - 1;
        }  
        let {valueString, valueNumeric} = await args.device.flowActionReadAddress( register, args.size, args.type);
        return {
          "value": valueString,
          "value_numeric": valueNumeric
        }
    });

    this.homey.flow.getActionCard('read_register_input')
    .registerRunListener(async (args, state) => {
        let register =  args.register;
        if (args.addressing == "1"){
          register = args.register - 1;
        }  
        let {valueString, valueNumeric} = await args.device.flowActionReadAddressInput( register, args.size, args.type);
        return {
          "value": valueString,
          "value_numeric": valueNumeric
        }
    });

    this.homey.flow.getActionCard('read_register_coil')
    .registerRunListener(async (args, state) => {
        let register =  args.register;
        if (args.addressing == "1"){
          register = args.register - 1;
        }  
        let {valueBoolean} = await args.device.flowActionReadAddressCoil( register );
        return {
          "value_boolean": valueBoolean
        }
    });

    this.homey.flow.getActionCard('read_register_discrete')
    .registerRunListener(async (args, state) => {
        let register =  args.register;
        if (args.addressing == "1"){
          register = args.register - 1;
        }  
        let {valueBoolean} = await args.device.flowActionReadAddressDiscrete( register );
        return {
          "value_boolean": valueBoolean
        }
    });

    this.homey.flow.getActionCard('write_register')
    .registerRunListener(async (args, state) => {
      let register =  args.register;
      if (args.addressing == "1"){
        register = args.register - 1;
      }  
      let bytes = await args.device.flowActionWriteAddress( register, args.value, args.type, args.mode);
      let tokens = {
        bytes: bytes
      }
      return tokens;
    });

    this.homey.flow.getActionCard('write_register_coil')
    .registerRunListener(async (args, state) => {
      let register =  args.register;
      if (args.addressing == "1"){
        register = args.register - 1;
      }  
      await args.device.flowActionWriteAddressCoil( register, args.value, args.mode);
    });

  }

}
