// Dev/cheat panel (F1, dev builds only) for fast balance testing.
import { el } from '../dom.js';

export function createDevPanel({ game, runtime, feedback }) {
  const btn = (label, fn) => el('button', {
    class: 'btn btn-small',
    onClick: () => { fn(); feedback.message(`[dev] ${label}`); },
  }, label);

  const fastBtn = el('button', { class: 'btn btn-small', onClick: () => runtime.toggleDevFast() }, `Speed ×${game.data.game.devSpeed}`);

  const node = el('div', { class: 'dev-panel' },
    el('div', { class: 'dev-title' }, 'DEV PANEL (F1)'),
    el('div', { class: 'dev-grid' },
      btn('+$100', () => game.dev.addMoney(100)),
      btn('+$1,000', () => game.dev.addMoney(1000)),
      btn('+$10,000', () => game.dev.addMoney(10000)),
      btn('Skip 1 hour', () => game.dev.skipHours(1)),
      btn('Skip 1 day', () => game.dev.skipDays(1)),
      btn('Fix all machines', () => game.dev.fixAllMachines()),
      btn('Unlock all', () => game.dev.unlockAll()),
      fastBtn,
    ),
    el('div', { class: 'muted small' }, `Seed ${game.state.seed}`),
  );
  node.style.display = 'none';

  return {
    node,
    toggle() {
      node.style.display = node.style.display === 'none' ? '' : 'none';
    },
    update() {
      fastBtn.classList.toggle('active', runtime.isDevFast());
    },
  };
}
