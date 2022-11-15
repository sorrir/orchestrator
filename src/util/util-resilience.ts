import { RestDeviceStripped } from '../ConfigTypes';
import { RestComponent, RestDevice, RestUnit, RestResARMechanism, RestResComponent } from '../ConfigTypes';
import { exit } from 'process';
import { devices_imported } from '../load_devices';
//todo: solve this more elegant
import { getHostConfiguration } from '../configs/create-default-configs';

export function generateReplicatedUnitsMapped(devices:RestDevice[], nonReplicatedUnits:RestUnit[]) { 
    return devices.flatMap(device => device.units).filter(item => nonReplicatedUnits.indexOf(item) < 0);
}

export function generateReplicatedUnitsUnMapped(devices:RestDevice[], nonReplicatedUnits:RestUnit[], components?:RestResComponent[]|undefined): RestUnit[] {
const resilienceConfigUnits:RestUnit[] = [];
  if (components) {
    components.forEach(el =>{
      if("activeReplication" in el.mechanisms) {
        (<RestResARMechanism>el.mechanisms).activeReplication.executionSites.forEach(site => {
          const unit: RestUnit = {
            id: site,
          }
          resilienceConfigUnits.push(unit);
        })
      }
    })
  }
  return resilienceConfigUnits.filter(item => !(Array.from(generateReplicatedUnitsMapped(devices,nonReplicatedUnits), unit => unit.id ).includes(item.id)));
}

export function generateReplicatedUnits(devices:RestDevice[], nonReplicatedUnits:RestUnit[], components?:RestResComponent[]|undefined): RestUnit[] {
    return generateReplicatedUnitsMapped(devices,nonReplicatedUnits).concat(generateReplicatedUnitsUnMapped(devices, nonReplicatedUnits, components));
}

export function getExecutionSites(resComponents?:RestResComponent[]):Record<string, Array<string>> {
  let returnRecord:Record<string, Array<string>> = {};
  if(resComponents) {
    resComponents.forEach(comp => {
      if("activeReplication" in comp.mechanisms) {
        (<RestResARMechanism>comp.mechanisms).activeReplication.executionSites.forEach(site => {
          if(!returnRecord[comp.id]) {
            returnRecord[comp.id] = [];
          }
          returnRecord[comp.id].push(site);
        })
      }
    })
  }
  return returnRecord;
}

export function generateCpToUnitMap(devices:RestDevice[], resComponents:RestResComponent[]|undefined): Map<string, string | undefined> {
  const cpToUnit = new Map<string, string | undefined>();

  devices.forEach(device => device.units.forEach(unit => {
      unit.components?.forEach(component =>  resComponents?.forEach(resComponent => { if(resComponent.id === component.id) {fillCpToUnitMap(cpToUnit, unit, resComponent) }}))
  }));

  return cpToUnit;
}

function fillCpToUnitMap(cpToUnit:Map<string, string | undefined>, unit:RestUnit, component:RestResComponent) {
  if("checkpointRecovery" in component.mechanisms) {
    cpToUnit.set(unit.id,"tmp");
  }
}

export function indxForReplicatedUnit(unit_id:string, components?:RestResComponent[]|undefined): number {
  if(!components) {
    console.error("No Resilience components specified, so no index for component can be calculated: " + unit_id)
    exit(4);
  }

  let indx:number = -1;
  let found:boolean = false;
  for (let i = 0; i < components!.length; i++) {
    const el = components![i];
    if("activeReplication" in el.mechanisms) {
      found = (<RestResARMechanism>el.mechanisms).activeReplication.executionSites.findIndex(site => {
          return site === unit_id;
      }) >= 0;
      indx = i;
    }
  }
  if(found) {
    return indx;
  } else {
    console.error("Cannot find component index for unit: " + unit_id)
    exit(4);
  }
}

export function calcBftSmartPort1(unit_id: string, indx: number): number {
  const bftSMaRt = 1000;
  const compSpecific = 100;
  const usePort =
    //todo: solve this more elegant, i.e. type-safe
    getHostConfiguration().get(unit_id)[unit_id].port +
    bftSMaRt +
    compSpecific * indx;

  return usePort;
}

export function calcBftSmartPort2(unit_id: string, indx: number): number {
  return calcBftSmartPort1(unit_id, indx) + 1;
}

function fillRUnitToTDeviceMap(usedDevices:RestDevice[], replicatedUnitsMapped:RestUnit[], replicatedUnitsUnMapped:RestUnit[],func: (units:RestUnit[], devices:RestDeviceStripped[])  => Map<string,string>) : Map<string,string> {
  if(replicatedUnitsUnMapped.length === 0) {
    return new Map();
  }

  let devicesImportedReduced:RestDeviceStripped[] = devices_imported.devices.filter(device => device.device_name != "ext");
  const allMappedDeviceNames:string[] = Array.from(usedDevices.filter(device => {
    let found:boolean = false;
    device.units.flatMap(unit => {
    replicatedUnitsMapped.forEach(replUnit => {
        if(replUnit.id === unit.id) {
          found = true;
        }
      })
    })
    return found;
  }), device => device.device_name);
  devicesImportedReduced = devicesImportedReduced.filter((device) => {
    let notFound:boolean = true;
    allMappedDeviceNames.forEach(devMapped => {
      if (devMapped === device.device_name) {
        notFound = false;
      }
    })
    return notFound;
  })  

  const returnMap:Map<string,string> = func(replicatedUnitsUnMapped, devicesImportedReduced); 
  let unitExists:boolean = false;
  let deviceExists:boolean = false;
  let noDuplicateDevices:boolean = false;
  returnMap.forEach((value: string, key: string) => {
    unitExists = Array.from(replicatedUnitsUnMapped , unit => unit.id).includes(key);
    const deviceNames:string[] = Array.from(devices_imported .devices.filter(device => device.device_name != "ext"), device => device.device_name);
    deviceExists = deviceNames.includes(value);
    noDuplicateDevices = new Set(deviceNames).size === deviceNames.length
  })
  if(!unitExists || !deviceExists || !noDuplicateDevices) {
    console.error("Cannot generate distinct devices for replicated units");
    exit(3);
  }
  return returnMap;
}

export function generateRUnitToTDeviceMap(usedDevices:RestDevice[], replicatedUnitsMapped:RestUnit[], replicatedUnitsUnMapped:RestUnit[]): Map<string,string> {
  return fillRUnitToTDeviceMap(usedDevices, replicatedUnitsMapped, replicatedUnitsUnMapped, randomDeskAndPi4Only); 
}

function randomNoArmv7Map(units:RestUnit[], devices:RestDeviceStripped[]) : Map<string,string> {
  let unitNames = Array.from(units, unit => unit.id);
  let deviceNames = Array.from(devices.filter(device => device.architecture !== "arm"), device => device.device_name);
  if(deviceNames.length < unitNames.length) {
    console.error('not enough feasible devices for replica unit mapping');
    process.exit(2);
  }
  let shuffledUnitNames = unitNames
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value)
  let shuffledDeviceNames = deviceNames
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value)
  const returnMap = new Map<string,string>()
  for(let i = 0; i < shuffledUnitNames.length; i++){
      returnMap.set(shuffledUnitNames[i], shuffledDeviceNames[i]);
   };
   return returnMap;
}

function randomDeskAndPi4Only(units:RestUnit[], devices:RestDeviceStripped[]) : Map<string,string> {
  const regexDesk = new RegExp('desktop-*');
  const regexPi4 = new RegExp('pi4-0[1-2]');
  let unitNames = Array.from(units, unit => unit.id);
  let deviceNames_tmp1 = Array.from(devices.filter(device => regexDesk.test(device.device_name)), device => device.device_name);
  let deviceNames_tmp2 = Array.from(devices.filter(device => regexPi4.test(device.device_name)), device => device.device_name);
  let deviceNames = deviceNames_tmp1.concat(deviceNames_tmp2); 
  if(deviceNames.length < unitNames.length) {
    console.error('not enough feasible devices for replica unit mapping');
    process.exit(2);
  }
  let shuffledUnitNames = unitNames
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value)
  let shuffledDeviceNames = deviceNames
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value)
  const returnMap = new Map<string,string>()
  for(let i = 0; i < shuffledUnitNames.length; i++){
      returnMap.set(shuffledUnitNames[i], shuffledDeviceNames[i]);
  };
  return returnMap;
}