// The depot's price board, as a laptop app.
import { el } from '../../dom.js';
import { priceBoard } from '../market.js';

export function pricesApp({ game, setHead }) {
  const board = priceBoard(game);
  setHead(`${game.data.depot.name}`, 'What each bay pays per tonne today');
  return { node: el('div', { class: 'lt-panel' }, board.node), refresh: board.refresh, headSet: true };
}
