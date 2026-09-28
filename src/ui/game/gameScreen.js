// The in-game screen and the real-time loop that drives the game clock.
import { el } from '../dom.js';
import { getDate } from '../../core/index.js';
import { isPlayerBusy } from '../../machinery/index.js';
import { createHud } from './hud.js';
import { createSidebar } from './sidebar.js';
import { createSiteView } from './siteView.js';
import { createFeedback } from './feedback.js';
import { createDevPanel } from './devPanel.js';
import { openShop } from './shop.js';
import { openMarket } from './market.js';

const MAX_TICKS_PER_FRAME = 400;

export function createGameScreen({ game, app, settings, keyboard, isDev }) {
  const { data } = game;

  // --- speed & pause ---
  let speedIndex = 0;
  let userPaused = false;
  let devFast = false;
  const runtime = {
    speedIndex: () => speedIndex,
    isUserPaused: () => userPaused,
    isDevFast: () => devFast,
    togglePause: () => { userPaused = !userPaused; },
    setSpeed: (i) => { speedIndex = i; userPaused = false; devFast = false; },
    toggleDevFast: () => { devFast = !devFast; userPaused = false; },
  };

  let feedback = null;
  // One job pressed while you were busy runs as soon as you're free.
  let queued = null;
  const QUEUEABLE = new Set(['dig', 'haul', 'repair']);

  // Gameplay actions shared by buttons and hotkeys. `quiet` hides failure messages
  // (used for held keys, which retry every frame).
  function run(action, { quiet = false } = {}) {
    if (!quiet && QUEUEABLE.has(action) && isPlayerBusy(game.ctx)) {
      queued = action;
      return;
    }
    const a = game.actions;
    const handlers = {
      dig: a.dig,
      haul: a.haul,
      sell: a.sellAll,
      repair: a.serviceOrRepair,
      nextMachine: a.nextMachine,
    };
    const fn = handlers[action];
    if (!fn) return;
    const r = fn();
    if (!r.ok && !quiet) feedback.message(r.reason, 'warn');
  }

  const hud = createHud({
    game,
    runtime,
    settings,
    onShop: () => openShop(app.overlays, { game, feedback }),
    onMarket: () => openMarket(app.overlays, { game, feedback }),
    onMenu: () => app.openPauseMenu(),
  });
  feedback = createFeedback({ game, getMoneyNode: () => hud.moneyNode });
  const siteView = createSiteView({
    game,
    onSelectZone: (id) => game.actions.selectZone(id),
    onSelectMachine: (id) => game.actions.selectMachine(id),
  });
  const sidebar = createSidebar({ game, settings, run });
  const devPanel = isDev ? createDevPanel({ game, runtime, feedback }) : null;

  const pausedBanner = el('div', { class: 'paused-banner' }, 'PAUSED');
  const node = el('div', { class: 'game-screen' },
    hud.node,
    el('div', { class: 'game-main' }, siteView.node, sidebar.node),
    pausedBanner,
    feedback.node,
    devPanel?.node,
  );

  function handleAction(action) {
    switch (action) {
      case 'pause': runtime.togglePause(); break;
      case 'speed1': runtime.setSpeed(0); break;
      case 'speed2': runtime.setSpeed(1); break;
      case 'speed3': runtime.setSpeed(2); break;
      case 'shop': openShop(app.overlays, { game, feedback }); break;
      case 'market': openMarket(app.overlays, { game, feedback }); break;
      case 'dev': devPanel?.toggle(); break;
      default: run(action);
    }
  }

  function summary() {
    return { day: getDate(game.state, data).day, money: Math.round(game.state.money) };
  }

  const offAutosave = game.events.on('dayStarted', () => {
    if (settings.autosave) app.saveTo('autosave', { silent: true });
  });

  // --- main loop ---
  let raf = 0;
  let last = 0;
  let acc = 0;

  function frame(now) {
    const realDt = last ? Math.min(0.25, (now - last) / 1000) : 0;
    last = now;
    const paused = userPaused || app.overlays.anyPausing();
    if (!paused) {
      // Held keys repeat their action whenever you are free again.
      if (!isPlayerBusy(game.ctx) && queued) {
        const action = queued;
        queued = null;
        run(action);
      }
      if (!isPlayerBusy(game.ctx)) {
        for (const action of keyboard.heldActions()) run(action, { quiet: true });
      }
      const speed = devFast ? data.game.devSpeed : data.game.speeds[speedIndex];
      acc += realDt * speed;
      const step = 1 / data.game.ticksPerSecond;
      let n = 0;
      while (acc >= step && n < MAX_TICKS_PER_FRAME) {
        game.tick();
        acc -= step;
        n += 1;
      }
      if (n >= MAX_TICKS_PER_FRAME) acc = 0;
    }
    pausedBanner.style.display = paused ? '' : 'none';
    hud.update(realDt);
    sidebar.update(realDt);
    siteView.update(realDt);
    devPanel?.update(realDt);
    app.overlays.update(realDt);
    raf = requestAnimationFrame(frame);
  }

  return {
    node,
    game,
    feedback,
    summary,
    handleAction,
    start() {
      raf = requestAnimationFrame(frame);
    },
    destroy() {
      cancelAnimationFrame(raf);
      offAutosave();
      sidebar.destroy();
      siteView.destroy();
      feedback.destroy();
    },
  };
}
