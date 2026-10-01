import { describe, it, expect } from 'vitest';
import { createTestGame } from '../../game/testing.js';
import { getStats } from '../../machinery/index.js';
import { diggerToolChoices } from './diggerToolChoices.js';

const ownedDigger = () => {
  const game = createTestGame(81);
  const machine = game.state.machines.find(m => m.type === 'excavator');
  machine.tier = 'utility80';
  return { game, machine };
};

describe('cab attachment choices', () => {
  it('shows the model-compatible tools with the current tool marked equipped', () => {
    const { game, machine } = ownedDigger();
    const result = diggerToolChoices(game.data, machine);
    expect(result.reason).toBeNull();
    expect(result.choices.map(tool => tool.id)).toEqual(getStats(game.data, machine).attachments);
    expect(result.choices.find(tool => tool.id === 'standard')).toMatchObject({ equipped: true, disabled: true });
    expect(result.choices.find(tool => tool.id === 'breaker')).toMatchObject({ equipped: false, disabled: false });
  });
  it('preserves the legacy model bucket set without offering a breaker', () => {
    const { game, machine } = ownedDigger();
    machine.type = 'miniDigger'; machine.tier = 'rusty';
    const offered = diggerToolChoices(game.data, machine).choices.map(tool => tool.id);
    expect(offered).toEqual(['standard', 'trench', 'grading']);
    expect(offered).not.toContain('breaker');
  });
  it('previews each tool from the base machine without compounding the equipped modifiers', () => {
    const { game, machine } = ownedDigger();
    machine.attachment = 'trench';
    const snapshot = JSON.stringify(machine);
    const result = diggerToolChoices(game.data, machine);
    const standard = getStats(game.data, { ...machine, attachment: 'standard' });
    expect(result.choices.find(tool => tool.id === 'standard').specs).toBe(`${standard.bucketWidth.toFixed(2)} m wide · ${standard.bucketVolume.toFixed(2)} m³`);
    expect(JSON.stringify(machine)).toBe(snapshot);
  });
  it('explains a loaded bucket and agrees with the authoritative swap rejection', () => {
    const { game, machine } = ownedDigger();
    machine.load = { clay: .01 };
    const result = diggerToolChoices(game.data, machine);
    expect(result.reason).toMatch(/Empty the bucket/);
    expect(result.choices.every(tool => tool.disabled)).toBe(true);
    expect(game.actions.setDiggerAttachment(machine.id, 'trench').ok).toBe(false);
    expect(machine.load).toEqual({ clay: .01 });
  });
  it('keeps the choices locked during an empty but unfinished arm stroke', () => {
    const { game, machine } = ownedDigger();
    expect(machine.job).toBeNull();
    const result = diggerToolChoices(game.data, machine, { busy: true });
    expect(result.reason).toMatch(/Stop the machine and finish the current stroke/);
    expect(result.choices.every(tool => tool.disabled)).toBe(true);
  });
  it('explains rental restrictions before other unavailable states', () => {
    const { game, machine } = ownedDigger();
    machine.rental = { originalAttachment: 'standard' }; machine.load = { clay: .1 };
    const result = diggerToolChoices(game.data, machine, { busy: true });
    expect(result.reason).toMatch(/Rented equipment/);
    expect(result.choices.every(tool => tool.disabled)).toBe(true);
    expect(game.actions.setDiggerAttachment(machine.id, 'grading').ok).toBe(false);
  });
  it('gives a cab instruction instead of offering tools on a carrier or on foot', () => {
    const { game } = ownedDigger();
    expect(diggerToolChoices(game.data, null).choices).toEqual([]);
    expect(diggerToolChoices(game.data, game.state.machines.find(m => m.type === 'truck')).choices).toEqual([]);
  });
});
