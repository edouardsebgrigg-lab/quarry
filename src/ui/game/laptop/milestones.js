// Milestones: the company's achievements, grouped, with how far you are on each, the reward it
// pays and the perk it switches on. Reached ones show the day you got there.
import { el, setText } from '../../dom.js';
import { money, tonnes } from '../../format.js';
import { milestones, ownedPerks } from '../../../career/index.js';
import { lineIcon } from './icons.js';

const TONNES = new Set(['tonnesSold', 'tonnesDug', 'cleanTonnes', 'gravelDug']);
const MONEY = new Set(['bestDay', 'totalEarned']);

// A metric's value as the player reads it.
function amount(metric, v) {
  if (TONNES.has(metric)) return tonnes(v);
  if (MONEY.has(metric)) return money(v);
  if (metric === 'roadMetres') return `${Math.round(v)} m`;
  return String(Math.floor(v));
}

export function milestonesApp({ game, setHead }) {
  const { data } = game;
  const cfg = data.milestones;
  setHead('Milestones', 'Company achievements. Each pays a reward when you reach it, and some switch on a perk for good');

  const reachedValue = el('div', { class: 'lt-stat-value' });
  const reachedNote = el('div', { class: 'lt-stat-note' });
  const rewardsValue = el('div', { class: 'lt-stat-value' });
  const perksValue = el('div', { class: 'lt-stat-value' });
  const perksBox = el('div', { class: 'lt-perks' });
  const groupsBox = el('div', { class: 'lt-ms-groups' });
  let key = '';

  function card(m) {
    const bar = el('div', { class: 'lt-ms-bar' }, el('i', { style: { width: `${Math.round(m.progress * 100)}%` } }));
    const perk = m.perk ? cfg.perks[m.perk] : null;
    return el('div', { class: `lt-ms${m.reached ? ' done' : ''}` },
      el('div', { class: 'lt-ms-head' },
        el('b', {}, m.reached ? el('span', { class: 'lt-ms-tick' }, lineIcon('check')) : null, m.title),
        m.reward ? el('span', { class: 'lt-ms-reward' }, `+${money(m.reward)}`) : null),
      el('div', { class: 'lt-ms-text' }, m.text),
      perk ? el('span', { class: 'lt-ms-perk', title: perk.text }, `Perk: ${perk.name}`) : null,
      m.reached ? null : bar,
      el('div', { class: 'lt-ms-foot' },
        el('span', {}, m.reached ? `Reached on day ${m.day}` : `${amount(m.metric, m.value)} of ${amount(m.metric, m.target)}`),
        m.reached ? null : el('span', {}, `${Math.floor(m.progress * 100)}%`)));
  }

  function refresh() {
    const list = milestones(game.ctx);
    const perks = ownedPerks(game.ctx);
    const k = JSON.stringify(list.map((m) => [m.id, m.reached, Math.floor(m.progress * 100)]).concat(perks));
    if (k === key) return;
    key = k;
    const done = list.filter((m) => m.reached);
    setText(reachedValue, `${done.length} of ${list.length}`);
    const next = list.filter((m) => !m.reached).sort((a, b) => b.progress - a.progress)[0];
    setText(reachedNote, next ? `Closest: ${next.title} (${Math.floor(next.progress * 100)}%)` : 'Every milestone reached');
    setText(rewardsValue, money(done.reduce((a, m) => a + (m.reward ?? 0), 0)));
    setText(perksValue, `${perks.length} of ${Object.keys(cfg.perks).length}`);

    perksBox.replaceChildren(...Object.entries(cfg.perks).map(([id, p]) => {
      const from = list.find((m) => m.perk === id);
      const on = perks.includes(id);
      return el('div', { class: `lt-perk${on ? ' on' : ''}` },
        el('b', {}, p.name), el('span', {}, p.text),
        el('em', {}, on ? 'Active' : `From: ${from?.title ?? '?'}`));
    }));

    groupsBox.replaceChildren(...Object.entries(cfg.groups).map(([gid, name]) => {
      const items = list.filter((m) => m.group === gid);
      const got = items.filter((m) => m.reached).length;
      return el('section', { class: 'lt-ms-group' },
        el('div', { class: 'lt-card-label' }, `${name} · ${got}/${items.length}`),
        el('div', { class: 'lt-ms-grid' }, ...items.map(card)));
    }));
  }
  refresh();

  const node = el('div', { class: 'lt-home' },
    el('div', { class: 'lt-stats' },
      el('div', { class: 'lt-stat' }, el('div', { class: 'lt-stat-label' }, 'Reached'), reachedValue, reachedNote),
      el('div', { class: 'lt-stat' }, el('div', { class: 'lt-stat-label' }, 'Rewards earned'), rewardsValue),
      el('div', { class: 'lt-stat' }, el('div', { class: 'lt-stat-label' }, 'Perks'), perksValue)),
    el('div', { class: 'lt-card' }, el('div', { class: 'lt-card-label' }, 'Perks'), perksBox),
    groupsBox);
  return { node, refresh, headSet: true };
}
