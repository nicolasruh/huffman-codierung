const test = require('node:test');
const assert = require('node:assert');
const H = require('../js/huffman.js');
const L = require('../js/layout.js');

test('Haeufigkeiten und Baum fuer ABRAKADABRA', () => {
  const d = H.buildStates('ABRAKADABRA');
  assert.equal(d.total, 11);
  assert.equal(d.states.length, 5); // 5 Zeichen -> 4 Merges
  const root = d.states.at(-1).forest[0];
  assert.equal(root.weight, 11);
  const codes = H.assignCodes(root);
  assert.equal(codes.get('A').length, 1);
  const st = H.stats(d.freqs, codes, d.total);
  assert.equal(st.bits, 23);
});

test('Codes sind praefixfrei, Encode/Decode ist verlustfrei', () => {
  const text = 'Hallo Welt, das ist ein Test äöü!';
  const d = H.buildStates(text);
  const root = d.states.at(-1).forest[0];
  const codes = H.assignCodes(root);
  const list = [...codes.values()];
  for (const a of list) for (const b of list) if (a !== b) assert.ok(!b.startsWith(a));
  const bits = H.encode(text, codes).join('');
  assert.deepEqual(H.decode(bits, root), { text, error: null });
  assert.equal(H.decode(bits.slice(0, -1) + '2', root).error, 'invalid');
});

test('validateMerge', () => {
  const f = H.buildStates('AAAABBBCCD').states[0].forest; // D1 C2 B3 A4
  assert.equal(H.validateMerge(f, f[0], f[1]).ok, true);
  assert.equal(H.validateMerge(f, f[0], f[2]).ok, false);
  assert.equal(H.validateMerge(f, f[2], f[3]).key, 'errNotSmallest');
  assert.equal(H.validateMerge(f, f[0], f[2]).key, 'errNotSecond');
});

test('validateMerge bei Gleichstand', () => {
  const f = H.buildStates('AABBCC').states[0].forest;
  assert.deepEqual(H.validateMerge(f, f[1], f[2]), { ok: true, tie: true });
});

test('merge: kleinerer Knoten links', () => {
  const f = H.buildStates('AAAABBBCCD').states[0].forest;
  const p = H.merge(f[1], f[0], 99);
  assert.equal(p.left.weight, 1);
  assert.equal(p.weight, 3);
});

test('validateInsert', () => {
  const rest = H.buildStates('AAAABBBCCD').states[0].forest.slice(2); // B3 A4
  const node = { weight: 3 };
  assert.equal(H.validateInsert(rest, node, 0).ok, true);
  assert.equal(H.validateInsert(rest, node, 1).ok, true); // Gleichstand
  assert.equal(H.validateInsert(rest, node, 2).key, 'errInsertLeft');
  assert.equal(H.validateInsert(rest, { weight: 2 }, 1).key, 'errInsertLeft');
  assert.equal(H.validateInsert(rest, { weight: 5 }, 0).key, 'errInsertRight');
});

test('Layout: Wurzeln oben, Kinder tiefer', () => {
  const d = H.buildStates('ABRAKADABRA');
  const f = d.states[1].forest; // nach einem Schritt
  const lay = L.layoutForest(f);
  assert.ok(lay.roots.every(r => r.y === 0));
  assert.equal(lay.levels, 1);
  const full = L.layoutForest(d.states.at(-1).forest);
  assert.equal(full.nodes.length, 9);
  assert.equal(full.levels, 3);
});
