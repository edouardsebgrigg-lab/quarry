import { getStats } from './stats.js';
// A stocked service van only helps work beside it; owning one elsewhere isn't a global buff.
export function serviceSupport(ctx, target) {
  const placement = id => ctx.machinePlacement?.(id) ?? ctx.state.positions?.machines?.[id] ?? ctx.state.world?.machines?.[id];
  const at = placement(target.id);
  if (!at) return { cost: 1, time: 1, callout: 1 };
  const van = ctx.state.machines.find(m => m.type === 'serviceVan' && m.siteId === target.siteId && !m.broken && !m.onHire && !m.away && m.id !== target.id && (() => {
    const p = placement(m.id);
    return p && Math.hypot(p.x - at.x, p.z - at.z) <= (getStats(ctx.data, m).serviceRadius ?? 0);
  })());
  if (!van) return { cost: 1, time: 1, callout: 1 };
  const spec = getStats(ctx.data, van);
  return { cost: spec.maintenanceCostMultiplier ?? 1, time: spec.maintenanceTimeMultiplier ?? 1, callout: spec.mechanicCalloutMultiplier ?? 1, vanId: van.id };
}
