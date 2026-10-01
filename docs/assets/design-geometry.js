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

export const DESIGN_SHAPE = Object.freeze({ size: 2, depth: .58, curveSegments: 20,
  bevelEnabled: true, bevelThickness: .10, bevelSize: .085, bevelSegments: 8 });
export const DESIGN_TRACKING = .04;
export const DESIGN_KERNING = Object.freeze({ DE: -.005, ES: -.025, SI: .01, IG: .005, GN: -.025 });
export const DESIGN_FRAME_FILL = .96;

// The complete word fits at every permitted orientation, even after a strong push. Only
// viewport changes update this distance; animation never zooms the camera.
export function getDesignFraming({ width, height, depth, aspect, movement = .55, tilt = .50, fov = 30 }) {
  const horizontalRadius = Math.hypot(width / 2, depth / 2);
  const halfHeight = height / 2;
  const radius = Math.hypot(horizontalRadius, halfHeight) + movement;
  const vertical = fov * Math.PI / 360;
  // Support of a bounding cylinder whose axis stays inside the permitted tilt
  // cone. Unlike a full sphere, this leaves room for a legible logo-sized word.
  const support = (alongAxis, acrossAxis) => {
    const length = Math.hypot(alongAxis, acrossAxis);
    const minimum = Math.max(0, alongAxis * Math.cos(tilt) - acrossAxis * Math.sin(tilt));
    const maximum = Math.atan2(acrossAxis, alongAxis) <= tilt ? length : alongAxis * Math.cos(tilt) + acrossAxis * Math.sin(tilt);
    const optimum = halfHeight * length / Math.hypot(horizontalRadius, halfHeight);
    const projection = Math.max(minimum, Math.min(maximum, optimum));
    return horizontalRadius * Math.sqrt(Math.max(0, length * length - projection * projection)) + halfHeight * projection + movement * length;
  };
  return { distance: Math.max(support(1 / Math.tan(vertical), 1), support(0, Math.hypot(1 / (Math.tan(vertical) * aspect), 1))) / DESIGN_FRAME_FILL, radius };
}
