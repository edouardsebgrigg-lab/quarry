// The story card at the start of a new game.
import { el } from '../dom.js';

export function openIntro(overlays, { game, onDone }) {
  const { intro, steps } = game.data.objectives;
  const name = el('input', { class: 'text-input', type: 'text', maxlength: 32, placeholder: game.actions.companyName(), 'aria-label': 'Company name' });
  // (typing here mustn't trigger the game's hotkeys)
  name.addEventListener('keydown', (e) => e.stopPropagation());
  const guide = el('input', { type: 'checkbox', checked: game.state.objectives.guideEnabled !== false });
  overlays.open({
    id: 'intro',
    title: intro.title,
    className: 'overlay-intro',
    onClose: () => {
      game.actions.setCompanyName(name.value);
      game.actions.setGuideEnabled(guide.checked);
      onDone?.();
    },
    build: ({ close }) => el('div', { class: 'intro-text' },
      intro.text.map((t) => el('p', {}, t)),
      el('label', { class: 'intro-name' }, el('span', {}, 'Your company’s name'), name),
      el('div', { class: 'intro-goal' }, el('b', {}, 'First goal'), el('span', {}, steps[0].text)),
      el('label', { class: 'fg-toggle' }, guide, 'Show step-by-step guidance'),
      el('p', { class: 'lt-note' }, 'Work in your own order. The Field guide in the laptop keeps your progress and practical help, and lets you change this choice later.'),
      el('div', { class: 'menu-buttons row' },
        el('button', { class: 'btn btn-primary', onClick: close, autofocus: true }, "Let's get to work"))),
  });
}
