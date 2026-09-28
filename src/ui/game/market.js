// Market panel: prices, trends, price history and selling.
import { el, setText } from '../dom.js';
import { money, price, tonnes } from '../format.js';
import {
  currentPrice, priceTrendDirection, fuelPrice, quoteNet,
} from '../../economy/index.js';
import { getSiteData, yardAmount } from '../../quarry/index.js';

function drawSparkline(canvas, history) {
  const g = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  g.clearRect(0, 0, w, h);
  if (history.length < 2) return;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const span = max - min || 1;
  g.strokeStyle = '#f2b632';
  g.lineWidth = 2;
  g.beginPath();
  history.forEach((v, i) => {
    const x = (i / (history.length - 1)) * (w - 4) + 2;
    const y = h - 3 - ((v - min) / span) * (h - 6);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  });
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
          price: el('td'),
          trend: el('td', { class: 'trend' }),
          net: el('td'),
          value: el('td'),
          spark: el('canvas', { width: 140, height: 34, class: 'spark' }),
        };
        const sell = (t) => {
          const r = game.actions.sellProduct(id, t);
          if (!r.ok) feedback.message(r.reason, 'warn');
        };
        const tr = el('tr', {},
          el('td', { class: 'product' }, data.materials[id].name),
          cells.stock, cells.price, cells.trend, el('td', {}, cells.spark), cells.net, cells.value,
          el('td', { class: 'sell-cell' },
            el('button', { class: 'btn', onClick: () => sell(10) }, 'Sell 10 t'),
            el('button', { class: 'btn btn-primary', onClick: () => sell(Infinity) }, 'Sell all')));
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
          setText(cells.trend, dir > 0 ? '▲ rising' : dir < 0 ? '▼ falling' : '● steady');
          cells.trend.className = `trend trend-${dir > 0 ? 'up' : dir < 0 ? 'down' : 'flat'}`;
          setText(cells.net, price(p - delivery));
          setText(cells.value, stock > 0.01 ? money(quoteNet(ctx, siteId(), id, stock).net) : '—');
          drawSparkline(cells.spark, game.state.market.products[id].history);
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
        el('div', { class: 'market-footer muted small' }, deliveryText, ' · ', fuelText),
        el('p', { class: 'muted small' },
          'Selling a lot at once pushes the price down; it recovers over a couple of days. '
          + 'Prices also drift up and down — hold stock when they are low, if your yard has room.'),
      );
    },
  });
}
