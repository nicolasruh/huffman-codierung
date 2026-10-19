(function (root) {
  'use strict';

  // Layout eines Waldes: Wurzeln stehen alle oben (y = 0), Kinder je eine Ebene tiefer.
  // x = Position in Blatteinheiten; zwischen den Teilbaeumen bleibt eine kleine Luecke.
  const GAP = 0.4;

  function layoutForest(forest) {
    const nodes = [];
    const edges = [];
    const roots = [];
    let leaf = 0;
    let levels = 0;

    function place(n, depth) {
      let x;
      if (!n.left) {
        x = leaf++;
      } else {
        const l = place(n.left, depth + 1);
        const r = place(n.right, depth + 1);
        x = (l.x + r.x) / 2;
        edges.push({ parent: n, child: n.left, bit: '0' });
        edges.push({ parent: n, child: n.right, bit: '1' });
      }
      levels = Math.max(levels, depth);
      const p = { node: n, x, y: depth };
      nodes.push(p);
      return p;
    }

    forest.forEach((root, i) => {
      if (i > 0) leaf += GAP;
      roots.push(place(root, 0));
    });
    const pos = new Map(nodes.map(p => [p.node, p]));
    return { nodes, edges, roots, pos, width: Math.max(0, leaf - 1), levels };
  }

  const api = { layoutForest };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HuffmanLayout = api;
})(typeof self !== 'undefined' ? self : this);
