import { RestSecurityConfig } from '../ConfigTypes';
import * as generator from 'generate-password';

export let production_sec_json;

export function initialize(secConfig:RestSecurityConfig|undefined) {
  if(secConfig) {
    production_sec_json = createProductionSecJsons(secConfig);
  }
}

function createProductionSecJsons(secConfig:RestSecurityConfig) {
  return {
    ssl: secConfig.ssl,
    privateKey: "./ssl/key.pem",
    passphrase: generator.generate({ length: 32, numbers: true }),
    certificate:  "./ssl/cert.pem",
    communicationSecret: secConfig.communicationSecret?.map(item => {
      const secret = {
        from: item.from,
        to: item.to,
        secret: generator.generate({ length: 32, numbers: true }),
      }

      return secret;
    }),
  }
};
