// Capture the actual assembled catalogue bodywork, not only the shared family rigs.
import {writeFileSync,mkdirSync} from 'node:fs';
import {start} from './common.mjs';
const {browser,q,newGame,errors}=await start();
const out=process.env.BLENDER_OUT;
if(!out)throw new Error('Set BLENDER_OUT to a scratch directory');
mkdirSync(out,{recursive:true});
try {
 await newGame();
 await q(async()=>{
  const api=await import('/src/world3d/glbModels.js');
  const {upgradePickupModel}=await import('/src/world3d/fleetVariants.js');
  const {GLTFExporter}=await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
  window.__catalogueExport={api,upgradePickupModel,exporter:new GLTFExporter()};
 });
 const models=await q(()=>Object.entries(window.__quarry.game.data.machines.types).flatMap(([type,t])=>Object.entries(t.tiers).filter(([,s])=>!s.legacy&&s.modelId&&!['quad','buggy','serviceVan','pickup','truck','dumper'].includes(type)).map(([tier,s])=>({type,tier,modelId:s.modelId,name:s.modelName}))));
 const manifest=[];
 for(const m of models){
  const data=await q(async m=>{
   const {api,exporter,upgradePickupModel}=window.__catalogueExport;
   const spec=window.__quarry.game.data.machines.types[m.type].tiers[m.tier];
   const model=m.type==='miniDigger'?api.glbMiniDigger(m.tier,spec):m.type==='excavator'?api.glbExcavator(m.tier,spec):m.type==='tractor'?api.glbTractor(m.tier,0,spec):m.type==='trailer'?api.glbTrailer(m.tier,spec):upgradePickupModel(api.glbPickup(0,'mobility_fourByFour'));
   model.root.traverse(o=>{if(o.name==='TrackShoe'||o.name==='Tracks')o.visible=o.name==='Tracks';});
   const buffer=await exporter.parseAsync(model.root,{binary:true,onlyVisible:true});
   const bytes=new Uint8Array(buffer);let result='';for(let i=0;i<bytes.length;i+=32768)result+=String.fromCharCode(...bytes.subarray(i,i+32768));
   return btoa(result);
  },m);
  const file=`catalogue-${m.type}-${m.tier}.glb`;
  writeFileSync(`${out}/${file}`,Buffer.from(data,'base64'));manifest.push({...m,file});
 }
 writeFileSync(`${out}/catalogue.json`,JSON.stringify(manifest,null,2));
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('Exported',manifest.length,'actual runtime assemblies for Blender');
}finally{await browser.close();}
