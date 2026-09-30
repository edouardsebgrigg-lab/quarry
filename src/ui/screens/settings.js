// Settings: controls, display, sound, game, and key bindings.
import { el, clear } from '../dom.js';
import { ACTION_LABELS, DEFAULT_BINDINGS, keyLabel, rebind } from '../../input/index.js';

export function openSettings(overlays, { settings, onChange, keyboard }) {
  overlays.open({
    id: 'settings',
    title: 'Settings',
    className: 'overlay-wide',
    build: ({ close }) => {
      const update = (patch) => {
        Object.assign(settings, patch);
        onChange(settings);
      };

      const row = (label, control, hint) => el('div', { class: 'setting-row' },
        el('label', {}, label, hint ? el('span', { class: 'hint' }, hint) : null), control);

      const range = (key, min, max, step) => el('input', {
        type: 'range', min, max, step, value: settings[key],
        onInput: (e) => update({ [key]: Number(e.target.value) }),
      });

      const toggle = (key) => el('input', {
        type: 'checkbox', class: 'switch', checked: settings[key], onChange: (e) => update({ [key]: e.target.checked }),
      });

      const select = (key, options, parse = (v) => v) => el('select', { onChange: (e) => update({ [key]: parse(e.target.value) }) },
        options.map(([value, label]) => el('option', { value: String(value), selected: value === settings[key] }, label)));

      const bindingsList = el('div', { class: 'bindings' });
      function renderBindings() {
        clear(bindingsList);
        for (const action of Object.keys(ACTION_LABELS)) {
          const btn = el('button', { class: 'btn btn-key' }, keyLabel(settings.bindings[action]));
          btn.addEventListener('click', () => {
            btn.textContent = 'Press a key…';
            btn.classList.add('waiting');
            keyboard.captureNextKey((code) => {
              if (code) update({ bindings: rebind(settings.bindings, action, code) });
              renderBindings();
            });
          });
          bindingsList.append(el('div', { class: 'binding-row' }, el('span', {}, ACTION_LABELS[action]), btn));
        }
        bindingsList.append(el('div', { class: 'binding-row muted' }, el('span', {}, 'Pause menu / back'), el('span', { class: 'kbd' }, 'Esc')));
      }
      renderBindings();

      return el('div', { class: 'settings' },
        el('div', { class: 'settings-section' },
          el('h3', {}, 'Controls'),
          row('Mouse sensitivity', range('mouseSensitivity', 0.2, 3, 0.1)),
          row('Invert mouse Y', toggle('invertY')),
          row('Digger controls', select('diggerControls', [['assisted', 'Assisted'], ['direct', 'Direct']]),
            'Assisted: aim and click, the arm does the rest. Direct: boom, stick, bucket and swing each on their own keys (G switches in the cab)')),
        el('div', { class: 'settings-section' },
          el('h3', {}, 'Display'),
          row('Graphics quality', select('graphics', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']]),
            'Low: no shadows, for slow computers. Medium: soft shadows. High: adds contact shadows where things meet. Ultra: sharper shadows and a higher resolution. Applies when a game starts'),
          row('Interface size', select('uiScale', [0.85, 1, 1.15, 1.3, 1.5].map((v) => [v, `${Math.round(v * 100)}%`]), Number)),
          row('Full screen', toggle('fullscreen'))),
        el('div', { class: 'settings-section' },
          el('h3', {}, 'Sound & game'),
          row('Master volume', range('volume', 0, 1, 0.05)),
          row('Countryside sounds', range('ambientVolume', 0, 1, 0.05), 'Wind, birds and passing traffic'),
          row('Autosave every game day', toggle('autosave'))),
        el('div', { class: 'settings-section' },
          el('div', { class: 'row-between' }, el('h3', {}, 'Key bindings'),
            el('button', {
              class: 'btn btn-ghost btn-small',
              onClick: () => { update({ bindings: { ...DEFAULT_BINDINGS } }); renderBindings(); },
            }, 'Reset to defaults')),
          el('p', { class: 'foot-note' }, 'Click a key to change it. Esc cancels.'),
          bindingsList),
        el('div', { class: 'menu-buttons row' }, el('button', { class: 'btn btn-primary', onClick: close }, 'Done')),
      );
    },
  });
}
