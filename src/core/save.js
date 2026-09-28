// Versioned save slots. Storage is anything with getItem/setItem/removeItem
// (localStorage in the browser, files on disk later, memory in tests).

export const SLOT_IDS = ['autosave', 'slot1', 'slot2', 'slot3'];

export function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

// migrations[n] upgrades a save from version n to n + 1.
export function createSaveSystem({ storage, version, migrations = {}, prefix = 'quarry.save.' }) {
  const key = (slotId) => prefix + slotId;

  function save(slotId, state, summary = {}) {
    const record = { version, savedAt: Date.now(), summary, state };
    storage.setItem(key(slotId), JSON.stringify(record));
    return record;
  }

  function readRecord(slotId) {
    const raw = storage.getItem(key(slotId));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function load(slotId) {
    const record = readRecord(slotId);
    if (!record) return null;
    let { state } = record;
    let v = record.version;
    if (v > version) throw new Error(`Save is from a newer game version (${v})`);
    while (v < version) {
      const migrate = migrations[v];
      if (!migrate) throw new Error(`No migration from save version ${v}`);
      state = migrate(state);
      v += 1;
    }
    return state;
  }

  function list() {
    return SLOT_IDS.map((slotId) => {
      const r = readRecord(slotId);
      return r ? { slotId, savedAt: r.savedAt, summary: r.summary, version: r.version } : { slotId, empty: true };
    });
  }

  function latest() {
    const filled = list().filter((s) => !s.empty);
    filled.sort((a, b) => b.savedAt - a.savedAt);
    return filled[0] ?? null;
  }

  function remove(slotId) {
    storage.removeItem(key(slotId));
  }

  return { save, load, list, latest, remove };
}
