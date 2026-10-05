import { el, setText } from '../../dom.js';
import { money, tonnes } from '../../format.js';
import { currentObjective, journeyJournal } from '../../../progression/index.js';
import { ACTION_LABELS, DEFAULT_BINDINGS, keyLabel } from '../../../input/index.js';
import { handbookText, searchHandbook } from './handbookText.js';

export function guideApp({ game, settings, openApp, setHead }) {
  const { chapters, articles } = game.data.handbook;
  const node = el('div', { class: 'field-guide' });
  const body = el('div', { class: 'fg-body' });
  let tab = 'journey', journalKey = '', selected = null;
  const bindings = () => settings?.bindings ?? DEFAULT_BINDINGS;
  const text = s => handbookText(s, bindings());
  const button = (label, fn, cls = '') => el('button', { class: `btn ${cls}`, onClick: fn }, label);
  const tabs = el('nav', { class: 'fg-tabs', 'aria-label': 'Field guide sections' });
  const tabButtons = new Map();
  for (const [id, label] of [['journey', 'Your journey'], ['handbook', 'Handbook'], ['controls', 'Controls']]) {
    const b = button(label, () => show(id));
    tabButtons.set(id, b); tabs.append(b);
  }
  node.append(tabs, body);
  setHead('Field guide', 'A company of your own, from the first shovelful onwards.');

  function read(id) { selected = id; show('handbook'); }
  function journal() {
    const o = game.state.objectives, entries = journeyJournal(game.ctx);
    const current = currentObjective(game.ctx), done = entries.filter(s => s.status === 'completed').length;
    const guide = el('input', { type: 'checkbox', checked: o.guideEnabled !== false,
      onChange: e => { game.actions.setGuideEnabled(e.target.checked); refresh(); } });
    const summary = el('section', { class: 'lt-card fg-overview' },
      el('div', { class: 'lt-card-label' }, `${done} of ${entries.length} goals complete`),
      el('h3', {}, current ? current.title : 'Your company is established'),
      el('p', {}, current ? current.text : 'You have worked from a shovel to an established quarry. Keep building, choose a personal target or explore a different way to work.'),
      el('progress', { max: entries.length, value: done, 'aria-label': 'Journey progress' }),
      el('label', { class: 'fg-toggle' }, guide, 'Show step-by-step guidance'),
      el('p', { class: 'lt-note' }, 'The guide controls goal markers and Ray’s goal reminders. Your progress, rewards and freedom to work stay the same.'));
    const relevant = articles.find(a => a.goals?.includes(current?.id));
    if (relevant) summary.append(button(`Help: ${relevant.title}`, () => read(relevant.id)));
    if (!current) {
      const c = o.completion;
      if (c && !c.legacy) summary.append(el('p', { class: 'fg-record' },
        `Established on day ${c.day} · ${money(c.earned ?? 0)} earned · ${tonnes(c.tonnesSold ?? 0)} sold · ${c.machines} machines`));
      summary.append(button('Choose a personal target', () => openApp('milestones')));
    }
    const groups = chapters.map(chapter => {
      const steps = chapter.goals.map(id => entries.find(s => s.id === id));
      return el('section', { class: 'fg-chapter' }, el('h3', {}, chapter.name),
        steps.map(step => {
          const a = articles.find(a => a.goals?.includes(step.id));
          const status = step.status === 'completed' ? 'Complete' : step.status === 'current' ? 'Current goal' : 'Ahead';
          const record = step.record;
          return el('details', { class: `fg-step ${step.status}`, open: step.status === 'current', dataset: { goalId: step.id } },
            el('summary', {}, el('span', { class: 'fg-number' }, step.status === 'completed' ? '✓' : step.number),
              el('b', {}, step.title), el('span', { class: 'fg-status' }, status)),
            el('div', { class: 'fg-step-body' }, el('p', {}, step.text),
              el('p', { class: 'lt-note' }, record?.legacy ? 'Completed in an earlier save.' : record
                ? `Completed on day ${record.day}${record.reward ? ` · ${money(record.reward)} reward paid` : ''}`
                : step.reward ? `Reward: ${money(step.reward)}` : 'Learn by doing; work at your own pace.'),
              a ? button(`Read: ${a.title}`, () => read(a.id)) : null));
        }));
    });
    body.replaceChildren(summary, ...groups);
  }

  function handbook() {
    const query = el('input', { type: 'search', class: 'text-input', placeholder: 'Search digging, trailers, saving…', 'aria-label': 'Search handbook' });
    const results = el('div', { class: 'fg-results' });
    const reader = el('article', { class: 'lt-card fg-reader', tabindex: '-1' });
    const count = el('span', { class: 'lt-note', 'aria-live': 'polite' });
    const links = new Map();
    function article(id, focus = false) {
      const a = articles.find(a => a.id === id) ?? articles[0]; selected = a.id;
      for (const [key, b] of links) b.setAttribute('aria-current', key === selected ? 'page' : 'false');
      reader.replaceChildren(el('div', { class: 'lt-card-label' }, a.category), el('h3', {}, a.title), el('p', {}, a.summary),
        el('ol', {}, a.steps.map(s => el('li', {}, text(s)))),
        el('div', { class: 'fg-trouble' }, el('b', {}, 'When something gets stuck'), el('p', {}, text(a.trouble))),
        a.app ? button(a.appLabel, () => openApp(a.app), 'btn-primary') : null,
        el('div', { class: 'fg-related' }, el('span', { class: 'lt-note' }, 'Related reading'),
          a.related.map(id => button(articles.find(x => x.id === id).title, () => article(id, true)))));
      if (focus) { reader.focus({ preventScroll: true }); reader.scrollIntoView({ block: 'start' }); }
    }
    function search() {
      const matches = searchHandbook(articles, query.value); links.clear();
      results.replaceChildren(...matches.map(a => {
        const b = el('button', { class: 'fg-result', onClick: () => article(a.id, true), 'aria-current': a.id === selected ? 'page' : 'false' },
          el('span', { class: 'lt-card-label' }, a.category), el('b', {}, a.title));
        links.set(a.id, b); return b;
      }));
      setText(count, `${matches.length} ${matches.length === 1 ? 'article' : 'articles'}`);
      if (!matches.length) results.append(el('p', { class: 'lt-note' }, 'No articles match. Try “load”, “dig” or “save”.'));
      if (query.value.trim() && matches.length && !matches.some(a => a.id === selected)) article(matches[0].id);
    }
    query.addEventListener('input', search);
    body.replaceChildren(el('div', { class: 'fg-search' }, query, count), el('div', { class: 'fg-library' }, results, reader));
    article(selected); search();
  }

  function controls() {
    body.replaceChildren(el('div', { class: 'lt-card' }, el('h3', {}, 'Your controls'),
      el('p', { class: 'lt-note' }, 'These are your current bindings. Change them in Esc → Settings → Key bindings. Esc closes menus or opens Pause; left mouse digs and transfers material, right mouse cancels the current action.'),
      el('dl', { class: 'fg-controls' }, Object.entries(ACTION_LABELS).filter(([id]) => id !== 'dev').map(([id, label]) => [
        el('dt', {}, label), el('dd', {}, el('kbd', {}, keyLabel(bindings()[id])))]))));
  }
  function show(id) {
    tab = id; journalKey = '';
    for (const [key, b] of tabButtons) { b.classList.toggle('btn-primary', key === id); b.setAttribute('aria-pressed', String(key === id)); }
    if (tab === 'handbook') handbook();
    else if (tab === 'controls') controls();
    else refresh();
    node.closest('.lt-app-body')?.scrollTo(0, 0);
  }
  function refresh() {
    if (tab !== 'journey') return;
    const o = game.state.objectives;
    const key = JSON.stringify([o.index, o.guideEnabled, o.history, o.completion]);
    if (key !== journalKey) { journalKey = key; journal(); }
  }
  show(tab);
  return { node, refresh, headSet: true };
}
