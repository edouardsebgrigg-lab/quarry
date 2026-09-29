// The in-game screen: 3D world, HUD, and the real-time loop that drives the game clock.
import { el } from '../dom.js';
import { getDate } from '../../core/index.js';
import { createWorld3D } from '../../world3d/index.js';
import { createHud } from './hud.js';
import { createHud3d } from './hud3d.js';
import { createFeedback } from './feedback.js';
import { createDevPanel } from './devPanel.js';
import { openShop } from './shop.js';
import { openMarket } from './market.js';
import { toggleMap } from './mapOverlay.js';
import { openIntro } from '../screens/intro.js';
import { markIntroSeen, mentorForStep } from '../../progression/index.js';
import { timeRunning, createTicker, windowActive } from './timeGate.js';

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

  // For automated play tests (dev only): stand in for the first click, or force the clock on.
  const gate = {
    start: () => { started = true; },
    force: (on = true) => { forced = on; },
    running: () => running,
  };

  let feedback = null;
  let world = null;
  let destroyed = false;
  let expectUnlock = false;
  const openOverlay = (fn) => {
    fn();
    world?.unlockMouse();
  };

  const hud = createHud({
    game,
    runtime,
    settings,
  });
  feedback = createFeedback({ game, getMoneyNode: () => hud.moneyNode });
  const hud3d = createHud3d({ settings });
  const devPanel = isDev ? createDevPanel({ game, runtime, feedback }) : null;
  const viewport = el('div', { class: 'world-view' });

  const pausedBanner = el('div', { class: 'paused-banner' }, 'Paused');
  const node = el('div', { class: 'game-screen' },
    el('div', { class: 'game-main' }, viewport, hud3d.node),
    hud.node,
    pausedBanner,
    feedback.node,
    devPanel?.node,
  );

  createWorld3D({
    container: viewport,
    game,
    settings,
    audio: app.audio,
    notify: (text, level) => feedback.message(text, level),
    onUseOffice: () => openOverlay(() => openShop(app.overlays, { game, feedback })),
    // Esc (or alt-tab) released the mouse: show the pause menu, like any PC game.
    onPointerLockLost: () => {
      if (expectUnlock) {
        expectUnlock = false; // we released the mouse ourselves (dev panel)
        return;
      }
      if (app.overlays.count() === 0) app.openPauseMenu({ fromLockLoss: true });
    },
  }).then((w) => {
    if (destroyed) {
      w.destroy();
      return;
    }
    world = w;
    hud3d.setLoading(false);
    if (isDev) window.__quarry = { game, world, audio: app.audio, settings, saveTo: (slot) => app.saveTo(slot), gate }; // handy in the browser console and for automated play tests
  }).catch((err) => {
    console.error(err);
    hud3d.showError(`Could not start 3D: ${err.message ?? err}`);
  });

  function handleAction(action) {
    switch (action) {
      case 'pause': runtime.togglePause(); break;
      case 'speed1': runtime.setSpeed(0); break;
      case 'speed2': runtime.setSpeed(1); break;
      case 'speed3': runtime.setSpeed(2); break;
      case 'shop': openOverlay(() => openShop(app.overlays, { game, feedback })); break;
      case 'market': openOverlay(() => openMarket(app.overlays, { game, feedback })); break;
      case 'map': openOverlay(() => toggleMap(app.overlays, { game, world })); break;
      case 'hints': hud3d.toggleHints(); break;
      case 'controls':
        settings.diggerControls = settings.diggerControls === 'direct' ? 'assisted' : 'direct';
        app.saveSettings();
        feedback.message(settings.diggerControls === 'direct'
          ? 'Digger controls: Direct (boom, stick, bucket and swing on their own keys)'
          : 'Digger controls: Assisted (aim and click)', 'good');
        world?.handleAction('controls');
        break;
      case 'goal': hud.toggleGoal(); break;
      case 'dev':
        if (!devPanel) break;
        devPanel.toggle();
        if (world?.isMouseLocked()) {
          expectUnlock = true;
          world.unlockMouse();
        }
        break;
      default: world?.handleAction(action);
    }
  }

  function summary() {
    return { day: getDate(game.state, data).day, money: Math.round(game.state.money) };
  }

  function beforeSave() {
    world?.writePositions(game.state);
  }

  // Small UI sounds for money in and goals done.
  const offSounds = [
    game.events.on('productSold', () => app.audio?.play('coin', { bus: 'ui', gain: 0.8 })),
    game.events.on('objectiveCompleted', () => app.audio?.play('chime', { bus: 'ui', gain: 0.8 })),
    game.events.on('machineBought', () => app.audio?.play('coin', { bus: 'ui', gain: 0.5, rate: 0.8 })),
  ];
  const offAutosave = game.events.on('dayStarted', () => {
    if (settings.autosave) app.saveTo('autosave', { silent: true });
  });

  // --- main loop ---
  let raf = 0;
  let started = false; // has the player clicked into the game yet?
  let forced = false; // automated play tests can force the clock on
  let running = false; // is game time running this frame?
  let last = 0;
  const ticker = createTicker({ step: 1 / data.game.ticksPerSecond, maxTicksPerFrame: MAX_TICKS_PER_FRAME });

  function frame(now) {
    // Real frame time, capped so a stalled or hidden tab can't jump ahead when it wakes up.
    const realDt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    const overlayOpen = app.overlays.count() > 0;
    const overlayPausing = app.overlays.anyPausing();
    const paused = userPaused || overlayPausing;
    if (overlayOpen && world?.isMouseLocked()) world.unlockMouse();
    const info = world?.hudInfo() ?? null;
    if (info?.locked) started = true;
    running = timeRunning({
      userPaused, overlayPausing, overlayOpen, locked: !!info?.locked, started, windowActive: windowActive(), forced,
    });
    const speed = devFast ? data.game.devSpeed : data.game.speeds[speedIndex];
    for (let i = ticker.frame(realDt, speed, running); i > 0; i--) game.tick();
    world?.update(realDt, { paused: paused || overlayOpen, keyboard });
    pausedBanner.style.display = userPaused && !overlayOpen ? '' : 'none';
    hud.update(realDt, { active: running });
    // (hints, the goal card and messages only count down while you can see and act on them)
    hud3d.update(info, { overlayOpen, started, dt: running ? realDt : 0 });
    feedback.update(realDt, running);
    devPanel?.update(realDt);
    app.overlays.update(realDt);
    raf = requestAnimationFrame(frame);
  }

  return {
    node,
    game,
    feedback,
    summary,
    beforeSave,
    handleAction,
    lockMouse: () => world?.lockMouse(),
    start() {
      raf = requestAnimationFrame(frame);
      if (!game.state.objectives?.introSeen) openIntro(app.overlays, { game, onDone: () => markIntroSeen(game.ctx) });
      else mentorForStep(game.ctx, data.objectives.steps[game.state.objectives.index]); // a loaded game: a reminder of the plan
    },
    destroy() {
      destroyed = true;
      offSounds.forEach((off) => off());
      cancelAnimationFrame(raf);
      offAutosave();
      feedback.destroy();
      world?.destroy();
    },
  };
}
