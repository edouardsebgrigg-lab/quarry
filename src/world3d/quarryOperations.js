// Small authored-in-code yard plants and a reusable work-area boundary marker.
import * as THREE from 'three';
import { ownsBuilding } from '../buildings/index.js';
import { activeWorkArea } from '../quarry/index.js';
import { plantStatus } from '../production/index.js';

export function createQuarryOperations({ scene, physics, game, map, heightAt }) {
  const root=new THREE.Group(); root.name='quarry-operations'; scene.add(root);
  const steel=new THREE.MeshStandardMaterial({color:0x465752,roughness:.82});
  const rubber=new THREE.MeshStandardMaterial({color:0x252927,roughness:.95});
  const yellow=new THREE.MeshStandardMaterial({color:0xc9a242,roughness:.76});
  const geometry=[], colliders=[], plants=[];
  const box=(parent,size,at,material)=>{
    const geo=new THREE.BoxGeometry(...size);geometry.push(geo);
    const mesh=new THREE.Mesh(geo,material);mesh.position.set(...at);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };
  for(const [id,at] of Object.entries(map.home.production)) {
    const group=new THREE.Group();group.name=`production-${id}`;
    group.position.set(at.x,heightAt(at.x,at.z),at.z);root.add(group);
    box(group,[2.8,.9,4.2],[0,1,0],steel);
    for(const x of [-1,1])for(const z of [-1.4,1.4])box(group,[.2,1.1,.2],[x,.55,z],yellow);
    const hopperGeo=new THREE.CylinderGeometry(1.15,.65,1.2,4);geometry.push(hopperGeo);
    const hopper=new THREE.Mesh(hopperGeo,steel);hopper.rotation.y=Math.PI/4;hopper.position.set(0,2.05,-.65);group.add(hopper);
    const belt=box(group,[1.1,.16,3],[0,1.05,2.1],rubber);belt.rotation.x=-.16;
    const rollerGeo=new THREE.CylinderGeometry(.22,.22,1.3,10);geometry.push(rollerGeo);
    const roller=new THREE.Mesh(rollerGeo,yellow);roller.rotation.z=Math.PI/2;roller.position.set(0,1.3,3.2);group.add(roller);
    if(id==='screener')for(const x of [-.7,0,.7])box(group,[.08,.6,1.7],[x,1.8,.7],yellow);
    const statusMaterial=new THREE.MeshStandardMaterial({color:0x854b22,emissive:0x000000,roughness:.5});
    box(group,[.25,.25,.1],[1.2,1.35,2.16],statusMaterial);
    const c=physics.world.createCollider(physics.RAPIER.ColliderDesc.cuboid(1.45,1.2,3.5).setTranslation(at.x,group.position.y+1.2,at.z+.8));
    const drive=box(group,[.75,.8,.8],[1.05,1.6,-1.3],yellow);
    const circuit=box(group,[1.6,.25,1.5],[0,2.7,-.65],yellow);
    colliders.push(c);plants.push({id,group,roller,drive,circuit,statusMaterial,collider:c});
  }
  const lineGeo=new THREE.BufferGeometry();
  lineGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(33*3),3));
  const lineMaterial=new THREE.LineBasicMaterial({color:0xf5b82e,transparent:true,opacity:.85});
  const boundary=new THREE.Line(lineGeo,lineMaterial);boundary.name='selected-work-area';boundary.visible=false;root.add(boundary);
  let acc=1, lastAreaId=null;
  function update(dt) {
    for(const plant of plants) {
      const owned=ownsBuilding(game.ctx,plant.id);plant.group.visible=owned;plant.collider.setEnabled(owned);
      const running=game.state.production.jobs.some(j=>j.plantId===plant.id&&j.siteId===game.state.currentSiteId);
      const status=plantStatus(game.ctx,plant.id);plant.drive.visible=status.level>0;plant.circuit.visible=status.level>1;
      plant.statusMaterial.color.setHex(status.service?0x5ca9d4:status.condition<game.data.production.maintenance.minimumCondition?0xc94832:running?0x7cac57:0x854b22);plant.statusMaterial.emissive.setHex(running?0x243a0f:0x000000);
      if(running)plant.roller.rotation.x+=dt*3;
    }
    const area=activeWorkArea(game.ctx);
    acc+=dt;if(acc<.3 && (area?.id??null)===lastAreaId)return;acc=0;lastAreaId=area?.id??null;
    boundary.visible=!!area;
    if(!area)return;
    const corners=[[area.x0,area.z0],[area.x1,area.z0],[area.x1,area.z1],[area.x0,area.z1],[area.x0,area.z0]];
    const attr=lineGeo.attributes.position;
    for(let side=0;side<4;side++)for(let step=0;step<8;step++) {
      const t=step/8, x=corners[side][0]+(corners[side+1][0]-corners[side][0])*t;
      const z=corners[side][1]+(corners[side+1][1]-corners[side][1])*t;
      attr.setXYZ(side*8+step,x,heightAt(x,z)+.12,z);
    }
    attr.setXYZ(32,area.x0,heightAt(area.x0,area.z0)+.12,area.z0);
    attr.needsUpdate=true;lineGeo.computeBoundingSphere();
  }
  update(0);
  return {update,destroy(){
    for(const c of colliders)physics.world.removeCollider(c,true);
    for(const geo of geometry)geo.dispose();
    for(const plant of plants)plant.statusMaterial.dispose();
    steel.dispose();rubber.dispose();yellow.dispose();lineGeo.dispose();lineMaterial.dispose();scene.remove(root);
  }};
}
