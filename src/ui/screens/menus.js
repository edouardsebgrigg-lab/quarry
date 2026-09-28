// Pause menu and the save/load slot picker.
import { el } from '../dom.js';
import { money } from '../format.js';

export function openPauseMenu(overlays, { onSave, onLoad, onSettings, onQuitToMenu }) {
  overlays.open({
    id: 'pause',
    title: 'Paused',
    className: 'overlay-pause',
    build: ({ close }) => {
      const item = (label, onClick, primary = false) => el('button', { class: `menu-item${primary ? ' primary' : ''}`, onClick }, label);
      return el('div', { class: 'pause-menu' },
        el('div', { class: 'pause-title' }, 'PAUSE', el('span', {}, 'D')),
        item('Resume', close, true),
        item('Save Game', onSave),
        item('Load Game', onLoad),
        item('Settings', onSettings),
        item('Quit to Main Menu', onQuitToMenu));
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
