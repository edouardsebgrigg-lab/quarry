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
  const materialDot = el('span', { class: 'mw-material-dot' });
  const materialName = el('span', { class: 'mw-material-name' });
  const attachment = el('span', { class: 'mw-attachment' });
  const workMaterial = el('div', { class: 'mw-material' }, materialDot, materialName, attachment);
  const workLabel = el('span', { class: 'mw-state' });
  const workEffort = el('span', { class: 'mw-effort' });
  const workFill = el('div', { class: 'mw-effort-fill' });
  const workMetrics = el('div', { class: 'mw-metrics' });
  const workStrip = el('div', { class: 'machine-work' }, workMaterial,
    el('div', { class: 'mw-state-row' }, workLabel, workEffort),
    el('div', { class: 'mw-effort-track' }, workFill), workMetrics);
  const machinePanel = el('div', { class: 'machine-dash' },
    el('div', { class: 'md-head' }, mName, mStatus), workStrip, drive, load.node, cond.node);

  const ctpTitle = el('div', { class: 'ctp-title' }, 'Click to play');
  const clickToPlay = el('div', { class: 'click-to-play' },
    el('div', { class: 'ctp-card' }, ctpTitle,
      el('div', { class: 'ctp-sub' }, 'Mouse to look', el('span', { class: 'sep' }, '·'), kbd('Esc'), 'menu')));
  const loadingTitle = el('div', { class: 'ctp-title' }, 'Loading…');
  const loading = el('div', { class: 'click-to-play' }, el('div', { class: 'ctp-card' }, loadingTitle));

  // Where the goal wants you: an arrow, what's there and how far.
  const guideArrow = el('div', { class: 'guide-arrow' });
  const guideLabel = el('span', { class: 'guide-label' });
  const guideDist = el('span', { class: 'guide-dist' });
  const guidePill = el('div', { class: 'guide-pill' }, guideArrow, guideLabel, guideDist);

  // The earthworks planner's card: what is being planned, what it costs and needs, and whether it can be built.
  const worksTitle = el('div', { class: 'wk-title' });
  const worksModeKey = el('span', { class: 'wk-key' });
  const worksModes = el('div', { class: 'wk-modes' }, worksModeKey, ...['road', 'ramp', 'level'].map((m) => el('span', { class: 'wk-mode', 'data-mode': m }, { road: 'Road', ramp: 'Ramp', level: 'Level' }[m])));
  const worksRows = el('div', { class: 'wk-rows' });
  const worksControls = el('div', { class: 'wk-controls' });
  const worksCard = el('div', { class: 'works-card' }, worksTitle, worksModes, worksRows, worksControls);
  let worksKey = '';

  const surveyTitle = el('span', {}, 'Ground survey');
  const surveyKey = el('span', { class: 'survey-key' });
  const surveySurface = el('div', { class: 'survey-surface' });
  const surveyLayers = el('div', { class: 'survey-layers' });
  const surveyBed = el('div', { class: 'survey-bed' });
  const surveyCard = el('div', { class: 'survey-card' },
    el('div', { class: 'survey-head' }, surveyTitle, surveyKey), surveySurface, surveyLayers, surveyBed);
  let surveyCache = '';

  const node = el('div', { class: 'hud3d' }, crosshair, guidePill, prompt, help, helpTag, machinePanel, worksCard, surveyCard, clickToPlay, loading);

  // Control hints per mode: [keys, label]. The last rows are the same everywhere.
  function hints(mode) {
    let rows;
    if (['truck', 'pickup', 'tractor', 'quad', 'buggy', 'fourByFour', 'serviceVan'].includes(mode)) {
      rows = [[[k('forward'), k('back')], 'Drive / brake'], [[k('left'), k('right')], 'Steer'], [[k('jump')], 'Handbrake'],
        ...(['truck', 'pickup', 'tractor'].includes(mode) ? [[[k('tip')], { pickup: 'Unload', tractor: 'Tip trailer' }[mode] ?? 'Tip load']] : []),
        [[k('cruise')], 'Hold current speed / cancel cruise'], [[k('camera')], 'Camera'], [[k('recover')], 'Recover'],
        [[k('interact')], 'Get out']];
    } else if (mode === 'plan') {
      rows = [[['LMB'], 'Set start / end, then build'], [['Wheel'], 'Width'], [[k('works')], 'Road / ramp / level'],
        [['RMB'], 'Back / cancel'], [[k('forward'), k('left'), k('back'), k('right')], 'Move']];
    } else if (mode === 'barrow') {
      rows = [[[k('forward'), k('back')], 'Push / pull'], [['Mouse', k('left'), k('right')], 'Steer'],
        [[k('tip')], 'Tip it'], [[k('interact')], 'Let go']];
    } else if (mode === 'dumper') {
      rows = [[[k('forward'), k('back')], 'Drive'], [[k('left'), k('right')], 'Turn'], [[k('tip')], 'Tip the skip'],
        [[k('camera')], 'Camera'], [[k('interact')], 'Get out']];
    } else if (mode === 'digger') {
      rows = [[['Mouse ←→'], 'Swing'], [['Wheel'], 'Adjust reach'], [[k('precision'), 'Wheel'], 'Cut depth'], [['LMB'], 'Dig / dump'], [[k('freeLook')], 'Hold: look around'], [[k('precision')], 'Precision'], [[k('forward'), k('left'), k('back'), k('right')], 'Tracks'],
        [[k('tip')], 'Last dump target / attachment'], [[k('attachments')], 'Choose attachment'], [[k('controls')], 'Direct controls'], [[k('camera')], 'Camera'], [[k('interact')], 'Get out']];
    } else if (mode === 'digger-direct') {
      rows = [[['Mouse ←→'], 'Swing'], [['Mouse ↑↓'], 'Stick out / in'], [['Wheel'], 'Boom up / down'], [['LMB'], 'Curl bucket in'],
        [['RMB'], 'Open bucket'], [[k('stickOut'), k('stickIn')], 'Stick'], [[k('slewLeft'), k('slewRight')], 'Slew'], [[k('boomUp'), k('boomDown')], 'Boom'], [[k('freeLook')], 'Hold: look around'], [[k('precision')], 'Precision'], [[k('forward'), k('left'), k('back'), k('right')], 'Tracks'],
        [[k('tip')], 'Change attachment (empty)'], [[k('attachments')], 'Choose attachment'], [[k('controls')], 'Assisted controls'], [[k('camera')], 'Camera'], [[k('interact')], 'Get out']];
    } else {
      rows = [[[k('forward'), k('left'), k('back'), k('right')], 'Move'], [[k('sprint')], 'Sprint'], [[k('jump')], 'Jump'],
        [['LMB'], 'Dig / tip the shovel'], [[k('interact')], 'Use / get in / take barrow'], [[k('repair')], 'Service / repair'],
        [[k('works')], 'Plan a road, ramp or level area'], [[k('survey')], 'Survey ground']];
    }
    return [...rows, null, [[k('shop')], 'Dealer'], [[k('market')], 'Prices'], [[k('map')], 'Map'], [[k('goal')], 'Goal']];
  }

  let helpKey = '';
  let promptKey = '';
  let promptFill = null;
  let hintT = HINT_TIME;
  let hintsPinned = false;

  return {
    node,
    // fraction: how much has downloaded (0..1), if known
    setLoading(on, fraction) {
      loading.style.display = on ? '' : 'none';
      if (on) setText(loadingTitle, fraction === undefined ? 'Loading…' : `Loading… ${Math.round(fraction * 100)}%`);
    },
    showError(text) {
      setText(loadingTitle, text);
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
      prompt.style.display = key && !info.works ? '' : 'none';

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
      const surveying = !!info.survey && !overlayOpen;
      node.classList.toggle('surveying', surveying);
      node.classList.toggle('in-machine', !!info.machine);
      help.classList.toggle('hidden', !showHelp || surveying || !!info.works);
      helpTag.classList.toggle('hidden', showHelp || surveying || !!info.works);
      clear(helpTag);
      helpTag.append(kbd(k('hints')), el('span', {}, 'Controls'));

      const w = info.works;
      worksCard.style.display = w && !overlayOpen ? '' : 'none';
      node.classList.toggle('planning', !!w);
      if (w) {
        const wkey = JSON.stringify(w);
        if (wkey !== worksKey) {
          worksKey = wkey;
          setText(worksTitle, w.title);
          clear(worksModeKey);
          worksModeKey.append(kbd(w.modeKey));
          for (const n of worksModes.children) n.classList.toggle('on', n.dataset.mode === w.mode);
          clear(worksRows);
          clear(worksControls);
          for (const control of w.controls ?? []) worksControls.append(el('div', { class: 'wk-control' }, kbd(control.key), el('span', {}, control.text)));
          for (const [label, value] of w.lines) {
            worksRows.append(label
              ? el('div', { class: 'wk-row' }, el('span', { class: 'wk-label' }, label), el('span', { class: 'wk-val' }, value))
              : el('div', { class: `wk-note ${w.level}` }, value));
          }
        }
      }

      const g = info.guide;
      guidePill.style.display = g && !overlayOpen ? '' : 'none';
      if (g) {
        setText(guideLabel, g.label);
        setText(guideDist, g.dist < 1000 ? `${Math.round(g.dist)} m` : `${(g.dist / 1000).toFixed(1)} km`);
        guideArrow.style.transform = `rotate(${(g.bearing * 180) / Math.PI}deg)`;
      }

      surveyCard.style.display = surveying ? '' : 'none';
      if (surveying) {
        const s = info.survey;
        const cache = JSON.stringify(s);
        if (cache !== surveyCache) {
          surveyCache = cache;
          clear(surveyKey);
          surveyKey.append(kbd(s.key ?? k('survey')), ' Close');
          const surface = s.surface ?? {};
          const hardness = Number.isFinite(surface.resistance) ? ` · ${Math.round(surface.resistance)} kN` : '';
          setText(surveySurface, s.empty ? s.reason ?? 'Aim at the ground on your field'
            : `${surface.name ?? surface.id ?? 'Ground'}${surface.loose ? ' · loose' : ''}${hardness}`);
          surveyLayers.style.display = s.empty ? 'none' : '';
          surveyBed.style.display = s.empty ? 'none' : '';
          clear(surveyLayers);
          for (const layer of (s.layers ?? []).slice(0, 3)) {
            const depth = Math.max(0, layer.depth ?? 0);
            const bottom = depth + Math.max(0, layer.thickness ?? 0);
            const metres = (n) => n.toFixed(n < 1 ? 2 : 1);
            surveyLayers.append(el('div', { class: 'survey-layer' },
              el('span', {}, `${layer.name ?? layer.id}${{ compacted: ' (firm fill)', loose: ' (spoil)', fill: ' (fill)' }[layer.kind] ?? ''}`), el('b', {}, `${metres(depth)}–${metres(bottom)} m`)));
          }
          setText(surveyBed, Number.isFinite(s.bedrockDepth)
            ? `${s.bedrockName ?? 'Bedrock'} at ${s.bedrockDepth.toFixed(1)} m` : s.bedrockName ?? 'Bedrock below');
        }
      }

      const m = info.machine;
      machinePanel.style.display = m && !overlayOpen ? '' : 'none';
      if (!m) return;
      setText(mName, m.name);
      workStrip.style.display = m.type === 'barrow' ? 'none' : '';
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
      const status = m.broken ? 'Broken' : j ? 'Working' : engineStatus ?? (m.ticket ? 'Weighed in' : m.direct ? 'Direct' : m.aimReach != null ? 'Assisted' : 'Ready');
      setText(mStatus, status);
      mStatus.className = `md-status ${m.broken ? 'bad' : j ? 'busy' : engineStatus ? 'off' : ''}`;
      cond.fill.style.width = `${Math.round(m.condition)}%`;
      cond.fill.style.background = conditionColor(m.condition, m.broken);
      setText(cond.val, `${Math.round(m.condition)}%`);
      const digger = m.bucketVolume != null || m.bucketFill01 != null || m.aimReach != null;
      const capacity = (digger ? m.capacityVolume : null) ?? m.capacity ?? 0;
      const amount = (digger ? m.loadVolume ?? m.bucketVolume : m.load) ?? 0;
      setText(load.lab, digger ? 'Bucket' : 'Load');
      const volumeFill = !digger && m.capacityVolume > 0 ? (m.loadVolume ?? 0) / m.capacityVolume : 0;
      const fill01 = digger && Number.isFinite(m.bucketFill01) ? m.bucketFill01 : Math.max(volumeFill, capacity > 0 ? amount / capacity : 0);
      load.fill.style.width = `${Math.round(Math.max(0, Math.min(1, fill01)) * 100)}%`;
      const dp = capacity < 1 ? 2 : 1;
      load.node.style.display = capacity > 0 ? '' : 'none';
      setText(load.val, `${amount.toFixed(dp)}/${capacity.toFixed(dp)} ${digger ? 'm³' : 't'}`);

      workMaterial.style.display = m.material || m.attachment ? '' : 'none';
      setText(materialName, m.material?.name ?? m.material?.id ?? '');
      materialDot.style.display = m.material ? '' : 'none';
      const color = m.material?.color;
      materialDot.style.background = typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : color ?? '#d9b98a';
      setText(attachment, m.attachment ?? '');
      const hydraulic = Math.max(0, Math.min(1, m.hydraulicLoad ?? 0));
      const slip = Math.max(0, Math.min(1, m.slip ?? 0));
      const feedback = m.workFeedback;
      setText(workLabel, j?.label ?? feedback?.label ?? (m.broken ? 'Repair needed' : engineStatus ? 'Start the engine' : slip > .2 ? 'Losing traction' : digger ? 'Ready to dig' : 'Ready to drive'));
      workStrip.dataset.kind = feedback?.kind ?? (slip > .2 ? 'slip' : 'ready');
      workStrip.classList.toggle('strained', hydraulic > .85 || slip > .2 || ['blocked', 'warn'].includes(feedback?.kind));
      workEffort.style.display = digger && Number.isFinite(m.hydraulicLoad) ? '' : 'none';
      workFill.parentElement.style.display = workEffort.style.display;
      setText(workEffort, `Hydraulics ${Math.round(hydraulic * 100)}%`);
      workFill.style.width = `${Math.round(hydraulic * 100)}%`;
      const metrics = [];
      const resistance = m.resistance > 0 ? m.resistance : m.material?.resistance;
      if (digger && resistance > 0) metrics.push(`${Math.round(resistance)} kN resistance`);
      if (digger && Number.isFinite(m.cutDepth)) metrics.push(`${m.cutDepth.toFixed(2)} m cut`);
      if (!digger && m.towLimitTonnes > 0 && Number.isFinite(m.grossLoadTonnes)) metrics.push(`${m.grossLoadTonnes.toFixed(1)}/${m.towLimitTonnes.toFixed(1)} t tow`);
      if (m.road && m.cruiseActive) metrics.push(`Cruise ${Math.round(m.cruiseTargetKmh)} km/h${m.cruiseLimited ? ' · limited by grip / terrain' : ''}`);
      if (!digger && m.capacityVolume > 0) metrics.push(`${(m.loadVolume ?? 0).toFixed(1)}/${m.capacityVolume.toFixed(1)} m³ bed`);
      if (slip > .2) metrics.push(`${Math.round(slip * 100)}% wheel slip`);
      setText(workMetrics, metrics.join(' · '));
      workMetrics.style.display = metrics.length ? '' : 'none';
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
