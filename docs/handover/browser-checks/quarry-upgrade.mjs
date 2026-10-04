// Real UI purchases and production; conserved extraction/clock advancement use labelled fixtures.
import assert from 'node:assert/strict';
import { start } from './common.mjs';

const { browser,page,errors,q,newGame }=await start({width:480,height:270});
page.setDefaultTimeout(90000);
const out=process.env.OUT;
const app=async()=>{
  await page.keyboard.press('b');
  await page.getByRole('button',{name:'Quarry operations',exact:true}).click();
};
const clickTab=name=>page.getByRole('button',{name,exact:true}).click();
try {
  await newGame();console.log('PASS fresh game');
  await q(()=>{window.__quarry.gate.force(false);window.__quarry.game.dev.addMoney(10000);});
  await page.keyboard.press('b');
  await page.getByRole('button',{name:'Yard buildings',exact:true}).click();
  for(const name of ['Stockpile bays','Jaw crusher','Screening plant']) {
    const row=page.locator('.lt-row').filter({has:page.getByText(name,{exact:true})});
    await row.getByRole('button',{name:'Buy',exact:true}).click();
    await row.getByText('In use',{exact:true}).waitFor();
  }
  console.log('PASS plant purchases through dealer');
  const fixture=await q(async()=>{
    const {storeStockpile}=await import('/src/buildings/index.js');
    const g=window.__quarry.game,ground=g.ctx.ground;
    const totals=()=>ground.totals();
    const before=totals();
    // Relocate overburden, then use the finite breaker cut to obtain real rock.
    const soil=g.actions.digGround({x:120,z:100,radius:4,bottomY:-100});
    g.actions.dumpGround({x:135,z:125,tonnes:soil.tonnes,radius:4});
    const rock={};
    for(let i=0;i<12&&(rock.rock??0)<2;i++) {
      const x=120.25,z=100.25,y=ground.heightAt(x,z);
      const cut=ground.cutSweep({from:{x,y:y+.01,z},to:{x,y:y-.3,z},width:.5,maxTonnes:2-(rock.rock??0),tool:'breaker',force:1000});
      rock.rock=(rock.rock??0)+(cut.tonnes.rock??0);
      const other={...cut.tonnes};delete other.rock;g.actions.dumpGround({x:135,z:125,tonnes:other,radius:4});
    }
    const stored=storeStockpile(g.ctx,'west',{...rock});if(!stored.ok)throw new Error(stored.reason);
    return {before,after:totals(),feed:rock};
  });
  assert.ok(fixture.feed.rock>=.5,'breaker fixture produced insufficient rock');
  for(const [id,t] of Object.entries(fixture.before))assert.ok(Math.abs(t-(fixture.after[id]??0)-(fixture.feed[id]??0))<.01,`fixture conservation ${id}`);
  const batch=Math.min(1,fixture.feed.rock);
  await page.getByRole('button',{name:'Quarry operations',exact:true}).click();
  await clickTab('Production');
  const crusher=page.locator('[data-plant-id="crusher"]');
  await crusher.locator('input').fill(String(batch));
  await crusher.getByRole('button',{name:'Start batch',exact:true}).click();
  await page.locator('.qo-job').waitFor();
  const saved=await q(()=>{
    const g=window.__quarry.game;window.__quarry.saveTo('slot1');
    return {money:g.state.money,production:structuredClone(g.state.production),stockpiles:structuredClone(g.state.stockpiles)};
  });
  await page.reload();await page.getByText('Continue',{exact:true}).click();
  await page.waitForFunction(()=>window.__quarry?.world);
  await q(()=>window.__quarry.gate.force(false));
  const loaded=await q(()=>{const g=window.__quarry.game;return {money:g.state.money,production:g.state.production,stockpiles:g.state.stockpiles};});
  assert.deepEqual(loaded,saved);console.log('PASS running batch, held feed and money survive Continue');
  await q(()=>{const g=window.__quarry.game;g.advance(100);});
  const first=await q(()=>{const g=window.__quarry.game;return {output:g.state.stockpiles.home.middle,processed:g.state.production.processed,reward:g.state.career.reached.batch1};});
  assert.ok(Math.abs(first.output.gravel-batch*.8)<1e-8);assert.ok(Math.abs(first.output.sand-batch*.2)<1e-8);
  assert.ok(first.reward!==undefined,'first-batch milestone not reached');
  assert.match(await page.locator('.log').innerText(),/Jaw crusher finished:.*Middle bay/);
  await app();await clickTab('Production');
  assert.equal(await page.locator('[data-plant-id="crusher"] input').inputValue(),String(batch),'saved crusher plan lost on Continue');
  const screener=page.locator('[data-plant-id="screener"]');
  await screener.locator('input').fill(String(batch));
  await screener.getByRole('button',{name:'Start batch',exact:true}).click();
  await page.locator('.qo-job').waitFor();
  const screening=await q(()=>structuredClone(window.__quarry.game.state.production.jobs));
  await page.getByRole('button',{name:'Cancel batch',exact:true}).click();
  await q(()=>{
    const g=window.__quarry.game;
    if(g.state.production.jobs.length)throw new Error('cancel did not stop batch');
  });
  assert.equal(screening.length,1);console.log('PASS screen batch cancellation through UI');
  await screener.getByRole('button',{name:'Start batch',exact:true}).click();
  await q(()=>window.__quarry.game.advance(100));
  const result=await q(()=>{const g=window.__quarry.game;return {stockpiles:g.state.stockpiles.home,processed:g.state.production.processed,batches:g.state.production.batches,day:g.state.logbook.days.at(-1)};});
  assert.ok(Math.abs(result.stockpiles.east.gravel-batch*.8)<1e-8);
  assert.ok(Math.abs(result.stockpiles.middle.sand-batch*.2)<1e-8);
  assert.equal(result.batches,2);assert.ok(Math.abs(result.processed-batch*2)<1e-8);
  assert.equal(result.day.productionBatches,2);console.log('PASS finished products, rejects and report accounting',JSON.stringify(result));
  await clickTab('Batch history');
  assert.equal(await page.locator('.qo-history').count(),3);
  assert.match(await page.locator('[data-batch-id="batch-2"]').innerText(),/Cancelled[\s\S]*feed returned[\s\S]*not refunded/);
  const beforePlan=await q(()=>{const g=window.__quarry.game;return JSON.stringify([g.state.money,g.state.stockpiles,g.state.production.jobs,g.state.production.history]);});
  await page.locator('[data-batch-id="batch-1"]').getByRole('button',{name:'Plan again',exact:true}).click();
  assert.equal(await page.locator('[data-plant-id="crusher"] input').inputValue(),String(batch));
  assert.equal(await q(()=>{const g=window.__quarry.game;return JSON.stringify([g.state.money,g.state.stockpiles,g.state.production.jobs,g.state.production.history]);}),beforePlan,'planning moved inventory or money');
  await page.locator('[data-plant-id="crusher"] input').fill('0.5');
  await clickTab('Yard');await clickTab('Production');
  assert.equal(await page.locator('[data-plant-id="crusher"] input').inputValue(),'0.5');
  console.log('PASS completed/cancelled history, saved plans and review before repeating');

  // Handling fixture uses the real bucket, carrier, weighbridge and depot actions;
  // placements and driving are not exercised by this fixture.
  const handled=await q(()=>{
    const g=window.__quarry.game;
    const digger=g.actions.buyMachine('miniDigger','rusty').machine,truck=g.state.machines[0];
    if(!digger)throw new Error('mini digger purchase failed');
    const before=g.state.stats.tonnesSold,dug=g.state.stats.tonnesDug,history=JSON.stringify(g.state.production.history);
    const check=r=>{if(!r.ok)throw new Error(r.reason);return r;};
    check(g.actions.bucketCut(digger.id,{stockpileBay:'east'}));
    const moved=check(g.actions.dumpBucket(digger.id,{machineId:truck.id})).tonnes;
    if(g.actions.tip(truck.id,{bay:'gravel'}).ok)throw new Error('unweighed load accepted');
    check(g.actions.weighIn(truck.id));check(g.actions.tip(truck.id,{bay:'gravel'}));
    g.advance(Math.ceil(truck.job.duration*g.data.game.ticksPerSecond)+1);
    return {moved,sold:g.state.stats.tonnesSold-before,dug:g.state.stats.tonnesDug-dug,
      remaining:(g.state.stockpiles.home.east.gravel??0)+(digger.load.gravel??0)+(truck.load.gravel??0),
      historyUnchanged:history===JSON.stringify(g.state.production.history)};
  });
  assert.ok(handled.moved>0);assert.ok(Math.abs(handled.sold-handled.moved)<1e-8);
  assert.ok(Math.abs(handled.remaining+handled.sold-batch*.8)<1e-8);assert.equal(handled.dug,0);assert.ok(handled.historyUnchanged);
  console.log('PASS finished product reloaded, weighed and sold without double-counting',JSON.stringify(handled));
  await clickTab('Work areas');
  await page.locator('[data-area-id="1-1"]').click();
  await page.getByRole('button',{name:'Set as work area',exact:true}).click();
  assert.equal(await q(()=>window.__quarry.world.mapInfo().activeWorkAreaId),'1-1');
  assert.match(await q(()=>window.__quarry.world.mapInfo().guide.label),/Central/);
  await q(()=>window.__quarry.saveTo('slot1'));
  const clean=await q(()=>document.querySelector('.lt-app-body').innerText);
  assert.ok(!/(null|undefined|NaN)(?![a-z])/.test(clean));
  if(out) {
    await page.setViewportSize({width:1280,height:720});await page.screenshot({path:`${out}/work-areas-desktop.png`});
    await clickTab('Production');await page.screenshot({path:`${out}/production-desktop.png`});
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/production-narrow.png`});
    const fits=await q(()=>{const b=document.querySelector('.lt-app-body');return b.scrollWidth<=b.clientWidth+1;});
    assert.ok(fits,'production overflows narrow app body');
    await clickTab('Daily reports');await page.screenshot({path:`${out}/daily-report-narrow.png`});
    await clickTab('Batch history');await page.screenshot({path:`${out}/batch-history-narrow.png`});
    await page.setViewportSize({width:960,height:540});await page.screenshot({path:`${out}/batch-history-desktop.png`});
  }
  assert.deepEqual(errors,[]);console.log('PASS upgrade UI and no console errors');
} finally {await browser.close();}
