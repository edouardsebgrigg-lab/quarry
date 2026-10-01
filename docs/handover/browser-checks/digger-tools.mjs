// Real Q shortcut/button routing and attachment action; setup purchases and blocked cargo are fixtures.
import {writeFile,mkdir} from 'node:fs/promises';
import {start} from './common.mjs';
const {browser,page,q,frames,newGame,errors}=await start({width:960,height:540});
page.setDefaultTimeout(20000);
const report={checks:[],screens:[],samples:[],errors,pointerLockSimulation:'Browser permission/capture is simulated: request and exit update pointerLockElement and dispatch pointerlockchange. UI clicks, keyboard routing, game actions and native screenshots are real.'};
await mkdir(process.env.OUT,{recursive:true});
await page.addInitScript(()=>{
 window.__toolLockTrace=[];
 window.__toolLockElement=null;
 Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>window.__toolLockElement});
 Element.prototype.requestPointerLock=function(){
  window.__toolLockTrace.push({request:this.className,time:performance.now()});
  window.__toolLockElement=this;
  document.dispatchEvent(new Event('pointerlockchange'));
  return Promise.resolve();
 };
 document.exitPointerLock=()=>{window.__toolLockElement=null;document.dispatchEvent(new Event('pointerlockchange'));};
 document.addEventListener('pointerlockchange',()=>window.__toolLockTrace.push({locked:!!document.pointerLockElement,time:performance.now()}));
});
const check=(label,passed,sample)=>{report.checks.push({label,passed:!!passed,sample});if(!passed)throw new Error(label);};
const open=async()=>{await page.keyboard.press('KeyQ');await page.locator('.overlay-digger-tools').waitFor();await frames(3);};
const shot=async(name)=>{await frames(4);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(350);await page.screenshot({timeout:20000});await frames(3);const sample=await page.locator('.overlay-digger-tools').evaluate(n=>{const r=n.getBoundingClientRect(),body=n.querySelector('.dt-body');return {bounds:[r.x,r.y,r.right,r.bottom],viewport:[innerWidth,innerHeight],overflow:n.scrollWidth>n.clientWidth+1||body.scrollWidth>body.clientWidth+1,text:n.textContent};});await page.screenshot({path:`${process.env.OUT}/${name}.png`,timeout:20000});report.screens.push({name,sample});check(`${name}: bounded readable tool panel`,sample.bounds[0]>=0&&sample.bounds[1]>=0&&sample.bounds[2]<=sample.viewport[0]+1&&sample.bounds[3]<=sample.viewport[1]+1&&!sample.overflow&&!/NaN|undefined/.test(sample.text),sample);};
const current=()=>q(()=>{const m=__quarry.game.state.machines.find(m=>m.id===__quarry.game.state.player.driving);return {id:m.id,attachment:m.attachment??'standard',load:{...m.load},busy:__quarry.world.hudInfo().machine.attachmentBusy};});
try{
 await newGame({force:true});
 const id=await q(()=>{const {game,world}=__quarry;game.state.flags.unlockAll=true;game.state.money=1000000;const r=game.actions.buyMachine('excavator','utility80');if(!r.ok)throw Error(r.reason);world.debug.placeVehicle(r.machine.id,40,40,0);world.debug.enterVehicle(r.machine.id);return r.machine.id;});
 await open();check('Q opens real cab tools shortcut',await page.locator('.dt-tool').count()===4);
 check('Current tool is marked Equipped',await page.locator('.dt-tool[data-attachment="standard"]').isDisabled());
 for(const [width,height,name,scale] of [[960,540,'tools-960',1],[390,650,'tools-390',1],[960,540,'tools-130-960',1.3]]){await page.setViewportSize({width,height});await q(scale=>document.documentElement.style.fontSize=`${16*scale}px`,scale);await shot(name);}
 await q(()=>document.documentElement.style.fontSize='16px');await page.setViewportSize({width:960,height:540});
 await page.locator('.dt-tool[data-attachment="trench"]').click();await page.locator('.overlay-digger-tools').waitFor({state:'detached'});await frames(6);
 check('Actual direct selection fits trenching bucket',(await current()).attachment==='trench');
 check('Successful selection keeps the same cab',(await current()).id===id);
 await page.waitForFunction(()=>__quarry.world.isMouseLocked(),null,{timeout:3000}).catch(()=>{});
 report.pointerLockTrace=await q(()=>window.__toolLockTrace);
 check('Selection requests and restores cab control under simulated browser pointer lock',await q(()=>__quarry.world.isMouseLocked()&&window.__toolLockTrace.some(entry=>entry.request==='world-canvas')));
 check('HUD shows the selected real attachment',await q(()=>__quarry.world.hudInfo().machine.attachment==='Trenching bucket'));
 // The empty arm is still moving: Q must freeze/disable choices, then restore eligibility after it settles.
 await frames(150);await page.keyboard.press('KeyG');await page.keyboard.down('ArrowDown');await frames(8);
 const moving=await current();report.samples.push({moving});check('Actual lever motion marks the tool swap busy',moving.busy);
 await open();check('Moving empty arm locks every tool',await page.locator('.dt-tool:not(:disabled)').count()===0);await shot('tools-moving-960');await page.keyboard.up('ArrowDown');await page.keyboard.press('Escape');await frames(100);
 await open();check('Stopped arm restores tool selection',await page.locator('.dt-tool[data-attachment="grading"]').isEnabled());await page.keyboard.press('Escape');
 // A partly filled bucket remains unchanged while the explanatory panel is open.
 await q(id=>__quarry.game.state.machines.find(m=>m.id===id).load={clay:.02},id);const loaded=await current();
 await open();check('Loaded bucket disables all swaps',await page.locator('.dt-tool:not(:disabled)').count()===0);check('Loaded bucket explains what to do',(await page.locator('.dt-note').textContent()).includes('Empty the bucket'));await shot('tools-loaded-960');
 check('Blocked panel preserves the bucket cargo and fitted tool',JSON.stringify((await current()).load)===JSON.stringify(loaded.load)&&(await current()).attachment===loaded.attachment);await page.keyboard.press('Escape');await q(id=>__quarry.game.state.machines.find(m=>m.id===id).load={},id);
 const rentalId=await q(()=>{const {game,world}=__quarry;world.debug.exitVehicle();const r=game.actions.rentMachine('miniDigger','micro08',1);if(!r.ok)throw Error(r.reason);world.debug.enterVehicle(r.machine.id);return r.machine.id;});
 await open();check('Actual rental disables every tool',await page.locator('.dt-tool:not(:disabled)').count()===0);check('Rental gives the original-tool explanation',(await page.locator('.dt-note').textContent()).includes('Rented equipment'));await page.setViewportSize({width:390,height:650});await shot('tools-rental-390');await page.keyboard.press('Escape');
 await q(id=>{__quarry.world.debug.exitVehicle();__quarry.world.debug.enterVehicle(id);},id);await page.setViewportSize({width:960,height:540});
 // Real pause/save/Continue UI preserves the selected attachment and restored machine model.
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Save Game',exact:true}).click();await page.locator('.btn-slot').filter({hasText:'Slot 1'}).click();
 await page.reload();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.waitForFunction(()=>window.__quarry?.world,null,{timeout:20000});
 check('Save and Continue preserve the fitted tool',await q(id=>__quarry.game.state.machines.find(m=>m.id===id).attachment==='trench',id));
 await q(id=>__quarry.world.debug.enterVehicle(id),id);await frames(5);await open();check('Restored cab marks the saved tool Equipped',await page.locator('.dt-tool[data-attachment="trench"]').isDisabled()&&await page.locator('.dt-tool[data-attachment="trench"] .dt-equipped').count()===1);await page.keyboard.press('Escape');await frames(4);await open();await shot('tools-continued-960');await page.keyboard.press('Escape');
 await q(()=>__quarry.world.debug.exitVehicle());await page.keyboard.press('KeyQ');await frames(3);check('On foot does not open a machine selector',await page.locator('.overlay-digger-tools').count()===0);
 check('No browser errors',errors.length===0);
}finally{await writeFile(`${process.env.OUT}/report.json`,JSON.stringify(report,null,2)+'\n');await browser.close();}
