// The map screen (Tab): the countryside seen from above, with the roads, your field, the
// village, the dealer and the depot, and where you and your machines are. The mouse wheel
// zooms in on you.
import { el } from '../dom.js';

const FONT = "'Inter Variable', system-ui, sans-serif";
const COLORS = {
  road: '#3a3b3d',
  roadEdge: '#1b1c1d',
  text: '#f1efe8',
  textDim: 'rgba(241,239,232,0.7)',
  you: '#f5b82e',
  pickup: '#6fb7ff',
  truck: '#ff9a4a',
  tractor: '#ff6a5a',
  excavator: '#ffd24a',
  miniDigger: '#ffd24a',
  dumper: '#ffd24a',
  barrow: '#7fe08a',
};

// Shaded relief of the height grid, painted once: grass greens, darker in hollows, lit from
// the north-west.
function reliefImage({ H, N }, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const img = g.createImageData(size, size);
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < H.length; k++) {
    lo = Math.min(lo, H[k]);
    hi = Math.max(hi, H[k]);
  }
  const at = (c, r) => H[Math.min(N - 1, Math.max(0, r)) * N + Math.min(N - 1, Math.max(0, c))];
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const c = Math.round((px / (size - 1)) * (N - 1));
      const r = Math.round((py / (size - 1)) * (N - 1));
      const h = at(c, r);
      const t = (h - lo) / Math.max(1, hi - lo);
      const dx = at(c + 1, r) - at(c - 1, r);
      const dz = at(c, r + 1) - at(c, r - 1);
      const light = Math.max(0.55, Math.min(1.25, 1 - (dx + dz) * 0.09));
      const i = (py * size + px) * 4;
      img.data[i] = (58 + 40 * t) * light;
      img.data[i + 1] = (82 + 46 * t) * light;
      img.data[i + 2] = (48 + 22 * t) * light;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return canvas;
}

export function createMapView({ world }) {
  const canvas = el('canvas', { class: 'map-canvas' });
  const node = el('div', { class: 'map-view' }, canvas);
  const g = canvas.getContext('2d');
  const plan = world.plan;
  const map = plan.map;
  const half = map.half;
  let relief = null;
  let width = 0;
  let height = 0;
  let zoom = 1;

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
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom = Math.min(6, Math.max(1, zoom * (e.deltaY < 0 ? 1.25 : 0.8)));
  }, { passive: false });

  function draw() {
    if (width <= 0 || height <= 0) return;
    relief ??= reliefImage(world.heightGrid(), 512);
    const info = world.mapInfo();
    const side = Math.min(width, height) - 24;
    const scale = (side / (2 * half)) * zoom; // pixels per metre
    // Centre: the whole map, or you when zoomed in (kept inside the map).
    const lim = half - side / (2 * scale);
    const cx = zoom === 1 ? 0 : Math.max(-lim, Math.min(lim, info.you.x));
    const cz = zoom === 1 ? 0 : Math.max(-lim, Math.min(lim, info.you.z));
    const sx = (x) => width / 2 + (x - cx) * scale;
    const sy = (z) => height / 2 + (z - cz) * scale;

    g.fillStyle = '#101214';
    g.fillRect(0, 0, width, height);
    g.save();
    g.beginPath();
    g.rect(sx(-half), sy(-half), 2 * half * scale, 2 * half * scale);
    g.clip();
    g.imageSmoothingEnabled = true;
    g.drawImage(relief, sx(-half), sy(-half), 2 * half * scale, 2 * half * scale);

    // Yards and your field.
    const rect = (r, fill, stroke) => {
      g.fillStyle = fill;
      g.fillRect(sx(r.x0), sy(r.z0), (r.x1 - r.x0) * scale, (r.z1 - r.z0) * scale);
      if (stroke) {
        g.strokeStyle = stroke;
        g.lineWidth = 1.5;
        g.strokeRect(sx(r.x0), sy(r.z0), (r.x1 - r.x0) * scale, (r.z1 - r.z0) * scale);
      }
    };
    rect(map.home.plot, 'rgba(120, 96, 60, 0.55)', '#f5b82e');
    for(const p of info.landParcels??[])rect(p,p.owned?'rgba(120,96,60,.55)':'rgba(75,108,78,.35)',p.owned?'#f5b82e':'#8db19d');
    for (const area of info.workAreas ?? []) {
      if (area.id === info.activeWorkAreaId) rect(area, 'rgba(245,184,46,.25)', '#ffd775');
    }
    if(info.blast) {
      const p=info.blast;
      for(const r of [p.spec.radius,p.clearance]) {
        g.beginPath();g.arc(sx(p.spec.x),sy(p.spec.z),r*scale,0,Math.PI*2);
        g.strokeStyle='#ff9b61';g.lineWidth=2;g.stroke();
      }
    }
    rect(map.home.yard, 'rgba(170, 160, 140, 0.8)');
    rect(map.depot.yard, 'rgba(170, 160, 140, 0.8)', 'rgba(255,255,255,0.35)');
    rect(map.dealer.yard, 'rgba(170, 160, 140, 0.8)');
    for(const buyer of info.buyers??[])rect(buyer.yard,'rgba(90,150,120,.7)','#85c6a1');

    // Roads.
    for (const [w, color] of [[3.4, COLORS.roadEdge], [2.2, COLORS.road]]) {
      g.strokeStyle = color;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (const road of plan.roads) {
        g.lineWidth = Math.max(w, road.width * scale * (w > 3 ? 1.25 : 1));
        g.beginPath();
        road.samples.forEach((p, i) => (i ? g.lineTo(sx(p.x), sy(p.z)) : g.moveTo(sx(p.x), sy(p.z))));
        g.stroke();
      }
    }

    // Buildings.
    g.fillStyle = '#c96f55';
    for (const h of [...plan.houses, plan.pub]) {
      g.save();
      g.translate(sx(h.x), sy(h.z));
      g.rotate(-h.yaw);
      g.fillRect(-4.5 * scale, -3.5 * scale, 9 * scale, 7 * scale);
      g.restore();
    }
    // Farmsteads: the house and the barn around the yard (as world3d/farms.js lays them out).
    for (const f of plan.farms ?? []) {
      g.save();
      g.translate(sx(f.x), sy(f.z));
      g.rotate(-f.yaw);
      g.fillStyle = 'rgba(160, 140, 110, 0.55)';
      g.fillRect(-22 * scale, -17 * scale, 44 * scale, 34 * scale);
      g.fillStyle = '#c96f55';
      g.fillRect(-20 * scale, 1 * scale, 6 * scale, 9 * scale);
      g.fillStyle = '#8fa39a';
      g.fillRect(4 * scale, -18 * scale, 13 * scale, 20 * scale);
      g.restore();
    }
    g.fillStyle = '#8fa39a';
    g.fillRect(sx(map.dealer.shed.x - 8), sy(map.dealer.shed.z - 12), 16 * scale, 24 * scale);
    g.fillStyle = '#d9d4c7';
    for (const b of map.depot.bays) g.fillRect(sx(b.x0), sy(map.depot.bayZ.z0), (b.x1 - b.x0) * scale, (map.depot.bayZ.z1 - map.depot.bayZ.z0) * scale);
    g.fillStyle = '#9aa3aa';
    const wb = map.depot.weighbridge;
    g.fillRect(sx(wb.x0), sy(wb.z0), Math.max(2, (wb.x1 - wb.x0) * scale), (wb.z1 - wb.z0) * scale);

    // Labels: queued, then placed most important first, each nudged to a free spot so none
    // sit on top of another (a label with no free spot is left off until you zoom in).
    const queue = [];
    const label = (text, x, z, { size = 13, weight = 650, color = COLORS.text, align = 'center', prio = 1, dy = 0 } = {}) => {
      queue.push({ text, x, z, size, weight, color, align, prio, dy });
    };
    const placed = [];
    const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    function flushLabels() {
      queue.sort((p, q) => q.prio - p.prio);
      for (const l of queue) {
        g.font = `${l.weight} ${l.size}px ${FONT}`;
        const w = g.measureText(l.text).width;
        const h = l.size + 5;
        const px = sx(l.x);
        const py = sy(l.z) + l.dy;
        const box = (ox, oy) => ({
          x: (l.align === 'left' ? px + ox : l.align === 'right' ? px + ox - w : px + ox - w / 2) - 2, y: py + oy - h / 2, w: w + 4, h,
        });
        const tries = [[0, 0], [0, -h], [0, h], [0, -2 * h], [0, 2 * h], [w / 2 + 10, 0], [-(w / 2 + 10), 0], [w / 2 + 10, -h], [-(w / 2 + 10), -h]];
        const spot = tries.map(([ox, oy]) => ({ ox, oy, b: box(ox, oy) }))
          .find(({ b }) => b.x > 2 && b.y > 2 && b.x + b.w < width - 2 && b.y + b.h < height - 2 && !placed.some((q) => overlaps(q, b)));
        if (!spot) continue;
        placed.push(spot.b);
        g.textAlign = l.align;
        g.textBaseline = 'middle';
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(0,0,0,0.65)';
        g.strokeText(l.text, px + spot.ox, py + spot.oy);
        g.fillStyle = l.color;
        g.fillText(l.text, px + spot.ox, py + spot.oy);
      }
    }
    const guideName = info.guide?.label?.toLowerCase();
    const place = (text, x, z, o) => label(text, x, z, { prio: 2, ...o });
    for(const buyer of info.buyers??[])place(buyer.name,(buyer.yard.x0+buyer.yard.x1)/2,(buyer.yard.z0+buyer.yard.z1)/2,{color:'#a5d8b9',size:11});
    place('Your field', (map.home.plot.x0 + map.home.plot.x1) / 2, (map.home.plot.z0 + map.home.plot.z1) / 2, { color: '#f5b82e' });
    for(const p of info.landParcels??[])place(`${p.name}${p.owned?'':' · for sale'}`,(p.x0+p.x1)/2,(p.z0+p.z1)/2,{color:p.owned?'#f5b82e':'#a9cbb6'});
    place(map.village.name, 690, -470, { size: 17, weight: 750, prio: 3 });
    place(map.dealer.name, (map.dealer.yard.x0 + map.dealer.yard.x1) / 2, map.dealer.yard.z1, { size: 12, dy: 12 });
    for (const f of plan.farms ?? []) label(f.name, f.x, f.z, { size: 11, weight: 550, color: COLORS.textDim, prio: 1, dy: 18 });
    place(map.depot.name, (map.depot.yard.x0 + map.depot.yard.x1) / 2, map.depot.yard.z0, { size: 14, weight: 750, color: '#9fe3a7', dy: -16 });
    for (const road of plan.roads) {
      const p = road.samples[Math.floor(road.samples.length * (road.id === 'millLane' ? 0.18 : 0.62))];
      label(road.name, p.x, p.z, { size: 11, weight: 500, color: COLORS.textDim, dy: -12 });
    }

    // Your machines, the barrow and you.
    for (const v of info.vehicles) {
      if (v.current) continue;
      g.fillStyle = COLORS[v.type] ?? '#fff';
      g.beginPath();
      g.arc(sx(v.x), sy(v.z), 4.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#111';
      g.lineWidth = 1.5;
      g.stroke();
    }
    g.fillStyle = COLORS.barrow;
    g.fillRect(sx(info.barrow.x) - 2.5, sy(info.barrow.z) - 2.5, 5, 5);
    // Where the current goal wants you: a pulsing ring and its name.
    if (info.guide) {
      const pulse = (performance.now() / 900) % 1;
      g.strokeStyle = `rgba(245, 184, 46, ${1 - pulse})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(sx(info.guide.x), sy(info.guide.z), 6 + pulse * 14, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = COLORS.you;
      g.beginPath();
      g.arc(sx(info.guide.x), sy(info.guide.z), 4, 0, Math.PI * 2);
      g.fill();
      // Its name goes next to the ring, unless a place label already says the same thing.
      const samePlace = queue.some((l) => l.text.toLowerCase() === guideName);
      if (!samePlace) label(info.guide.label, info.guide.x, info.guide.z, { size: 12, color: COLORS.you, prio: 4, dy: -20 });
    }
    flushLabels();
    g.save();
    g.translate(sx(info.you.x), sy(info.you.z));
    g.rotate(-info.you.yaw);
    g.fillStyle = COLORS.you;
    g.strokeStyle = '#111';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(9, 0);
    g.lineTo(-6, 6);
    g.lineTo(-3, 0);
    g.lineTo(-6, -6);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    g.restore();

    // Scale bar and hint.
    const bar = zoom < 2 ? 200 : zoom < 4 ? 100 : 50;
    g.fillStyle = COLORS.text;
    g.fillRect(16, height - 20, bar * scale, 3);
    g.font = `600 11px ${FONT}`;
    g.textAlign = 'left';
    g.fillText(`${bar} m`, 16, height - 30);
    g.fillStyle = COLORS.textDim;
    g.textAlign = 'right';
    g.fillText('Mouse wheel: zoom', width - 14, height - 18);
  }

  return {
    node,
    update: draw,
    destroy: () => resizeObserver.disconnect(),
  };
}
