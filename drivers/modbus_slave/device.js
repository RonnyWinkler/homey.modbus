'use strict';

const Homey = require('homey');
const Modbus = require('jsmodbus');	
const REGISTER_HOLDING = 'HOLDING';
const REGISTER_INPUT = 'INPUT';
const REGISTER_COIL = 'COIL';
const REGISTER_DISCRETE = 'DISCRETE';

module.exports = class ModbusSlaveDevice extends Homey.Device {

    async onInit() {
        this.log('Device init: '+this.getName()+' ID: '+this.getData().id);
        this.setWarning(this.homey.__("device.modbus.device_info"));
        this._settings = this.getSettings();

        // wait for master device init
        await this.delay(2000);
        this._client = new Modbus.client.TCP(this.getParent().getSocket(), this._settings.id);
    }

    /**
    * onSettings is called when the user updates the device's settings.
    * @param {object} event the onSettings event data
    * @param {object} event.oldSettings The old settings object
    * @param {object} event.newSettings The new settings object
    * @param {string[]} event.changedKeys An array of keys changed since the previous version
    * @returns {Promise<string|void>} return a custom message that will be displayed
    */
    async onSettings({ newSettings, changedKeys }) {
        if (newSettings && newSettings.id) {
            try {
                this.log("IP address or port changed. Reconnecting...");
                this._settings = newSettings;
                this._client = new Modbus.client.TCP(this.getParent().getSocket(), this._settings.id);

                try{
                    await this.getParent().reconnectDevice();
                }
                catch(error){
                    this.log("Error reconnecting: ", error.message);
                }

            } catch (error) {
                this.log("Error creating new client: ", error.message);
                throw error;
            }
        }
    }

    async onAdded() {
        this.log('device added: ', this.getData().id);
        try{
            await this.getParent().reconnectDevice();
        }
        catch(error){
            this.log("Error reconnecting: ", error.message);
        }
    }

    onDeleted() {
        this.log('device deleted:', this.getData().id);
    }

    onUninit() {
        this.log('Uninit device: ', this.getData().id);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getParent(){
        try{
            if (this._parent == undefined){
                let masters = this.homey.drivers.getDriver('modbus').getDevices();
                for (let i=0; i<masters.length; i++){
                    if (masters[i].getData().id === this.getData().idMaster){
                        this._parent = masters[i]; 
                        return this._parent;
                    }
                }
            }
            else{
                return this._parent;
            }
        }
        catch(error){
            this.log("Error reading parent: ", error.message);
            throw error;
        }
    }

    getClient(){
        return this._client;
    }

    // REGISTER Handling ==============================================================================
    async readAddress(address, size, type, registerType){
        this.log("SLAVE device: Read register: "+address, ' size: '+size+' type: '+type+" registerType: "+registerType);
        return await this.getParent().readAddress(this.getClient(), address, size, type);
    }

    async writeAddress(address, value, type, mode){
        this.log("SLAVE device: Write register: "+address+' value: '+value+" type: "+type+" mode: "+mode);
        return await this._parent.writeAddress(this.getClient(), address, value, type, mode);
    }

        
    // FLOW ACTIONS ==============================================================================
    async flowActionReadAddress(address, size, type){
        return await this.readAddress(address, size, type, REGISTER_HOLDING);
    }

    async flowActionReadAddressInput(address, size, type){
        return await this.readAddress(address, size, type, REGISTER_INPUT);
    }

    async flowActionReadAddressDiscrete(address){
        return await this.readAddress(address, 1, 'BOOL', REGISTER_DISCRETE);
    }

    async flowActionReadAddressCoil(address){
        return await this.readAddress(address, 1, 'BOOL', REGISTER_COIL);
    }

    async flowActionWriteAddress(address, value, type){
        return await this.writeAddress(address, value, type);
    }

}
