// Extruded text normally shares one material across both flat caps. Separate
// them by their outward normals: only the front has a blue glass layer. That
// layer can be seen through the colourless rear, without colouring the rear cap.
export function separateDesignSurfaces(geometry) {
  const groups = geometry.groups.map((g) => ({ ...g }));
  const normal = geometry.getAttribute('normal');
  const index = geometry.getIndex();
  geometry.clearGroups();
  for (const group of groups) {
    if (group.materialIndex !== 0) { geometry.addGroup(group.start, group.count, 1); continue; }
    let start = group.start, material = null;
    const end = group.start + group.count;
    for (let n = group.start; n < end; n += 3) {
      const vertex = index ? index.getX(n) : n;
      const next = normal.getZ(vertex) > .5 ? 0 : 1;
      if (material !== null && next !== material) { geometry.addGroup(start, n - start, material); start = n; }
      material = next;
    }
    geometry.addGroup(start, end - start, material);
  }
}

export const DESIGN_SHAPE = Object.freeze({ size: 2, depth: .58, curveSegments: 24, bevelEnabled: false });
export const DESIGN_TRACKING = .04;
export const DESIGN_KERNING = Object.freeze({ DE: -.005, ES: -.025, SI: .01, IG: .005, GN: -.025 });
export const DESIGN_FRAME_FILL = .98;

// Shared by the live mesh and its inline first-paint silhouette. Keep glyph
// centring, horizontal scaling and optical kerning identical in both states.
export function createDesignWord(THREE, font) {
  const geometries = [], letterPositions = [], shapes = [], outlineOrigins = [];
  let cursor = 0, height = 0, depth = 0, previousCharacter = '';
  try {
    for (const character of 'DESIGN') {
      const geometry = new THREE.TextGeometry(character, { font, ...DESIGN_SHAPE });
      geometries.push(geometry);
      geometry.scale(.90, 1, 1); geometry.computeBoundingBox(); separateDesignSurfaces(geometry);
      const b = geometry.boundingBox;
      const w = b.max.x - b.min.x, h = b.max.y - b.min.y, d = b.max.z - b.min.z;
      const centerX = (b.max.x + b.min.x) / 2, centerY = (b.max.y + b.min.y) / 2;
      height = Math.max(height, h); depth = Math.max(depth, d);
      geometry.translate(-centerX, -centerY, -(b.max.z + b.min.z) / 2);
      cursor += DESIGN_KERNING[previousCharacter + character] || 0;
      const x = cursor + w / 2; cursor += w + DESIGN_TRACKING;
      previousCharacter = character;
      letterPositions.push(x); outlineOrigins.push({x:x-centerX,y:-centerY});
      shapes.push({ half: [w / 2, h / 2, d / 2], center: [x, 0, 0] });
    }
    const width = cursor - DESIGN_TRACKING;
    letterPositions.forEach((x, i) => { letterPositions[i] = x - width / 2; });
    outlineOrigins.forEach((origin) => { origin.x -= width / 2; });
    shapes.forEach((shape) => { shape.center[0] -= width / 2; });
    return { geometries, letterPositions, shapes, outlineOrigins, width, height, depth };
  } catch (error) { geometries.forEach((g) => g.dispose()); throw error; }
}

// The complete word fits at every permitted orientation, even after a strong push. Only
// viewport changes update this distance; animation never zooms the camera.
export function getDesignFraming({ width, height, depth, aspect, movement = .55, horizontalMovement = .12, verticalMovement = .04, tilt = .02 }) {
  const horizontalRadius = Math.hypot(width / 2, depth / 2);
  const halfHeight = height / 2;
  const radius = Math.hypot(horizontalRadius, halfHeight) + movement;
  // Support of a bounding cylinder whose axis stays inside the permitted tilt
  // cone. Unlike a full sphere, this leaves room for a legible logo-sized word.
  const support = (alongAxis, acrossAxis) => {
    const length = Math.hypot(alongAxis, acrossAxis);
    const minimum = Math.max(0, alongAxis * Math.cos(tilt) - acrossAxis * Math.sin(tilt));
    const maximum = Math.atan2(acrossAxis, alongAxis) <= tilt ? length : alongAxis * Math.cos(tilt) + acrossAxis * Math.sin(tilt);
    const optimum = halfHeight * length / Math.hypot(horizontalRadius, halfHeight);
    const projection = Math.max(minimum, Math.min(maximum, optimum));
    return horizontalRadius * Math.sqrt(Math.max(0, length * length - projection * projection)) + halfHeight * projection;
  };
  const minimumHalfHeight = (support(1, 0) + verticalMovement) / DESIGN_FRAME_FILL;
  const minimumHalfWidth = (support(0, 1) + horizontalMovement) / DESIGN_FRAME_FILL;
  const frameHalfHeight = Math.max(minimumHalfHeight, minimumHalfWidth / aspect);
  return { distance: radius + 4, halfHeight: frameHalfHeight, halfWidth: frameHalfHeight * aspect, radius, minimumHalfWidth, minimumHalfHeight };
}
