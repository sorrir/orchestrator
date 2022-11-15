    import * as child_process from "child_process";
    import { RestDeviceStripped } from "./ConfigTypes"; 
    
    export enum conn_protocol {
        REST = 'REST',
        MQTT = 'MQTT',
        MQTT_EXTERNAL = 'MQTT_EXTERNAL',
        BLUETOOTH = 'BLUETOOTH',
        TOM = 'TOM',
    }

    const devicesRaw = JSON.parse(child_process.execSync('./helper_scripts/get_k8s_devices.sh').toString());
    export const devices_imported = { devices: initDevices(devicesRaw) }; 

    function initDevices(devicesRaw):RestDeviceStripped[] {
    let devices:RestDeviceStripped[] = [];
    if(Object.keys(devicesRaw["devices"]).length === 0) {
        return devices;
    }
    for(const dev of devicesRaw["devices"]) {
        const devTransformed:RestDeviceStripped = {
            device_name: <string>dev.name,
            // todo: enum
            architecture: <string>dev.architecture,
            // todo: elems -> enum
            // todo: fix BLE <=> BLUETOOTH missmatch
            protocols: <[string]>dev.protocols.map(prot => conn_protocol[prot == "BLE" ? "BLUETOOTH" : prot]),
            location: "unknown",
        }
        devices.push(devTransformed);
    }
  const devExt:RestDeviceStripped = {
    device_name: "ext",
    architecture: "n/a",
    // TODO: this can be better programmed
    protocols:  <[string]>Object.values(conn_protocol),
    location: "unknown",
  }
  devices.push(devExt);

  return devices;
}