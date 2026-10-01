// Independent real UI pin/switch/clear flow, responsive HUD and save/Continue round trip.
import { start } from './common.mjs';
import fs from 'node:fs/promises';
await fs.mkdir(process.env.OUT,{recursive:true});
const {browser,page,q,frames,newGame,errors}=await start({width:960,height:540});
page.setDefaultTimeout(20000);
const report={checks:[],screens:[],errors};
const check=(label,passed,sample)=>{report.checks.push({label,passed,sample});if(!passed)throw new Error(label);};
const app=async label=>{await page.locator('.lt-dock-app').filter({hasText:label}).click();await frames(3);};
const pin=()=>q(()=>__quarry.game.state.career.pinnedMilestoneId);
async function capture(name,selector){await frames(4);await page.waitForTimeout(700);const sample=await page.locator(selector).evaluate(n=>{const r=n.getBoundingClientRect();return {bounds:[r.x,r.y,r.right,r.bottom],viewport:[innerWidth,innerHeight],overflow:n.scrollWidth>n.clientWidth+1,text:n.textContent};});await page.screenshot({path:`${process.env.OUT}/${name}.png`,timeout:20000});report.screens.push({name,sample});check(`${name}: bounded readable target`,sample.bounds[0]>=0&&sample.bounds[1]>=0&&sample.bounds[2]<=sample.viewport[0]+1&&sample.bounds[3]<=sample.viewport[1]+1&&!sample.overflow&&!/undefined|NaN/.test(sample.text),sample);}
try{
 await newGame({force:false});await page.keyboard.press('KeyB');await app('Milestones');
 const first=page.locator('.lt-ms').filter({has:page.locator('.lt-pin-target')}).first();const selected=await first.getAttribute('data-milestone-id');await first.locator('.lt-pin-target').click();
 check('Actual milestone click pins a target',await pin()===selected);
 check('Chosen card state is clear',await first.locator('.lt-pin-target').getAttribute('aria-pressed')==='true');
 await page.evaluate(()=>document.querySelector('.lt-app-body').scrollTop=0);await capture('milestones-pinned-960','.laptop');
 await app('Home');check('Home shows progress, benefit and clear action',await page.locator('.lt-goal.personal-target .lt-target-benefit').isVisible()&&await page.locator('.lt-goal.personal-target .lt-target-progress').isVisible());await capture('home-target-960','.laptop');
 await page.setViewportSize({width:390,height:650});await capture('home-target-390','.laptop');
 await page.keyboard.press('Escape');await capture('target-hud-390','.hud-goal.personal-target');
 const separate=await q(()=>{const a=document.querySelector('.hud-goal.personal-target').getBoundingClientRect(),b=document.querySelector('.hud-status').getBoundingClientRect();return a.top>=b.bottom;});check('Phone target sits below status without overlap',separate);check('Chosen phone target is not covered by the mentor',await page.locator('.mentor').evaluate(n=>getComputedStyle(n).visibility==='hidden'));
 await page.setViewportSize({width:960,height:540});await capture('target-hud-960','.hud-goal.personal-target');
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Save Game',exact:true}).click();await page.locator('.btn-slot').filter({hasText:'Slot 1'}).click();
 await page.reload();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.waitForFunction(()=>window.__quarry?.world,null,{timeout:20000});await frames(4);
 check('Save and Continue preserve target',await pin()===selected);
 await capture('target-hud-continued-960','.hud-goal.personal-target');
 await page.keyboard.press('KeyB');await app('Home');await page.locator('.lt-target-actions').getByRole('button',{name:'Switch target',exact:true}).click();
 const second=page.locator('.lt-ms:not(.lt-ms-target)').filter({has:page.locator('.lt-pin-target')}).first();const replacement=await second.getAttribute('data-milestone-id');await second.locator('.lt-pin-target').click();check('Switch replaces the chosen target',await pin()===replacement&&replacement!==selected);
 await page.setViewportSize({width:390,height:650});await q(()=>document.querySelector('.lt-app-body').scrollTop=0);await capture('milestones-switched-390','.laptop');
 await app('Home');await page.locator('.lt-target-actions').getByRole('button',{name:'Clear target',exact:true}).click();check('Home clear restores guided objective',await pin()===null&&await page.locator('.lt-goal.personal-target').count()===0);
 await page.keyboard.press('Escape');check('HUD clears personal target',await page.locator('.hud-goal.personal-target').count()===0);
 check('No native browser errors',errors.length===0);
}finally{await fs.writeFile(`${process.env.OUT}/report.json`,JSON.stringify(report,null,2)+'\n');await browser.close();}
