'use strict';

const Homey = require('homey');
const Modbus = require('jsmodbus');	

module.exports = class ModbusSlaveDevice extends Homey.Device {

    async onInit() {
        this.log('Device init: '+this.getName()+' ID: '+this.getData().id);
        this.setWarning(this.homey.__("device.modbus.device_info"));
        this._settings = this.getSettings();
        // this._client = new Modbus.client.TCP(this._parent.getSocket(), this._settings.unitId);
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
        if (newSettings && (newSettings.ip || newSettings.port)) {
            try {
                this.log("IP address or port changed. Reconnecting...");
                this._settings = newSettings;
                this._client = new Modbus.client.TCP(this.getParent().getSocket(), this._settings.id);
            } catch (error) {
            }
        }
    }

    onAdded() {
        this.log('device added: ', this.getData().id);

    }

    onDeleted() {
        this.log('device deleted:', this.getData().id);
    }

    onUninit() {
        this.log('Uninit device: ', this.getData().id);
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
        try{
            if (this._client == undefined){
                this._client = new Modbus.client.TCP(this.getParent().getSocket(), this._settings.id);
                return this._client;
            }
            else{
                return this._client;
            }
        }
        catch(error){
            this.log("Error creating client: ", error.message);
            throw error;
        }
    }

    // REGISTER Handling ==============================================================================
    async readAddress(address, size, type='STRING'){
        return await this.getParent().readAddress(this.getClient(), address, size, type);
    }

    async writeAddress(address, value){
        await this.checkClient();
        await this._parent.writeAddress(client, address, value);
    }

        
    // FLOW ACTIONS ==============================================================================
    async flowActionReadAddress(address, size, type='STRING'){
        return await this.readAddress(address, size, type='STRING');
    }

    async flowActionWriteAddress(address, value){
        await this.writeAddress(address, value);
    }

}
