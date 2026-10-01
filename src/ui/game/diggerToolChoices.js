// Read-only attachment descriptions and availability. The game action still validates a swap.
import { getStats, isDigger } from '../../machinery/index.js';
import { pileTotal } from '../../quarry/index.js';

const TOOLS = {
  standard: { name: 'Standard bucket', purpose: 'General digging and loading.' },
  trench: { name: 'Trenching bucket', purpose: 'Narrow cuts for trenches and small bites.' },
  grading: { name: 'Grading bucket', purpose: 'Wide, shallow cuts for shaping and loose spoil.' },
  breaker: { name: 'Hydraulic breaker', purpose: 'Break rock into rubble, then scoop it with a bucket.' },
};

export function diggerToolChoices(data, machine, { busy = false } = {}) {
  if (!machine || !isDigger(data, machine.type)) return { reason: 'Get into a digger to choose a tool', choices: [] };
  const reason = machine.rental ? 'Rented equipment must be returned with its original tool.'
    : machine.job || busy ? 'Stop the machine and finish the current stroke before changing tools.'
    : pileTotal(machine.load ?? {}) > 1e-6 ? 'Empty the bucket before changing tools.' : null;
  const compatible = getStats(data, machine).attachments ?? ['standard', 'trench', 'grading'];
  const choices = compatible.map(id => {
    const stats = getStats(data, { ...machine, attachment: id });
    const equipped = (machine.attachment ?? 'standard') === id;
    return {
      id, ...(TOOLS[id] ?? { name: id, purpose: 'Compatible attachment.' }), equipped,
      disabled: equipped || !!reason,
      specs: id === 'breaker' ? `${Math.round(stats.breakoutForce ?? 0)} kN breaking force`
        : `${(stats.bucketWidth ?? .9).toFixed(2)} m wide · ${(stats.bucketVolume ?? 0).toFixed(2)} m³`,
    };
  });
  return { reason, choices };
}
