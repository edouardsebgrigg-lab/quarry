// Settings: tabs down the side (controls, display, sound, game, keys), clean rows on the right.
import { el, clear, setText } from '../dom.js';
import { ACTION_LABELS, DEFAULT_BINDINGS, keyLabel, rebind } from '../../input/index.js';

const TABS = [
  ['controls', 'Controls'],
  ['display', 'Display'],
  ['sound', 'Sound'],
  ['game', 'Game'],
  ['keys', 'Key bindings'],
];

const GRAPHICS = [
  ['low', 'Low', 'No shadows and a lower resolution, for slow computers and laptops on battery.'],
  ['medium', 'Medium', 'Soft shadows. A good choice for most laptops.'],
  ['high', 'High', 'Soft shadows plus contact shadows where things meet the ground. Needs a proper graphics card.'],
  ['ultra', 'Ultra', 'Sharper shadows and full-resolution contact shadows, at a higher resolution. For fast computers.'],
];

const KEY_GROUPS = [
  ['Moving', ['forward', 'back', 'left', 'right', 'jump', 'sprint']],
  ['Doing things', ['interact', 'tip', 'repair', 'recover', 'camera', 'works', 'survey', 'cruise']],
  ['Digger', ['controls', 'attachments', 'boomUp', 'boomDown', 'stickIn', 'stickOut', 'bucketCurl', 'bucketDump', 'slewLeft', 'slewRight', 'freeLook', 'precision']],
  ['Menus and time', ['shop', 'market', 'map', 'goal', 'hints', 'pause', 'speed1', 'speed2', 'speed3', 'dev']],
];

export function openSettings(overlays, { settings, onChange, keyboard }) {
  overlays.open({
    id: 'settings',
    title: 'Settings',
    className: 'overlay-wide overlay-settings',
    build: ({ close }) => {
      let tab = 'controls';
      const update = (patch) => {
        Object.assign(settings, patch);
        onChange(settings);
      };

      const row = (label, control, hint) => {
        const input = control.matches('input') ? control : control.querySelector('input');
        if (input) input.setAttribute('aria-label', label);
        return el('div', { class: 'setting-row' }, el('label', {}, label, hint ? el('span', { class: 'hint' }, hint) : null), control);
      };

      const range = (key, min, max, step, show = (v) => `${Math.round(v * 100)}%`) => {
        const out = el('span', { class: 'range-value' }, show(settings[key]));
        const input = el('input', {
          type: 'range', min, max, step, value: settings[key],
          onInput: (e) => { update({ [key]: Number(e.target.value) }); setText(out, show(Number(e.target.value))); },
        });
        return el('div', { class: 'range-wrap' }, input, out);
      };

      const toggle = (key) => el('input', {
        type: 'checkbox', class: 'switch', checked: settings[key], onChange: (e) => update({ [key]: e.target.checked }),
      });

      // Segmented buttons for a short list of choices, with a line describing the one picked.
      const choice = (key, options, parse = (v) => v) => {
        const desc = el('div', { class: 'choice-desc' });
        const bar = el('div', { class: 'seg' });
        const draw = () => {
          clear(bar);
          for (const [value, label, text] of options) {
            bar.append(el('button', {
              class: value === settings[key] ? 'active' : '',
              onClick: () => { update({ [key]: parse(value) }); draw(); },
            }, label));
            if (value === settings[key]) setText(desc, text ?? '');
          }
        };
        draw();
        return el('div', { class: 'choice' }, bar, desc);
      };

      const bindingsList = el('div', { class: 'bindings' });
      function renderBindings() {
        clear(bindingsList);
        const placed = new Set(KEY_GROUPS.flatMap(([, list]) => list));
        const groups = [...KEY_GROUPS, ['Other', Object.keys(ACTION_LABELS).filter((a) => !placed.has(a))]];
        for (const [name, actions] of groups) {
          const list = actions.filter((a) => ACTION_LABELS[a]);
          if (!list.length) continue;
          bindingsList.append(el('div', { class: 'binding-group' }, name));
          for (const action of list) {
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
        }
        bindingsList.append(el('div', { class: 'binding-row muted' }, el('span', {}, 'Pause menu / back'), el('span', { class: 'kbd' }, 'Esc')));
      }

      const pages = {
        controls: () => [
          row('Mouse sensitivity', range('mouseSensitivity', 0.2, 3, 0.1, (v) => `${v.toFixed(1)}×`)),
          row('Invert mouse Y', toggle('invertY')),
          row('Digger lever sensitivity', range('diggerSensitivity', 0.2, 2, 0.1, (v) => `${v.toFixed(1)}×`)),
          row('Hold mouse to repeat shovel', toggle('repeatShovel'), 'Repeats a dig or pour while held; release to stop'),
          row('Digger controls', choice('diggerControls', [
            ['assisted', 'Assisted', 'Aim the bucket and click: the arm does the rest. The easy way to start.'],
            ['direct', 'Direct', 'Boom, stick, bucket and swing each on their own controls, like the real levers. G switches in the cab.'],
          ])),
        ],
        display: () => [
          row('Camera motion', range('cameraMotion', 0, 1, 0.05), 'Reduce bob, shake and camera sway. 0% keeps movement steady.'),
          row('Field of view', range('fieldOfView', 50, 95, 1, (v) => `${Math.round(v)}°`), 'Wider views show more of your surroundings.'),
          row('Graphics quality', choice('graphics', GRAPHICS), 'Applies when a game starts'),
          row('Interface size', choice('uiScale', [0.85, 1, 1.15, 1.3, 1.5].map((v) => [v, `${Math.round(v * 100)}%`]), Number)),
          row('Full screen', toggle('fullscreen')),
        ],
        sound: () => [
          row('Master volume', range('volume', 0, 1, 0.05)),
          row('Countryside sounds', range('ambientVolume', 0, 1, 0.05), 'Wind, birds and passing traffic'),
        ],
        game: () => [
          row('Autosave every game day', toggle('autosave'), 'Saves to the autosave slot each morning'),
          row('Guide beam in the world', toggle('guideBeam'), 'A column of light where your goal wants you. The arrow at the top and the map still show the way without it'),
          row('Tips from Ray', toggle('mentorTips'), 'Short tips when something goes wrong. They arrive in Messages either way'),
        ],
        keys: () => {
          renderBindings();
          return [
            el('div', { class: 'row-between keys-head' }, el('p', { class: 'foot-note' }, 'Click a key to change it. Esc cancels.'),
              el('button', {
                class: 'btn btn-ghost btn-small',
                onClick: () => { update({ bindings: { ...DEFAULT_BINDINGS } }); renderBindings(); },
              }, 'Reset to defaults')),
            bindingsList,
          ];
        },
      };

      const nav = el('nav', { class: 'settings-nav' });
      const page = el('div', { class: 'settings-page' });
      function render() {
        clear(nav);
        for (const [id, label] of TABS) {
          nav.append(el('button', { class: tab === id ? 'active' : '', onClick: () => { tab = id; render(); } }, label));
        }
        clear(page);
        page.append(el('h3', { class: 'settings-page-title' }, TABS.find(([id]) => id === tab)[1]), ...pages[tab]());
      }
      render();

      return el('div', { class: 'settings' },
        el('div', { class: 'settings-layout' }, nav, page),
        el('div', { class: 'menu-buttons row settings-foot' }, el('button', { class: 'btn btn-primary', onClick: close }, 'Done')),
      );
    },
  });
}
