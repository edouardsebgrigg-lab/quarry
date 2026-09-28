// Right-hand panel: your current job, action buttons, zone, piles and fleet.
import { el, clear, setText, progressBar } from '../dom.js';
import { tonnes, pct, conditionColor, money } from '../format.js';
import {
  getZoneInfo, getSiteData, facePileTotal, yardTotal,
} from '../../quarry/index.js';
import {
  machinesAt, machineName, jobProgress, JOBS, getStats,
} from '../../machinery/index.js';
import { currentPrice } from '../../economy/index.js';

function mixText(data, mix) {
  return Object.entries(mix)
    .sort((a, b) => b[1] - a[1])
    .map(([id, share]) => `${data.materials[id].name} ${pct(share)}`)
    .join(' · ');
}

// Site details for the map: zone, piles and fleet.
export function createSidebar({ game }) {
  const { data } = game;

  // --- zone & piles ---
  const zoneTitle = el('div', { class: 'row-title' });
  const zoneDepth = el('div', { class: 'muted' });
  const zoneMix = el('div', { class: 'small' });
  const zoneHard = el('div', { class: 'small' });
  const faceText = el('div', { class: 'row-between' });
  const faceBar = progressBar();
  const yardText = el('div', { class: 'row-between' });
  const yardBar = progressBar();
  const yardList = el('div', { class: 'yard-list' });

  // --- fleet ---
  const fleetList = el('div', { class: 'fleet' });
  let fleetRows = [];

  function buildFleet() {
    clear(fleetList);
    fleetRows = machinesAt(game.ctx, game.state.currentSiteId).map((m) => {
      const status = el('div', { class: 'small' });
      const cond = progressBar('bar-thin');
      const job = progressBar('bar-thin bar-job');
      const row = el('div', {
        class: 'fleet-row',
        onClick: () => game.actions.selectMachine(m.id),
      },
      el('div', { class: 'row-between' }, el('span', { class: 'fleet-name' }, machineName(data, m)), status),
      el('div', { class: 'fleet-bars' }, cond.node, job.node));
      fleetList.append(row);
      return { m, row, status, cond, job };
    });
  }

  const node = el('div', { class: 'sidebar' },
    el('section', { class: 'panel' },
      el('h3', {}, 'Digging zone'),
      zoneTitle, zoneDepth, zoneMix, zoneHard,
      el('div', { class: 'spacer' }),
      faceText, faceBar.node,
      el('div', { class: 'spacer' }),
      yardText, yardBar.node, yardList),
    el('section', { class: 'panel panel-grow' },
      el('h3', {}, 'Fleet'),
      fleetList),
  );

  buildFleet();
  const offs = ['machineBought', 'machineSold'].map((t) => game.events.on(t, buildFleet));

  return {
    node,
    destroy: () => offs.forEach((off) => off()),
    update() {
      const ctx = game.ctx;
      const siteId = game.state.currentSiteId;
      const site = game.state.sites[siteId];
      const siteData = getSiteData(data, siteId);

      // Zone
      const info = getZoneInfo(ctx, siteId, site.selectedZoneId);
      setText(zoneTitle, `Zone ${info.zoneId} — ${info.name}`);
      setText(zoneDepth, info.exhausted
        ? `Dug out at ${info.maxDepth} m`
        : `Depth ${info.depth.toFixed(1)} m of ${info.maxDepth} m · layer ${info.layerIndex + 1}/${info.layerCount}`);
      setText(zoneMix, info.exhausted ? '' : mixText(data, info.layer.mix));
      const best = Math.max(0, ...machinesAt(ctx, siteId)
        .filter((m) => m.type === 'excavator').map((m) => getStats(data, m).maxHardness));
      const tooHard = !info.exhausted && info.layer.hardness > best;
      setText(zoneHard, info.exhausted ? '' : `Hardness ${info.layer.hardness}${tooHard ? ' — too hard for your excavators!' : ''}`);
      zoneHard.classList.toggle('warn', tooHard);

      // Piles
      const face = facePileTotal(ctx, siteId);
      setText(faceText, `Face pile: ${tonnes(face)} / ${siteData.facePileCapacity} t`);
      faceBar.set(face / siteData.facePileCapacity, '#c9a86a');
      const yard = yardTotal(ctx, siteId);
      setText(yardText, `Yard: ${tonnes(yard)} / ${siteData.yardCapacity} t`);
      yardBar.set(yard / siteData.yardCapacity, yard / siteData.yardCapacity > 0.9 ? '#d9534f' : '#9a938a');
      const lines = Object.entries(site.yard)
        .filter(([, t]) => t >= 0.05)
        .map(([id, t]) => `${data.materials[id].name}: ${tonnes(t)} ≈ ${money(t * currentPrice(ctx, id))}`);
      const yardKey = lines.join('|');
      if (yardList.dataset.key !== yardKey) {
        yardList.dataset.key = yardKey;
        clear(yardList);
        for (const line of lines) yardList.append(el('div', { class: 'small muted' }, line));
      }

      // Fleet
      for (const r of fleetRows) {
        const { m } = r;
        r.row.classList.toggle('selected', game.state.player.selectedMachineId === m.id);
        r.row.classList.toggle('broken', m.broken);
        let status = `${Math.round(m.condition)}%`;
        if (m.broken) status = 'BROKEN';
        else if (m.job) status = `${JOBS[m.job.type].label}…`;
        setText(r.status, status);
        r.cond.set(m.condition / 100, conditionColor(m.condition, m.broken));
        r.job.set(m.job ? jobProgress(m.job) : 0, '#f2b632');
      }
    },
  };
}
