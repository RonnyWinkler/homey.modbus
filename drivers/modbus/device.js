'use strict';

const Homey = require('homey');
const net = require('net');
const Modbus = require('jsmodbus');	
const { Z_ASCII } = require('zlib');

const RETRY_INTERVAL = 60 * 1000; 
const REGISTER_HOLDING = 'HOLDING';
const REGISTER_INPUT = 'INPUT';
const REGISTER_COIL = 'COIL';
const REGISTER_DISCRETE = 'DISCRETE';

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
        // await this.disconnectDevice();

        this._client = new Modbus.client.TCP(this._socket, this._modbusOptions.unitId);
        this._socket.setKeepAlive(true);
        this._socket.setMaxListeners(99);
        //socket.setTimeout(15000);
        this._socket.on('end', () => {
            this.log("Socket ended.");
        });
        this._socket.on('connect', () => {
            this.log("Socket connected.");
        });
        this._socket.on('timeout', async () => {
            this.log("Socket timeout.");
            this._socket.end();
            if (this._settings.connection === 'keep') {
                await this.delay(10000);
                this.connectDevice().catch((error) => { this.log("Error reconnecting on socket.on('timeout'): ", error.message); });
            }
        });
        this._socket.on('error', (error) => {
            this.log("Socket error: ", error.message);
        });
        this._socket.on('close', async (error) => {
            this.log("Socket closed.");
            this._socketConnected = false;
            if (this._settings.connection === 'keep') {
                await this.delay(10000);
                this.connectDevice().catch((error) => { this.log("Error reconnecting on socket.on('close'): ", error.message); });
            }
        });
        // this._socket.on('data', () => {
        //     // this.log("Modbus data: "+data);
        // });

        // Connect to device
        // wait for slave device init
        await this.delay(4000);
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
            this.log('Connect device: '+this.getName()+' to IP '+this._modbusOptions.host+' port '+this._modbusOptions.port+' ID '+this._modbusOptions.unitId);

            const errorHandler = (error) => {
                this._socket.removeListener("connect", connectHandler);
                this._socket.removeListener("error", errorHandler);
                this._socket.removeListener("close", errorHandlerClose);
                if (error.code && error.code === 'EISCONN') {
                    this.log("Already connected.");
                    resolve();
                }
                reject(new Error (error.message));
            }

            const errorHandlerClose = (has_error) => {
                this._socket.removeListener("connect", connectHandler);
                this._socket.removeListener("error", errorHandler);
                this._socket.removeListener("close", errorHandlerClose);
                reject(new Error ("Connection closed."));
            }

            const connectHandler = () => {
                this.log('Connected successfully.');
                this._socketConnected = true;
                this._socket.removeListener("error", errorHandler);
                this._socket.removeListener("close", errorHandlerClose);
                resolve();
              }

            if (this._socketConnected == false){
            // if (this._socket.readyState == 'closed'){
                this._socket.once("error", errorHandler);
                this._socket.once("close", errorHandlerClose);
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
            this.log('Disconnect device: '+this.getName());

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
            //   if (this._socket.readyState != 'closed'){
                this._socket.once("error", errorHandler);
                this._socket.end(disconnectHandler);
            }
            else{
                this.log("Not connected.");
                resolve();
            }
        });
    }

    async reconnectDevice(){
        this.log('Device reconnected: '+this.getName());
        try{
            await this.disconnectDevice();
        }
        catch(error){}

        if (this._settings.connection === 'keep' && this._socket) {
            this.log("KeepAlive option set. Reconnecting...");
            await this.connectDevice();
        }
        else{
            this.log("KeepAlive option not set. Don't reconnect.");
        }
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
    async onSettings({ oldSettings, newSettings, changedKeys }) {
        if (newSettings && (newSettings.ip || newSettings.port)) {
            try {
                this.log("IP address or port changed. Reconnecting...");
                this._modbusOptions.host = newSettings.ip;
                this._modbusOptions.port = newSettings.port;
                this._modbusOptions.unitId = newSettings.id;
                this._settings = newSettings;
                this.log("KeepAlive option set. Reconnecting...");

                this._client = new Modbus.client.TCP(this._socket, this._modbusOptions.unitId);
                // Disconnect
                try{
                    await this.disconnectDevice();
                }
                catch(error){
                    this.log("Error disconnecting: ", error.message);
                }
                // Connect if device was not connected before to init connection
                if (newSettings.connection === 'keep') {
                    await this.connectDevice();
                    this.log('Reconnected successfully.');
                }
                else{
                    this.log("KeepAlive option not set. Don't reconnect.");
                }

            } catch (error) {
                this.log('Error reconnecting: ', error.message);
                this.log('Reconnecting with old settings...');
                this._modbusOptions.host = oldSettings.ip;
                this._modbusOptions.port = oldSettings.port;
                this._modbusOptions.unitId = oldSettings.id;
                this._settings = oldSettings;
                // Disconnect
                try{
                    await this.disconnectDevice();
                }
                catch(error){
                    this.log("Error disconnecting: ", error.message);
                }
                // Connect if device was not connected before to init connection
                if (oldSettings.connection === 'keep') {
                    await this.connectDevice();
                    this.log('Reconnected successfully.');
                }
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
    async readAddress(client = this._client, address, size, type='STRING', registerType=REGISTER_HOLDING){
        try{
            if (this._settings.connection === 'single') {
                await this.connectDevice();
            }
            this.log("Read register: "+address, ', size: '+size, ', type: '+type, ', registerType: '+registerType);
            // determine size based on type
            let sizeToRead = 1;
            if (type == 'STRING' || type == 'BYTE'){
                if (size == undefined){
                    sizeToRead = 1;
                }
                else{
                    sizeToRead = size;
                }
            }
            else if (type == 'BOOL'){
                sizeToRead = 1;
            }
            else{
                if (type == 'SCALE' || type.includes('16')){
                    sizeToRead = 1;
                }
                else if (type.includes('32')){
                    sizeToRead = 2;
                }
                else if (type.includes('64')){
                    sizeToRead = 4;
                }
                else{
                    sizeToRead = 1;
                }
            }
            // read register
            let res;
            if (registerType == REGISTER_HOLDING){
                res = await client.readHoldingRegisters(address, sizeToRead);
            }
            else if (registerType == REGISTER_INPUT){
                res = await client.readInputRegisters(address, sizeToRead);
            }
            else if (registerType == REGISTER_COIL){
                res = await client.readCoils(address, sizeToRead);
            }
            else if (registerType == REGISTER_DISCRETE){
                res = await client.readDiscreteInputs(address, sizeToRead);
            }
            else
            {
                throw new Error("Invalid register type: "+registerType);
            }
            // convert output value
            let valueNumeric = 0;
            let valueString = '';
            let valueBoolean = false;
            switch (type) {
                case 'STRING':
                    valueString = res.response.body.valuesAsBuffer.toString();
                    break;
                case 'BYTE':
                    valueString = res.response.body.valuesAsBuffer.toString('hex').toUpperCase();
                    valueString = valueString.replace(/(.{2})/g,"$1 ").trimEnd();
                    break;
                case 'INT16':
                    valueNumeric = res.response.body.valuesAsBuffer.readInt16BE();
                    valueString = valueNumeric.toString();
                    break;
                case 'INT16LE':
                    valueNumeric = res.response.body.valuesAsBuffer.readInt16LE();
                    valueString = valueNumeric.toString();
                    break;
                case 'INT32':
                    valueNumeric = res.response.body.valuesAsBuffer.readInt32BE();
                    valueString = valueNumeric.toString();
                    break;
                case 'INT32LE':
                    valueNumeric = res.response.body.valuesAsBuffer.readInt32LE();
                    valueString = valueNumeric.toString();
                    break;
                case 'INT32LER':
                    valueNumeric = res.response.body.valuesAsBuffer.swap32().swap16().readInt32BE();
                    valueString = valueNumeric.toString();
                    break;
                case 'INT64':
                    valueNumeric = res.response.body.valuesAsBuffer.readBigInt64BE();
                    valueString = valueNumeric.toString();
                    break;
                case 'INT64LE':
                    valueNumeric = res.response.body.valuesAsBuffer.readBigInt64LE();
                    valueString = valueNumeric.toString();
                    break;
                case 'INT64LER':
                    valueNumeric = res.response.body.valuesAsBuffer.swap64().swap16().readInt64BE();
                    valueString = valueNumeric.toString();
                    break;
                case 'UINT16':
                    valueNumeric = res.response.body.valuesAsBuffer.readUInt16BE();
                    valueString = valueNumeric.toString();
                    break;
                case 'UINT16LE':
                    valueNumeric = res.response.body.valuesAsBuffer.readUInt16LE();
                    valueString = valueNumeric.toString();
                    break;
                case 'UINT32LER':
                    valueNumeric = res.response.body.valuesAsBuffer.swap32().swap16().readUInt32BE();
                    valueString = valueNumeric.toString();
                    break;
                case 'UINT32':
                    valueNumeric = res.response.body.valuesAsBuffer.readUInt32BE();
                    valueString = valueNumeric.toString();
                    break;
                case 'UINT32LE':
                    valueNumeric = res.response.body.valuesAsBuffer.readUInt32LE();
                    valueString = valueNumeric.toString();
                    break;
                case 'UINT64':
                    valueNumeric = res.response.body.valuesAsBuffer.readBigUint64BE();
                    valueString = valueNumeric.toString();
                    break;
                case 'UINT64LE':
                    valueNumeric = res.response.body.valuesAsBuffer.readBigUint64LE();
                    valueString = valueNumeric.toString();
                    break;
                case 'UINT64LER':
                    valueNumeric = res.response.body.valuesAsBuffer.swap64().swap16().readUInt64BE();
                    valueString = valueNumeric.toString();
                    break;
                case 'FLOAT32':
                    valueNumeric = res.response.body.valuesAsBuffer.readFloatBE();
                    valueString = valueNumeric.toString();
                    break;
                case 'FLOAT32LE':
                    valueNumeric = res.response.body.valuesAsBuffer.readFloatLE();
                    valueString = valueNumeric.toString();
                    break;
                case 'FLOAT32LER':
                    valueNumeric = res.response.body.valuesAsBuffer.swap32().swap16().readFloatBE();
                    valueString = valueNumeric.toString();
                    break;
                case 'FLOAT64':
                    valueNumeric = res.response.body.valuesAsBuffer.readDoubleBE();
                    valueString = valueNumeric.toString();
                    break;
                case 'FLOAT64LE':
                    valueNumeric = res.response.body.valuesAsBuffer.readDoubleLE();
                    valueString = valueNumeric.toString();
                    break;
                case 'FLOAT64LER':
                    valueNumeric = res.response.body.valuesAsBuffer.swap64().swap16().readDoubleBE();
                    valueString = valueNumeric.toString();
                    break;
                case 'SCALE':
                    valueNumeric = Math.pow(10, res.response.body.valuesAsBuffer.readInt16BE());
                    valueString = valueNumeric.toString();
                    break;
                case 'BOOL':
                    valueBoolean = res.response.body.valuesAsArray[0] != 0;
                    break;
                default:
                    break;
            }

            this.log("Response: String: ", valueString, ", Number: ", valueNumeric, ", Boolean: ", valueBoolean);
            if (this._settings.connection === 'single') {
                await this.disconnectDevice();
            }
            return {valueString, valueNumeric, valueBoolean};
        }
        catch(error){
            if (this._settings.connection === 'single') {
                await this.disconnectDevice();
            }
            let message = '';
            this.log("Error reading register: ", error.message);
            message = error.message;
            if (error.response && error.response.body){
                if (error.response.body.message){
                    this.log("Error details: ", error.response.body.message);
                    message = message + ' [' + error.response.body.message + ']';
                }
                else{
                    this.log("Error details: ", error.response.body);
                    message = message + ' [' + error.response.body + ']';
                }
            }
            throw new Error(message);
        }
    }

    async writeAddress(client = this._client, address, value, type='UINT16', mode='live'){
        this.log("Write register: "+address+' value: '+value+" mode: "+mode);
        try{
            if (this._settings.connection === 'single') {
                await this.connectDevice();
            }
            // await client.writeSingleRegister(address, Number(value))
            let buffer;
            switch (type) {
                case 'INT16':
                    if (value < -32768 || value > 32767){
                        throw new Error("Value out of range for INT16: "+value);
                    }
                    buffer = Buffer.allocUnsafe(2);
                    buffer.writeInt16BE(value);
                    break;
                case 'INT16LE':
                    if (value < -32768 || value > 32767){
                        throw new Error("Value out of range for INT16LE: "+value);
                    }
                    buffer = Buffer.allocUnsafe(2);
                    buffer.writeInt16LE(value);
                    break;
                case 'INT32':
                    if (value < -2147483648 || value > 2147483647){
                        throw new Error("Value out of range for INT32: "+value);
                    }
                    buffer = Buffer.allocUnsafe(4);
                    buffer.writeInt32BE(value);
                    break;
                case 'INT32LE':
                    if (value < -2147483648 || value > 2147483647){
                        throw new Error("Value out of range for INT32LE: "+value);
                    }
                    buffer = Buffer.allocUnsafe(4);
                    buffer.writeInt32LE(value);
                    break;
                case 'INT32LER':
                    if (value < -2147483648 || value > 2147483647){
                        throw new Error("Value out of range for INT32LER: "+value);
                    }
                    buffer = Buffer.allocUnsafe(4);
                    buffer.writeInt32BE(value);
                    buffer.swap32().swap16();
                    break;
                case 'UINT16':
                    if (value < 0 || value > 65535){
                        throw new Error("Value out of range for UINT16: "+value);
                    }
                    buffer = Buffer.allocUnsafe(2);
                    buffer.writeUInt16BE(value);
                    break;
                case 'UINT16LE':
                    if (value < 0 || value > 65535){
                        throw new Error("Value out of range for UINT16LE: "+value);
                    }
                    buffer = Buffer.allocUnsafe(2);
                    buffer.writeUInt16LE(value);
                    break;
                case 'UINT32':
                    if (value < 0 || value > 4294967295){
                        throw new Error("Value out of range for UINT32: "+value);
                    }
                    buffer = Buffer.allocUnsafe(4);
                    buffer.writeUInt32BE(value);
                    break;
                case 'UINT32LE':
                    if (value < 0 || value > 4294967295){
                        throw new Error("Value out of range for UINT32LE: "+value);
                    }
                    buffer = Buffer.allocUnsafe(4);
                    buffer.writeUInt32LE(value);
                    break;
                case 'UINT32LER':
                    if (value < 0 || value > 4294967295){
                        throw new Error("Value out of range for UINT32LER: "+value);
                    }
                    buffer = Buffer.allocUnsafe(4);
                    buffer.writeUInt32BE(value);
                    buffer.swap32().swap16();
                    break;
                case 'FLOAT32':
                    if (value < -3.4028234663852886e+38 || value > 3.4028234663852886e+38){
                        throw new Error("Value out of range for FLOAT32: "+value);
                    }
                    buffer = Buffer.allocUnsafe(4);
                    buffer.writeFloatBE(value);
                    break;
                case 'FLOAT32LE':
                    if (value < -3.4028234663852886e+38 || value > 3.4028234663852886e+38){
                        throw new Error("Value out of range for FLOAT32: "+value);
                    }
                    buffer = Buffer.allocUnsafe(4);
                    buffer.writeFloatLE(value);
                    break;
                case 'FLOAT32LER':
                    if (value < -3.4028234663852886e+38 || value > 3.4028234663852886e+38){
                        throw new Error("Value out of range for FLOAT32: "+value);
                    }
                    buffer = Buffer.allocUnsafe(4);
                    buffer.writeFloatBE(value);
                    buffer.swap32().swap16();
                    break;
                case 'BOOL':
                    if (typeof value !== 'boolean'){
                        throw new Error("Invalid value for BOOL: "+value);
                    }
                    break;
                default:
                    throw new error("Invalid type: "+type);
            }
            
            let bytes = '';
            if (buffer != undefined){
                bytes = buffer.toString('hex').toUpperCase().replace(/(.{2})/g,"$1 ").trimEnd(); 
            }

            this.log("Write register: Bytes: " + bytes);
            if (mode === 'live'){
                this.log("Write register: Live mode");
                if (type === 'BOOL'){
                    await client.writeSingleCoil( address, value);
                }
                else{
                    if ( buffer.byteLength > 2 || this.getSetting('force_write_multi_registers') === true ){
                        await client.writeMultipleRegisters( address, buffer);
                    }
                    else{
                        await client.writeSingleRegister( address, buffer.readUInt16BE());
                    }
                }
                this.log("Write register: Succcess");
            }
            else{
                this.log("Write register: Simulation mode");
            }

            if (this._settings.connection === 'single') {
                await this.disconnectDevice();
            }

            this.log("Write register: Return token: "+bytes);
            return bytes;
        }
        catch(error){
            this.log("Error writing register: ", error.message);
            if (this._settings.connection === 'single') {
                await this.disconnectDevice();
            }
            let message = '';
            if (error instanceof Error && error.message){
                message = error.message;
            }
            else{
                if (typeof error === 'string'){
                    message = error;
                }
                else if (typeof error === 'object'){
                    message = JSON.stringify(error);
                }
            }
            throw new Error(message);
        }
    }

        
    // FLOW ACTIONS ==============================================================================
    async flowActionReadAddress(address, size, type){
        return await this.readAddress(this._client, address, size, type, REGISTER_HOLDING);
    }
    
    async flowActionReadAddressBit(address, bit){
        let {valueNumeric} = await this.readAddress(this._client, address, 1, 'INT16', REGISTER_HOLDING);
        // let bitArray = valueNumeric.toString(2);
        // this.log("Bit array: ", bitArray);
        // let valueBoolean = (bitArray[bitArray.length - bit] === '1');
        let bitInt = Math.pow(2, bit-1);
        let valueBoolean = (valueNumeric & bitInt) == bitInt;
        return { valueBoolean };
    }

    async flowActionReadAddressInput(address, size, type){
        return await this.readAddress(this._client, address, size, type, REGISTER_INPUT);
    }

    async flowActionReadAddressDiscrete(address){
        return await this.readAddress(this._client, address, 1, 'BOOL', REGISTER_DISCRETE);
    }

    async flowActionReadAddressCoil(address){
        return await this.readAddress(this._client, address, 1, 'BOOL', REGISTER_COIL);
    }

    async flowActionWriteAddress(address, value, type, mode){
        return await this.writeAddress(this._client, address, value, type, mode);
    }

    async flowActionWriteAddressBit(address, bit, value, mode){
        let {valueNumeric} = await this.readAddress(this._client, address, 1, 'INT16', REGISTER_HOLDING);
        let bitInt = Math.pow(2, bit-1);
        let valueInt = valueNumeric;
        if (value){
            valueInt = ( valueNumeric | bitInt );    
        }
        else{
            bitInt = ~bitInt;
            valueInt = ( valueNumeric & bitInt );    
        }
        return await this.writeAddress(this._client, address, valueInt, 'INT16', mode);
    }

    async flowActionWriteAddressCoil(address, value, mode){
        return await this.writeAddress(this._client, address, value, 'BOOL', mode);
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
