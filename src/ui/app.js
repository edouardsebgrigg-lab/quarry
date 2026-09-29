// The app shell: main menu, pause menu, settings, save/load, and switching
// between the menu and a running game.
import { el, clear } from './dom.js';
import { createOverlayStack, confirmBox } from './overlays.js';
import { loadSettings, saveSettings, applyUiScale } from './settings.js';
import { buildMainMenu, buildQuitScreen } from './screens/mainMenu.js';
import { openPauseMenu, openSlotPicker } from './screens/menus.js';
import { openSettings } from './screens/settings.js';
import { createGameScreen } from './game/gameScreen.js';
import { createSaveSystem, migrations } from '../core/index.js';
import { createGame } from '../game/index.js';
import { createKeyboard } from '../input/index.js';
import { createAudio } from '../audio/index.js';

function enterFullscreen() {
  const docEl = document.documentElement;
  if (document.fullscreenElement || !docEl.requestFullscreen) return;
  docEl.requestFullscreen()
    // Keep Esc for the pause menu instead of leaving full screen (Chrome/Edge).
    .then(() => navigator.keyboard?.lock?.(['Escape']))
    .catch(() => {});
}

function exitFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

export function startApp(root, { data, storage, isDev }) {
  const settings = loadSettings(storage);
  applyUiScale(settings);
  // Sound starts on the first click or key press (browsers block it before that).
  const audio = createAudio({ volume: settings.volume });
  const applyAudio = (s) => {
    audio.setVolume(s.volume);
    audio.setBusGain('ambient', 0.55 * (s.ambientVolume ?? 0.8));
  };
  const wake = () => {
    audio.resume();
    applyAudio(settings);
  };
  window.addEventListener('pointerdown', wake, true);
  window.addEventListener('keydown', wake, true);
  const saves = createSaveSystem({ storage, version: data.game.saveVersion, migrations });

  const screenRoot = el('div', { class: 'screen-root' });
  root.append(screenRoot);
  // Back to the game when the last menu closes (a click or key press, so the browser allows it).
  const overlays = createOverlayStack(root, { onEmpty: () => session?.lockMouse() });
  let session = null;
  let lastLockPause = -Infinity;

  const keyboard = createKeyboard({
    getBindings: () => settings.bindings,
    onAction: (action) => {
      if (!session || overlays.anyPausing()) return;
      session.handleAction(action);
    },
    onEscape: () => {
      // The same Esc press may already have released the mouse and opened the pause menu.
      if (performance.now() - lastLockPause < 400) return;
      if (overlays.closeTop()) return;
      if (session) openPause();
    },
  });

  function setScreen(node, { focusFirst = false } = {}) {
    clear(screenRoot);
    screenRoot.append(node);
    if (focusFirst) node.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
    else document.activeElement?.blur?.();
  }

  function endSession() {
    session?.destroy();
    session = null;
  }

  function showMainMenu() {
    endSession();
    overlays.closeAll();
    setScreen(buildMainMenu({
      hasSave: !!saves.latest(),
      onContinue: () => {
        const latest = saves.latest();
        if (latest) loadSlot(latest.slotId);
      },
      onNewGame: () => startSession(createGame({ data })),
      onLoad: () => openSlotPicker(overlays, { mode: 'load', saves, onPick: loadSlot }),
      onSettings: openSettingsScreen,
      onQuit: () => confirmBox(overlays, {
        title: 'Quit',
        text: 'Quit the game?',
        yes: 'Quit',
        onYes: () => {
          exitFullscreen();
          window.close();
          setScreen(buildQuitScreen());
        },
      }),
    }), { focusFirst: true });
  }

  function startSession(game) {
    overlays.closeAll();
    endSession();
    session = createGameScreen({ game, app, settings, keyboard, isDev });
    setScreen(session.node);
    session.start();
    if (settings.fullscreen) enterFullscreen();
  }

  function loadSlot(slotId) {
    try {
      const state = saves.load(slotId);
      if (state) startSession(createGame({ data, state }));
    } catch (err) {
      confirmBox(overlays, { title: 'Could not load', text: String(err.message ?? err), yes: 'OK', onYes: () => {} });
    }
  }

  function saveTo(slotId, { silent = false } = {}) {
    if (!session) return;
    try {
      session.beforeSave();
      saves.save(slotId, session.game.snapshot(), session.summary());
      if (!silent) session.feedback.toast('Game saved', 'good');
    } catch (err) {
      session.feedback.toast(`Save failed: ${err.message ?? err}`, 'bad');
    }
  }

  function openSettingsScreen() {
    openSettings(overlays, {
      settings,
      keyboard,
      onChange: (s) => {
        saveSettings(storage, s);
        applyUiScale(s);
        applyAudio(s);
        if (s.fullscreen) enterFullscreen();
        else exitFullscreen();
      },
    });
  }

  function openPause({ fromLockLoss = false } = {}) {
    if (fromLockLoss) lastLockPause = performance.now();
    openPauseMenu(overlays, {
      onSave: () => openSlotPicker(overlays, { mode: 'save', saves, onPick: (slot) => saveTo(slot) }),
      onLoad: () => openSlotPicker(overlays, { mode: 'load', saves, onPick: loadSlot }),
      onSettings: openSettingsScreen,
      onQuitToMenu: () => confirmBox(overlays, {
        title: 'Quit to main menu',
        text: 'Progress since your last save will be lost.',
        yes: 'Quit to menu',
        onYes: showMainMenu,
      }),
    });
  }

  // Arrow keys move between menu buttons, like a console/PC game menu.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'ArrowUp' && e.code !== 'ArrowDown') return;
    const container = overlays.top()?.panel ?? (session ? null : screenRoot);
    if (!container) return;
    const buttons = [...container.querySelectorAll('button:not([disabled])')];
    if (buttons.length === 0) return;
    e.preventDefault();
    const i = buttons.indexOf(document.activeElement);
    const next = e.code === 'ArrowDown' ? i + 1 : i - 1;
    buttons[(next + buttons.length) % buttons.length].focus();
  });

  // No browser right-click menu; clicked buttons shouldn't keep focus (Space/Enter are hotkeys).
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mouseup', () => {
    if (session && document.activeElement?.tagName === 'BUTTON' && !overlays.top()) document.activeElement.blur();
  });

  const app = { overlays, openPauseMenu: openPause, saveTo, audio };
  showMainMenu();
  return app;
}
