// A machine's engine life cycle: off -> cranking -> running -> (after the driver leaves) a
// short idle -> stopping -> off. A broken machine stalls. `events` collects state changes
// so the sound can play the starter, the catch and the shut-down.

const CRANK_TIME = 1.1; // starter motor turning before it fires
const RUN_ON = 2.5; // seconds the engine idles after you get out

export function createEngineLife() {
  const e = { state: 'off', t: 0, events: [] };
  const set = (state) => {
    if (e.state === state) return;
    e.events.push(state);
    e.state = state;
    e.t = 0;
  };
  return {
    update(dt, { occupied, broken }) {
      e.t += dt;
      if (broken && (e.state === 'running' || e.state === 'cranking' || e.state === 'idleOut')) set('stall');
      if (occupied && !broken && (e.state === 'off' || e.state === 'stall' || e.state === 'stopping')) set('cranking');
      if (e.state === 'cranking' && e.t > CRANK_TIME) set('running');
      if (!occupied && e.state === 'running') set('idleOut');
      if (e.state === 'idleOut' && (occupied || e.t > RUN_ON)) set(occupied ? 'running' : 'stopping');
      if (e.state === 'stopping' && e.t > 0.6) set('off');
      if (e.state === 'stall' && e.t > 0.5) set('off');
    },
    get state() {
      return e.state;
    },
    running: () => e.state === 'running' || e.state === 'idleOut',
    takeEvents: () => e.events.splice(0),
  };
}
