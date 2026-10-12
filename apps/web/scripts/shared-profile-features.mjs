import {readFile} from 'node:fs/promises';
import {relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const webRoot=new URL('../',import.meta.url);
const root=new URL('../../../',import.meta.url);
export async function sharedProfileFeatures(){
 const plan=JSON.parse(await readFile(new URL('profiles/shared/easywork-features.json',root),'utf8'));
 const names=new Set();
 const features=[];
 for(const feature of plan.features){
  if(names.has(feature.name))throw Error('Duplicate shared feature '+feature.name);
  names.add(feature.name);
  const manifest=JSON.parse(await readFile(new URL(feature.directory+'/package.json',root),'utf8'));
  if(manifest.name!==feature.name)throw Error('Shared feature package mismatch '+feature.name);
  features.push({...feature,directory:relative(fileURLToPath(webRoot),fileURLToPath(new URL(feature.directory+'/',root)))});
 }
 return {...plan,features};
}
