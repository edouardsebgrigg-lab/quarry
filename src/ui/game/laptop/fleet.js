// Your fleet: every machine with its condition, what it's done and what it's worth.
import { el, setText } from '../../dom.js';
import { money } from '../../format.js';
import { machinesAt, machineName, resaleValue } from '../../../machinery/index.js';
import { machineLog } from '../../../game/logbook.js';

export function fleetApp({ game, feedback, photos, openApp, setHead }) {
  const { data } = game;
  const ctx = game.ctx;
  setHead('Your fleet', 'Every machine in the yard, how it’s holding up and what it’s done');
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
        el('b', {}, machineName(data, m)),
        el('span', {}, `${work}${log.breakdowns ? ` · broke down ${log.breakdowns}×` : ''}`)),
      el('div', { class: 'lt-fl-col' }, status),
      el('div', { class: 'lt-fl-col' }, el('div', { class: 'lt-cond' }, cond), condT),
      el('div', { class: 'lt-fl-col lt-fl-val' }, el('span', {}, 'Worth'), value),
      call);
  });

  function refresh() {
    let total = 0;
    let attention = 0;
    for (const c of cells) {
      const v = resaleValue(ctx, c.m);
      total += v;
      setText(c.value, money(v));
      c.cond.style.width = `${Math.round(c.m.condition)}%`;
      setText(c.condT, `${Math.round(c.m.condition)}%`);
      const s = c.m.broken ? 'Broken down' : c.m.job ? 'Working' : c.m.condition < 40 ? 'Needs a service' : 'Ready';
      setText(c.status, s);
      c.status.className = `lt-fl-status ${c.m.broken ? 'bad' : c.m.condition < 40 ? 'warn' : c.m.job ? 'busy' : 'ok'}`;
      if (c.m.broken || c.m.condition < 40) attention += 1;
      const q = game.actions.mechanicQuote(c.m.id);
      c.call.style.visibility = q.reason ? 'hidden' : '';
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
      el('div', { class: 'lt-stat' }, el('div', { class: 'lt-stat-label' }, 'Machines'), el('div', { class: 'lt-stat-value' }, String(ms.length)),
        el('div', { class: 'lt-stat-note' }, `${Object.keys(data.machines.types).filter((k) => ms.some((m) => m.type === k)).length} kinds`)),
      el('div', { class: 'lt-stat' }, el('div', { class: 'lt-stat-label' }, 'Fleet value'), totalV, el('div', { class: 'lt-stat-note' }, 'What the dealer would pay today')),
      el('div', { class: 'lt-stat' }, el('div', { class: 'lt-stat-label' }, 'Need attention'), attnV, attnN)),
    el('div', { class: 'lt-rows' }, rows),
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
