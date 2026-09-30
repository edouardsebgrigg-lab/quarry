// The depot's price board, as a laptop app, with the local news that is moving prices.
import { el } from '../../dom.js';
import { priceBoard } from '../market.js';
import { activeNews } from '../../../economy/index.js';

export function pricesApp({ game, setHead }) {
  const { data } = game;
  const board = priceBoard(game);
  setHead(`${data.depot.name}`, 'What each bay pays per tonne today, and the news moving prices');
  const news = el('div', { class: 'lt-news' });
  let key = '';

  function refreshNews() {
    const items = activeNews(game.ctx);
    const k = JSON.stringify(items.map((a) => [a.id, a.daysLeft]));
    if (k === key) return;
    key = k;
    news.replaceChildren(el('div', { class: 'lt-card-label' }, 'In the news'));
    if (!items.length) news.append(el('div', { class: 'lt-muted-row' }, 'Nothing moving prices at the moment. Stories break in the morning.'));
    for (const a of items) {
      const mat = data.materials[a.product];
      const up = a.change > 0;
      news.append(el('div', { class: `lt-news-item ${up ? 'up' : 'down'}` },
        el('div', { class: 'lt-news-src' }, a.source),
        el('div', { class: 'lt-news-text' }, a.headline),
        el('div', { class: 'lt-news-foot' },
          el('span', { class: 'lt-chip' }, el('span', { class: 'dot', style: { background: mat?.color } }), mat?.name ?? a.product,
            el('b', {}, ` ${up ? '▲' : '▼'} ${Math.round(Math.abs(a.change) * 100)}%`)),
          el('span', {}, a.daysLeft <= 1 ? 'Last day' : `${a.daysLeft} days left`))));
    }
  }
  refreshNews();
  const refresh = () => {
    board.refresh();
    refreshNews();
  };
  return { node: el('div', { class: 'lt-prices' }, news, el('div', { class: 'lt-panel' }, board.node)), refresh, headSet: true };
}
