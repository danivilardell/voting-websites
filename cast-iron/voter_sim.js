(function () {
  var controls = document.getElementById('voter-sim-controls');
  var chartEl = document.getElementById('voter-sim-chart');
  if (!controls || !chartEl) return;

  var SVG = 'http://www.w3.org/2000/svg';

  var W = 700, H = 360;
  var M = { l: 52, r: 16, t: 16, b: 44 };
  var PW = W - M.l - M.r;
  var PH = H - M.t - M.b;

  var C_IGN  = '#6b8a3a';
  var C_DEF  = '#b87333';
  var C_COOP = '#2f5b73';

  var params = {
    delta: 0.75,
    epsilon: 0.50,
    p_c: 0.60,
    p_d: 0.40
  };

  var sliderDefs = [
    { key: 'delta',   label: 'Pivotality',          min: 0, max: 1, step: 0.01 },
    { key: 'epsilon', label: 'Evasion success',      min: 0, max: 1,   step: 0.01 },
    { key: 'p_c',     label: 'P(bribe | cooperate)', min: 0, max: 1,   step: 0.01 },
    { key: 'p_d',     label: 'P(bribe | defect)',    min: 0, max: 1,   step: 0.01 }
  ];

  // ---------- Build sliders ----------
  sliderDefs.forEach(function (d) {
    var wrap = document.createElement('div');
    wrap.className = 'voter-sim-slider';

    var lbl = document.createElement('label');
    var valSpan = document.createElement('span');
    valSpan.className = 'vs-val';
    valSpan.textContent = params[d.key].toFixed(2);

    var nameSpan = document.createElement('span');
    nameSpan.textContent = d.label;
    lbl.appendChild(nameSpan);
    lbl.appendChild(valSpan);

    var inp = document.createElement('input');
    inp.type = 'range';
    inp.min = d.min;
    inp.max = d.max;
    inp.step = d.step;
    inp.value = params[d.key];

    inp.addEventListener('input', function () {
      params[d.key] = parseFloat(inp.value);
      valSpan.textContent = params[d.key].toFixed(2);
      draw();
    });

    wrap.appendChild(lbl);
    wrap.appendChild(inp);
    controls.appendChild(wrap);
  });

  // ---------- SVG ----------
  function el(tag, attrs, parent) {
    var node = document.createElementNS(SVG, tag);
    if (attrs) Object.entries(attrs).forEach(function (kv) { node.setAttribute(kv[0], kv[1]); });
    if (parent) parent.appendChild(node);
    return node;
  }

  var svg = el('svg', {
    viewBox: '0 0 ' + W + ' ' + H,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img'
  });
  chartEl.appendChild(svg);

  var gridGroup = el('g', {}, svg);
  var bandGroup = el('g', {}, svg);
  var lineIgn  = el('path', { fill: 'none', stroke: C_IGN,  'stroke-width': 2.5, 'stroke-linecap': 'round' }, svg);
  var lineDef  = el('path', { fill: 'none', stroke: C_DEF,  'stroke-width': 2.5, 'stroke-linecap': 'round' }, svg);
  var lineCoop = el('path', { fill: 'none', stroke: C_COOP, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, svg);

  el('line', { x1: M.l, y1: M.t, x2: M.l, y2: M.t + PH, stroke: '#cfc8b3', 'stroke-width': 1 }, svg);
  el('line', { x1: M.l, y1: M.t + PH, x2: M.l + PW, y2: M.t + PH, stroke: '#cfc8b3', 'stroke-width': 1 }, svg);

  var xLabel = el('text', {
    x: M.l + PW / 2, y: H - 8,
    'text-anchor': 'middle',
    'font-family': 'Inter, sans-serif', 'font-size': '13', 'font-weight': '500', fill: '#444'
  }, svg);
  xLabel.textContent = 'Bribe offered to voter';

  var yLabel = el('text', {
    x: 14, y: M.t + PH / 2,
    'text-anchor': 'middle',
    'font-family': 'Inter, sans-serif', 'font-size': '13', 'font-weight': '500', fill: '#444',
    transform: 'rotate(-90 14 ' + (M.t + PH / 2) + ')'
  }, svg);
  yLabel.textContent = 'Expected utility';

  // Legend
  var legend = document.createElement('div');
  legend.className = 'voter-sim-legend';
  [
    { color: C_IGN,  label: 'Ignore' },
    { color: C_DEF,  label: 'Defect' },
    { color: C_COOP, label: 'Cooperate' }
  ].forEach(function (item) {
    var li = document.createElement('span');
    li.className = 'vs-lg-item';
    var sw = document.createElement('span');
    sw.className = 'vs-lg-swatch';
    sw.style.background = item.color;
    var t = document.createElement('span');
    t.textContent = item.label;
    li.appendChild(sw);
    li.appendChild(t);
    legend.appendChild(li);
  });
  chartEl.appendChild(legend);

  // ---------- Computation ----------
  var N = 300;

  function compute() {
    var delta = params.delta;
    var pivot0 = 0.5 + delta / 2;
    var pivot1 = 0.5 - delta / 2;
    var eps = params.epsilon;
    var pc = params.p_c;
    var pd = params.p_d;

    var bmax = 3;

    var bArr = [], ignArr = [], defArr = [], coopArr = [];
    for (var i = 0; i <= N; i++) {
      var b = (i / N) * bmax;
      bArr.push(b);
      ignArr.push(pivot0);
      defArr.push(pd * b + (eps * pivot0 + (1 - eps) * pivot1));
      coopArr.push(pc * b + pivot1);
    }
    return { b: bArr, ign: ignArr, def: defArr, coop: coopArr, bmax: bmax };
  }

  // ---------- Drawing ----------
  function xScale(v, bmax) { return M.l + (v / bmax) * PW; }
  function yScale(v, ymin, ymax) { return M.t + PH - ((v - ymin) / (ymax - ymin)) * PH; }

  function makePath(xs, ys, bmax, ymin, ymax) {
    var d = '';
    for (var i = 0; i < xs.length; i++) {
      d += (i === 0 ? 'M' : 'L') + xScale(xs[i], bmax).toFixed(1) + ' ' + yScale(ys[i], ymin, ymax).toFixed(1) + ' ';
    }
    return d.trim();
  }

  function draw() {
    var data = compute();
    var bmax = data.bmax;

    var allVals = data.ign.concat(data.def, data.coop);
    var ymin = Math.min.apply(null, allVals);
    var ymax = Math.max.apply(null, allVals);
    var margin = Math.max(0.05, (ymax - ymin) * 0.12);
    ymin -= margin;
    ymax += margin;

    gridGroup.innerHTML = '';
    var yStep = niceStep(ymax - ymin, 5);
    var yStart = Math.ceil(ymin / yStep) * yStep;
    for (var yv = yStart; yv <= ymax; yv += yStep) {
      var yy = yScale(yv, ymin, ymax);
      el('line', { x1: M.l, y1: yy, x2: M.l + PW, y2: yy, stroke: '#ece6d3', 'stroke-width': 1, 'stroke-dasharray': '2 3' }, gridGroup);
      var yt = el('text', { x: M.l - 6, y: yy + 4, 'text-anchor': 'end', 'font-family': 'Inter, sans-serif', 'font-size': '11', fill: '#888' }, gridGroup);
      yt.textContent = yv.toFixed(2);
    }
    var xStep = niceStep(bmax, 6);
    for (var xv = 0; xv <= bmax + 0.001; xv += xStep) {
      var xx = xScale(xv, bmax);
      el('line', { x1: xx, y1: M.t, x2: xx, y2: M.t + PH, stroke: '#ece6d3', 'stroke-width': 1, 'stroke-dasharray': '2 3' }, gridGroup);
      var xt = el('text', { x: xx, y: M.t + PH + 16, 'text-anchor': 'middle', 'font-family': 'Inter, sans-serif', 'font-size': '11', fill: '#888' }, gridGroup);
      xt.textContent = xv.toFixed(1);
    }

    bandGroup.innerHTML = '';
    for (var i = 0; i < N; i++) {
      var best = Math.max(data.ign[i], data.def[i], data.coop[i]);
      var color;
      if (best === data.ign[i]) color = C_IGN;
      else if (best === data.def[i]) color = C_DEF;
      else color = C_COOP;
      var x1 = xScale(data.b[i], bmax);
      var x2 = xScale(data.b[i + 1] || data.b[i], bmax);
      el('rect', { x: x1, y: M.t, width: Math.max(1, x2 - x1 + 0.5), height: PH, fill: color, opacity: '0.08' }, bandGroup);
    }

    lineIgn.setAttribute('d', makePath(data.b, data.ign, bmax, ymin, ymax));
    lineDef.setAttribute('d', makePath(data.b, data.def, bmax, ymin, ymax));
    lineCoop.setAttribute('d', makePath(data.b, data.coop, bmax, ymin, ymax));
  }

  function niceStep(range, targetTicks) {
    var raw = range / targetTicks;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    if (norm < 1.5) return mag;
    if (norm < 3) return 2 * mag;
    if (norm < 7) return 5 * mag;
    return 10 * mag;
  }

  draw();
})();
