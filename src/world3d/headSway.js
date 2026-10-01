// The camera in a cab moves like a driver's head.
import * as THREE from 'three';
import handling from '../../data/handling.json';

// Exact damped oscillator step: its response remains bounded at both 30 and 144 Hz.
export function springStep(position,velocity,target,dt,stiffness,dampingRatio) {
  if(!(dt>0))return {position,velocity};
  const damping=Math.sqrt(stiffness)*Math.min(.999,dampingRatio);
  const frequency=Math.sqrt(stiffness-damping*damping),decay=Math.exp(-damping*dt);
  const error=position-target,c=Math.cos(frequency*dt),s=Math.sin(frequency*dt);
  return {position:target+decay*(error*c+(velocity+damping*error)/frequency*s),
    velocity:decay*(velocity*c-(damping*velocity+stiffness*error)/frequency*s)};
}

// Driver's head in the cab: springs against acceleration (pushed back when pulling away,
// forward when braking, sideways in corners) plus vibration from the engine and the ground.
export function createHeadSway() {
  const tune=handling.cab;
  const off = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const lastPos = new THREE.Vector3();
  const lastVel = new THREE.Vector3();
  const accel = new THREE.Vector3();
  const inv = new THREE.Quaternion();
  const out = { offset: new THREE.Vector3(), pitch: 0, roll: 0 };
  let primed = false;
  let lastVehicle = null;
  let t = 0;
  return {
    reset() {
      primed = false;
      lastVehicle=null;
      off.set(0,0,0);vel.set(0,0,0);lastVel.set(0,0,0);
      out.offset.set(0,0,0);out.pitch=0;out.roll=0;
    },
    update(dt, v, cabQ) {
      const p = v.seatWorld();
      if(!Number.isFinite(dt)||dt<=0){primed=false;lastPos.copy(p);return out;}
      const interrupted=!primed||lastVehicle!==v||dt>tune.maxFrameSeconds||lastPos.distanceTo(p)>tune.teleportDistance;
      if (interrupted) {
        lastPos.copy(p);
        lastVel.set(0, 0, 0);
        off.set(0, 0, 0);
        vel.set(0, 0, 0);
        primed = true;
      }
      lastVehicle=v;
      dt=Math.min(dt,tune.maxFrameSeconds);
      t += dt;
      const velNow = p.clone().sub(lastPos).divideScalar(Math.max(dt, 1e-3));
      const previousVelocity=lastVel.clone();
      lastVel.lerp(velNow,1-Math.exp(-dt/tune.velocityFilterSeconds));
      accel.copy(lastVel).sub(previousVelocity).divideScalar(Math.max(dt,1e-3));
      lastPos.copy(p);
      // Into the cab's own frame (x forward, y up, z right), gravity-free, clamped.
      inv.copy(cabQ).invert();
      const a = accel.applyQuaternion(inv).clampLength(0,tune.maxAcceleration);
      const target = a.clone().multiplyScalar(-tune.accelerationScale);
      for(const axis of ['x','y','z']){
        const next=springStep(off[axis],vel[axis],target[axis],dt,tune.springStiffness,tune.dampingRatio);
        off[axis]=next.position;vel[axis]=next.velocity;
      }
      off.clampLength(0,tune.maxOffset);
      const f = v.feel?.() ?? {};
      const running = f.engine === 'running' || f.engine === 'idleOut' || f.running;
      const rpm = f.rpm ?? (running ? 1400 + (f.work ?? 0) * 500 : 0);
      const rough = tune.surfaceRoughness[f.surface] ?? 0.6;
      const engineShake = running ? tune.engineShake + (f.load ?? f.work ?? 0) * tune.engineLoadShake : 0;
      const roadShake = Math.min(1, Math.abs(v.speed()) / 10) * rough * tune.roadShake + Math.min(tune.maxBumpShake, (f.bump ?? 0) * tune.bumpShake);
      const digShake = f.digging ? tune.digShake : 0;
      const w = (rpm / 60) * 2 * Math.PI * 0.5;
      const n = (a1, a2) => Math.sin(t * a1 + a2) * 0.6 + Math.sin(t * a1 * 1.73 + a2 * 2.1) * 0.4;
      out.offset.set(
        n(w * 0.9, 0.3) * engineShake + n(23, 1.1) * roadShake,
        n(w, 0) * engineShake * 1.4 + n(17, 0.5) * (roadShake + digShake) * 1.5,
        n(w * 1.1, 2.1) * engineShake + n(29, 2.7) * roadShake,
      ).add(off).applyQuaternion(cabQ);
      out.pitch = -off.x * tune.pitchLean + n(19, 3.3) * (roadShake + digShake) * 0.25;
      out.roll = -off.z * tune.rollLean + n(13, 0.9) * roadShake * 0.25;
      return out;
    },
  };
}
