// The camera in a cab moves like a driver's head.
import * as THREE from 'three';

// Driver's head in the cab: springs against acceleration (pushed back when pulling away,
// forward when braking, sideways in corners) plus vibration from the engine and the ground.
export function createHeadSway() {
  const off = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const lastPos = new THREE.Vector3();
  const lastVel = new THREE.Vector3();
  const accel = new THREE.Vector3();
  const inv = new THREE.Quaternion();
  const out = { offset: new THREE.Vector3(), pitch: 0, roll: 0 };
  let primed = false;
  let t = 0;
  return {
    reset() {
      primed = false;
    },
    update(dt, v, cabQ) {
      t += dt;
      const p = v.seatWorld();
      if (!primed || dt <= 0) {
        lastPos.copy(p);
        lastVel.set(0, 0, 0);
        off.set(0, 0, 0);
        vel.set(0, 0, 0);
        primed = true;
      }
      const velNow = p.clone().sub(lastPos).divideScalar(Math.max(dt, 1e-3));
      accel.copy(velNow).sub(lastVel).divideScalar(Math.max(dt, 1e-3));
      lastPos.copy(p);
      lastVel.lerp(velNow, 0.5);
      // Into the cab's own frame (x forward, y up, z right), gravity-free, clamped.
      inv.copy(cabQ).invert();
      const a = accel.applyQuaternion(inv).clampLength(0, 12);
      const target = a.multiplyScalar(-0.009);
      const k = 60;
      const c = 2 * Math.sqrt(k) * 0.55;
      vel.addScaledVector(target.sub(off).multiplyScalar(k), dt).addScaledVector(vel, -c * dt);
      off.addScaledVector(vel, dt).clampLength(0, 0.14);
      const f = v.feel?.() ?? {};
      const running = f.engine === 'running' || f.engine === 'idleOut' || f.running;
      const rpm = f.rpm ?? (running ? 1400 + (f.work ?? 0) * 500 : 0);
      const rough = { gravel: 1, dirt: 0.8, grass: 0.9, rock: 1.2, asphalt: 0.15 }[f.surface] ?? 0.6;
      const engineShake = running ? 0.0012 + (f.load ?? f.work ?? 0) * 0.0018 : 0;
      const roadShake = Math.min(1, Math.abs(v.speed()) / 10) * rough * 0.005 + Math.min(0.02, (f.bump ?? 0) * 0.004);
      const digShake = f.digging ? 0.006 : 0;
      const w = (rpm / 60) * 2 * Math.PI * 0.5;
      const n = (a1, a2) => Math.sin(t * a1 + a2) * 0.6 + Math.sin(t * a1 * 1.73 + a2 * 2.1) * 0.4;
      out.offset.set(
        n(w * 0.9, 0.3) * engineShake + n(23, 1.1) * roadShake,
        n(w, 0) * engineShake * 1.4 + n(17, 0.5) * (roadShake + digShake) * 1.5,
        n(w * 1.1, 2.1) * engineShake + n(29, 2.7) * roadShake,
      ).add(off).applyQuaternion(cabQ);
      out.pitch = -off.x * 0.35 + n(19, 3.3) * (roadShake + digShake) * 0.25;
      out.roll = -off.z * 0.4 + n(13, 0.9) * roadShake * 0.25;
      return out;
    },
  };
}
