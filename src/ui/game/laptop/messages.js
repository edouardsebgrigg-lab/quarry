// Messages: Ray's texts and the office's summary of each day, newest first.
import { el } from '../../dom.js';
import { money, tonnes } from '../../format.js';
import { logbook, markMessagesRead } from '../../../game/logbook.js';
import { getMachine, machineName } from '../../../machinery/index.js';

const when = (m) => `Day ${m.day}, ${String(m.hour).padStart(2, '0')}:${String(m.minute ?? 0).padStart(2, '0')}`;

export function messagesApp({ game, setHead }) {
  setHead('Messages', 'Texts from Ray, a summary of each day and a report every week');
  const list = el('div', { class: 'lt-msgs' });
  let shown = -1;

  const cell = (label, value, cls) => el('div', {}, el('span', {}, label), el('b', { class: cls }, value));

  // The office's numbers for a day or a week.
  function reportCard(m, title, sub) {
    const r = m.report;
    const week = m.kind === 'week';
    const top = r.topMachine && getMachine(game.ctx, r.topMachine.id);
    return el('div', { class: `lt-msg report${week ? ' week' : ''}` },
      el('div', { class: 'lt-msg-head' }, el('b', {}, title), sub ? el('span', { class: 'lt-msg-sub' }, sub) : null, el('span', {}, when(m))),
      el('div', { class: 'lt-report' },
        cell('Takings', money(r.income)),
        cell('Costs', money(r.spending)),
        cell('Profit', money(r.profit), r.profit >= 0 ? 'pos' : 'neg'),
        cell('Loads sold', `${r.loads} (${tonnes(r.tonnesSold)})`),
        cell('Dug', tonnes(r.tonnesDug)),
        r.invested ? cell(r.invested > 0 ? 'Invested' : 'Sold kit', money(Math.abs(r.invested))) : null,
        week && r.jobsDone ? cell('Jobs done', r.jobsDone) : null),
      week ? el('div', { class: 'lt-week-lines' },
        el('div', {}, 'Bank balance ', el('b', {}, money(r.moneyFrom)), ' → ', el('b', { class: r.moneyTo >= r.moneyFrom ? 'pos' : 'neg' }, money(r.moneyTo))),
        r.bestDay ? el('div', {}, 'Best day: ', el('b', {}, `day ${r.bestDay.day}`), `, ${money(r.bestDay.profit)} profit`) : null,
        r.topMachine ? el('div', {}, 'Top earner: ', el('b', {}, top ? machineName(game.data, top) : 'a machine since sold'), `, ${money(r.topMachine.earned)} of sales`) : null) : null,
      r.movers?.length ? el('div', { class: 'lt-movers' }, 'Prices: ', r.movers.map((mv) => el('span', { class: mv.change > 0 ? 'up' : 'down' },
        `${game.data.materials[mv.id]?.name ?? mv.id} ${mv.change > 0 ? '▲' : '▼'} ${Math.abs(Math.round(mv.change * 100))}%`))) : null);
  }

  function refresh() {
    const msgs = logbook(game.ctx).messages;
    markMessagesRead(game.ctx);
    if (msgs.length === shown) return;
    shown = msgs.length;
    list.replaceChildren();
    if (!msgs.length) list.append(el('div', { class: 'lt-empty' }, 'No messages yet.'));
    for (const m of [...msgs].reverse()) {
      if (m.kind === 'report') list.append(reportCard(m, `Day ${m.report.day} summary`));
      else if (m.kind === 'week') list.append(reportCard(m, `Week ${m.report.week} report`, `Days ${m.report.fromDay}–${m.report.toDay}`));
      else {
        list.append(el('div', { class: `lt-msg ${m.kind ?? ''}` },
          el('div', { class: 'lt-avatar' }, (m.from ?? '?')[0]),
          el('div', { class: 'lt-bubble' },
            el('div', { class: 'lt-msg-head' }, el('b', {}, m.from), el('span', {}, when(m))),
            el('div', { class: 'lt-msg-text' }, m.text))));
      }
    }
  }
  refresh();
  return { node: list, refresh, headSet: true };
}
