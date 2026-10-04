// Work-area surveys are samples of the current terrain, not a new resource ledger.
export function workAreas(ctx) {
  const plot = ctx.data.ground.plots[ctx.data.sites[ctx.state.currentSiteId]?.groundPlot];
  if (!plot) return [];
  const { columns, rows } = ctx.data.operations.survey;
  const [x0,z0] = plot.origin;
  const width = plot.width / columns, depth = plot.depth / rows;
  return Array.from({ length: rows * columns }, (_,i) => {
    const col = i % columns, row = Math.floor(i / columns);
    return { id: `${row}-${col}`, name: `${ctx.data.operations.areas.rows[row]} ${ctx.data.operations.areas.columns[col]}`,
      x0: x0 + col * width, x1: x0 + (col + 1) * width,
      z0: z0 + row * depth, z1: z0 + (row + 1) * depth,
      x: x0 + (col + 0.5) * width, z: z0 + (row + 0.5) * depth, area: width * depth };
  });
}

export function activeWorkArea(ctx) {
  return workAreas(ctx).find(a => a.id === ctx.state.operations?.workAreaId) ?? null;
}

export function surveyWorkArea(ctx, id) {
  const area = workAreas(ctx).find(a => a.id === id);
  if (!area || !ctx.ground) return null;
  const side = ctx.data.operations.survey.samplesPerSide, estimates = {}, samples = [];
  for (let row = 0; row < side; row++) for (let col = 0; col < side; col++) {
    const x = area.x0 + (col + 0.5) / side * (area.x1 - area.x0);
    const z = area.z0 + (row + 0.5) / side * (area.z1 - area.z0);
    const column = ctx.ground.inspectAt(x,z);
    if (!column) continue;
    samples.push({ x,z,bedrockDepth: column.bedrockDepth, surface: column.surface.coverMaterial,
      coverDepth: column.layers.filter(l => l.material === 'topsoil' || l.material === 'clay').reduce((t,l) => t+l.thickness,0) });
    for (const layer of column.layers) {
      const mix = layer.composition ?? { [layer.material]: 1 };
      for (const [material,share] of Object.entries(mix)) {
        const spec = ctx.data.ground.materials[material];
        estimates[material] = (estimates[material] ?? 0) + layer.thickness * share * spec.density / (layer.kind === 'loose' ? spec.swell : 1);
      }
    }
  }
  if (!samples.length) return null;
  for (const material of Object.keys(estimates)) estimates[material] *= area.area / samples.length;
  const average = key => samples.reduce((t,s) => t+s[key],0) / samples.length;
  return { ...area, estimates, samples, coverDepth: average('coverDepth'), bedrockDepth: average('bedrockDepth'),
    shallowest: Math.min(...samples.map(s => s.bedrockDepth)), deepest: Math.max(...samples.map(s => s.bedrockDepth)) };
}

export function setWorkArea(ctx, id) {
  if (id !== null && !workAreas(ctx).some(a => a.id === id)) return { ok: false, reason: 'Choose a work area on your field' };
  ctx.state.operations ??= {};
  ctx.state.operations.workAreaId = id;
  // A deliberate work-area selection takes over navigation, not machine selection.
  ctx.state.player.navigationMachineId = null;
  ctx.events.emit('workAreaChanged', { areaId: id });
  return { ok: true };
}
