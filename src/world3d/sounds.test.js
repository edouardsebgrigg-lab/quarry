import {it,expect} from 'vitest';
import * as THREE from 'three';
import {createWorldSounds} from './sounds.js';
it('engages tractor PTO only while raising and stops ram/PTO voices on idle and removal',()=>{
 const loops=new Map(),played=[];
 const voice=()=>({set(x){this.last=x;},stop(){this.stopped=true;}});
 const audio={ready:()=>true,setListener(){},engineVoice:voice,loopVoice(name){const v=voice();loops.set(name,v);return v;},whineVoice:voice,play:(n)=>played.push(n)};
 const sounds=createWorldSounds({audio,groundSurface:()=>({name:'grass'})});
 const root=new THREE.Group();
 const feel={engine:'running',rpm:1400,load:0.3,shifted:0,speed:0,surface:'gravel',slip:0,bedAngle:0.3,bedSpeed:0.2,bump:0};
 const v={machineId:'tractor',type:'tractor',road:true,carrier:true,model:{root},feel:()=>feel,takeEngineEvents:()=>[],position:()=>new THREE.Vector3(),exhaustWorld:()=>new THREE.Vector3(),bedWorld:()=>new THREE.Vector3(-4,1,0)};
 const args={camera:new THREE.PerspectiveCamera(),vehicles:new Map([[v.machineId,v]]),current:null,player:null,jobOf:()=>({type:'tip'}),tierOf:()=> 'used'};
 sounds.update(0.1,args);
 expect(loops.get('pto').last.gain).toBeGreaterThan(0);expect(loops.get('tipperRam').last.gain).toBeGreaterThan(0);
 expect(played.filter(n=>n==='clunk')).toHaveLength(1);
 feel.bedSpeed=-0.2;sounds.update(0.1,args);expect(loops.get('pto').last.gain).toBe(0);
 expect(loops.get('tipperRam').last.rate).toBe(0.75);
 feel.bedSpeed=0;sounds.update(0.1,args);expect(loops.get('tipperRam').last.gain).toBe(0);
 feel.speed=7;feel.bedAngle=0;args.jobOf=()=>null;sounds.update(0.1,args);expect(loops.get('pto').last.gain).toBe(0);
 args.vehicles.clear();sounds.update(0.1,args);expect(loops.get('pto').stopped).toBe(true);expect(loops.get('tipperRam').stopped).toBe(true);
 sounds.destroy();
});

it('supports new mobility engines and leaves parked trailers silent',()=>{
 const engineKinds=[];
 const voice=()=>({set(){},stop(){}});
 const audio={ready:()=>true,setListener(){},engineVoice(kind){engineKinds.push(kind);return voice();},loopVoice:voice,whineVoice:voice,play(){}};
 const sounds=createWorldSounds({audio,groundSurface:()=>({name:'grass'})});
 const vehicles=new Map();
 for(const type of ['quad','buggy','fourByFour','serviceVan']) {
  vehicles.set(type,{machineId:type,type,road:true,carrier:type!=='quad',model:{root:new THREE.Group()},
   feel:()=>({engine:'off',rpm:700,load:0,shifted:0,speed:0,surface:'gravel',slip:0,bedAngle:0,bedSpeed:0,bump:0}),
   takeEngineEvents:()=>[],position:()=>new THREE.Vector3(),exhaustWorld:()=>new THREE.Vector3(),bedWorld:()=>new THREE.Vector3()});
 }
 // No engine/seat/exhaust interface on a parked load-bearing trailer.
 vehicles.set('trailer',{machineId:'trailer',type:'trailer',towable:true,carrier:true});
 sounds.update(.016,{camera:new THREE.PerspectiveCamera(),vehicles,current:null,player:null,jobOf:()=>null,tierOf:()=> 'standard'});
 expect(engineKinds).toEqual(['pickupOld','pickupOld','pickupOld','truckTurbo']);
 sounds.destroy();
});
