(function () {
  'use strict';

  const { t, setLang } = I18n;
  const H = Huffman;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const X = 70, Y = 90, M = 50, R = 20;

  const $ = id => document.getElementById(id);
  const el = {
    text: $('text'), lang: $('lang'), tree: $('tree'), message: $('message'),
    prev: $('prev'), next: $('next'), all: $('all'), undo: $('undo'), reset: $('reset'),
    results: $('results'), legend: $('legend'), encoded: $('encoded'), stats: $('stats'),
    bits: $('bits'), decoded: $('decoded'),
    reveal: $('reveal'), encode: $('encode'), spaced: $('spaced'),
    legendBox: $('legendBox'), encodeBox: $('encodeBox'),
  };

  const state = {
    mode: 'show',
    relative: false,
    data: null,     // {freqs, total, states} oder null bei ungueltiger Eingabe
    states: [],     // Zustaende des Aufbaus (Anzeige-Modus: alle vorberechnet, Bau-Modus: wachsend)
    idx: 0,         // aktueller Zustand im Anzeige-Modus
    selected: null, // im Bau-Modus gewaehlter Knoten
    msg: null,      // {key, cls, args, tie} im Bau-Modus
    revealed: false, // Codewoerter ausgelesen
    encoded: false,  // Text codiert
    leaf: null,      // angeklicktes Blatt
    hanging: null,   // {parent, rest, tie}: neuer Knoten haengt am Mauszeiger (Bau-Modus)
    mouse: { x: 0, y: 0 },
  };

  function current() {
    return state.mode === 'show' ? state.states[state.idx] : state.states[state.states.length - 1];
  }
  function isComplete() { return current().forest.length === 1; }

  // ---------- Hilfen fuer Anzeige ----------
  function fmt(w) {
    return state.relative ? (w / state.data.total).toFixed(2) : String(w);
  }
  function charLabel(ch) { return ch === ' ' ? '␣' : ch; }
  function nodeName(n) { return (n.left ? '' : "'" + charLabel(n.char) + "' ") + '(' + fmt(n.weight) + ')'; }
  function weightText(w) { return t(state.relative ? 'prob' : 'freq') + ' ' + fmt(w); }

  function svg(name, attrs, text) {
    const e = document.createElementNS(SVG_NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // ---------- Zustand ----------
  function resetStates() {
    state.selected = null;
    state.msg = null;
    state.hanging = null;
    clearCoding();
    state.idx = 0;
    state.states = state.mode === 'show' ? state.data.states : [state.data.states[0]];
  }

  function clearCoding() {
    state.revealed = false;
    state.encoded = false;
    state.leaf = null;
  }

  function pathTo(n, leaf) {
    if (n === leaf) return [n];
    if (!n.left) return null;
    const sub = pathTo(n.left, leaf) || pathTo(n.right, leaf);
    return sub && [n, ...sub];
  }

  function setText() {
    const text = el.text.value;
    const distinct = new Set([...text]).size;
    state.data = distinct >= 2 ? H.buildStates(text) : null;
    if (state.data) resetStates();
    render();
  }

  function svgPoint(ev) {
    const r = el.tree.querySelector('svg').getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function pushState(forest, parent) {
    state.states.push({ forest, merged: [parent.left, parent.right], parent });
  }

  function onNodeClick(node, ev) {
    const cur = current();
    if (state.mode !== 'build' || cur.forest.length === 1 || state.hanging) return;
    if (state.selected === node) {
      state.selected = null;
      state.msg = null;
    } else if (!state.selected) {
      state.selected = node;
      state.msg = { key: 'selected', cls: '', args: { a: node } };
    } else {
      const first = state.selected;
      const res = H.validateMerge(cur.forest, first, node);
      state.selected = null;
      if (res.ok) {
        const nextId = state.data.freqs.length + state.states.length - 1;
        const parent = H.merge(first, node, nextId);
        const rest = cur.forest.filter(n => n !== first && n !== node);
        if (rest.length === 0) {
          pushState([parent], parent);
          state.msg = null;
        } else {
          state.hanging = { parent, rest };
          state.mouse = svgPoint(ev);
          state.msg = { key: 'merged', cls: 'ok', args: { a: parent.left, b: parent.right, w: parent.weight }, tie: res.tie };
        }
      } else {
        state.msg = { key: res.key, cls: 'error', args: { w: res.weight, min: res.min } };
      }
    }
    render();
  }

  function onSlotClick(index) {
    const { parent, rest } = state.hanging;
    const res = H.validateInsert(rest, parent, index);
    if (res.ok) {
      pushState([...rest.slice(0, index), parent, ...rest.slice(index)], parent);
      state.hanging = null;
      state.msg = { key: 'inserted', cls: 'ok', args: {} };
    } else {
      state.msg = { key: res.key, cls: 'error', args: { w: res.weight, x: res.other } };
    }
    render();
  }

  // ---------- Rendering ----------
  function codingHint() {
    if (state.encoded) return t('hintDone');
    return t(state.revealed ? 'hintEncode' : 'hintLeaf');
  }

  function messageFor(cur) {
    const done = cur.forest.length === 1;
    if (state.mode === 'show') {
      if (state.idx === 0) return { text: t('infoShowStart'), cls: '' };
      const p = cur.parent;
      let text = t('stepMerge', { n: state.idx, a: nodeName(p.left), b: nodeName(p.right), w: weightText(p.weight) });
      if (done) text += ' ' + t('doneShow') + codingHint();
      return { text, cls: done ? 'ok' : '' };
    }
    if (done && (!state.msg || state.msg.cls === 'ok')) {
      return { text: t('doneBuild') + codingHint(), cls: 'ok' };
    }
    if (!state.msg) return { text: t('infoBuildStart'), cls: '' };
    const m = state.msg;
    const params = {};
    if (m.args.a) params.a = nodeName(m.args.a);
    if (m.args.b) params.b = nodeName(m.args.b);
    if (m.args.w !== undefined) params.w = weightText(m.args.w);
    if (m.args.min !== undefined) params.min = weightText(m.args.min);
    if (m.args.x !== undefined) params.x = fmt(m.args.x);
    if (m.args.w !== undefined && m.key.startsWith('errInsert')) params.w = fmt(m.args.w);
    return { text: t(m.key, params) + (m.tie ? t('mergedTie') : ''), cls: m.cls };
  }

  // Zeichnet ein Layout in die Gruppe g; (ox, oy) ist die Position von x=0, y=0.
  function drawLayout(g, lay, ox, oy, o) {
    const px = p => ox + p.x * X;
    const py = p => oy + p.y * Y;

    for (const e of lay.edges) {
      const a = lay.pos.get(e.parent);
      const b = lay.pos.get(e.child);
      const hl = o.path && o.path.includes(e.child) && o.path.includes(e.parent);
      g.appendChild(svg('line', { class: 'edge' + (hl ? ' hl' : ''), x1: px(a), y1: py(a), x2: px(b), y2: py(b) }));
      const mx = (px(a) + px(b)) / 2 + (e.bit === '0' ? -10 : 10);
      g.appendChild(svg('text', { class: 'edge-label', x: mx, y: (py(a) + py(b)) / 2 }, e.bit));
    }

    for (const p of lay.nodes) {
      const n = p.node;
      const isRoot = p.y === 0;
      const cls = ['node'];
      if (isRoot) cls.push('root');
      if (o.clickable && isRoot) cls.push('clickable');
      if (state.selected === n) cls.push('selected');
      if (o.hl === n) cls.push('hl');
      const g2 = svg('g', {});
      g2.appendChild(svg('circle', { cx: px(p), cy: py(p), r: R }));
      g2.appendChild(svg('text', { x: px(p), y: py(p) }, fmt(n.weight)));
      if (!n.left) {
        const leafClick = o.done && !state.revealed;
        if (o.done) cls.push('leaf');
        if (leafClick) cls.push('clickable');
        if (state.leaf === n) cls.push('sel');
        if (leafClick) g2.addEventListener('click', () => { state.leaf = state.leaf === n ? null : n; render(); });
        g2.appendChild(svg('rect', { class: 'leaf-box', x: px(p) - 16, y: py(p) + R + 8, width: 32, height: 28, rx: 4 }));
        g2.appendChild(svg('text', { class: 'leaf-char', x: px(p), y: py(p) + R + 22 }, charLabel(n.char)));
        if (o.codes && (state.revealed || state.leaf === n)) {
          g2.appendChild(svg('text', { class: 'leaf-code', x: px(p), y: py(p) + R + 52 }, o.codes.get(n.char)));
        }
      }
      g2.setAttribute('class', cls.join(' '));
      if (o.clickable && isRoot) g2.addEventListener('click', ev => onNodeClick(n, ev));
      g.appendChild(g2);
    }
  }

  // Der haengende Knoten sitzt unter dem Zeiger, damit dieser die Zahl nicht verdeckt
  const HANG_DY = R + 14;

  function renderTree(cur, codes) {
    const hang = state.hanging;
    const forest = hang ? hang.rest : cur.forest;
    const lay = HuffmanLayout.layoutForest(forest);
    const hangLay = hang ? HuffmanLayout.layoutForest([hang.parent]) : null;
    const levels = Math.max(lay.levels, hangLay ? hangLay.levels : 0);
    const hangWidth = hangLay ? (hangLay.width + 1) * X : 0;
    const width = Math.max(240, lay.width * X + 2 * M, el.tree.clientWidth - 2, hang ? state.mouse.x + hangWidth : 0);
    const height = levels * Y + 2 * M + 50;
    const s = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}` });
    const done = !hang && cur.forest.length === 1;
    const path = done && state.leaf ? pathTo(cur.forest[0], state.leaf) : null;

    drawLayout(s, lay, M, M, {
      done, codes, path, hl: hang ? null : cur.parent,
      clickable: state.mode === 'build' && !hang && cur.forest.length > 1,
    });

    if (hang) {
      const xs = lay.roots.map(r => M + r.x * X);
      for (let i = 0; i <= xs.length; i++) {
        const x = i === 0 ? xs[0] - X / 2 : i === xs.length ? xs[i - 1] + X / 2 : (xs[i - 1] + xs[i]) / 2;
        const g = svg('g', { class: 'slot' });
        g.appendChild(svg('rect', { class: 'mark', x: x - 10, y: M - R, width: 20, height: 2 * R }));
        g.appendChild(svg('rect', { class: 'hit', x: x - 20, y: M - R - 10, width: 40, height: 2 * R + 20 }));
        g.addEventListener('click', () => onSlotClick(i));
        s.appendChild(g);
      }
      const hg = svg('g', { class: 'hanging', transform: `translate(${state.mouse.x},${state.mouse.y + HANG_DY})` });
      drawLayout(hg, hangLay, -hangLay.roots[0].x * X, 0, { done: false, hl: hang.parent });
      s.appendChild(hg);
      s.addEventListener('pointermove', ev => {
        state.mouse = svgPoint(ev);
        hg.setAttribute('transform', `translate(${state.mouse.x},${state.mouse.y + HANG_DY})`);
      });
    }
    el.tree.replaceChildren(s);
  }

  function renderResults(cur) {
    const codes = H.assignCodes(cur.forest[0]);
    const { freqs, total } = state.data;

    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    for (const k of ['char', 'freq', 'prob', 'code']) {
      const th = document.createElement('th');
      th.textContent = t(k);
      head.appendChild(th);
    }
    const body = table.createTBody();
    for (const f of [...freqs].reverse()) {
      const r = body.insertRow();
      r.insertCell().textContent = charLabel(f.char);
      r.insertCell().textContent = f.count;
      r.insertCell().textContent = (f.count / total).toFixed(2);
      const c = r.insertCell();
      c.className = 'mono';
      c.textContent = codes.get(f.char);
    }
    el.legend.replaceChildren(table);
  }

  function renderEncoding(root, codes) {
    const { freqs, total } = state.data;
    el.encoded.textContent = H.encode(el.text.value, codes).join(el.spaced.checked ? ' ' : '');

    const st = H.stats(freqs, codes, total);
    const lines = [
      t('statBits', { bits: st.bits, raw: st.rawBits }),
      t('statSavings', { p: (st.savings * 100).toFixed(1) }),
      t('statAvg', { l: st.avg.toFixed(3) }),
      t('statEntropy', { h: st.entropy.toFixed(3) }),
    ];
    el.stats.replaceChildren(...lines.map(l => { const li = document.createElement('li'); li.textContent = l; return li; }));
    renderDecode(root);
  }

  function renderDecode(root) {
    const bits = el.bits.value.trim();
    if (!bits) { el.decoded.textContent = ''; return; }
    const res = H.decode(bits, root);
    if (res.error === 'invalid') el.decoded.textContent = t('decodeInvalid');
    else el.decoded.textContent = t('decodeResult') + ' ' + res.text + (res.error ? ' – ' + t('decodeIncomplete') : '');
  }

  function render() {
    for (const n of document.querySelectorAll('[data-i18n]')) n.textContent = t(n.dataset.i18n);
    for (const n of document.querySelectorAll('[data-i18n-placeholder]')) n.placeholder = t(n.dataset.i18nPlaceholder);
    document.documentElement.lang = I18n.getLang();
    document.title = t('title');

    const show = state.mode === 'show';
    el.prev.hidden = el.next.hidden = el.all.hidden = !show;
    el.undo.hidden = show;

    if (!state.data) {
      el.message.textContent = t('errTooFew');
      el.message.className = 'message error';
      el.tree.replaceChildren();
      el.results.hidden = true;
      el.reveal.hidden = el.encode.hidden = true;
      el.prev.disabled = el.next.disabled = el.all.disabled = el.undo.disabled = el.reset.disabled = true;
      return;
    }

    const cur = current();
    const done = isComplete();
    if (!done) clearCoding();
    const msg = messageFor(cur);
    el.message.textContent = msg.text;
    el.message.className = 'message ' + msg.cls;

    el.prev.disabled = state.idx === 0;
    el.next.disabled = el.all.disabled = done;
    el.undo.disabled = state.states.length <= 1 && !state.hanging;
    el.reset.disabled = false;

    el.reveal.hidden = el.encode.hidden = !done;
    el.reveal.disabled = state.revealed;
    el.encode.disabled = !state.revealed || state.encoded;

    const codes = done ? H.assignCodes(cur.forest[0]) : null;
    el.legendBox.hidden = !(done && state.revealed);
    el.encodeBox.hidden = !(done && state.encoded);
    el.results.hidden = el.legendBox.hidden && el.encodeBox.hidden;
    if (!el.legendBox.hidden) renderResults(cur);
    if (!el.encodeBox.hidden) renderEncoding(cur.forest[0], codes);
    renderTree(cur, codes);
  }

  // ---------- Ereignisse ----------
  const fit = () => {
    el.text.style.height = '';
    if (document.activeElement === el.text) el.text.style.height = el.text.scrollHeight + 2 + 'px';
  };
  el.text.addEventListener('input', () => {
    if (/[\r\n]/.test(el.text.value)) {
      const pos = el.text.selectionStart;
      el.text.value = el.text.value.replace(/[\r\n]/g, '');
      el.text.setSelectionRange(pos - 1, pos - 1);
    }
    fit();
    setText();
  });
  el.text.addEventListener('focus', fit);
  el.text.addEventListener('blur', () => { el.text.style.height = ''; el.text.scrollTop = 0; });
  el.text.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
  el.lang.addEventListener('change', () => { setLang(el.lang.value); render(); });
  el.bits.addEventListener('input', () => { if (state.data && isComplete() && state.encoded) renderDecode(current().forest[0]); });

  for (const r of document.querySelectorAll('input[name=mode]')) {
    r.addEventListener('change', () => { if (r.checked) { state.mode = r.value; if (state.data) resetStates(); render(); } });
  }
  for (const r of document.querySelectorAll('input[name=weight]')) {
    r.addEventListener('change', () => { if (r.checked) { state.relative = r.value === 'rel'; render(); } });
  }

  el.prev.addEventListener('click', () => { if (state.idx > 0) { state.idx--; render(); } });
  el.next.addEventListener('click', () => { if (!isComplete()) { state.idx++; render(); } });
  el.all.addEventListener('click', () => { state.idx = state.states.length - 1; render(); });
  el.undo.addEventListener('click', () => {
    if (state.hanging) state.hanging = null;
    else if (state.states.length > 1) state.states.pop();
    else return;
    state.selected = null;
    state.msg = null;
    render();
  });
  el.reveal.addEventListener('click', () => { state.revealed = true; state.leaf = null; render(); });
  el.encode.addEventListener('click', () => { state.encoded = true; render(); });
  el.spaced.addEventListener('change', render);
  el.reset.addEventListener('click', () => { resetStates(); render(); });

  setText();
})();
