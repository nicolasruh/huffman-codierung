// Huffman-Logik (ohne DOM). Funktioniert im Browser (global `Huffman`) und in Node (module.exports).
(function (root) {
  'use strict';

  function cmpChar(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  // Haeufigkeiten, aufsteigend nach Anzahl, dann nach Zeichen (deterministisch).
  function countFrequencies(text) {
    const m = new Map();
    for (const ch of text) m.set(ch, (m.get(ch) || 0) + 1);
    return [...m]
      .map(([char, count]) => ({ char, count }))
      .sort((a, b) => a.count - b.count || cmpChar(a.char, b.char));
  }

  function makeLeaves(freqs) {
    return freqs.map((f, i) => ({ id: i, char: f.char, weight: f.count, left: null, right: null }));
  }

  function sortForest(forest) {
    return [...forest].sort((a, b) => a.weight - b.weight || a.id - b.id);
  }

  // Knoten sind unveraenderlich; id wird fortlaufend vergeben (aelter = kleinere id).
  function mergeNodes(a, b, id) {
    return { id, char: null, weight: a.weight + b.weight, left: a, right: b };
  }

  // Zustaende des Aufbaus: states[k] = Wald nach k Schritten.
  function buildStates(text) {
    const freqs = countFrequencies(text);
    let forest = sortForest(makeLeaves(freqs));
    let nextId = forest.length;
    const states = [{ forest, merged: null, parent: null }];
    while (forest.length > 1) {
      const [a, b] = forest;
      const parent = mergeNodes(a, b, nextId++);
      forest = sortForest([...forest.slice(2), parent]);
      states.push({ forest, merged: [a, b], parent });
    }
    return { freqs, total: [...text].length, states };
  }

  // Prueft, ob a und b zusammengefasst werden duerfen (die zwei kleinsten Knoten).
  // Ergebnis: {ok:true, tie:boolean} oder {ok:false, key, params}
  function validateMerge(forest, a, b) {
    const sorted = sortForest(forest);
    const w1 = sorted[0].weight;
    const w2 = sorted[1].weight;
    const [c1, c2] = [a.weight, b.weight].sort((x, y) => x - y);
    if (c1 !== w1) return { ok: false, key: 'errNotSmallest', weight: c1, min: w1 };
    if (c2 !== w2) return { ok: false, key: 'errNotSecond', weight: c2, min: w2 };
    const tie = sorted.length > 2 && sorted[2].weight === w2;
    return { ok: true, tie };
  }

  // Neuer Elternknoten; der kleinere Knoten kommt nach links, bei Gleichstand der zuerst geklickte.
  function merge(first, second, id) {
    const [l, r] = second.weight < first.weight ? [second, first] : [first, second];
    return mergeNodes(l, r, id);
  }

  // Einfuegen von node an Position index der aufsteigend sortierten Reihe rest.
  function validateInsert(rest, node, index) {
    if (index > 0 && rest[index - 1].weight > node.weight) {
      return { ok: false, key: 'errInsertLeft', weight: node.weight, other: rest[index - 1].weight };
    }
    if (index < rest.length && rest[index].weight < node.weight) {
      return { ok: false, key: 'errInsertRight', weight: node.weight, other: rest[index].weight };
    }
    return { ok: true };
  }

  function assignCodes(rootNode) {
    const codes = new Map();
    (function walk(n, prefix) {
      if (!n.left) { codes.set(n.char, prefix); return; }
      walk(n.left, prefix + '0');
      walk(n.right, prefix + '1');
    })(rootNode, '');
    return codes;
  }

  function encode(text, codes) {
    return [...text].map(ch => codes.get(ch));
  }

  // Liefert {text, error}: error ist null, 'invalid' (nicht nur 0/1) oder 'incomplete'.
  function decode(bits, rootNode) {
    const clean = bits.replace(/\s+/g, '');
    if (/[^01]/.test(clean)) return { text: '', error: 'invalid' };
    let out = '';
    let n = rootNode;
    for (const bit of clean) {
      n = bit === '0' ? n.left : n.right;
      if (!n.left) { out += n.char; n = rootNode; }
    }
    return { text: out, error: n === rootNode ? null : 'incomplete' };
  }

  function stats(freqs, codes, total) {
    let entropy = 0;
    let avg = 0;
    let bits = 0;
    for (const f of freqs) {
      const p = f.count / total;
      entropy -= p * Math.log2(p);
      avg += p * codes.get(f.char).length;
      bits += f.count * codes.get(f.char).length;
    }
    return { entropy, avg, bits, rawBits: total * 8, savings: 1 - bits / (total * 8) };
  }

  const api = {
    countFrequencies, buildStates, validateMerge, merge, validateInsert, sortForest,
    assignCodes, encode, decode, stats,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Huffman = api;
})(typeof self !== 'undefined' ? self : this);
