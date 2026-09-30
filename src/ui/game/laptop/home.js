// The laptop's home screen: your balance, the goal you're on, the best price at the depot today,
// and how the fleet is doing, with shortcuts into the apps.
import { el, setText } from '../../dom.js';
import { money, price } from '../../format.js';
import { getDate } from '../../../core/index.js';
import { currentPrice } from '../../../economy/index.js';
import { machinesAt } from '../../../machinery/index.js';
import { lineIcon } from './icons.js';
import { forecast } from '../../../weather/index.js';

export function homeApp({ game, openApp, setHead }) {
  const { data } = game;
  const ctx = game.ctx;
  const hour = getDate(game.state, data).hour;
  setHead(hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening', 'Here’s how the quarry is doing');

  const tile = (label, value, note, action) => {
    const v = el('div', { class: 'lt-stat-value' });
    const n = el('div', { class: 'lt-stat-note' });
    const node = el(action ? 'button' : 'div', { class: `lt-stat ${action ? 'link' : ''}`, onClick: action },
      el('div', { class: 'lt-stat-label' }, label), v, n);
    return { node, set(val, note2) { setText(v, val); setText(n, note2 ?? ''); } };
  };
  const bal = tile('Balance');
  const best = tile('Best price today', null, null, () => openApp('prices'));
  const fleet = tile('Your machines', null, null, () => openApp('fleet'));
  const weather = tile('Weather');
  const goalTitle = el('div', { class: 'lt-goal-title' });
  const goalText = el('div', { class: 'lt-goal-text' });

  function refresh() {
    bal.set(money(game.state.money), game.state.money < 0 ? 'Overdrawn: the bank charges interest every day' : 'Ready to spend');
    let top = null;
    for (const id of Object.keys(data.depot.bays)) {
      if (id === data.depot.mixedProduct) continue;
      const p = currentPrice(ctx, id);
      if (!top || p > top.p) top = { id, p };
    }
    best.set(top ? `${price(top.p)}/t` : '—', top ? `${data.depot.bays[top.id].name}, clean` : '');
    const ms = machinesAt(ctx, game.state.currentSiteId);
    const tired = ms.filter((m) => m.broken || m.condition < 50).length;
    fleet.set(String(ms.length), tired ? `${tired} need${tired === 1 ? 's' : ''} a service or repair` : 'All in good order');
    const f = forecast(ctx);
    weather.set(f.today.name, `Tomorrow: ${f.tomorrow.name.toLowerCase()}${f.tomorrow.rain > 0 ? ' (slippery on the ramps)' : ''}`);
    const step = data.objectives.steps[game.state.objectives.index];
    setText(goalTitle, step ? step.title : 'All goals done');
    setText(goalText, step ? step.text : 'You’ve worked through every goal. Keep growing the quarry.');
  }
  refresh();

  const shortcut = (icon, label, sub, id) => el('button', { class: 'lt-shortcut', onClick: () => openApp(id) },
    lineIcon(icon), el('div', {}, el('b', {}, label), el('span', {}, sub)));

  const node = el('div', { class: 'lt-home' },
    el('div', { class: 'lt-stats four' }, bal.node, best.node, fleet.node, weather.node),
    el('div', { class: 'lt-card lt-goal' }, el('div', { class: 'lt-card-label' }, 'Current goal'), goalTitle, goalText),
    el('div', { class: 'lt-shortcuts' },
      shortcut('digger', 'Plant dealer', 'Machines, upgrades, yard buildings', 'dealer'),
      shortcut('clipboard', 'Jobs board', 'Bonuses for clean loads, on time', 'jobs'),
      shortcut('chart', 'Depot prices', 'What each material sells for today', 'prices'),
      shortcut('bank', 'Bank', 'Your statement, and loans to grow faster', 'bank')));
  return { node, refresh, headSet: true };
}
