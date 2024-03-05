'use strict';

const Homey = require('homey');
const net = require('net');
const Modbus = require('jsmodbus');	

const RETRY_INTERVAL = 60 * 1000; 


module.exports = class ModbusDevice extends Homey.Device {
	_modbusOptions = {
        host: this.getSetting('ip'),
        port: this.getSetting('port'),
        unitId: this.getSetting('id'),
        timeout: 5,
        autoReconnect: true,
        logLabel: 'Modbus',
        logLevel: 'error',
        logEnabled: true,
        };

    async onInit() {
        this.log('Device init: '+this.getName()+' ID: '+this.getData().id);

        this.setWarning(this.homey.__("device.modbus.device_info"));

        this._settings = this.getSettings();

        this._socketConnected = false;
        this._socket = new net.Socket();
        this._client = new Modbus.client.TCP(this._socket, this._modbusOptions.unitId);
        this._socket.setKeepAlive(true);
        this._socket.setMaxListeners(99);
        //socket.setTimeout(15000);
        this._socket.on('end', () => {});
        this._socket.on('connect', () => {
            this.log("Socket connected.");
        });
        this._socket.on('timeout', () => {
            this._socket.end();
            if (this._settings.connection === 'keep') {
                this._socket.connect(this._modbusOptions);
            }
        });
        this._socket.on('error', (error) => {
            this.log("Error connecting to socket: ", error.message);
        });
        this._socket.on('close', (error) => {
            this._socket.end();
            if (this._settings.connection === 'keep') {
                this._socket.connect(this._modbusOptions);
            }
        });
        this._socket.on('data', () => {
            // this.log("Modbus data: "+data);
        });

        // Connect to device
        if (this._settings.connection === 'keep' && this._socket) {
            this.log("KeepAlive option set. Reconnecting...");
            await this.connectDevice();
        }
        else{
            this.log("KeepAlive option not set. Don't reconnect.");
        }
    }

    async connectDevice(){
        if (!this._socket) {
            return;
        }
        return new Promise((resolve, reject) => {
            this.log('Device connect: '+this.getName()+' to IP '+this._modbusOptions.host+' port '+this._modbusOptions.port);
            this._client = new Modbus.client.TCP(this._socket, this._modbusOptions.unitId);

            const errorHandler = (error) => {
                this._socket.removeListener("connect", connectHandler);
                reject(error);
            }

            const connectHandler = () => {
                this.log('Connected successfully.');
                this._socketConnected = true;
                this._socket.removeListener("error", errorHandler)
                resolve();
              }

            if (this._socketConnected == false){
                this._socket.once("error", errorHandler);
                this._socket.connect(this._modbusOptions,connectHandler);
            }
            else{
                this.log("Already connected.");
                resolve();
            }
        });
    }

    async disconnectDevice(){
        if (!this._socket){
            return;
        }
        return new Promise((resolve, reject) => {
            this.log('Device disconnected: '+this.getName());

            const errorHandler = (error) => {
                this._socket.removeListener("close", disconnectHandler);
                reject(error);
            }

            const disconnectHandler = () => {
                this.log('Disconnected successfully.');
                this._socketConnected = false;
                this._socket.removeListener("error", errorHandler)
                resolve();
            }

            if (this._socketConnected == true){
                this._socket.once("error", errorHandler);
                this._socket.end(disconnectHandler);
            }
            else{
                this.log("Not connected.");
                resolve();
            }
        });
    }

    getSocket(){
        return this._socket;
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
                this._modbusOptions.host = newSettings.ip;
                this._modbusOptions.port = newSettings.port;
                this._modbusOptions.unitId = newSettings.id;
                this._settings = newSettings;
                if (newSettings.connection === 'keep') {
                    this.log("KeepAlive option set. Reconnecting...");
                    try{
                        await this.disconnectDevice();
                    }
                    catch(error){
                        this.log("Error disconnecting: ", error.message);
                    }
                    this._client = new Modbus.client.TCP(this._socket, this._modbusOptions.unitId);
                    await this.connectDevice();
                    this.log('Reconnected successfully.');
                }
                else{
                    this.log("KeepAlive option not set. Don't reconnect.");
                }
            } catch (error) {
                this.log('Error reconnecting: ', error.message);
                throw error;
            }
        }
    }

    onAdded() {
        this.log('device added: ', this.getData().id);

    }

    onDeleted() {
        this.log('device deleted:', this.getData().id);
        this._socket.end();
    }

    onUninit() {
        this.log('Uninit device: ', this.getData().id);
        this.disconnectDevice();
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    


    // REGISTER Handling ==============================================================================
    async readAddress(client = this._client, address, size, type='STRING'){
        try{
            if (this._settings.connection === 'single') {
                await this.connectDevice();
            }
            this.log("Read register: "+address);
            let res = await client.readHoldingRegisters(address, size);
            let valueNumeric = 0;
            let valueString;
            switch (type) {
                case 'STRING':
                    valueString = res.response.body.valuesAsBuffer.toString();
                    break;
                case 'INT16':
                    valueNumeric = res.response.body.valuesAsBuffer.readInt16BE();
                    valueString = valueNumeric.toString();
                    break;
                case 'INT32':
                    valueNumeric = res.response.body.valuesAsBuffer.readInt32BE();
                    valueString = valueNumeric.toString();
                    break;
                case 'INT64':
                    valueNumeric = res.response.body.valuesAsBuffer.readBigInt64BE();
                    valueString = valueNumeric.toString();
                    break;
                case 'UINT16':
                    valueNumeric = res.response.body.valuesAsBuffer.readUInt16BE();
                    valueString = valueNumeric.toString();
                    break;
                case 'UINT32':
                    valueNumeric = res.response.body.valuesAsBuffer.readUInt32BE();
                    valueString = valueNumeric.toString();
                    break;
                case 'UINT64':
                    valueNumeric = res.response.body.valuesAsBuffer.readBigUint64BE();
                    valueString = valueNumeric.toString();
                    break;
                case 'FLOAT':
                    valueNumeric = res.response.body.valuesAsBuffer.readFloatBE();
                    valueString = valueNumeric.toString();
                    break;
                case 'FLOAT32':
                    valueNumeric = res.response.body.valuesAsBuffer.swap16().swap32().readFloatBE();
                    valueString = valueNumeric.toString();
                    break;
                case 'FLOAT64':
                    valueNumeric = res.response.body.valuesAsBuffer.swap16().swap32().swap64().readFloatBE();
                    valueString = valueNumeric.toString();
                    break;
                case 'SCALE':
                    valueNumeric = Math.pow(10, res.response.body.valuesAsBuffer.readInt16BE());
                    valueString = valueNumeric.toString();
                    break;
                default:
                    break;
            }

            this.log("Response: String: ", valueString, ", Number: ", valueNumeric);
            if (this._settings.connection === 'single') {
                await this.disconnectDevice();
            }
            return {valueString, valueNumeric};
        }
        catch(error){
            if (this._settings.connection === 'single') {
                await this.disconnectDevice();
            }
            let message = '';
            this.log("Error reading register: ", error.message);
            message = error.message;
            if (error.response && error.response.body){
                this.log("Error details: ", error.response.body);
                message = message + ' [' + error.response.body + ']';
            }
            throw new Error(message);
        }
    }

    async writeAddress(client = this._client, address, value){
        this.log("Write register: "+address+' value: '+value);
        try{
            if (this._settings.connection === 'single') {
                await this.connectDevice();
            }
            await client.writeSingleRegister(address, value)
            this.log("Write register: Succcess");
            if (this._settings.connection === 'single') {
                await this.disconnectDevice();
            }
        }
        catch(error){
            if (this._settings.connection === 'single') {
                await this.disconnectDevice();
            }
            this.log("Error writing register: ", error.message);
            throw error;
        }
    }

        
    // FLOW ACTIONS ==============================================================================
    async flowActionReadAddress(address, size, type='STRING'){
        return await this.readAddress(this._client, address, size, type='STRING');
    }

    async flowActionWriteAddress(address, value){
        await this.writeAddress(this._client, address, value);
    }

    async flowActionConnectDevice(){
        this.log("Connect device...");
        await this.connectDevice();
    }

    async flowActionDisconnectDevice(){
        this.log("Disconnect device...");
        await this.disconnectDevice();
    }

}
