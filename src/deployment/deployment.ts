
import { MigrationFields, DebuggingConfiguration, RestDegradationConfig, NpmConfiguration } from './../ConfigTypes';
import { RestSecurityConfig, Default } from '../ConfigTypes';
import { RestUnit, MigrationStatus } from '../ConfigTypes';
import { production_json, setup_json, units_json } from '../configs/create-default-configs'
import { production_sec_json } from '../configs/create-sec-configs'
import { production_deg_json } from '../configs/create-degradation-configs'
import { exit } from 'process';
import { recursiveFillSecMapAndExecute, secretsMap } from '../util/util-security';
import { getSecretCommuicationUnitNames, generateSslDisabledConfig } from '../util/util-security';
import * as k8s from '@pulumi/kubernetes';
import { createDeplName, createPersVolumeName, createSfsName, createSslConfMapName, createSvcName, createUnitConfMapName, createUnitName, getHostCpDir, createPvcTemplName, getSfsPodName, getCpContainerFolder, copyCpsFromOnePodtoAnother, getSorrirAppContainerFolder, isDebugServer } from '../util/util-deployment';

let usesCp:boolean;
let usesBft:boolean;
let usesSec:boolean;
let usesDeg:boolean;
let defaultUnits:RestUnit[];
let unitsExtended:(RestUnit & {port1?: number, port2?: number, port3?: number})[];
let unitToDevice:Map<string,string>;
let cpToUnit:Map<string,string|undefined>;
let defaults:Default;
let secConfig:RestSecurityConfig|undefined;
let migrationStatus:MigrationStatus;
let dbgConf:DebuggingConfiguration;
let degrConf:RestDegradationConfig|undefined;

export function init(usesCp_:boolean, usesBft_:boolean, usesSec_:boolean, usesDeg_:boolean, defaultUnits_:RestUnit[], unitsExtended_:(RestUnit & {port1?: number, port2?: number, port3?: number})[], unitToDevice_:Map<string,string>, cpToUnit_:Map<string,string|undefined>, defaults_:Default, secConf_:RestSecurityConfig|undefined, dbgConf_:DebuggingConfiguration, degrConf_:RestDegradationConfig|undefined, migrationStatus_:MigrationStatus|undefined) {
    usesCp = usesCp_;
    usesBft = usesBft_;
    usesSec = usesSec_;
    usesDeg = usesDeg_;
    unitToDevice = unitToDevice_;
    cpToUnit = cpToUnit_;
    defaults = defaults_;
    secConfig = secConf_;
    degrConf = degrConf_;

    defaultUnits = defaultUnits_;
    unitsExtended = unitsExtended_;

    if(production_json == undefined || setup_json == undefined || units_json == undefined) {
        console.error("Error creating default config files");
        exit(4);
    }

    if(usesBft || usesCp) {
        production_json.forEach((value,key) => {
          if(!production_json.get(key).ResilienceConfiguration.components || production_json.get(key).ResilienceConfiguration.components.length < 1) { 
            console.error("No resilience components defined");
            exit(5);
        }
      })
    }

    if(usesBft) {
        let found:boolean = false;
        production_json.forEach((value,key) => {
          production_json.get(key).ResilienceConfiguration.components.forEach(el => {
            if("activeReplication" in el.mechanisms) {
                found = true;
            }
          })
      })
        if(!found) {
            console.error("No bft mechanism defined");
            exit(6);
        }
    }
    if(usesCp) {
        let found:boolean = false;
        production_json.forEach((value,key) => {
          production_json.get(key).ResilienceConfiguration.components.forEach(el =>{
            if("checkpointRecovery" in el.mechanisms) {
                found = true;
            }
          })
        })
        if(!found) {
            console.error("No cp mechanism defined");
            exit(7);
        }
    }
    if(usesSec) {
        if(!production_sec_json.ssl || !(production_sec_json.ssl.toString() === "true")) {
            console.error("ssl set to false, though ssl connections are configured");
            exit(8);
        }
    }
    if(usesDeg) {
        if(!degrConf || (degrConf.degradationFileName === "")) {
            console.error("No degradation file name set, though degradtion should be used");
            exit(10);
        }
    }
    if(!migrationStatus_) {
      console.error("No migrationStatus set in config!");
      exit(11);
    }
    const unitNamesPending = migrationStatus_.pending.map(fields => fields.unit);
    const unitNamesFinalizing = migrationStatus_.finalizing.map(fields => fields.unit);
    const intersect = (a, b) => {
      return a.filter(Set.prototype.has, new Set(b));
    };
    if(intersect(unitNamesPending,unitNamesFinalizing) > 0) {
      console.error("Some units are in pending and finalizing state which is not allowed!");
      exit(12);
    }
    migrationStatus = migrationStatus_;
    dbgConf = dbgConf_;
}

function createK8sResources(unit:RestUnit) {
  const unitname = createUnitName(unit.id); 
  const unitRelevantForSecretComm:boolean = getSecretCommuicationUnitNames(secConfig).findIndex(unit_id => unit_id === unit.id) > -1;

  const selectorLabels = { app: unitname };

  const unitArgs = ['--', '--to-execute', unit.id];

  const unitConfigMap = new k8s.core.v1.ConfigMap(createUnitConfMapName(unit.id), {
    metadata: {
      ...defaults.metadata,
      ...{
        name: createUnitConfMapName(unit.id), labels: selectorLabels
      }
    },
    data: {
      'production.json': JSON.stringify(production_json.get(unit.id), null, `\t`),
      'units.json': JSON.stringify(units_json),
      'setup.json': JSON.stringify(setup_json),
      ...((usesSec && unitRelevantForSecretComm) && { 'production.sec.json': JSON.stringify(production_sec_json, null, `\t`) }),
      ...((usesSec && !unitRelevantForSecretComm) && { 'production.sec.json': JSON.stringify(generateSslDisabledConfig(), null, `\t`) }),
      ...(usesDeg && { 'production.deg.json': JSON.stringify(production_deg_json, null, `\t`) }),
    }
  });

  const sslConfigMap = usesSec ? new k8s.core.v1.ConfigMap(createSslConfMapName(unit.id), {
    metadata: {
    ...defaults.metadata,
    ...{
      name: createSslConfMapName(unit.id), labels: selectorLabels
    }
    },
    data: {
        'key.pem': secretsMap.get(unit.id)?.key != undefined ?  secretsMap.get(unit.id)!.key : "",
        'cert.pem': secretsMap.get(unit.id)?.certificate  != undefined ?  secretsMap.get(unit.id)!.certificate : "" 
    }
  }) : undefined;

  let unitPVClaim:any = undefined; 

  const migrationFieldsPending:MigrationFields|undefined = migrationStatus.pending.find(field => field.unit === unit.id);
  const migrationFieldsFinalizing:MigrationFields|undefined = migrationStatus.finalizing.find(field => field.unit === unit.id);
  const migrationStatusNotUsed = migrationFieldsPending == undefined && migrationFieldsFinalizing == undefined;
  const migrationStatusPendingUsed = migrationFieldsPending != undefined; 
  const migrationStatusFinalizingUsed = migrationFieldsFinalizing != undefined; 
  const migrationFieldsUsed = migrationStatusPendingUsed ? migrationFieldsPending : migrationStatusFinalizingUsed ? migrationFieldsFinalizing: undefined;
  if(cpToUnit.get(unit.id) != undefined) {
    if(migrationStatusNotUsed || migrationStatusPendingUsed) {
      const unitVolume1 = new k8s.core.v1.PersistentVolume(createPersVolumeName(unit.id, 1, <string>unitToDevice.get(unit.id)), {
        metadata: {
          ...defaults.metadata,
          ...{
            name: createPersVolumeName(unit.id, 1, <string>unitToDevice.get(unit.id)), labels: selectorLabels
          }
        },
        spec: {
          capacity: {
            storage: "1Mi"
          },
          volumeMode: "Filesystem",
          accessModes: ["ReadWriteOnce"],
          persistentVolumeReclaimPolicy: "Delete",
          storageClassName: "default",
          local: {
            path: cpToUnit.get(unit.id) != undefined ? getHostCpDir() : "",//cpToUnit.get(unit.id)! : "",
          },
          nodeAffinity: {
            required:{
              nodeSelectorTerms: [{
                matchExpressions: [{
                      key: "k3s.io/hostname",
                      operator: "In",
                      values: [ migrationStatusNotUsed ? <string>unitToDevice.get(unit.id) : migrationFieldsUsed!.fromDevice ]
                    }
                  ]
                }
              ]
            }
          }
        }
      });
    }
    if(migrationStatusPendingUsed) {
      const unitVolume2 = new k8s.core.v1.PersistentVolume(createPersVolumeName(unit.id, 2, migrationFieldsUsed!.toDevice), {
        metadata: {
          ...defaults.metadata,
          ...{
            name: createPersVolumeName(unit.id, 2, migrationFieldsUsed!.toDevice), labels: selectorLabels
          }
        },
        spec: {
          capacity: {
            storage: "1Mi"
          },
          volumeMode: "Filesystem",
          accessModes: ["ReadWriteOnce"],
          persistentVolumeReclaimPolicy: "Delete",
          storageClassName: "default",
          local: {
            path: cpToUnit.get(unit.id) != undefined ? getHostCpDir() : "",//cpToUnit.get(unit.id)! : "",
          },
          nodeAffinity: {
            required:{
              nodeSelectorTerms: [{
                matchExpressions: [{
                      key: "k3s.io/hostname",
                      operator: "In",
                      values: [ migrationFieldsUsed!.toDevice ]
                    }
                  ]
                }
              ]
            }
          }
        }
      });
    }
    if(migrationStatusFinalizingUsed) {
      const unitVolume3 = new k8s.core.v1.PersistentVolume(createPersVolumeName(unit.id.concat("-finalizing"), 3, migrationFieldsUsed!.toDevice), {
        metadata: {
          ...defaults.metadata,
          ...{
            name: createPersVolumeName(unit.id, 3, migrationFieldsUsed!.toDevice.concat("-finalizing")), labels: selectorLabels
          }
        },
        spec: {
          capacity: {
            storage: "1Mi"
          },
          volumeMode: "Filesystem",
          accessModes: ["ReadWriteOnce"],
          persistentVolumeReclaimPolicy: "Delete",
          storageClassName: "default",
          local: {
            path: cpToUnit.get(unit.id) != undefined ? getHostCpDir() : "",//cpToUnit.get(unit.id)! : "",
          },
          nodeAffinity: {
            required:{
              nodeSelectorTerms: [{
                matchExpressions: [{
                      key: "k3s.io/hostname",
                      operator: "In",
                      values: [ migrationFieldsUsed!.toDevice ]
                    }
                  ]
                }
              ]
            }
          }
        }
      });
    }
  }
  const unitDeployment = cpToUnit.get(unit.id) == undefined ? new k8s.apps.v1.Deployment(createDeplName(unit.id), {
    metadata: {
      ...defaults.metadata,
      ...{
        name: createDeplName(unit.id), labels: selectorLabels
      }
    },
    spec: {
      // replicas: 1,
      selector: { matchLabels: selectorLabels },
      template: {
        metadata: { labels: selectorLabels, name: createDeplName(unit.id)},
        spec: {
          containers: [{
            name: unitname,
            //ports: unit.ports,
            image: defaults.image,
            imagePullPolicy: defaults.imagePullPolicy,
            //resources: unit.resources,
            args: unitArgs,
            //command: ["sleep"],
            //args: ["infinity"],
            volumeMounts:
            [{ mountPath: '/usr/src/sorrir/app/config', name: 'config' },
            ... (usesSec) ?  [{mountPath: '/usr/src/sorrir/app/ssl', name: 'ssl'}] :[]
            ]
          }],
          imagePullSecrets: defaults.imagePullSecrets,
          nodeSelector: { 'k3s.io/hostname': <string>unitToDevice.get(unit.id) },
          volumes: [{
              name: 'config',
              configMap: {
                name: unitConfigMap.metadata.apply(m => m.name),
              }
            },
            ...(usesSec ? 
            [{
              name: 'ssl',
              configMap: {
                name: sslConfigMap?.metadata.apply(m => m.name),
              }
            }] : [])]
          }
        },
      }
  }) : undefined;

  let devicesUsed:string[] = [];
  if(migrationStatusNotUsed) {
    devicesUsed.push(unitToDevice.get(unit.id)!);
  } else if(migrationStatusPendingUsed) {
    devicesUsed.push(migrationFieldsUsed!.fromDevice, migrationFieldsUsed!.toDevice);
  } else {
    devicesUsed.push(migrationFieldsUsed!.toDevice);
  }
  const unitStateFulSet = cpToUnit.get(unit.id) != undefined ? new k8s.apps.v1.StatefulSet(createSfsName(unit.id, migrationStatusFinalizingUsed), {
    metadata: {
      ...defaults.metadata,
      ...{
        name: createSfsName(unit.id, migrationStatusFinalizingUsed), labels: selectorLabels
      }
    },
    spec: {
      serviceName: createSfsName(unit.id, migrationStatusFinalizingUsed),
      replicas: migrationStatusPendingUsed ? 2 : 1,
      selector: { matchLabels: selectorLabels },
      template: {
        metadata: { labels: selectorLabels, name: createSfsName(unit.id, migrationStatusFinalizingUsed)},
        spec: {
          containers: [{
            name: unitname,
            //ports: unit.ports,
            image: defaults.image,
            imagePullPolicy: defaults.imagePullPolicy,
            //resources: unit.resources,
            args: unitArgs,
            //command: ["sleep"],
            //args: ["infinity"],
            volumeMounts:
            [
              //todo: create functions to get paths in uti-deployment.ts
              { mountPath: '/usr/src/sorrir/app/config', name: 'config' },
              { mountPath: getCpContainerFolder(), name: unitname.concat('-pvc')},
              ... (usesSec) ?  [ {mountPath: '/usr/src/sorrir/app/ssl', name: 'ssl'} ] :[]
            ]
          }],
          volumes: [{
              name: 'config',
              configMap: {
                name: unitConfigMap.metadata.apply(m => m.name),
              }
            },
            ...(usesSec ? 
            [{
              name: 'ssl',
              configMap: {
                name: sslConfigMap?.metadata.apply(m => m.name),
              }
            }] : [])],
          imagePullSecrets: defaults.imagePullSecrets,
          affinity: {
            nodeAffinity: {
              requiredDuringSchedulingIgnoredDuringExecution: {
                nodeSelectorTerms: [{
                  matchExpressions: [{
                    key: "k3s.io/hostname", 
                    operator: "In",
                    values: devicesUsed,
                  }
                ]
              }]
            },
          }
        }
      }},
        volumeClaimTemplates:[ 
          {
            metadata: {
              name: createPvcTemplName(unit.id),
            },
            spec: {
              selector: { matchLabels: selectorLabels },
              accessModes: [ "ReadWriteOnce" ],
              storageClassName: "default",
              resources: {
                requests: {
                  storage: "1Mi"
                }
              }  
            }
          }
        ]
      }
  }) : undefined;
}

function createK8sServicesDefault(unit:RestUnit) {
  const unitname = unit.id.toLowerCase().replace(/_/g, '-');
  const selectorLabels = { app: unitname };

  const unitService = new k8s.core.v1.Service(createSvcName(unit.id), {
    metadata: {
      ...defaults.metadata,
      ...{
        name: createSvcName(unit.id)
      }
    },
    spec: {
      ports: [
        { name: unitname, port: production_json.get(unit.id).HostConfiguration[unit.id].port, ... (unit.pinnedNodePort?.type === "default") ?  {nodePort: unit.pinnedNodePort.portNumber } :{} },
        { name: unitname + "-ble", port: production_json.get(unit.id).BLEConfiguration[unit.id].listenPort }
      ],
      selector: selectorLabels,
      type: 'NodePort'
    }
  });
}

function createK8sServicesForExtensions(unitExtended:(RestUnit & {port1?: number, port2?: number, port3?: number})) {
  const unitname = createUnitName(unitExtended.id); 
  const selectorLabels = { app: unitname };
  const nameForReplicaPort1 = unitname.concat("-replica1");
  const nameForReplicaPort2 = unitname.concat("-replica2");
  const nameForDebuggingPort3 = unitname.concat("-debug");

  const unitService = new k8s.core.v1.Service(createSvcName(unitExtended.id), {
    metadata: {
      ...defaults.metadata,
      ...{
        name: createSvcName(unitExtended.id)
      }
    },
    spec: {
      ports: [{ name: unitname.concat("-service"), port: production_json.get(unitExtended.id).HostConfiguration[unitExtended.id].port , ... (unitExtended.pinnedNodePort?.type === "default") ?  {nodePort: unitExtended.pinnedNodePort.portNumber } :{} },
      ... (unitExtended.port1) ?  [{ name: nameForReplicaPort1, port: unitExtended.port1 }] :[],
      ... (unitExtended.port2) ?  [{ name: nameForReplicaPort2, port: unitExtended.port2 }] :[],
      ... (unitExtended.port3) ?  [{ name: nameForDebuggingPort3, port: unitExtended.port3, ... (unitExtended.pinnedNodePort?.type === "debug") ? { nodePort: unitExtended.pinnedNodePort.portNumber } :{}}] :[],
      ],
      selector: selectorLabels,
      type: 'NodePort'
    }
  });
}

function tryPreMigrate(unit) {
  const migrationFieldsFinalizing:MigrationFields|undefined = migrationStatus.finalizing.find(field => field.unit === unit.id);
  const migrationStatusFinalizingUsed = migrationFieldsFinalizing != undefined; 
  if(migrationStatusFinalizingUsed) {
    copyCpsFromOnePodtoAnother(getSfsPodName(unit.id, 0), getSfsPodName(unit.id, 1), getCpContainerFolder(), "/");
  }
}

let execute = () => {
  const onlyDbgSrvr = process.env.SINGLE_DEPLOY_DBG_SRV === "on" ? true : false;
  if(!onlyDbgSrvr) {
    for (let regularUnit of defaultUnits) {
      tryPreMigrate(regularUnit);
      createK8sResources(regularUnit);
      createK8sServicesDefault(regularUnit);
    }
  }

  for (let unitExtended of unitsExtended) {
    if(onlyDbgSrvr && !isDebugServer(unitExtended.id, dbgConf)) {
      continue;
    }
    tryPreMigrate(unitExtended);
    createK8sResources(unitExtended);
    createK8sServicesForExtensions(unitExtended);
  }
}

export function deploy() {
    if(usesSec) {
        const length = (secConfig && secConfig.communicationSecret) ? secConfig.communicationSecret!.length : 0;
        recursiveFillSecMapAndExecute(secConfig, length, execute);
    } else {
        execute();
    }
}