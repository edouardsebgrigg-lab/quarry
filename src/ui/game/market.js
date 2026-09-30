// The depot's price board (in the laptop's prices app, M): prices, trends and price history.
import { el, setText } from '../dom.js';
import { price } from '../format.js';
import { currentPrice, priceTrendDirection, fuelPrice, newsMultiplier } from '../../economy/index.js';

function drawSparkline(canvas, history, color) {
  const g = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  g.clearRect(0, 0, w, h);
  if (history.length < 2) return;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const span = max - min || 1;
  const pts = history.map((v, i) => [(i / (history.length - 1)) * (w - 4) + 2, h - 3 - ((v - min) / span) * (h - 6)]);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, `${color}55`);
  grad.addColorStop(1, `${color}00`);
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.lineTo(pts[pts.length - 1][0], h);
  g.lineTo(pts[0][0], h);
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.lineJoin = 'round';
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
}

// Ashby Aggregates' price board: what each bay pays per tonne today, how prices are moving,
// and how mixed loads are graded. You sell by delivering: weigh in, then unload in the bay.
// Returns { node, refresh }; the laptop's prices app shows it.
export function priceBoard(game) {
  const { data } = game;
  const ctx = game.ctx;
  const grades = data.depot.grades;
  const slight = grades[1];
  const rows = Object.keys(data.depot.bays).map((id) => {
    const cells = {
      price: el('td', { class: 'price-big' }),
      slight: el('td'),
      trend: el('td', { class: 'trend' }),
      spark: el('canvas', { width: 160, height: 36, class: 'spark' }),
    };
    const product = data.materials[id];
    const tr = el('tr', {},
      el('td', { class: 'product' }, el('span', { class: 'dot', style: { background: product.color } }), data.depot.bays[id].name),
      cells.price, cells.slight, cells.trend, el('td', {}, cells.spark));
    return { id, tr, cells };
  });
  const fuelText = el('span');

  function refresh() {
    setText(fuelText, `Diesel: ${price(fuelPrice(ctx))}/L`);
    for (const { id, cells } of rows) {
      const p = currentPrice(ctx, id);
      setText(cells.price, price(p));
      setText(cells.slight, id === data.depot.mixedProduct ? '—' : price(p * slight.factor));
      const dir = priceTrendDirection(ctx, id);
      const news = newsMultiplier(ctx, id) - 1;
      const newsText = Math.abs(news) > 0.005 ? `${news > 0 ? '+' : '−'}${Math.round(Math.abs(news) * 100)}% news` : '';
      const trendKey = `${dir}|${newsText}`;
      if (cells.trend.dataset.key !== trendKey) {
        cells.trend.dataset.key = trendKey;
        cells.trend.replaceChildren(dir > 0 ? '▲ Rising' : dir < 0 ? '▼ Falling' : '— Steady',
          newsText ? el('span', { class: `trend-news ${news > 0 ? 'up' : 'down'}` }, newsText) : null);
      }
      cells.trend.className = `trend trend-${dir > 0 ? 'up' : dir < 0 ? 'down' : 'flat'}`;
      drawSparkline(cells.spark, game.state.market.products[id].history, dir > 0 ? '#6bd98a' : dir < 0 ? '#ff6b6b' : '#98a0ab');
    }
  }
  refresh();

  const pctOf = (x) => `${Math.round(x * 100)}%`;
  const node = el('div', { class: 'market' },
    el('table', { class: 'market-table' },
      el('thead', {}, el('tr', {},
        ['Bay', 'Clean, per tonne', `Slightly mixed (×${slight.factor})`, 'Trend', 'Last 3 days'].map((h) => el('th', {}, h)))),
      el('tbody', {}, rows.map((r) => r.tr))),
    el('div', { class: 'market-footer' }, fuelText),
    el('p', { class: 'foot-note' },
      `Stop on the weighbridge at the gate to weigh in, then back into the bay for what you're carrying and unload. `
      + `A load that's at least ${pctOf(grades[0].minPurity)} one material is clean; ${pctOf(slight.minPurity)} or more is slightly mixed and paid less; `
      + 'anything more mixed is paid as mixed fill. Selling a lot of one thing pushes its price down for a while.'),
  );
  return { node, refresh };
}
