// Tiny event bus. Logic emits events; UI listens.
// A '*' listener receives every event as (type, payload).

export function createEventBus() {
  const handlers = new Map();

  function on(type, fn) {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type).add(fn);
    return () => off(type, fn);
  }

  function off(type, fn) {
    handlers.get(type)?.delete(fn);
  }

  function emit(type, payload = {}) {
    for (const fn of [...(handlers.get(type) ?? [])]) fn(payload);
    for (const fn of [...(handlers.get('*') ?? [])]) fn(type, payload);
  }

  return { on, off, emit };
}
