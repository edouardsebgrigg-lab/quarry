// Shared rigs, model-specific bodywork. Variants add structure rather than duplicating GLBs.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import machines from '../../data/machines.json';
import { materialRole } from './weathering.js';

export function variantStats(family, tier, supplied = null) {
  return supplied ?? machines.types[family]?.tiers[tier] ?? {};
}
const palette = [0xc07837, 0xe9b92b, 0x42a68c, 0xec8a32, 0xc6a927, 0x326caa, 0xd3d6cb, 0xd3573c];
const neutralMaps = new WeakMap();
// The approved GLB paint atlases contain coloured paint and dark worn edges. Keep their
// surface detail while removing the source paint hue before applying each model's livery.
function neutralPaintMap(texture) {
  if (!texture?.image || typeof document === 'undefined') return texture;
  if (neutralMaps.has(texture)) return neutralMaps.get(texture);
  const source = texture.image;
  const canvas = document.createElement('canvas');
  canvas.width = source.width; canvas.height = source.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < image.data.length; i += 4) {
    const shade = Math.max(image.data[i], image.data[i + 1], image.data[i + 2]);
    image.data[i] = image.data[i + 1] = image.data[i + 2] = shade;
  }
  ctx.putImageData(image, 0, 0);
  const copy = texture.clone(); copy.image = canvas; copy.needsUpdate = true;
  neutralMaps.set(texture, copy);
  return copy;
}
function box(parent, size, position, material) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(...size, 2, Math.min(...size) * .12), material);
  mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
  return mesh;
}

export function dressVariant(root, spec, family) {
  if (spec.visualVariant === undefined) return;
  const variant = spec.visualVariant;
  const color = spec.paintColor ?? palette[variant % palette.length];
  root.traverse(o => {
    if (!o.isMesh || !o.material) return;
    let repaint = false;
    const update = material => {
      const copy = material.clone();
      copy.onBeforeCompile = material.onBeforeCompile;
      copy.customProgramCacheKey = material.customProgramCacheKey;
      if (materialRole(copy.name)?.role === 'body') {
        repaint = true;
        copy.color.setHex(color); copy.map = neutralPaintMap(copy.map);
      }
      return copy;
    };
    o.material = Array.isArray(o.material) ? o.material.map(update) : update(o.material);
    if (repaint && o.geometry.getAttribute('color')) {
      o.geometry = o.geometry.clone();
      const colors = o.geometry.getAttribute('color');
      for (let i = 0; i < colors.count; i++) {
        const shade = Math.max(colors.getX(i), colors.getY(i), colors.getZ(i));
        colors.setXYZ(i, shade, shade, shade);
      }
      colors.needsUpdate = true;
    }
  });
  const body = new THREE.MeshStandardMaterial({ color, roughness: .7, metalness: .2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x242c2c, roughness: .85 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x6a7372, roughness: .65, metalness: .6 });
  const cabGlass = new THREE.MeshStandardMaterial({color:0x506775,transparent:true,opacity:.24,roughness:.12,metalness:.08,side:THREE.DoubleSide});
  const extras = new THREE.Group(); extras.name = `Bodywork_${spec.modelId}`;
  if (family === 'miniDigger' || family === 'excavator') {
    const house = root.getObjectByName('House') ?? root;
    house.add(extras);
    const mini = family === 'miniDigger';
    const unit = mini ? .46 : 1;
    // Each size class has a different rear housing and safety equipment footprint.
    box(extras, [(.9 + variant * .12)*unit, .65*unit, 2.2*unit], [-1.25*unit, .55*unit, 0], body);
    if (variant === 0) {
      // Micro's open rollover hoop replaces the larger family canopy.
      const canopy = root.getObjectByName('Canopy');
      if (canopy) canopy.visible = false;
      for (const z of [-.42,.42]) box(extras, [.06,1.5,.06], [-.35,.95,z], dark);
      box(extras,[.06,.06,.9],[-.35,1.7,0],dark);
    } else if (variant === 1) {
      box(extras,[.5,.035,.06],[-.46,1.2,0],steel); // rear canopy brace
    } else if (variant === 2 || variant === 3) {
      for(const z of [-.435,.435]) {
        box(extras,[.74,.9,.018],[-.10,1.24,z],cabGlass);
        box(extras,[.74,.29,.032],[-.10,.66,z],body);
        if(variant===3) box(extras,[.12,.035,.035],[-.31,.94,z],dark);
      }
      box(extras,[.018,.92,.82],[.29,1.24,0],cabGlass);
      box(extras,[.018,.92,.82],[-.51,1.24,0],cabGlass);
    } else {
      // Production equipment gains engine vents, access steps and protective cab bars.
      for (let i=0;i<variant-1;i++) box(extras,[.08,.52,.08],[-1.9+i*.16,.8,1.13],dark);
      for (let i=0;i<3;i++) box(extras,[.8,.08,.28],[-.2-i*.14,.15+i*.17,-1.25],steel);
      if (variant >= 6) for (let i=0;i<4;i++) box(extras,[.06,1.4,.06],[1.15,1.35,-1.05+i*.22],steel);
      if (variant === 7) box(extras,[1.1,.6,2.6],[-2.05,.6,0],body);
    }
  } else if (family === 'tractor') {
    root.add(extras);
        // The source rig already has a roof. Keep its height and alter its panels instead of
    // stacking a second canopy through the operator's head.
    if (variant > 0) {
      box(extras,[.30,.26,.74],[1.76,.69,0],dark);
      for(let i=0;i<3;i++) box(extras,[.035,.24,.76],[1.62+i*.1,.69,0],steel);
      if (variant >= 2) for (const z of [-.5,.5]) {
        box(extras,[.48,.07,.25],[-.55,.62,z],steel);
        box(extras,[.32,.07,.25],[-.4,.45,z],steel);
      }
      if (variant >= 3) {
        for (const z of [-.76,.76]) box(extras,[.55,.05,.3],[-.85,1.46,z],body);
        for (const z of [-.505,.505]) {
          box(extras,[1.16,.98,.018],[-.59,1.79,z],cabGlass);
          box(extras,[1.16,.22,.03],[-.59,1.18,z],body);
        }
        for(const x of [-1.205,.025]) box(extras,[.018,.98,.96],[x,1.79,0],cabGlass);
      }
      if (variant === 4) box(extras,[.38,.36,.88],[1.87,.67,0],steel);
    }
  } else if (family === 'pickup') {
    root.add(extras);
    box(extras,[.14,.34,1.98],[2.78,.66,0],dark);
    for(const z of [-.66,.66]) box(extras,[.055,.6,.055],[2.83,1.0,z],steel);
    box(extras,[.055,.055,1.38],[2.83,1.3,0],steel);
    for(const z of [-.68,.68]) box(extras,[1.12,.08,.055],[.1,1.93,z],dark);
    for(const x of [-.4,.55]) box(extras,[.06,.08,1.4],[x,1.95,0],steel);
    for(const z of [-.92,.92]) box(extras,[1.42,.1,.18],[0,.54,z],dark);
    box(extras,[.52,.22,1.6],[-1.7,1.1,0],dark);
  } else if (family === 'trailer') {
    const bedPivot = root.getObjectByName('BedPivot');
    const bed = root.getObjectByName('Bed');
    const gate = root.getObjectByName('TailgatePivot');
    if (bedPivot && bed && gate) {
      root.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(bed);
      const rim = gate.getWorldPosition(new THREE.Vector3()).y;
      const extensionHeight = [0,.12,.26,.42,.62][variant] ?? .2;
      // All extension parts use the actual bed bounds and are children of its hinge.
      bedPivot.add(extras);
      function bedPart(size, worldPosition, material) {
        const p = bedPivot.worldToLocal(new THREE.Vector3(...worldPosition));
        return box(extras,size,p.toArray(),material);
      }
      if(extensionHeight > 0) {
        const length = bounds.max.x - bounds.min.x - .05;
        const centreX = (bounds.min.x + bounds.max.x) / 2;
        const width = bounds.max.z - bounds.min.z - .03;
        for(const side of [-1,1]) {
          const z = side * width/2;
          bedPart([length,extensionHeight,.045],[centreX,rim+extensionHeight/2,z],body);
          bedPart([length,.055,.055],[centreX,rim+extensionHeight,z],steel);
          for(let i=0;i<5;i++) bedPart([.055,extensionHeight,.07],
            [bounds.min.x+.15+i*(length-.25)/4,rim+extensionHeight/2,z],body);
        }
        if(extensionHeight>.25)bedPart([.045,extensionHeight-.25,width],
          [bounds.max.x-.04,rim+.25+(extensionHeight-.25)/2,0],body);
        const gateMesh=root.getObjectByName('Tailgate');
        if(gateMesh){gate.position.y+=extensionHeight;gateMesh.scale.y*=1+extensionHeight/.6;}
      }
      // Mudguards belong to the stationary chassis, immediately above the tyre crowns.
      if(variant >= 2) for(const z of [-1.03,1.03]) box(root,[2.2,.065,.36],[0,.94,z],dark);
    }
  }
  root.scale.setScalar(spec.modelScale ?? 1);
  root.userData.modelId = spec.modelId;
}

// Four unique mobility bodies share the four-wheel physics interface.
export function buildMobilityModel(type, rideHeight, shape) {
  const root = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: type === 'quad' ? 0xa6472e : type === 'buggy' ? 0x627843 : 0xe0dfd1, roughness: .62, metalness:.15 });
  const black = new THREE.MeshStandardMaterial({ color: 0x20272c, roughness: .84 });
  const rubber = new THREE.MeshStandardMaterial({color:0x18191a,roughness:.96});
  const steel = new THREE.MeshStandardMaterial({color:0x909a9c,roughness:.52,metalness:.65});
  const glass = new THREE.MeshStandardMaterial({ color:0x405d68,transparent:true,opacity:.3,roughness:.12,metalness:.1,side:THREE.DoubleSide });
  const lamp = new THREE.MeshStandardMaterial({color:0xf1e8cf,emissive:0x8b8366,emissiveIntensity:.15,roughness:.25});
  const red = new THREE.MeshStandardMaterial({color:0x872a21,emissive:0x5f160f,emissiveIntensity:.15,roughness:.3});
  const y=value=>value-rideHeight;
  const quad=type==='quad',buggy=type==='buggy';
  const L=shape.halfLength,W=shape.halfWidth;
  function cylinder(parent,radius,length,position,mat,axis='z',segments=24) {
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,segments),mat);
    if(axis==='z')mesh.rotation.x=Math.PI/2;
    else if(axis==='x')mesh.rotation.z=Math.PI/2;
    mesh.position.set(...position);mesh.castShadow=true;parent.add(mesh);return mesh;
  }
  function tube(parent,a,b,radius,mat) {
    const aa=new THREE.Vector3(...a),bb=new THREE.Vector3(...b),direction=bb.clone().sub(aa);
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,direction.length(),12),mat);
    mesh.position.copy(aa.add(bb).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
    mesh.castShadow=true;parent.add(mesh);return mesh;
  }
  box(root,[L*1.8,.14,W*1.7],[0,y(quad?.46:.58),0],black);
  if(quad) {
    box(root,[1.15,.28,.72],[0,y(.69),0],paint);
    box(root,[.75,.18,.38],[-.08,y(.94),0],black);
    box(root,[.3,.4,.45],[.32,y(.91),0],paint);
    tube(root,[.37,y(.95),0],[.48,y(1.2),0],.025,steel);
    tube(root,[.48,y(1.2),-.33],[.48,y(1.2),.33],.022,black);
    for(const x of [-.67,.67]) {
      box(root,[.62,.13,1.05],[x,y(.78),0],paint);
      for(const z of [-.48,.48]) box(root,[.68,.09,.21],[x,y(.82),z],black);
      for(const z of [-.36,.36]) tube(root,[x-.21,y(.92),z],[x+.2,y(.92),z],.017,steel);
      tube(root,[x,y(.35),-.48],[x,y(.35),.48],.022,steel);
    }
    for(const z of [-.23,.23]) box(root,[.04,.12,.17],[.94,y(.75),z],lamp);
    for(const z of [-.36,.36]) box(root,[.05,.1,.12],[-.95,y(.7),z],red);
    tube(root,[.99,y(.51),-.37],[.99,y(.51),.37],.035,black);
  } else if(buggy) {
    box(root,[1.4,.12,1.13],[.25,y(.71),0],paint);
    box(root,[.66,.28,1.18],[1.02,y(.8),0],paint); // short rounded bonnet
    box(root,[.88,.1,1.17],[-.91,y(.7),0],paint);
    for(const z of [-.59,.59]) box(root,[.88,.28,.065],[-.91,y(.86),z],paint);
    box(root,[.08,.28,1.16],[-1.38,y(.86),0],paint);
    for(const z of [-.3,.3]) {
      box(root,[.46,.16,.38],[.1,y(.9),z],black);
      const back=box(root,[.12,.54,.38],[-.15,y(1.22),z],black);back.rotation.z=-.12;
      tube(root,[.75,y(.95),z],[.53,y(1.23),z],.022,black);
    }
    // Open rollover cage; a single framed windshield rather than a solid glass cabin.
    for(const z of [-.62,.62]) {
      tube(root,[.9,y(.76),z],[.65,y(1.85),z],.035,black);
      tube(root,[-.42,y(.76),z],[-.42,y(1.85),z],.035,black);
      tube(root,[-.42,y(1.85),z],[.65,y(1.85),z],.035,black);
    }
    box(root,[1.25,.07,1.35],[.08,y(1.88),0],paint);
    const windshield=box(root,[.025,.64,1.15],[.74,y(1.44),0],glass);windshield.rotation.z=.2;
    for(const z of [-.48,.48]) box(root,[.035,.14,.23],[1.39,y(.88),z],lamp);
    for(const z of [-.55,.55]) box(root,[.04,.12,.15],[-1.44,y(.9),z],red);
    tube(root,[1.49,y(.57),-.65],[1.49,y(.57),.65],.045,black);
  } else {
    // Service van: rounded metal body, distinct bonnet/cab and discrete window panels.
    box(root,[L*1.12,1.78,W*1.72],[-L*.38,y(1.53),0],paint);
    box(root,[L*.68,1.22,W*1.67],[L*.43,y(1.37),0],paint);
    box(root,[L*.58,.35,W*1.68],[L*.69,y(.93),0],paint);
    box(root,[L*.66,.1,W*1.72],[L*.4,y(2.02),0],paint);
    const front=box(root,[.032,.66,W*1.43],[L*.75,y(1.61),0],glass);front.rotation.z=-.15;
    for(const z of [-W*.85,W*.85]) {
      box(root,[L*.48,.62,.028],[L*.39,y(1.64),z],glass);
      box(root,[L*.56,.035,.035],[L*.4,y(1.28),z],black);
      box(root,[.2,.04,.045],[L*.12,y(1.15),z],black);
      box(root,[L*.86,.12,.055],[-L*.42,y(.8),z],black);
      box(root,[.18,.3,.04],[L*.74,y(1.53),z*1.1],black);
    }
    // Rear service-door seams, reflectors, plate and practical roof rack.
    for(const z of [-W*.72,0,W*.72]) box(root,[.03,1.3,.025],[-L*.97,y(1.52),z],black);
    box(root,[L*1.05,.055,W*1.15],[-L*.35,y(2.48),0],steel);
    for(const z of [-W*.53,W*.53]) box(root,[L,.06,.045],[-L*.35,y(2.55),z],black);
    for(const z of [-W*.68,W*.68]) {
      box(root,[.035,.2,.28],[L*.99,y(1.06),z],lamp);
      box(root,[.035,.36,.13],[-L*.99,y(1.05),z],red);
    }
    box(root,[.09,.18,W*1.79],[L*1.01,y(.67),0],black);
    box(root,[.09,.18,W*1.79],[-L*1.01,y(.67),0],black);
    box(root,[.04,.22,W*.82],[L*1.01,y(.88),0],black);
    for(let i=0;i<5;i++)box(root,[.047,.018,W*.74],[L*1.03,y(.80+i*.036),0],steel);
  }
  const wheels=[];
  for(let i=0;i<4;i++) {
    const steerGroup=new THREE.Group();root.add(steerGroup);
    const spin=new THREE.Group();steerGroup.add(spin);
    const radius=shape.wheelRadii?.[i]??shape.wheelRadius;
    const side=shape.wheelZ[i]>0?1:-1, width=quad?.24:.27;
    cylinder(spin,radius,width,[0,0,0],rubber);
    cylinder(spin,radius*.62,.035,[0,0,side*(width/2+.012)],steel);
    cylinder(spin,radius*.20,.06,[0,0,side*(width/2+.03)],black);
    for(let k=0;k<6;k++) {
      const a=k*Math.PI/3;
      cylinder(spin,.016,.05,[Math.cos(a)*radius*.32,Math.sin(a)*radius*.32,side*(width/2+.03)],steel,'z',6);
    }
    for(let k=0;k<20;k++) {
      const a=k*Math.PI/10;
      const tread=box(spin,[radius*.16,.035,width*.85],[Math.cos(a)*(radius-.006),Math.sin(a)*(radius-.006),0],black);
      tread.rotation.z=a-Math.PI/2;
    }
    steerGroup.position.set(shape.wheelX[i],radius-rideHeight,shape.wheelZ[i]);
    wheels.push({steerGroup,spin});
    if(!quad) {
      const fender=box(root,[radius*2.25,.085,width*1.35],[shape.wheelX[i],y(radius*2+.08),shape.wheelZ[i]],paint);
      fender.rotation.z=i<2?-.04:.04;
    }
  }
  const heap=new THREE.Mesh(new RoundedBoxGeometry(L*.5,.2,W*1.3,2,.05),new THREE.MeshStandardMaterial({color:0x8b7662}));
  heap.position.set(-L*.56,y(.83),0);root.add(heap);heap.visible=false;
  return {root,wheels,wheelOffsetY:0,cabSeat:new THREE.Vector3(quad?-.1:buggy?.1:L*.42,y(quad?1.3:1.63),-.2),
    bedCenter:new THREE.Vector3(-L*.56,y(.8),0),bedHalf:{x:L*.3,z:W*.75},bedFloorY:y(.73),
    tailgateLocal:new THREE.Vector3(-L*.95,y(.83),0),exhaustLocal:new THREE.Vector3(-L,y(.35),.4),
    setLoad(fill,color){heap.visible=fill>.01;heap.scale.y=Math.max(.1,fill);if(color)heap.material.color.copy(color);},setFirstPerson(){}};
}

export function upgradePickupModel(model) {
  if(model) dressVariant(model.root.children[0],{modelId:'fourByFour',modelScale:1,visualVariant:3,paintColor:0x315d7b},'pickup');
  return model;
}
