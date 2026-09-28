// On-screen info over the 3D view: crosshair, action prompt, control hints,
// machine gauges and the "click to play" card.
import { el, clear, setText, progressBar, kbd } from '../dom.js';
import { conditionColor } from '../format.js';
import { keyLabel } from '../../input/index.js';

export function createHud3d({ settings }) {
  const k = (action) => keyLabel(settings.bindings[action]);

  const crosshair = el('div', { class: 'crosshair' });
  const prompt = el('div', { class: 'prompt glass' });
  const help = el('div', { class: 'controls-help glass' });

  const mName = el('div', { class: 'mp-name' });
  const mStatus = el('div', { class: 'mp-status' });
  const gauge = (label) => {
    const bar = progressBar();
    const val = el('span', { class: 'val' });
    return { bar, val, node: el('div', { class: 'mp-gauge' }, el('span', {}, label), bar.node, val) };
  };
  const cond = gauge('Condition');
  const load = gauge('Load');
  const loadLabel = load.node.firstChild;
  const speedValue = el('b');
  const speed = el('div', { class: 'mp-speed' }, speedValue, el('span', {}, 'km/h'));
  const machinePanel = el('div', { class: 'machine-panel glass' },
    el('div', { class: 'mp-head' }, mName, mStatus), cond.node, load.node, speed);

  const ctpTitle = el('div', { class: 'ctp-title' }, 'Click to play');
  const clickToPlay = el('div', { class: 'click-to-play' },
    el('div', { class: 'ctp-card glass' }, ctpTitle,
      el('div', { class: 'ctp-sub' }, 'Mouse to look', el('span', { class: 'sep' }, '·'), kbd('Esc'), 'for the menu')));
  const loading = el('div', { class: 'click-to-play' }, el('div', { class: 'ctp-card glass' }, el('div', { class: 'ctp-title' }, 'Loading the quarry…')));

  const node = el('div', { class: 'hud3d' }, crosshair, prompt, help, machinePanel, clickToPlay, loading);

  // Control hints per mode: [keys, label].
  function hints(mode) {
    if (mode === 'truck') {
      return [[[k('forward'), k('back')], 'Drive / brake'], [[k('left'), k('right')], 'Steer'], [[k('jump')], 'Handbrake'],
        [[k('tip')], 'Tip load'], [[k('loadPile')], 'Load from pile'], [[k('camera')], 'Camera'], [[k('recover')], 'Recover'],
        [[k('interact')], 'Get out']];
    }
    if (mode === 'excavator') {
      return [[['Mouse'], 'Swing arm'], [['LMB'], 'Dig / dump'], [[k('forward'), k('left'), k('back'), k('right')], 'Tracks'],
        [[k('camera')], 'Camera'], [[k('interact')], 'Get out']];
    }
    return [[[k('forward'), k('left'), k('back'), k('right')], 'Move'], [[k('sprint')], 'Sprint'], [[k('jump')], 'Jump'],
      [[k('interact')], 'Get in'], [[k('repair')], 'Service / repair']];
  }

  let helpKey = '';
  let promptKey = '';
  let promptBar = null;

  return {
    node,
    setLoading(on) {
      loading.style.display = on ? '' : 'none';
    },
    showError(text) {
      setText(loading.querySelector('.ctp-title'), text);
      loading.style.display = '';
    },
    update(info, { overlayOpen, started }) {
      if (!info) {
        clickToPlay.style.display = 'none';
        return;
      }
      clickToPlay.style.display = !info.locked && !overlayOpen ? '' : 'none';
      setText(ctpTitle, started ? 'Click to resume' : 'Click to play');
      crosshair.style.display = info.locked ? '' : 'none';

      // Prompt: a keycap and an action, or a job in progress.
      const p = info.prompt;
      const j = info.job;
      const key = j ? `job:${j.label}` : p ? `${p.key}|${p.text}` : '';
      if (key !== promptKey) {
        promptKey = key;
        clear(prompt);
        promptBar = null;
        if (j) {
          promptBar = progressBar();
          promptBar.node.classList.add('prompt-progress');
          prompt.append(el('span', {}, `${j.label}…`), promptBar.node);
        } else if (p) {
          if (p.key) prompt.append(kbd(p.key));
          prompt.append(el('span', {}, p.text));
        }
        prompt.classList.toggle('info', !!p && !p.key && !j);
      }
      if (promptBar && j) promptBar.set(j.progress);
      prompt.style.display = key ? '' : 'none';

      if (helpKey !== info.mode) {
        helpKey = info.mode;
        clear(help);
        for (const [keys, label] of hints(info.mode)) {
          help.append(el('div', { class: 'help-row' }, el('span', { class: 'keys' }, keys.map(kbd)), label));
        }
      }

      const m = info.machine;
      machinePanel.style.display = m ? '' : 'none';
      if (!m) return;
      setText(mName, m.name);
      const status = m.broken ? 'Broken' : j ? j.label : m.type === 'truck' && m.speedKmh > 1 ? 'Moving' : 'Ready';
      setText(mStatus, status);
      mStatus.className = `mp-status ${m.broken ? 'bad' : j ? 'busy' : ''}`;
      cond.bar.set(m.condition / 100, conditionColor(m.condition, m.broken));
      setText(cond.val, `${Math.round(m.condition)}%`);
      setText(loadLabel, m.type === 'truck' ? 'Load' : 'Bucket');
      load.bar.set(m.load / m.capacity, '#d9b98a');
      setText(load.val, `${m.load.toFixed(1)} / ${m.capacity.toFixed(1)} t`);
      speed.style.display = m.type === 'truck' ? '' : 'none';
      setText(speedValue, Math.round(m.speedKmh));
    },
  };
}
