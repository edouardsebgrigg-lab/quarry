// Speed assistance requests ordinary pedals; the drivetrain still determines available
// power and the loaded vehicle's brakes still determine how well it can hold a descent.
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function createCruiseControl(tuning) {
  let active = false, target = 0, integral = 0, heldForward = false, airborneTime = 0, limited = false;
  const state = () => ({ active, targetSpeed: target, limited });
  function cancel() {
    active = false; target = 0; integral = 0; heldForward = false; airborneTime = 0; limited = false;
    return state();
  }
  function toggle({ speed, speedLimit, running, forward, manualThrottle = 0, brakePressed = false, grounded = true, handbrake = false }) {
    if (active) return { ok: true, ...cancel(), reason: 'Cruise off' };
    if (!running) return { ok: false, ...state(), reason: 'Start the engine before setting cruise' };
    if (handbrake || brakePressed || manualThrottle < 0)
      return { ok: false, ...state(), reason: 'Release the brake before setting cruise' };
    if (!grounded || !forward || !Number.isFinite(speed) || !Number.isFinite(speedLimit) || speed < tuning.minSpeed || speedLimit < tuning.minSpeed)
      return { ok: false, ...state(), reason: `Drive forward above ${Math.ceil(tuning.minSpeed * 3.6)} km/h before setting cruise` };
    active = true; target = Math.min(speed, speedLimit); integral = tuning.initialThrottle;
    heldForward = manualThrottle > 0; airborneTime = 0; limited = false;
    return { ok: true, ...state(), reason: `Cruise set to ${Math.round(target * 3.6)} km/h` };
  }
  function step(dt, { speed, speedLimit, running, forward, manualThrottle = 0, brakePressed = false, handbrake = false, grounded = true, grip = 1, slip = 0, shifting = false }) {
    const idle = { engaged: false, throttle: 0, brake: 0 };
    if (!active || !Number.isFinite(dt) || dt <= 0) return idle;
    if (!running || !forward || handbrake || brakePressed || manualThrottle < 0 || !Number.isFinite(speed) || !Number.isFinite(speedLimit) || speedLimit < tuning.minSpeed) {
      cancel(); return idle;
    }
    // Setting cruise while accelerating is natural: allow that existing press until it
    // is released. Subsequent pedal presses return full control to the driver.
    if (heldForward && manualThrottle > 0) return idle;
    heldForward = false;
    if (manualThrottle > 0) { cancel(); return idle; }
    target = Math.min(target, speedLimit);
    if (!grounded) {
      airborneTime += dt; limited = true;
      if (airborneTime >= tuning.airborneCancelSeconds) cancel();
      return { engaged: true, throttle: 0, brake: 0 };
    }
    airborneTime = 0;
    const traction = clamp(Number.isFinite(grip) ? grip : 0, 0, 1)
      * (1 - tuning.slipThrottleReduction * clamp(Number.isFinite(slip) ? slip : 1, 0, 1));
    const cap = tuning.lowGripThrottle + (1 - tuning.lowGripThrottle) * traction;
    const error = target - speed;
    if (error < -tuning.brakeDeadband) {
      integral = Math.max(0, integral - tuning.integralReleaseRate * dt);
      const requested = (-error - tuning.brakeDeadband) * tuning.brakeGain;
      limited = requested > tuning.maxBrake;
      return { engaged: true, throttle: 0, brake: Math.min(tuning.maxBrake, requested) };
    }
    const requested = error * tuning.speedGain + integral;
    // Avoid storing extra throttle while the engine cannot deliver it or while shifting.
    if (!shifting && (requested < cap || error < 0)) integral = clamp(integral + error * tuning.integralGain * dt, 0, cap);
    limited = requested > cap;
    return { engaged: true, throttle: clamp(error * tuning.speedGain + integral, 0, cap), brake: 0 };
  }
  return { state, toggle, cancel, step };
}
