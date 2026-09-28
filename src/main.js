import '@fontsource-variable/inter';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import { loadData } from './core/index.js';
import { startApp } from './ui/index.js';

function browserStorage() {
  try {
    const probe = '__quarry_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    // Storage blocked (e.g. private mode): fall back to memory, saves won't persist.
    const map = new Map();
    return {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
    };
  }
}

startApp(document.getElementById('app'), {
  data: loadData(),
  storage: browserStorage(),
  isDev: import.meta.env.DEV,
});
