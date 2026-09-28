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
      const tabBar = el('div', { class: 'tabs' });
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

      const buyBtn = (price, onClick) => {
        const b = el('button', { class: 'btn btn-primary', onClick }, `Buy ${money(price)}`);
        buyButtons.push({ b, price });
        return b;
      };

      function renderMachines() {
        for (const [type, t] of Object.entries(data.machines.types)) {
          body.append(el('h3', {}, t.name));
          const best = bestOfType(type);
          const row = el('div', { class: 'cards' });
          for (const [tier, td] of Object.entries(t.tiers)) {
            const lines = describeStats(type, td, siteData());
            const unlocked = isTierUnlocked(ctx, type, tier);
            const ratio = best ? lines[0].value / best[0].value : null;
            row.append(el('div', { class: `card ${unlocked ? '' : 'locked'}` },
              el('div', { class: 'card-head' }, `${tierName(data, tier)} ${t.name}`),
              ratio && ratio > 1.05 ? el('div', { class: 'card-badge' }, `×${ratio.toFixed(1)} your best`) : null,
              el('div', { class: 'stat-lines' }, lines.map((l) => el('div', { class: 'stat-line' },
                el('span', {}, l.label), el('b', {}, statValue(l))))),
              unlocked
                ? buyBtn(td.price, () => {
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
                : el('div', { class: 'muted small' }, 'Locked — needs research')));
          }
          body.append(row);
        }
      }

      function renderMods() {
        const machines = machinesAt(ctx, game.state.currentSiteId);
        for (const m of machines) {
          body.append(el('h3', {}, machineName(data, m)));
          const row = el('div', { class: 'cards' });
          for (const mod of modsFor(ctx, m)) {
            row.append(el('div', { class: `card ${mod.fitted ? 'fitted' : ''}` },
              el('div', { class: 'card-head' }, mod.name),
              el('div', { class: 'small' }, mod.description),
              mod.fitted
                ? el('div', { class: 'muted small' }, '✔ Fitted')
                : buyBtn(mod.price, () => {
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
          body.append(row);
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
        body.append(el('p', { class: 'muted small' }, 'Old machines sell for part of their price. Worn or broken ones are worth less.'), list);
      }

      function render() {
        buyButtons = [];
        clear(tabBar);
        for (const t of TABS) {
          tabBar.append(el('button', {
            class: `tab ${tab === t.id ? 'active' : ''}`,
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
        for (const { b, price } of buyButtons) b.disabled = !canAfford(ctx, price);
      }

      offs = ['machineBought', 'machineSold', 'modBought', 'unlocksChanged']
        .map((t) => game.events.on(t, render));
      let acc = 0;
      entry.update = (dt) => {
        acc += dt;
        if (acc > 0.25) { acc = 0; refreshButtons(); }
      };
      render();
      return el('div', {}, tabBar, body, el('div', { class: 'muted small' }, 'Esc or click outside to close'));
    },
  });
}
