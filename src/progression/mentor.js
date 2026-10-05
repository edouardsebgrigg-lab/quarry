// The mentor: Ray, who sold you the field, texts you. A message when each goal comes up (the
// recommended next move, from data/objectives.json), and one-off tips when something happens
// that a new player might not know how to handle. Tips are remembered in the save so they're
// only sent once. Sends `mentorMessage` events ({ from, text, kind }); the UI shows them.

function mentorState(ctx) {
  ctx.state.mentor ??= { seen: {} };
  return ctx.state.mentor;
}

function send(ctx, text, kind) {
  ctx.events.emit('mentorMessage', { from: ctx.data.objectives.mentor?.name ?? 'Ray', text, kind });
}

// A tip, once per game.
function tip(ctx, id) {
  const m = mentorState(ctx);
  const text = ctx.data.objectives.mentor?.tips?.[id];
  if (!text || m.seen[id]) return;
  m.seen[id] = true;
  send(ctx, text, 'tip');
}

// The message for the current goal (when it comes up, or when the game starts).
export function mentorForStep(ctx, step) {
  if (ctx.state.objectives?.guideEnabled!==false && step?.mentor) send(ctx, step.mentor, 'goal');
}

export function mentorOnEvent(ctx, type, payload) {
  switch (type) {
    case 'objectiveCompleted':
      if (payload.next) mentorForStep(ctx, payload.next);
      break;
    case 'machineBought':
      if (['miniDigger', 'dumper', 'tractor', 'excavator'].includes(payload.type)) tip(ctx, 'works');
      break;
    case 'machineBrokeDown':
      tip(ctx, 'breakdown');
      break;
    case 'inspectionAnnounced':
      tip(ctx, 'inspector');
      break;
    case 'productSold':
      if (payload.purity < 0.95 && payload.bayId !== ctx.data.depot.mixedProduct) tip(ctx, 'mixedLoad');
      break;
    case 'jobCompleted': {
      const m = ctx.state.machines.find((x) => x.id === payload.machineId);
      if (m && m.condition < 40 && !m.broken) tip(ctx, 'worn');
      if (ctx.state.money < 10) tip(ctx, 'broke');
      break;
    }
    default:
  }
}
