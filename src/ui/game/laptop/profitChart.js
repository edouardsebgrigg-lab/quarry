// The last fortnight's profit, day by day (takings less running costs; buying machines and
// buildings is investment and stays out, as in the daily summary): green bars up for a profit,
// red down for a loss, today's so far paler. Hover a day for its takings, costs and loads.
import { el } from '../../dom.js';
import { money, signedMoney } from '../../format.js';
import { getDate } from '../../../core/index.js';
import { logbook } from '../../../game/logbook.js';

const DAYS = 14;
const W = 700;
const H = 168;
const TOP = 20; // (room for the best day's label)
const BOTTOM = 24; // (room for the day labels)
const SLOT = W / DAYS;
const BAR = 22;
const R = 4; // rounded data end

const SVG = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}, text) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
};

// A bar from the zero line to y, rounded only at its far (data) end.
function barPath(x, y0, y, w) {
  const r = Math.min(R, Math.abs(y - y0), w / 2);
  if (y < y0) return `M${x},${y0} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y0} Z`;
  return `M${x},${y0} V${y - r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y - r} V${y0} Z`;
}

export function profitChart(game) {
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pc-svg', role: 'img' });
  const tip = el('div', { class: 'pc-tip' });
  const empty = el('div', { class: 'lt-muted-row' }, 'Nothing sold yet: each day’s profit shows here once the loads start going out.');
  const total = el('b');
  const node = el('div', { class: 'pc' }, el('div', { class: 'pc-head' }, el('span', {}, 'Profit, last 14 days'), total), svg, tip, empty);
  let key = '';

  function refresh() {
    const today = getDate(game.state, game.data).day;
    const byDay = new Map(logbook(game.ctx).days.map((d) => [d.day, d]));
    const days = Array.from({ length: DAYS }, (_, i) => today - DAYS + 1 + i).map((day) => {
      const d = byDay.get(day);
      return { day, today: day === today, income: d?.income ?? 0, spending: d?.spending ?? 0, loads: d?.loads ?? 0, profit: d ? d.income - d.spending : 0, any: !!d };
    }).filter((d) => d.day >= 1);
    const k = JSON.stringify(days.map((d) => [d.day, Math.round(d.profit)]));
    if (k === key) return;
    key = k;
    const sum = days.reduce((t, d) => t + d.profit, 0);
    total.textContent = signedMoney(Math.round(sum));
    total.className = sum >= 0 ? 'pos' : 'neg';
    const active = days.some((d) => d.income || d.spending);
    empty.style.display = active ? 'none' : '';
    svg.style.display = active ? '' : 'none';
    svg.replaceChildren();
    if (!active) return;

    const hi = Math.max(1, ...days.map((d) => d.profit));
    const lo = Math.min(0, ...days.map((d) => d.profit));
    const span = hi - lo || 1;
    const y = (v) => TOP + ((hi - v) / span) * (H - TOP - BOTTOM);
    const y0 = y(0);
    svg.setAttribute('aria-label', `Profit over the last ${days.length} days: ${signedMoney(Math.round(sum))} in all`);
    svg.append(svgEl('line', { x1: 0, x2: W, y1: y0, y2: y0, class: 'pc-zero' }));
    const best = days.reduce((b, d) => (d.profit > (b?.profit ?? 0) ? d : b), null);
    days.forEach((d, i) => {
      const x = i * SLOT + (SLOT - BAR) / 2;
      const g = svgEl('g', { class: `pc-day${d.today ? ' today' : ''}` });
      if (Math.abs(d.profit) >= 0.5) g.append(svgEl('path', { d: barPath(x, y0, y(d.profit), BAR), class: `pc-bar ${d.profit >= 0 ? 'pos' : 'neg'}` }));
      if (d === best && !d.today) g.append(svgEl('text', { x: x + BAR / 2, y: y(d.profit) - 6, class: 'pc-val' }, money(Math.round(d.profit))));
      if (i === 0 || i === Math.floor(days.length / 2) || d.today) {
        g.append(svgEl('text', { x: x + BAR / 2, y: H - 6, class: 'pc-day-label' }, d.today ? 'Today' : `Day ${d.day}`));
      }
      // (the hover target is the whole column, bigger than the bar)
      const hit = svgEl('rect', { x: i * SLOT, y: 0, width: SLOT, height: H, class: 'pc-hit' });
      hit.addEventListener('mouseenter', () => {
        tip.replaceChildren(el('b', {}, d.today ? `Today (day ${d.day}), so far` : `Day ${d.day}`),
          el('div', {}, el('span', {}, 'Profit'), el('b', { class: d.profit >= 0 ? 'pos' : 'neg' }, signedMoney(Math.round(d.profit)))),
          el('div', {}, el('span', {}, 'Takings'), el('b', {}, money(d.income))),
          el('div', {}, el('span', {}, 'Costs'), el('b', {}, money(d.spending))),
          el('div', {}, el('span', {}, 'Loads sold'), el('b', {}, String(d.loads))));
        tip.style.left = `${((i + 0.5) / days.length) * 100}%`;
        tip.classList.add('on');
        g.classList.add('hover');
      });
      hit.addEventListener('mouseleave', () => {
        tip.classList.remove('on');
        g.classList.remove('hover');
      });
      g.append(hit);
      svg.append(g);
    });
  }
  refresh();
  return { node, refresh };
}
