import { RestDegradationConfig } from '../ConfigTypes';
import { exit } from 'process';
import * as fs from 'fs';

export let production_deg_json;

export function initialize(degConfig:RestDegradationConfig|undefined) {
  if(degConfig) {
    if(degConfig.degradationFileName === undefined || degConfig.degradationFileName === "") {
        console.error("Error creating degradation config. No file name given");
        exit(4);
    }
    production_deg_json = createProductioncDegJsons(degConfig);
  }
}

function createProductioncDegJsons(degConfig:RestDegradationConfig) {
  return JSON.parse(fs.readFileSync(degConfig.degradationFileName!).toString());
};
