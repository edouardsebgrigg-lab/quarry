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
  const saves = createSaveSystem({ storage, version: data.game.saveVersion, migrations });

  const screenRoot = el('div', { class: 'screen-root' });
  root.append(screenRoot);
  const overlays = createOverlayStack(root);
  let session = null;

  const keyboard = createKeyboard({
    getBindings: () => settings.bindings,
    onAction: (action) => {
      if (!session || overlays.anyPausing()) return;
      session.handleAction(action);
    },
    onEscape: () => {
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
    overlays.closeAll();
    endSession();
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
      saves.save(slotId, session.game.state, session.summary());
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
        if (s.fullscreen) enterFullscreen();
        else exitFullscreen();
      },
    });
  }

  function openPause() {
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

  const app = { overlays, openPauseMenu: openPause, saveTo };
  showMainMenu();
  return app;
}
