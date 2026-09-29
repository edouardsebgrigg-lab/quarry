// The map (Tab): the countryside from above, with a panel listing your machines and how far
// things are.
import { el, clear, setText } from '../dom.js';
import { createMapView } from './mapView.js';
import { machinesAt, machineName, getStats, isDigger } from '../../machinery/index.js';
import { pileTotal } from '../../quarry/index.js';
import { conditionColor } from '../format.js';

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
        clear(fleet);
        for (const m of machinesAt(game.ctx, game.state.currentSiteId)) {
          const cap = isDigger(game.data, m.type) ? null : getStats(game.data, m).capacity;
          const load = pileTotal(m.load);
          fleet.append(el('div', { class: 'fleet-row' },
            el('div', { class: 'row-between' },
              el('span', { class: 'fleet-name' }, machineName(game.data, m)),
              el('span', { class: 'small', style: { color: conditionColor(m.condition, m.broken) } }, m.broken ? 'Broken' : `${Math.round(m.condition)}%`)),
            cap ? el('div', { class: 'small muted' }, load > 0.01 ? `${load.toFixed(2)} of ${cap} t on board` : 'Empty') : null));
        }
      };
      return el('div', { class: 'map-layout' }, view.node,
        el('div', { class: 'sidebar' },
          el('section', { class: 'panel' }, el('h3', {}, 'Places'), places),
          el('section', { class: 'panel' }, el('h3', {}, 'Your machines'), fleet),
          el('section', { class: 'panel' }, el('h3', {}, 'Key'),
            el('div', { class: 'small muted map-key' },
              el('span', { class: 'key-you' }, '▶ you'), el('span', { class: 'key-pickup' }, '● pickup'),
              el('span', { class: 'key-truck' }, '● truck'), el('span', { class: 'key-tractor' }, '● tractor'),
              el('span', { class: 'key-excavator' }, '● diggers, dumper'),
              el('span', { class: 'key-barrow' }, '■ wheelbarrow')))));
    },
  });
}
