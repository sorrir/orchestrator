import { Default, RestConnection, RestUnit, RestConnectionStripped } from '../ConfigTypes';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

export function unique(arr: Array<RestConnection>): Array<RestConnection> {
  let newArr: Array<RestConnection> = [];
  arr.forEach(conn => {
    if (newArr.find(el => {
      return el.sourceComponent === conn.sourceComponent &&
        el.targetComponent === conn.targetComponent &&
        el.sourcePort === conn.sourcePort &&
        el.targetPort === conn.targetPort &&
        el.protocol == conn.protocol
    }) === undefined) {
      newArr.push(conn);
    }
  })
  return newArr;
}

export function removeDuplicateUnits(units:RestUnit[]) {
  let newArr: Array<RestUnit> = [];
  units.forEach(unit => {
    if (newArr.find(newUnit => {
      return newUnit.id === unit.id 
    }) === undefined) {
      newArr.push(unit);
    }
  })
  return newArr;
}

//todo: das hier mit 'unique' verheiraten
export function uniqueStripped(arr: Array<RestConnectionStripped>): Array<RestConnectionStripped> {
  let newArr: Array<RestConnectionStripped> = [];
  arr.forEach(conn => {
    if (newArr.find(el => {
      return el.sourceComponent === conn.sourceComponent &&
        el.targetComponent === conn.targetComponent &&
        el.sourcePort === conn.sourcePort &&
        el.targetPort === conn.targetPort
    }) === undefined) {
      newArr.push(conn);
    }
  })
  return newArr;
}

export function getUnitByName(units:RestUnit[],unitName:string): RestUnit|undefined {
  return units.find(el => el.id === unitName);
}

// https://stackoverflow.com/questions/14446511/most-efficient-method-to-groupby-on-an-array-of-objects
export function groupBy(list, keyGetter) {
  const map = new Map();
  list.forEach((item) => {
    const key = keyGetter(item);
    const collection = map.get(key);
    if (!collection) {
      map.set(key, [item]);
    } else {
      collection.push(item);
    }
  });
  return map;
}

const hNamePortMap:Map<string,number> = new Map();

export function generatePortNmbr(hostName:string, startNmbr:number): number {
  let nmbr:number|undefined = hNamePortMap.get(hostName);
  if(nmbr) {
    return nmbr
  }
  nmbr = hNamePortMap.size + startNmbr;
  hNamePortMap.set(hostName,nmbr);
  return nmbr;
}

export function getPortNmbr(hostName:string): number|undefined {
  return hNamePortMap.get(hostName);
}

export function randomBetween(a: number, b: number): number {
  return Math.floor(Math.random() * (a - b + 1)) + b;
}

export function hasDuplicates<T>(arr: Array<T>): boolean {
  return arr.some((e, i) => arr.indexOf(e) !== i);
}

function getDefaults(defaultsFile:string): Default {
  const defaultString = fs.readFileSync(defaultsFile).toString();
  return <Default>yaml.safeLoad(defaultString);
}

export function getDefaultsSorrir(): Default {
  const defaultsFile = process.env.GENERATOR_DEFAULTS ? process.env.GENERATOR_DEFAULTS : 'defaults/defaults.yml';
  return getDefaults(defaultsFile);
}

export function getDefaultsHoneypot(): Default {
  const defaultsFile = process.env.GENERATOR_HP_DEFAULTS ? process.env.GENERATOR_HP_DEFAULTS : 'defaults/defaults_hp.yml';
  return getDefaults(defaultsFile);
}

export function getDefaultsIds(): Default {
  const defaultsFile = process.env.GENERATOR_IDS_DEFAULTS ? process.env.GENERATOR_IDS_DEFAULTS : 'defaults/defaults_ids.yml';
  return getDefaults(defaultsFile);
}

export function getDefaultsDbgFrontend(): Default {
  const defaultsFile = process.env.GENERATOR_DBG_DEFAULTS ? process.env.GENERATOR_DBG_DEFAULTS : 'defaults/defaults_dbg.yml';
  return getDefaults(defaultsFile);
}

export function getDbgFrontendName() {
  return "dbg-frontend";
}

// see: https://bobbyhadz.com/blog/typescript-check-if-string-is-valid-number
function isNumber(str: string): boolean {
  if (typeof str !== 'string') {
    return false;
  }

  if (str.trim() === '') {
    return false;
  }

  return !Number.isNaN(Number(str));
}

export function sortUnitArray(units:RestUnit[]):RestUnit[] {
  const sortedUnits:RestUnit[] = units.sort((u1,u2) => {
      const string_num_u1 = u1.id.substring(5);
      const string_num_u2 = u2.id.substring(5);

      if(!isNumber(string_num_u1) || !isNumber(string_num_u2)) {
        console.error('Unit names do not conform to scheming unit_<nmbr>');
        process.exit(2);
      }

      const num_u1 = parseInt(string_num_u1);
      const num_u2 = parseInt(string_num_u2);

      if (num_u1 < num_u2) {
          return -1;
      }

      if (num_u1 < num_u2) {
          return 1;
      }

      return 0;
  });
  return sortedUnits;
}

/**
 * Verify that the specified container exists and posseses a component of the
 * specified name. If the containerName is "ext", it it assumed that this is the
 * case.
 *
 * TODO: Validate that the specified container exposes an appropriate port.
 * @param containerName The name of the unit to check.
 * @param componentName The name of the component to check.
 * @param units The units defined in the config file.
 */
// function validateComponent(
//   containerName: string, componentName: string, units: Array<Unit>): [boolean, string?] {
//   if (containerName === 'ext') {
//     return [true, undefined];
//   }
//   const sourceUnit = units.find(u => u.name === containerName);
//   if (sourceUnit === undefined) {
//     return [false, 'Error in ConnectionTechs: no unit named ' + containerName];
//   }

//   if (!sourceUnit.components.includes(componentName)) {
//     return [
//       false,
//       'Error in ConnectionTechs: unit ' + containerName + ' has no component ' +
//       componentName
//     ];
//   }
//   return [true, undefined];
// }

/**
 * If the first element in the tuple is false, terminate the programme with
 * the specified error string. Otherwise, do nothing.
 */
function failOnFalse([validateResult, errorString]: [boolean, string?]): void {
  if (!validateResult) {
    console.error(errorString == undefined ? "undefined error" : errorString);
    process.exit(1);
  }
}
