// Rapier physics world with a fixed 60 Hz step.
import RAPIER from '@dimforge/rapier3d-compat';

const STEP = 1 / 60;
const MAX_STEPS = 5;

export async function createPhysics() {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = STEP;
  const beforeStep = new Set();
  let acc = 0;

  return {
    RAPIER,
    world,
    STEP,
    // fn(dt) runs before every physics step (vehicles, character controllers).
    onBeforeStep(fn) {
      beforeStep.add(fn);
      return () => beforeStep.delete(fn);
    },
    step(realDt) {
      acc = Math.min(acc + realDt, STEP * MAX_STEPS);
      while (acc >= STEP) {
        for (const fn of beforeStep) fn(STEP);
        world.step();
        acc -= STEP;
      }
    },
    castRayDown(x, z, fromY = 50, exclude = null) {
      const hit = world.castRay(new RAPIER.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }), 200, true,
        undefined, undefined, exclude ?? undefined);
      return hit ? fromY - hit.timeOfImpact : null;
    },
    destroy() {
      world.free();
    },
  };
}
