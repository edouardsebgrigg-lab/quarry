// Pause menu and the save/load slot picker.
import { el } from '../dom.js';
import { money } from '../format.js';

export function openPauseMenu(overlays, { onSave, onLoad, onSettings, onQuitToMenu }) {
  overlays.open({
    id: 'pause',
    title: 'Paused',
    className: 'overlay-small',
    build: ({ close }) => el('div', { class: 'menu-buttons' },
      el('button', { class: 'btn btn-menu btn-primary', onClick: close }, 'Resume'),
      el('button', { class: 'btn btn-menu', onClick: onSave }, 'Save Game'),
      el('button', { class: 'btn btn-menu', onClick: onLoad }, 'Load Game'),
      el('button', { class: 'btn btn-menu', onClick: onSettings }, 'Settings'),
      el('button', { class: 'btn btn-menu', onClick: onQuitToMenu }, 'Quit to Main Menu'),
    ),
  });
}

const SLOT_NAMES = { autosave: 'Autosave', slot1: 'Slot 1', slot2: 'Slot 2', slot3: 'Slot 3' };

function slotDescription(slot) {
  if (slot.empty) return 'Empty';
  const when = new Date(slot.savedAt).toLocaleString();
  const s = slot.summary ?? {};
  return `Day ${s.day ?? '?'} · ${money(s.money ?? 0)} · ${when}`;
}

// mode: 'save' or 'load'
export function openSlotPicker(overlays, { mode, saves, onPick }) {
  overlays.open({
    id: 'slots',
    title: mode === 'save' ? 'Save Game' : 'Load Game',
    build: ({ close }) => {
      const slots = saves.list().filter((s) => mode === 'load' || s.slotId !== 'autosave');
      return el('div', {},
        el('div', { class: 'menu-buttons' },
          slots.map((slot) => el('button', {
            class: 'btn btn-slot',
            disabled: mode === 'load' && slot.empty,
            onClick: () => { close(); onPick(slot.slotId); },
          },
          el('span', { class: 'slot-name' }, SLOT_NAMES[slot.slotId]),
          el('span', { class: 'slot-desc' }, slotDescription(slot)))),
          el('button', { class: 'btn btn-menu', onClick: close }, 'Back'),
        ),
      );
    },
  });
}
