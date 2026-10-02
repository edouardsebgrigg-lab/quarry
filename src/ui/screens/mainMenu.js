import { el, kbd } from '../dom.js';

function background() {
  const bg = el('div', { class: 'main-menu-bg' });
  bg.style.backgroundImage = "url('ui/menu.jpg')"; // assets/ui/menu.jpg, rendered by the game (docs/handover/browser-checks/menu-backdrop.mjs)
  return [bg, el('div', { class: 'main-menu-shade' })];
}

function title() {
  return el('h1', { class: 'game-title' }, 'QUARR', el('span', {}, 'Y'));
}

export function buildMainMenu({ hasSave, onContinue, onNewGame, onLoad, onSettings, onQuit }) {
  const item = (label, onClick, { disabled = false, primary = false } = {}) => el('button', {
    class: `menu-item${primary ? ' primary' : ''}`, disabled, onClick,
  }, label);
  return el('div', { class: 'main-menu' },
    background(),
    el('div', { class: 'main-menu-inner' },
      title(),
      el('p', { class: 'game-subtitle' }, 'From a rusty digger to a mining empire.'),
      el('nav', { class: 'menu-list' },
        hasSave ? item('Continue', onContinue, { primary: true }) : null,
        item('New Game', onNewGame, { primary: !hasSave }),
        item('Load Game', onLoad, { disabled: !hasSave }),
        item('Settings', onSettings),
        item('Quit', onQuit)),
    ),
    el('div', { class: 'menu-footer' },
      el('span', {}, kbd('↑'), kbd('↓'), 'Choose', kbd('Enter'), 'Select'),
      el('span', {}, 'v0.1')),
  );
}

export function buildQuitScreen() {
  return el('div', { class: 'main-menu' },
    background(),
    el('div', { class: 'main-menu-inner' },
      title(),
      el('p', { class: 'game-subtitle' }, 'Thanks for playing. You can close this window now.'),
    ),
  );
}
