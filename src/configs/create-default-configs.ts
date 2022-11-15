import { RestConnection, DebuggingConfiguration } from './../ConfigTypes';
import { RestUnit, ShadowModeConfig, RestResComponent, SetupJsonSchema } from '../ConfigTypes';
import { groupBy, generatePortNmbr, getPortNmbr, hasDuplicates, uniqueStripped } from '../util/util';
import { rmProtoFromConnection, createCommunicationConfiguration, createSvcName, getRelevantConnUnits, createUnitName } from '../util/util-deployment';
import { all } from '@pulumi/pulumi';

export let production_json:Map<string,any>;
export let setup_json;
export let units_json;
let hostConfiguration:Map<string,any>;
let allUnits:RestUnit[];
let allUnitsInclExt:RestUnit[];
let unitsConfiguredOnDevices:RestUnit[];
let unitsConfiguredOnDevicesInclExt:RestUnit[];
let unitToDevice:Map<string,string>;
let directoryPath:string|undefined;
let resilienceComponents:RestResComponent[]|undefined;
let debuggingConfig:DebuggingConfiguration|undefined;

export function initialize(allUs:RestUnit[], allUsInclExt:RestUnit[], unitsConfiguredOnDs:RestUnit[], unitsConfiguredOnDsInclExt:RestUnit[], unitToD:Map<string,string>, directoryP:string|undefined, resilienceCs:RestResComponent[]|undefined, debuggingConfig_:DebuggingConfiguration|undefined) {
  allUnits = allUs;
  allUnitsInclExt = allUsInclExt;
  unitsConfiguredOnDevices = unitsConfiguredOnDs;
  unitsConfiguredOnDevicesInclExt = unitsConfiguredOnDsInclExt;
  unitToDevice = unitToD;
  directoryPath = directoryP; 
  resilienceComponents = resilienceCs;
  generatePortNumbers();
  hostConfiguration = createHostConfiguration();
  debuggingConfig = debuggingConfig_;

  production_json = createProductionJson(hostConfiguration);
  setup_json = createSetupJson();
  units_json = {
    units: allUnitsInclExt.map(u => u.id)
  };

  // validate that there are not duplicate names
  // and that no unit is named "ext"
  if (hasDuplicates(units_json.units)) {
    console.error('Duplicate unit names');
    process.exit(1);
  } else if (units_json.units.includes('ext')) {
    console.error('Units must not be named "ext"');
    process.exit(1);
  }
}

function generatePortNumbers() {
  for(const unit of allUnits) {
    generatePortNmbr(createSvcName(unit.id), 1200);
  }
}

export function getHostConfiguration() {
  return hostConfiguration;
}

function createSetupJson(): SetupJsonSchema {
  return {
    componentInstances: (() => {
      // also set setup for ext components
      let compsWithStartState = unitsConfiguredOnDevicesInclExt.filter(u => u.components != undefined).flatMap(u => u.components).map(c => c?.startState ? { ...c } : c?.startStateGenerator ? { ...c } : { ...c, startState: c?.type + 'StartState' });
      let map = Object.fromEntries(groupBy(compsWithStartState, x => x.type))
      Object.keys(map).forEach(k => {
        let objArr = map[k];
        objArr.forEach(obj => {
          obj.name = obj.id;
          delete obj.id;
          delete obj.connections;
          delete obj.ports;
          delete obj.type;
        });
      });
      return map;
    })(),
    connections: uniqueStripped(rmProtoFromConnection(unitsConfiguredOnDevicesInclExt))
  }
};

function createHostConfiguration() {
  let returnMap:Map<string,any> = new Map<string,any>();
  for(const unit of allUnitsInclExt) {
    const relevantConnUnits:RestUnit[] = getRelevantConnUnits(allUnitsInclExt, unit.id, resilienceComponents, debuggingConfig);
    const hostConfPerUnit = relevantConnUnits.reduce(
      (acc, cv) => {
        const hname = createSvcName(cv.id);
        // TODO: increase this range?
        const hport = getPortNmbr(hname); // TODO figure out real port
        acc[cv.id] = { host: hname, port: hport };
        return acc;
      },
      {});
      returnMap.set(unit.id,hostConfPerUnit);
  }
  return returnMap;
}

function createDefaultMQTTConfiguration() {
  return {
    host: 'test.mosquitto.org'
  }
}

function createBLEConfiguration(unitName:string) {
  const relevantConnUnits:RestUnit[] = getRelevantConnUnits(unitsConfiguredOnDevices, unitName, resilienceComponents, debuggingConfig);
  return relevantConnUnits.reduce(
    (acc, cv) => {
      acc[cv.id] = {
        sendHost: <string>unitToDevice.get(cv.id) ?? "ext",
        sendPort: 8080,
        listenHost: createUnitName(cv.id),
        listenPort: 8081
      };
      return acc;
    }, {}
  )
}

function createShadowModeConfiguration(unitName:string) {
  const relevantConnUnits:RestUnit[] = getRelevantConnUnits(allUnits, unitName, resilienceComponents, debuggingConfig);
  return relevantConnUnits.reduce(
    (obj, unit) => {
      if (unit.shadowModeConfig === undefined) {
        return obj;
      }
      const config: ShadowModeConfig = {};
      const { shadowAgent, inMessageSharing } = unit.shadowModeConfig
      if (shadowAgent !== undefined) {
        // wrap in function to avoid duplicate variable names in the same scope
        (() => {
          const { enabled, commOptions, autoUpdate } = shadowAgent;
          // todo: type checks
          config.shadowAgent = {
            enabled: enabled,
            commOptions: commOptions,
          }
          if (autoUpdate !== undefined) {
            const { intervalSeconds, strategy, limit, content } = autoUpdate;
            // todo: type checks
            config.shadowAgent.autoUpdate = {
              intervalSeconds: intervalSeconds,
              strategy: strategy,
              limit: limit,
              content: content
            }
          }
        })();
      } 
      if (inMessageSharing !== undefined) {
        // wrap in function to avoid duplicate variable names in the same scope
        (() => {
          const { enabled, content, limit } = inMessageSharing;
          // todo: type checks
          config.inMessageSharing = {
            enabled: enabled,
            content: content,
            limit: limit
          }
        })();
      }
      obj[unit.id] = config;
      return obj;
    },
    {}
  )
}

function createDeploymentConfig(units:RestUnit[], unitName:string) {
  const relevantConnUnits:RestUnit[] = getRelevantConnUnits(units, unitName, resilienceComponents, debuggingConfig);
  const returnStruct = relevantConnUnits.reduce(
    (acc, cv) => {
      acc[cv.id] = { components: cv.components?.map(component => component.id), resilienceLibrary: {directoryPath: directoryPath} };
      return acc;
    },
    {});

  return returnStruct;
}

function createProductionJson(hostConfiguration_) {
  let returnMap:Map<string,any> = new Map();
  hostConfiguration_.forEach((value,key) => {
    returnMap.set(key, {
      HostConfiguration: value 
      ,
      DeploymentConfiguration: createDeploymentConfig(allUnitsInclExt,key)
      ,
      CommunicationConfiguration: createCommunicationConfiguration(unitsConfiguredOnDevicesInclExt)
      ,
      MQTTConfiguration: createDefaultMQTTConfiguration()
      ,
      BLEConfiguration: createBLEConfiguration(key)
      ,
      ResilienceConfiguration: {
        ...(resilienceComponents && { 
        components: resilienceComponents.map(item => {
          let returnItem:any = JSON.parse(JSON.stringify(item));
          if("checkpointRecovery" in item.mechanisms) {
            // do not use hostDir in production.json
            returnItem.mechanisms.checkpointRecovery
          }
          return returnItem;
          }),
        })
      }
      ,
      ShadowModeConfiguration: createShadowModeConfiguration(key),
      DebuggingConfiguration: debuggingConfig ? debuggingConfig : {},
    });
  })
  return returnMap;
};