// The office laptop: a small desktop with apps. B opens the plant dealer, M the depot's prices,
// and the laptop in your office opens the home screen. Opening an app while the laptop is open
// switches to it; opening the one that's showing closes the laptop.
import { el, clear, setText, kbd } from '../../dom.js';
import { money } from '../../format.js';
import { getDate } from '../../../core/index.js';
import { lineIcon } from './icons.js';
import { unreadMessages } from '../../../game/logbook.js';
import { contractsState } from '../../../contracts/index.js';
import { hireState } from '../../../hire/index.js';
import { homeApp } from './home.js';
import { dealerApp } from './dealer.js';
import { classifiedsApp } from './classifieds.js';
import { staffApp } from './staff.js';
import { staffState, openSlots } from '../../../staff/index.js';
import { classifiedsState } from '../../../classifieds/index.js';
import { pricesApp } from './prices.js';
import { bankApp } from './bank.js';
import { fleetApp } from './fleet.js';
import { messagesApp } from './messages.js';
import { jobsApp } from './jobs.js';
import { milestonesApp } from './milestones.js';
import { operationsApp } from './operations.js';
import { tradeApp } from './trade.js';
import { unseenMilestones, markMilestonesSeen } from '../../../career/index.js';

const APPS = [
  { id: 'home', label: 'Home', icon: 'home', make: homeApp },
  { id: 'operations', label: 'Quarry operations', icon: 'building', make: operationsApp },
  { id: 'trade', label: 'Regional trade', icon: 'chart', make: tradeApp },
  { id: 'dealer', label: 'Plant dealer', icon: 'digger', make: dealerApp },
  { id: 'classifieds', label: 'Wolds Trader', icon: 'tag', make: classifiedsApp },
  { id: 'jobs', label: 'Jobs board', icon: 'clipboard', make: jobsApp },
  { id: 'milestones', label: 'Milestones', icon: 'trophy', make: milestonesApp },
  { id: 'prices', label: 'Depot prices', icon: 'chart', make: pricesApp },
  { id: 'fleet', label: 'Fleet', icon: 'truck', make: fleetApp },
  { id: 'staff', label: 'Staff', icon: 'people', make: staffApp },
  { id: 'bank', label: 'Bank', icon: 'bank', make: bankApp },
  { id: 'messages', label: 'Messages', icon: 'mail', make: messagesApp },
];

let openLaptopState = null; // { show(appId), current() } while the laptop is open

export function openLaptop(overlays, { game, feedback, world, app = 'home' }) {
  if (openLaptopState) {
    if (openLaptopState.current() === app) overlays.close('laptop');
    else openLaptopState.show(app);
    return;
  }
  const photos = world?.createProductPhotos?.() ?? null;
  let active = null; // { id, instance }
  const movedFeedback = [];

  overlays.open({
    id: 'laptop',
    pauses: false,
    className: 'overlay-laptop',
    onClose: () => {
      active?.instance.dispose?.();
      photos?.dispose();
      for (const [node, parent, next] of [...movedFeedback].reverse()) parent.insertBefore(node, next?.parentNode === parent ? next : null);
      openLaptopState = null;
    },
    build: ({ close, entry }) => {
      const dock = el('nav', { class: 'lt-dock', 'aria-label': 'Office apps' });
      const head = el('div', { class: 'lt-app-head' });
      const body = el('div', { class: 'lt-app-body' });
      const clock = el('span', { class: 'lt-clock' });
      const balance = el('span', { class: 'lt-balance' });
      const notices = el('div', { class: 'lt-notices', 'aria-live': 'polite' });
      for (const node of document.querySelectorAll('.feedback > .toasts, .feedback > .log')) {
        movedFeedback.push([node, node.parentNode, node.nextSibling]);
        notices.append(node);
      }

      const buttons = new Map();
      const badges = new Map();
      for (const a of APPS) {
        const badge = el('i', { class: 'lt-badge' });
        badges.set(a.id, badge);
        const b = el('button', { class: 'lt-dock-app', title: a.label, 'aria-label': a.label, onClick: () => show(a.id) }, lineIcon(a.icon), el('span', {}, a.label), badge);
        buttons.set(a.id, b);
        dock.append(b);
      }

      function show(id) {
        const a = APPS.find((x) => x.id === id) ?? APPS[0];
        active?.instance.dispose?.();
        const instance = a.make({ game, feedback, photos, world, openApp: show, setHead });
        active = { id: a.id, instance };
        for (const [bid, b] of buttons) {
          b.classList.toggle('active', bid === a.id);
          b.setAttribute('aria-current', bid === a.id ? 'page' : 'false');
          b.autofocus = bid === a.id; // (the laptop opens with the current app focused)
        }
        clear(body);
        body.append(instance.node);
        body.scrollTop = 0;
        if (!instance.headSet) setHead(a.label);
      }

      // The app's title bar: a title, a line under it, and optional actions on the right.
      function setHead(title, sub = null, actions = []) {
        clear(head);
        head.append(el('div', {}, el('h2', { class: 'lt-title' }, title), sub ? el('div', { class: 'lt-sub' }, sub) : null),
          el('div', { class: 'lt-head-actions' }, actions));
      }

      function tick() {
        const d = getDate(game.state, game.data);
        setText(clock, `Day ${d.day}  ${String(d.hour).padStart(2, '0')}:${String(d.minute).padStart(2, '0')}`);
        setText(balance, money(game.state.money));
        // Badges: unread messages, and new offers on the jobs board when you have room for one.
        const unread = active?.id === 'messages' ? 0 : unreadMessages(game.ctx);
        const c = contractsState(game.ctx);
        const offers = c.active.length < game.data.contracts.maxActive ? c.offers.length : 0;
        if (active?.id === 'milestones') markMilestonesSeen(game.ctx);
        const reached = unseenMilestones(game.ctx);
        const hireAsk = hireState(game.ctx).enquiry ? 1 : 0; // (a contractor wants to hire a machine)
        const newAds = active?.id === 'classifieds' ? 0 : classifiedsState(game.ctx).listings.filter((l) => l.listed === d.day).length; // (today's adverts)
        const st = staffState(game.ctx);
        const freePosts = active?.id === 'staff' ? 0 : Math.max(0, openSlots(game.ctx) - st.workers.length); // (a post to fill)
        for (const [id, n] of [['messages', unread], ['jobs', offers], ['milestones', reached], ['fleet', hireAsk], ['classifieds', newAds], ['staff', freePosts]]) {
          const bdg = badges.get(id);
          setText(bdg, n ? String(n) : '');
          bdg.style.display = n ? '' : 'none';
        }
        balance.classList.toggle('neg', game.state.money < 0);
      }

      let acc = 0;
      entry.update = (dt) => {
        active?.instance.update?.(dt);
        acc += dt;
        if (acc > 0.25) {
          acc = 0;
          tick();
          active?.instance.refresh?.();
        }
      };
      openLaptopState = { show, current: () => active?.id };
      show(app);
      tick();

      return el('div', { class: 'laptop' },
        el('div', { class: 'lt-screen' },
          el('div', { class: 'lt-side' }, el('div', { class: 'lt-brand' }, el('b', {}, game.actions.companyName()), el('span', {}, 'Office')), dock),
          el('section', { class: 'lt-main' }, head, body),
          notices,
          el('footer', { class: 'lt-bar' },
            el('span', { class: 'lt-status' }, el('i', { class: 'lt-dot' }), 'Online'),
            clock,
            el('span', { class: 'lt-bar-right' }, el('span', { class: 'lt-bal-label' }, 'Balance'), balance,
              el('button', { class: 'lt-close', onClick: close, title: 'Close (Esc)' }, kbd('Esc'), 'Close')))),
      );
    },
  });
}
