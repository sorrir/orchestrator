import { RestPinnedNodePort } from './../ConfigTypes';
import { HpConfig, HpNames, Default, RestExtToolsConfiguration  } from '../ConfigTypes';
import { exit } from 'process';
import { getDbgFrontendName } from '../util/util';
import { production_json } from '../configs/create-default-configs'
import * as k8s from '@pulumi/kubernetes';

let usesHp:boolean;
let usesDbgFrontend:boolean;
let usesIds:boolean;
let sorrir_json:any;

let restExtToolsConfiguration:RestExtToolsConfiguration;
let defaultsHp:Default;
let defaultsIds:Default;
let defaultsDbgFrontend:Default;

// todo: check if hpName set correctly in defaults_hp.yml
export function init(usesHp_:boolean, usesDbgFrontend_:boolean, useIds_:boolean,restExtToolsConfiguration_:RestExtToolsConfiguration|undefined, defaultsHp_:Default|undefined, defaultsDbgFrontend_:Default|undefined, defaultsIds_:Default|undefined) {
    usesHp = usesHp_;
    usesDbgFrontend = usesDbgFrontend_;
    usesIds = useIds_;

    if(usesHp || usesDbgFrontend || usesIds) {
      if(restExtToolsConfiguration_ === undefined) {
        console.error("restExtToolsConfiguration undefined, aborting ...")
        exit(12);
      }
    }

    if(usesHp) {
      if(defaultsHp_ === undefined) {
        console.error("defaults file for hp undefined, aborting ...")
        exit(12);
      }
      defaultsHp = defaultsHp_;
    }

    if(usesHp) {
      if(restExtToolsConfiguration_?.honeyPots === undefined || restExtToolsConfiguration_?.honeyPots.length === 0) {
        console.error("cannot deploy hps as no hps configured, aborting ...")
        exit(12);
      }
    }

    if(usesDbgFrontend) {
      if(defaultsDbgFrontend_ === undefined) {
        console.error("defaults file for debug frontend undefined, aborting ...")
        exit(12);
      }
      defaultsDbgFrontend = defaultsDbgFrontend_;
    }

    if(usesDbgFrontend) {
      if(restExtToolsConfiguration_?.debugFrontendInfos === undefined || restExtToolsConfiguration_?.debugFrontendInfos.hostName === "" ||
        !restExtToolsConfiguration_?.debugFrontendInfos.hostName || !restExtToolsConfiguration_?.debugFrontendInfos.portToOpenContainer || !restExtToolsConfiguration_?.debugFrontendInfos.portToOpenHost) {
        console.error("cannot deploy debuggingFrontend as incomplete information submitted, aborting ...")
        exit(12);
      }
    }

    if(usesIds) {
      if(defaultsIds_ === undefined) {
        console.error("defaults file for hp undefined, aborting ...")
        exit(12);
      }
      defaultsIds = defaultsIds_;
    }

    if(usesIds) {
      if(!restExtToolsConfiguration_?.useIds) {
        console.error("cannot deploy ids as ids enablement set to false, aborting ...")
        exit(12);
      }
    }

    if(usesHp || usesDbgFrontend || usesIds) {
      restExtToolsConfiguration = restExtToolsConfiguration_!; 
    }
    sorrir_json = production_json;
}

function deployHp(hpName:HpNames, portToOpenContainer:number, portToOpenHost:number, hostName:string) {
  const selectorLabels = { app: hpName.toString() };

  //EXPOSE 5000
  //ENTRYPOINT ["sh"]
  //CMD ["/root/start.sh"]

  const sorrirConfigMap = new k8s.core.v1.ConfigMap(hpName.toString(), {
    metadata: {
      ...defaultsHp.metadata,
      ...{
        name: hpName.toString(), labels: selectorLabels
      }
    },
    data: {
      'sorrir.json': (usesHp && hpName.toString() === HpNames.honeyku.toString()) ? JSON.stringify(sorrir_json, null, `\t`) : '{}',
    }
  });

  const podDeployment = new k8s.apps.v1.Deployment(hpName.toString(), {
    metadata: {
      ...defaultsHp.metadata,
      ...{
        name: hpName.toString(), labels: selectorLabels
      }
    },
    spec: {
      // replicas: 1,
      selector: { matchLabels: selectorLabels },
      template: {
        metadata: { labels: selectorLabels, name: hpName.toString() },
        spec: {
          containers: [{
            name: hpName.toString(),
            image: defaultsHp.image,
            imagePullPolicy: defaultsHp.imagePullPolicy,
            //resources: unit.resources,
            //command: ["sleep"],
            //args: ["infinity"],
            ports: [
              {
                containerPort: portToOpenContainer,
                hostPort: portToOpenHost,
              } 
            ],
            volumeMounts:
            [
              { mountPath: '/config', name: 'config' },
            ]
          }],
          imagePullSecrets: defaultsHp.imagePullSecrets,
          nodeSelector: { 'k3s.io/hostname': hostName },
          volumes: [{
              name: 'config',
              configMap: {
                name: sorrirConfigMap.metadata.apply(m => m.name),
                items: [
                  { key: 'sorrir.json', path: 'sorrir.json' },
                ]
              }
            }],
          }
        }
      }
  });

  const unitService = new k8s.core.v1.Service(hpName.toString(), {
    metadata: {
      ...defaultsHp.metadata,
      ...{
        name: hpName.toString(),
      }
    },
    spec: {
      ports: [
        { name: hpName.toString(), port: portToOpenHost },
      ],
      selector: selectorLabels,
      type: 'ClusterIP'
    }
  });
}

function deployIds(/*TODO*/) {
  const name = "ids";
  const selectorLabels = { app: name };

  //EXPOSE 5000
  //ENTRYPOINT ["sh"]
  //CMD ["/root/start.sh"]

  const deamonSet = new k8s.apps.v1.DaemonSet(name, {
    metadata: {
      ...defaultsIds.metadata,
      ...{
        name: name, labels: selectorLabels
      }
    },
    spec: {
      selector: { matchLabels: selectorLabels },
      template: {
        metadata: { labels: selectorLabels, name: name },
        spec: {
          hostNetwork: true,
          containers: [{
            name: name,
            image: defaultsIds.image,
            imagePullPolicy: defaultsIds.imagePullPolicy,
            //resources: unit.resources,
            //command: ["sleep"],
            //args: ["infinity"],
            ports: [
              /*{
                containerPort: portToOpenContainer,
                hostPort: portToOpenHost,
              }*/
            ],
            securityContext: {
              capabilities: {
                add: [ "NET_ADMIN" ]
              }
            }
          }],
          imagePullSecrets: defaultsIds.imagePullSecrets,
          nodeSelector: { 'kubernetes.io/arch': 'amd64'},
        }
      }
    }
  });

  const unitService = new k8s.core.v1.Service(name, {
    metadata: {
      ...defaultsIds.metadata,
      ...{
        name: name,
      }
    },
    spec: {
      ports: [
        { name: name, port: 8080 },
      ],
      selector: selectorLabels,
      type: 'NodePort'
    }
  });
}

function deployDbgFrontend(portToOpenContainer:number, portToOpenHost:number, pinnedNodePort:number, hostName:string) {
  const selectorLabels = { app: getDbgFrontendName() };

  //EXPOSE 5000
  //ENTRYPOINT ["sh"]
  //CMD ["/root/start.sh"]

  const podDeployment = new k8s.apps.v1.Deployment(getDbgFrontendName(), {
    metadata: {
      ...defaultsDbgFrontend.metadata,
      ...{
        name: getDbgFrontendName(), labels: selectorLabels
      }
    },
    spec: {
      // replicas: 1,
      selector: { matchLabels: selectorLabels },
      template: {
        metadata: { labels: selectorLabels, name: getDbgFrontendName() },
        spec: {
          containers: [{
            name: getDbgFrontendName(),
            image: defaultsDbgFrontend.image,
            imagePullPolicy: defaultsDbgFrontend.imagePullPolicy,
            //resources: unit.resources,
            //command: ["sleep"],
            //args: ["infinity"],
            ports: [
              {
                containerPort: portToOpenContainer,
                hostPort: portToOpenHost,
              } 
            ],
          }],
          imagePullSecrets: defaultsDbgFrontend.imagePullSecrets,
          nodeSelector: { 'k3s.io/hostname': hostName },
          }
        }
      }
  });

  const unitService = new k8s.core.v1.Service(getDbgFrontendName(), {
    metadata: {
      ...defaultsDbgFrontend.metadata,
      ...{
        name: getDbgFrontendName(),
      }
    },
    spec: {
      ports: [
        { name: getDbgFrontendName(), port: portToOpenHost, nodePort:pinnedNodePort },
      ],
      selector: selectorLabels,
      type: 'NodePort'
    }
  });
}

function executeHps() {
  restExtToolsConfiguration?.honeyPots.forEach(hp => {
    deployHp(hp.hpName, hp.portToOpenContainer, hp.portToOpenHost, hp.hostName)
  }) 
}

export function deploy() {
    if(process.env.SINGLE_DEPLOY_DBG_SRV === "on") {
      return;
    }
    if(usesHp) {
      executeHps();
    }
    if(usesDbgFrontend) {
      deployDbgFrontend(restExtToolsConfiguration.debugFrontendInfos.portToOpenContainer, restExtToolsConfiguration.debugFrontendInfos.portToOpenHost, restExtToolsConfiguration.debugFrontendInfos.pinnedNodePort.portNumber, restExtToolsConfiguration.debugFrontendInfos.hostName);
    }
    if(usesIds) {
      deployIds();
    }
}