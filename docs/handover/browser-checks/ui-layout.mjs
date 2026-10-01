// Native browser audit: actual menus, laptop apps and commerce controls at small/large sizes.
import { start } from './common.mjs';
import { writeFile } from 'node:fs/promises';
const { browser, page, errors, q, frames } = await start({ width: 960, height: 540 });
const baseline = process.env.BASELINE === '1';
const report = { screens: [], actions: [], errors };
page.setDefaultTimeout(20000);
async function screen(name, root = '.laptop') {
  await frames(12);
  const bounds = await q(selector => {
    const n = document.querySelector(selector), r = n.getBoundingClientRect();
    const holders = [...n.querySelectorAll('.lt-main,.lt-app-body,.settings-page,.settings-layout,.map-layout,.sidebar')];
    return { width: innerWidth, height: innerHeight, rect: { x:r.x,y:r.y,width:r.width,height:r.height }, overflow: holders.filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>({class:e.className,width:e.clientWidth,scroll:e.scrollWidth})) };
  }, root);
  report.screens.push({ name, ...bounds });
  await page.screenshot({ path:`${process.env.OUT}/${name}.png` });
  console.log('screen', name, JSON.stringify(bounds));
  if (!baseline && (bounds.rect.x < -1 || bounds.rect.y < -1 || bounds.rect.x+bounds.rect.width>bounds.width+1 || bounds.rect.y+bounds.rect.height>bounds.height+1 || bounds.overflow.length)) throw new Error(`Layout outside bounds: ${name}`);
}
const app = async name => { await page.locator('.lt-dock-app').filter({hasText:name}).click(); await frames(3); };
const category = async name => { await page.locator('.lt-cat').filter({hasText:new RegExp(`^${name}$`)}).click(); await q(()=>document.querySelector('.lt-app-body').scrollTop=0); };
try {
  await page.goto(process.env.QUARRY_URL);
  await screen('main-menu-960', '.main-menu');
  if (!baseline) { for (const size of [{width:1280,height:720},{width:390,height:650}]) { await page.setViewportSize(size); await screen(`main-menu-${size.width}`,'.main-menu'); } await page.setViewportSize({width:960,height:540}); }
  await page.locator('.menu-item').filter({hasText:/^Settings$/}).click();
  await screen('settings-controls-960', '.overlay-settings');
  await page.locator('.settings-nav button').filter({hasText:'Display'}).click();
  await screen('settings-display-960', '.overlay-settings');
  if (!baseline) {
    await page.getByRole('button',{name:'130%',exact:true}).click();
    await screen('settings-scale130-960', '.overlay-settings');
    await page.getByRole('button',{name:'100%',exact:true}).click();
    for (const size of [{width:1280,height:720},{width:640,height:480},{width:390,height:650}]) {
      await page.setViewportSize(size);
      for (const name of ['Controls','Display','Sound','Game','Key bindings']) { await page.locator('.settings-nav button').filter({hasText:new RegExp(`^${name}$`)}).click(); await screen(`settings-${name.toLowerCase().replaceAll(' ','-')}-${size.width}`,'.overlay-settings'); }
    }
    await page.setViewportSize({width:960,height:540});
    await page.locator('.settings-nav button').filter({hasText:/^Controls$/}).click();
    await page.getByRole('checkbox',{name:'Hold mouse to repeat shovel'}).check();
    report.actions.push('Settings repeat shovel toggle');
  }
  await page.locator('.settings-nav button').filter({hasText:'Key bindings'}).click();
  await screen('settings-keys-960', '.overlay-settings');
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.goto(process.env.QUARRY_URL); await page.getByText('New Game',{exact:true}).click();
  await page.waitForFunction(()=>window.__quarry?.world);
  await screen('intro-960','.overlay-intro');
  await page.getByText("Let's get to work",{exact:true}).click();
  await q(()=>{const g=window.__quarry.game; g.state.money=2000000; g.state.stats.totalEarned=300000;
    for(const type of ['miniDigger','excavator','tractor','trailer','fourByFour','serviceVan']) { const t=g.data.machines.types[type]; const tier=Object.keys(t.tiers).find(k=>!t.tiers[k].legacy); g.actions.buyMachine(type,tier); }
    g.dev.skipHours(24);
    for(let i=0;i<6&&!g.state.classifieds?.listings.length;i++) g.dev.skipHours(24);
  });
  await page.keyboard.press('KeyB');
  await frames(40);
  await screen('dealer-diggers-960');
  await page.locator('.lt-tile').first().click();
  await screen('dealer-detail-960');
  await app('Fleet');
  await screen('fleet-960');
  await app('Staff');
  await screen('staff-960');
  if (!baseline) {
    for(const name of ['Home','Wolds Trader','Jobs board','Milestones','Depot prices','Bank','Messages']) { await app(name); await screen(`${name.toLowerCase().replaceAll(' ','-')}-960`); }
    await app('Plant dealer');
    for(const name of ['Tractors','Trailers','Haulage','Getting around','Upgrades','Yard buildings','Sell']) { await category(name); await screen(`dealer-${name.toLowerCase().replaceAll(' ','-')}-960`); }
    await category('Diggers');
    await page.locator('.lt-tile').first().click();
    const before=await q(()=>window.__quarry.game.state.machines.length);
    await page.locator('.lt-buy-row .lt-buy').click();
    await frames(4);
    const after=await q(()=>window.__quarry.game.state.machines.length);
    if(after!==before+1) throw new Error('Dealer Buy did not buy');
    report.actions.push('Dealer purchase');
    await page.keyboard.press('Escape');
    if(!await page.locator('.laptop').count()) await page.keyboard.press('KeyB');
    await app('Wolds Trader');
    const listing=await q(()=>window.__quarry.game.state.classifieds.listings[0]?.id);
    if(listing == null) throw new Error('Fixture has no second-hand advert');
    await page.locator('.lt-ad-actions .lt-buy').first().click();
    if(!await q(id=>window.__quarry.game.state.classifieds.listings.find(l=>l.id===id)?.inspected,listing)) throw new Error('Trader inspection did not apply');
    report.actions.push('Trader inspection'); await screen('trader-inspected-960');
    await app('Plant dealer'); await category('Upgrades');
    const modsBefore=await q(()=>window.__quarry.game.state.machines.reduce((sum,m)=>sum+m.mods.length,0));
    await page.locator('.lt-row .lt-buy').first().click();
    if(!await q(n=>window.__quarry.game.state.machines.reduce((sum,m)=>sum+m.mods.length,0)===n+1,modsBefore)) throw new Error('Workshop Fit did not apply');
    if(await page.locator('.upgrade-card').count()) await page.locator('.upgrade-card').click();
    report.actions.push('Workshop upgrade fitting'); await screen('workshop-fitted-960');
    await category('Diggers'); await page.locator('.lt-tile').nth(1).click();
    const rentedBefore=await q(()=>window.__quarry.game.state.machines.filter(m=>m.rental).length);
    await page.locator('.lt-rental-row .lt-buy').first().click();
    if(!await q(n=>window.__quarry.game.state.machines.filter(m=>m.rental).length===n+1,rentedBefore)) throw new Error('Dealer hire did not apply');
    report.actions.push('Dealer rental'); await screen('dealer-rented-960');
    await app('Fleet');
    await page.getByRole('button',{name:'Return hire',exact:true}).click();
    if(!await q(n=>window.__quarry.game.state.machines.filter(m=>m.rental).length===n,rentedBefore)) throw new Error('Fleet hire return did not apply');
    report.actions.push('Fleet rental return');
    await q(()=>{const {game,world}=window.__quarry; const tractor=game.state.machines.find(m=>m.type==='tractor'), trailer=game.state.machines.find(m=>m.type==='trailer'); world.debug.placeVehicle(tractor.id,58,40,0); world.debug.placeVehicle(trailer.id,52,40,0);});
    await page.getByRole('button',{name:'Hitch trailer',exact:true}).click();
    if(!await q(()=>window.__quarry.game.state.machines.find(m=>m.type==='tractor').trailerId)) throw new Error('Fleet Hitch did not apply');
    report.actions.push('Fleet hitch');
    await page.getByRole('button',{name:'Unhitch',exact:true}).click();
    if(await q(()=>window.__quarry.game.state.machines.find(m=>m.type==='tractor').trailerId)) throw new Error('Fleet Unhitch did not apply');
    report.actions.push('Fleet unhitch');
    await page.locator('.lt-cover-opt').last().click();
    if(!await q(()=>window.__quarry.game.state.insurance.next)) throw new Error('Fleet insurance choice did not apply');
    report.actions.push('Fleet insurance');
    await app('Staff');
    const hires=await page.locator('.st-applicant .lt-buy').count();
    if(hires) { await page.locator('.st-applicant .lt-buy').first().click(); await frames(5); if(!await page.locator('.st-worker').count()) throw new Error('Hire did not create employee'); report.actions.push('Staff hire'); await q(()=>document.querySelector('.lt-app-body').scrollTop=0); await screen('staff-employed-960');
      await page.locator('.st-worker .st-roles button').filter({hasText:/^Digger operator$/}).first().click();
      await frames(3);
      const choices=page.locator('.st-worker select').first();
      if(!await choices.count()) throw new Error('Staff machine assignment selector missing');
      const assigned=await choices.inputValue();
      if(!await q(id=>window.__quarry.game.state.staff.workers.some(w=>w.machineId===id),assigned)) throw new Error('Staff assignment did not apply');
      report.actions.push('Staff digger assignment');
      await page.locator('.st-worker .st-experience summary').first().click();
      await screen('staff-assigned-960');
    }
    for(const size of [{width:1280,height:720},{width:640,height:480},{width:390,height:650}]) {
      await page.setViewportSize(size);
      for(const name of ['Plant dealer','Fleet','Staff','Bank','Depot prices']) { await app(name); if(name==='Plant dealer') { await category('Diggers'); await screen(`dealer-${size.width}`); await page.locator('.lt-tile').first().click(); } await screen(`${name.toLowerCase().replaceAll(' ','-')}-${size.width}`); }
    }
    await page.setViewportSize({width:960,height:540});
    await q(()=>{window.__quarry.settings.uiScale=1.3;document.documentElement.style.fontSize='20.8px';});
    for (const name of ['Plant dealer','Fleet','Staff','Bank','Depot prices']) { await app(name); await screen(`${name.toLowerCase().replaceAll(' ','-')}-scale130-960`); }
    await q(()=>{window.__quarry.settings.uiScale=1;document.documentElement.style.fontSize='16px';});
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab'); await frames(6);
    await screen('map-960','.overlay-map');
    await page.locator('.fleet-name').first().click();
    if(!await q(()=>window.__quarry.game.state.player.navigationMachineId)) throw new Error('Map machine selection failed');
    await page.getByRole('button',{name:'Follow the current goal',exact:true}).click();
    if(await q(()=>window.__quarry.game.state.player.navigationMachineId)) throw new Error('Map goal selection failed');
    report.actions.push('Map machine and goal selection');
    await page.setViewportSize({width:390,height:650}); await screen('map-390','.overlay-map');
    await page.keyboard.press('Escape'); await page.setViewportSize({width:960,height:540}); await page.keyboard.press('Escape');
    await screen('pause-960','.overlay-pause');
    await page.setViewportSize({width:390,height:650});
    await screen('pause-390','.overlay-pause');
    await page.setViewportSize({width:960,height:540});
    await page.locator('.pause-menu .menu-item').filter({hasText:'Save Game'}).click();
    await screen('save-slots-960','.overlay-small');
    await page.keyboard.press('Escape');
  }
  if(errors.length) throw new Error(errors.join('\n'));
} finally {
  await writeFile(`${process.env.OUT}/layout.json`,JSON.stringify(report,null,2));
  await browser.close();
}
