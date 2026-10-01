// Renderer-independent rigid-body simulation. Impulses act at the raycast point,
// dragging uses a physical point constraint, and a soft motor drives an 18s turn.
export const TURN_SECONDS = 18;
export const CLICK_IMPULSE = Object.freeze({ x: 0, y: .2, z: -10.4 });
export const MAX_TRANSLATION = .55;
export const MAX_SWING = .28;
export const REST_TILT_BOUND = .22;
export const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
export const canAnimate = ({ reduced, paused, visible, hidden, ready }) => ready && visible && !hidden && !reduced && !paused;

export function createDesignPhysics(C, shapes) {
  const world = new C.World({ gravity: new C.Vec3(0, 0, 0), allowSleep: false });
  world.solver.iterations = 12;
  const body = new C.Body({ mass: 1.8, linearDamping: .45, angularDamping: .25, collisionFilterMask: 0 });
  for (const s of shapes) body.addShape(new C.Box(new C.Vec3(...s.half)), new C.Vec3(...s.center));
  world.addBody(body);
  const anchor = new C.Body({ type: C.Body.KINEMATIC, collisionFilterMask: 0 });
  world.addBody(anchor);
  const rest = new C.Quaternion().setFromEuler(-.20, -.36, -.055, 'XYZ');
  const target = rest.clone(), dragTarget = rest.clone(), spin = new C.Quaternion(), inverse = new C.Quaternion(), error = new C.Quaternion();
  const axis = new C.Vec3(0, 1, 0), motorVelocity = new C.Vec3();
  const acceleration = new C.Vec3(), local = new C.Vec3(), torque = new C.Vec3();
  const restInverse = rest.conjugate();
  const relative = new C.Quaternion(), twist = new C.Quaternion(), twistInverse = new C.Quaternion(), swing = new C.Quaternion(), limited = new C.Quaternion();
  const swingAxis = new C.Vec3(), worldSwingAxis = new C.Vec3();
  let phase = 0, elapsed = 0, released = -10, constraint = null;
  const speed = 2 * Math.PI / TURN_SECONDS;

  function reset() {
    endDrag(true);
    phase = 0; elapsed = 0; released = -10;
    body.position.set(0, 0, 0); body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0); body.quaternion.copy(rest);
    body.force.set(0, 0, 0); body.torque.set(0, 0, 0);
    body.previousQuaternion.copy(rest); body.interpolatedQuaternion.copy(rest);
    body.previousPosition.copy(body.position); body.interpolatedPosition.copy(body.position);
    world.accumulator = 0;
  }
  function zeroVelocity() {
    body.velocity.set(0, 0, 0); body.angularVelocity.set(0, 0, 0);
    body.force.set(0, 0, 0); body.torque.set(0, 0, 0);
  }
  function applyImpulse(point, impulse, { carryTurn = false } = {}) {
    const p = new C.Vec3(point.x, point.y, point.z).vsub(body.position);
    body.applyImpulse(new C.Vec3(impulse.x, impulse.y, impulse.z), p);
    if (carryTurn) {
      rest.vmult(axis, motorVelocity);
      phase = (phase + clamp(body.angularVelocity.dot(motorVelocity) * .30, -.8, .8) + Math.PI * 2) % (Math.PI * 2);
    }
    released = elapsed;
  }
  function spinImpulse(amount) {
    amount = clamp(amount, -1.2, 1.2);
    // Wheel input supplies angular momentum and advances the motor target,
    // avoiding a spring-back to the pre-scroll angle.
    body.quaternion.vmult(axis, motorVelocity);
    motorVelocity.scale(amount, motorVelocity);
    body.angularVelocity.vadd(motorVelocity, body.angularVelocity);
    phase = (phase + amount * .8 + Math.PI * 2) % (Math.PI * 2);
    released = elapsed;
  }
  function beginDrag(point) {
    endDrag(true);
    const p = new C.Vec3(point.x, point.y, point.z);
    anchor.position.copy(p);
    dragTarget.copy(body.quaternion);
    constraint = new C.PointToPointConstraint(body, body.pointToLocalFrame(p), anchor, new C.Vec3(), 45);
    world.addConstraint(constraint);
  }
  function moveDrag(point, rotation) {
    if (!constraint) return;
    anchor.position.set(point.x, point.y, point.z);
    if (rotation) dragTarget.set(rotation.x, rotation.y, rotation.z, rotation.w);
  }
  function endDrag(cancelled = false) {
    if (constraint) { world.removeConstraint(constraint); constraint = null; released = elapsed; adoptTurn(); }
    if (cancelled) zeroVelocity();
  }
  function rotateManual(x, y) {
    const turn = new C.Quaternion().setFromEuler(x, y, 0, 'XYZ');
    body.quaternion.mult(turn, body.quaternion); body.quaternion.normalize();
    boundTilt();
    adoptTurn();
    zeroVelocity();
  }
  function adoptTurn() {
    restInverse.mult(body.quaternion, relative);
    phase = (2 * Math.atan2(relative.y, relative.w) + Math.PI * 2) % (Math.PI * 2);
  }
  function boundTilt() {
    // Free full turns about the word's own axis, with a restrained physical
    // wobble. The swing/twist split avoids Euler-angle jumps at 180 degrees.
    restInverse.mult(body.quaternion, relative);
    const twistLength = Math.hypot(relative.y, relative.w);
    if (twistLength > 1e-7) twist.set(0, relative.y / twistLength, 0, relative.w / twistLength);
    else twist.setFromAxisAngle(axis, phase);
    twist.conjugate(twistInverse); relative.mult(twistInverse, swing);
    if (swing.w < 0) swing.set(-swing.x, -swing.y, -swing.z, -swing.w);
    const sin = Math.hypot(swing.x, swing.y, swing.z);
    const angle = 2 * Math.atan2(sin, Math.max(0, swing.w));
    if (angle <= MAX_SWING || sin < 1e-7) return;
    swingAxis.set(swing.x / sin, swing.y / sin, swing.z / sin);
    swing.setFromAxisAngle(swingAxis, MAX_SWING); swing.mult(twist, limited); rest.mult(limited, body.quaternion);
    rest.vmult(swingAxis, worldSwingAxis);
    const outward = body.angularVelocity.dot(worldSwingAxis);
    if (outward > 0) { worldSwingAxis.scale(outward, worldSwingAxis); body.angularVelocity.vsub(worldSwingAxis, body.angularVelocity); }
  }
  function step(dt, auto = true) {
    // No catch-up after suspension. Substeps are stable under a slow GPU.
    const total = clamp(dt, 0, .05);
    const count = Math.max(1, Math.ceil(total * 120));
    const h = total / count;
    for (let i = 0; i < count; i++) {
      elapsed += h;
      if (auto && !constraint) phase = (phase + speed * h) % (Math.PI * 2);
      spin.setFromAxisAngle(axis, phase); rest.mult(spin, target);
      // A spring holds the word in the composition without a visible support.
      for (const key of ['x', 'y', 'z']) body.force[key] += body.mass * (-body.position[key] * 14 - body.velocity[key] * 5);
      {
        body.quaternion.conjugate(inverse); (constraint ? dragTarget : target).mult(inverse, error);
        if (error.w < 0) { error.x *= -1; error.y *= -1; error.z *= -1; error.w *= -1; }
        const sin = Math.hypot(error.x, error.y, error.z);
        const angle = 2 * Math.atan2(sin, Math.max(0, error.w));
        const recovery = clamp((elapsed - released) / 1.8, 0, 1);
        const smooth = recovery * recovery * (3 - 2 * recovery);
        const gain = constraint ? 36 : 2.6 + smooth * 4.4;
        rest.vmult(axis, motorVelocity); motorVelocity.scale(auto && !constraint ? speed : 0, motorVelocity);
        const damping = constraint ? 8 : 2.2 + smooth * 1.3;
        for (const key of ['x', 'y', 'z']) acceleration[key] = (sin > 1e-6 ? error[key] / sin * angle * gain : 0) - (body.angularVelocity[key] - motorVelocity[key]) * damping;
        // Convert requested angular acceleration through the body's inertia.
        inverse.vmult(acceleration, local);
        local.set(local.x * body.inertia.x, local.y * body.inertia.y, local.z * body.inertia.z);
        body.quaternion.vmult(local, torque); body.torque.vadd(torque, body.torque);
      }
      const angularSpeed = body.angularVelocity.length();
      if (angularSpeed > 3.2) body.angularVelocity.scale(3.2 / angularSpeed, body.angularVelocity);
      const linearSpeed = body.velocity.length();
      // Let the doubled click impulse act before damping, while keeping long
      // drags and repeated clicks bounded by the same translation envelope.
      if (linearSpeed > 6) body.velocity.scale(6 / linearSpeed, body.velocity);
      world.step(h);
      boundTilt();
      // Reserve one small, fixed movement envelope instead of moving the camera
      // away whenever a push or a long drag tips the word towards the frame.
      const displacement = body.position.length();
      if (displacement > MAX_TRANSLATION) {
        body.position.scale(MAX_TRANSLATION / displacement, body.position);
        body.position.scale(1 / MAX_TRANSLATION, local);
        const outward = body.velocity.dot(local);
        if (outward > 0) { local.scale(outward, local); body.velocity.vsub(local, body.velocity); }
      }
      body.quaternion.normalize();
    }
  }
  reset();
  return { body, world, reset, zeroVelocity, applyImpulse, spinImpulse, beginDrag, moveDrag, endDrag, rotateManual, step,
    get phase() { return phase; }, get dragging() { return Boolean(constraint); } };
}
