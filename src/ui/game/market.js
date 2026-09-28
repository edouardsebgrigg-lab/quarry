// Market panel: prices, trends, price history and selling.
import { el, setText } from '../dom.js';
import { money, price, tonnes } from '../format.js';
import {
  currentPrice, priceTrendDirection, fuelPrice, quoteNet,
} from '../../economy/index.js';
import { getSiteData, yardAmount } from '../../quarry/index.js';

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

export function openMarket(overlays, { game, feedback }) {
  const { data } = game;
  const ctx = game.ctx;
  overlays.toggle({
    id: 'market',
    title: 'Market',
    pauses: false,
    className: 'overlay-wide',
    build: ({ entry }) => {
      const siteId = () => game.state.currentSiteId;
      const rows = Object.keys(game.state.market.products).map((id) => {
        const cells = {
          stock: el('td'),
          price: el('td', { class: 'price-big' }),
          trend: el('td', { class: 'trend' }),
          net: el('td'),
          value: el('td'),
          spark: el('canvas', { width: 160, height: 36, class: 'spark' }),
        };
        const sell = (t) => {
          const r = game.actions.sellProduct(id, t);
          if (!r.ok) feedback.message(r.reason, 'warn');
        };
        const tr = el('tr', {},
          el('td', { class: 'product' }, el('span', { class: 'dot', style: { background: data.materials[id].color } }), data.materials[id].name),
          cells.stock, cells.price, cells.trend, el('td', {}, cells.spark), cells.net, cells.value,
          el('td', { class: 'sell-cell' },
            el('button', { class: 'btn btn-small', onClick: () => sell(10) }, 'Sell 10 t'),
            el('button', { class: 'btn btn-small btn-primary', onClick: () => sell(Infinity) }, 'Sell all')));
        return { id, tr, cells };
      });

      const fuelText = el('span');
      const deliveryText = el('span');

      function refresh() {
        const delivery = getSiteData(data, siteId()).deliveryCostPerTonne;
        setText(deliveryText, `Delivery from this site: ${price(delivery)}/t`);
        setText(fuelText, `Diesel: ${price(fuelPrice(ctx))}/L`);
        for (const { id, cells } of rows) {
          const stock = yardAmount(ctx, siteId(), id);
          const p = currentPrice(ctx, id);
          setText(cells.stock, tonnes(stock));
          setText(cells.price, price(p));
          const dir = priceTrendDirection(ctx, id);
          setText(cells.trend, dir > 0 ? '▲ Rising' : dir < 0 ? '▼ Falling' : '— Steady');
          cells.trend.className = `trend trend-${dir > 0 ? 'up' : dir < 0 ? 'down' : 'flat'}`;
          setText(cells.net, price(p - delivery));
          setText(cells.value, stock > 0.01 ? money(quoteNet(ctx, siteId(), id, stock).net) : '—');
          drawSparkline(cells.spark, game.state.market.products[id].history, dir > 0 ? '#6bd98a' : dir < 0 ? '#ff6b6b' : '#98a0ab');
        }
      }

      let acc = 0;
      entry.update = (dt) => {
        acc += dt;
        if (acc > 0.25) { acc = 0; refresh(); }
      };
      refresh();

      return el('div', { class: 'market' },
        el('table', { class: 'market-table' },
          el('thead', {}, el('tr', {},
            ['Product', 'In yard', 'Price/t', 'Trend', 'Last 3 days', 'After delivery', 'Sell all for', ''].map((h) => el('th', {}, h)))),
          el('tbody', {}, rows.map((r) => r.tr))),
        el('div', { class: 'market-footer' }, deliveryText, fuelText),
        el('p', { class: 'foot-note' },
          'Selling a lot at once pushes the price down; it recovers over a couple of days. '
          + 'Prices also drift up and down — hold stock when they are low, if your yard has room.'),
      );
    },
  });
}
