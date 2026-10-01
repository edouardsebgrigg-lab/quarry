// The earthworks planner: plan a haul road, a ramp or a level area on your own land.
// On foot, press the works key, aim at the ground and click the start, then the end (a wide
// coloured strip shows exactly what will be built and the card says what it costs and needs),
// change the width with the wheel, and click once more to build it. Right click steps back,
// then cancels: nothing is spent or changed until the last click.
import * as THREE from 'three';
import { WORKS_MODES, worksConfig, clampWidth } from '../earthworks/index.js';

const COLORS = { pending: 0x6fb8ff, ok: 0x7ee07e, poor: 0xf2b632, bad: 0xe05a4a };
const STEP = 0.5; // metres per wheel notch, and the grid the points snap to
const SAMPLE = 1; // metres between strip samples

const snap = (v) => Math.round(v / STEP) * STEP;
const money = (n) => `$${Math.round(n)}`;
const t1 = (n) => `${n.toFixed(1)} t`;

export function createPlanner({ scene, camera, game, heightAt, notify, obstacles }) {
  const { data } = game;
  const range = data.works.aimRange;

  const st = {
    active: false,
    mode: 'road',
    width: worksConfig(data, 'road').width.default,
    a: null,
    b: null,
    hover: null,
    plan: null,
    planKey: '',
    planAge: 0,
    built: 0,
    lastBuild: null,
  };

  // ---- the strip drawn over the ground
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);
  const fillMat = new THREE.MeshBasicMaterial({ color: COLORS.pending, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const seeThroughMat = new THREE.MeshBasicMaterial({ color: COLORS.pending, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
  const edgeMat = new THREE.MeshBasicMaterial({ color: COLORS.pending, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const strip = new THREE.Mesh(new THREE.BufferGeometry(), fillMat);
  const seeThrough = new THREE.Mesh(strip.geometry, seeThroughMat);
  const edges = new THREE.Mesh(new THREE.BufferGeometry(), edgeMat);
  strip.renderOrder = 8;
  seeThrough.renderOrder = 7;
  edges.renderOrder = 9;
  for (const m of [strip, seeThrough, edges]) m.frustumCulled = false;
  const postMat = new THREE.MeshBasicMaterial({ color: COLORS.pending });
  const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8);
  const postTop = new THREE.SphereGeometry(0.16, 10, 8);
  const makePost = () => {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(postGeo, postMat);
    pole.position.y = 1.3;
    const knob = new THREE.Mesh(postTop, postMat);
    knob.position.y = 2.65;
    g.add(pole, knob);
    g.visible = false;
    return g;
  };
  const postA = makePost();
  const postB = makePost();
  root.add(strip, seeThrough, edges, postA, postB);
  // where you're aiming, before anything is set
  const cursor = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 28), new THREE.MeshBasicMaterial({ color: COLORS.pending, transparent: true, opacity: 0.9, depthTest: false }));
  cursor.rotation.x = -Math.PI / 2;
  cursor.renderOrder = 10;
  root.add(cursor);
  const spoilMarker = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 32), cursor.material.clone());
  spoilMarker.rotation.x = -Math.PI / 2;
  spoilMarker.renderOrder = 10;
  root.add(spoilMarker);

  const eye = new THREE.Vector3();
  const dir = new THREE.Vector3();
  function rayGround() {
    camera.getWorldPosition(eye);
    camera.getWorldDirection(dir);
    let prev = 0.3;
    for (let t = 0.3; t <= range; t += 0.25) {
      const px = eye.x + dir.x * t;
      const py = eye.y + dir.y * t;
      const pz = eye.z + dir.z * t;
      if (py <= heightAt(px, pz)) {
        let lo = prev;
        let hi = t;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          if (eye.y + dir.y * mid <= heightAt(eye.x + dir.x * mid, eye.z + dir.z * mid)) hi = mid;
          else lo = mid;
        }
        const x = eye.x + dir.x * hi;
        const z = eye.z + dir.z * hi;
        return { x, z, y: heightAt(x, z) };
      }
      prev = t;
    }
    return null;
  }

  const end = () => st.b ?? st.hover; // the end the strip is drawn to right now
  const input = () => {
    const e = end();
    if (!st.a || !e) return null;
    return { mode: st.mode, ax: st.a.x, az: st.a.z, bx: e.x, bz: e.z, width: st.width, obstacles: obstacles() };
  };

  function replan(force = false) {
    const inp = input();
    if (!inp) {
      st.plan = null;
      st.planKey = '';
      return;
    }
    const key = `${inp.mode}|${inp.ax}|${inp.az}|${inp.bx}|${inp.bz}|${inp.width}|${Math.round(game.state.money)}`;
    if (!force && key === st.planKey && st.planAge < 0.3) return;
    st.planKey = key;
    st.planAge = 0;
    st.plan = game.actions.planWorks(inp);
  }

  const status = () => {
    if (!st.plan) return 'pending';
    if (st.plan.ok) return 'ok';
    return st.plan.valid ? 'poor' : 'bad';
  };

  function hideStrip() {
    strip.visible = false;
    seeThrough.visible = false;
    edges.visible = false;
  }

  function redraw() {
    const spoil = st.plan?.spoilAt;
    spoilMarker.visible = !!spoil;
    if (spoil) {
      spoilMarker.position.set(spoil.x, heightAt(spoil.x, spoil.z) + 0.08, spoil.z);
      spoilMarker.scale.setScalar(st.plan.spoilRadius);
      spoilMarker.material.color.setHex(COLORS.poor);
    }
    const inp = input();
    const e = end();
    postA.visible = !!st.a;
    postB.visible = !!(st.a && e);
    cursor.visible = !st.a && !!st.hover;
    const color = COLORS[status()];
    for (const m of [fillMat, seeThroughMat, edgeMat, postMat, cursor.material]) m.color.setHex(color);
    if (st.hover && !st.a) cursor.position.set(st.hover.x, st.hover.y + 0.06, st.hover.z);
    if (!inp) {
      hideStrip();
      return;
    }
    postA.position.set(st.a.x, heightAt(st.a.x, st.a.z), st.a.z);
    postB.position.set(e.x, heightAt(e.x, e.z), e.z);
    const L = Math.hypot(e.x - st.a.x, e.z - st.a.z);
    if (L < 0.2) {
      hideStrip();
      return;
    }
    const ux = (e.x - st.a.x) / L;
    const uz = (e.z - st.a.z) / L;
    const half = clampWidth(data, st.mode, st.width) / 2;
    const n = Math.max(1, Math.ceil(L / SAMPLE));
    const pos = [];
    const idx = [];
    const epos = [];
    const eidx = [];
    const p = st.plan && st.plan.pA !== undefined ? st.plan : null;
    const hA = heightAt(st.a.x, st.a.z);
    const hB = heightAt(e.x, e.z);
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const cx = st.a.x + (e.x - st.a.x) * u;
      const cz = st.a.z + (e.z - st.a.z) * u;
      // the finished surface where the plan is known, else the ground as it is
      const y = (p ? p.pA + (p.pB - p.pA) * u : hA + (hB - hA) * u) + 0.06;
      for (const side of [-1, 1]) {
        pos.push(cx - uz * half * side, y, cz + ux * half * side);
        // a thin bright border, 0.15 m wide, along each long edge
        for (const inner of [0, 1]) {
          const off = half - inner * 0.15;
          epos.push(cx - uz * off * side, y + 0.02, cz + ux * off * side);
        }
      }
      if (i < n) {
        const b = i * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        const eb = i * 4;
        eidx.push(eb, eb + 1, eb + 4, eb + 1, eb + 5, eb + 4, eb + 2, eb + 3, eb + 6, eb + 3, eb + 7, eb + 6);
      }
    }
    strip.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    strip.geometry.setIndex(idx);
    strip.geometry.computeBoundingSphere();
    edges.geometry.setAttribute('position', new THREE.Float32BufferAttribute(epos, 3));
    edges.geometry.setIndex(eidx);
    edges.geometry.computeBoundingSphere();
    strip.visible = true;
    seeThrough.visible = true;
    edges.visible = true;
  }

  function reset() {
    st.a = null;
    st.b = null;
    st.plan = null;
    st.planKey = '';
  }

  function open() {
    st.active = true;
    root.visible = true;
    reset();
    st.lastBuild = null;
    notify(`Planning works: ${worksConfig(data, st.mode).name}. Click the start, then the end`, 'good');
  }
  function close() {
    st.active = false;
    root.visible = false;
    reset();
  }

  function setMode(mode) {
    if (!WORKS_MODES.includes(mode)) return;
    st.mode = mode;
    st.width = worksConfig(data, mode).width.default;
    st.planKey = '';
  }

  function confirm() {
    replan(true);
    const inp = input();
    if (!inp) return null;
    const r = game.actions.buildWorks(inp);
    if (!r.ok) {
      notify(r.reason ?? 'It can\'t be built there', 'warn');
      return r;
    }
    st.built += 1;
    st.lastBuild = `${worksConfig(data, st.mode).name} built for ${money(r.cost)}${r.spoilTonnes > 0.05 ? `; ${t1(r.spoilTonnes)} spare spoil heaped beside it` : ''}`;
    notify(`${worksConfig(data, st.mode).name} built for ${money(r.cost)}${r.spoilTonnes > 0.05 ? `; ${t1(r.spoilTonnes)} of spare spoil heaped beside it` : ''}`, 'good');
    reset(); // (stay in the planner so the next one can follow straight on)
    return r;
  }

  return {
    get active() { return st.active; },
    state: st,
    toggle() {
      if (st.active) close();
      else open();
    },
    // Cycle road -> ramp -> level.
    cycleMode() {
      if (!st.active) return;
      setMode(WORKS_MODES[(WORKS_MODES.indexOf(st.mode) + 1) % WORKS_MODES.length]);
    },
    setMode,
    cancel: close,
    // For play tests: set the points and width directly (the same state the clicks make).
    set({ mode, a, b, width }) {
      if (!st.active) open();
      if (mode) setMode(mode);
      if (width) st.width = clampWidth(data, st.mode, width);
      if (a !== undefined) st.a = a ? { x: a.x, z: a.z } : null;
      if (b !== undefined) st.b = b ? { x: b.x, z: b.z } : null;
      replan(true);
      return st.plan;
    },
    confirm,

    update(dt, { clicked = false, rightPressed = false, wheel = 0 } = {}) {
      if (!st.active) return;
      st.planAge += dt;
      const ray = rayGround();
      st.hover = ray && { x: snap(ray.x), z: snap(ray.z), y: ray.y };
      if (wheel) {
        const notches = Math.max(1, Math.round(Math.abs(wheel) / 100)); // (a notch is about 100)
        st.width = clampWidth(data, st.mode, st.width + (wheel < 0 ? STEP : -STEP) * notches);
      }
      if (rightPressed) {
        if (st.b) st.b = null;
        else if (st.a) st.a = null;
        else close();
      }
      if (st.active && clicked) {
        // (with both ends set, the click builds wherever you're looking; setting an end needs the ground)
        if (st.a && st.b) confirm();
        else if (!st.hover) notify('Aim at the ground to set the end points', 'warn');
        else if (!st.a) st.a = { x: st.hover.x, z: st.hover.z };
        else if (Math.hypot(st.hover.x - st.a.x, st.hover.z - st.a.z) < 0.5) notify('Pick a different spot for the end', 'warn');
        else st.b = { x: st.hover.x, z: st.hover.z };
      }
      if (st.active) {
        replan();
        redraw();
      }
    },

    // What the HUD shows: the prompt keycaps and the info card.
    hud(key) {
      if (!st.active) return null;
      const cfg = worksConfig(data, st.mode);
      const stage = !st.a ? 'start' : !st.b ? 'end' : 'confirm';
      const p = st.plan;
      const prompts = [];
      if (stage === 'start') prompts.push({ key: 'LMB', text: 'Set the start' });
      else if (stage === 'end') prompts.push({ key: 'LMB', text: 'Set the end' });
      else prompts.push({ key: 'LMB', text: p?.ok ? `Build it (${money(p.cost)})` : 'Can\'t build this yet' });
      prompts.push({ key: 'Wheel', text: `Width ${st.width} m` });
      prompts.push({ key: 'RMB', text: stage === 'start' ? 'Cancel' : 'Back' });

      const lines = [];
      let headline = `${cfg.name}: click the start on your land`;
      let level = 'info';
      if (p) {
        headline = `${cfg.name}${p.length ? ` ${p.length.toFixed(0)} m × ${st.width} m` : ''}`;
        if (p.coreArea !== undefined) {
          lines.push(['Slope', p.mode === 'level' ? 'flat' : `${(p.grade * 100).toFixed(1)}%`]);
          lines.push(['Cost', `${money(p.cost)} (you have ${money(Math.max(0, game.state.money))})`]);
          lines.push(['Dig out', t1(p.cutTonnes)]);
          if (p.materials?.surface.tonnes.required > 0) {
            const surface = p.materials.surface.tonnes;
            lines.push(['Gravel ready', `${t1(surface.fromCut + surface.fromHeaps)} / ${t1(surface.required)}`]);
            lines.push(['Gravel source', `${t1(surface.fromCut)} cut · ${t1(surface.fromHeaps)} heaps`]);
          } else if (p.surfaceTonnes > 0) lines.push(['Gravel surface', t1(p.surfaceTonnes)]);
          const fill = p.materials?.fill.bankVolume;
          if (fill?.required > 0.01) lines.push(['Fill ready', `${(fill.fromCut + fill.fromHeaps).toFixed(fill.required < 1 ? 2 : 1)} / ${fill.required.toFixed(fill.required < 1 ? 2 : 1)} m³ compacted`]);
          if (p.heapTonnes > 0.01) lines.push(['From your heaps', t1(p.heapTonnes)]);
          if (p.spoilTonnes > 0.05) lines.push(['Spare spoil', `${t1(p.spoilTonnes)}, at the amber ring`]);
        }
        if (p.gradeGuidance) lines.push(['Minimum run', `${p.gradeGuidance.minimumRun.toFixed(1)} m for this rise`]);
        if (p.materials && (p.materials.surface.tonnes.missing > 0.01 || p.materials.fill.bankVolume.missing > 0.01)) lines.push(['Heap reach', `${p.materials.sourceRadius} m · clear of obstacles`]);
        level = p.ok ? 'good' : 'bad';
        lines.push([null, p.ok ? (stage === 'confirm' ? 'Ready. Click to build' : 'Click to set the end here') : p.reason]);
      } else if (stage === 'end') {
        lines.push([null, 'Aim at the ground where it should end']);
      } else if (st.lastBuild) { lines.push([null, st.lastBuild]); level = 'good'; }
      else if (!st.hover) lines.push([null, 'Aim at the ground']);
      return { prompts, card: { controls: prompts, title: headline, stage, lines, level, mode: st.mode, modeKey: key('works') } };
    },

    destroy() {
      scene.remove(root);
      spoilMarker.geometry.dispose();
      spoilMarker.material.dispose();
      for (const g of [strip.geometry, edges.geometry, postGeo, postTop, cursor.geometry]) g.dispose();
      for (const m of [fillMat, seeThroughMat, edgeMat, postMat, cursor.material]) m.dispose();
    },
  };
}
