// Pause menu and the save/load slot picker.
import { el } from '../dom.js';
import { money, clockTime } from '../format.js';
import { getDate } from '../../core/index.js';
import { currentObjective } from '../../progression/index.js';
import { currentWeather } from '../../weather/index.js';

// Where things stand, beside the pause menu: the company, the day, the bank and the goal.
function pauseSummary(game) {
  const o = currentObjective(game.ctx);
  const d = getDate(game.state, game.data);
  const row = (label, value, cls) => el('div', { class: 'ps-row' }, el('span', {}, label), el('b', { class: cls }, value));
  return el('div', { class: 'pause-summary' },
    el('div', { class: 'ps-company' }, game.actions.companyName()),
    el('div', { class: 'ps-when' }, `${clockTime(d)} · ${currentWeather(game.ctx).name}`),
    row('Balance', money(game.state.money), game.state.money < 0 ? 'neg' : ''),
    row('Machines', String(game.state.machines.length)),
    row('Earned so far', money(game.state.stats.totalEarned ?? 0)),
    o ? el('div', { class: 'ps-goal' }, el('span', {}, `Goal ${o.number} of ${o.total}`), el('b', {}, o.title)) : null);
}

export function openPauseMenu(overlays, { game = null, onSave, onLoad, onSettings, onGuide, onSaveAndQuit, onQuitToMenu }) {
  overlays.open({
    id: 'pause',
    title: 'Paused',
    className: 'overlay-pause',
    build: ({ close }) => {
      const item = (label, onClick, primary = false) => el('button', { class: `menu-item${primary ? ' primary' : ''}`, onClick }, label);
      const menu = el('div', { class: 'pause-menu' },
        el('div', { class: 'pause-title' }, 'PAUSE', el('span', {}, 'D')),
        item('Resume', close, true),
        item('Field guide', () => { close(); onGuide(); }),
        item('Save Game', onSave),
        item('Load Game', onLoad),
        item('Settings', onSettings),
        item('Save and quit', onSaveAndQuit),
        item('Quit without saving', onQuitToMenu));
      return game ? el('div', { class: 'pause-layout' }, menu, pauseSummary(game)) : menu;
    },
  });
}
