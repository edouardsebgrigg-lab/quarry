import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { loadData } from '../core/data.js';
import { staffState, openSlots, nextSlot, hireApplicant, assignWorker, dismissWorker, machinesFor } from './index.js';
import { quoteDelivery } from '../economy/index.js';
import { startJob, getStats, serviceCost } from '../machinery/index.js';

// A business far enough along for its first employee.
const setup = ({ earned = 3500 } = {}) => {
  const data = loadData();
  data.milestones.list = []; // (no rewards landing mid-test)
  const game = createGame({ seed: 9, data });
  game.state.money = 50000;
  game.state.stats.totalEarned = earned;
  game.actions.buyMachine('excavator', 'used');
  game.actions.buyMachine('truck', 'used');
  game.dev.skipDays(1); // (the post opens and applicants come in the morning)
  return game;
};
const hire = (game) => {
  const a = staffState(game.ctx).applicants[0];
  const r = hireApplicant(game.ctx, a.id);
  expect(r.ok).toBe(true);
  return r.worker;
};

describe('staff', () => {
  it('no one to hire until the business is going; the first post opens at the first threshold', () => {
    const game = setup({ earned: 100 });
    expect(openSlots(game.ctx)).toBe(0);
    expect(staffState(game.ctx).applicants).toHaveLength(0);
    expect(nextSlot(game.ctx).parts[0]).toMatchObject({ label: 'Earned', have: 100, need: 120 });
    game.state.stats.totalEarned = 3500;
    game.dev.skipDays(1);
    expect(openSlots(game.ctx)).toBe(1);
    expect(staffState(game.ctx).applicants.length).toBe(game.data.staff.applicants);
  });

  it('a second post needs a lot more: one person until then', () => {
    const game = setup();
    hire(game);
    const a = staffState(game.ctx).applicants[0];
    expect(hireApplicant(game.ctx, a?.id ?? 'x').ok).toBe(false);
    expect(nextSlot(game.ctx).parts.find((p) => p.label === 'Earned').need).toBe(20000);
  });

  it('charges an agency fee to hire and a wage every morning', () => {
    const game = setup();
    const before = game.state.money;
    const a = staffState(game.ctx).applicants[0];
    hireApplicant(game.ctx, a.id);
    expect(game.state.money).toBeCloseTo(before - a.wage * (a.apprentice ? game.data.staff.apprentice.feeDays : game.data.staff.hiringFeeDays), 2);
    const paid = [];
    game.events.on('wagesPaid', (e) => paid.push(e.amount));
    game.dev.skipDays(2);
    expect(paid).toEqual([a.wage, a.wage]);
  });

  it('a digger operator digs out the field and heaps it beside the machine', () => {
    const game = setup();
    const w = hire(game);
    const ex = game.state.machines.find((m) => m.type === 'excavator');
    expect(machinesFor(game.ctx, 'dig', w)).toContain(ex);
    expect(assignWorker(game.ctx, w.id, 'dig', { machineId: ex.id }).ok).toBe(true);
    expect(ex.operator).toBe(w.id);
    const dug = game.state.stats.tonnesDug;
    game.dev.skipDays(1);
    expect(w.stats.dug).toBeGreaterThan(5);
    expect(game.state.stats.tonnesDug).toBeGreaterThan(dug);
    expect(game.actions.sellMachine(ex.id).ok).toBe(false); // (someone's working it)
  });

  it('a haulage driver takes the heaps to the depot and sells them', () => {
    const game = setup();
    const w = hire(game);
    const truck = game.state.machines.find((m) => m.type === 'truck');
    // Heap some topsoil on the field to haul.
    const g = game.ctx.ground;
    const at = { x: g.x0 + (g.nx * g.cellSize) / 2, z: g.z0 + (g.nz * g.cellSize) / 2 };
    g.deposit({ ...at, tonnes: { topsoil: 12 }, radius: 3 });
    const sales = [];
    game.events.on('productSold', (e) => sales.push(e));
    const outs = [];
    game.events.on('staffTripOut', (e) => outs.push(e));
    expect(assignWorker(game.ctx, w.id, 'haul', { machineId: truck.id }).ok).toBe(true);
    game.dev.skipDays(3);
    expect(outs.length).toBeGreaterThan(0);
    expect(sales.length).toBeGreaterThan(0);
    expect(sales[0].machineId).toBe(truck.id);
    expect(sales[0].productId).toBe('topsoil');
    expect(w.stats.loads).toBeGreaterThan(0);
  });

  it('a sales person gets more for every load', () => {
    const game = setup();
    const q0 = quoteDelivery(game.ctx, 'topsoil', { topsoil: 5 }).gross;
    const w = hire(game);
    assignWorker(game.ctx, w.id, 'sales');
    const q1 = quoteDelivery(game.ctx, 'topsoil', { topsoil: 5 }).gross;
    expect(q1).toBeCloseTo(q0 * (1 + w.skills.sell * game.data.staff.sales.bonusPerStar), 4);
  });

  it('a fitter services worn machines on their own and makes the work cheaper', () => {
    const game = setup();
    const w = hire(game);
    const ex = game.state.machines.find((m) => m.type === 'excavator');
    ex.condition = 30;
    const fullPrice = serviceCost(getStats(game.data, ex), ex);
    assignWorker(game.ctx, w.id, 'mechanic');
    game.dev.skipHours(4);
    expect(ex.condition).toBe(100);
    expect(w.stats.fixed).toBe(1);
    const truck = game.state.machines.find((m) => m.type === 'truck');
    truck.condition = 50;
    expect(startJob(game.ctx, truck.id, 'service', { byPlayer: false }).ok).toBe(true);
    expect(truck.job.cost).toBeLessThan(serviceCost(getStats(game.data, truck), { ...truck, condition: 50 }));
    expect(fullPrice).toBeGreaterThan(0);
  });

  it('letting someone go frees their machine and pays their notice', () => {
    const game = setup();
    const w = hire(game);
    const ex = game.state.machines.find((m) => m.type === 'excavator');
    assignWorker(game.ctx, w.id, 'dig', { machineId: ex.id });
    const before = game.state.money;
    const r = dismissWorker(game.ctx, w.id);
    expect(r.ok).toBe(true);
    expect(ex.operator).toBe(null);
    expect(game.state.money).toBeCloseTo(before - w.wage * game.data.staff.noticeDays, 2);
    expect(staffState(game.ctx).workers).toHaveLength(0);
  });

  it('staff and what they’re doing are saved with the game', () => {
    const game = setup();
    const w = hire(game);
    const ex = game.state.machines.find((m) => m.type === 'excavator');
    assignWorker(game.ctx, w.id, 'dig', { machineId: ex.id });
    game.dev.skipHours(3);
    const saved = JSON.parse(JSON.stringify(game.snapshot()));
    const g2 = createGame({ seed: 9, data: game.data, state: saved });
    const w2 = staffState(g2.ctx).workers[0];
    expect(w2).toMatchObject({ name: w.name, role: 'dig', machineId: ex.id });
    const dug = w2.stats.dug;
    g2.dev.skipHours(6);
    expect(w2.stats.dug).toBeGreaterThan(dug);
  });
});
