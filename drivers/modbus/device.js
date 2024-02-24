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
    _socket = new net.Socket();
    _client = new Modbus.client.TCP(this._socket, this._modbusOptions.unitId);

    async onInit() {
        this.log('Device init: '+this.getName()+' ID: '+this.getData().id);

        this.setWarning(this.homey.__("device.modbus.device_info"));

        this._socket.setKeepAlive(true);
        //socket.setTimeout(15000);
        this._socket.on('end', () => {});
        this._socket.on('timeout', () => {
            this._socket.end();
            this._socket.connect(this._modbusOptions);
        });
        this._socket.on('error', (error) => {});
        this._socket.on('close', (error) => {
            this._socket.end();
            this._socket.connect(this._modbusOptions);
        });
        this._socket.on('data', () => {
            // this.log("Modbus data: "+data);
        //   this.setCapabilityValue('lastPollTime', new Date().toLocaleString('no-nb', {timeZone: 'CET', hour12: false}));
        });

        // Connect to device
        try{
            this.log('Device connect: '+this.getName()+' to IP '+this._modbusOptions.ip+' port '+this._modbusOptions.port);
            this._socket.connect(this._modbusOptions);
            this.log('Connected successfully.');
        }
        catch(error){
            this.log("Error connecting to socket: ", error.message);
        }
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
                this.log('IP address or port changed. Reconnecting...');
                this._modbusOptions.host = newSettings.ip;
                this._modbusOptions.port = newSettings.port;
                this._modbusOptions.unitId = newSettings.id;
                this._socket.end();
                await this.delay(1000); // Add a delay to ensure the socket is closed before reconnecting
                this._client = new Modbus.client.TCP(this._socket, this._modbusOptions.unitId);
                this._socket.connect(this._modbusOptions);
                // Additional logic if needed after reconnecting
                this.log('Reconnected successfully.');
            } catch (error) {
                // Explicitly type error as an Error
                this.log('Error reconnecting: ', error.message);
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

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // FLOW ACTIONS ==============================================================================
    async flowActionReadRegister(register, size, type='STRING'){
        this.log("Read register: "+register);
        try{
            let res = await this._client.readHoldingRegisters(register, size);
            let resultValue = '';
            switch (type) {
                case 'UINT16':
                    resultValue = res.response.body.valuesAsBuffer.readInt16BE().toString();
                    break;
                case 'UINT32':
                    resultValue = res.response.body.valuesAsArray[0].toString();
                    // console.log( response.body);
                    break;
                case 'ACC32':
                    resultValue = res.response.body.valuesAsBuffer.readUInt32BE().toString();
                    break;
                case 'FLOAT':
                    resultValue = res.response.body.valuesAsBuffer.readFloatBE().toString();
                    break;
                case 'STRING':
                    resultValue = res.response.body.valuesAsBuffer.toString();
                    break;
                case 'INT16':
                    resultValue = res.response.body.valuesAsBuffer.readInt16BE().toString();
                    break;
                case 'SCALE':
                    resultValue = res.response.body.valuesAsBuffer.readInt16BE().toString();
                    break;
                case 'FLOAT32':
                    resultValue = res.response.body.valuesAsBuffer.swap16().swap32().readFloatBE().toString();
                    break;
                default:
                    break;
            }

            this.log("Response: ", resultValue);
            return resultValue;
        }
        catch(error){
            this.log("Error reading register: ", error.message);
            if (error.response && error.response.body){
                this.log("Error details: ", error.response.body);
            }
        }
    }

    async flowActionWriteRegister(register, value){
        this.log("Write register: "+register+' value: '+value);
        try{
            this._client.writeSingleRegister(register, value)
            this.log("Write register: Succcess");
        }
        catch(error){
            this.log("Error writing register: ", error.message);
        }
    }

}