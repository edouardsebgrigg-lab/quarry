// Settings screen: volume, UI scale, fullscreen, autosave, key bindings.
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

      const volume = el('input', {
        type: 'range', min: 0, max: 1, step: 0.05, value: settings.volume,
        onInput: (e) => update({ volume: Number(e.target.value) }),
      });

      const scale = el('select', { onChange: (e) => update({ uiScale: Number(e.target.value) }) },
        [0.85, 1, 1.15, 1.3, 1.5].map((v) => el('option', { value: String(v), selected: v === settings.uiScale }, `${Math.round(v * 100)}%`)));

      const toggle = (key) => el('input', {
        type: 'checkbox', checked: settings[key], onChange: (e) => update({ [key]: e.target.checked }),
      });

      const sensitivity = el('input', {
        type: 'range', min: 0.2, max: 3, step: 0.1, value: settings.mouseSensitivity,
        onInput: (e) => update({ mouseSensitivity: Number(e.target.value) }),
      });

      const graphics = el('select', { onChange: (e) => update({ graphics: e.target.value }) },
        ['low', 'medium', 'high', 'ultra'].map((v) => el('option', { value: v, selected: v === settings.graphics },
          v[0].toUpperCase() + v.slice(1))));

      const bindingsList = el('div', { class: 'bindings' });
      function renderBindings() {
        clear(bindingsList);
        for (const action of Object.keys(ACTION_LABELS)) {
          const btn = el('button', { class: 'btn btn-key' }, keyLabel(settings.bindings[action]));
          btn.addEventListener('click', () => {
            btn.textContent = 'Press a key…';
            keyboard.captureNextKey((code) => {
              if (code) update({ bindings: rebind(settings.bindings, action, code) });
              renderBindings();
            });
          });
          bindingsList.append(el('div', { class: 'binding-row' },
            el('span', {}, ACTION_LABELS[action]), btn));
        }
        bindingsList.append(el('div', { class: 'binding-row muted' }, el('span', {}, 'Pause menu / back'), el('span', {}, 'Esc')));
      }
      renderBindings();

      return el('div', { class: 'settings' },
        el('div', { class: 'settings-grid' },
          el('label', {}, 'Master volume'), volume,
          el('label', {}, 'Mouse sensitivity'), sensitivity,
          el('label', {}, 'Invert mouse Y'), toggle('invertY'),
          el('label', {}, 'Graphics quality (applies when a game starts)'), graphics,
          el('label', {}, 'Interface size'), scale,
          el('label', {}, 'Full screen'), toggle('fullscreen'),
          el('label', {}, 'Autosave every game day'), toggle('autosave'),
        ),
        el('h3', {}, 'Controls'),
        el('p', { class: 'muted small' }, 'Click a key to change it. Esc cancels.'),
        bindingsList,
        el('div', { class: 'menu-buttons row' },
          el('button', {
            class: 'btn',
            onClick: () => { update({ bindings: { ...DEFAULT_BINDINGS } }); renderBindings(); },
          }, 'Reset controls'),
          el('button', { class: 'btn btn-primary', onClick: close }, 'Done'),
        ),
      );
    },
  });
}
