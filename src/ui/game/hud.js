// Top of the screen, sim style: a compact money / date / game-speed widget top right and
// a one-line goal top left (details show when a goal is new, or with J).
import { el, setText, icon } from '../dom.js';
import { money, clockTime, tonnes } from '../format.js';
import { visualHour } from '../../core/visualClock.js';
import { getDate } from '../../core/index.js';
import { getSiteData } from '../../quarry/index.js';
import { keyLabel } from '../../input/index.js';
import { currentObjective } from '../../progression/index.js';
import { contractsState } from '../../contracts/index.js';
import { currentWeather } from '../../weather/index.js';
import { pinnedMilestone } from '../../career/index.js';

const DETAIL_TIME = 9; // seconds a new goal stays expanded
const milestoneAmount = (metric, value) => ['tonnesSold', 'tonnesDug', 'cleanTonnes', 'gravelDug'].includes(metric) ? tonnes(value)
  : ['bestDay', 'totalEarned'].includes(metric) ? money(value) : metric === 'roadMetres' ? `${Math.round(value)} m` : String(Math.floor(value));

// Small line icons for the weather (24-unit box).
const SUN = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>';
const CLOUD = '<path d="M7 18.5h10.2a4 4 0 0 0 .4-8 5.6 5.6 0 0 0-10.8 1.3A3.4 3.4 0 0 0 7 18.5z"/>';
const RAIN = '<path d="M7 14.5h10.2a4 4 0 0 0 .4-8 5.6 5.6 0 0 0-10.8 1.3A3.4 3.4 0 0 0 7 14.5z"/><path d="M8.5 17.5l-1 3M12.5 17.5l-1 3M16.5 17.5l-1 3"/>';
const MOON = '<path d="M19.5 15.5A8 8 0 0 1 8.5 4.5a8 8 0 1 0 11 11z"/>';
const WEATHER_ICONS = { sunny: SUN, night: MOON, cloudy: CLOUD, showers: RAIN, rain: RAIN };
function weatherIcon(id) {
  const span = el('span', { class: 'hs-wicon' });
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${WEATHER_ICONS[id] ?? SUN}</svg>`;
  return span;
}

export function createHud({ game, runtime, settings }) {
  const moneyText = el('div', { class: 'hs-money' });
  const debtTag = el('span', { class: 'hs-debt' }, 'DEBT');
  const dateText = el('span', { class: 'hs-date', title: 'A business day takes 20 minutes at 1×. Wages, prices and deadlines follow this clock. Daylight takes 20 minutes of active play independently of speed.' });
  const siteText = el('span', { class: 'hs-site' });
  const weatherText = el('span', { class: 'hs-weather' });
  let weatherId = '';

  const speedButtons = [
    { content: icon('pause'), title: 'Pause time', onClick: () => runtime.togglePause(), isActive: () => runtime.isUserPaused() },
    ...game.data.game.speeds.map((s, i) => ({
      content: `${s}×`,
      title: `Speed ${s}×`,
      onClick: () => runtime.setSpeed(i),
      isActive: () => !runtime.isUserPaused() && !runtime.isDevFast() && runtime.speedIndex() === i,
    })),
  ].map((b) => ({ ...b, node: el('button', { title: b.title, onClick: b.onClick }, b.content) }));

  const status = el('div', { class: 'hud-status' },
    el('div', { class: 'hs-top' }, debtTag, moneyText),
    el('div', { class: 'hs-meta' }, siteText, el('span', { class: 'sep' }, '·'), dateText, el('span', { class: 'sep' }, '·'), weatherText),
    el('div', { class: 'hs-speed' }, speedButtons.map((b) => b.node)));

  // Goal: one line, expands with details.
  const goalCount = el('span', { class: 'goal-count' });
  const goalKind = el('span', { class: 'goal-kind', hidden: true }, 'Target');
  const goalTitle = el('span', { class: 'goal-title' });
  const goalReward = el('span', { class: 'goal-reward' });
  const goalText = el('div', { class: 'goal-text' });
  const goalKey = el('span', { class: 'goal-key' });
  const goalFill = el('div', { class: 'goal-fill' });
  const goal = el('div', { class: 'hud-goal' },
    el('div', { class: 'goal-line' }, el('span', { class: 'goal-dot' }), goalKind, goalTitle, goalCount, goalReward),
    el('div', { class: 'goal-track' }, goalFill),
    el('div', { class: 'goal-details' }, el('div', {}, goalText, goalKey))); // (one row, so it folds away completely)
  let currentGoal = '';
  let detailT = 0;
  let detailsPinned = false;

  // The most urgent job from the jobs board, under the goal.
  const jobText = el('span', { class: 'job-text' });
  const jobFill = el('div', { class: 'goal-fill' });
  const job = el('div', { class: 'hud-job' }, el('div', { class: 'goal-line' }, el('span', { class: 'job-tag' }, 'Job'), jobText),
    el('div', { class: 'goal-track' }, jobFill));
  let jobKey = '';

  const node = el('div', { class: 'hud' }, el('div', { class: 'hud-left' }, goal, job), status);
  let shownMoney = game.state.money;

  return {
    node,
    moneyNode: moneyText,
    toggleGoal() {
      detailsPinned = !detailsPinned;
      detailT = 0;
    },
    update(dt, { active = true } = {}) {
      const target = game.state.money;
      // Count toward the real value so gains feel like they "roll in".
      shownMoney += (target - shownMoney) * Math.min(1, dt * 6);
      if (Math.abs(target - shownMoney) < 0.5) shownMoney = target;
      setText(moneyText, money(shownMoney));
      moneyText.classList.toggle('negative', target < 0);
      debtTag.style.display = target < 0 ? '' : 'none';
      setText(dateText, clockTime(getDate(game.state, game.data)));
      setText(siteText, getSiteData(game.data, game.state.currentSiteId).name);
      const w = currentWeather(game.ctx);
      const hour = visualHour(game.state, game.data);
      const period = hour < 5.5 || hour >= 19 ? 'Night' : hour < 7 ? 'Dawn' : hour >= 17 ? 'Dusk' : '';
      const id = `${w.kind}:${period}`;
      if (id !== weatherId) {
        weatherId = id;
        weatherText.replaceChildren(weatherIcon(w.kind === 'sunny' && period === 'Night' ? 'night' : w.kind), `${w.kind === 'sunny' && period === 'Night' ? 'Clear' : w.name}${period ? ` · ${period}` : ''}`);
        weatherText.classList.toggle('wet', w.rain > 0);
      }
      for (const b of speedButtons) b.node.classList.toggle('active', b.isActive());

      const jobs = contractsState(game.ctx).active;
      const soonest = [...jobs].sort((a, b) => a.deadline - b.deadline)[0];
      job.style.display = soonest ? '' : 'none';
      if (soonest) {
        const today = getDate(game.state, game.data).day;
        const due = soonest.deadline <= today ? 'due today' : `due day ${soonest.deadline}`;
        const k = `${soonest.id}:${soonest.delivered}:${due}:${jobs.length}`;
        if (k !== jobKey) {
          jobKey = k;
          const mat = game.data.materials[soonest.material]?.name.toLowerCase() ?? soonest.material;
          setText(jobText, `${soonest.delivered.toFixed(1)} / ${soonest.tonnes.toFixed(1)} t clean ${mat} · ${soonest.client} · ${due}${jobs.length > 1 ? ` · +${jobs.length - 1} more` : ''}`);
          jobFill.style.width = `${Math.round(Math.min(1, soonest.delivered / soonest.tonnes) * 100)}%`;
          job.classList.toggle('urgent', soonest.deadline <= today);
        }
      }

      const personal = pinnedMilestone(game.ctx);
      const o = personal ? { ...personal, id: `personal:${personal.id}:${personal.reached ? 'reached' : 'active'}` } : currentObjective(game.ctx);
      goal.style.display = o ? '' : 'none';
      goalKind.hidden = !personal;
      goal.classList.toggle('personal-target', !!personal);
      goal.classList.toggle('target-reached', !!personal?.reached);
      if (!o) return;
      if (o.id !== currentGoal) {
        currentGoal = o.id;
        setText(goalTitle, o.title);
        setText(goalReward, personal ? `${personal.reached ? 'Earned ' : '+'}${money(personal.reward ?? 0)}${personal.perkName ? ` · ${personal.perkName}` : ''}` : o.reward ? `+${money(o.reward)}` : '');
        setText(goalText, personal ? `${personal.text} ${personal.nextStep}${personal.perkText ? ` ${personal.reached ? 'Perk active' : 'Unlocks'}: ${personal.perkText}` : ''}` : o.text);
        detailT = DETAIL_TIME;
        goal.classList.remove('goal-new');
        void goal.offsetWidth; // restart the highlight animation
        goal.classList.add('goal-new');
      }
      setText(goalCount, personal ? personal.reached ? 'Reached' : `${milestoneAmount(personal.metric, personal.value)} / ${milestoneAmount(personal.metric, personal.target)}` : `${o.number}/${o.total}`);
      if (personal && !personal.reached) setText(goalText, `${personal.text} ${personal.nextStep}${personal.perkText ? ` Unlocks: ${personal.perkText}` : ''}`);
      setText(goalKey, `${keyLabel(settings.bindings.goal)} · ${detailsPinned ? 'hide details' : 'keep details open'}${personal ? ' · switch target in Milestones' : ''}`);
      if (active) detailT = Math.max(0, detailT - dt); // the details stay up until you're playing
      goal.classList.toggle('open', detailsPinned || detailT > 0);
      goal.classList.toggle('has-progress', o.progress !== null);
      if (o.progress !== null) goalFill.style.width = `${Math.round(o.progress * 100)}%`;
    },
  };
}
