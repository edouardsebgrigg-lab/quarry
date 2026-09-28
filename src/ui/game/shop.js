// Shop: buy machines, fit upgrades (mods), sell machines.
import { el, clear } from '../dom.js';
import { money, statValue } from '../format.js';
import { canAfford } from '../../economy/index.js';
import { getSiteData } from '../../quarry/index.js';
import {
  describeStats, getStats, tierName, machinesAt, machineName, isTierUnlocked,
  modsFor, resaleValue,
} from '../../machinery/index.js';

const TABS = [
  { id: 'machines', label: 'Machines' },
  { id: 'mods', label: 'Upgrades' },
  { id: 'sell', label: 'Sell machines' },
];

export function openShop(overlays, { game, feedback }) {
  const { data } = game;
  const ctx = game.ctx;
  let tab = 'machines';
  let buyButtons = [];
  let offs = [];

  overlays.toggle({
    id: 'shop',
    title: 'Shop',
    pauses: false,
    className: 'overlay-wide',
    onClose: () => offs.forEach((off) => off()),
    build: ({ entry }) => {
      const tabBar = el('div', { class: 'tabs seg' });
      const body = el('div', { class: 'shop-body' });
      const siteData = () => getSiteData(data, game.state.currentSiteId);

      const bestOfType = (type) => {
        const owned = machinesAt(ctx, game.state.currentSiteId).filter((m) => m.type === type);
        let best = null;
        for (const m of owned) {
          const lines = describeStats(type, getStats(data, m), siteData());
          if (!best || lines[0].value > best[0].value) best = lines;
        }
        return best;
      };

      // Price and a Buy button that says how much more you need when you can't afford it.
      const buyFoot = (price, onClick) => {
        const b = el('button', { class: 'btn btn-primary', onClick }, 'Buy');
        buyButtons.push({ b, price });
        return el('div', { class: 'card-foot' }, el('span', { class: 'price' }, money(price)), b);
      };
      const tierPill = (tier) => el('span', { class: `tier-pill ${tier}` }, tierName(data, tier));

      function renderMachines() {
        for (const [type, t] of Object.entries(data.machines.types)) {
          const best = bestOfType(type);
          const owned = machinesAt(ctx, game.state.currentSiteId).filter((m) => m.type === type).length;
          const row = el('div', { class: 'cards' });
          body.append(el('div', { class: 'shop-group' },
            el('div', { class: 'row-between' }, el('h3', {}, `${t.name}s`), el('span', { class: 'muted small' }, `You own ${owned}`)), row));
          for (const [tier, td] of Object.entries(t.tiers)) {
            const lines = describeStats(type, td, siteData());
            const unlocked = isTierUnlocked(ctx, type, tier);
            const ratio = best ? lines[0].value / best[0].value : null;
            row.append(el('div', { class: `card ${unlocked ? '' : 'locked'}` },
              el('div', { class: 'card-head' }, el('span', {}, t.name), tierPill(tier)),
              ratio && ratio > 1.05 ? el('div', { class: 'card-badge' }, `▲ ${ratio.toFixed(1)}× faster than yours`) : null,
              el('div', { class: 'stat-lines' }, lines.map((l) => el('div', { class: 'stat-line' },
                el('span', {}, l.label), el('b', {}, statValue(l))))),
              unlocked
                ? buyFoot(td.price, () => {
                  const r = game.actions.buyMachine(type, tier);
                  if (!r.ok) return feedback.message(r.reason, 'warn');
                  if (best && lines[0].value <= best[0].value) {
                    return feedback.message(`Bought a ${tierName(data, tier)} ${t.name}`);
                  }
                  feedback.upgradeCard({
                    title: `${tierName(data, tier)} ${t.name}`,
                    subtitle: best ? 'Compared with your best one' : null,
                    before: best,
                    after: lines,
                  });
                })
                : el('div', { class: 'card-foot muted small' }, 'Locked — needs research')));
          }
        }
      }

      function renderMods() {
        const machines = machinesAt(ctx, game.state.currentSiteId);
        for (const m of machines) {
          const row = el('div', { class: 'cards' });
          body.append(el('div', { class: 'shop-group' }, el('h3', {}, machineName(data, m)), row));
          for (const mod of modsFor(ctx, m)) {
            row.append(el('div', { class: `card ${mod.fitted ? 'fitted' : ''}` },
              el('div', { class: 'card-head' }, mod.name),
              el('div', { class: 'card-desc' }, mod.description),
              mod.fitted
                ? el('div', { class: 'card-foot' }, el('span', { class: 'card-badge' }, '✓ Fitted'))
                : buyFoot(mod.price, () => {
                  const before = describeStats(m.type, getStats(data, m), siteData());
                  const r = game.actions.buyMod(m.id, mod.id);
                  if (!r.ok) return feedback.message(r.reason, 'warn');
                  feedback.upgradeCard({
                    title: mod.name,
                    subtitle: machineName(data, m),
                    before,
                    after: describeStats(m.type, getStats(data, m), siteData()),
                  });
                })));
          }
        }
      }

      function renderSell() {
        const list = el('div', { class: 'sell-list' });
        for (const m of machinesAt(ctx, game.state.currentSiteId)) {
          const value = resaleValue(ctx, m);
          list.append(el('div', { class: 'sell-row' },
            el('span', {}, machineName(data, m)),
            el('span', { class: 'muted' }, m.broken ? 'Broken' : `Condition ${Math.round(m.condition)}%`),
            el('button', {
              class: 'btn',
              disabled: !!m.job,
              onClick: () => {
                const r = game.actions.sellMachine(m.id);
                if (!r.ok) feedback.message(r.reason, 'warn');
              },
            }, `Sell for ${money(value)}`)));
        }
        body.append(list, el('p', { class: 'foot-note' }, 'Machines sell for part of their price. Worn or broken ones are worth less.'));
      }

      function render() {
        buyButtons = [];
        clear(tabBar);
        for (const t of TABS) {
          tabBar.append(el('button', {
            class: tab === t.id ? 'active' : '',
            onClick: () => { tab = t.id; render(); },
          }, t.label));
        }
        clear(body);
        if (tab === 'machines') renderMachines();
        else if (tab === 'mods') renderMods();
        else renderSell();
        refreshButtons();
      }

      function refreshButtons() {
        for (const { b, price } of buyButtons) {
          const ok = canAfford(ctx, price);
          b.disabled = !ok;
          const label = ok ? 'Buy' : game.state.money < 0 ? 'In debt' : `Need ${money(price - game.state.money)}`;
          if (b.textContent !== label) b.textContent = label;
        }
      }

      offs = ['machineBought', 'machineSold', 'modBought', 'unlocksChanged']
        .map((t) => game.events.on(t, render));
      let acc = 0;
      entry.update = (dt) => {
        acc += dt;
        if (acc > 0.25) { acc = 0; refreshButtons(); }
      };
      render();
      return el('div', {}, tabBar, body);
    },
  });
}
