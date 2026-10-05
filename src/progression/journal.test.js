import { it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { currentObjective, journeyJournal, markIntroSeen } from './index.js';
import { tickJobs } from '../machinery/index.js';
import { pileTotal } from '../quarry/index.js';
import { loadData } from '../core/index.js';
import { DEFAULT_BINDINGS } from '../input/index.js';
import { handbookText, searchHandbook } from '../ui/game/laptop/handbookText.js';

it('remembers a direct pickup delivery and an upgrade before the barrow lesson, including after reload', () => {
  const g = createGame({ seed: 11 }), pickup = g.state.machines[0];
  expect(g.actions.buyMod(pickup.id, 'stifferSprings').ok).toBe(true);
  for (let i = 0; pileTotal(pickup.load) < .31 && i < 100; i++) {
    expect(g.actions.shovelDig({ x: 30 + i % 10, z: 30 + Math.floor(i / 10) }).ok).toBe(true);
    expect(g.actions.shovelDump({ into: 'machine', machineId: pickup.id }).ok).toBe(true);
  }
  expect(currentObjective(g.ctx).id).toBe('fillBarrow');
  expect(g.actions.weighIn(pickup.id).ok).toBe(true);
  expect(g.actions.tip(pickup.id, { bay: 'topsoil' }).ok).toBe(true);
  for (let i = 0; pickup.job && i < 1000; i++) tickJobs(g.ctx, .1);
  expect(pileTotal(pickup.load)).toBe(0);
  const restored = createGame({ data: g.data, state: g.snapshot() });
  for (let i = 0; i < 20 && currentObjective(restored.ctx).id === 'fillBarrow'; i++) {
    restored.actions.shovelDig({ x: 50 + i % 10, z: 30 + Math.floor(i / 10) });
    restored.actions.shovelDump({ into: 'barrow' });
  }
  expect(currentObjective(restored.ctx).id).toBe('buyMiniDigger');
  expect(restored.state.objectives.history).toHaveProperty('weighIn');
  expect(restored.state.objectives.history).toHaveProperty('firstMod');
  const money = restored.state.money;
  restored.actions.selectMachine(pickup.id);
  expect(restored.state.money).toBe(money);
});

it('records the final reward and company once, persists them and lets free play continue', () => {
  const g = createGame({ seed: 12 }), o = g.state.objectives;
  o.index = g.data.objectives.steps.length - 1;
  const step = currentObjective(g.ctx), events = [];
  g.events.on('journeyCompleted', e => events.push(e));
  g.state.stats.totalEarned = step.target;
  const rewards = [];
  g.events.on('moneyChanged', e => { if (e.reason === 'objective') rewards.push(e.amount); });
  g.actions.selectMachine(g.state.machines[0].id);
  expect(rewards).toEqual([step.reward]); // Earned-income milestones may also catch up in this fixture.
  expect(events).toHaveLength(1);
  expect(rewards).toEqual([step.reward]);
  expect(o.history[step.id]).toMatchObject({ day: 1, reward: step.reward });
  const record = structuredClone(o.completion);
  g.state.stats.totalEarned += 1234;
  expect(g.actions.shovelDig({ x: 40, z: 40 }).ok).toBe(true);
  expect(o.completion).toEqual(record);
  expect(events).toHaveLength(1);
  const restored = createGame({ data: g.data, state: g.snapshot() });
  restored.actions.selectMachine(restored.state.machines[0].id);
  expect(restored.state.money).toBe(g.state.money);
  expect(restored.state.objectives.completion).toEqual(record);
  expect(journeyJournal(restored.ctx).every(s => s.status === 'completed')).toBe(true);
});

it('backfills old completion without inventing dates, replaying rewards or a graduation', () => {
  const g = createGame({ seed: 12 }), state = g.snapshot();
  state.objectives = { index: g.data.objectives.steps.length, introSeen: true };
  const restored = createGame({ data: g.data, state }), events = [];
  restored.events.on('journeyCompleted', e => events.push(e));
  restored.actions.selectMachine(restored.state.machines[0].id);
  expect(restored.state.money).toBe(state.money);
  expect(events).toHaveLength(0);
  expect(restored.state.objectives.completion).toEqual({ legacy: true });
  expect(journeyJournal(restored.ctx).every(s => s.record.legacy && s.record.day === undefined)).toBe(true);
});

it('turns off guide reminders while keeping rules, rewards and saved progress', () => {
  const g = createGame({ seed: 13 }), messages = [];
  g.events.on('mentorMessage', e => messages.push(e));
  expect(g.actions.setGuideEnabled(false).ok).toBe(true);
  markIntroSeen(g.ctx);
  expect(g.actions.shovelDig({ x: 30, z: 20 }).ok).toBe(true);
  expect(currentObjective(g.ctx).id).toBe('fillBarrow');
  expect(messages.filter(e => e.kind === 'goal')).toHaveLength(0);
  expect(createGame({ data: g.data, state: g.snapshot() }).state.objectives.guideEnabled).toBe(false);
  expect(g.actions.setGuideEnabled('false').ok).toBe(false);
  expect(g.actions.setGuideEnabled(true).ok).toBe(true);
  markIntroSeen(g.ctx);
  expect(messages.at(-1).kind).toBe('goal');
});

it('does not block a separate company progressing inside a completion listener', () => {
  const a = createGame({ seed: 14 }), b = createGame({ seed: 15 });
  a.events.on('objectiveCompleted', () => b.actions.shovelDig({ x: 30, z: 20 }));
  a.actions.shovelDig({ x: 30, z: 20 });
  expect(currentObjective(a.ctx).id).toBe('fillBarrow');
  expect(currentObjective(b.ctx).id).toBe('fillBarrow');
});

it('covers the whole journey with valid help links and binding tokens', () => {
  const data = loadData(), ids = data.objectives.steps.map(s => s.id), { articles, chapters } = data.handbook;
  expect(chapters.flatMap(c => c.goals)).toEqual(ids);
  const coverage = new Set(articles.flatMap(a => a.goals ?? []));
  expect(ids.filter(id => !coverage.has(id))).toEqual([]);
  for (const a of articles) {
    for (const id of a.related) expect(articles.some(x => x.id === id), `${a.id}: ${id}`).toBe(true);
    for (const id of a.goals ?? []) expect(ids.includes(id)).toBe(true);
    for (const token of JSON.stringify(a).matchAll(/\{(\w+)\}/g)) expect(DEFAULT_BINDINGS).toHaveProperty(token[1]);
  }
  expect(handbookText('Press {interact}, then {tip}.', { ...DEFAULT_BINDINGS, interact: 'KeyY', tip: 'KeyN' })).toBe('Press Y, then N.');
  expect(handbookText('Press {interact}', { interact: null })).toBe('Press —');
  expect(searchHandbook(articles, '  BEDrock  bucket ').some(a => a.id === 'digging')).toBe(true);
  expect(searchHandbook(articles, 'no matching text anywhere')).toEqual([]);
});
