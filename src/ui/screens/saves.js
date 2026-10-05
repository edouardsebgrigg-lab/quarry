// Portable files and local recovery copies share the same validation as Continue.
import { el } from '../dom.js';
import { money } from '../format.js';
import { confirmBox } from '../overlays.js';

const SLOT_NAMES = { autosave: 'Autosave', slot1: 'Slot 1', slot2: 'Slot 2', slot3: 'Slot 3' };
const when = savedAt => new Date(savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
function description(record) {
  const s = record.summary ?? {};
  return `${s.company || 'Quarry company'} · Day ${s.day ?? '?'} · ${money(s.money ?? 0)} · ${when(record.savedAt)}`;
}

export function downloadSave(text, name = 'quarry-company') {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = el('a', { href: url, download: `${name}.quarry.json` });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function openSlotPicker(overlays, { mode, saves, onPick, onChanged, exportCurrent, maximumImportBytes }) {
  overlays.open({
    id: 'slots', title: mode === 'save' ? 'Save game' : 'Load game', className: 'overlay-saves',
    build: ({ close }) => {
      const list = el('div', { class: 'save-slots' });
      const status = el('p', { class: 'save-status', role: 'status' });
      const imported = el('div', { class: 'save-import-preview' });
      const report = (message, error = false) => { status.textContent = message; status.classList.toggle('neg', error); };
      const button = (label, fn, cls = '') => el('button', { class: `btn ${cls}`, onClick: fn }, label);
      const attempt = fn => { try { fn(); } catch (e) { report(e.message ?? String(e), true); } };
      function pick(id, opts) {
        attempt(() => { const result = onPick(id, opts); if (result?.ok !== false) close(); else report(result.reason, true); });
      }
      function refresh() {
        list.replaceChildren(...saves.list().filter(s => mode === 'load' || s.slotId !== 'autosave').map(slot => {
          const actions = el('div', { class: 'save-actions' });
          if (mode === 'save') actions.append(button('Save here', () => {
            if (slot.empty) pick(slot.slotId);
            else confirmBox(overlays, { title: `Save to ${SLOT_NAMES[slot.slotId]}?`,
              text: 'The current company will replace this slot. Its usable current copy becomes the previous revision.',
              yes: 'Save here', onYes: () => pick(slot.slotId) });
          }, 'btn-primary'));
          else if (slot.hasPrimary || slot.hasBackup) actions.append(button(slot.hasPrimary ? 'Load' : 'Recover', () => pick(slot.slotId), 'btn-primary'));
          if (slot.hasPrimary) actions.append(button('Export', () => attempt(() => downloadSave(saves.exportSave(slot.slotId), `quarry-${slot.slotId}`))));
          const recovery = slot.backup ? el('details', { class: 'save-recovery' },
            el('summary', {}, `Previous revision · ${when(slot.backup.savedAt)}`),
            el('p', { class: 'lt-note' }, description(slot.backup)),
            el('div', { class: 'save-actions' },
              mode === 'load' ? button('Load previous revision', () => pick(slot.slotId, { backup: true })) : null,
              button('Export previous revision', () => attempt(() => downloadSave(saves.exportSave(slot.slotId, { backup: true }), `quarry-${slot.slotId}-previous`))))) : null;
          return el('article', { class: 'save-slot', dataset: { slotId: slot.slotId } },
            el('h3', {}, SLOT_NAMES[slot.slotId]), el('p', {}, slot.empty ? 'Empty slot' : description(slot)),
            slot.error ? el('p', { class: 'neg' }, `${slot.error}${slot.hasBackup ? '. A previous revision is available.' : ''}`) : null,
            actions, recovery);
        }));
      }
      const file = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Import a Quarry save file' });
      let selection = 0;
      file.addEventListener('change', async () => {
        const request = ++selection, f = file.files?.[0]; imported.replaceChildren(); report('');
        if (!f) return;
        try {
          if (f.size > maximumImportBytes) throw new Error('Save file is too large');
          const text = await f.text(); if (request !== selection || !file.isConnected) return;
          const preview = saves.inspectImport(text);
          const target = el('select', { 'aria-label': 'Import destination' }, ['slot1', 'slot2', 'slot3'].map(id => el('option', { value: id }, SLOT_NAMES[id])));
          const empty = saves.list().find(s => s.empty && s.slotId !== 'autosave'); target.value = empty?.slotId ?? 'slot1';
          imported.append(el('h3', {}, 'Ready to import'), el('p', {}, description(preview)),
            el('p', { class: 'lt-note' }, 'Choose a manual slot. Importing stores this company; Load opens it. An existing usable copy in that slot becomes its previous revision.'),
            el('label', { class: 'save-destination' }, 'Destination', target),
            button('Import into selected slot', () => attempt(() => {
              saves.importSave(target.value, text);
              report(`Imported into ${SLOT_NAMES[target.value]}. Choose Load to continue this company.`);
              file.value = ''; imported.replaceChildren(); refresh(); onChanged?.();
            }), 'btn-primary'));
        } catch (e) { if (request === selection) report(e.message ?? String(e), true); }
      });
      refresh();
      return el('div', { class: 'save-manager' },
        el('p', { class: 'lt-note' }, 'Each slot keeps one previous revision. Exported files can move a company to another browser or keep it safe outside browser storage.'),
        status,
        exportCurrent ? button('Export current company', () => attempt(() => downloadSave(exportCurrent())), 'save-current') : null,
        list,
        mode === 'load' ? el('section', { class: 'save-import' }, el('h3', {}, 'Import a company'), file, imported) : null);
    },
  });
}
