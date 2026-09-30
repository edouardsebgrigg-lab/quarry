// Run against the handover Vite browser-check server; production assets are not changed.
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.REVIEW_OUT;
if(!out)throw Error('Set REVIEW_OUT to the review export directory');
const names=(await fs.readdir(out)).filter(n=>!n.includes('.'));
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:900,height:600}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
page.setDefaultTimeout(120000);
if(process.env.REVIEW_OVERRIDE==='1') await page.route('**/models/*.glb',async route=>{
 const name=route.request().url().split('/').at(-1).replace('.glb','');
 if(names.includes(name)){await route.fulfill({contentType:'model/gltf-binary',body:await fs.readFile(`${out}/${name}/${name}.glb`)});}else await route.continue();
});
try{
 await page.goto(process.env.QUARRY_URL || 'http://127.0.0.1:5174');
 const result=await page.evaluate(async()=>{
  const m=await import('/src/world3d/glbModels.js');await m.preloadModels();
  const THREE=await import('/node_modules/.vite/deps/three.js');
  const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(480,320);
  const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x555555,3));
  const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(5,8,4);scene.add(light);
  const camera=new THREE.PerspectiveCamera(40,1.5,.01,500);
  const checks=[];
  const run=(name,make)=>{
   const model=make();if(!model?.root)throw Error(`Missing ${name}`);
   const materials=new Set();let textures=0,normal=0,rough=0,hoses=0;
   model.root.traverse(o=>{if(o.isMesh){for(const mat of Array.isArray(o.material)?o.material:[o.material])materials.add(mat);}if(o.name.startsWith('Review_boom_hydraulic_hose'))hoses++;});
   for(const mat of materials){if(mat.map)textures++;if(mat.normalMap)normal++;if(mat.roughnessMap)rough++;}
   scene.add(model.root);model.root.updateMatrixWorld(true);
   const bounds=new THREE.Box3().setFromObject(model.root),center=bounds.getCenter(new THREE.Vector3());
   const size=bounds.getSize(new THREE.Vector3()).length();
   camera.position.copy(center).add(new THREE.Vector3(size,size*.65,size));camera.lookAt(center);
   renderer.render(scene,camera);const triangles=renderer.info.render.triangles;
   scene.remove(model.root);
   checks.push({name,triangles,materialCount:materials.size,textures,normalMaps:normal,roughnessMaps:rough,hoses,hasGlass:[...materials].some(x=>x.name.startsWith('Review_Glass')&&x.transparent&&x.opacity<.3)});
  };
  run('vehicle_pickup',()=>m.glbPickup(.5));run('prop_wheelbarrow',()=>({root:m.glbProp('wheelbarrow')}));
  for(const tier of ['rusty','used']){
   run('minidigger_'+tier,()=>m.glbMiniDigger(tier));run('dumper_'+tier,()=>m.glbDumper(tier));
   run('tractor_'+tier,()=>m.glbTractor(tier,.5));run('excavator_'+tier,()=>m.glbExcavator(tier));
   run('truck_'+tier,()=>m.glbTruck(tier));run('trailer_'+tier,()=>m.glbTrailer(tier));
  }
  renderer.dispose();return checks;
 });
 assert.equal(result.length,14);assert.deepEqual(errors,[]);
 for(const c of result){assert.ok(c.triangles>0&&c.normalMaps>0&&c.roughnessMaps>0,JSON.stringify(c));if(/excavator|truck|pickup/.test(c.name))assert.equal(c.hasGlass,true,c.name);if(/excavator|minidigger/.test(c.name))assert.equal(c.hoses,2,c.name);}
 await fs.writeFile(out+'/browser-checks.json',JSON.stringify({models:result,pageErrors:errors,check:'Actual game GLB constructors, WebGL render, portable maps and glazing; no driving simulation'},null,2));
 console.log('PASS: all 14 exports load and render through the actual game model constructors, maps and glazing present; no page errors');
}finally{await browser.close();}
