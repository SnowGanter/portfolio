import { createDesignPhysics, canAnimate, clamp } from './design-physics.js?v=f7881c8bb529';
import { separateDesignSurfaces } from './design-geometry.js?v=f7881c8bb529';

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
  let renderer, environment, observer, resizeObserver, physics;
  const geometries = [], materials = [];
  let frame = 0, previous = 0, visible = true, paused = false, ready = false, failed = false;
  let drag = null, hoverTime = 0, hoverPoint = null;
  const enabled = () => canAnimate({ reduced: reduced.matches, paused, visible, hidden: document.hidden, ready });
  const fallback = () => {
    if (failed) return;
    failed = true; ready = false; cancelAnimationFrame(frame); frame = 0;
    stage.dataset.designState = 'fallback'; stage.classList.remove('is-3d-ready');
    canvas.hidden = true; canvas.tabIndex = -1;
    observer?.disconnect(); resizeObserver?.disconnect();
    geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose());
    environment?.dispose(); renderer?.dispose();
  };
  try {
    const probe = document.createElement('canvas').getContext('webgl2');
    if (!probe) return fallback();
    probe.getExtension('WEBGL_lose_context')?.loseContext();
    const [THREE, C] = await Promise.all([import('./vendor/three.js?v=f7881c8bb529'), import('./vendor/cannon.js?v=f7881c8bb529')]);
    const response = await fetch(new URL('./fonts/design.typeface.json?v=f7881c8bb529', import.meta.url), { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Font unavailable');
    const font = new THREE.FontLoader().parse(await response.json());
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
    const scene = new THREE.Scene();
    // Studio reflections light only the geometry: no backdrop, floor or halo.
    const studio = new THREE.RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    environment = pmrem.fromScene(studio, .06, .1, 100, { size: 128 });
    scene.environment = environment.texture; scene.environmentIntensity = .45;
    studio.dispose(); pmrem.dispose();
    // One tinted front surface and one clear outer shell. No screen-space
    // refraction: it displaced the blue layer and exposed phantom inner edges.
    // DoubleSide is only for seeing the SAME front layer through the clear rear.
    const front = new THREE.MeshPhysicalMaterial({ color: 0x1938cd, roughness: .23, metalness: 0,
      clearcoat: .35, clearcoatRoughness: .13, envMapIntensity: .45,
      side: THREE.DoubleSide, forceSinglePass: true,
      transparent: true, opacity: .84, depthWrite: false, depthTest: false });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .07, metalness: 0,
      ior: 1.46, clearcoat: 1, clearcoatRoughness: .04, envMapIntensity: 1.2,
      transparent: true, opacity: 1, depthWrite: false });
    // Keep only exterior-facing surfaces. The centre is almost clear; grazing
    // angles catch the studio light, describing a single solid glass silhouette.
    glass.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
        'diffuseColor.a *= mix(0.035, 0.42, pow(1.0 - abs(dot(normal, geometryViewDir)), 3.0));\n#include <opaque_fragment>');
    };
    glass.customProgramCacheKey = () => 'design-clear-outer-surface-v1';
    materials.push(front, glass);
    const group = new THREE.Group(); scene.add(group);
    const letters = [], shapes = [];
    let cursor = 0, height = 0;
    for (const character of 'DESIGN') {
      const geometry = new THREE.TextGeometry(character, { font, size: 2, depth: .72, curveSegments: 16,
        bevelEnabled: true, bevelThickness: .09, bevelSize: .065, bevelSegments: 6 });
      geometries.push(geometry); geometry.computeBoundingBox();
      separateDesignSurfaces(geometry);
      const b = geometry.boundingBox;
      const w = b.max.x - b.min.x, h = b.max.y - b.min.y, d = b.max.z - b.min.z;
      height = Math.max(height, h);
      geometry.translate(-(b.max.x + b.min.x) / 2, -(b.max.y + b.min.y) / 2, -(b.max.z + b.min.z) / 2);
      // Composite the blue surface after the exterior highlights. Shell walls
      // must not show up as inner ribs across the coloured face viewed from back.
      const faceGeometry = geometry.clone(); geometries.push(faceGeometry);
      faceGeometry.groups = faceGeometry.groups.filter((g) => g.materialIndex === 0);
      geometry.groups = geometry.groups.filter((g) => g.materialIndex === 1);
      const shell = new THREE.Mesh(geometry, materials);
      const face = new THREE.Mesh(faceGeometry, materials);
      shell.renderOrder = 1; face.renderOrder = 2;
      shell.position.x = face.position.x = cursor + w / 2; cursor += w + .09;
      letters.push(shell, face); group.add(shell, face);
      shapes.push({ half: [w / 2, h / 2, d / 2], center: [face.position.x, 0, 0] });
    }
    const width = cursor - .09;
    letters.forEach((mesh) => { mesh.position.x -= width / 2; });
    shapes.forEach((shape) => { shape.center[0] -= width / 2; });
    physics = createDesignPhysics(C, shapes);
    const camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
    const key = new THREE.DirectionalLight(0xffffff, 1.8); key.position.set(-4, 7, 8); scene.add(key);
    const fill = new THREE.DirectionalLight(0xe3eaff, .5); fill.position.set(6, 2, 4); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 1.5); rim.position.set(2, 4, -7); scene.add(rim);
    scene.add(new THREE.AmbientLight(0xffffff, .25));
    const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const handlePoint = new THREE.Vector3(), handleRotation = new THREE.Quaternion();
    const corner = new THREE.Vector3();
    let baseDistance = 12;
    const paint = () => {
      if (!ready || failed) return;
      const { position: p, quaternion: q } = physics.body;
      group.position.set(p.x, p.y, p.z); group.quaternion.set(q.x, q.y, q.z, q.w);
      const tan = Math.tan(camera.fov * Math.PI / 360);
      let fitDistance = baseDistance;
      // Fit the actual orientation, including perspective depth, when a strong
      // impulse tips the long word vertically. Returning zoom is gently damped.
      for (const x of [-width / 2, width / 2]) for (const y of [-height / 2, height / 2]) for (const z of [-.45, .45]) {
        corner.set(x, y, z).applyQuaternion(group.quaternion).add(group.position);
        fitDistance = Math.max(fitDistance, Math.abs(corner.x) / (tan * camera.aspect * .88) + corner.z,
          Math.abs(corner.y) / (tan * .88) + corner.z);
      }
      camera.position.z = fitDistance > camera.position.z ? fitDistance : camera.position.z + (fitDistance - camera.position.z) * .045;
      renderer.render(scene, camera);
      canvas.dataset.pose = [q.x, q.y, q.z, q.w].map((n) => n.toFixed(4)).join(',');
      canvas.dataset.phase = physics.phase.toFixed(4);
      canvas.dataset.position = [p.x, p.y, p.z].map((n) => n.toFixed(4)).join(',');
      canvas.setAttribute('aria-pressed', String(paused || reduced.matches));
    };
    const stop = () => {
      cancelAnimationFrame(frame); frame = 0; previous = 0;
      if (!failed) stage.dataset.designState = reduced.matches ? 'reduced' : paused ? 'paused' : 'suspended';
    };
    const tick = (time) => {
      frame = 0;
      if (!enabled()) return stop();
      physics.step(previous ? (time - previous) / 1000 : 1 / 60); previous = time;
      paint(); stage.dataset.designState = drag ? 'dragging' : 'rotating';
      frame = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (enabled() && !frame) { previous = 0; frame = requestAnimationFrame(tick); }
      else if (ready) paint();
    };
    const resize = () => {
      const { width: w, height: h } = canvas.getBoundingClientRect();
      if (!w || !h || failed) return;
      camera.aspect = w / h;
      const halfFov = camera.fov * Math.PI / 360;
      // Keep the complete spinning body in frame at portrait breakpoints.
      const radius = Math.hypot(width / 2, .45);
      baseDistance = radius * Math.sqrt(1 + 1 / (Math.tan(halfFov) * camera.aspect * .84) ** 2) + .3;
      camera.position.set(0, 0, baseDistance);
      camera.updateProjectionMatrix(); renderer.setSize(w, h, false); paint();
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
        if (enabled()) physics.applyImpulse(current.point, { x: 0, y: .1, z: -5.2 });
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
        if (enabled()) physics.applyImpulse({ x: width * .28, y: .15, z: .45 }, { x: 0, y: 0, z: -5.2 });
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
    ready = true; stage.classList.add('is-3d-ready'); resize(); wake();
    if (reduced.matches) stop();
  } catch { fallback(); }
}
