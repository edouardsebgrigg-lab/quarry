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

export function openPauseMenu(overlays, { game = null, onSave, onLoad, onSettings, onQuitToMenu }) {
  overlays.open({
    id: 'pause',
    title: 'Paused',
    className: 'overlay-pause',
    build: ({ close }) => {
      const item = (label, onClick, primary = false) => el('button', { class: `menu-item${primary ? ' primary' : ''}`, onClick }, label);
      const menu = el('div', { class: 'pause-menu' },
        el('div', { class: 'pause-title' }, 'PAUSE', el('span', {}, 'D')),
        item('Resume', close, true),
        item('Save Game', onSave),
        item('Load Game', onLoad),
        item('Settings', onSettings),
        item('Quit to Main Menu', onQuitToMenu));
      return game ? el('div', { class: 'pause-layout' }, menu, pauseSummary(game)) : menu;
    },
  });
}

const SLOT_NAMES = { autosave: 'Autosave', slot1: 'Slot 1', slot2: 'Slot 2', slot3: 'Slot 3' };

function slotDescription(slot) {
  if (slot.empty) return 'Empty';
  const when = new Date(slot.savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const s = slot.summary ?? {};
  return `Day ${s.day ?? '?'}  ·  ${money(s.money ?? 0)}  ·  ${when}`;
}

// mode: 'save' or 'load'
export function openSlotPicker(overlays, { mode, saves, onPick }) {
  overlays.open({
    id: 'slots',
    title: mode === 'save' ? 'Save game' : 'Load game',
    className: 'overlay-small',
    build: ({ close }) => {
      const slots = saves.list().filter((s) => mode === 'load' || s.slotId !== 'autosave');
      return el('div', { class: 'slot-list' },
        slots.map((slot) => el('button', {
          class: 'btn btn-slot',
          disabled: mode === 'load' && slot.empty,
          onClick: () => { close(); onPick(slot.slotId); },
        },
        el('span', { class: 'slot-name' }, SLOT_NAMES[slot.slotId]),
        el('span', { class: 'slot-desc' }, slotDescription(slot)))));
    },
  });
}
