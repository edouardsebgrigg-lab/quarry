// Milestones: the company's achievements, grouped, with how far you are on each, the reward it
// pays and the perk it switches on. Reached ones show the day you got there.
import { el, setText } from '../../dom.js';
import { money, tonnes } from '../../format.js';
import { milestones, ownedPerks, pinnedMilestone } from '../../../career/index.js';
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

export function milestonesApp({ game, feedback, setHead }) {
  const { data } = game;
  const cfg = data.milestones;
  setHead('Milestones', 'Choose your own target. Achievements reward digging, building and growing your quarry');

  const reachedValue = el('div', { class: 'lt-stat-value' });
  const reachedNote = el('div', { class: 'lt-stat-note' });
  const rewardsValue = el('div', { class: 'lt-stat-value' });
  const perksValue = el('div', { class: 'lt-stat-value' });
  const perksBox = el('div', { class: 'lt-perks' });
  const groupsBox = el('div', { class: 'lt-ms-groups' });
  const targetBox = el('div', { class: 'lt-card lt-personal-target' });
  let key = '';

  function choose(id) {
    const r = id === null ? game.actions.unpinMilestone() : game.actions.pinMilestone(id);
    if (!r.ok) feedback?.message(r.reason, 'warn');
    refresh();
  }

  function card(m) {
    const bar = el('div', { class: 'lt-ms-bar' }, el('i', { style: { width: `${Math.round(m.progress * 100)}%` } }));
    const perk = m.perk ? cfg.perks[m.perk] : null;
    return el('div', { class: `lt-ms${m.reached ? ' done' : ''}${m.pinned ? ' lt-ms-target' : ''}`, dataset: { milestoneId: m.id } },
      el('div', { class: 'lt-ms-head' },
        el('b', {}, m.reached ? el('span', { class: 'lt-ms-tick' }, lineIcon('check')) : null, m.title),
        m.reward ? el('span', { class: 'lt-ms-reward' }, `+${money(m.reward)}`) : null),
      el('div', { class: 'lt-ms-text' }, m.text),
      perk ? el('span', { class: 'lt-ms-perk', title: perk.text }, `Perk: ${perk.name}`) : null,
      m.reached ? null : bar,
      el('div', { class: 'lt-ms-foot' },
        el('span', {}, m.reached ? `Reached on day ${m.day}` : `${amount(m.metric, m.value)} of ${amount(m.metric, m.target)}`),
        m.reached ? null : el('span', {}, `${Math.floor(m.progress * 100)}%`)),
      m.reached ? m.pinned ? el('span', { class: 'lt-target-status' }, 'Your target · reached') : null
        : el('button', { class: 'lt-link lt-pin-target', 'aria-pressed': String(m.pinned), onClick: () => choose(m.pinned ? null : m.id) }, m.pinned ? 'Clear target' : 'Make this my target'));
  }

  function refresh() {
    const list = milestones(game.ctx);
    const perks = ownedPerks(game.ctx);
    const target = pinnedMilestone(game.ctx);
    const k = JSON.stringify([list.map(m => [m.id, m.reached, Math.floor(m.progress * 100), amount(m.metric, m.value), m.pinned]), perks, target?.nextStep]);
    if (k === key) return;
    key = k;
    const done = list.filter((m) => m.reached);
    setText(reachedValue, `${done.length} of ${list.length}`);
    const next = list.filter((m) => !m.reached).sort((a, b) => b.progress - a.progress)[0];
    setText(reachedNote, next ? `Closest: ${next.title} (${Math.floor(next.progress * 100)}%)` : 'Every milestone reached');
    setText(rewardsValue, money(done.reduce((a, m) => a + (m.reward ?? 0), 0)));
    setText(perksValue, `${perks.length} of ${Object.keys(cfg.perks).length}`);

    targetBox.replaceChildren(...(target ? [
      el('div', { class: 'lt-card-label' }, target.reached ? 'Personal target reached' : 'Your personal target'),
      el('div', { class: 'lt-ms-head' }, el('b', {}, target.title), el('button', { class: 'lt-link', onClick: () => choose(null) }, 'Clear target')),
      el('p', { class: 'lt-note' }, target.text),
      el('div', { class: 'lt-target-progress' }, target.reached ? `Reached on day ${target.day}` : `${amount(target.metric, target.value)} of ${amount(target.metric, target.target)} · ${Math.floor(target.progress * 100)}%`),
      el('div', { class: 'lt-ms-bar' }, el('i', { style: { width: `${Math.round(target.progress * 100)}%` } })),
      el('p', { class: 'lt-target-benefit' }, `${target.reached ? 'Earned' : 'Reward'}: ${money(target.reward ?? 0)}${target.perkName ? ` · ${target.perkName}: ${target.perkText}` : ''}`),
      el('p', { class: 'lt-note' }, target.nextStep),
    ] : [
      el('div', { class: 'lt-card-label' }, 'Your direction'),
      el('b', {}, 'Choose a milestone to follow'),
      el('p', { class: 'lt-note' }, 'Dig deeper, improve the yard or build your fleet. Make any unfinished milestone below your personal target; change it whenever you like. Every achievement still pays its reward when reached.'),
    ]));

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
    targetBox,
    el('div', { class: 'lt-stats' },
      el('div', { class: 'lt-stat' }, el('div', { class: 'lt-stat-label' }, 'Reached'), reachedValue, reachedNote),
      el('div', { class: 'lt-stat' }, el('div', { class: 'lt-stat-label' }, 'Rewards earned'), rewardsValue),
      el('div', { class: 'lt-stat' }, el('div', { class: 'lt-stat-label' }, 'Perks'), perksValue)),
    el('div', { class: 'lt-card' }, el('div', { class: 'lt-card-label' }, 'Perks'), perksBox),
    groupsBox);
  return { node, refresh, headSet: true };
}
