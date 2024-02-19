"use strict";
const Homey = require('homey');

module.exports = class ModbusDriver extends Homey.Driver {
    onPair(session) {
        this.log("onPair()");

        this.settingsData = { 
            "ip": "",
            "port": "",
            "id": ""
        };

        session.setHandler("settingsChanged", async (data) => {
            return await this.onSettingsChanged(data);
        });

        session.setHandler("getSettings", async () => {
            this.log("getSettings: ");
            this.log(this.settingsData);
            return this.settingsData;
        });

        session.setHandler("list_devices", async () => {
            return await this.onPairListDevices(session);
        });
      
    } // end onPair

    async onPairListDevices(session) {
        this.log("onPairListDevices()" );
        let devices = [];
        if ( !parseFloat(this.settingsData.port) || !parseFloat(this.settingsData.port) ){
            throw new Error ("Port and ID must be numeric");
        }
        devices.push(
            {
                name: this.homey.__("pair.modbus.device_name"),
                data: {
                    id: this.getUIID()
                },
                settings: {
                    "ip": this.settingsData.ip,
                    "port": Number(this.settingsData.port),
                    "id": Number(this.settingsData.id)
                }
            }
        );
        this.log("Found devices:");
        this.log(devices);
        return devices;
    }

    async onSettingsChanged(data){
        this.log("Event settingsChanged: ");
        this.log(data);
        this.settingsData = data;
        return true;
    }

    getUIID() {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
        }
        return `${s4() + s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
    }

}