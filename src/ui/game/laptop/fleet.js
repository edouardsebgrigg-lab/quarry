// Your fleet: every machine with its condition, what it's done and what it's worth.
import { el, setText } from '../../dom.js';
import { money } from '../../format.js';
import { machinesAt, machineName, resaleValue, attachedTrailer, attachTrailer, detachTrailer, trailerCompatibility } from '../../../machinery/index.js';
import { machineLog } from '../../../game/logbook.js';
import { weeklyInsurance, insuranceState, insuranceCover, nextRenewal } from '../../../economy/index.js';
import { hireState, hireCandidates, machinesOnHire } from '../../../hire/index.js';
import { workerFor } from '../../../staff/index.js';
import { withArticle } from '../../../core/index.js';

export function fleetApp({ game, feedback, photos, openApp, setHead }) {
  const { data } = game;
  const ctx = game.ctx;
  setHead('Your fleet', 'Condition, upkeep and trailer connections for your machines');
  const ms = machinesAt(ctx, game.state.currentSiteId);
  const pending = [];
  const totalV = el('div', { class: 'lt-stat-value' });
  const attnV = el('div', { class: 'lt-stat-value' });
  const attnN = el('div', { class: 'lt-stat-note' });
  const cells = [];

  const rows = ms.map((m) => {
    const img = el('img', { class: 'lt-photo-img', alt: '' });
    const box = el('div', { class: 'lt-photo mini' }, img);
    pending.push([img, box, m]);
    const cond = el('i');
    const condT = el('span', { class: 'lt-fl-cond-t' });
    const status = el('span', { class: 'lt-fl-status' });
    const value = el('b');
    const call = el('button', { class: 'btn btn-small lt-call', onClick: () => {
      const r = game.actions.callMechanic(m.id);
      feedback.message(r.ok ? `Mechanic on the way: ${r.kind === 'repair' ? 'repair' : 'service'} for ${money(r.total)}` : r.reason, r.ok ? 'good' : 'warn');
      refresh();
    } });
    cells.push({ m, cond, condT, status, value, call });
    const log = machineLog(ctx, m.id);
    const t = data.machines.types[m.type];
    const work = t.kind === 'digger'
      ? `${log.tonnesDug.toFixed(1)} t dug`
      : `${log.loads} load${log.loads === 1 ? '' : 's'} sold · ${money(log.earned)} earned`;
    return el('div', { class: 'lt-row lt-fl-row' },
      box,
      el('div', { class: 'lt-row-main' },
        el('b', {}, machineName(data, m)), status,
        el('span', {}, `${work}${log.breakdowns ? ` · broke down ${log.breakdowns}×` : ''}`)),
      el('div', { class: 'lt-fl-metrics' },
        el('div', { class: 'lt-fl-col' }, el('div', { class: 'lt-cond' }, cond), condT),
        el('div', { class: 'lt-fl-col lt-fl-val' }, el('span', {}, m.rental ? 'Deposit held' : 'Worth'), value)),
      el('div', { class: 'lt-fl-actions' }, call, towControls(m), rentalControls(m)));
  });

  function resultMessage(result, text) {
    feedback.message(result.ok ? text : result.reason, result.ok ? 'good' : 'warn');
    if (result.ok) openApp('fleet');
  }
  function towControls(m) {
    if (m.type !== 'tractor') return null;
    const hitched = attachedTrailer(ctx, m);
    if (hitched) return el('div', {}, el('span', { class: 'lt-note' }, machineName(data, hitched)),
      el('button', { class: 'btn btn-small', onClick: () => resultMessage(
        game.actions.detachTrailer ? game.actions.detachTrailer(m.id) : detachTrailer(ctx, m.id), 'Trailer parked where you left it') }, 'Unhitch'));
    const free = ms.filter(t => t.type === 'trailer' && !t.attachedTo && !t.onHire);
    if (!free.length) return el('span', { class: 'lt-note' }, 'Buy a separate trailer');
    const options = free.map(t => {
      const result = trailerCompatibility(ctx, m, t);
      return el('option', { value: t.id, disabled: !result.ok }, `${machineName(data, t)}${result.ok ? ` · up to ${result.payload.toFixed(1)} t` : ' · too heavy'}`);
    });
    const choose = el('select', { class: 'lt-select', 'aria-label': `Trailer for ${machineName(data,m)}`, title: 'Park the tractor within 10 m of the trailer before hitching' }, options);
    return el('div', {}, choose, el('button', { class: 'btn btn-small', onClick: () => resultMessage(
      game.actions.attachTrailer ? game.actions.attachTrailer(m.id, choose.value) : attachTrailer(ctx, m.id, choose.value), 'Trailer hitched') }, 'Hitch trailer'));
  }
  function rentalControls(m) {
    if (!m.rental) return null;
    return el('div', {}, el('span', { class: 'lt-note' }, `Hired · due day ${Math.floor(m.rental.due) + 1}`),
      el('button', { class: 'btn btn-small', onClick: () => resultMessage(game.actions.returnRental(m.id), 'Hire returned and deposit refunded') }, 'Return hire'));
  }

  // Hire: a contractor's enquiry (send a machine or turn it down), and machines away on hire.
  const hireBox = el('div', { class: 'lt-hire' });
  let hireKey = '';
  function renderHire() {
    const e = hireState(ctx).enquiry;
    const away = machinesOnHire(ctx);
    const cands = hireCandidates(ctx);
    const k = JSON.stringify([e?.id, cands.map((m) => m.id), away.map((m) => [m.id, m.onHire.until])]);
    if (k === hireKey) return;
    hireKey = k;
    hireBox.replaceChildren();
    hireBox.style.display = e || away.length ? '' : 'none';
    if (e) {
      const typeName = data.machines.types[e.type].name.toLowerCase();
      const send = cands.map((m) => el('button', { class: 'btn btn-primary lt-buy', onClick: () => {
        const r = game.actions.acceptHire(m.id);
        feedback.message(r.ok ? `${machineName(data, m)} is off to ${e.client}` : r.reason, r.ok ? 'good' : 'warn');
        if (r.ok) openApp('fleet'); // (rebuilt without it in the yard list)
        else refresh();
      } }, `Send ${machineName(data, m)}`));
      const no = el('button', { class: 'btn lt-buy', onClick: () => { game.actions.declineHire(); refresh(); } }, 'Turn it down');
      hireBox.append(el('div', { class: 'lt-job regular lt-hire-ask' },
        el('div', { class: 'lt-job-head' }, el('b', {}, `${e.client} wants to hire ${withArticle(typeName)}`), el('span', { class: 'lt-job-bonus' }, `+${money(e.total)}`)),
        el('div', { class: 'lt-job-foot' }, el('span', {}, `${e.days} days at ${money(e.rate)} a day, paid when it comes back · about ${data.hire.wearPerDay * e.days}% wear`),
          el('span', {}, `Answer by day ${e.expires}`)),
        el('div', { class: 'lt-regular-actions' }, send.length ? send : el('span', { class: 'lt-muted-row' }, `No ${typeName} free to send (busy, broken, loaded, or your last road vehicle)`), no)));
    }
    for (const m of away) {
      hireBox.append(el('div', { class: 'lt-row' },
        el('div', { class: 'lt-row-main' }, el('b', {}, machineName(data, m)),
          el('span', {}, `On hire to ${m.onHire.client} · back on day ${m.onHire.until + 1} · ${money(m.onHire.rate * m.onHire.days)} when it returns`)),
        el('span', { class: 'lt-fl-status busy' }, 'On hire')));
    }
  }

  // Insurance: the cover in force, and a change waiting for the renewal.
  const coverBox = el('div', { class: 'lt-card lt-cover' });
  function renderCover() {
    const s = insuranceState(ctx);
    const covers = data.economy.insurance.covers;
    coverBox.replaceChildren(
      el('div', { class: 'lt-cover-head' }, el('div', { class: 'lt-card-label' }, 'Insurance cover'),
        el('span', { class: 'lt-cover-note' }, s.next ? `${covers[s.next].name} from day ${nextRenewal(ctx)} (when the policy renews)` : `Renews day ${nextRenewal(ctx)}`)),
      el('div', { class: 'lt-cover-opts' }, Object.keys(covers).map((id) => {
        const c = insuranceCover(ctx, id);
        const on = s.cover === id;
        return el('button', { class: `lt-cover-opt${on ? ' active' : ''}${s.next === id ? ' next' : ''}`, onClick: () => {
          const r = game.actions.setInsuranceCover(id);
          if (r.ok && r.from) feedback.message(`${c.name} cover from day ${r.from}, when the policy renews`, 'good');
          renderCover();
          refresh();
        } },
        el('b', {}, c.name, on ? el('span', { class: 'lt-cover-tag' }, 'Now') : s.next === id ? el('span', { class: 'lt-cover-tag next' }, 'Next') : null),
        el('span', { class: 'lt-cover-price' }, `${money(weeklyInsurance(ctx, id))} a week`),
        el('span', { class: 'lt-cover-text' }, c.text));
      })));
  }
  renderCover();

  function refresh() {
    renderHire();
    let total = 0;
    let attention = 0;
    for (const c of cells) {
      const v = c.m.rental ? c.m.rental.deposit : resaleValue(ctx, c.m);
      if (!c.m.rental) total += v;
      setText(c.value, money(v));
      c.cond.style.width = `${Math.round(c.m.condition)}%`;
      setText(c.condT, `${Math.round(c.m.condition)}%`);
      const op = workerFor(ctx, c.m);
      const s = c.m.attachedTo ? `Hitched to ${machineName(data, game.state.machines.find(m => m.id === c.m.attachedTo))}` : c.m.type === 'tractor' && c.m.trailerId ? 'Trailer hitched' : c.m.type === 'trailer' ? 'Parked trailer' : c.m.broken ? 'Broken down' : c.m.away ? `${op?.name.split(' ')[0] ?? 'Driver'} on the road` : op?.role ? `${op.name.split(' ')[0]} on it` : c.m.job ? 'Working' : c.m.condition < 40 ? 'Needs a service' : 'Ready';
      setText(c.status, s);
      c.status.className = `lt-fl-status ${c.m.broken ? 'bad' : c.m.condition < 40 ? 'warn' : c.m.job || op?.role ? 'busy' : 'ok'}`;
      if (c.m.broken || c.m.condition < 40) attention += 1;
      const q = game.actions.mechanicQuote(c.m.id);
      c.call.hidden = !!q.reason;
      if (!q.reason) {
        setText(c.call, `${q.kind === 'repair' ? 'Repair' : 'Service'} here · ${money(q.total)}`);
        c.call.disabled = game.state.money < q.total;
        c.call.title = `Includes a ${money(q.fee)} call-out fee`;
      }
    }
    setText(totalV, money(total));
    setText(attnV, String(attention));
    setText(attnN, attention ? 'Press R beside them, or call a mechanic out from here' : 'Nothing needs looking at');
  }
  refresh();

  const node = el('div', { class: 'lt-home' },
    el('div', { class: 'lt-stats' },
      el('div', { class: 'lt-stat' }, el('div', { class: 'lt-stat-label' }, 'Machines'), el('div', { class: 'lt-stat-value' }, String(ms.filter(m=>!m.rental).length)),
        el('div', { class: 'lt-stat-note' }, ms.some((m) => m.rental) ? `Plus ${ms.filter((m) => m.rental).length} on rental` : 'All your own')),
      el('div', { class: 'lt-stat' }, el('div', { class: 'lt-stat-label' }, 'Fleet value'), totalV, el('div', { class: 'lt-stat-note' }, `Insurance ${money(weeklyInsurance(ctx))} a week`)),
      el('div', { class: 'lt-stat' }, el('div', { class: 'lt-stat-label' }, 'Need attention'), attnV, attnN)),
    el('div', { class: 'lt-rows' }, rows),
    hireBox,
    coverBox,
    el('button', { class: 'lt-link', onClick: () => openApp('dealer') }, 'Buy, upgrade or sell machines at the plant dealer →'));

  return {
    node,
    headSet: true,
    refresh,
    update() {
      const job = pending.shift();
      if (!job) return;
      const [img, box, m] = job;
      const url = photos?.photo(m.type, m.tier);
      if (url) {
        img.src = url;
        box.classList.add('has-photo');
      }
    },
  };
}
