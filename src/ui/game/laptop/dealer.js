// The plant dealer: buy machines (with pictures of the real models and specs set against what
// you already own), fit upgrades, commission yard buildings, and sell machines on.
import { el, clear } from '../../dom.js';
import { money, statValue } from '../../format.js';
import { canAfford } from '../../../economy/index.js';
import { ownsBuilding } from '../../../buildings/index.js';
import {
  describeStats, getStats, tierName, machinesAt, machineName, isTierUnlocked, modsFor, resaleValue, machinePrice,
} from '../../../machinery/index.js';
import { dealerOffer } from '../../../happenings/index.js';
import { lineIcon } from './icons.js';
import { dealerPrice } from '../../../career/index.js';

const CATEGORIES = [
  { id: 'diggers', label: 'Diggers', icon: 'digger' },
  { id: 'carriers', label: 'Carriers', icon: 'truck' },
  { id: 'upgrades', label: 'Upgrades', icon: 'wrench' },
  { id: 'yard', label: 'Yard buildings', icon: 'building' },
  { id: 'sell', label: 'Sell', icon: 'tag' },
];

export function dealerApp({ game, feedback, photos, setHead }) {
  // What you pay here (a trade account, from a milestone, takes a little off the list price).
  const pay = (list) => dealerPrice(game.ctx, list);
  // An offer on this machine this week? { discount, until } or null.
  const offerOn = (type, tier) => { const o = dealerOffer(game.ctx); return o && o.type === type && o.tier === tier ? o : null; };
  const { data } = game;
  const ctx = game.ctx;
  let cat = 'diggers';
  let detail = null; // { type, tier } when looking at one machine
  let buyButtons = [];
  const pending = []; // [img, type, tier]: photos still to take
  const body = el('div', { class: 'lt-dealer' });
  const catBar = el('div', { class: 'lt-cats' });

  const owned = () => machinesAt(ctx, game.state.currentSiteId);
  const typesOfKind = (kind) => Object.entries(data.machines.types).filter(([, t]) => t.shop !== false && t.kind === kind);
  const bestOfType = (type) => {
    let best = null;
    for (const m of owned().filter((x) => x.type === type)) {
      const lines = describeStats(data, type, getStats(data, m));
      if (!best || lines[0].value > best[0].value) best = lines;
    }
    return best;
  };
  const tierPill = (tier) => el('span', { class: `tier-pill ${tier}` }, tierName(data, tier));

  function photo(type, tier, cls) {
    const img = el('img', { class: `lt-photo-img ${cls ?? ''}`, alt: '' });
    const box = el('div', { class: `lt-photo ${cls ?? ''}` }, lineIcon(data.machines.types[type]?.kind === 'digger' ? 'digger' : 'truck', 'lt-photo-ph'), img);
    pending.push([img, box, type, tier]);
    return box;
  }

  // Buy button: says how much more you need when you can't afford it.
  function buyButton(price, onClick, label = 'Buy') {
    const b = el('button', { class: 'btn btn-primary lt-buy', onClick }, label);
    buyButtons.push({ b, price, label });
    return b;
  }
  function refreshButtons() {
    for (const { b, price, label } of buyButtons) {
      const ok = canAfford(ctx, price);
      b.disabled = !ok;
      const text = ok ? label : game.state.money < 0 ? 'Overdrawn' : `Need ${money(price - game.state.money)} more`;
      if (b.textContent !== text) b.textContent = text;
    }
  }

  function buyMachine(type, tier) {
    const t = data.machines.types[type];
    const td = t.tiers[tier];
    const best = bestOfType(type);
    const lines = describeStats(data, type, td);
    const r = game.actions.buyMachine(type, tier);
    if (!r.ok) return feedback.message(r.reason, 'warn');
    if (best && lines[0].value <= best[0].value) return feedback.message(`Bought a ${tierName(data, tier)} ${t.name}. It's waiting in the yard`, 'good');
    feedback.upgradeCard({ title: `${tierName(data, tier)} ${t.name}`, subtitle: best ? 'Compared with your best one' : 'Waiting in the yard', before: best, after: lines });
  }

  // ---- machine grid
  function renderGrid(kind) {
    const grid = el('div', { class: 'lt-grid' });
    for (const [type, t] of typesOfKind(kind)) {
      for (const [tier, td] of Object.entries(t.tiers)) {
        const count = owned().filter((m) => m.type === type && m.tier === tier).length;
        const lines = describeStats(data, type, td);
        const unlocked = isTierUnlocked(ctx, type, tier);
        grid.append(el('button', { class: `lt-tile ${unlocked ? '' : 'locked'}`, onClick: () => { detail = { type, tier }; render(); } },
          photo(type, tier),
          el('div', { class: 'lt-tile-body' },
            el('div', { class: 'lt-tile-title' }, el('span', {}, t.name), offerOn(type, tier) ? el('span', { class: 'lt-offer' }, `−${Math.round(offerOn(type, tier).discount * 100)}%`) : null, tierPill(tier)),
            el('div', { class: 'lt-tile-specs' }, lines.slice(0, 2).map((l) => `${l.label} ${statValue(l)}`).join('  ·  ')),
            el('div', { class: 'lt-tile-foot' },
              el('span', { class: 'lt-price' }, unlocked ? money(machinePrice(ctx, type, tier)) : 'Locked'),
              count ? el('span', { class: 'lt-owned' }, `You own ${count}`) : null))));
      }
    }
    body.append(grid);
  }

  // ---- one machine, in detail
  function renderDetail({ type, tier }) {
    const t = data.machines.types[type];
    const td = t.tiers[tier];
    const lines = describeStats(data, type, td);
    const best = bestOfType(type);
    const unlocked = isTierUnlocked(ctx, type, tier);
    const specRows = lines.map((l, i) => {
      const mine = best?.[i];
      let cmp = null;
      if (mine) {
        const better = l.better === 'lower' ? l.value < mine.value - 1e-9 : l.value > mine.value + 1e-9;
        const worse = l.better === 'lower' ? l.value > mine.value + 1e-9 : l.value < mine.value - 1e-9;
        cmp = el('span', { class: `lt-cmp ${better ? 'up' : worse ? 'down' : ''}` }, `yours ${statValue(mine)}`);
      }
      return el('div', { class: 'lt-spec' }, el('span', { class: 'lt-spec-label' }, l.label), el('span', { class: 'lt-spec-val' }, statValue(l)), cmp);
    });
    const facts = [
      ['Condition on delivery', `${Math.round(td.startCondition ?? 100)}%`],
      td.enginePower ? ['Engine', `${Math.round(td.enginePower)} kW`] : null,
      td.mass ? ['Operating weight', `${(td.mass / 1000).toFixed(1)} t`] : null,
      ['On the road', t.roadLegal ? 'Road legal' : 'Site only (stays on your land)'],
      ['Insurance', `${money(td.price * data.economy.insurance.weeklyRate)} a week`],
    ].filter(Boolean);
    body.append(el('div', { class: 'lt-detail' },
      el('button', { class: 'lt-back', onClick: () => { detail = null; render(); } }, lineIcon('back'), 'All machines'),
      el('div', { class: 'lt-detail-grid' },
        photo(type, tier, 'big'),
        el('div', { class: 'lt-detail-info' },
          el('div', { class: 'lt-detail-title' }, el('h3', {}, t.name), tierPill(tier)),
          t.blurb ? el('p', { class: 'lt-blurb' }, t.blurb) : null,
          el('div', { class: 'lt-buy-row' },
            el('div', {}, el('div', { class: 'lt-buy-label' }, !unlocked ? 'Not available yet'
              : offerOn(type, tier) ? `Offer until day ${offerOn(type, tier).until} (list ${money(td.price)})`
                : machinePrice(ctx, type, tier) < td.price ? `Trade price (list ${money(td.price)})` : 'Price, delivered'),
            el('div', { class: 'lt-buy-price' }, money(machinePrice(ctx, type, tier)))),
            unlocked ? buyButton(machinePrice(ctx, type, tier), () => buyMachine(type, tier)) : el('span', { class: 'muted small' }, 'Needs research')),
          el('div', { class: 'lt-specs' }, specRows),
          el('div', { class: 'lt-facts' }, facts.map(([k, v]) => el('div', {}, el('span', {}, k), el('b', {}, v))))))));
  }

  // ---- upgrades for the machines you own
  function renderUpgrades() {
    const ms = owned().filter((m) => modsFor(ctx, m).length);
    if (!ms.length) body.append(el('div', { class: 'lt-empty' }, 'Buy a machine first: upgrades are fitted to machines you own.'));
    for (const m of ms) {
      const rows = modsFor(ctx, m).map((mod) => el('div', { class: `lt-row ${mod.fitted ? 'done' : ''}` },
        el('div', { class: 'lt-row-main' }, el('b', {}, mod.name), el('span', {}, mod.description)),
        mod.fitted
          ? el('span', { class: 'lt-fitted' }, lineIcon('check'), 'Fitted')
          : el('div', { class: 'lt-row-buy' }, el('span', { class: 'lt-price' }, money(pay(mod.price))), buyButton(pay(mod.price), () => {
            const before = describeStats(data, m.type, getStats(data, m));
            const r = game.actions.buyMod(m.id, mod.id);
            if (!r.ok) return feedback.message(r.reason, 'warn');
            feedback.upgradeCard({ title: mod.name, subtitle: machineName(data, m), before, after: describeStats(data, m.type, getStats(data, m)) });
          }, 'Fit'))));
      body.append(el('div', { class: 'lt-group' },
        el('div', { class: 'lt-group-head' }, photo(m.type, m.tier, 'mini'), el('b', {}, machineName(data, m)),
          el('span', { class: 'muted small' }, m.broken ? 'Broken' : `Condition ${Math.round(m.condition)}%`)),
        el('div', { class: 'lt-rows' }, rows)));
    }
  }

  // ---- yard buildings (whatever data/buildings.json lists)
  function renderYard() {
    const rows = Object.entries(data.buildings).map(([id, cfg]) => el('div', { class: `lt-row ${ownsBuilding(ctx, id) ? 'done' : ''}` },
      el('div', { class: 'lt-row-main' }, el('b', {}, cfg.name), el('span', {}, cfg.description)),
      ownsBuilding(ctx, id)
        ? el('span', { class: 'lt-fitted' }, lineIcon('check'), 'In use')
        : el('div', { class: 'lt-row-buy' }, el('span', { class: 'lt-price' }, money(pay(cfg.price))), buyButton(pay(cfg.price), () => {
          const r = game.actions.buyBuilding(id);
          feedback.message(r.ok ? `${cfg.name}: done` : r.reason, r.ok ? 'good' : 'warn');
        }))));
    body.append(el('div', { class: 'lt-rows' }, rows));
  }

  // ---- sell: two clicks, so a machine isn't sold by accident
  function renderSell() {
    const ms = owned();
    if (!ms.length) body.append(el('div', { class: 'lt-empty' }, 'Nothing to sell yet.'));
    const rows = ms.map((m) => {
      const value = resaleValue(ctx, m);
      let armed = false;
      const b = el('button', {
        class: 'btn',
        disabled: !!m.job,
        onClick: () => {
          if (!armed) {
            armed = true;
            b.textContent = `Confirm: sell for ${money(value)}`;
            b.classList.add('btn-danger');
            return;
          }
          const r = game.actions.sellMachine(m.id);
          if (!r.ok) feedback.message(r.reason, 'warn');
        },
      }, `Sell for ${money(value)}`);
      return el('div', { class: 'lt-row' },
        photo(m.type, m.tier, 'mini'),
        el('div', { class: 'lt-row-main' }, el('b', {}, machineName(data, m)),
          el('span', {}, m.broken ? 'Broken down' : m.job ? 'Busy' : `Condition ${Math.round(m.condition)}%`)),
        el('div', { class: 'lt-cond' }, el('i', { style: { width: `${Math.round(m.condition)}%` } })),
        b);
    });
    body.append(el('div', { class: 'lt-rows' }, rows),
      el('p', { class: 'lt-note' }, 'The dealer pays part of a machine’s price, less for worn or broken ones.'));
  }

  function render() {
    buyButtons = [];
    pending.length = 0;
    clear(catBar);
    for (const c of CATEGORIES) {
      catBar.append(el('button', { class: `lt-cat ${cat === c.id ? 'active' : ''}`, onClick: () => { cat = c.id; detail = null; render(); } },
        lineIcon(c.icon), c.label));
    }
    clear(body);
    if (detail) renderDetail(detail);
    else if (cat === 'diggers') renderGrid('digger');
    else if (cat === 'carriers') renderGrid('carrier');
    else if (cat === 'upgrades') renderUpgrades();
    else if (cat === 'yard') renderYard();
    else renderSell();
    refreshButtons();
  }

  const offs = ['machineBought', 'machineSold', 'modBought', 'buildingBought', 'unlocksChanged'].map((t) => game.events.on(t, render));
  setHead('Ashby Plant', 'Machines, upgrades and yard buildings, delivered to your yard');
  render();

  return {
    node: el('div', {}, catBar, body),
    headSet: true,
    refresh: refreshButtons,
    // Take one product photo per frame, so opening the dealer never stalls.
    update() {
      const job = pending.shift();
      if (!job) return;
      const [img, box, type, tier] = job;
      const url = photos?.photo(type, tier);
      if (url) {
        img.src = url;
        box.classList.add('has-photo');
      }
    },
    dispose: () => offs.forEach((off) => off()),
  };
}
