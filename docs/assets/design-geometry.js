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
