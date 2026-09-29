// Satisfying feedback: floating +$ numbers, toasts, message log, upgrade cards.
import { el } from '../dom.js';
import { money, signedMoney, tonnes, statValue } from '../format.js';
import { getMachine, machineName } from '../../machinery/index.js';

const LOG_MAX = 6;

export function createFeedback({ game, getMoneyNode }) {
  const { data } = game;
  const fxLayer = el('div', { class: 'fx-layer' });
  const toasts = el('div', { class: 'toasts' });
  const log = el('div', { class: 'log' });
  const phone = el('div', { class: 'mentor' });
  const node = el('div', { class: 'feedback' }, fxLayer, toasts, log, phone);

  // Timers that only count down while you're actually playing (not while waiting for the click
  // to play, paused, or with the window in the background), so a message can't expire unread.
  let timers = [];
  const later = (ms, fn) => timers.push({ left: ms / 1000, fn });
  function update(dt, active = true) {
    if (!active || !timers.length) return;
    for (const t of timers) t.left -= dt;
    const due = timers.filter((t) => t.left <= 0);
    if (due.length) {
      timers = timers.filter((t) => t.left > 0);
      for (const t of due) t.fn();
    }
  }

  // A text from your mentor: slides in under the money, stays a while, newest on top.
  function mentorText({ from, text, kind }) {
    const card = el('div', { class: `mentor-card mentor-${kind}` },
      el('div', { class: 'mentor-head' }, el('span', { class: 'mentor-avatar' }, from.slice(0, 1)),
        el('span', { class: 'mentor-from' }, from), el('span', { class: 'mentor-when' }, kind === 'tip' ? 'tip' : 'now')),
      el('div', { class: 'mentor-text' }, text));
    phone.prepend(card);
    while (phone.children.length > 2) phone.lastChild.remove();
    const stay = Math.min(22000, 7000 + text.length * 60);
    later(stay, () => card.classList.add('mentor-out'));
    later(stay + 700, () => card.remove());
  }

  function floatText(text, cls, anchor) {
    const r = anchor?.getBoundingClientRect();
    const x = r ? r.left + r.width / 2 : window.innerWidth / 2;
    const y = r ? r.bottom : 80;
    const f = el('div', { class: `float-text ${cls}`, style: { left: `${x}px`, top: `${y}px` } }, text);
    fxLayer.append(f);
    setTimeout(() => f.remove(), 1600);
  }

  function toast(text, level = 'info') {
    const t = el('div', { class: `toast toast-${level}` }, text);
    toasts.append(t);
    later(3200, () => t.classList.add('toast-out'));
    later(3700, () => t.remove());
  }

  function message(text, level = 'info') {
    const line = el('div', { class: `log-line log-${level}` }, text);
    log.append(line);
    while (log.children.length > LOG_MAX) log.firstChild.remove();
    later(8000, () => line.classList.add('log-old'));
  }

  // before/after: stat lines from describeStats (before may be null for a first machine).
  function upgradeCard({ title, subtitle, before, after }) {
    const rows = after.map((line) => {
      const old = before?.find((b) => b.key === line.key);
      let mult = '';
      let worse = false;
      let changed = !old;
      if (old && old.value !== line.value) {
        changed = true;
        const ratio = line.better === 'lower' ? old.value / line.value : line.value / old.value;
        worse = ratio < 1;
        mult = worse ? `${Math.round((ratio - 1) * 100)}%` : `×${ratio.toFixed(ratio >= 10 ? 0 : 1)}`;
      }
      return changed ? el('div', { class: 'card-row' },
        el('span', { class: 'card-label' }, line.label),
        el('span', { class: 'card-values' }, old ? `${statValue(old)} → ` : '', el('b', {}, statValue(line))),
        el('span', { class: `card-mult ${worse ? 'worse' : ''}` }, mult)) : null;
    }).filter(Boolean);
    const card = el('div', { class: 'upgrade-card', onClick: () => card.remove() },
      el('div', { class: 'card-kicker' }, before ? 'UPGRADE!' : 'NEW MACHINE'),
      el('div', { class: 'card-title' }, title),
      subtitle ? el('div', { class: 'card-sub' }, subtitle) : null,
      rows);
    fxLayer.append(card);
    later(4500, () => card.classList.add('card-out'));
    later(5000, () => card.remove());
  }

  const name = (id) => {
    const m = getMachine(game.ctx, id);
    return m ? machineName(data, m) : 'Machine';
  };

  const offs = [
    game.events.on('objectiveCompleted', (e) => {
      toast(`Goal complete: ${e.title}${e.reward ? `  +${money(e.reward)}` : ''}`, 'good');
      if (e.reward) floatText(signedMoney(e.reward), 'gain', getMoneyNode());
    }),
    game.events.on('machineBought', (e) => {
      const m = getMachine(game.ctx, e.machineId);
      if (m) toast(`${machineName(data, m)} delivered to your yard`, 'good');
    }),
    game.events.on('productSold', (e) => {
      floatText(signedMoney(e.revenue), 'gain', getMoneyNode());
      const what = data.materials[e.productId].name.toLowerCase();
      message(`Sold ${e.tonnes < 1 ? `${Math.round(e.tonnes * 1000)} kg` : tonnes(e.tonnes)} of ${what} (${e.grade.toLowerCase()}) for ${money(e.revenue)}`, 'good');
    }),
    game.events.on('machineBrokeDown', (e) => {
      toast(`${name(e.machineId)} broke down! Press R to repair.`, 'bad');
      message(`${name(e.machineId)} broke down`, 'bad');
    }),
    game.events.on('machineRepaired', (e) => message(`${name(e.machineId)} repaired`)),
    game.events.on('machineServiced', (e) => message(`${name(e.machineId)} serviced`)),
    game.events.on('machineSold', (e) => {
      floatText(signedMoney(e.value), 'gain', getMoneyNode());
      message(`Sold ${e.name} for ${money(e.value)}`);
    }),
    game.events.on('interestCharged', (e) => message(`Debt interest charged: ${money(e.amount)}`, 'warn')),
    game.events.on('message', (e) => message(e.text, e.level)),
    game.events.on('mentorMessage', (e) => mentorText(e)),
  ];

  return {
    node,
    floatText,
    toast,
    message,
    upgradeCard,
    update,
    destroy: () => offs.forEach((off) => off()),
  };
}
