// Top-down 2D drawing of the current site: zones as terraced pits, the face
// pile, the haul road, the yard, and machines moving about.
import { el } from '../dom.js';
import { getZoneInfo, getSiteData, facePileTotal, yardTotal } from '../../quarry/index.js';
import { machinesAt, jobProgress, getStats } from '../../machinery/index.js';

const COLORS = {
  grass: '#34402a',
  grassDark: '#2b3522',
  surface: [201, 168, 106],
  deep: [74, 53, 36],
  road: '#6b5a44',
  roadLine: '#8c7a60',
  select: '#f2b632',
  excavator: '#f2b632',
  truck: '#e07b39',
  brokenBody: '#777',
  text: '#f4efe6',
  textDim: 'rgba(244,239,230,0.7)',
};

const mixColor = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
const lerp = (a, b, t) => a + (b - a) * t;

function pointAlong(points, t) {
  // Position at fraction t along a polyline.
  const lengths = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    lengths.push(d);
    total += d;
  }
  let dist = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < points.length; i++) {
    if (dist <= lengths[i - 1] || i === points.length - 1) {
      const f = lengths[i - 1] ? Math.min(1, dist / lengths[i - 1]) : 0;
      const a = points[i - 1];
      const b = points[i];
      return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    dist -= lengths[i - 1];
  }
  return { ...points[points.length - 1], angle: 0 };
}

export function createSiteView({ game, onSelectZone, onSelectMachine }) {
  const canvas = el('canvas', { class: 'site-canvas' });
  const node = el('div', { class: 'site-view' }, canvas);
  const g = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let zoneRects = [];
  let machineRects = [];
  let hoverZone = null;
  let time = 0;

  const resizeObserver = new ResizeObserver(() => {
    const r = node.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    width = r.width;
    height = r.height;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    canvas.style.width = `${r.width}px`;
    canvas.style.height = `${r.height}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  });
  resizeObserver.observe(node);

  function hit(list, x, y) {
    return list.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) ?? null;
  }

  function mousePos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener('mousemove', (e) => {
    const { x, y } = mousePos(e);
    const m = hit(machineRects, x, y);
    hoverZone = m ? null : hit(zoneRects, x, y)?.id ?? null;
    canvas.style.cursor = m || hoverZone ? 'pointer' : 'default';
  });
  canvas.addEventListener('mouseleave', () => { hoverZone = null; });
  canvas.addEventListener('click', (e) => {
    const { x, y } = mousePos(e);
    const m = hit(machineRects, x, y);
    if (m) return onSelectMachine(m.id);
    const z = hit(zoneRects, x, y);
    if (z) onSelectZone(z.id);
  });

  function layout(siteData) {
    const pad = 24;
    const top = 48;
    const pit = { x: pad, y: top, w: width * 0.6 - pad, h: height - top - pad };
    const n = siteData.zones.length;
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const gap = 14;
    const cw = (pit.w - gap * (cols - 1)) / cols;
    const ch = (pit.h - gap * (rows - 1)) / rows;
    const zones = siteData.zones.map((z, i) => ({
      id: z.id,
      x: pit.x + (i % cols) * (cw + gap),
      y: pit.y + Math.floor(i / cols) * (ch + gap),
      w: cw,
      h: ch,
    }));
    const yard = { x: width * 0.72, y: height * 0.28, w: width * 0.25, h: height * 0.44 };
    return { pit, zones, yard };
  }

  function drawZone(rect, info, selected, tooHard) {
    // Each finished layer is a darker step inset from the one above.
    const steps = Math.floor(info.depth / (info.maxDepth / info.layerCount) + 1e-6);
    const partial = (info.depth / (info.maxDepth / info.layerCount)) - steps;
    const inset = Math.min(rect.w, rect.h) * 0.06;
    for (let i = 0; i <= Math.min(steps, info.layerCount); i++) {
      const t = i / info.layerCount;
      const r = { x: rect.x + inset * i, y: rect.y + inset * i, w: rect.w - 2 * inset * i, h: rect.h - 2 * inset * i };
      g.fillStyle = mixColor(COLORS.surface, COLORS.deep, t);
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.lineWidth = 1;
      g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    }
    // The layer being dug: a patch that grows as you go deeper.
    if (!info.exhausted && partial > 0.001) {
      const i = steps + 1;
      const t = i / info.layerCount;
      const full = { x: rect.x + inset * i, y: rect.y + inset * i, w: rect.w - 2 * inset * i, h: rect.h - 2 * inset * i };
      g.fillStyle = mixColor(COLORS.surface, COLORS.deep, t);
      g.globalAlpha = 0.85;
      g.fillRect(full.x, full.y + full.h * (1 - partial), full.w, full.h * partial);
      g.globalAlpha = 1;
    }
    // Gravel speckles so the ground doesn't look flat.
    const seed = info.zoneId.charCodeAt(0) * 97;
    for (let i = 0; i < 160; i++) {
      const px = rect.x + (((seed + i * 53) % 997) / 997) * (rect.w - 3);
      const py = rect.y + (((seed * 3 + i * 131) % 991) / 991) * (rect.h - 3);
      g.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.14)';
      g.fillRect(px, py, 2 + (i % 2), 2);
    }
    if (hoverZone === info.zoneId && !selected) {
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
    if (selected) {
      g.strokeStyle = COLORS.select;
      g.lineWidth = 3;
      g.strokeRect(rect.x + 1.5, rect.y + 1.5, rect.w - 3, rect.h - 3);
    }

    g.fillStyle = COLORS.text;
    g.font = '600 15px system-ui, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText(`Zone ${info.zoneId} · ${info.name}`, rect.x + 10, rect.y + 10);
    g.font = '13px system-ui, sans-serif';
    g.fillStyle = COLORS.textDim;
    g.fillText(info.exhausted ? 'Dug out' : `${info.depth.toFixed(1)} m deep · hardness ${info.layer.hardness}`, rect.x + 10, rect.y + 30);
    if (tooHard) {
      g.fillStyle = '#ff8a80';
      g.fillText('Too hard for your excavators', rect.x + 10, rect.y + 48);
    }
  }

  function drawPile(x, y, amount, capacity, color, label) {
    const r = 8 + 26 * Math.sqrt(Math.min(1, amount / capacity));
    if (amount > 0.01) {
      g.fillStyle = color;
      g.beginPath();
      g.ellipse(x, y, r, r * 0.6, 0, Math.PI, 0);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.3)';
      g.stroke();
    }
    if (label) {
      g.fillStyle = COLORS.text;
      g.font = '12px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillText(label, x, y + 4);
    }
  }

  function drawExcavator(x, y, m, selected) {
    const broken = m.broken;
    const digging = m.job?.type === 'dig';
    const swing = digging ? Math.sin(jobProgress(m.job) * Math.PI * 2) * 0.6 : 0.2;
    g.save();
    g.translate(x, y);
    // Tracks
    g.fillStyle = '#2a2a2a';
    g.fillRect(-16, -12, 32, 6);
    g.fillRect(-16, 6, 32, 6);
    // Body
    g.fillStyle = broken ? COLORS.brokenBody : COLORS.excavator;
    g.fillRect(-12, -8, 22, 16);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(-10, -6, 8, 8);
    // Arm and bucket
    g.rotate(-Math.PI / 2 - swing);
    g.strokeStyle = broken ? '#555' : '#c58f15';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(26, 0);
    g.stroke();
    g.fillStyle = '#444';
    g.fillRect(24, -5, 8, 10);
    g.restore();
    if (broken) drawBrokenMark(x, y - 20);
    if (selected) drawSelectRing(x, y, 24);
    machineRects.push({ id: m.id, x: x - 20, y: y - 20, w: 40, h: 40 });
  }

  function drawTruck(pos, m, selected, loaded, tipping) {
    g.save();
    g.translate(pos.x, pos.y);
    g.rotate(pos.angle ?? 0);
    g.fillStyle = m.broken ? COLORS.brokenBody : COLORS.truck;
    g.fillRect(-16, -8, 10, 16); // cab
    g.fillStyle = m.broken ? '#666' : '#b85f25';
    g.fillRect(-5, -9, 22, 18); // bed
    if (loaded) {
      g.fillStyle = '#b09a78';
      g.fillRect(tipping ? 2 : -3, -7, tipping ? 13 : 18, 14);
    }
    g.restore();
    if (m.broken) drawBrokenMark(pos.x, pos.y - 18);
    if (selected) drawSelectRing(pos.x, pos.y, 22);
    machineRects.push({ id: m.id, x: pos.x - 20, y: pos.y - 20, w: 40, h: 40 });
  }

  function drawBrokenMark(x, y) {
    const puff = (Math.sin(time * 4) + 1) * 2;
    g.fillStyle = 'rgba(120,120,120,0.6)';
    g.beginPath();
    g.arc(x + 4, y - 6 - puff, 5 + puff, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#d9534f';
    g.font = 'bold 14px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('!', x, y);
  }

  function drawSelectRing(x, y, r) {
    g.save();
    g.strokeStyle = '#fff';
    g.setLineDash([4, 4]);
    g.lineDashOffset = -time * 20;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  function draw(dt) {
    time += dt;
    if (width <= 0 || height <= 0) return;
    const ctx = game.ctx;
    const { data, state } = game;
    const siteId = state.currentSiteId;
    const site = state.sites[siteId];
    const siteData = getSiteData(data, siteId);
    const L = layout(siteData);
    zoneRects = L.zones;
    machineRects = [];

    // Ground
    g.fillStyle = COLORS.grass;
    g.fillRect(0, 0, width, height);
    g.fillStyle = COLORS.grassDark;
    for (let i = 0; i < 40; i++) {
      const x = ((i * 137) % 100) / 100 * width;
      const y = ((i * 71) % 100) / 100 * height;
      g.fillRect(x, y, 3, 3);
    }

    // Title
    g.fillStyle = COLORS.text;
    g.font = '700 18px system-ui, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText(siteData.name, 24, 16);
    const titleWidth = g.measureText(siteData.name).width;
    g.font = '13px system-ui, sans-serif';
    g.fillStyle = COLORS.textDim;
    g.fillText('Click a zone to dig there · click a machine to select it', 24 + titleWidth + 16, 20);

    const bestHardness = Math.max(0, ...machinesAt(ctx, siteId)
      .filter((m) => m.type === 'excavator').map((m) => getStats(data, m).maxHardness));

    // Zones
    for (const rect of L.zones) {
      const info = getZoneInfo(ctx, siteId, rect.id);
      drawZone(rect, info, site.selectedZoneId === rect.id, !info.exhausted && info.layer.hardness > bestHardness);
    }

    // Haul road: from the pit edge to the yard.
    const sel = L.zones.find((z) => z.id === site.selectedZoneId);
    const pileAt = { x: sel.x + sel.w * 0.5, y: sel.y + sel.h * 0.78 };
    const pitExit = { x: L.pit.x + L.pit.w + 12, y: L.pit.y + L.pit.h / 2 };
    const yardIn = { x: L.yard.x - 6, y: L.yard.y + L.yard.h / 2 };
    const dump = { x: L.yard.x + L.yard.w * 0.3, y: L.yard.y + L.yard.h * 0.62 };
    g.strokeStyle = COLORS.road;
    g.lineWidth = 22;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(pitExit.x - 12, pitExit.y);
    g.lineTo(yardIn.x, yardIn.y);
    g.stroke();
    g.strokeStyle = COLORS.roadLine;
    g.lineWidth = 2;
    g.setLineDash([10, 10]);
    g.beginPath();
    g.moveTo(pitExit.x - 12, pitExit.y);
    g.lineTo(yardIn.x, yardIn.y);
    g.stroke();
    g.setLineDash([]);
    g.lineCap = 'butt';

    // Yard
    g.fillStyle = '#5a5046';
    g.fillRect(L.yard.x, L.yard.y, L.yard.w, L.yard.h);
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.strokeRect(L.yard.x + 0.5, L.yard.y + 0.5, L.yard.w - 1, L.yard.h - 1);
    g.fillStyle = COLORS.text;
    g.font = '600 15px system-ui, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText('Yard', L.yard.x + 10, L.yard.y + 10);
    g.font = '13px system-ui, sans-serif';
    g.fillStyle = COLORS.textDim;
    g.fillText(`${yardTotal(ctx, siteId).toFixed(1)} / ${siteData.yardCapacity} t`, L.yard.x + 10, L.yard.y + 30);
    const products = Object.entries(site.yard).filter(([, t]) => t > 0.01);
    products.forEach(([id, t], i) => {
      const x = L.yard.x + L.yard.w * ((i + 1) / (products.length + 1));
      drawPile(x, L.yard.y + L.yard.h * 0.9, t, siteData.yardCapacity / 2, data.materials[id]?.color ?? '#999',
        `${data.materials[id]?.name ?? id} ${t.toFixed(0)} t`);
    });

    // Face pile
    const face = facePileTotal(ctx, siteId);
    drawPile(pileAt.x, pileAt.y, face, siteData.facePileCapacity, '#c9a86a', `Face pile ${face.toFixed(1)} t`);

    // Machines
    const machines = machinesAt(ctx, siteId);
    const selectedId = state.player.selectedMachineId;
    machines.filter((m) => m.type === 'excavator').forEach((m, i) => {
      const x = pileAt.x - 60 - (i % 3) * 44;
      const y = pileAt.y - 24 - Math.floor(i / 3) * 44;
      drawExcavator(x, y, m, m.id === selectedId);
    });
    const route = [pileAt, pitExit, yardIn, dump];
    machines.filter((m) => m.type === 'truck').forEach((m, i) => {
      const job = m.job;
      if (job?.type === 'haul' && job.timing) {
        const p = jobProgress(job);
        const tm = job.timing;
        let pos;
        if (p < tm.loadEnd) pos = { ...pileAt, x: pileAt.x + 34, angle: 0 };
        else if (p < tm.arriveYard) pos = pointAlong(route, (p - tm.loadEnd) / (tm.arriveYard - tm.loadEnd));
        else if (p < tm.unloadEnd) pos = { ...dump, angle: 0 };
        else {
          pos = pointAlong([...route].reverse(), (p - tm.unloadEnd) / (1 - tm.unloadEnd));
        }
        const loaded = p < tm.unloadEnd;
        drawTruck(pos, m, m.id === selectedId, loaded, p >= tm.arriveYard && p < tm.unloadEnd);
      } else {
        // Parked by the pit exit.
        drawTruck({ x: pitExit.x + 10, y: pitExit.y + 30 + i * 30, angle: 0 }, m, m.id === selectedId, false, false);
      }
    });
  }

  return {
    node,
    update: draw,
    destroy: () => resizeObserver.disconnect(),
  };
}
