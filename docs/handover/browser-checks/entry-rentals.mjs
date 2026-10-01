// Normal $200 entry: owned Micro 08, two conserved 0.1t sales, immediate apprentice UI hire.
// Rental UI uses an explicitly recorded cash fixture; cargo comes from real digging actions.
import { writeFileSync } from 'node:fs';
import { start } from './common.mjs';
const { browser, page, q, frames, shot, newGame, errors } = await start({ width: 960, height: 540 });
page.setDefaultTimeout(30000);
const report = { checks: [], normalMoney: {}, rentalFixture: {}, saved: null, restored: null };
const check = (condition, label) => {
  report.checks.push({ label, passed: !!condition });
  if (!condition) throw new Error(label);
};
const app = async label => {
  await page.locator('.lt-dock-app', { hasText: label }).click();
  await frames(2);
};
const capture = async (name, target) => {
  await page.setViewportSize({ width: 960, height: 540 }); await frames(2);
  await target.scrollIntoViewIfNeeded(); await frames(2);
  await shot(name, { big: false });
};
try {
  await newGame({ force: false });
  await page.addStyleTag({ content: '.overlay:has(.overlay-laptop) { backdrop-filter: none !important; }' });
  report.normalMoney.purchase = await q(() => {
    const g = window.__quarry.game, start = g.state.money;
    const r = g.actions.buyMachine('miniDigger', 'micro08');
    window.__entry = { micro: r.machine?.id, pickup: g.state.machines.find(m => m.type === 'pickup').id, sales: [] };
    g.events.on('productSold', sale => window.__entry.sales.push(sale));
    return { start, ok: r.ok, money: g.state.money, paid: start - g.state.money, tick: g.state.time.tick };
  });
  check(report.normalMoney.purchase.start === 200 && report.normalMoney.purchase.ok && report.normalMoney.purchase.paid === 180,
    'Normal starting $200 buys the $180 Micro 08 without a cash fixture');
  const deliver = async index => q(index => {
    const g = window.__quarry.game, e = window.__entry;
    const micro = g.state.machines.find(m => m.id === e.micro), pickup = g.state.machines.find(m => m.id === e.pickup);
    const must = r => { if (!r.ok) throw new Error(r.reason); return r; };
    const finish = m => g.advance(Math.ceil((m.job.duration - m.job.elapsed) * g.data.game.ticksPerSecond) + 1);
    for (let n = 0; (pickup.load.topsoil ?? 0) < .1 - 1e-8 && n < 8; n++) {
      if (!Object.values(micro.load).some(t => t > 1e-8)) {
        must(g.actions.scoop(micro.id, { x: 40.25 + index * 8 + n, z: 40.25 }));
        finish(micro);
      }
      const total = Object.values(micro.load).reduce((a, b) => a + b, 0);
      must(g.actions.dumpBucket(micro.id, { machineId: pickup.id }, (.1 - (pickup.load.topsoil ?? 0)) / total));
    }
    const load = { ...pickup.load };
    must(g.actions.weighIn(pickup.id));
    must(g.actions.tip(pickup.id, { bay: 'topsoil' }));
    finish(pickup);
    return { load, money: g.state.money, sale: e.sales.at(-1), deliveries: g.state.stats.deliveries,
      apprentice: g.state.staff?.applicants.find(a => a.apprentice) ?? null, tick: g.state.time.tick };
  }, index);
  report.normalMoney.firstSale = await deliver(0);
  check(Math.abs(report.normalMoney.firstSale.sale.tonnes - .1) < 1e-8 && report.normalMoney.firstSale.sale.productId === 'topsoil',
    'First clean 0.1t sale uses digging, loading, weighing and depot tipping actions');
  check(!report.normalMoney.firstSale.apprentice, 'One sale leaves the apprentice post closed');
  report.normalMoney.secondSale = await deliver(1);
  check(Math.abs(report.normalMoney.secondSale.sale.tonnes - .1) < 1e-8 && report.normalMoney.secondSale.deliveries === 2,
    'Second clean 0.1t sale increments real delivery count');
  check(report.normalMoney.secondSale.apprentice?.wage === 18, 'Second sale creates the $18 apprentice immediately');
  const rate = await q(() => window.__quarry.game.state.time.ticksPerDay);
  check(report.normalMoney.secondSale.tick < rate, 'Apprentice opens on day one without waiting for dawn');
  await page.keyboard.press('KeyB'); await frames(2); await app('Staff');
  const apprentice = page.locator('.st-applicant').filter({ hasText: 'Apprentice' });
  check(await apprentice.count() === 1, 'Staff UI shows the immediate apprentice applicant');
  await capture('entry-apprentice-applicant', apprentice);
  const beforeHire = await q(() => {
    window.__entry.hireMoneyEvents = [];
    window.__quarry.game.events.on('moneyChanged', e => window.__entry.hireMoneyEvents.push(e));
    return window.__quarry.game.state.money;
  });
  await apprentice.getByRole('button', { name: 'Hire · $18 fee', exact: true }).click();
  await frames(2);
  report.normalMoney.hired = await q(() => ({ money: window.__quarry.game.state.money, workers: window.__quarry.game.state.staff.workers,
    moneyEvents: window.__entry.hireMoneyEvents }));
  check(report.normalMoney.hired.workers.length === 1 && report.normalMoney.hired.workers[0].wage === 18
    && beforeHire >= 18 && report.normalMoney.hired.moneyEvents.some(e => e.amount === -18)
    && report.normalMoney.hired.money >= 0,
  'Actual Staff Hire button charges $18 from normal opening money and creates a worker');

  report.rentalFixture = await q(() => {
    const g = window.__quarry.game, before = g.state.money;
    g.state.money = 1000;
    return { description: 'Rental-only cash fixture; entry hire above used normal money', before, fixtureCash: 1000,
      oneDay: g.actions.rentalQuote('miniDigger', 'mini16', 1), threeDays: g.actions.rentalQuote('miniDigger', 'mini16', 3) };
  });
  await app('Plant dealer');
  await page.locator('.lt-tile').filter({ hasText: 'Mini 16' }).click(); await frames(2);
  const oneDayHire = page.locator('.lt-rental-row').filter({ hasText: /^1 day ·/ }).getByRole('button', { name: 'Hire', exact: true });
  const threeDayHire = page.locator('.lt-rental-row').filter({ hasText: /^3 days ·/ }).getByRole('button', { name: 'Hire', exact: true });
  check(await oneDayHire.count() === 1 && await threeDayHire.count() === 1,
  'Dealer exposes both one-day and three-day rentals with deposit labels');
  await capture('entry-rental-dealer', oneDayHire);
  await oneDayHire.click(); await frames(2);
  report.rentalFixture.rented = await q(() => {
    const g = window.__quarry.game, m = g.state.machines.find(m => m.rental);
    window.__entry.rental = m.id;
    return { id: m.id, rental: { ...m.rental }, money: g.state.money, tick: g.state.time.tick };
  });
  check(report.rentalFixture.rented.money === 1000 - report.rentalFixture.oneDay.total,
    'Dealer rental button charges its quoted fee and security deposit');
  check(Math.abs(report.rentalFixture.rented.rental.due - report.rentalFixture.rented.tick / rate - 1) < 1e-8,
    'One-day rental deadline uses the 20-minute business calendar');
  await app('Fleet');
  check(await page.getByRole('button', { name: 'Return hire', exact: true }).count() === 1,
    'Fleet displays a real Return hire control');
  const loaded = await q(() => {
    const g = window.__quarry.game, m = g.state.machines.find(m => m.id === window.__entry.rental);
    const result = g.actions.scoop(m.id, { x: 64.25, z: 40.25 });
    if (!result.ok) throw new Error(result.reason);
    g.advance(Math.ceil(m.job.duration * g.data.game.ticksPerSecond) + 1);
    g.advanceVisualTime(11.25);
    return { load: { ...m.load }, money: g.state.money };
  });
  await page.getByRole('button', { name: 'Return hire', exact: true }).click(); await frames(2);
  check(await q(({ id, load, money }) => {
    const g = window.__quarry.game, m = g.state.machines.find(m => m.id === id);
    return !!m && JSON.stringify(m.load) === JSON.stringify(load) && g.state.money === money;
  }, { id: report.rentalFixture.rented.id, ...loaded }), 'Fleet refuses a loaded return without losing cargo or money');
  check(await page.getByText('Unload the rented machine first', { exact: true }).count() > 0,
    'Loaded-return refusal is explained in the visible UI');
  await shot('entry-rental-fleet-loaded');
  report.saved = await q(() => {
    const g = window.__quarry.game;
    window.__quarry.saveTo('slot1');
    const m = g.state.machines.find(m => m.id === window.__entry.rental);
    return { id: m.id, rental: { ...m.rental }, load: { ...m.load }, condition: m.condition, time: { ...g.state.time }, money: g.state.money,
      workerId: g.state.staff.workers[0].id };
  });
  await page.reload(); await page.getByText('Continue', { exact: true }).click();
  await page.waitForFunction(() => window.__quarry?.world); await frames(3);
  report.restored = await q(id => {
    const g = window.__quarry.game, m = g.state.machines.find(m => m.id === id);
    return { rental: { ...m.rental }, load: { ...m.load }, time: { ...g.state.time }, money: g.state.money,
      workerId: g.state.staff.workers[0].id };
  }, report.saved.id);
  check(JSON.stringify(report.restored.rental) === JSON.stringify(report.saved.rental)
    && JSON.stringify(report.restored.load) === JSON.stringify(report.saved.load), 'Rental contract and actual cargo survive browser save/reload');
  check(JSON.stringify(report.restored.time) === JSON.stringify(report.saved.time) && report.restored.time.ticksPerDay === 12000,
    'Business tick, 12000-tick day rate and independent visual clock survive browser save/reload');
  check(report.restored.money === report.saved.money && report.restored.workerId === report.saved.workerId,
    'Cash and the apprentice hired through UI survive browser save/reload');
  await page.keyboard.press('KeyB'); await frames(2); await app('Fleet');
  await page.getByRole('button', { name: 'Return hire', exact: true }).click(); await frames(2);
  check(await q(id => !!window.__quarry.game.state.machines.find(m => m.id === id), report.saved.id),
    'Restored loaded hire still refuses to return');
  await q(id => {
    const r = window.__quarry.game.actions.dumpBucket(id, { x: 65.25, z: 40.25 });
    if (!r.ok) throw new Error(r.reason);
  }, report.saved.id);
  const beforeReturn = await q(() => window.__quarry.game.state.money);
  await page.getByRole('button', { name: 'Return hire', exact: true }).click(); await frames(3);
  report.rentalFixture.returned = await q(id => ({ removed: !window.__quarry.game.state.machines.some(m => m.id === id),
    money: window.__quarry.game.state.money }), report.saved.id);
  const damageRate = await q(() => window.__quarry.game.data.rental.damagePerCondition);
  const expectedRefund = Math.max(0, report.saved.rental.deposit
    - Math.max(0, report.saved.rental.startCondition - report.saved.condition) * damageRate);
  report.rentalFixture.refundObserved = report.rentalFixture.returned.money - beforeReturn;
  check(report.rentalFixture.returned.removed && Math.abs(report.rentalFixture.refundObserved - expectedRefund) < 1e-8,
    'Fleet Return hire removes empty equipment and refunds its damage-adjusted security deposit');
  await shot('entry-rental-returned');
  check(errors.length === 0, 'No browser console or runtime errors');
} catch (error) {
  report.failure = error.stack ?? String(error);
  throw error;
} finally {
  report.errors = errors;
  writeFileSync(`${process.env.OUT}/entry-rentals.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
