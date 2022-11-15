import { RestComponent, DebuggingConfiguration } from './../ConfigTypes';
import { RestUnit, RestDevice, RestResComponent, RestConnection, RestResARMechanism, RestConnectionStripped } from '../ConfigTypes';
import { unique, removeDuplicateUnits } from './util';
import { calcBftSmartPort1, calcBftSmartPort2, getExecutionSites, indxForReplicatedUnit} from './util-resilience';
import { execSync } from 'child_process';
import { exit } from 'process';

export function generateDefaultUnits(devices:RestDevice[], components:RestResComponent[]|undefined, debuggingConfig:DebuggingConfiguration): RestUnit[] {
  let returnUnits:RestUnit[] = devices.filter(device => device.device_name != "ext").flatMap(device => device.units);
  if (components) {
    components.forEach(el =>{
      if("activeReplication" in el.mechanisms) {
        (<RestResARMechanism>el.mechanisms).activeReplication.executionSites.forEach(site => {
          const unit: RestUnit = {
            id: site,
          }

          for (let unitPre of returnUnits) {
            if (unitPre.id == unit.id) {
              returnUnits = returnUnits.filter(obj => obj !== unitPre);
            }
          }
        })
      }
    })
  }
  return returnUnits.filter(unit => {
    for(const unitName in debuggingConfig) {
      if(unitName === unit.id && debuggingConfig[unitName].debuggingAgent.enabled) {
        return false;
      }
    }
    return true;
  });
}

export function generateUnitsConfiguredOnDevices(devices:RestDevice[]): RestUnit[] {
    return devices.filter(device => device.device_name != "ext").flatMap(device => device.units);
}

export function generateUnitsConfiguredOnDevicesInclExt(devices:RestDevice[]): RestUnit[] {
    return generateUnitsConfiguredOnDevices(devices).concat(devices.filter(device => device.device_name === "ext").flatMap(device => device.units)); 
}

export function generateUnitsInclExt(devices:RestDevice[], units:RestUnit[]): RestUnit[] {
    return units.concat(devices.filter(device => device.device_name === "ext").flatMap(device => device.units)); 
}

export function createCommunicationConfiguration(units:RestUnit[]) {
  return {
    // connectionTechs: connectionsFromUnits(unitsConfiguredOnDevicesInclExt)
    connectionTechs: connectionsFromUnits(units)
  }
}

export function generateNonReplicatedUnits(devices:RestDevice[], components:RestResComponent[]|undefined): RestUnit[] {
  let returnUnits:RestUnit[] = devices.filter(device => device.device_name != "ext").flatMap(device => device.units);
  if (components) {
    components.forEach(el =>{
      if("activeReplication" in el.mechanisms) {
        (<RestResARMechanism>el.mechanisms).activeReplication.executionSites.forEach(site => {
          const unit: RestUnit = {
            id: site,
          }

          for (let unitPre of returnUnits) {
            if (unitPre.id == unit.id) {
              returnUnits = returnUnits.filter(obj => obj !== unitPre);
            }
          }
        })
      }
    })
  }
  return returnUnits;
}

export function rmProtoFromConnection(units: Array<RestUnit>):RestConnectionStripped[] {
  return [...new Set<RestConnection>(unique(units.flatMap(unit => unit.components)
    .flatMap(component => { if(!component) {return []}else { 
      return component!.connections} })))]
    .map(conn => {
      return {
        sourceComponent: conn.sourceComponent,
        sourcePort: conn.sourcePort,
        targetComponent: conn.targetComponent,
        targetPort: conn.targetPort,
      }
    });
}

function connectionsFromUnits(units: Array<RestUnit>) {
  var compToUnit = new Map<string, string>();
  units.forEach(unit => {
    unit.components?.forEach(component => compToUnit.set(component.id, unit.id))
  });
  return [...new Set<RestConnection>(unique(units.flatMap(unit => unit.components)
    .flatMap(component => { if(!component) {return []}else { return component!.connections} })))]
    .filter(conn => conn.protocol != "ON_UNIT")
    .map(conn => {
      return {
        sourceContainer: compToUnit.get(conn.sourceComponent),
        sourceComponent: conn.sourceComponent,
        sourcePort: conn.sourcePort,
        targetContainer: compToUnit.get(conn.targetComponent),
        targetComponent: conn.targetComponent,
        targetPort: conn.targetPort,
        commOption: conn.protocol
      }
    });
}

function getAdditionalReplicationConnunits(units:RestUnit[], unitName:string, resilienceCs_:RestResComponent[]|undefined) {
  let returnUnits:RestUnit[] = [];
  const exSites = getExecutionSites(resilienceCs_);
  for(const site in exSites) {
    const unitNames = exSites[site];
    const foundIndx = unitNames.findIndex(name => name === unitName);
    if(foundIndx >= 0) {
      unitNames.splice(foundIndx, 1);
      unitNames.forEach(unitName => {
        units.forEach(unit => {
          if(unit.id === unitName) {
            returnUnits.push(unit);
          }
        })
      })
    }
  }
  return returnUnits;
}

export function getAdditionalDbuggingConnunits(units:RestUnit[], unitName:string, debugConfig:DebuggingConfiguration|undefined) {
  let serverUnits:RestUnit[] = [];
  let agentUnits:RestUnit[] = [];
  if(!debugConfig) {
    return units;
  }
  for(const unitName in debugConfig) {
    const debugConfigElem = debugConfig[unitName];
    if(debugConfigElem.debuggingAgent.enabled && debugConfigElem.debuggingAgent.isServer) {
      if(units.find(el => el.id === unitName)) {
        serverUnits.push(units.find(el => el.id === unitName)!);
      }
    } else if(debugConfigElem.debuggingAgent.enabled && !debugConfigElem.debuggingAgent.isServer) {
      if(units.find(el => el.id === unitName)) {
        agentUnits.push(units.find(el => el.id === unitName)!);
      }
    }
  }
  if(serverUnits.find(unit => unit.id === unitName)) {
    return agentUnits;
  } else if(agentUnits.find(unit => unit.id === unitName)) {
    return serverUnits;
  }
  else return [];
}

export function getRelevantConnUnits(units:RestUnit[], unitName:string, resilienceCs_:RestResComponent[]|undefined, debugConfig:DebuggingConfiguration|undefined) {
  if(!(process.env.OPTIMIZE_LIVE_MIGRATION==="on")) {
    return units;
  }

  const unit = units.find(unit => unit.id === unitName);
  let compsInUnit:RestComponent[] = [];
  unit?.components?.forEach(comp => {
      compsInUnit.push(comp); 
  })
  const relevantTargets:string[]|undefined = unit?.components?.flatMap(comp => comp.connections).filter(conn => {
    for(const comp of compsInUnit) {
      if(comp.id === conn.sourceComponent) {
        return true;
      }
    }
      return false;
  }).map(conn => conn.targetComponent);
  const unitsTmp = units.filter(unit => {
    let found:boolean = false;
    if(unit.id === unitName) {
      found = true;
    }
    unit.components?.forEach(comp => {
      if(relevantTargets && relevantTargets?.findIndex(target => target === comp.id) >= 0) {
        found = true;
      }
    });
    return found;
  })
  unitsTmp.push(...getAdditionalReplicationConnunits(units, unitName, resilienceCs_));
  unitsTmp.push(...getAdditionalDbuggingConnunits(units, unitName, debugConfig));
  return removeDuplicateUnits(unitsTmp);
}

export function generateUnitToDeviceMap(devices:RestDevice[]): Map<string, string> {
    const unitToDevice = new Map<string, string>();
    // only units that have devices a-priori mapped are considered here, replica units w/o devices follow later
    devices.forEach(device => device.units.forEach(unit => {
            unitToDevice.set(unit.id, device.device_name);
        })
    )
    return unitToDevice;
};

export function createUnitName(unit_id:string):string {
    return unit_id.toLowerCase().replace(/_/g, '-');
}

export function createUnitConfMapName(unit_id:string):string {
    return createUnitName(unit_id).concat("-conf-map");
}

export function createSslConfMapName(unit_id:string):string {
    return createUnitName(unit_id).concat("-ssl-map");
}

export function createPersVolumeName(unit_id:string, volNumber:number, devMappedName:string):string {
    return createUnitName(unit_id).concat("-volume-").concat(volNumber.toString()).concat("-").concat(devMappedName);
}

export function createDeplName(unit_id:string):string {
    return createUnitName(unit_id).concat("-deployment");
}

export function createSfsName(unit_id:string, isFinalizing:boolean):string {
    return createUnitName(unit_id).concat("-stateful-set").concat(isFinalizing ? "-finalizing" : "");
}

export function createSvcName(unit_id:string):string {
    return createUnitName(unit_id).concat("-service");
}

export function createPvcTemplName(unit_id:string):string {
    return createUnitName(unit_id).concat('-pvc');
}

export function getSfsPodName(unit_id:string, replicaNum:number):string {
    return createUnitName(unit_id).concat('-stateful-set-').concat(replicaNum.toString());
}

export function getHostCpDir():string {
    return "/tmp"; 
}

export function getCpContainerFolder() {
  return getSorrirAppContainerFolder() + "/checkpoints";
}

export function getSorrirAppContainerFolder() {
  return "/usr/src/sorrir/app";
}

export function copyCpsFromOnePodtoAnother(podName1:string, podName2:string, cpFolder:string, toFolder:string) {
  const cmd:string = "kubectl exec " + podName1 + " -- tar cf - " + cpFolder + " | kubectl exec -i " + podName2 + " -- tar xvf - -C " + toFolder;
  try {
    execSync(cmd);
  } catch(e) {
    console.error("Cannot execute kubectl command: " + cmd + ".\nGot error: " + e);
    exit(12);
  }
}

export function generateUnitsExtended(unitsConfiguredOnDevices:RestUnit[], replicatedUnits:RestUnit[], debuggingConfig:DebuggingConfiguration, components?:RestResComponent[]|undefined):Array<RestUnit & {port1?: number, port2?: number}> { 
  const returnUnits:Array<RestUnit & {port1?: number, port2?: number, port3?: number}> = []; 
  for (let i = 0; i < replicatedUnits.length; i++) {
    let unitExtended:RestUnit & {port1?: number, port2?:number, port3?:number} = replicatedUnits[i];
    unitExtended.port1 = calcBftSmartPort1(replicatedUnits[i].id, indxForReplicatedUnit(replicatedUnits[i].id, components));
    unitExtended.port2 = calcBftSmartPort2(replicatedUnits[i].id, indxForReplicatedUnit(replicatedUnits[i].id, components));
    returnUnits.push(unitExtended);
  }
  for(const unitName in debuggingConfig) {
    if(!unitsConfiguredOnDevices.find(unit => unit.id === unitName) && !replicatedUnits.find(unit => unit.id === unitName)) {
      console.error("Cannot set debuggingConfiguration for unit " + unitName + " as no unit with given name is configured on a device");
      exit(15);
    } else {
      const foundIndx = returnUnits.findIndex(unit => unit.id === unitName);
      if(foundIndx >= 0) {
        returnUnits[foundIndx].port3 = debuggingConfig[unitName].debuggingAgent.webSocketPort;
        continue;
      }
      const unit = unitsConfiguredOnDevices.find(unit => unit.id === unitName);
      if(unit) {
        const port = debuggingConfig[unitName].debuggingAgent.webSocketPort;
        const unitExtended = {
          id: unit.id,
          cpu: unit.cpu,
          ram: unit.ram,
          components: unit.components, 
          shadowModeConfig: unit.shadowModeConfig,
          pinnedNodePort: unit.pinnedNodePort,
          port3: port, 
        } 
        returnUnits.push(unitExtended);
      }
    }
  }
  return returnUnits;
}

export function isDebugServer(unitName:string, debugConfig:DebuggingConfiguration):boolean {
  for(const unitName_ in debugConfig) {
    if((unitName === unitName_) && debugConfig[unitName_].debuggingAgent.isServer) {
      return true;
    }
  }
  return false;
}

function juriWrap(unitsConfiguredOnDevices:RestUnit[]) {
    // For production.json, we need to validate the CommunicationConfiguration:
    unitsConfiguredOnDevices.flatMap(unit => unit.components)
    .flatMap(component => component?.connections)
    .forEach(connectionTech => {
        // TODO: take a closer look on what Juri did with this 
        // failOnFalse(validateComponent(
        //     connectionTech.sourceContainer, connectionTech.sourceComponent, units));
        // failOnFalse(validateComponent(
        //     connectionTech.targetContainer, connectionTech.targetComponent, units));
    });
}
