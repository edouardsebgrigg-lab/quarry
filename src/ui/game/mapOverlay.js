// The map (Tab): the countryside from above, with a panel listing your machines and how far
// things are.
import { ownsBuilding, stockpileLoad } from '../../buildings/index.js';
import { quoteDelivery } from '../../economy/index.js';
import { el, clear, setText } from '../dom.js';
import { createMapView } from './mapView.js';
import { machinesAt, machineName, isDigger } from '../../machinery/index.js';
import { pileTotal } from '../../quarry/index.js';
import { conditionColor } from '../format.js';
import { loadCarrier, combinationStats } from '../../machinery/trailers.js';

export function toggleMap(overlays, { game, world }) {
  if (!world) return;
  let view = null;
  overlays.toggle({
    id: 'map',
    title: 'Map',
    pauses: false,
    className: 'overlay-map',
    onClose: () => view?.destroy(),
    build: ({ entry }) => {
      view = createMapView({ world });
      const places = el('div', { class: 'map-places' });
      const fleet = el('div', { class: 'fleet' });
      const stores = el('div', { class: 'map-stores' });
      const map = world.plan.map;
      const spots = [
        ['Your yard', (map.home.yard.x0 + map.home.yard.x1) / 2, (map.home.yard.z0 + map.home.yard.z1) / 2],
        [map.village.name, 622, -480],
        [map.dealer.name, map.dealer.door.x, map.dealer.door.z],
        [map.depot.name, (map.depot.weighbridge.x0 + map.depot.weighbridge.x1) / 2, map.depot.weighbridge.z1],
      ];
      const rows = spots.map(([name]) => {
        const d = el('span', { class: 'muted' });
        places.append(el('div', { class: 'row-between' }, el('span', {}, name), d));
        return d;
      });
      let acc = 1;
      entry.update = (dt) => {
        view.update(dt);
        acc += dt;
        if (acc < 0.3) return;
        acc = 0;
        const you = world.mapInfo().you;
        spots.forEach(([, x, z], i) => {
          const m = Math.hypot(x - you.x, z - you.z);
          setText(rows[i], m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
        });
        clear(stores);
        if (ownsBuilding(game.ctx, 'stockpiles')) for (const b of game.data.buildings.stockpiles.bays) {
          const load = stockpileLoad(game.ctx, b.id), total = pileTotal(load);
          const main = Object.entries(load).sort((a,b)=>b[1]-a[1])[0]?.[0];
          const q = main ? quoteDelivery(game.ctx, main, load) : null;
          stores.append(el('div', {class:'small'}, `${b.name}: ${total.toFixed(1)} / ${b.capacity} t`,
            el('div',{class:'muted'}, main ? `${q.grade} · ${Object.entries(load).map(([id,t]) => `${game.data.materials[id]?.name ?? id} ${t.toFixed(1)} t`).join(', ')}` : 'Empty')));
        }
        clear(fleet);
        for (const m of machinesAt(game.ctx, game.state.currentSiteId)) {
          const cap = isDigger(game.data, m.type) ? null : combinationStats(game.ctx,m).capacity;
          const load = pileTotal(loadCarrier(game.ctx,m)?.load ?? {});
          fleet.append(el('div', { class: 'fleet-row' },
            el('div', { class: 'row-between' },
              el('button', { class: 'btn btn-ghost fleet-name',disabled:m.away || m.onHire,title:'Select and mark the route to this machine',onClick:()=>game.actions.navigateFleet(m.id) },
                `${game.state.player.navigationMachineId === m.id ? '→ ' : ''}${machineName(game.data, m)}`),
              el('span', { class: 'small', style: { color: conditionColor(m.condition, m.broken) } }, m.broken ? 'Broken' : `${Math.round(m.condition)}%`)),
            cap ? el('div', { class: 'small muted' }, load > 0.01 ? `${load.toFixed(2)} of ${cap} t on board` : 'Empty') : null));
        }
      };
      // (the map takes the focus when it opens, not the first button beside it)
      view.node.classList.add('map-focus');
      view.node.tabIndex = -1;
      view.node.setAttribute('autofocus', '');
      return el('div', { class: 'map-layout' }, view.node,
        el('div', { class: 'sidebar' },
          el('section', { class: 'panel' }, el('h3', {}, 'Places'), places),
          el('section', { class: 'panel' }, el('h3', {}, 'Your machines'), el('p',{class:'small muted'},'Click a machine to select it and follow its marker.'),
            el('button',{class:'btn btn-small',onClick:()=>game.actions.navigateFleet(null)},'Follow the current goal'),fleet),
          el('section', { class: 'panel' }, el('h3', {}, 'Stockpile bays'), stores),
          el('section', { class: 'panel' }, el('h3', {}, 'Key'),
            el('div', { class: 'small muted map-key' },
              el('span', { class: 'key-you' }, '▶ you'), el('span', { class: 'key-pickup' }, '● pickup'),
              el('span', { class: 'key-truck' }, '● truck'), el('span', { class: 'key-tractor' }, '● tractor'),
              el('span', { class: 'key-excavator' }, '● diggers, dumper'),
              el('span', { class: 'key-barrow' }, '■ wheelbarrow')))));
    },
  });
}
