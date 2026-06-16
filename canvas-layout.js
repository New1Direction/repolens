// canvas-layout.js
// Pure seed-layout for the Blueprint scope. Left→right layered DAG.
// Ports diagram.js's cycle-safe depth relaxation; emits {x,y} not SVG.

const COL_W = 220, ROW_H = 110, PAD = 40;

/**
 * @param {object[]} nodes  scene nodes (mutated copies returned, inputs untouched)
 * @param {object[]} edges  scene edges
 * @returns {object[]} new node array with x/y assigned (pinned nodes keep theirs)
 */
export function layoutBlueprint(nodes, edges) {
  const ids = nodes.map((n) => n.id);
  const idset = new Set(ids);
  const valid = edges.filter((e) => idset.has(e.from) && idset.has(e.to));

  // depth = longest path from a root; bounded relaxation (cycle-safe)
  const depth = Object.fromEntries(ids.map((id) => [id, 0]));
  for (let i = 0; i < ids.length; i++) {
    let changed = false;
    for (const e of valid) if (depth[e.to] < depth[e.from] + 1) { depth[e.to] = depth[e.from] + 1; changed = true; }
    if (!changed) break;
  }

  const cols = {};
  ids.forEach((id) => { (cols[depth[id]] ||= []).push(id); });

  const pos = {};
  Object.keys(cols).forEach((d) => {
    const col = cols[d];
    col.forEach((id, i) => { pos[id] = { x: PAD + Number(d) * COL_W, y: PAD + i * ROW_H }; });
  });

  return nodes.map((n) => (n.pinned ? { ...n } : { ...n, x: pos[n.id].x, y: pos[n.id].y }));
}
