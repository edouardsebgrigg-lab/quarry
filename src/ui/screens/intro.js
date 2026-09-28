// The story card at the start of a new game.
import { el } from '../dom.js';

export function openIntro(overlays, { game, onDone }) {
  const { intro, steps } = game.data.objectives;
  overlays.open({
    id: 'intro',
    title: intro.title,
    className: 'overlay-intro',
    onClose: onDone,
    build: ({ close }) => el('div', { class: 'intro-text' },
      intro.text.map((t) => el('p', {}, t)),
      el('div', { class: 'intro-goal' }, el('b', {}, 'First goal'), el('span', {}, steps[0].text)),
      el('div', { class: 'menu-buttons row' },
        el('button', { class: 'btn btn-primary', onClick: close, autofocus: true }, "Let's get to work"))),
  });
}
