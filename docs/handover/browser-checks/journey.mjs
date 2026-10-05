// The journal, handbook and save manager through their actual controls. Fixtures shorten
// the final goal and autosave interval; this is not a start-to-finish human playthrough.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { start } from './common.mjs';

const { browser, page, q, frames, errors, newGame } = await start({ width: 480, height: 270 });
const out = process.env.OUT || '/tmp/quarry-journey'; await mkdir(out, { recursive: true });
const step = text => console.log('ok', text);
const click = name => page.getByRole('button', { name, exact: true }).click();
const pause = async () => { await page.keyboard.press('Escape'); await page.locator('.overlay-pause').waitFor(); };
const desktop = async name => {
  await page.setViewportSize({ width: 1280, height: 850 }); await frames(3);
  await q(() => { document.activeElement?.blur(); document.querySelectorAll('.lt-app-body, .overlay-saves').forEach(n => n.scrollTop = 0); });
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
  await page.setViewportSize({ width: 480, height: 270 });
};
try {
  await newGame({ force: false });
  await q(() => {
    const { game:g, world, settings } = window.__quarry;
    world.debug.scene.visible = false; // UI screenshots: omit the world for software-render speed.
    g.actions.setCompanyName('Mill Lane Stone');
    settings.bindings.interact = 'KeyY';
    g.actions.shovelDig({ x: 30, z: 20 });
  });
  await page.keyboard.press('F2');
  await page.locator('.field-guide').waitFor();
  assert.equal(await page.locator('.fg-step.completed').count(), 1);
  assert.match(await page.locator('.fg-overview').innerText(), /Fill the wheelbarrow/i);
  await page.getByLabel('Show step-by-step guidance').uncheck();
  assert.equal(await q(() => window.__quarry.game.state.objectives.guideEnabled), false);
  assert.equal(await q(() => window.__quarry.world.mapInfo().guide), null);
  await page.getByLabel('Show step-by-step guidance').check();
  await desktop('journey');
  await click('Handbook');
  await page.getByLabel('Search handbook').fill('first load');
  assert.match(await page.locator('.fg-reader').innerText(), /Use Y at its handles/);
  await page.getByLabel('Search handbook').fill('bedrock bucket');
  assert.match(await page.locator('.fg-reader').innerText(), /bedrock/);
  await page.getByLabel('Search handbook').fill('no article can match this');
  assert.match(await page.locator('.fg-results').innerText(), /No articles match/);
  await page.getByLabel('Search handbook').fill('');
  await page.locator('.fg-result').filter({ hasText: 'Dig, swing and load' }).click();
  await desktop('handbook');
  await page.setViewportSize({ width: 390, height: 844 }); await frames(3);
  assert.equal(await q(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: `${out}/handbook-narrow.png` });
  await page.setViewportSize({ width: 480, height: 270 });
  await click('Controls');
  assert.match(await page.locator('.fg-controls').innerText(), /Get in \/ get out\s+Y/);
  step('journal, optional guidance, search and rebound keys at desktop/narrow sizes');
  await page.keyboard.press('Escape');

  // Manual UI saves rotate a previous revision; export uses the browser's download flow.
  await pause(); await click('Save Game');
  await page.locator('[data-slot-id="slot1"]').getByRole('button', { name: 'Save here', exact: true }).click();
  await page.locator('.overlay-saves').waitFor({ state: 'detached' });
  const previousMoney = await q(() => window.__quarry.game.state.money);
  await q(() => { window.__quarry.game.state.money = 456; });
  await click('Save Game');
  await page.locator('[data-slot-id="slot1"]').getByRole('button', { name: 'Save here', exact: true }).click();
  await page.locator('.overlay-small').getByRole('button', { name: 'Save here', exact: true }).click();
  await page.locator('.overlay-saves').waitFor({ state: 'detached' });
  await click('Load Game');
  const slot1 = page.locator('[data-slot-id="slot1"]');
  await slot1.locator('summary').click();
  assert.match(await slot1.innerText(), /Previous revision/);
  const downloaded = page.waitForEvent('download');
  await slot1.getByRole('button', { name: 'Export', exact: true }).click();
  const file = await downloaded, path = await file.path(), portable = await readFile(path, 'utf8');
  assert.equal(JSON.parse(portable).state.money, 456);
  await page.getByLabel('Import a Quarry save file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await page.getByRole('status').filter({ hasText: 'damaged' }).waitFor();
  assert.equal(await q(() => JSON.parse(localStorage.getItem('quarry.save.slot1')).state.money), 456);
  await page.getByLabel('Import a Quarry save file').setInputFiles({ name: 'company.quarry.json', mimeType: 'application/json', buffer: Buffer.from(portable) });
  await page.getByText('Ready to import', { exact: true }).waitFor();
  await page.getByLabel('Import destination').selectOption('slot2');
  await click('Import into selected slot');
  await page.getByRole('status').filter({ hasText: 'Imported into Slot 2' }).waitFor();
  assert.equal(await q(() => JSON.parse(localStorage.getItem('quarry.save.slot2')).state.money), 456);
  await desktop('save-manager');
  await page.setViewportSize({ width: 390, height: 844 }); await frames(2);
  await q(() => { document.querySelector('.overlay-saves').scrollTop = 0; });
  assert.equal(await q(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: `${out}/saves-narrow.png` });
  await page.setViewportSize({ width: 480, height: 270 });
  step('manual saves, previous revision, download, invalid import and selected-slot import');

  // Continue recovers a corrupt primary from its previous revision.
  await q(() => { localStorage.setItem('quarry.save.slot1', '{broken'); localStorage.removeItem('quarry.save.slot2'); });
  await page.reload(); await click('Continue');
  await page.waitForFunction(() => window.__quarry?.world);
  assert.equal(await q(() => window.__quarry.game.state.money), previousMoney);
  assert.equal(await q(() => window.__quarry.game.state.objectives.index), 1);
  assert.match(await page.locator('.log').innerText(), /previous revision/);
  await q(() => { window.__quarry.world.debug.scene.visible = false; });
  step('Continue automatically recovers a damaged primary with money and journal intact');

  // Quota failure must not dismiss the company; export remains possible without localStorage.
  await pause();
  await q(() => {
    window.__journeySetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('quarry.save.')) throw new DOMException('Storage full', 'QuotaExceededError');
      return window.__journeySetItem.call(this, key, value);
    };
  });
  await click('Save and quit');
  await page.getByText('Your company is still open', { exact: true }).waitFor();
  assert.equal(await page.locator('.game-screen').count(), 1);
  await click('OK'); await click('Save Game');
  const emergency = page.waitForEvent('download'); await click('Export current company');
  const emergencyFile = await emergency;
  assert.equal(JSON.parse(await readFile(await emergencyFile.path(), 'utf8')).state.money, previousMoney);
  await q(() => { Storage.prototype.setItem = window.__journeySetItem; delete window.__journeySetItem; });
  await page.keyboard.press('Escape');
  await click('Save and quit');
  await page.locator('.main-menu').waitFor();
  assert.equal(await page.locator('.game-screen').count(), 0);
  step('failed Save and quit keeps the company open; emergency export works; successful quit saves');

  await page.reload(); await click('Continue');
  await page.waitForFunction(() => window.__quarry?.world);
  await q(() => {
    const { game:g, world, gate } = window.__quarry;
    world.debug.scene.visible = false;
    g.data.persistence.autosaveSeconds = .05;
    gate.force(true);
    g.state.money = 789;
  });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('quarry.save.autosave'))?.state.money === 789);
  await q(() => { window.__quarry.gate.force(false); window.__quarry.game.data.persistence.autosaveSeconds = 300; });
  step('periodic autosave through the running game loop (shortened interval fixture)');

  // A completion fixture tests the final UI and persistence without pretending to play 22 goals.
  await q(() => {
    const g = window.__quarry.game;
    g.state.objectives.index = g.data.objectives.steps.length - 1;
    g.state.stats.totalEarned = g.data.objectives.steps.at(-1).target;
    g.actions.selectMachine(g.state.machines[0].id);
  });
  await page.keyboard.press('F2');
  await page.getByText('Your company is established', { exact: true }).waitFor();
  assert.equal(await page.locator('.fg-step.completed').count(), 22);
  await desktop('company-established');
  await page.keyboard.press('Escape');
  await pause(); await click('Save and quit'); await page.reload(); await click('Continue');
  await page.waitForFunction(() => window.__quarry?.world);
  assert.ok(await q(() => window.__quarry.game.state.objectives.completion.day));
  step('completed journey remains available after Save and Continue');
  assert.deepEqual(errors, [], 'console errors');
  console.log('PASS journey');
} finally { await browser.close(); }
