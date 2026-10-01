// Follow-up to ui-layout: purchase prominence and clean map at the affected small sizes.
import { start } from './common.mjs';
import { writeFile } from 'node:fs/promises';
const {browser,page,q,frames,newGame,errors}=await start({width:390,height:650});
page.setDefaultTimeout(20000);
const report={url:process.env.QUARRY_URL,checks:[],screens:[],errors};
const check=(ok,label)=>{report.checks.push({label,passed:!!ok});if(!ok)throw new Error(label);};
async function screen(name,selector) {
  await frames(15);
  const bounds=await q(selector=>{const n=document.querySelector(selector),r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,viewport:[innerWidth,innerHeight],overflow:[...n.querySelectorAll('.lt-app-body,.lt-main,.map-layout,.sidebar')].filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.className)};},selector);
  check(bounds.x>=-1&&bounds.y>=-1&&bounds.x+bounds.width<=bounds.viewport[0]+1&&bounds.y+bounds.height<=bounds.viewport[1]+1&&!bounds.overflow.length,`${name}: bounds and overflow`);
  report.screens.push({name,...bounds});
  await page.screenshot({path:`${process.env.OUT}/${name}.png`});
}
try {
  await newGame({force:false});
  await q(()=>{const g=window.__quarry.game;g.state.money=100000;g.actions.buyMachine('miniDigger','micro08');});
  await page.keyboard.press('KeyB');await frames(40);
  await page.locator('.lt-tile').first().click();
  for(const size of [{width:390,height:650},{width:640,height:480},{width:960,height:540,scale:1.3}]) {
    await page.setViewportSize({width:size.width,height:size.height});
    await q(scale=>{window.__quarry.settings.uiScale=scale;document.documentElement.style.fontSize=`${16*scale}px`;},size.scale??1);
    await frames(4);
    await q(()=>document.querySelector('.lt-app-body').scrollTop=0);
    const prominence=await q(()=>{const price=document.querySelector('.lt-buy-row').getBoundingClientRect(),b=document.querySelector('.lt-buy-row .lt-buy').getBoundingClientRect(),t=document.querySelector('.lt-detail-title').getBoundingClientRect(),s=document.querySelector('.lt-app-body').getBoundingClientRect();return {price:[price.top,price.bottom],buy:[b.top,b.bottom],title:[t.top,t.bottom],body:[s.top,s.bottom],enabled:!document.querySelector('.lt-buy-row .lt-buy').disabled};});
    report.screens.push({name:`prominence-${size.width}`,sample:prominence});
    await screen(`dealer-detail-${size.width}`,'.laptop');
    check(prominence.enabled&&prominence.buy[0]>=prominence.body[0]&&prominence.buy[1]<=prominence.body[1]&&prominence.price[1]<=prominence.body[1]&&prominence.title[0]>=prominence.body[0],`${size.width}: name and Buy visible without scrolling`);
    const before=await q(()=>window.__quarry.game.state.machines.length);
    await page.locator('.lt-buy-row .lt-buy').click();await frames(3);
    check(await q(n=>window.__quarry.game.state.machines.length===n+1,before),`${size.width}: actual Buy works`);
  }
  await q(()=>{window.__quarry.settings.uiScale=1;document.documentElement.style.fontSize='16px';});
  await page.keyboard.press('Escape');
  check(await q(()=>!!document.querySelector('.feedback > .toasts')&&!!document.querySelector('.feedback > .log')&&!document.querySelector('.lt-notices')),'Closing laptop restores feedback nodes');
  await page.keyboard.press('Tab');await frames(6);
  for(const size of [{width:640,height:480},{width:390,height:650}]) {
    await page.setViewportSize(size);
    await screen(`map-${size.width}`,'.overlay-map');
    check(await q(()=>getComputedStyle(document.querySelector('.feedback > .toasts')).visibility==='hidden'),'Map keeps pending delivery notifications out of its controls');
  }
  await page.locator('.fleet-name').first().click();
  check(await q(()=>!!window.__quarry.game.state.player.navigationMachineId),'Small map machine selection works');
  await page.keyboard.press('Escape');
  check(await q(()=>getComputedStyle(document.querySelector('.feedback > .toasts')).visibility!=='hidden'),'World feedback resumes after map closes');
  check(!errors.length,'No browser errors');
} finally {
  await writeFile(`${process.env.OUT}/layout.json`,JSON.stringify(report,null,2));
  await browser.close();
}
