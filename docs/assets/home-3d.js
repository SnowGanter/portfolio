import { createDesignPhysics, canAnimate, clamp, CLICK_IMPULSE, MAX_TRANSLATION, MAX_SWING, REST_TILT_BOUND } from './design-physics.js?v=b5bfd2c13518';
import { createDesignWord, getDesignFraming } from './design-geometry.js?v=b5bfd2c13518';
import { createDesignGlass } from './design-glass.js?v=b5bfd2c13518';

const stage = document.querySelector('[data-design-stage]');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

// Main content remains visible if either JavaScript or WebGL fails.
if ('IntersectionObserver' in window) {
  const reveal = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      reveal.unobserve(entry.target);
      if (!reduced.matches) {
        const animation = entry.target.animate([{ opacity: .5, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
          { duration: 550, easing: 'cubic-bezier(.2,.7,.25,1)' });
        const finish = () => animation.finish();
        reduced.addEventListener('change', finish, { once: true });
        animation.finished.then(() => reduced.removeEventListener('change', finish)).catch(() => {});
      }
    }
  }, { threshold: .08 });
  document.querySelectorAll('[data-home-reveal], .home-selected .work-card').forEach((element) => reveal.observe(element));
}
if (stage) initialize(stage).catch(() => {});

async function initialize(stage) {
  const canvas = stage.querySelector('canvas');
  let renderer, glassRenderer, observer, resizeObserver, physics;
  const geometries = [];
  let frame = 0, previous = 0, visible = true, paused = false, ready = false, failed = false;
  let drag = null, hoverTime = 0, hoverPoint = null;
  const enabled = () => canAnimate({ reduced: reduced.matches, paused, visible, hidden: document.hidden, ready });
  const fallback = () => {
    if (failed) return;
    failed = true; ready = false; cancelAnimationFrame(frame); frame = 0;
    stage.dataset.designState = 'fallback'; stage.classList.remove('is-3d-ready');
    canvas.hidden = true; canvas.tabIndex = -1;
    observer?.disconnect(); resizeObserver?.disconnect();
    glassRenderer?.dispose(); geometries.forEach((g) => g.dispose()); renderer?.dispose();
  };
  try {
    const probe = document.createElement('canvas').getContext('webgl2');
    if (!probe) return fallback();
    probe.getExtension('WEBGL_lose_context')?.loseContext();
    const [THREE, C] = await Promise.all([import('./vendor/three.js?v=b5bfd2c13518'), import('./vendor/cannon.js?v=b5bfd2c13518')]);
    const response = await fetch(new URL('./fonts/design.typeface.json?v=b5bfd2c13518', import.meta.url), { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Font unavailable');
    const font = new THREE.FontLoader().parse(await response.json());
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
    const group = new THREE.Group();
    const word = createDesignWord(THREE, font);
    const { letterPositions, shapes, width, height, depth } = word;
    geometries.push(...word.geometries);
    physics = createDesignPhysics(C, shapes);
    glassRenderer = createDesignGlass(THREE, renderer, geometries, letterPositions);
    const letters = glassRenderer.letters;
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 100);
    const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const handlePoint = new THREE.Vector3(), handleRotation = new THREE.Quaternion();
    const paint = () => {
      if (!ready || failed) return;
      const { position: p, quaternion: q } = physics.body;
      group.position.set(p.x, p.y, p.z); group.quaternion.set(q.x, q.y, q.z, q.w);
      glassRenderer.paint(camera, group.position, group.quaternion);
      canvas.dataset.pose = [q.x, q.y, q.z, q.w].map((n) => n.toFixed(4)).join(',');
      canvas.dataset.phase = physics.phase.toFixed(4);
      canvas.dataset.position = [p.x, p.y, p.z].map((n) => n.toFixed(4)).join(',');
      canvas.dataset.float = [physics.floatMotion.height, physics.floatMotion.pitch].map((n) => n.toFixed(4)).join(',');
      canvas.dataset.cameraDistance = camera.position.z.toFixed(4);
      canvas.dataset.frameWidth = (camera.right - camera.left).toFixed(4);
      canvas.dataset.wordFill = (width / (camera.right - camera.left)).toFixed(4);
      canvas.dataset.glassMode = 'single-exterior-depth-composite';
      canvas.dataset.glassFlow = glassRenderer.flow.toFixed(4);
      canvas.setAttribute('aria-pressed', String(paused || reduced.matches));
    };
    const stop = () => {
      cancelAnimationFrame(frame); frame = 0; previous = 0;
      if (!failed) stage.dataset.designState = reduced.matches ? 'reduced' : paused ? 'paused' : 'suspended';
    };
    const tick = (time) => {
      frame = 0;
      if (!enabled()) return stop();
      const delta = previous ? clamp((time - previous) / 1000, 0, .05) : 1 / 60;
      physics.step(delta); glassRenderer.advance(delta); previous = time;
      paint(); stage.dataset.designState = drag ? 'dragging' : physics.motion;
      frame = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (enabled() && !frame) { previous = 0; frame = requestAnimationFrame(tick); }
      else if (ready) paint();
    };
    const resize = () => {
      const { width: w, height: h } = canvas.getBoundingClientRect();
      if (!w || !h || failed) return;
      const framing = getDesignFraming({ width, height, depth, aspect: w / h, movement: MAX_TRANSLATION, tilt: MAX_SWING + REST_TILT_BOUND });
      camera.left = -framing.halfWidth; camera.right = framing.halfWidth;
      camera.top = framing.halfHeight; camera.bottom = -framing.halfHeight;
      camera.position.set(0, 0, framing.distance);
      camera.updateProjectionMatrix(); renderer.setSize(w, h, false); glassRenderer.resize(w, h); paint();
    };
    const setRay = (event) => {
      const rect = canvas.getBoundingClientRect();
      ndc.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
    };
    const hit = (event) => { setRay(event); return raycaster.intersectObjects(letters, false)[0]; };
    canvas.addEventListener('pointerdown', (event) => {
      canvas.dataset.inputMode = 'pointer';
      if (!ready || event.button !== 0) return;
      const contact = hit(event);
      if (!contact) return;
      canvas.focus({ preventScroll: true });
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
        point: contact.point.clone(), moved: false, orientation: group.quaternion.clone(), origin: group.position.clone(),
        local: contact.point.clone().sub(group.position).applyQuaternion(group.quaternion.clone().invert()) };
      physics.beginDrag(contact.point);
      canvas.setPointerCapture(event.pointerId); canvas.classList.add('is-grabbing');
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!ready || failed) return;
      if (drag && event.pointerId === drag.id) {
        drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5;
        if (!enabled()) physics.rotateManual((event.clientY - drag.y) * .0075, (event.clientX - drag.x) * .012);
        else {
          // The grabbed point follows a virtual trackball rather than a flat
          // screen plane, so sideways drags naturally turn the word in depth.
          handleRotation.setFromEuler(new THREE.Euler((event.clientY - drag.startY) * .0075, (event.clientX - drag.startX) * .012, 0));
          handleRotation.premultiply(drag.orientation);
          handlePoint.copy(drag.local).applyQuaternion(handleRotation).add(drag.origin);
          physics.moveDrag(handlePoint, handleRotation);
        }
        drag.x = event.clientX; drag.y = event.clientY; paint(); wake();
      } else if (event.pointerType === 'mouse') {
        const contact = hit(event);
        canvas.classList.toggle('is-over-word', Boolean(contact));
        const time = performance.now();
        if (contact && hoverPoint && enabled() && time - hoverTime > 250 && Math.hypot(event.movementX, event.movementY) > 5) {
          physics.applyImpulse(contact.point, { x: clamp(event.movementX * .008, -.12, .12), y: clamp(-event.movementY * .008, -.1, .1), z: -.12 });
          hoverTime = time;
        }
        hoverPoint = contact?.point || null;
      }
    });
    const endDrag = (event, cancelled = false) => {
      if (!drag || event.pointerId !== drag.id) return;
      const current = drag; drag = null;
      physics.endDrag(cancelled);
      canvas.classList.remove('is-grabbing');
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (!cancelled && !current.moved) {
        if (enabled()) physics.applyImpulse(current.point, CLICK_IMPULSE, { carryTurn: true });
        else physics.rotateManual(0, .18);
      }
      if (!enabled()) physics.zeroVelocity();
      wake();
    };
    canvas.addEventListener('pointerup', (e) => endDrag(e));
    canvas.addEventListener('pointercancel', (e) => endDrag(e, true));
    canvas.addEventListener('lostpointercapture', (e) => endDrag(e, true));
    canvas.addEventListener('wheel', (event) => {
      if (!ready || failed || drag || event.ctrlKey || !hit(event)) return;
      // Never capture page scrolling over the empty part of the canvas, or a
      // Ctrl+wheel / trackpad pinch used to zoom the browser.
      const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * factor;
      if (Math.abs(delta) < .1) return;
      event.preventDefault(); canvas.dataset.inputMode = 'pointer';
      canvas.focus({ preventScroll: true });
      const amount = clamp(delta * .006, -1.2, 1.2);
      if (enabled()) physics.spinImpulse(amount); else physics.rotateManual(0, amount * .45);
      paint(); wake();
    }, { passive: false });
    window.addEventListener('keydown', (event) => { if (event.key === 'Tab') canvas.dataset.inputMode = 'keyboard'; });
    canvas.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter', 'Home', 'Escape'].includes(event.key)) return;
      event.preventDefault();
      canvas.dataset.inputMode = 'keyboard';
      if (event.key === 'Home') physics.reset();
      else if (event.key === ' ' || event.key === 'Escape') {
        paused = event.key === 'Escape' || !paused;
        physics.endDrag(true); stop();
      } else if (event.key === 'Enter') {
        if (enabled()) physics.applyImpulse({ x: width * .28, y: .15, z: .45 }, CLICK_IMPULSE, { carryTurn: true });
        else physics.rotateManual(0, .18);
      } else {
        const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
        const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
        physics.rotateManual(vertical ? direction * .12 : 0, vertical ? 0 : direction * .12);
      }
      paint(); wake();
    });
    reduced.addEventListener('change', () => { physics.reset(); stop(); paint(); wake(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { physics.endDrag(true); stop(); } else wake(); });
    observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) wake(); else { physics.endDrag(true); stop(); }
    }, { threshold: .01 });
    canvas.hidden = false; observer.observe(canvas);
    resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas);
    canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); fallback(); });
    window.addEventListener('pagehide', () => { physics.endDrag(true); stop(); });
    window.addEventListener('pageshow', wake);
    // Size the camera and draw the exact first frame before replacing the SVG.
    // The canvas is absolutely positioned; it never participates in page layout.
    ready = true; resize(); stage.classList.add('is-3d-ready'); wake();
    if (reduced.matches) stop();
  } catch { fallback(); }
}
