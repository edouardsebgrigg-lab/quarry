// Actual property UI, physical field access and shovel, independent terrain and reload.
// Money, vehicle placement and fixed-step steering are explicit fixtures, not a human drive.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { start } from './common.mjs';

const { browser, page, q, frames, errors, newGame }=await start({width:480,height:270});
page.setDefaultTimeout(60000);
const out=process.env.OUT||'/tmp/quarry-land';await mkdir(out,{recursive:true});
const click=async name=>{console.log('click',name);await page.getByRole('button',{name,exact:true}).click();};
const step=text=>console.log('ok',text);
const screenshot=async(name,width=1280,height=850)=>{
  await page.setViewportSize({width,height});
  await q(()=>{document.activeElement?.blur();document.querySelector('.lt-app-body')?.scrollTo(0,0);});
  await frames(3);await page.screenshot({path:`${out}/${name}.png`});
  assert.equal(await q(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'horizontal overflow');
  await page.setViewportSize({width:480,height:270});console.log('shot',name);
};
try {
  await newGame({force:false});step('expanded world starts');
  await q(()=>{window.__quarry.world.debug.scene.visible=false;});
  await page.keyboard.press('b');await click('Quarry operations');await click('Land');
  const south=page.locator('[data-parcel-id="south"]'),ridge=page.locator('[data-parcel-id="ridge"]');
  assert.equal(await south.getByRole('button',{name:'Buy field · $4,000',exact:true}).isDisabled(),true);
  await south.getByRole('button',{name:'Survey ground',exact:true}).click();
  assert.match(await south.innerText(),/Sampled reserves/i);
  await south.getByRole('button',{name:'Guide to entrance',exact:true}).click();
  assert.match(await q(()=>window.__quarry.world.mapInfo().guide.label),/South Meadow/);
  await screenshot('land-for-sale');
  await screenshot('land-narrow',390,844);
  await page.keyboard.press('Escape');

  // A tracked machine must stop at the old boundary until the neighbouring field is bought.
  const blocked=await q(()=>{
    const {game:g,world:w}=window.__quarry;g.state.money=20000;
    const m=g.actions.buyMachine('miniDigger','micro08').machine;window.__landMini=m.id;
    w.debug.placeVehicle(m.id,76,150,-Math.PI/2);w.debug.enterVehicle(m.id);
    for(let i=0;i<900;i++)w.update(1/30,{paused:false,keyboard:{isHeld:a=>a==='forward'}});
    const p=w.debug.vehicle(m.id).position();w.debug.exitVehicle();
    return {x:p.x,z:p.z,dig:g.actions.shovelDig({x:40,z:210})};
  });
  assert.ok(blocked.z<=154.1,`unowned boundary crossed to ${blocked.z}`);assert.equal(blocked.dig.ok,false);
  step('unowned ground blocks excavation and tracked-machine access');

  await page.keyboard.press('b');await click('Quarry operations');await click('Land');
  step('land purchasing screen reopened');
  const before=await q(()=>window.__quarry.game.state.money);
  await south.getByRole('button',{name:'Buy field · $4,000',exact:true}).click();
  await south.locator('.qo-land-status').filter({hasText:'Owned'}).waitFor();
  assert.equal(await q(()=>window.__quarry.game.state.money),before-4000);
  await ridge.getByRole('button',{name:'Buy field · $6,500',exact:true}).click();
  await ridge.locator('.qo-land-status').filter({hasText:'Owned'}).waitFor();
  assert.equal(await q(()=>window.__quarry.game.state.money),before-10500);
  await click('Work areas');
  assert.match(await page.locator('.qo-area-grid').innerText(),/South Meadow/);
  assert.match(await page.locator('.qo-area-grid').innerText(),/East Ridge/);
  await click('Rock blasting');await page.getByLabel('Field',{exact:true}).selectOption('ridge');
  assert.equal(Number(await page.locator('#blast-x').inputValue()),256);
  assert.equal(Number(await page.locator('#blast-z').inputValue()),44);
  assert.doesNotMatch(await page.locator('.qo-blasting').innerText(),/NaN|undefined/);
  step('purchase charges once, adds work areas and routes the blasting map');
  await page.keyboard.press('Escape');

  const crossed=await q(()=>{
    const w=window.__quarry.world,id=window.__landMini;w.debug.enterVehicle(id);
    for(let i=0;i<1200;i++)w.update(1/30,{paused:false,keyboard:{isHeld:a=>a==='forward'}});
    const p=w.debug.vehicle(id).position();w.debug.exitVehicle();return {x:p.x,z:p.z,y:p.y};
  });
  assert.ok(crossed.z>175,`owned entrance was blocked at ${crossed.z}`);
  assert.ok(Math.abs(crossed.x-76)<4&&crossed.y>-5,'vehicle left the entrance or fell through terrain');
  step(`tracked machine crosses the actual southern opening (${crossed.z.toFixed(1)} m)`);

  const east=await q(()=>{
    const w=window.__quarry.world,id=window.__landMini;
    w.debug.placeVehicle(id,200,28,0);w.debug.enterVehicle(id);
    for(let i=0;i<1200;i++)w.update(1/30,{paused:false,keyboard:{isHeld:a=>a==='forward'}});
    const p=w.debug.vehicle(id).position();w.debug.exitVehicle();return {x:p.x,z:p.z,y:p.y};
  });
  assert.ok(east.x>225,`eastern entrance was blocked at ${east.x}`);
  assert.ok(Math.abs(east.z-28)<4&&east.y>-5,'vehicle fell or left the eastern entrance');
  step(`tracked machine reaches East Ridge (${east.x.toFixed(1)} m)`);

  await q(()=>{
    const w=window.__quarry.world;w.debug.scene.visible=true;w.debug.teleportPlayer(40,210);w.debug.aimAt(40,212);w.debug.setFootPitch(-.9);
    window.__landBefore=Object.fromEntries(Object.entries(window.__quarry.game.ctx.parcelGrounds).map(([id,g])=>[id,g.totals()]));
  });
  await frames(4);await q(()=>window.__quarry.world.debug.useShovel());await frames(65);
  const dug=await q(()=>Object.values(window.__quarry.game.state.tools.shovel.load).reduce((s,t)=>s+t,0));
  assert.ok(dug>0,'actual shovel did not dig the new field');
  assert.ok((await q(()=>window.__quarry.world.debug.feet()))[1]>-3,'player fell through the new field');
  const carried=await q(()=>{
    const g=window.__quarry.game,load={...g.state.tools.shovel.load};
    const tipped=g.actions.shovelDump({into:'ground',x:240,z:40});
    const after=Object.fromEntries(Object.entries(g.ctx.parcelGrounds).map(([id,ground])=>[id,ground.totals()]));
    return {load,tipped,before:window.__landBefore,after};
  });
  assert.equal(carried.tipped.ok,true);
  for(const id of Object.keys(carried.before.south)) {
    assert.ok(Math.abs(carried.after.south[id]+(carried.load[id]||0)-carried.before.south[id])<.01,`${id} South conservation`);
    assert.ok(Math.abs(carried.after.ridge[id]-(carried.load[id]||0)-carried.before.ridge[id])<.01,`${id} Ridge conservation`);
  }
  await q(()=>{const w=window.__quarry.world;w.debug.teleportPlayer(83,152);w.debug.aimAt(89,163);w.debug.setFootPitch(-.03);});
  await screenshot('south-entrance',960,540);
  step('physical shovel and independent terrain conserve material across the new fields');

  await page.keyboard.press('Tab');
  assert.equal(await q(()=>window.__quarry.world.mapInfo().landParcels.filter(p=>p.owned).length),2);
  await q(()=>{window.__quarry.world.debug.scene.visible=false;});
  await screenshot('expanded-map');await page.keyboard.press('Escape');
  const saved=await q(()=>{
    const g=window.__quarry.game;window.__quarry.saveTo('slot1');
    return {money:g.state.money,home:g.ctx.ground.totals(),parcels:Object.fromEntries(Object.entries(g.ctx.parcelGrounds).map(([id,ground])=>[id,ground.totals()]))};
  });
  await page.reload();await click('Continue');await page.waitForFunction(()=>window.__quarry?.world);
  const loaded=await q(()=>{
    const g=window.__quarry.game;return {money:g.state.money,home:g.ctx.ground.totals(),parcels:Object.fromEntries(Object.entries(g.ctx.parcelGrounds).map(([id,ground])=>[id,ground.totals()]))};
  });
  assert.deepEqual(loaded,saved);assert.equal(await q(()=>window.__quarry.game.state.land.purchases.length),2);
  step('Save and Continue retain ownership, money and each terrain inventory');
  assert.deepEqual(errors,[],'console errors');console.log('PASS land expansion');
} catch(error) {
  console.log('Browser failure:',await page.locator('body').innerText().catch(()=>''));
  console.log('Console errors:',errors);throw error;
} finally {await browser.close();}
