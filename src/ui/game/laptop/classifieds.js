// Wolds Trader: the local classifieds for second-hand plant. Each advert has a photo, the
// seller's word on its condition (not always true), the price against the dealer's, and two
// buttons: have a mechanic look it over first, or buy it as seen.
import { el } from '../../dom.js';
import { money } from '../../format.js';
import { getDate } from '../../../core/index.js';
import { typeName, tierName } from '../../../machinery/index.js';
import { classifiedsState, listingCondition, dealerPriceFor } from '../../../classifieds/index.js';
import { lineIcon } from './icons.js';

export function classifiedsApp({ game, feedback, photos, openApp, setHead }) {
  const { data } = game;
  const ctx = game.ctx;
  const cfg = data.classifieds;
  setHead(cfg.name, 'Second-hand plant from local sellers: cheaper than the dealer, sold as seen');
  const pending = [];
  const grid = el('div', { class: 'lt-grid lt-ads' });
  const buttons = [];

  function photo(type, tier) {
    const img = el('img', { class: 'lt-photo-img', alt: '' });
    const box = el('div', { class: 'lt-photo' }, lineIcon(data.machines.types[type]?.kind === 'digger' ? 'digger' : 'truck', 'lt-photo-ph'), img);
    pending.push([img, box, type, tier]);
    return box;
  }

  function render() {
    grid.replaceChildren();
    buttons.length = 0;
    const s = classifiedsState(ctx);
    const day = getDate(game.state, data).day;
    if (!s.listings.length) {
      grid.append(el('div', { class: 'lt-empty' }, game.state.machines.length < cfg.fromMachines
        ? 'Adverts for second-hand plant go up once you’re in the trade: buy your first machine from the dealer.'
        : 'Nothing for sale today. New adverts go up most mornings.'));
      return;
    }
    for (const l of s.listings) {
      const cond = listingCondition(l);
      const dealer = dealerPriceFor(ctx, l);
      const td = data.machines.types[l.type].tiers[l.tier];
      const verdict = !l.inspected ? el('span', { class: 'lt-ad-claim' }, 'Seller says')
        : l.actual < l.claimed ? el('span', { class: 'lt-ad-claim bad' }, `Looked over · seller said ${l.claimed}%`)
          : el('span', { class: 'lt-ad-claim good' }, 'Looked over: as described');
      const look = el('button', { class: 'btn lt-buy', disabled: l.inspected, onClick: () => {
        const r = game.actions.inspectListing(l.id);
        feedback.message(r.ok ? (r.honest ? `The mechanic says it’s as described: ${r.actual}%` : `The mechanic says it’s really ${r.actual}%, not ${l.claimed}%`) : r.reason, r.ok && r.honest ? 'good' : 'warn');
        render();
      } }, l.inspected ? 'Looked over' : `Look it over · ${money(cfg.inspectionFee)}`);
      const buy = el('button', { class: 'btn btn-primary lt-buy', onClick: () => {
        const r = game.actions.buyListing(l.id);
        feedback.message(r.ok ? `${tierName(data, l.tier)} ${typeName(data, l.type)} bought from ${l.seller}: it’s on its way to your yard` : r.reason, r.ok ? 'good' : 'warn');
        if (r.ok) openApp('classifieds');
      } }, `Buy · ${money(l.price)}`);
      buttons.push({ b: buy, price: l.price });
      grid.append(el('div', { class: 'lt-tile lt-ad' },
        photo(l.type, l.tier),
        el('div', { class: 'lt-tile-body' },
          el('div', { class: 'lt-tile-title' }, el('span', {}, td.modelName ?? typeName(data, l.type)), td.modelName ? null : el('span', { class: `tier-pill ${l.tier}` }, tierName(data, l.tier))),
          el('div', { class: 'lt-ad-seller' }, `${l.seller} · ${l.expires <= day ? 'last day' : `until day ${l.expires}`}`),
          el('div', { class: 'lt-ad-note' }, `“${l.note}”`),
          el('div', { class: 'lt-ad-cond' }, verdict, el('b', {}, `${cond}%`)),
          // (the colour scale spans the whole bar, however full it is)
          el('div', { class: 'lt-cond' }, el('i', { style: { width: `${cond}%`, backgroundSize: `${(100 / Math.max(1, cond)) * 100}% 100%` } })),
          el('div', { class: 'lt-tile-foot' },
            el('span', { class: 'lt-price' }, money(l.price)),
            el('span', { class: 'lt-ad-dealer' }, `Dealer ${money(dealer)} at ${td.startCondition}%`)),
          el('div', { class: 'lt-ad-actions' }, look, buy))));
    }
    refresh();
  }

  function refresh() {
    for (const { b, price } of buttons) b.disabled = game.state.money < price;
  }

  render();
  return {
    node: el('div', { class: 'lt-home' }, grid,
      el('p', { class: 'lt-note' }, `Private sales are sold as seen: the condition is the seller’s word until a mechanic has looked it over (${money(cfg.inspectionFee)}). Bought machines are delivered to your yard the same day.`)),
    headSet: true,
    refresh,
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
  };
}
