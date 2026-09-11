import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRAIT_CATEGORIES } from '../src/config/traits.js';
import { applyTraitVisibility, resolveTraitMeshes } from '../src/avatar/traits.js';
const b=readFileSync(new URL('../public/avatar/mfermashup.glb',import.meta.url));
const json=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
const nodes=new Map(json.nodes.filter(n=>n.mesh!==undefined).map(n=>[n.name,n]));
let checked=0;
for(const [category,{options}] of Object.entries(TRAIT_CATEGORIES)){
 if(category==='background')continue;
 for(const option of options){
  const chosen={type:'plain',eyes:'regular',mouth:'smile',[category]:option.id};
  const baseline=resolveTraitMeshes({type:'plain',eyes:'regular',mouth:'smile'});
  const resolved=resolveTraitMeshes(chosen);
  assert([...resolved].some(name=>nodes.has(name)),`${category}/${option.id} resolves to actual model`);
  if(!['type','eyes','mouth'].includes(category))assert([...resolved].some(name=>!baseline.has(name)&&nodes.has(name)),`${category}/${option.id} adds its trait`);
  checked++;
 }
}
for(const type of ['plain','metal','based'])for(const mouth of ['flat','smile']){
 const expected=`mouth_${mouth}${type==='metal'?'_metal':type==='based'?'_mfercoin':''}`;
 const selected=resolveTraitMeshes({type,mouth,eyes:'regular'});assert(selected.has(expected));
 const names=json.meshes[nodes.get(expected).mesh].extras.targetNames;
 for(const key of ['mouthOpenExtra','mouthCornerUpLeft','mouthCornerUpRight'])assert(names.includes(key),`${expected}: ${key}`);
}
assert(resolveTraitMeshes({type:'robot',mouth:'robot',eyes:'robot'}).has('mouth_robot'));
for(const mouth of ['smile','flat']) {
 const selected=resolveTraitMeshes({type:'robot',mouth});
 assert(selected.has(`mouth_${mouth}`));assert(!selected.has('mouth_robot'));
}
assert(resolveTraitMeshes({type:'robot',eyes:'regular'}).has('eyes_robot'));
assert(resolveTraitMeshes({type:'plain',mouth:'robot',eyes:'robot'}).has('eyes_robot'));
assert(resolveTraitMeshes({type:'robot'}).has('robot_light'));
const tongue={isMesh:true,name:'tongue',visible:false,userData:{}};
const reference={isMesh:true,name:'MFER_Reference_mouth_smile',visible:false,userData:{mferAttachmentReference:true}};
applyTraitVisibility({traverse(fn){fn(tongue);fn(reference)}},{type:'plain'});
assert(!tongue.visible&&!reference.visible,'Trait changes cannot expose dormant tongue/reference geometry');
console.log(JSON.stringify({passed:true,traitOptionsChecked:checked,humanMouths:6,robot:true}));
