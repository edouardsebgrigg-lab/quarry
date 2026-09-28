// On-screen info over the 3D view: crosshair, prompt, machine panel, control hints.
import { el, setText, progressBar } from '../dom.js';
import { conditionColor } from '../format.js';
import { keyLabel } from '../../input/index.js';

export function createHud3d({ settings }) {
  const k = (action) => keyLabel(settings.bindings[action]);
  const crosshair = el('div', { class: 'crosshair' });
  const prompt = el('div', { class: 'prompt' });
  const help = el('div', { class: 'controls-help' });

  const mName = el('div', { class: 'mp-name' });
  const mCond = el('div', { class: 'mp-row' });
  const condBar = progressBar();
  const mLoad = el('div', { class: 'mp-row' });
  const loadBar = progressBar();
  const mSpeed = el('div', { class: 'mp-speed' });
  const machinePanel = el('div', { class: 'machine-panel' }, mName, mCond, condBar.node, mLoad, loadBar.node, mSpeed);

  const clickToPlay = el('div', { class: 'click-to-play' },
    el('div', { class: 'ctp-title' }, 'Click to play'),
    el('div', { class: 'ctp-sub' }, 'The mouse looks around · Esc for the menu'));
  const loading = el('div', { class: 'click-to-play' }, el('div', { class: 'ctp-title' }, 'Loading the quarry…'));

  const node = el('div', { class: 'hud3d' }, crosshair, prompt, help, machinePanel, clickToPlay, loading);

  function helpText(info) {
    if (info.mode === 'truck') {
      return `${k('forward')}/${k('back')} drive · ${k('left')}/${k('right')} steer · ${k('jump')} handbrake · `
        + `${k('tip')} tip · ${k('loadPile')} load from pile · ${k('camera')} camera · ${k('recover')} recover · ${k('interact')} get out`;
    }
    if (info.mode === 'excavator') {
      return `Mouse swings the arm · hold Left Mouse dig · Left Mouse dump · ${k('forward')}${k('left')}${k('back')}${k('right')} tracks · `
        + `${k('camera')} camera · ${k('interact')} get out`;
    }
    return `${k('forward')}${k('left')}${k('back')}${k('right')} move · ${k('sprint')} sprint · ${k('jump')} jump · `
      + `${k('interact')} get in · ${k('repair')} repair · ${k('map')} map · ${k('shop')} shop · ${k('market')} market`;
  }

  return {
    node,
    setLoading(on) {
      loading.style.display = on ? '' : 'none';
    },
    showError(text) {
      setText(loading.firstChild, text);
      loading.style.display = '';
    },
    update(info, { overlayOpen }) {
      if (!info) {
        clickToPlay.style.display = 'none';
        return;
      }
      clickToPlay.style.display = !info.locked && !overlayOpen ? '' : 'none';
      crosshair.style.display = info.locked ? '' : 'none';
      setText(prompt, info.prompt);
      prompt.style.display = info.prompt ? '' : 'none';
      setText(help, helpText(info));

      const m = info.machine;
      machinePanel.style.display = m ? '' : 'none';
      if (!m) return;
      setText(mName, m.name);
      setText(mCond, m.broken ? 'BROKEN DOWN' : `Condition ${Math.round(m.condition)}%`);
      mCond.classList.toggle('bad', m.broken);
      condBar.set(m.condition / 100, conditionColor(m.condition, m.broken));
      const what = m.type === 'truck' ? 'Load' : 'Bucket';
      setText(mLoad, `${what}: ${m.load.toFixed(1)} / ${m.capacity.toFixed(1)} t`);
      loadBar.set(m.load / m.capacity, '#c9a86a');
      setText(mSpeed, m.type === 'truck' ? `${Math.round(m.speedKmh)} km/h` : '');
    },
  };
}
