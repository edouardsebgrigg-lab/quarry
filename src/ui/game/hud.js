// Top of the screen, sim style: a compact money / date / game-speed widget top right and
// a one-line goal top left (details show when a goal is new, or with J).
import { el, setText, icon } from '../dom.js';
import { money, clockTime } from '../format.js';
import { getDate } from '../../core/index.js';
import { getSiteData } from '../../quarry/index.js';
import { keyLabel } from '../../input/index.js';
import { currentObjective } from '../../progression/index.js';
import { contractsState } from '../../contracts/index.js';
import { currentWeather } from '../../weather/index.js';

const DETAIL_TIME = 9; // seconds a new goal stays expanded

export function createHud({ game, runtime, settings }) {
  const moneyText = el('div', { class: 'hs-money' });
  const debtTag = el('span', { class: 'hs-debt' }, 'DEBT');
  const dateText = el('span', { class: 'hs-date' });
  const siteText = el('span', { class: 'hs-site' });
  const weatherText = el('span', { class: 'hs-weather' });

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
  const goalTitle = el('span', { class: 'goal-title' });
  const goalReward = el('span', { class: 'goal-reward' });
  const goalText = el('div', { class: 'goal-text' });
  const goalKey = el('span', { class: 'goal-key' });
  const goalFill = el('div', { class: 'goal-fill' });
  const goal = el('div', { class: 'hud-goal' },
    el('div', { class: 'goal-line' }, el('span', { class: 'goal-dot' }), goalTitle, goalCount, goalReward),
    el('div', { class: 'goal-track' }, goalFill),
    el('div', { class: 'goal-details' }, goalText, goalKey));
  let currentGoal = '';
  let detailT = 0;
  let pinned = false;

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
      pinned = !pinned;
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
      setText(weatherText, w.name);
      weatherText.classList.toggle('wet', w.rain > 0);
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

      const o = currentObjective(game.ctx);
      goal.style.display = o ? '' : 'none';
      if (!o) return;
      if (o.id !== currentGoal) {
        currentGoal = o.id;
        setText(goalTitle, o.title);
        setText(goalCount, `${o.number}/${o.total}`);
        setText(goalReward, o.reward ? `+${money(o.reward)}` : '');
        setText(goalText, o.text);
        detailT = DETAIL_TIME;
        goal.classList.remove('goal-new');
        void goal.offsetWidth; // restart the highlight animation
        goal.classList.add('goal-new');
      }
      setText(goalKey, `${keyLabel(settings.bindings.goal)} · ${pinned ? 'hide details' : 'keep details open'}`);
      if (active) detailT = Math.max(0, detailT - dt); // the details stay up until you're playing
      goal.classList.toggle('open', pinned || detailT > 0);
      goal.classList.toggle('has-progress', o.progress !== null);
      if (o.progress !== null) goalFill.style.width = `${Math.round(o.progress * 100)}%`;
    },
  };
}
