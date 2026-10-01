import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { loadData } from '../core/data.js';
import { insuranceCover, setInsuranceCover, weeklyInsurance, repairShare } from './index.js';
import { startJob, getStats } from '../machinery/index.js';

const setup = () => {
  const data = loadData();
  data.milestones.list = []; // (no rewards landing mid-test)
  const game = createGame({ seed: 5, data });
  game.state.money = 5000;
  return game;
};

describe('machine insurance cover', () => {
  it('starts on basic: the old weekly rate, with half of each repair paid', () => {
    const game = setup();
    expect(insuranceCover(game.ctx)).toMatchObject({ id: 'basic', weeklyRate: 0.03, repairShare: 0.5 });
    const m = game.state.machines[0];
    m.broken = true;
    expect(startJob(game.ctx, m.id, 'repair').ok).toBe(true);
    expect(m.job.cost).toBeCloseTo(getStats(game.data, m).repairCost * 0.5);
  });

  it('costs more each week for more cover, and nothing with none', () => {
    const game = setup();
    expect(weeklyInsurance(game.ctx, 'none')).toBe(0);
    expect(weeklyInsurance(game.ctx, 'full')).toBeGreaterThan(weeklyInsurance(game.ctx, 'basic'));
  });

  it('changes cover only when the policy renews', () => {
    const game = setup();
    const r = setInsuranceCover(game.ctx, 'full');
    expect(r.ok).toBe(true);
    expect(repairShare(game.ctx)).toBe(0.5); // (not yet)
    const renewed = [];
    game.events.on('insuranceRenewed', (e) => renewed.push(e.cover));
    game.dev.skipDays(r.from - 1);
    expect(renewed).toEqual(['full']);
    expect(repairShare(game.ctx)).toBe(0.15);
    expect(game.state.bank.statement.filter((s) => s.reason === 'insurance').at(-1).amount).toBeCloseTo(-weeklyInsurance(game.ctx, 'full'), 2);
  });

  it('choosing the cover you already have cancels a change', () => {
    const game = setup();
    setInsuranceCover(game.ctx, 'none');
    setInsuranceCover(game.ctx, 'basic');
    expect(game.state.insurance.next).toBe(null);
  });
});
