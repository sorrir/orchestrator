import { RestDevice, RestSecurityConfig, SslConfig, ResilienceTypes} from '../ConfigTypes';
import * as openssl from 'openssl-nodejs';
import * as fs from 'fs';

export let secretsMap:Map<string,SslConfig> = new Map(); 
// todo: generate distinct keys and certs
export function recursiveFillSecMapAndExecute(secConfig:RestSecurityConfig|undefined, recursions:number, func: () => void) {
    if(!secConfig || !secConfig.communicationSecret) {
        console.warn("executing deployment configured with ssl without being able to use it")
        recursions = 0;
    }

  if(recursions === 0) {
    //fs.rmdirSync("openssl");
    func()
  } else {
    if (!fs.existsSync("openssl")){
      fs.mkdirSync("openssl");
    }
    const item = secConfig?.communicationSecret![recursions-1];
    openssl('openssl req -config csr.cnf -newkey rsa:2048 -x509 -days 100 -keyout key.pem -out cert.pem', function (err, buffer) {
    const sslConfig:SslConfig = {
      key: fs.readFileSync("openssl/key.pem").toString(),
      certificate: fs.readFileSync("openssl/cert.pem").toString(),
    }
    if(item) {
      secretsMap.set(item.from,sslConfig);
      secretsMap.set(item.to,sslConfig);
    }
    fs.unlink("openssl/key,pem", () => { fs.unlink("openssl/cert.pem", () => { recursiveFillSecMapAndExecute(secConfig, recursions-1, func);})});
    })
  }
}

export function getSecretCommuicationUnitNames(secConfig:RestSecurityConfig|undefined):string[] {
  if(!secConfig) {
    return [];
  }
  let returnArr:string[] = [];
  if(secConfig.ssl && secConfig.communicationSecret) {
    secConfig.communicationSecret.forEach(item => {
      returnArr.push(item.from);
      returnArr.push(item.to);
    })
    return [...new Set(returnArr)];
  }
  return [];
}

export function generateSslDisabledConfig():RestSecurityConfig {
  const secConfig:RestSecurityConfig = {
      ssl: "false",
  }
  return secConfig;
}