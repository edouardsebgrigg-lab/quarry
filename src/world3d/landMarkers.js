// Field corner stakes and sale/ownership boards; no resource or money changes here.
import * as THREE from 'three';
import { landParcels } from '../quarry/land.js';

export function createLandMarkers({scene,physics,game,heightAt}) {
  const root=new THREE.Group();root.name='neighbouring-fields';scene.add(root);
  const wood=new THREE.MeshStandardMaterial({color:0x796044,roughness:.95});
  const geometry=[],materials=[wood],textures=[],colliders=[],boards=[];
  const box=(parent,size,at,material)=>{
    const geo=new THREE.BoxGeometry(...size);geometry.push(geo);
    const m=new THREE.Mesh(geo,material);m.position.set(...at);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  };
  for(const p of landParcels(game.ctx)) {
    const posts=new THREE.Group();posts.name=`parcel-${p.id}`;root.add(posts);
    const cap=new THREE.MeshStandardMaterial({color:0xe8e1c7,roughness:.8});materials.push(cap);
    for(const [x,z] of [[p.x0,p.z0],[p.x1,p.z0],[p.x1,p.z1],[p.x0,p.z1]]) {
      const y=heightAt(x,z);
      box(posts,[.13,1.05,.13],[x,y+.525,z],wood);box(posts,[.145,.18,.145],[x,y+1.0,z],cap);
    }
    const {x,z,yaw}=p.sign,y=heightAt(x,z);
    const sign=new THREE.Group();sign.name=`land-board-${p.id}`;sign.position.set(x,y,z);sign.rotation.y=yaw;posts.add(sign);
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=384;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;textures.push(texture);
    const face=new THREE.MeshStandardMaterial({map:texture,roughness:.9,side:THREE.DoubleSide});materials.push(face);
    box(sign,[3.2,1.55,.09],[0,2.0,0],wood);
    const faceGeo=new THREE.PlaneGeometry(3.1,1.45);geometry.push(faceGeo);
    const front=new THREE.Mesh(faceGeo,face);front.position.set(0,2,.052);sign.add(front);
    const back=front.clone();back.position.z=-.052;back.rotation.y=Math.PI;sign.add(back);
    for(const dx of [-1.15,1.15]) {
      box(sign,[.15,2.8,.15],[dx,1.4,0],wood);
      colliders.push(physics.world.createCollider(physics.RAPIER.ColliderDesc.cuboid(.13,1.4,.13)
        .setTranslation(x+Math.cos(yaw)*dx,y+1.4,z-Math.sin(yaw)*dx)));
    }
    boards.push({id:p.id,name:p.name,price:p.price,canvas,texture,cap});
  }
  function refresh() {
    for(const b of boards) {
      const owned=game.state.land.owned[b.id]===true,c=b.canvas.getContext('2d');
      c.fillStyle=owned?'#253e31':'#eee5cc';c.fillRect(0,0,768,384);
      c.strokeStyle=owned?'#d7cb97':'#344c38';c.lineWidth=8;c.strokeRect(18,18,732,348);
      c.fillStyle=owned?'#f4ead1':'#243d2d';c.textAlign='center';
      c.font='bold 58px sans-serif';c.fillText(b.name,384,110,680);
      c.font='bold 45px sans-serif';c.fillText(owned?'QUARRY LAND':`FOR SALE · $${b.price.toLocaleString('en-US')}`,384,198,680);
      c.font='27px sans-serif';c.fillText(owned?game.actions.companyName():'Office laptop → Quarry operations → Land',384,280,680);
      b.texture.needsUpdate=true;b.cap.color.setHex(owned?0xe5b448:0xe8e1c7);
    }
  }
  const off=game.events.on('landPurchased',refresh);refresh();
  return {destroy(){off();root.removeFromParent();geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());colliders.forEach(c=>physics.world.removeCollider(c,true));}};
}
