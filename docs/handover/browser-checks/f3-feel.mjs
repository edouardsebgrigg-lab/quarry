// Actual keyboard routing: walking, one jump per held press, barrow stopping,
// opposing-pedal reversal, and camera-motion comfort settings.
// Run with OUT=docs/handover/screenshots/f3-feel and QUARRY_URL=http://localhost:5174.
// PLAYWRIGHT_MODULE / CHROMIUM_EXECUTABLE / CHROMIUM_ARGS use common.mjs conventions.
// Fixtures use debug placement; movement and interactions use normal key input.
import{writeFileSync}from'node:fs';
import { start } from './common.mjs';
const{browser,page,q,frames,shot,newGame,errors}=await start({width:640,height:360});
const report={checks:[],samples:{}};
const check=(passed,label)=>{report.checks.push({passed:!!passed,label});if(!passed)throw new Error(label);};
await page.addInitScript(()=>{window.__lockEl=null;Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>window.__lockEl});Element.prototype.requestPointerLock=()=>Promise.resolve();});
const sample=()=>q(()=>{const{world,game}=window.__quarry;return{feet:world.debug.feet(),eye:world.debug.eye(),fov:world.debug.camera.fov,mode:world.debug.mode(),driving:game.state.player.driving,barrow:world.debug.hands.state.held};});
try{
 await newGame();await q(()=>{const{world}=window.__quarry;world.debug.teleportPlayer(40,40,0);window.__lockEl=document.querySelector('.world-canvas');document.dispatchEvent(new Event('pointerlockchange'));});await frames(40);
 await page.keyboard.down('Space');
 const jump=await q(()=>new Promise(resolve=>{const d=window.__quarry.world.debug,base=d.feet()[1];let n=0,peaks=0,above=false,max=base;const f=()=>{const y=d.feet()[1];max=Math.max(max,y);if(y>base+.3&&!above)peaks++;above=y>base+.3;if(++n>=180)resolve({peaks,max,base,end:d.feet()[1]});else requestAnimationFrame(f);};requestAnimationFrame(f);}));
 await page.keyboard.up('Space');report.samples.jump=jump;check(jump.peaks===1&&jump.max-jump.base>.5&&Math.abs(jump.end-jump.base)<.12,'Held Space launches once and lands without bouncing');
 await q(()=>window.__quarry.world.debug.teleportPlayer(40,40,0));await frames(30);
 const start=await sample();await page.keyboard.down('KeyW');await frames(3);const early=await sample();await frames(30);const moving=await sample();await page.keyboard.up('KeyW');await frames(14);const stopped=await sample();await frames(20);const parked=await sample();
 report.samples.walk={start,early,moving,stopped,parked};check(Math.abs(early.feet[2]-start.feet[2])<.2,'Walking starts with a short acceleration ramp');check(Math.abs(moving.feet[2]-start.feet[2])>1,'Walking reaches useful travel speed');check(Math.hypot(parked.feet[0]-stopped.feet[0],parked.feet[2]-stopped.feet[2])<.01,'Released movement stops without persistent drifting');
 await q(()=>{const{world,settings}=window.__quarry;settings.cameraMotion=0;settings.fieldOfView=72;world.debug.teleportPlayer(50,50,0);});await frames(30);
 await page.keyboard.down('KeyW');await page.keyboard.down('ShiftLeft');await frames(35);const comfort=await sample();await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
 report.samples.comfort=comfort;check(Math.abs(comfort.fov-72)<.001&&Math.abs(comfort.eye[1]-comfort.feet[1]-1.65)<.001,'Camera-motion zero removes foot bob and sprint FOV');await shot('f3-comfort');
 await q(()=>window.__quarry.settings.cameraMotion=1);await page.keyboard.down('KeyW');await page.keyboard.down('ShiftLeft');await frames(40);const sprint=await sample();await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');report.samples.sprint=sprint;check(sprint.fov>75,'Comfort-enabled sprint builds gentle wider FOV');
 await q(()=>{const d=window.__quarry.world.debug;d.teleportPlayer(60,60,0);d.hands.placeBarrow(60,58.55,0);});await frames(40);await page.keyboard.press('KeyE');await frames(5);check((await sample()).barrow,'E takes the barrow through normal interact routing');
 await page.keyboard.down('KeyW');await frames(35);await page.keyboard.up('KeyW');await frames(3);const barrowStop=await sample();await frames(20);const barrowPark=await sample();report.samples.barrow={barrowStop,barrowPark};check(Math.hypot(barrowPark.feet[0]-barrowStop.feet[0],barrowPark.feet[2]-barrowStop.feet[2])<.025,'Barrow movement stops without drifting into nearby machines');await shot('f3-barrow');
 await page.keyboard.press('KeyE');await frames(3);
 const id=await q(()=>{const{game,world}=window.__quarry;game.state.money=100000;const m=game.actions.buyMachine('truck','used').machine;world.debug.placeVehicle(m.id,70,70,0);world.debug.teleportPlayer(70,65.8,0);return m.id;});await frames(60);await page.keyboard.press('KeyE');await frames(130);check((await sample()).driving===id,'E enters road vehicle');
 await page.keyboard.down('KeyW');await frames(120);await page.keyboard.up('KeyW');const forward=await q(id=>window.__quarry.world.debug.vehicle(id).feel(),id);await page.keyboard.down('KeyS');await frames(210);await page.keyboard.up('KeyS');const reverse=await q(id=>window.__quarry.world.debug.vehicle(id).feel(),id);report.samples.drive={forward,reverse};check(forward.speed>1&&reverse.speed<-.5&&reverse.gear<0,'Opposing pedal brakes then selects reverse');await shot('f3-driving');
 check(errors.length===0,'Native input and comfort pass has no browser errors');
}finally{report.errors=errors;writeFileSync(`${process.env.OUT}/f3-feel.json`,JSON.stringify(report,null,2));await browser.close();}
