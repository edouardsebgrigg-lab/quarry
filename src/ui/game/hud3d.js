// On-screen info over the 3D view, kept small so the world stays in view:
// a dot crosshair, a small action prompt low in the middle, control hints bottom left
// (they fade after a few seconds; H brings them back), and a compact machine dash bottom
// right (only while you're in a machine).
import { el, clear, setText, kbd } from '../dom.js';
import { conditionColor } from '../format.js';
import { keyLabel } from '../../input/index.js';

const HINT_TIME = 8; // seconds the hints stay after you switch machine

export function createHud3d({ settings }) {
  const k = (action) => keyLabel(settings.bindings[action]);

  const crosshair = el('div', { class: 'crosshair' });
  const prompt = el('div', { class: 'prompt' });
  const help = el('div', { class: 'controls-help' });
  const helpTag = el('div', { class: 'controls-tag' });

  // ---- machine dash
  const mName = el('div', { class: 'md-name' });
  const mStatus = el('div', { class: 'md-status' });
  const speedValue = el('b', { class: 'md-speed' });
  const gearValue = el('span', { class: 'md-gear' });
  const rpmFill = el('div', { class: 'md-rpm-fill' });
  const drive = el('div', { class: 'md-drive' },
    el('div', { class: 'md-speed-row' }, gearValue, speedValue, el('span', { class: 'md-unit' }, 'km/h')),
    el('div', { class: 'md-rpm' }, rpmFill));
  const meter = (label) => {
    const fill = el('div', { class: 'md-fill' });
    const val = el('span', { class: 'md-val' });
    const lab = el('span', { class: 'md-label' }, label);
    return { fill, val, lab, node: el('div', { class: 'md-meter' }, lab, el('div', { class: 'md-track' }, fill), val) };
  };
  const cond = meter('Cond');
  const load = meter('Load');
  const machinePanel = el('div', { class: 'machine-dash' },
    el('div', { class: 'md-head' }, mName, mStatus), drive, load.node, cond.node);

  const ctpTitle = el('div', { class: 'ctp-title' }, 'Click to play');
  const clickToPlay = el('div', { class: 'click-to-play' },
    el('div', { class: 'ctp-card' }, ctpTitle,
      el('div', { class: 'ctp-sub' }, 'Mouse to look', el('span', { class: 'sep' }, '·'), kbd('Esc'), 'menu')));
  const loading = el('div', { class: 'click-to-play' }, el('div', { class: 'ctp-card' }, el('div', { class: 'ctp-title' }, 'Loading…')));

  // Where the goal wants you: an arrow, what's there and how far.
  const guideArrow = el('div', { class: 'guide-arrow' });
  const guideLabel = el('span', { class: 'guide-label' });
  const guideDist = el('span', { class: 'guide-dist' });
  const guidePill = el('div', { class: 'guide-pill' }, guideArrow, guideLabel, guideDist);

  const node = el('div', { class: 'hud3d' }, crosshair, guidePill, prompt, help, helpTag, machinePanel, clickToPlay, loading);

  // Control hints per mode: [keys, label]. The last rows are the same everywhere.
  function hints(mode) {
    let rows;
    if (mode === 'truck' || mode === 'pickup' || mode === 'tractor') {
      rows = [[[k('forward'), k('back')], 'Drive / brake'], [[k('left'), k('right')], 'Steer'], [[k('jump')], 'Handbrake'],
        [[k('tip')], { pickup: 'Unload', tractor: 'Tip trailer' }[mode] ?? 'Tip load'], [[k('camera')], 'Camera'], [[k('recover')], 'Recover'],
        [[k('interact')], 'Get out']];
    } else if (mode === 'barrow') {
      rows = [[[k('forward'), k('back')], 'Push / pull'], [['Mouse', k('left'), k('right')], 'Steer'],
        [[k('tip')], 'Tip it'], [[k('interact')], 'Let go']];
    } else if (mode === 'dumper') {
      rows = [[[k('forward'), k('back')], 'Drive'], [[k('left'), k('right')], 'Turn'], [[k('tip')], 'Tip the skip'],
        [[k('camera')], 'Camera'], [[k('interact')], 'Get out']];
    } else if (mode === 'digger') {
      rows = [[['Mouse'], 'Swing'], [['LMB'], 'Dig / dump'], [[k('forward'), k('left'), k('back'), k('right')], 'Tracks'],
        [[k('controls')], 'Direct controls'], [[k('camera')], 'Camera'], [[k('interact')], 'Get out']];
    } else if (mode === 'digger-direct') {
      rows = [[['Mouse ←→'], 'Swing'], [['Mouse ↑↓'], 'Stick out / in'], [['Wheel'], 'Boom up / down'], [['LMB'], 'Curl bucket in'],
        [['RMB'], 'Open bucket'], [[k('forward'), k('left'), k('back'), k('right')], 'Tracks'],
        [[k('controls')], 'Assisted controls'], [[k('camera')], 'Camera'], [[k('interact')], 'Get out']];
    } else {
      rows = [[[k('forward'), k('left'), k('back'), k('right')], 'Move'], [[k('sprint')], 'Sprint'], [[k('jump')], 'Jump'],
        [['LMB'], 'Dig / tip the shovel'], [[k('interact')], 'Use / get in / take barrow'], [[k('repair')], 'Service / repair']];
    }
    return [...rows, null, [[k('shop')], 'Shop'], [[k('market')], 'Prices'], [[k('map')], 'Map'], [[k('goal')], 'Goal']];
  }

  let helpKey = '';
  let promptKey = '';
  let promptFill = null;
  let hintT = HINT_TIME;
  let hintsPinned = false;

  return {
    node,
    setLoading(on) {
      loading.style.display = on ? '' : 'none';
    },
    showError(text) {
      setText(loading.querySelector('.ctp-title'), text);
      loading.style.display = '';
    },
    toggleHints() {
      hintsPinned = !(hintsPinned || hintT > 0);
      hintT = 0;
    },
    update(info, { overlayOpen, started, dt = 1 / 60 }) {
      if (!info) {
        clickToPlay.style.display = 'none';
        return;
      }
      clickToPlay.style.display = !info.locked && !overlayOpen ? '' : 'none';
      setText(ctpTitle, started ? 'Click to resume' : 'Click to play');
      crosshair.style.display = info.locked ? '' : 'none';

      // Prompt: a keycap and an action (or a few side by side), or a job in progress.
      const list = !info.prompt ? [] : Array.isArray(info.prompt) ? info.prompt : [info.prompt];
      const p = list[0] ?? null;
      const j = info.job;
      const key = j ? `job:${j.label}` : list.map((x) => `${x.key}|${x.text}`).join('/');
      if (key !== promptKey) {
        promptKey = key;
        clear(prompt);
        promptFill = null;
        if (j) {
          promptFill = el('div', { class: 'prompt-fill' });
          prompt.append(el('span', {}, j.label), el('div', { class: 'prompt-track' }, promptFill));
        } else {
          list.forEach((x, i) => {
            if (i) prompt.append(el('span', { class: 'prompt-sep' }));
            if (x.key) prompt.append(kbd(x.key));
            prompt.append(el('span', {}, x.text));
          });
        }
        prompt.classList.toggle('info', list.length === 1 && !p.key && !j);
      }
      if (promptFill && j) promptFill.style.width = `${Math.round(j.progress * 100)}%`;
      prompt.style.display = key ? '' : 'none';

      // Hints: shown for a while when you change what you're driving, or pinned with H.
      if (helpKey !== info.mode) {
        helpKey = info.mode;
        hintT = HINT_TIME;
        clear(help);
        for (const row of hints(info.mode)) {
          if (!row) {
            help.append(el('div', { class: 'help-gap' }));
            continue;
          }
          const [keys, label] = row;
          help.append(el('div', { class: 'help-row' }, el('span', { class: 'keys' }, keys.map(kbd)), el('span', {}, label)));
        }
      }
      hintT = Math.max(0, hintT - dt);
      const showHelp = hintsPinned || hintT > 0;
      help.classList.toggle('hidden', !showHelp);
      helpTag.classList.toggle('hidden', showHelp);
      clear(helpTag);
      helpTag.append(kbd(k('hints')), el('span', {}, 'Controls'));

      const g = info.guide;
      guidePill.style.display = g && !overlayOpen ? '' : 'none';
      if (g) {
        setText(guideLabel, g.label);
        setText(guideDist, g.dist < 1000 ? `${Math.round(g.dist)} m` : `${(g.dist / 1000).toFixed(1)} km`);
        guideArrow.style.transform = `rotate(${(g.bearing * 180) / Math.PI}deg)`;
      }

      const m = info.machine;
      machinePanel.style.display = m ? '' : 'none';
      if (!m) return;
      setText(mName, m.name);
      if (m.type === 'barrow') {
        // A wheelbarrow: just what's in it, by volume and weight.
        setText(mStatus, m.load > 0.001 ? `${Math.round(m.tonnes * 1000)} kg` : 'Empty');
        mStatus.className = 'md-status off';
        cond.node.style.display = 'none';
        drive.style.display = 'none';
        setText(load.lab, 'Load');
        load.fill.style.width = `${Math.round(Math.min(1, m.load / m.capacity) * 100)}%`;
        setText(load.val, `${m.load.toFixed(2)}/${m.capacity.toFixed(2)} m³`);
        return;
      }
      cond.node.style.display = '';
      const engineStatus = { off: 'Engine off', cranking: 'Starting', stopping: 'Engine off', stall: 'Stalled' }[m.engine];
      const status = m.broken ? 'Broken' : j ? j.label : engineStatus ?? (m.ticket ? 'Weighed in' : 'Ready');
      setText(mStatus, status);
      mStatus.className = `md-status ${m.broken ? 'bad' : j ? 'busy' : engineStatus ? 'off' : ''}`;
      cond.fill.style.width = `${Math.round(m.condition)}%`;
      cond.fill.style.background = conditionColor(m.condition, m.broken);
      setText(cond.val, `${Math.round(m.condition)}%`);
      setText(load.lab, m.carrier ? 'Load' : 'Bucket');
      load.fill.style.width = `${Math.round(Math.min(1, m.load / m.capacity) * 100)}%`;
      const dp = m.capacity < 1 ? 2 : 1; // (small buckets need the extra digit)
      setText(load.val, `${m.load.toFixed(dp)}/${m.capacity.toFixed(dp)} t`);
      drive.style.display = m.road ? '' : 'none';
      if (m.road) {
        setText(speedValue, String(Math.round(m.speedKmh)).padStart(2, '0'));
        setText(gearValue, m.engine === 'running' ? m.gear : 'N');
        const r = Math.min(1, (m.rpm ?? 0) / (m.maxRpm ?? 2600));
        rpmFill.style.width = `${Math.round(r * 100)}%`;
        rpmFill.classList.toggle('high', r > 0.88);
      }
    },
  };
}
