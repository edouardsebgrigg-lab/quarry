// Messages: Ray's texts and the office's summary of each day, newest first.
import { el } from '../../dom.js';
import { money, tonnes } from '../../format.js';
import { logbook } from '../../../game/logbook.js';

const when = (m) => `Day ${m.day}, ${String(m.hour).padStart(2, '0')}:${String(m.minute ?? 0).padStart(2, '0')}`;

export function messagesApp({ game, setHead }) {
  setHead('Messages', 'Texts from Ray and a summary of each day');
  const list = el('div', { class: 'lt-msgs' });
  let shown = -1;

  function refresh() {
    const msgs = logbook(game.ctx).messages;
    if (msgs.length === shown) return;
    shown = msgs.length;
    list.replaceChildren();
    if (!msgs.length) list.append(el('div', { class: 'lt-empty' }, 'No messages yet.'));
    for (const m of [...msgs].reverse()) {
      if (m.kind === 'report') {
        const r = m.report;
        list.append(el('div', { class: 'lt-msg report' },
          el('div', { class: 'lt-msg-head' }, el('b', {}, `Day ${r.day} summary`), el('span', {}, when(m))),
          el('div', { class: 'lt-report' },
            el('div', {}, el('span', {}, 'Takings'), el('b', {}, money(r.income))),
            el('div', {}, el('span', {}, 'Costs'), el('b', {}, money(r.spending))),
            el('div', {}, el('span', {}, 'Profit'), el('b', { class: r.profit >= 0 ? 'pos' : 'neg' }, money(r.profit))),
            el('div', {}, el('span', {}, 'Loads sold'), el('b', {}, `${r.loads} (${tonnes(r.tonnesSold)})`)),
            el('div', {}, el('span', {}, 'Dug'), el('b', {}, tonnes(r.tonnesDug))))));
      } else {
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
