export type RestConfig = {
  elements: [RestDevice],
  resilienceLibrary: RestRLPath,
  resilienceConfiguration: RestRLConfig,
  securityConfiguration: RestSecurityConfig,
  degradationConfiguration: RestDegradationConfig,
  extToolsConfiguration: RestExtToolsConfiguration,
  migrationStatus: MigrationStatus, 
  npmConfiguration: NpmConfiguration,
  debuggingConfiguration: DebuggingConfiguration,
};

export enum ResilienceTypes {
  cp = "cp",
  bft = "bft"
}

export enum HpNames {
  cowrie = "cowrie",
  honeyku = "honeyku",
  log4pot = "log4pot",
}

export enum ExtTools {
  honeypot = "honeypot",
  ids = "ids",
}

export interface RestDeviceStripped {
  device_name: string,
  architecture: string,
  protocols: [string],
  location?: string,
}

export interface RestDevice extends RestDeviceStripped {
  id: string,
  units: Array<RestUnit>
}

export type ShadowModeConfig = {
  shadowAgent?: {
      enabled: boolean,
      commOptions: Array<string>,
      autoUpdate?: {
          intervalSeconds: number,
          strategy: string,
          limit: number,
          content: string
      }
  },
  inMessageSharing?: {
      enabled: boolean,
      limit: number,
      content: string
  }
}

export type StateSignature = {
  [key: string]: {
    name:string
    startState: string,
  }
}

export type StateGeneratorSignature = {
  [key: string]: {
    name:string,
    startStateGenerator: string,
    startStateArgs: object,
  }
}

export interface SetupJsonSchema {
  componentInstances:StateSignature|StateGeneratorSignature,
  connections:RestConnectionStripped[],
}

export interface RestUnit {
  id: string,
  cpu?: string,
  ram?: string,
  components?: [RestComponent]
  shadowModeConfig?: ShadowModeConfig,
  pinnedNodePort?: RestPinnedNodePort,
}

export interface RestComponent {
  type: string,
  id: string,
  ports: [RestPort],
  connections: [RestConnection],
  startState?: string
  startStateGenerator?:string,
  startStateArgs?: object 
}

export interface RestPinnedNodePort {
  portNumber: number,
  type: string,
}
export interface RestPort {
  name: string,
  eventTypes: [string],
  direction: "in" | "out"
}

export interface RestConnectionStripped {
  sourceComponent: string,
  sourcePort: string,
  targetComponent: string,
  targetPort: string,
}

export interface RestConnection extends RestConnectionStripped {
  protocol: "REST" | "MQTT" | "MQTT_EXTERNAL" | "BLE" | "ON_UNIT"
}

export interface Default {
  kind: string;
  apiVersion: string;
  metadata: {
    labels: { [key: string]: string },
    name: string,
    namespace: string;
  },
  image: string,
  imagePullSecrets: {name: string}[],
  imagePullPolicy: string
}

export interface RestRLPath {
  directoryPath: string;
}

enum ARFaultModel {
  BFT = "BFT",
}

export interface RestResARMechanism{
  activeReplication: {
    faultModel: ARFaultModel,
    n: number,
    f: number,
    // todo make inner array to type like [id, unit_name,device-instance]
    executionSites: Array<string>, 
    enabled: boolean
  }
}

export interface RestResCPRMechanism{
   checkpointRecovery: {
    recovery: {
      enabled: boolean
    },
    checkpoint: {
      enabled: boolean
    },
  }
}

export interface RestResComponent{
  id: string; 
  mechanisms: RestResARMechanism | RestResCPRMechanism;
}

export interface RestRLConfig {
  components?: Array<RestResComponent>;
}

export interface RestSecretCommUnits{
  from: string;
  to: string;
}

export interface SslConfig {
  key: string;
  certificate: string;
}

export interface RestSecurityConfig {
  ssl?: string,
  communicationSecret?: Array<RestSecretCommUnits>;
}

export interface RestDegradationConfig {
  degradation?: string,
  degradationFileName?: string;
}

export interface HpConfig {
  hpName:HpNames,
  portToOpenHost: number,
  portToOpenContainer: number,
  hostName:string
}

export interface DebuggingConfiguration {
    [unit: string]: {
        debuggingAgent: {
            enabled: boolean,
            isServer: boolean,
            webSocketPort: number,
            checkForChangesIntervalMs: number
        }
    }
}

export interface DebugFrontendInfos {
  portToOpenHost: number,
  portToOpenContainer: number,
  hostName: string,
  pinnedNodePort: RestPinnedNodePort,
}

export interface RestExtToolsConfiguration {
  honeyPots: HpConfig[],
  useIds: boolean,
  debugFrontendInfos: DebugFrontendInfos,
}

export interface NpmConfiguration {
  startScriptName: string, 
}

export enum MigrationType {
    stateful = "stateful",
    stateless = "stateless",
}

export interface MigrationFields {
    migrationType:MigrationType,
    unit: string,
    fromDevice: string,
    toDevice: string
}

export interface MigrationStatus {
  history: MigrationFields[],
  pending: MigrationFields[],
  finalizing: MigrationFields[],
}