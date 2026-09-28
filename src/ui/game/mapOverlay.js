// Site map (Tab): the 2D top-down view plus site details, as an overlay.
import { el } from '../dom.js';
import { createSiteView } from './siteView.js';
import { createSidebar } from './sidebar.js';

export function toggleMap(overlays, { game, settings }) {
  let view = null;
  let sidebar = null;
  overlays.toggle({
    id: 'map',
    title: 'Site map',
    pauses: false,
    className: 'overlay-map',
    onClose: () => {
      view?.destroy();
      sidebar?.destroy();
    },
    build: ({ entry }) => {
      view = createSiteView({
        game,
        onSelectZone: (id) => game.actions.selectZone(id),
        onSelectMachine: (id) => game.actions.selectMachine(id),
      });
      sidebar = createSidebar({ game, settings });
      entry.update = (dt) => {
        view.update(dt);
        sidebar.update(dt);
      };
      return el('div', { class: 'map-layout' }, view.node, sidebar.node);
    },
  });
}
