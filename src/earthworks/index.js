// Building with material on your own land: haul roads, ramps and levelled areas.
// The ground does the earth moving (src/ground); this decides what the player may ask for,
// what it costs, and charges for it. Nothing is created from nothing: the road is built from
// what is dug out of it plus loose heaps you have tipped within reach, and any left over is
// heaped beside it (see docs/modules.md).
import { spendMoney } from '../economy/index.js';

export const WORKS_MODES = ['road', 'ramp', 'level'];

const pct = (g) => `${Math.round(g * 100)}%`;
const t1 = (n) => `${n.toFixed(1)} t`;
const money = (n) => `$${Math.round(n)}`;

export function worksConfig(data, mode) {
  return data.works.modes[mode] ?? null;
}

export const clampWidth = (data, mode, width) => {
  const w = worksConfig(data, mode)?.width;
  if (!w) return width;
  return Math.min(w.max, Math.max(w.min, width ?? w.default));
};

// What the player chose ({ mode, ax, az, bx, bz, width }) as the ground's job.
export function worksSpec(data, input) {
  const cfg = worksConfig(data, input.mode);
  return {
    ax: input.ax, az: input.az, bx: input.bx, bz: input.bz,
    width: clampWidth(data, input.mode, input.width),
    mode: input.mode,
    surface: cfg.surface,
    surfaceThickness: cfg.surfaceThickness,
    maxGrade: cfg.maxGrade,
    sourceRadius: data.works.sourceRadius,
    obstacles: (input.obstacles ?? []).map(o => ({ ...o, r: (o.r ?? 0) + data.works.clearance })),
  };
}

export const worksCost = (data, mode, area) => {
  const cfg = worksConfig(data, mode);
  return Math.round(cfg.flat + cfg.ratePerM2 * area);
};

// Says what would happen, changing nothing. Returns:
//  { ok, reason?, affordable, cost, ...the ground's numbers (length, grade, tonnes, ...) }
// `ok` means it can be built right now (valid and paid for). `input.obstacles` is a list of
// { x, z, r, label } (machines and the barrow) that mustn't be under the works.
// The player is repositioned by the world after worksBuilt, and does not block.
export function planEarthworks(ctx, input) {
  const { data, ground } = ctx;
  const cfg = worksConfig(data, input.mode);
  const bad = (reason, extra = {}) => ({ ok: false, valid: false, affordable: false, cost: 0, reason, mode: input.mode, ...extra });
  if (!ground) return bad('There is no ground of yours to build on here');
  if (!cfg) return bad('Unknown kind of works');
  if (input.width !== undefined && !Number.isFinite(input.width)) return bad('Pick a finite width');
  if ([input.ax, input.az, input.bx, input.bz].some((v) => !Number.isFinite(v))) return bad('Pick where it starts and ends');
  const length = Math.hypot(input.bx - input.ax, input.bz - input.az);
  if (length < data.works.minLength) return bad(`Too short: at least ${data.works.minLength} m`, { length });
  if (length > data.works.maxLength) return bad(`Too long: at most ${data.works.maxLength} m at a time`, { length });
  const spec = worksSpec(data, input);
  const p = ground.planWorks(spec);
  const cost = p.coreArea ? worksCost(data, input.mode, p.coreArea) : 0;
  const out = { ...p, mode: input.mode, name: cfg.name, valid: p.ok, cost, affordable: false };
  if (!p.ok) {
    out.reason = worksReason(p, cfg, data);
    return out;
  }
  for (const o of input.obstacles ?? []) {
    if (p.touchesChangedCell({ x: o.x, z: o.z, r: (o.r ?? 0) + data.works.clearance })) {
      return { ...out, ok: false, valid: false, reason: `Move ${o.label ?? 'the obstacle'} out of the works first` };
    }
  }
  out.affordable = ctx.state.money >= cost && ctx.state.money >= 0;
  if (!out.affordable) {
    out.ok = false;
    out.reason = `It costs ${money(cost)} and you have ${money(Math.max(0, ctx.state.money))}`;
  }
  return out;
}

// Plain words for why the ground said no.
function worksReason(p, cfg, data) {
  switch (p.reason) {
    case 'steep':
      return `Too steep: ${pct(p.grade)} and the most ${cfg.name.toLowerCase()} can be is ${pct(cfg.maxGrade)}. Make it longer, or start it further back`;
    case 'gravel': {
      const short = (p.heapGravelNeeded - p.heapGravelFound) * (p.surfaceTonnes / Math.max(1e-9, p.surfaceLoose));
      return `Not enough gravel for the surface: ${t1(Math.max(0.1, short))} more. Tip loose gravel within ${data.works.sourceRadius} m of it`;
    }
    case 'fill':
      return `Not enough loose material to fill it: tip more spoil within ${data.works.sourceRadius} m of it`;
    case 'spoil':
      return `No room for the spare spoil: ${p.blocker ? `move ${p.blocker}` : 'choose a spot further inside your land'}`;
    default:
      return p.reason ?? 'It can\'t be built there';
  }
}

// Builds it: checks again, charges the labour, changes the ground. { ok, reason?, ...plan }.
export function buildEarthworks(ctx, input) {
  const plan = planEarthworks(ctx, input);
  if (!plan.ok) return plan;
  const done = ctx.ground.buildWorks(worksSpec(ctx.data, input));
  if (!done.ok) return { ...plan, ...done, ok: false, reason: worksReason(done, worksConfig(ctx.data, input.mode), ctx.data) };
  spendMoney(ctx, plan.cost, `earthworks:${input.mode}`);
  const stats = (ctx.state.stats.works ??= {});
  stats[input.mode] = (stats[input.mode] ?? 0) + 1;
  ctx.events.emit('worksBuilt', {
    mode: input.mode, length: done.length, width: done.width, cost: plan.cost, spoilTonnes: done.spoilTonnes ?? 0,
    spoilAt: done.spoilAt ?? null, spoilRadius: done.spoilRadius ?? 0,
    at: { x: (input.ax + input.bx) / 2, z: (input.az + input.bz) / 2 },
  });
  return { ...plan, ...done, ok: true, cost: plan.cost };
}
