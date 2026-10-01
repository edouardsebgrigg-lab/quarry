// Staff: your posts (filled, open, or what it takes to open the next), each person's skills,
// wage and what they're doing, the job you give them (and the machine), and who's applying.
import { el } from '../../dom.js';
import { money } from '../../format.js';
import { machineName } from '../../../machinery/index.js';
import {
  SKILLS, staffState, openSlots, nextSlot, hiringFee, machinesFor, roleNeeds,
  experienceProgress,
} from '../../../staff/index.js';
import { contractsState } from '../../../contracts/index.js';
import { lineIcon } from './icons.js';

const stars = (n) => el('span', { class: 'st-stars' }, Array.from({ length: 5 }, (_, i) => el('i', { class: i < n ? 'on' : '' })));

export function staffApp({ game, feedback, world, setHead }) {
  const { data } = game;
  const ctx = game.ctx;
  const cfg = data.staff;
  setHead('Staff', 'The people who work for you: give each a job and a machine, and they get on with it');
  const body = el('div', { class: 'lt-home' });
  let key = '';

  const skillRows = (p) => el('div', { class: 'st-skills' }, SKILLS.map((k) => el('div', { class: 'st-skill' }, el('span', {}, cfg.skills[k]), stars(p.skills[k]))));
  const bestAt = (p) => SKILLS.reduce((b, k) => (p.skills[k] > p.skills[b] ? k : b), SKILLS[0]);
  const roleFor = (skill) => Object.entries(cfg.roles).find(([, r]) => r.skill === skill)?.[0];

  function workerCard(w) {
    const m = w.machineId && game.state.machines.find((x) => x.id === w.machineId);
    const away = !!m?.away;
    const roleChips = el('div', { class: 'st-roles' },
      [['', 'No job'], ...Object.entries(cfg.roles).map(([id, r]) => [id, r.name])].map(([id, label]) => el('button', {
        class: `lt-chip${(w.role ?? '') === id ? ' active' : ''}`,
        disabled: away,
        title: id ? cfg.roles[id].text : 'Paid, but not working',
        onClick: () => {
          if (!id) return act(game.actions.assignStaff(w.id, null), `${w.name} is standing by`);
          const need = roleNeeds(id);
          if (!need) return act(game.actions.assignStaff(w.id, id), `${w.name}: ${cfg.roles[id].name.toLowerCase()}`);
          const [first] = machinesFor(ctx, id, w);
          if (!first) return feedback.message(id === 'dig' ? 'You need a free digger for that' : 'You need a free road vehicle with a bed (pickup, truck or tractor) for that', 'warn');
          assign(w, id, first.id);
        },
      }, label)));
    const need = w.role && roleNeeds(w.role);
    const machineChips = need ? el('div', { class: 'st-machines' }, el('span', { class: 'st-label' }, 'Machine'),
      machinesFor(ctx, w.role, w).map((x) => el('button', {
        class: `lt-chip${w.machineId === x.id ? ' active' : ''}`, disabled: away || x.broken,
        onClick: () => assign(w, w.role, x.id),
      }, machineName(data, x), x.broken ? ' (broken)' : ''))) : null;
    const c = contractsState(ctx);
    const destinations = [[null,'Best depot bay'], ...c.active.map(a=>[{kind:'job',id:a.id},`${a.client}: ${data.materials[a.material].name}`])];
    const regular = c.standing.active;
    if (regular) destinations.push([{kind:'standing',client:regular.client,material:regular.material},`${regular.client} (regular): ${data.materials[regular.material].name}`]);
    const deliveryChips = w.role === 'haul' ? el('div',{class:'st-machines'},el('span',{class:'st-label'},'Customer'),destinations.map(([delivery,label])=>el('button',{
      class:`lt-chip${JSON.stringify(w.delivery)===JSON.stringify(delivery)?' active':''}`,disabled:away || w.phase==='out',
      onClick:()=>act(game.actions.configureStaffHaul(w.id,{delivery}),`${w.name}: ${label}`),
    },label))) : null;
    const partners = [[null,'Load field heaps'], ...staffState(ctx).workers.filter(p=>p.role==='dig').map(p=>[p.id,p.name])];
    const partnerChips = w.role === 'haul' ? el('div',{class:'st-machines'},el('span',{class:'st-label'},'Loading'),partners.map(([partnerId,label])=>el('button',{
      class:`lt-chip${w.partnerId===partnerId?' active':''}`,disabled:away || w.phase==='out',
      onClick:()=>act(game.actions.configureStaffHaul(w.id,{partnerId,spot:world?.machinePlacement?.(w.machineId)}),`${w.name}: ${label}`),
    },label))) : null;
    const skill = cfg.roles[w.role]?.skill;
    const xp = skill ? experienceProgress(ctx,w,skill) : null;
    const units = {dig:'t dug',drive:'round trips',sell:'t sold',fix:'jobs completed'};
    const done = [w.stats.dug ? `${w.stats.dug.toFixed(1)} t dug` : null, w.stats.loads ? `${w.stats.loads} load${w.stats.loads > 1 ? 's' : ''} · ${money(w.stats.sold)} sold` : null,
      w.stats.fixed ? `${w.stats.fixed} machine${w.stats.fixed > 1 ? 's' : ''} seen to` : null].filter(Boolean).join(' · ');
    return el('div', { class: 'lt-card st-worker' },
      el('div', { class: 'st-head' },
        el('div', { class: 'lt-avatar' }, w.name[0]),
        el('div', { class: 'st-name' }, el('b', {}, w.name), el('span', {}, `${money(w.wage)} a day · since day ${w.hired}`)),
        el('span', { class: `st-status ${w.role ? (away ? 'away' : 'on') : ''}` }, w.role ? w.status : 'No job')),
      skillRows(w),
      xp ? el('p',{class:'st-role-text'},xp.max ? `${cfg.skills[skill]}: maximum skill` : `${cfg.skills[skill]} experience: ${xp.have.toFixed(1)} / ${xp.need} ${units[skill]} to the next star`) : null,
      el('div', { class: 'st-label' }, 'Job'), roleChips,
      w.role ? el('p', { class: 'st-role-text' }, cfg.roles[w.role].text) : null,
      machineChips,
      deliveryChips, partnerChips,
      el('div', { class: 'st-foot' }, el('span', {}, done || 'Nothing done yet'),
        el('button', { class: 'lt-link st-letgo', disabled: away, onClick: () => {
          const r = game.actions.dismissStaff(w.id);
          act(r, r.ok ? `${w.name} has gone, with ${money(r.pay)} notice pay` : '');
        } }, `Let go (${money(w.wage * cfg.noticeDays)} notice)`)));
  }

  function assign(w, role, machineId) {
    // (a digger operator works where the machine stands now)
    const spot = world?.machinePlacement?.(machineId) ?? null;
    const m = game.state.machines.find((x) => x.id === machineId);
    act(game.actions.assignStaff(w.id, role, { machineId, spot }), `${w.name}: ${cfg.roles[role].name.toLowerCase()} on the ${machineName(data, m)}`);
  }

  function act(r, ok) {
    feedback.message(r.ok ? ok : r.reason, r.ok ? 'good' : 'warn');
    key = '';
    render();
  }

  function render() {
    const st = staffState(ctx);
    const open = openSlots(ctx);
    const k = JSON.stringify([open, st.applicants.map((a) => a.id), st.workers.map((w) => [w.id, w.role, w.machineId, w.status, w.stats, w.skills, w.delivery, w.partnerId, Object.values(w.experience).map(Math.floor)]),contractsState(ctx).active,contractsState(ctx).standing.active,
      game.state.machines.map((m) => [m.id, m.operator, m.away, m.broken])]);
    if (k === key) return;
    key = k;
    const posts = [];
    for (let i = 0; i < cfg.slots.length; i++) {
      const w = st.workers[i];
      if (w) posts.push(workerCard(w));
      else if (i < open) posts.push(el('div', { class: 'lt-card st-post open' }, lineIcon('people', 'st-post-icon'), el('b', {}, 'Open post'), el('span', {}, 'Hire someone from the applicants below')));
      else {
        const next = i === open ? nextSlot(ctx) : null;
        posts.push(el('div', { class: 'lt-card st-post locked' }, lineIcon('people', 'st-post-icon'), el('b', {}, `Post ${i + 1}`),
          el('span', {}, cfg.slots[i].text),
          next ? el('div', { class: 'st-req' }, next.parts.map((p) => el('div', { class: 'st-req-row' },
            el('span', {}, p.label), el('div', { class: 'lt-job-bar' }, el('i', { style: { width: `${Math.min(100, (p.have / p.need) * 100)}%` } })),
            el('b', {}, p.money ? `${money(p.have)} / ${money(p.need)}` : `${p.have} / ${p.need}`)))) : el('span', { class: 'st-later' }, 'After the post before it')));
      }
    }
    const hiring = open > st.workers.length;
    body.replaceChildren(...[
      el('div',{class:'lt-card'},el('div',{class:'lt-card-label'},'Daily payroll'),
        el('b',{},`${money(st.workers.reduce((sum,w)=>sum+w.wage,0))} each morning`),
        el('p',{class:'lt-note'},'A business day takes 20 minutes at 1×. Apprentices learn through real work; their agreed wage stays fixed.')),
      el('div', { class: 'st-posts' }, posts),
      hiring ? el('div', {}, el('div', { class: 'lt-card-label lt-offers-label' }, 'Applicants'),
        st.applicants.length ? el('div', { class: 'lt-jobs' }, st.applicants.map((a) => {
          const fee = hiringFee(ctx, a);
          const good = bestAt(a);
          return el('div', { class: 'lt-job st-applicant' },
            el('div', { class: 'lt-job-head' }, el('b', {}, a.name), el('span', { class: 'st-wage' }, `${money(a.wage)} a day`)),
            el('div', { class: 'st-best' }, `${a.apprentice ? 'Apprentice · learns through work · ' : ''}Best as: ${cfg.roles[roleFor(good)]?.name ?? cfg.skills[good]}`),
            skillRows(a),
            el('button', { class: 'btn btn-primary lt-buy', disabled: game.state.money < fee, onClick: () => {
              const r = game.actions.hireStaff(a.id);
              act(r, `${a.name} starts today (agency fee ${money(fee)})`);
            } }, `Hire · ${money(fee)} fee`));
        })) : el('div', { class: 'lt-muted-row' }, 'No one applying today. New applicants come every few days.')) : null,
      el('p', { class: 'lt-note' }, `Wages are paid every morning. Experience earns stars through completed work; the agreed wage stays fixed. Park the digger and truck within arm's reach before assigning them, then choose the operator under Loading. A customer delivery needs clean material; a completed order waits for a new choice, and a regular customer waits for next week's quota. You can't use a worked machine; give its worker another job (or none) first.`),
    ].filter(Boolean));
  }

  render();
  return { node: body, refresh: render, headSet: true };
}
