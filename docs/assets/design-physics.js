// Renderer-independent rigid-body simulation. Impulses act at the raycast point,
// Front-facing idle sway; full axial turns only follow an explicit push.
export const SWAY_SECONDS = 12;
export const SWAY_ANGLE = Math.PI / 10;
export const FLOAT_HEIGHT = .028;
export const FLOAT_PITCH = .012;
export const TURN_SECONDS = 4.5; // Nominal pushed turn, with physical acceleration/braking.
export const CLICK_IMPULSE = Object.freeze({ x: 0, y: .4, z: -20.8 });
export const MAX_TRANSLATION = .55;
export const MAX_HORIZONTAL_TRANSLATION = .12;
export const MAX_VERTICAL_TRANSLATION = .04;
export const MAX_SWING = .02;
export const REST_TILT_BOUND = 0;
export const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
export const canAnimate = ({ reduced, paused, visible, hidden, ready }) => ready && visible && !hidden && !reduced && !paused;

// Random targets, not random per-frame forces: each soft rise/fall has zero
// velocity and acceleration at both ends. All values use active simulation time.
export function createDesignFloat(random = Math.random) {
  let height = 0, pitch = 0, heightVelocity = 0, pitchVelocity = 0;
  let fromHeight = 0, fromPitch = 0, toHeight = 0, toPitch = 0, time = 0, duration = 0, direction = 1;
  const sample = () => { const value = Number(random()); return Number.isFinite(value) ? clamp(value, 0, 1) : .5; };
  function next() {
    fromHeight = height; fromPitch = pitch;
    toHeight = direction * FLOAT_HEIGHT * (.65 + sample() * .35);
    toPitch = -direction * FLOAT_PITCH * (.6 + sample() * .4);
    duration = 5.2 + sample() * 3;
    direction *= -1;
  }
  function reset() {
    height = pitch = heightVelocity = pitchVelocity = time = 0;
    direction = sample() < .5 ? -1 : 1;
    next();
  }
  function advance(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    time += Math.min(dt, .05);
    while (time >= duration) {
      time -= duration; height = toHeight; pitch = toPitch; next();
    }
    const t = time / duration;
    const ease = t * t * t * (10 + t * (-15 + t * 6));
    const velocity = 30 * t * t * (1 - t) * (1 - t) / duration;
    height = fromHeight + (toHeight - fromHeight) * ease;
    pitch = fromPitch + (toPitch - fromPitch) * ease;
    heightVelocity = (toHeight - fromHeight) * velocity;
    pitchVelocity = (toPitch - fromPitch) * velocity;
  }
  reset();
  return { reset, advance, get height() { return height; }, get pitch() { return pitch; },
    get heightVelocity() { return heightVelocity; }, get pitchVelocity() { return pitchVelocity; } };
}

export function createDesignPhysics(C, shapes, { random = Math.random } = {}) {
  const world = new C.World({ gravity: new C.Vec3(0, 0, 0), allowSleep: false });
  world.solver.iterations = 12;
  const body = new C.Body({ mass: 1.8, linearDamping: .45, angularDamping: .25, collisionFilterMask: 0 });
  for (const s of shapes) body.addShape(new C.Box(new C.Vec3(...s.half)), new C.Vec3(...s.center));
  world.addBody(body);
  const anchor = new C.Body({ type: C.Body.KINEMATIC, collisionFilterMask: 0 });
  world.addBody(anchor);
  const rest = new C.Quaternion();
  const target = rest.clone(), dragTarget = rest.clone(), spin = new C.Quaternion(), inverse = new C.Quaternion(), error = new C.Quaternion();
  const floatMotion = createDesignFloat(random), pitchTurn = new C.Quaternion(), pitchAxis = new C.Vec3(1, 0, 0);
  const axis = new C.Vec3(0, 1, 0), motorVelocity = new C.Vec3();
  const acceleration = new C.Vec3(), local = new C.Vec3(), torque = new C.Vec3();
  const restInverse = rest.conjugate();
  const relative = new C.Quaternion(), twist = new C.Quaternion(), twistInverse = new C.Quaternion(), swing = new C.Quaternion(), limited = new C.Quaternion();
  const swingAxis = new C.Vec3(), worldSwingAxis = new C.Vec3();
  let phase = 0, elapsed = 0, swayTime = 0, released = -10, constraint = null;
  let turn = null, recoveryOffset = 0, recoveryTime = 10;
  const speed = 2 * Math.PI / TURN_SECONDS;
  const swaySpeed = 2 * Math.PI / SWAY_SECONDS;
  const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
  const bodyYaw = () => { restInverse.mult(body.quaternion, relative); return 2 * Math.atan2(relative.y, relative.w); };
  const sway = () => SWAY_ANGLE * Math.sin(swayTime * swaySpeed);

  function recover(offset = wrap(bodyYaw() - sway())) {
    turn = null;
    recoveryOffset = offset; recoveryTime = 0;
    phase = sway() + recoveryOffset;
  }

  function startTurn() {
    rest.vmult(axis, motorVelocity);
    const momentum = body.angularVelocity.dot(motorVelocity);
    const direction = Math.abs(momentum) > .08 ? Math.sign(momentum) : 1;
    // Measure the body's actual travel, not the motor phase. Even a central
    // click with no lever arm must complete a revolution before returning.
    turn = { direction, travel: 0, previousYaw: bodyYaw() };
    phase = turn.previousYaw;
    recoveryOffset = 0;
  }

  function reset() {
    endDrag(true);
    phase = 0; elapsed = 0; swayTime = 0; released = -10;
    turn = null; recoveryOffset = 0; recoveryTime = 10;
    floatMotion.reset();
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
    if (carryTurn) startTurn();
    released = elapsed;
  }
  function spinImpulse(amount) {
    amount = clamp(amount, -1.2, 1.2);
    // Wheel input retains momentum and adopts the advanced angle before a
    // gradual recovery; no instant spring-back to the pre-scroll pose.
    body.quaternion.vmult(axis, motorVelocity);
    motorVelocity.scale(amount, motorVelocity);
    body.angularVelocity.vadd(motorVelocity, body.angularVelocity);
    recover(wrap(bodyYaw() - sway()) + amount * .8);
    released = elapsed;
  }
  function beginDrag(point) {
    endDrag(true);
    turn = null;
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
    if (constraint) { world.removeConstraint(constraint); constraint = null; released = elapsed; recover(); }
    if (cancelled) zeroVelocity();
  }
  function rotateManual(x, y) {
    const turn = new C.Quaternion().setFromEuler(x, y, 0, 'XYZ');
    body.quaternion.mult(turn, body.quaternion); body.quaternion.normalize();
    boundTilt();
    recover();
    zeroVelocity();
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
      let axialSpeed = 0;
      if (auto && !constraint) {
        swayTime += h;
        floatMotion.advance(h);
        if (turn) {
          // Ease the last part of the revolution, leaving enough momentum to
          // cross 360° rather than asymptotically stopping just short of it.
          const remaining = Math.max(0, Math.PI * 2 - turn.travel);
          axialSpeed = turn.direction * (.55 + (speed - .55) * clamp(remaining / .85, 0, 1));
          phase = bodyYaw() + turn.direction * .10;
        } else {
          recoveryTime += h;
          const drift = recoveryOffset * Math.exp(-recoveryTime / 1.6);
          phase = sway() + drift;
          axialSpeed = SWAY_ANGLE * swaySpeed * Math.cos(swayTime * swaySpeed) - drift / 1.6;
        }
      }
      spin.setFromAxisAngle(axis, phase);
      pitchTurn.setFromAxisAngle(pitchAxis, auto && !constraint ? floatMotion.pitch : 0);
      pitchTurn.mult(spin, spin); rest.mult(spin, target);
      // A spring holds the word in the composition without a visible support.
      for (const key of ['x', 'y', 'z']) {
        const position = key === 'y' && auto && !constraint ? floatMotion.height : 0;
        const velocity = key === 'y' && auto && !constraint ? floatMotion.heightVelocity : 0;
        body.force[key] += body.mass * ((position - body.position[key]) * 14 + (velocity - body.velocity[key]) * 5);
      }
      {
        body.quaternion.conjugate(inverse); (constraint ? dragTarget : target).mult(inverse, error);
        if (error.w < 0) { error.x *= -1; error.y *= -1; error.z *= -1; error.w *= -1; }
        const sin = Math.hypot(error.x, error.y, error.z);
        const angle = 2 * Math.atan2(sin, Math.max(0, error.w));
        const recovery = clamp((elapsed - released) / 1.8, 0, 1);
        const smooth = recovery * recovery * (3 - 2 * recovery);
        const gain = constraint ? 36 : 2.6 + smooth * 4.4;
        rest.vmult(axis, motorVelocity); motorVelocity.scale(axialSpeed, motorVelocity);
        if (auto && !constraint) motorVelocity.x += floatMotion.pitchVelocity;
        const damping = constraint ? 8 : 2.2 + smooth * 1.3;
        for (const key of ['x', 'y', 'z']) acceleration[key] = (sin > 1e-6 ? error[key] / sin * angle * gain : 0) - (body.angularVelocity[key] - motorVelocity[key]) * damping;
        // Convert requested angular acceleration through the body's inertia.
        inverse.vmult(acceleration, local);
        local.set(local.x * body.inertia.x, local.y * body.inertia.y, local.z * body.inertia.z);
        body.quaternion.vmult(local, torque); body.torque.vadd(torque, body.torque);
      }
      const angularSpeed = body.angularVelocity.length();
      if (angularSpeed > 6.4) body.angularVelocity.scale(6.4 / angularSpeed, body.angularVelocity);
      const linearSpeed = body.velocity.length();
      // Let the doubled click impulse act before damping, while keeping long
      // drags and repeated clicks bounded by the same translation envelope.
      if (linearSpeed > 12) body.velocity.scale(12 / linearSpeed, body.velocity);
      world.step(h);
      boundTilt();
      if (turn && auto && !constraint) {
        const yaw = bodyYaw();
        turn.travel += turn.direction * wrap(yaw - turn.previousYaw);
        turn.previousYaw = yaw;
        if (turn.travel >= Math.PI * 2) {
          recover();
          released = elapsed - 1.8;
        }
      }
      // Reserve one small, fixed movement envelope instead of moving the camera
      // away whenever a push or a long drag tips the word towards the frame.
      const displacement = body.position.length();
      if (displacement > MAX_TRANSLATION) {
        body.position.scale(MAX_TRANSLATION / displacement, body.position);
        body.position.scale(1 / MAX_TRANSLATION, local);
        const outward = body.velocity.dot(local);
        if (outward > 0) { local.scale(outward, local); body.velocity.vsub(local, body.velocity); }
      }
      for (const [key, limit] of [['x', MAX_HORIZONTAL_TRANSLATION], ['y', MAX_VERTICAL_TRANSLATION]]) {
        if (Math.abs(body.position[key]) > limit) {
          body.position[key] = Math.sign(body.position[key]) * limit;
          if (body.velocity[key] * body.position[key] > 0) body.velocity[key] = 0;
        }
      }
      body.quaternion.normalize();
    }
  }
  reset();
  return { body, world, reset, zeroVelocity, applyImpulse, spinImpulse, beginDrag, moveDrag, endDrag, rotateManual, step,
    floatMotion,
    get phase() { return phase; }, get dragging() { return Boolean(constraint); },
    get motion() { return turn ? 'turning' : Math.abs(recoveryOffset * Math.exp(-recoveryTime / 1.6)) > .025 ? 'recovering' : 'swaying'; } };
}
