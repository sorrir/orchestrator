import { RestUnit, ResilienceTypes, ExtTools } from './ConfigTypes';
import { generateDefaultUnits, generateUnitsConfiguredOnDevices, generateUnitsInclExt, generateUnitsConfiguredOnDevicesInclExt, generateUnitsExtended, generateNonReplicatedUnits, generateUnitToDeviceMap } from './util/util-deployment';
import { generateReplicatedUnitsMapped, generateReplicatedUnitsUnMapped, generateReplicatedUnits, generateCpToUnitMap, generateRUnitToTDeviceMap } from './util/util-resilience';
import { init as deployment_init, deploy as deployment_deploy } from './deployment/deployment';
import { init as deployment_ext_tools_init } from './deployment/deployment_ext_tools';
import { deploy as deployment_deploy_ext_tools } from './deployment/deployment_ext_tools';
import { getDefaultsSorrir, getDefaultsHoneypot, getDefaultsIds, getDefaultsDbgFrontend, sortUnitArray } from './util/util';
//todo: check for replica hosts if rest available
import * as fs from 'fs';

import { RestConfig } from './ConfigTypes';
import { initialize as initialize_sec } from './configs/create-sec-configs';
import { initialize as initialize_deg } from './configs/create-degradation-configs';
import { initialize as initialize_default } from './configs/create-default-configs';

const configFile = process.env.GENERATOR_CONFIG ? process.env.GENERATOR_CONFIG : 'configuration.json';
const specString = fs.readFileSync(configFile).toString();
//todo: create a safer solution
const config = <RestConfig>JSON.parse(specString);

const defaults = getDefaultsSorrir();

const devices = config.elements;
const devicesNoExt = config.elements.filter(device => device.device_name != "ext");

function checkResilienceConfigured(type:ResilienceTypes): boolean {
  if(config.resilienceConfiguration.components === undefined || config.resilienceConfiguration.components.length === 0) {
    return false;
  }
  let retVal = false;
  config.resilienceConfiguration.components.forEach(item => {
    if("checkpointRecovery" in item.mechanisms && type === ResilienceTypes.cp) {
      retVal = true;;
    }
    if("activeReplication" in item.mechanisms && type === ResilienceTypes.bft) {
      retVal = true;
    }
  });
  return retVal;
}

function checkHPsConfigured(): boolean {
  if(config.extToolsConfiguration === undefined) {
    return false;
  }
  let retVal = false;
  if(config.extToolsConfiguration.honeyPots !== undefined && config.extToolsConfiguration.honeyPots.length > 0) {
    retVal = true;
  }
  return retVal;
}

function checkIdsConfigured() {
  if(config.extToolsConfiguration === undefined) {
    return false;
  }
  if(config.extToolsConfiguration.useIds) {
    return true;
  }
  return false;
}

function checkDebugFrontendConfigured(): boolean {
  if(config.extToolsConfiguration === undefined) {
    return false;
  }
  let retVal = false;
  if(config.extToolsConfiguration.debugFrontendInfos !== undefined && config.extToolsConfiguration.debugFrontendInfos.portToOpenHost &&
    config.extToolsConfiguration.debugFrontendInfos.portToOpenContainer && config.extToolsConfiguration.debugFrontendInfos.portToOpenHost) {
    retVal = true;
  }
  return retVal;
}

const usesCp:boolean = checkResilienceConfigured(ResilienceTypes.cp); 
const usesBft:boolean = checkResilienceConfigured(ResilienceTypes.bft); 
const usesSec:boolean = (config.securityConfiguration.ssl && config.securityConfiguration.ssl.toString() === "true") ? true : false;
const usesDeg:boolean = (config. degradationConfiguration.degradation && config.degradationConfiguration.degradationFileName) ? true : false;
// todo: use config from configurator
const useHp:boolean = checkHPsConfigured();
const defaultsHp = useHp ? getDefaultsHoneypot() : undefined;
const useDbgFrontend:boolean = checkDebugFrontendConfigured();
const defaultsDbgFrontend = useDbgFrontend ? getDefaultsDbgFrontend() : undefined;
const usesDebug:boolean = (config.debuggingConfiguration && Object.keys(config.debuggingConfiguration).length > 0) ? true : false;
const useIds:boolean = checkIdsConfigured();
const defaultsIds = useIds ? getDefaultsIds() : undefined;

const defaultUnits:RestUnit[] = sortUnitArray(generateDefaultUnits(devicesNoExt, config.resilienceConfiguration.components, config.debuggingConfiguration)); 
const nonReplicatedUnits:RestUnit[] = sortUnitArray(generateNonReplicatedUnits(devicesNoExt, config.resilienceConfiguration.components)); 
const replicatedUnitsMapped = sortUnitArray(generateReplicatedUnitsMapped(devicesNoExt,nonReplicatedUnits)); 
const replicatedUnitsUnMapped = sortUnitArray(generateReplicatedUnitsUnMapped(devicesNoExt,nonReplicatedUnits, config.resilienceConfiguration.components));

const unitsConfiguredOnDevices = sortUnitArray(generateUnitsConfiguredOnDevices(devicesNoExt)); 
const replicatedUnits = sortUnitArray(generateReplicatedUnits(devicesNoExt, nonReplicatedUnits, config.resilienceConfiguration.components));
const unitsConfiguredOnDevicesInclExt = sortUnitArray(generateUnitsConfiguredOnDevicesInclExt(devices));  
//this is without ext -> TODO: rename
const allUnits = sortUnitArray(usesBft ? nonReplicatedUnits.concat(replicatedUnits) : unitsConfiguredOnDevices);
const allUnitsInclExt = sortUnitArray(generateUnitsInclExt(devices, allUnits));
const replicaUnitToDevice = generateRUnitToTDeviceMap(devicesNoExt, replicatedUnitsMapped, replicatedUnitsUnMapped); 

const unitToDevice = generateUnitToDeviceMap(devicesNoExt);
const cpToUnit = generateCpToUnitMap(devicesNoExt, config.resilienceConfiguration.components);
replicaUnitToDevice.forEach((value: string, key: string) => {
  unitToDevice.set(key,value);
});

const useRes = usesCp || usesBft;
initialize_default(allUnits, allUnitsInclExt, unitsConfiguredOnDevices, unitsConfiguredOnDevicesInclExt, unitToDevice, useRes? config.resilienceLibrary.directoryPath : undefined, useRes ? config.resilienceConfiguration.components : undefined, usesDebug ? config.debuggingConfiguration : undefined);
initialize_sec(usesSec ? config.securityConfiguration: undefined);
initialize_deg(usesDeg ? config.degradationConfiguration: undefined);
deployment_ext_tools_init(useHp, useDbgFrontend, useIds, config.extToolsConfiguration, defaultsHp, defaultsDbgFrontend, defaultsIds);
// needed here, because hostConfiguration must have been created to make replicatedUnitsExtended defined 
const unitsExtended = generateUnitsExtended(unitsConfiguredOnDevices, replicatedUnits, config.debuggingConfiguration, config.resilienceConfiguration.components);
deployment_init(usesCp, usesBft, usesSec, usesDeg, defaultUnits, unitsExtended, unitToDevice, cpToUnit, defaults, usesSec ? config.securityConfiguration: undefined, config.debuggingConfiguration, config.degradationConfiguration, config.migrationStatus);

deployment_deploy();
deployment_deploy_ext_tools(); 