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
  // A regular customer (standing order): an offer to take or turn down, or this week's quota.
  const regular = el('div', { class: 'lt-card lt-regular' });
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
    const st = c.standing ?? {};
    const k = JSON.stringify([c.offers.map((o) => o.id), c.active.map((a) => [a.id, a.delivered]), getDate(game.state, data).day,
      st.offer?.client, st.active && [st.active.week, st.active.delivered, st.active.paidThisWeek]]);
    if (k === key) return;
    key = k;
    activeBox.replaceChildren();
    if (!c.active.length) activeBox.append(el('div', { class: 'lt-muted-row' }, 'No jobs on the go. Take one on below.'));
    for (const a of c.active) {
      const f = Math.min(1, a.delivered / a.tonnes);
      activeBox.append(el('div', { class: 'lt-job active' },
        el('div', { class: 'lt-job-head' }, el('b', {}, a.client, a.rush ? el('span', { class: 'lt-rush' }, 'Rush') : null), el('span', { class: 'lt-job-bonus' }, `+${money(a.bonus)}`)),
        el('div', { class: 'lt-job-what' }, dot(a.material), `${tonnes(a.tonnes)} of clean ${matName(a.material).toLowerCase()}`),
        el('div', { class: 'lt-job-bar' }, el('i', { style: { width: `${Math.round(f * 100)}%` } })),
        el('div', { class: 'lt-job-foot' }, el('span', {}, `${tonnes(a.delivered)} of ${tonnes(a.tonnes)} in`), el('span', {}, dueText(a.deadline)))));
    }
    renderRegular(st);
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
        el('div', { class: `lt-job-head` }, el('b', {}, o.client, o.rush ? el('span', { class: 'lt-rush' }, 'Rush') : null), el('span', { class: 'lt-job-bonus' }, `+${money(o.bonus)}`)),
        el('div', { class: 'lt-job-what' }, dot(o.material), `${tonnes(o.tonnes)} of clean ${matName(o.material).toLowerCase()}`),
        el('div', { class: 'lt-job-foot' }, el('span', {}, `${o.days} day${o.days > 1 ? 's' : ''} to deliver`), el('span', {}, o.rush ? 'Today only' : `Offer open until day ${o.expires}`)),
        take));
    }
  }
  function renderRegular(st) {
    const cfg = data.contracts.standing;
    const rep = reputation(game.ctx);
    regular.replaceChildren(el('div', { class: 'lt-card-label' }, 'Regular customer'));
    if (st.active) {
      const a = st.active;
      const f = Math.min(1, a.delivered / a.tonnesPerWeek);
      regular.append(el('div', { class: 'lt-job active regular' },
        el('div', { class: 'lt-job-head' }, el('b', {}, a.client), el('span', { class: 'lt-job-bonus' }, `+${money(a.weeklyBonus)} a week`)),
        el('div', { class: 'lt-job-what' }, dot(a.material), `${tonnes(a.tonnesPerWeek)} of clean ${matName(a.material).toLowerCase()} every week`),
        el('div', { class: 'lt-job-bar' }, el('i', { style: { width: `${Math.round(f * 100)}%` } })),
        el('div', { class: 'lt-job-foot' },
          el('span', {}, a.paidThisWeek ? 'This week: delivered and paid' : `This week: ${tonnes(a.delivered)} of ${tonnes(a.tonnesPerWeek)} in`),
          el('span', {}, `Week ${a.week} of ${a.weeks} · ${dueText(a.weekEnd).replace('Due', 'ends')}`))));
    } else if (st.offer) {
      const o = st.offer;
      const take = el('button', { class: 'btn btn-primary lt-buy', onClick: () => {
        const r = game.actions.acceptStandingOrder();
        feedback.message(r.ok ? `${o.client} is now a regular customer` : r.reason, r.ok ? 'good' : 'warn');
        key = '';
        refresh();
      } }, 'Become their supplier');
      const no = el('button', { class: 'btn lt-buy', onClick: () => {
        game.actions.declineStandingOrder();
        key = '';
        refresh();
      } }, 'Turn it down');
      regular.append(el('div', { class: 'lt-job regular' },
        el('div', { class: 'lt-job-head' }, el('b', {}, o.client), el('span', { class: 'lt-job-bonus' }, `+${money(o.weeklyBonus)} a week`)),
        el('div', { class: 'lt-job-what' }, dot(o.material), `${tonnes(o.tonnesPerWeek)} of clean ${matName(o.material).toLowerCase()} every week, for ${o.weeks} weeks`),
        el('div', { class: 'lt-job-foot' }, el('span', {}, 'A week you fall short costs reputation'), el('span', {}, `Offer open until day ${o.expires}`)),
        el('div', { class: 'lt-regular-actions' }, take, no)));
    } else {
      regular.append(el('div', { class: 'lt-muted-row' }, rep.level < (cfg?.fromReputation ?? 4)
        ? `Reach "${data.contracts.reputation.names[cfg?.fromReputation ?? 4]}" and local firms will ask you for a regular weekly supply.`
        : 'No regular customer at the moment. Firms ask now and then, in the morning.'));
    }
  }

  refresh();

  const node = el('div', { class: 'lt-home' },
    el('div', { class: 'lt-card lt-rep' }, el('div', {}, el('div', { class: 'lt-card-label' }, 'Your reputation'), repName), repBar, repNote),
    regular,
    el('div', { class: 'lt-card' }, el('div', { class: 'lt-card-label' }, 'On the go'), activeBox),
    el('div', {}, el('div', { class: 'lt-card-label lt-offers-label' }, 'Offers'), offersBox),
    el('p', { class: 'lt-note' }, 'Weigh in at the depot and tip in the right bay as usual: you’re paid for each load, and a load that’s clean counts toward the job. The bonus comes when the last tonne is in. New offers turn up every morning.'));
  return { node, refresh, headSet: true };
}
