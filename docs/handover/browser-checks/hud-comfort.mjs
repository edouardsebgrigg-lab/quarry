import fs from 'node:fs/promises';
import { start } from './common.mjs';
const out=process.env.OUT;
await fs.mkdir(out,{recursive:true});
const {browser,page,q,frames,newGame,errors}=await start({width:960,height:540});
page.setDefaultTimeout(20000);
const report={kind:'Native HUD component fixtures and live settings controls',checks:[],screens:[],errors};
const check=(label,passed,sample)=>{report.checks.push({label,passed,sample});if(!passed)throw new Error(label);};
try {
 await newGame({force:false});
 await q(async()=>{
  const {createHud3d}=await import('/src/ui/game/hud3d.js');
  window.hudProof={old:document.querySelector('.hud3d'),hud:createHud3d({settings:window.__quarry.settings})};
  hudProof.old.remove();document.querySelector('.game-main').append(hudProof.hud.node);
  hudProof.hud.setLoading(false);
  hudProof.info={mode:'digger-direct',locked:true,machine:{name:'Mini 16 #2',type:'miniDigger',condition:92,engine:'running',load:.31,capacity:.4,bucketVolume:.23,loadVolume:.23,capacityVolume:.4,bucketFill01:.575,direct:true,aimReach:3.8,cutDepth:.22,resistance:65,hydraulicLoad:.93,slip:0,material:{id:'clay',name:'Clay',color:'#b48960',resistance:65},attachment:'Trenching bucket',workFeedback:{kind:'warn',label:'Hard cut — take a shallower bite',intensity:.93}},prompt:{key:'LMB',text:'Curl and pull inward to fill the bucket (58%)'}};
 });
 const draw=()=>q(()=>hudProof.hud.update(hudProof.info,{overlayOpen:false,started:true,dt:9}));
 const capture=async(name,selector)=>{
  await draw();await frames(2);await page.waitForTimeout(650);
  const sample=await page.locator(selector).evaluate(n=>{const r=n.getBoundingClientRect();return {bounds:[r.x,r.y,r.right,r.bottom],viewport:[innerWidth,innerHeight],text:n.textContent,overflow:n.scrollWidth>n.clientWidth+1};});
  await page.screenshot({path:`${out}/${name}.png`,timeout:20000});report.screens.push({name,sample});
  check(`${name}: bounded readable content`,sample.bounds[0]>=0&&sample.bounds[1]>=0&&sample.bounds[2]<=sample.viewport[0]+1&&sample.bounds[3]<=sample.viewport[1]+1&&!sample.overflow&&!/NaN|Infinity|undefined/.test(sample.text),sample);
 };
 await capture('digger-960','.machine-dash');
 check('Exact partial bucket capacity',await page.locator('.md-val').first().textContent()==='0.23/0.40 m³');
 check('Material and useful resistance visible',(await page.locator('.machine-work').textContent()).includes('65 kN resistance'));
 await page.setViewportSize({width:390,height:650});await capture('digger-390','.machine-dash');
 await capture('guided-goal-390','.hud-goal:not(.personal-target)');
 check('Default guided goal text is unobscured on phone',await q(()=>{
  const goal=document.querySelector('.hud-goal:not(.personal-target)'),text=goal.querySelector('.goal-text'),mentor=document.querySelector('.mentor');
  const g=goal.getBoundingClientRect(),t=text.getBoundingClientRect();
  return getComputedStyle(mentor).visibility==='hidden'&&getComputedStyle(goal).display!=='none'&&t.height>0&&t.left>=g.left&&t.right<=g.right+1&&t.bottom<=g.bottom+1&&text.scrollWidth<=text.clientWidth+1;
 }));
 await page.setViewportSize({width:960,height:540});await q(()=>document.documentElement.style.fontSize='20.8px');await capture('digger-130-960','.machine-dash');
 check('Large-text machine prompt is clear of mentor and dash',await q(()=>{const a=document.querySelector('.prompt').getBoundingClientRect();return ['.mentor','.machine-dash'].every(sel=>{const b=document.querySelector(sel).getBoundingClientRect();return a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom;});}));
 await q(()=>{document.documentElement.style.fontSize='16px';hudProof.info={mode:'tractor',locked:true,machine:{name:'Field 90 #4',type:'tractor',road:true,carrier:true,condition:87,engine:'running',speedKmh:12,gear:'2',rpm:1500,maxRpm:2500,load:2.4,capacity:4,loadVolume:2.8,capacityVolume:3.5,grossLoadTonnes:4.3,towLimitTonnes:5,slip:.38,material:{name:'Gravel',color:'#929085'},workFeedback:{kind:'warn',label:'Low grip — ease the throttle',intensity:.38}}};});
 await capture('tractor-960','.machine-dash');
 check('Useful towing and wheel slip visible',(await page.locator('.mw-metrics').textContent()).includes('4.3/5.0 t tow')&&(await page.locator('.mw-metrics').textContent()).includes('38% wheel slip'));
 await q(()=>{hudProof.info={mode:'foot',locked:true,survey:{key:'L',surface:{name:'Clay',resistance:65,loose:false},layers:[{name:'Clay',depth:0,thickness:.6,kind:'natural'},{name:'Sand',depth:.6,thickness:.4,kind:'natural'},{name:'Gravel',depth:1,thickness:1.3,kind:'natural'}],bedrockDepth:2.3,bedrockName:'Rock'}};});
 await capture('survey-960','.survey-card');await page.setViewportSize({width:390,height:650});await capture('survey-390','.survey-card');
 check('Survey shows three real depth layers',await page.locator('.survey-layer').count()===3);
 await q(()=>hudProof.info.survey={key:'L',empty:true,reason:'Aim at the ground on your field'});await capture('survey-empty-390','.survey-card');
 check('Empty survey gives a helpful reason without invented bedrock',await page.locator('.survey-bed').isHidden());
 await q(()=>{hudProof.hud.node.remove();document.querySelector('.game-main').append(hudProof.old);});
 await page.setViewportSize({width:960,height:540});await page.keyboard.press('Escape');await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Display',exact:true}).click();
 const motion=page.getByRole('slider',{name:'Camera motion',exact:true});const fov=page.getByRole('slider',{name:'Field of view',exact:true});
 await motion.focus();await page.keyboard.press('Home');await fov.focus();await page.keyboard.press('End');
 check('Actual comfort sliders save steady camera and wide view',await q(()=>{const s=JSON.parse(localStorage.getItem('quarry.settings'));return s.cameraMotion===0&&s.fieldOfView===95&&__quarry.settings.cameraMotion===0&&__quarry.settings.fieldOfView===95;}));
 for(const [width,height,name] of [[960,540,'comfort-settings-960'],[390,650,'comfort-settings-390']]){await page.setViewportSize({width,height});await frames(2);await page.screenshot({path:`${out}/${name}.png`,timeout:20000});report.screens.push({name});const bounded=await page.locator('.overlay-settings').evaluate(n=>{const r=n.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth+1&&r.y>=0&&r.bottom<=innerHeight+1&&n.scrollWidth<=n.clientWidth+1;});check(`${name}: fits viewport`,bounded);}
 check('No native browser errors',errors.length===0);
} finally {await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');await browser.close();}
