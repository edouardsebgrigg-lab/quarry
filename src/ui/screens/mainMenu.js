import { el } from '../dom.js';

export function buildMainMenu({ hasSave, onContinue, onNewGame, onLoad, onSettings, onQuit }) {
  return el('div', { class: 'main-menu' },
    el('div', { class: 'main-menu-bg' }),
    el('div', { class: 'main-menu-inner' },
      el('h1', { class: 'game-title' }, 'QUARRY'),
      el('div', { class: 'game-subtitle' }, 'From a rusty digger to a mining empire'),
      el('div', { class: 'menu-buttons' },
        el('button', { class: 'btn btn-menu btn-primary', disabled: !hasSave, onClick: onContinue }, 'Continue'),
        el('button', { class: 'btn btn-menu', onClick: onNewGame }, 'New Game'),
        el('button', { class: 'btn btn-menu', disabled: !hasSave, onClick: onLoad }, 'Load Game'),
        el('button', { class: 'btn btn-menu', onClick: onSettings }, 'Settings'),
        el('button', { class: 'btn btn-menu', onClick: onQuit }, 'Quit'),
      ),
      el('div', { class: 'menu-hint' }, '↑ ↓ to choose · Enter to select'),
    ),
  );
}

export function buildQuitScreen() {
  return el('div', { class: 'main-menu' },
    el('div', { class: 'main-menu-bg' }),
    el('div', { class: 'main-menu-inner' },
      el('h1', { class: 'game-title' }, 'QUARRY'),
      el('p', { class: 'overlay-text' }, 'Thanks for playing. You can close this window now.'),
    ),
  );
}
