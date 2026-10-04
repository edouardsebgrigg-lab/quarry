// Contractor rig and terrain-following cut/clearance markers. Display only.
import * as THREE from 'three';
import { activeBlast } from '../blasting/index.js';

export function createBlastSite({scene,physics,game,heightAt}) {
  const root=new THREE.Group();root.name='blast-site';scene.add(root);
  const geometries=[],materials=[];
  const material=color=>{const m=new THREE.MeshStandardMaterial({color,roughness:.8});materials.push(m);return m;};
  const yellow=material(0xe5b73c),steel=material(0x40585c),dark=material(0x282d30),flag=material(0xef6a39);
  const box=(parent,size,at,mat)=>{
    const geo=new THREE.BoxGeometry(...size);geometries.push(geo);const m=new THREE.Mesh(geo,mat);
    m.position.set(...at);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  };
  const rod=(parent,a,b,radius,mat)=>{
    const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),direction=to.clone().sub(from);
    const geo=new THREE.CylinderGeometry(radius,radius,direction.length(),10);geometries.push(geo);
    const mesh=new THREE.Mesh(geo,mat);mesh.position.copy(from.add(to).multiplyScalar(.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());mesh.castShadow=true;parent.add(mesh);return mesh;
  };
  const rig=new THREE.Group();rig.name='blast-drill-rig';root.add(rig);
  for(const x of [-.52,.52]) {
    box(rig,[.35,.3,1.7],[x,.28,0],dark);
    for(const z of [-.62,-.2,.2,.62])rod(rig,[x-.2,.3,z],[x+.2,.3,z],.18,steel);
    for(let i=0;i<12;i++)for(const y of [.11,.46])box(rig,[.39,.05,.085],[x,y,-.76+i*.138],dark);
  }
  box(rig,[.96,.56,1.2],[0,.8,.18],yellow);box(rig,[.85,.12,.6],[0,1.13,.4],steel);
  // Engine vents, controls, rails and a feed mast give the crew's small crawler a clear silhouette.
  for(const x of [-.489,.489])for(let i=0;i<6;i++)box(rig,[.025,.29,.025],[x,.82,.04+i*.09],dark);
  box(rig,[.6,.15,.25],[0,1.14,-.25],dark);
  for(const x of [-.16,0,.16])rod(rig,[x,1.17,-.28],[x,1.34,-.23],.022,steel);
  for(const x of [-.42,.42]) {
    rod(rig,[x,1.08,.05],[x,1.43,.05],.025,steel);
    rod(rig,[x,1.43,.05],[x,1.43,.65],.025,steel);
    rod(rig,[x,1.43,.65],[x,1.08,.65],.025,steel);
    rod(rig,[x,.85,.15],[x*.38,2.55,-.65],.038,steel);
  }
  for(const x of [-.16,.16])box(rig,[.07,2.9,.13],[x,1.6,-.65],steel);
  for(let i=0;i<7;i++)box(rig,[.36,.035,.08],[0,.3+i*.42,-.69],yellow);
  box(rig,[.44,.12,.24],[0,2.98,-.65],yellow);
  const head=box(rig,[.38,.35,.3],[0,2.1,-.55],yellow);
  const bit=rod(rig,[0,.14,-.55],[0,1.65,-.55],.042,dark);
  rod(rig,[.36,1.16,.56],[.36,1.5,.56],.04,dark);
  const beaconGeo=new THREE.CylinderGeometry(.065,.065,.1,10);geometries.push(beaconGeo);
  const beacon=new THREE.Mesh(beaconGeo,flag);beacon.position.set(-.32,1.24,.6);rig.add(beacon);
  const collider=physics.world.createCollider(physics.RAPIER.ColliderDesc.cuboid(.8,1.55,1).setTranslation(0,-100,0));collider.setEnabled(false);
  const stakes=[];
  for(let i=0;i<8;i++) {
    const pole=new THREE.Group();root.add(pole);
    box(pole,[.05,1.15,.05],[0,.57,0],steel);box(pole,[.4,.27,.035],[.18,1,0],flag);stakes.push(pole);
  }
  const rings=[0,1].map(i=>{
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(129*3),3));geometries.push(geo);
    const mat=new THREE.LineBasicMaterial({color:i?0xef8f43:0xf5d564,transparent:true,opacity:.95});materials.push(mat);
    const line=new THREE.Line(geo,mat);line.name=i?'blast-clearance':'blast-cut';root.add(line);return line;
  });
  const holes=[];
  for(let z=-1;z<=1;z++)for(let x=-1;x<=1;x++) {
    const geo=new THREE.CylinderGeometry(.12,.12,.055,8);geometries.push(geo);
    const m=new THREE.Mesh(geo,yellow);root.add(m);holes.push({mesh:m,x,z});
  }
  let preview=null,time=0,lastKey='';
  function update(dt) {
    time+=dt;const p=activeBlast(game.ctx),spec=p?.spec??preview;
    root.visible=!!spec;if(!spec){collider.setEnabled(false);return;}
    const ready=p?.stage==='ready'||p?.stage==='countdown';
    const radius=p?.clearance??spec.radius+game.data.blasting.clearance;
    const key=JSON.stringify([p?.id,p?.stage,spec,Math.floor(time*3)]);
    if(key!==lastKey) {
      lastKey=key;
      rings.forEach((ring,j)=>{
        const r=j?radius:spec.radius,attr=ring.geometry.attributes.position;
        for(let i=0;i<=128;i++){const a=i/128*Math.PI*2,x=spec.x+Math.cos(a)*r,z=spec.z+Math.sin(a)*r;attr.setXYZ(i,x,heightAt(x,z)+.12,z);}
        attr.needsUpdate=true;ring.geometry.computeBoundingSphere();
        ring.material.color.setHex(!p?0x73c8e4:ready?0xf05c35:j?0xf09e42:0xf5d564);
      });
      stakes.forEach((m,i)=>{const a=i/8*Math.PI*2,x=spec.x+Math.cos(a)*radius,z=spec.z+Math.sin(a)*radius;m.position.set(x,heightAt(x,z),z);m.rotation.y=-a;});
      holes.forEach(({mesh,x,z})=>{const px=spec.x+x*spec.radius*.5,pz=spec.z+z*spec.radius*.5;mesh.visible=!!p;mesh.position.set(px,heightAt(px,pz)+.04,pz);});
    }
    const working=p&&(p.stage==='drilling'||p.stage==='charging');rig.visible=!!working;collider.setEnabled(!!working);
    if(working) {
      const progress=Math.max(0,Math.min(1,1-p.remainingHours/p.hours));
      const at=holes[Math.min(holes.length-1,Math.floor(progress*holes.length))].mesh.position;
      rig.position.set(at.x,heightAt(at.x,at.z+.65),at.z+.65);
      collider.setTranslation({x:rig.position.x,y:rig.position.y+1.55,z:rig.position.z});
      head.position.y=p.stage==='drilling'?1.65+Math.sin(time*15)*.06:2.1;bit.rotation.y+=dt*15;
    }
    rings[1].material.opacity=p?.stage==='countdown' ? .55+Math.sin(time*8)*.35 : .95;
  }
  update(0);
  return {update,setPreview(spec){preview=spec;lastKey='';update(0);},destroy(){
    physics.world.removeCollider(collider,true);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());scene.remove(root);
  }};
}
