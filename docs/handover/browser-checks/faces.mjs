// Actual menus, sampled columns and saved navigation. Money and one terrain cut are fixtures.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { start } from './common.mjs';
const {browser,page,q,frames,newGame,errors}=await start({width:480,height:270});
page.setDefaultTimeout(60000);
const out=process.env.OUT||'/tmp/quarry-faces';await mkdir(out,{recursive:true});
const click=name=>page.getByRole('button',{name,exact:true}).click();
const shot=async(name,width=1280,height=850,focus)=>{
  await page.setViewportSize({width,height});await q(()=>document.activeElement?.blur());await frames(3);
  if(focus)await page.locator(focus).scrollIntoViewIfNeeded();
  assert.equal(await q(()=>document.documentElement.scrollWidth<=innerWidth),true,'horizontal overflow');
  await page.screenshot({path:`${out}/${name}.png`});await page.setViewportSize({width:480,height:270});console.log('shot',name);
};
try {
  await newGame({force:false});
  await q(()=>{const {game:g,world:w}=window.__quarry;w.debug.scene.visible=false;g.state.money=20000;g.actions.buyLand('south');g.actions.buyLand('ridge');});
  await page.keyboard.press('b');await click('Quarry operations');await click('Work areas');
  assert.equal(await page.locator('#work-field option').count(),3);
  await page.getByLabel('Work field',{exact:true}).selectOption('ridge');
  await page.getByLabel('Target material',{exact:true}).selectOption('rock');
  assert.equal(await page.locator('.qo-area').count(),9);assert.equal(await page.locator('.qo-borehole').count(),9);
  await page.locator('[data-sample-index="0"]').click();await click('Save face plan and guide here');
  const ridge=await q(()=>({guide:window.__quarry.world.mapInfo().guide,plan:window.__quarry.game.state.operations.faces['ridge/0-0']}));
  assert.match(ridge.guide.label,/Rock face.*East Ridge/);assert.equal(ridge.plan.materialId,'rock');
  assert.match(await page.locator('.qo-column-profile').innerText(),/Intact rock/);
  await q(()=>document.querySelector('.lt-app-body').scrollTo(0,0));await shot('face-planning');
  await shot('face-column',1280,850,'.qo-face-card');
  console.log('ok field filtering, real layered column and saved exact waypoint');

  await page.getByLabel('Work field',{exact:true}).selectOption('south');
  await page.getByLabel('Target material',{exact:true}).selectOption('topsoil');
  await page.locator('[data-sample-index="4"]').click();await click('Save face plan and guide here');
  await click('Record survey');await page.getByRole('button',{name:'Replace recorded survey',exact:true}).waitFor();
  const before=await q(()=>{
    const g=window.__quarry.game,w=window.__quarry.world,p=w.mapInfo().guide,ground=g.ctx.parcelGrounds.south;
    const totals=ground.totals(),money=g.state.money,plan=structuredClone(g.state.operations.faces['south/0-0']);
    const cut=g.actions.digGround({x:p.x,z:p.z,radius:3,bottomY:-100});
    g.actions.dumpGround({x:p.x+7,z:p.z+7,tonnes:cut.tonnes,radius:1});
    return {totals,money,plan,after:ground.totals()};
  });
  for(const id of Object.keys(before.totals))assert.ok(Math.abs(before.totals[id]-before.after[id])<.01,`${id} conservation`);
  await click('Refresh boreholes');
  assert.match(await page.locator('.qo-face-comparison').innerText(),/no longer present/);
  assert.equal(await page.getByRole('button',{name:'Update plan and guide here',exact:true}).isDisabled(),true);
  assert.deepEqual(await q(()=>window.__quarry.game.state.operations.faces['south/0-0']),before.plan);
  assert.equal(await q(()=>window.__quarry.game.state.money),before.money);
  await shot('face-exhausted-narrow',390,844,'.qo-face-card');
  console.log('ok conserved terrain changes refresh the plan without rewriting its baseline');

  await page.getByLabel('Work field',{exact:true}).selectOption('ridge');
  assert.equal(await page.getByLabel('Target material',{exact:true}).inputValue(),'rock');
  await click('Update plan and guide here');
  await page.keyboard.press('Escape');
  const saved=await q(()=>{window.__quarry.saveTo('slot1');return structuredClone(window.__quarry.game.state.operations);});
  await page.reload();await click('Continue');await page.waitForFunction(()=>window.__quarry?.world);
  assert.deepEqual(await q(()=>window.__quarry.game.state.operations),saved);
  assert.match(await q(()=>window.__quarry.world.mapInfo().guide.label),/Rock face.*East Ridge/);
  await q(()=>{window.__quarry.world.debug.scene.visible=false;});
  await page.keyboard.press('b');await click('Quarry operations');await click('Work areas');
  assert.equal(await page.getByLabel('Work field',{exact:true}).inputValue(),'ridge');
  await click('Clear saved face');
  assert.match(await q(()=>window.__quarry.world.mapInfo().guide.label),/work area/);
  assert.equal(await q(()=>Object.keys(window.__quarry.game.state.operations.faces).length),1);
  await click('Follow current goal');assert.equal(await q(()=>window.__quarry.game.state.operations.workAreaId),null);
  assert.doesNotMatch(await page.locator('.qo-work-areas').innerText(),/NaN|undefined/);
  assert.deepEqual(errors,[]);console.log('PASS working faces: independent plans, reload and clear');
} catch(error) {console.log(await page.locator('body').innerText().catch(()=>''));console.log(errors);throw error;}
finally {await browser.close();}
