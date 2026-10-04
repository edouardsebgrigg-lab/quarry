import * as THREE from 'three';
import { inRect } from './map.js';

// Compact roadside businesses, with working scales and clearly marked unloading pads.
export function createRegionalYards({scene,physics,map,data,heightAt}) {
  const root=new THREE.Group();root.name='regional-businesses';scene.add(root);
  const geometry=[],materials=[],textures=[],colliders=[];
  const material=color=>{const m=new THREE.MeshStandardMaterial({color,roughness:.85});materials.push(m);return m;};
  const wall=material(0x8b9991),roof=material(0x354943),yellow=material(0xe0b854),green=material(0x55713c),earth=material(0x695442);
  const add=(g,geo,mat,x,y,z,solid=false)=>{
    geometry.push(geo);const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);
    if(solid){geo.computeBoundingBox();const size=new THREE.Vector3();geo.boundingBox.getSize(size);colliders.push(physics.world.createCollider(physics.RAPIER.ColliderDesc.cuboid(size.x/2,size.y/2,size.z/2).setTranslation(x,y,z)));}
    return m;
  };
  const box=(g,x,y,z,w,h,d,mat,solid=false)=>add(g,new THREE.BoxGeometry(w,h,d),mat,x,y,z,solid);
  const label=(g,text,x,y,z,width)=>{
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;
    const c=canvas.getContext('2d');c.fillStyle='#20352c';c.fillRect(0,0,1024,128);c.fillStyle='#f2cf79';c.font='bold 52px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,512,64,980);
    const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;textures.push(t);
    const mat=new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide});materials.push(mat);
    return add(g,new THREE.PlaneGeometry(width,width/8),mat,x,y,z);
  };
  for(const [id,b] of Object.entries(map.buyers)) {
    const g=new THREE.Group();g.name=`buyer-${id}`;root.add(g);const r=b.yard;
    const x=r.x0+7,z=r.z0+8,y=heightAt(x,z);
    box(g,x,y+1.6,z,9,3.2,7,wall,true);box(g,x,y+3.3,z,9.7,.25,7.7,roof);
    box(g,x+2,y+1.3,z+3.55,2,2.6,.12,roof);
    label(g,data.trade.buyers[id].name,x,y+4.3,z+3.7,13);
    const wb=b.bridge,cx=(wb.x0+wb.x1)/2,cz=(wb.z0+wb.z1)/2;
    box(g,cx,heightAt(cx,cz)+.025,cz,wb.x1-wb.x0,.05,wb.z1-wb.z0,wall);
    for(const zz of [wb.z0,wb.z1])box(g,cx,heightAt(cx,zz)+.06,zz,wb.x1-wb.x0,.07,.25,yellow);
    const alongX=wb.x1-wb.x0>wb.z1-wb.z0;
    const sx=alongX?wb.x0+2:wb.x0-3,sz=alongX?wb.z1+3:wb.z1-2,sy=heightAt(sx,sz);
    const scaleSign=label(g,'WEIGHBRIDGE · STOP',sx,sy+1.9,sz,5);
    if(alongX)scaleSign.rotation.y=-Math.PI/2;
    box(g,sx,sy+.9,sz,.12,1.8,.12,roof);
    const pad=b.bay;
    for(const xx of [pad.x0,pad.x1])box(g,xx,heightAt(xx,(pad.z0+pad.z1)/2)+.05,(pad.z0+pad.z1)/2,.2,.08,pad.z1-pad.z0,yellow);
    for(const zz of [pad.z0,pad.z1])box(g,(pad.x0+pad.x1)/2,heightAt((pad.x0+pad.x1)/2,zz)+.05,zz,pad.x1-pad.x0,.08,.2,yellow);
    const signX=(pad.x0+pad.x1)/2,signY=heightAt(signX,pad.z0);
    label(g,'DELIVER HERE · T',signX,signY+2.2,pad.z0,9);
    for(const postX of [signX-4,signX+4])box(g,postX,signY+1,pad.z0,.12,2,.12,roof);
    for(let i=0;i<3;i++) {
      const px=r.x1-3,pz=r.z0+8+i*13,py=heightAt(px,pz);
      if(id==='concrete')add(g,new THREE.CylinderGeometry(2.4,2.4,8,12),wall,px,py+4,pz,true);
      else if(id==='nursery') {box(g,px,py+.4,pz,5,.8,7,earth,true);for(let j=0;j<3;j++)add(g,new THREE.IcosahedronGeometry(1,0),green,px,py+1.3,pz-2+j*2);}
      else add(g,new THREE.ConeGeometry(3,2.5,8),i===0?earth:wall,px,py+1.25,pz,true);
    }
  }
  return {bayAt:(x,z)=>Object.entries(map.buyers).find(([,b])=>inRect(b.bay,x,z))?.[0]??null,
    onWeighbridge:(x,z)=>Object.values(map.buyers).some(b=>inRect(b.bridge,x,z)),
    destroy(){for(const c of colliders)physics.world.removeCollider(c,true);for(const x of geometry)x.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();scene.remove(root);}};
}
