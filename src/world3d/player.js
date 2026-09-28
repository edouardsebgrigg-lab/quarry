// You on foot: a first-person character using Rapier's kinematic character controller.
import * as THREE from 'three';

const RADIUS = 0.35;
const HALF_HEIGHT = 0.55;
const EYE = 1.65; // eye height above the feet
const WALK = 4.5;
const SPRINT = 8.5;
const JUMP = 5.5;
const GRAVITY = 20;

export function createPlayer({ physics, spawn }) {
  const { RAPIER, world } = physics;
  const feetToCentre = HALF_HEIGHT + RADIUS;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(spawn.x, spawn.y + feetToCentre + 0.1, spawn.z));
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(HALF_HEIGHT, RADIUS), body);
  const controller = world.createCharacterController(0.02);
  controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(70)); // steep enough to climb out of a pit
  controller.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(75));
  controller.enableAutostep(0.5, 0.2, false);
  controller.enableSnapToGround(0.4);
  controller.setApplyImpulsesToDynamicBodies(true);

  let vy = 0;
  let grounded = false;
  let active = true;
  const look = { yaw: spawn.yaw ?? 0, pitch: 0 };
  const input = { forward: 0, right: 0, sprint: false, jump: false };

  function step(dt) {
    if (!active) return;
    const speed = input.sprint ? SPRINT : WALK;
    // Move relative to where you are looking (camera yaw: 0 looks along -Z).
    const fx = -Math.sin(look.yaw);
    const fz = -Math.cos(look.yaw);
    const rx = -fz;
    const rz = fx;
    let mx = fx * input.forward + rx * input.right;
    let mz = fz * input.forward + rz * input.right;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    if (grounded && input.jump) vy = JUMP;
    vy -= GRAVITY * dt;
    const desired = { x: mx * speed * dt, y: vy * dt, z: mz * speed * dt };
    controller.computeColliderMovement(collider, desired);
    const move = controller.computedMovement();
    grounded = controller.computedGrounded();
    if (grounded && vy < 0) vy = 0;
    const p = body.translation();
    body.setNextKinematicTranslation({ x: p.x + move.x, y: p.y + move.y, z: p.z + move.z });
    // Fell off the world somehow: put back at spawn.
    if (p.y < -30) body.setNextKinematicTranslation({ x: spawn.x, y: spawn.y + 2, z: spawn.z });
  }

  const offStep = physics.onBeforeStep(step);

  return {
    look,
    input,
    feet() {
      const p = body.translation();
      return new THREE.Vector3(p.x, p.y - feetToCentre, p.z);
    },
    eye() {
      const p = body.translation();
      return new THREE.Vector3(p.x, p.y - feetToCentre + EYE, p.z);
    },
    teleport(x, y, z) {
      body.setTranslation({ x, y: y + feetToCentre + 0.05, z }, true);
      body.setNextKinematicTranslation({ x, y: y + feetToCentre + 0.05, z });
      vy = 0;
    },
    setEnabled(on) {
      active = on;
      collider.setEnabled(on);
    },
    destroy() {
      offStep();
      world.removeCharacterController(controller);
      world.removeRigidBody(body);
    },
  };
}
