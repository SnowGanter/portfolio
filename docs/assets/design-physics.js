// Renderer-independent rigid-body simulation. Impulses act at the raycast point,
// dragging uses a physical point constraint, and a soft motor drives a 42s turn.
export const TURN_SECONDS = 42;
export const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
export const canAnimate = ({ reduced, paused, visible, hidden, ready }) => ready && visible && !hidden && !reduced && !paused;

export function createDesignPhysics(C, shapes) {
  const world = new C.World({ gravity: new C.Vec3(0, 0, 0), allowSleep: false });
  world.solver.iterations = 12;
  const body = new C.Body({ mass: 1.4, linearDamping: .55, angularDamping: .25, collisionFilterMask: 0 });
  for (const s of shapes) body.addShape(new C.Box(new C.Vec3(...s.half)), new C.Vec3(...s.center));
  world.addBody(body);
  const anchor = new C.Body({ type: C.Body.KINEMATIC, collisionFilterMask: 0 });
  world.addBody(anchor);
  const rest = new C.Quaternion().setFromEuler(-.20, -.36, -.055, 'XYZ');
  const target = rest.clone(), dragTarget = rest.clone(), spin = new C.Quaternion(), inverse = new C.Quaternion(), error = new C.Quaternion();
  const axis = new C.Vec3(0, 1, 0), motorVelocity = new C.Vec3();
  const acceleration = new C.Vec3(), local = new C.Vec3(), torque = new C.Vec3();
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
  function applyImpulse(point, impulse) {
    const p = new C.Vec3(point.x, point.y, point.z).vsub(body.position);
    body.applyImpulse(new C.Vec3(impulse.x, impulse.y, impulse.z), p);
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
    if (constraint) { world.removeConstraint(constraint); constraint = null; released = elapsed; }
    if (cancelled) zeroVelocity();
  }
  function rotateManual(x, y) {
    const turn = new C.Quaternion().setFromEuler(x, y, 0, 'XYZ');
    body.quaternion.mult(turn, body.quaternion); body.quaternion.normalize();
    zeroVelocity();
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
        const gain = constraint ? 36 : elapsed - released < 1.2 ? 2.8 : 7;
        rest.vmult(axis, motorVelocity); motorVelocity.scale(auto && !constraint ? speed : 0, motorVelocity);
        const damping = constraint ? 8 : 3.5;
        for (const key of ['x', 'y', 'z']) acceleration[key] = (sin > 1e-6 ? error[key] / sin * angle * gain : 0) - (body.angularVelocity[key] - motorVelocity[key]) * damping;
        // Convert requested angular acceleration through the body's inertia.
        inverse.vmult(acceleration, local);
        local.set(local.x * body.inertia.x, local.y * body.inertia.y, local.z * body.inertia.z);
        body.quaternion.vmult(local, torque); body.torque.vadd(torque, body.torque);
      }
      const angularSpeed = body.angularVelocity.length();
      if (angularSpeed > 3.2) body.angularVelocity.scale(3.2 / angularSpeed, body.angularVelocity);
      const linearSpeed = body.velocity.length();
      if (linearSpeed > 3) body.velocity.scale(3 / linearSpeed, body.velocity);
      world.step(h);
      body.quaternion.normalize();
    }
  }
  reset();
  return { body, world, reset, zeroVelocity, applyImpulse, beginDrag, moveDrag, endDrag, rotateManual, step,
    get phase() { return phase; }, get dragging() { return Boolean(constraint); } };
}
