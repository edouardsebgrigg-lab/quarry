// You on foot: a first-person character using Rapier's kinematic character controller.
import * as THREE from 'three';
import { createPlayerMovement } from './playerMovement.js';
import handling from '../../data/handling.json';

const RADIUS = 0.35;
const HALF_HEIGHT = 0.55;
const EYE = 1.65; // eye height above the feet

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

  const movement = createPlayerMovement();
  let active = true;
  const look = { yaw: spawn.yaw ?? 0, pitch: 0 };
  // maxSpeed and moveYaw (optional) override the walking speed and direction, e.g. while
  // pushing a wheelbarrow you walk slower and go where the barrow points.
  const input = { forward: 0, right: 0, sprint: false, jump: false, maxSpeed: null, moveYaw: null, wading: 0 };

  function step(dt) {
    if (!active || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, handling.player.maxStepSeconds);
    const desired = movement.step(dt,input,look.yaw);
    controller.computeColliderMovement(collider, desired);
    const move = controller.computedMovement();
    movement.resolve(dt,move,controller.computedGrounded(),desired);
    const p = body.translation();
    body.setNextKinematicTranslation({ x: p.x + move.x, y: p.y + move.y, z: p.z + move.z });
    // Fell off the world somehow: put back at spawn.
    if (p.y < -30) { body.setNextKinematicTranslation({ x: spawn.x, y: spawn.y + 2, z: spawn.z }); movement.reset(input.jump); }
  }

  const offStep = physics.onBeforeStep(step);

  return {
    look,
    input,
    collider,
    grounded: () => movement.state.grounded,
    motion: () => ({speed:movement.state.speed,forwardSpeed:movement.state.forwardSpeed,strafeSpeed:movement.state.strafeSpeed,
      verticalSpeed:movement.state.vy,grounded:movement.state.grounded,moving:movement.state.moving,sprinting:movement.state.sprinting,
      constrained:movement.state.constrained,landed:movement.state.landed,landingSpeed:movement.state.landingSpeed}),
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
      movement.reset(input.jump);
    },
    setEnabled(on) {
      active = on;
      collider.setEnabled(on);
      movement.reset(input.jump);
    },
    destroy() {
      offStep();
      world.removeCharacterController(controller);
      world.removeRigidBody(body);
    },
  };
}
