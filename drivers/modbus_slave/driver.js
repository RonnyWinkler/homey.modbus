"use strict";
const Homey = require('homey');

module.exports = class ModbusSlaveDriver extends Homey.Driver {
    onPair(session) {
        this.log("onPair()");

        this.settingsData = { 
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

        let masters = this.homey.drivers.getDriver('modbus').getDevices();
        for (let i=0; i<masters.length; i++){
            devices.push(
                {
                    name: masters[i].getName()  + '/' + this.settingsData.id,
                    data: {
                        idMaster: masters[i].getData().id,
                        id: this.getUIID()
                    },
                    settings: {
                        "id": Number(this.settingsData.id)
                    }
                }
            );
        }
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