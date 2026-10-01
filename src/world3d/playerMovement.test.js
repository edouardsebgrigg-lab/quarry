import { describe,it,expect } from 'vitest';
import { createPlayerMovement } from './playerMovement.js';
const input=(overrides={})=>({forward:0,right:0,sprint:false,jump:false,maxSpeed:null,moveYaw:null,...overrides});
function floorTick(m,dt,i,pose={y:0}){
  const desired=m.step(dt,i),next=pose.y+desired.y;
  const move={...desired,y:next<0?-pose.y:desired.y};
  pose.y=Math.max(0,next);m.resolve(dt,move,pose.y===0,desired);return desired;
}
function grounded(){const m=createPlayerMovement();m.resolve(1/60,{x:0,y:0,z:0},true);return m;}

describe('responsive character movement',()=>{
  it('ramps into walking, normalizes diagonals, and stops promptly without sliding',()=>{
    const m=grounded();floorTick(m,1/60,input({forward:1,right:1}));expect(m.state.speed).toBeGreaterThan(0);expect(m.state.speed).toBeLessThan(1);
    for(let i=0;i<30;i++)floorTick(m,1/60,input({forward:1,right:1}));expect(m.state.speed).toBeCloseTo(4.5,6);
    let drift=0;for(let i=0;i<10;i++){const d=floorTick(m,1/60,input());drift+=Math.hypot(d.x,d.z);}
    expect(m.state.speed).toBe(0);expect(drift).toBeLessThan(.25);
  });
  it('does not add coasting, strafing or sprinting to constrained barrow travel',()=>{
    const m=grounded();floorTick(m,1/60,input({forward:1,maxSpeed:1.7,moveYaw:Math.PI/2}));
    expect(m.state.x).toBeCloseTo(-1.7);expect(m.state.z).toBeCloseTo(0);
    const stop=floorTick(m,1/60,input({maxSpeed:1.7,jump:true,sprint:true}));expect(Math.abs(stop.x)).toBe(0);expect(Math.abs(stop.z)).toBe(0);expect(stop.jumped).toBe(false);
    expect(m.state.sprinting).toBe(false);
  });
  it('jumps once per press, with grace after a ledge and buffering before landing',()=>{
    const m=grounded(),pose={y:0};let jumps=0;
    for(let i=0;i<180;i++)jumps+=+floorTick(m,1/60,input({jump:true}),pose).jumped;
    expect(jumps).toBe(1);expect(pose.y).toBe(0);
    floorTick(m,1/60,input(),pose);expect(floorTick(m,1/60,input({jump:true}),pose).jumped).toBe(true);
    const ledge=grounded();floorTick(ledge,1/60,input());ledge.resolve(1/60,{x:0,y:0,z:0},false);
    ledge.step(.05,input());expect(ledge.step(.025,input({jump:true})).jumped).toBe(true);
    const late=grounded();floorTick(late,1/60,input());late.resolve(1/60,{x:0,y:0,z:0},false);
    for(let i=0;i<3;i++)late.step(.05,input());expect(late.step(.01,input({jump:true})).jumped).toBe(false);
    const landing=createPlayerMovement();landing.state.vy=-3;landing.state.spent=true;const nearFloor={y:.03};
    expect(floorTick(landing,1/60,input({jump:true}),nearFloor).jumped).toBe(false);
    const impact=landing.state.landingSpeed;expect(impact).toBeGreaterThan(3);
    expect(floorTick(landing,1/60,input({jump:true}),nearFloor).jumped).toBe(true);
    expect(landing.state.landingSpeed).toBe(impact);
  });
  it('stays close across frame steps and clears momentum and jump history on reset',()=>{
    const run=dt=>{const m=grounded();let distance=0;for(let t=0;t<2-1e-8;t+=dt)distance-=floorTick(m,dt,input({forward:1})).z;return distance;};
    expect(Math.abs(run(1/30)-run(1/144))).toBeLessThan(.08);
    const m=grounded();floorTick(m,.05,input({forward:1,jump:true}));m.reset(true);
    expect(m.state.speed).toBe(0);expect(m.state.vy).toBe(0);expect(m.step(0,input({jump:false}))).toEqual({x:0,y:0,z:0,jumped:false});
    m.resolve(1/60,{x:0,y:0,z:0},true);expect(m.step(1/60,input({jump:true})).jumped).toBe(false);
    expect(m.step(5,input({forward:1})).z).toBeGreaterThan(-.2);
  });
  it('loses blocked momentum and cancels ascent against a ceiling',()=>{
    const m=grounded();for(let i=0;i<30;i++)floorTick(m,1/60,input({forward:1}));
    const desired=m.step(1/60,input({forward:1,jump:true}));m.resolve(1/60,{x:0,y:0,z:0},false,desired);
    expect(m.state.speed).toBe(0);expect(m.state.vy).toBe(0);
  });
});
