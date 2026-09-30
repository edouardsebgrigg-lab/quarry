// The jobs board: customers who pay a bonus for clean material by a deadline.
import { el, setText } from '../../dom.js';
import { money, tonnes } from '../../format.js';
import { getDate } from '../../../core/index.js';
import { contractsState, reputation } from '../../../contracts/index.js';

export function jobsApp({ game, feedback, setHead }) {
  const { data } = game;
  setHead('Jobs board', 'Local customers pay a bonus on top of the depot price for clean material, delivered on time');
  const repName = el('b');
  const repBar = el('div', { class: 'lt-rep-bar' });
  const repNote = el('span');
  const activeBox = el('div', { class: 'lt-jobs' });
  const offersBox = el('div', { class: 'lt-jobs' });
  let key = '';

  const dot = (m) => el('span', { class: 'dot', style: { background: data.materials[m]?.color } });
  const matName = (m) => data.materials[m]?.name ?? m;
  const dueText = (deadline) => {
    const left = deadline - getDate(game.state, data).day;
    return left <= 0 ? 'Due today' : `Due day ${deadline} · ${left + 1} days left`;
  };

  function refresh() {
    const c = contractsState(game.ctx);
    const rep = reputation(game.ctx);
    setText(repName, `${rep.name} · ${Math.floor(rep.level)}/10`);
    repBar.replaceChildren(...Array.from({ length: 10 }, (_, i) => el('i', { class: i < Math.floor(rep.level) ? 'on' : '' })));
    setText(repNote, rep.level > 0 ? `Bonuses +${Math.round(rep.bonusBoost * 100)}% · ${c.done} done, ${c.failed} let down` : 'Finish jobs on time to build a name: bigger bonuses and more offers');
    const k = JSON.stringify([c.offers.map((o) => o.id), c.active.map((a) => [a.id, a.delivered]), getDate(game.state, data).day]);
    if (k === key) return;
    key = k;
    activeBox.replaceChildren();
    if (!c.active.length) activeBox.append(el('div', { class: 'lt-muted-row' }, 'No jobs on the go. Take one on below.'));
    for (const a of c.active) {
      const f = Math.min(1, a.delivered / a.tonnes);
      activeBox.append(el('div', { class: 'lt-job active' },
        el('div', { class: 'lt-job-head' }, el('b', {}, a.client), el('span', { class: 'lt-job-bonus' }, `+${money(a.bonus)}`)),
        el('div', { class: 'lt-job-what' }, dot(a.material), `${tonnes(a.tonnes)} of clean ${matName(a.material).toLowerCase()}`),
        el('div', { class: 'lt-job-bar' }, el('i', { style: { width: `${Math.round(f * 100)}%` } })),
        el('div', { class: 'lt-job-foot' }, el('span', {}, `${tonnes(a.delivered)} of ${tonnes(a.tonnes)} in`), el('span', {}, dueText(a.deadline)))));
    }
    offersBox.replaceChildren();
    const full = c.active.length >= data.contracts.maxActive;
    for (const o of c.offers) {
      const take = el('button', { class: 'btn btn-primary lt-buy', disabled: full, onClick: () => {
        const r = game.actions.acceptContract(o.id);
        feedback.message(r.ok ? `Job taken: ${tonnes(o.tonnes)} of ${matName(o.material).toLowerCase()} for ${o.client}` : r.reason, r.ok ? 'good' : 'warn');
        key = '';
        refresh();
      } }, full ? 'Finish a job first' : 'Take the job');
      offersBox.append(el('div', { class: 'lt-job' },
        el('div', { class: 'lt-job-head' }, el('b', {}, o.client), el('span', { class: 'lt-job-bonus' }, `+${money(o.bonus)}`)),
        el('div', { class: 'lt-job-what' }, dot(o.material), `${tonnes(o.tonnes)} of clean ${matName(o.material).toLowerCase()}`),
        el('div', { class: 'lt-job-foot' }, el('span', {}, `${o.days} day${o.days > 1 ? 's' : ''} to deliver`), el('span', {}, `Offer open until day ${o.expires}`)),
        take));
    }
  }
  refresh();

  const node = el('div', { class: 'lt-home' },
    el('div', { class: 'lt-card lt-rep' }, el('div', {}, el('div', { class: 'lt-card-label' }, 'Your reputation'), repName), repBar, repNote),
    el('div', { class: 'lt-card' }, el('div', { class: 'lt-card-label' }, 'On the go'), activeBox),
    el('div', {}, el('div', { class: 'lt-card-label lt-offers-label' }, 'Offers'), offersBox),
    el('p', { class: 'lt-note' }, 'Weigh in at the depot and tip in the right bay as usual: you’re paid for each load, and a load that’s clean counts toward the job. The bonus comes when the last tonne is in. New offers turn up every morning.'));
  return { node, refresh, headSet: true };
}
