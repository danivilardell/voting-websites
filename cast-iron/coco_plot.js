(function () {
  var root = document.querySelector('#coco .coco-plot');
  if (!root) return;

  var descBox = document.querySelector('#coco .coco-description');
  var SVG = 'http://www.w3.org/2000/svg';

  var prefersReduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var W = 860, H = 440;
  var M = { l: 72, r: 200, t: 24, b: 60 };
  var PLOT_W = W - M.l - M.r;
  var PLOT_H = H - M.t - M.b;

  var xMin = 0, xMax = 1;
  var yMin = 1, yMax = 35;

  function xScale(p) { return M.l + (p - xMin) / (xMax - xMin) * PLOT_W; }
  function yScale(c) { return M.t + PLOT_H - (c - yMin) / (yMax - yMin) * PLOT_H; }

  function el(tag, attrs, parent) {
    var node = document.createElementNS(SVG, tag);
    if (attrs) Object.entries(attrs).forEach(function (kv) { node.setAttribute(kv[0], kv[1]); });
    if (parent) parent.appendChild(node);
    return node;
  }

  var COLORS = {
    cast_iron: '#8a6d1f',
    loki: '#b87333',
    revoting: '#6b8a3a',
    revoting_adv: '#2f5b73'
  };

  var CURVES = [
    {
      key: 'cast_iron_ratio', name: 'Cast Iron', color: COLORS.cast_iron, width: 3.5,
      desc: '<strong>Evasion success: 100%. Detection gap: 4%.</strong><br>Voters register before coercion begins, so evasion always succeeds. Detection is limited to empirical CTC leakage from the ECDSA-nonce construction.'
    },
    {
      key: 'loki_ratio', name: 'Loki', color: COLORS.loki, width: 2.8,
      desc: '<strong>Evasion success: 80%. Detection gap: 4%.</strong><br>(<a href="https://eprint.iacr.org/2023/1876.pdf" target="_blank" rel="noopener">Loki paper</a>) Vulnerable to brute-force attacks on ballot indices under realistic revoting patterns (<a href="https://arxiv.org/pdf/2604.00188" target="_blank" rel="noopener">Qiao et al.</a>). The adversary observes per-voter noise and real ballot counts, giving a detection gap on par with Cast Iron.'
    },
    {
      key: 'revoting_adv_ratio', name: 'Revoting (voter adv.)', color: COLORS.revoting_adv, width: 2.8,
      desc: '<strong>Evasion success: 70%. Detection gap: 1%.</strong><br>The voter has a network-latency advantage in the last-ballot race. Only aggregate ballot volume is leaked, so the detection gap is low.'
    },
    {
      key: 'revoting_ratio', name: 'Revoting', color: COLORS.revoting, width: 2.8,
      desc: '<strong>Evasion success: 50%. Detection gap: 1%.</strong><br>The last-ballot race is modeled as a coin flip with no voter advantage. Only aggregate ballot volume is leaked.'
    }
  ];

  var activeKey = null;

  function showDescription(html, key) {
    if (!descBox) return;
    activeKey = key;
    descBox.innerHTML = html;
    descBox.classList.add('visible');
  }

  function hideDescription(key) {
    if (!descBox) return;
    if (activeKey !== key) return;
    activeKey = null;
    descBox.innerHTML = 'Click a curve or label to see its parameters and threat model.';
    descBox.classList.remove('visible');
  }

  function parseCSV(text) {
    var lines = text.trim().split('\n');
    var headers = lines[0].split(',');
    var rows = [];
    for (var i = 1; i < lines.length; i++) {
      var vals = lines[i].split(',');
      var row = {};
      for (var j = 0; j < headers.length; j++) {
        row[headers[j].trim()] = parseFloat(vals[j]);
      }
      rows.push(row);
    }
    return rows;
  }

  function buildPlot(data) {
    var svg = el('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img'
    });
    root.appendChild(svg);

    var yTicks = [1, 5, 10, 15, 20, 25, 30, 35];
    yTicks.forEach(function (t) {
      el('line', {
        class: 'coco-grid',
        x1: M.l, y1: yScale(t), x2: M.l + PLOT_W, y2: yScale(t)
      }, svg);
      var lbl = el('text', {
        class: 'coco-tick',
        x: M.l - 8, y: yScale(t) + 6,
        'text-anchor': 'end',
        'font-size': '18'
      }, svg);
      lbl.textContent = (t === 1 ? '1×' : t + '×');
    });

    var xTicks = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
    xTicks.forEach(function (t) {
      el('line', {
        class: 'coco-grid',
        x1: xScale(t), y1: M.t, x2: xScale(t), y2: M.t + PLOT_H
      }, svg);
      var lbl = el('text', {
        class: 'coco-tick',
        x: xScale(t), y: M.t + PLOT_H + 24,
        'text-anchor': 'middle',
        'font-size': '18'
      }, svg);
      lbl.textContent = t.toFixed(1);
    });

    el('line', { class: 'coco-axis-line', x1: M.l, y1: M.t, x2: M.l, y2: M.t + PLOT_H }, svg);
    el('line', { class: 'coco-axis-line', x1: M.l, y1: M.t + PLOT_H, x2: M.l + PLOT_W, y2: M.t + PLOT_H }, svg);

    var xt = el('text', {
      class: 'coco-axis-title',
      x: M.l + PLOT_W / 2, y: H - 6,
      'text-anchor': 'middle',
      'font-size': '19'
    }, svg);
    xt.textContent = 'Target win probability  p';

    var yt = el('text', {
      class: 'coco-axis-title',
      x: 16, y: M.t + PLOT_H / 2,
      'text-anchor': 'middle',
      'font-size': '19',
      transform: 'rotate(-90 16 ' + (M.t + PLOT_H / 2) + ')'
    }, svg);
    yt.textContent = 'CoCo(p)';

    var paths = [];
    CURVES.forEach(function (c) {
      var d = '';
      for (var i = 0; i < data.length; i++) {
        var p = data[i].p;
        var v = Math.max(yMin, Math.min(yMax, data[i][c.key]));
        var px = xScale(p);
        var py = yScale(v);
        d += (i === 0 ? 'M' : 'L') + px.toFixed(2) + ' ' + py.toFixed(2) + ' ';
      }

      var hitPath = el('path', {
        fill: 'none',
        stroke: 'transparent',
        'stroke-width': 14,
        class: 'coco-curve-hit'
      }, svg);
      hitPath.setAttribute('d', d.trim());

      var path = el('path', {
        fill: 'none',
        stroke: c.color,
        'stroke-width': c.width,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-dasharray': '1000',
        'stroke-dashoffset': '1000',
        class: 'coco-curve',
        'pointer-events': 'none'
      }, svg);
      path.setAttribute('d', d.trim());

      var lastRow = data[data.length - 1];
      var labelY = yScale(Math.max(yMin, Math.min(yMax, lastRow[c.key])));
      var label = el('text', {
        x: M.l + PLOT_W + 10,
        y: labelY + 5,
        'font-family': 'Inter, sans-serif',
        'font-size': '17',
        'font-weight': '600',
        fill: c.color,
        opacity: '0',
        class: 'coco-label'
      }, svg);
      label.textContent = c.name;
      label.style.cursor = 'pointer';
      hitPath.style.cursor = 'pointer';

      paths.push({ path: path, hitPath: hitPath, label: label, color: c.color, curve: c });
    });

    paths.forEach(function (p) {
      var handler = (function (pp) {
        return function () {
          if (activeKey === pp.curve.key) {
            pp.path.setAttribute('stroke-width', pp.curve.width);
            hideDescription(pp.curve.key);
          } else {
            paths.forEach(function (ap) {
              ap.path.setAttribute('stroke-width', ap.curve.width);
            });
            pp.path.setAttribute('stroke-width', pp.curve.width + 2);
            showDescription('<span style="color:' + pp.color + ';font-weight:700;">' + pp.curve.name + ':</span> ' + pp.curve.desc, pp.curve.key);
          }
        };
      })(p);
      p.hitPath.addEventListener('click', handler);
      p.label.addEventListener('click', handler);
    });

    paths.forEach(function (p) {
      var len = 0;
      try { len = p.path.getTotalLength(); } catch (e) { len = 1000; }
      len = len || 1000;
      p.path.style.strokeDasharray = len;
      p.path.style.strokeDashoffset = len;
    });

    function drawAll() {
      paths.forEach(function (p, i) {
        setTimeout(function () {
          p.path.classList.add('draw');
          p.path.style.strokeDashoffset = '0';
        }, 250 + i * 350);
        setTimeout(function () {
          p.label.classList.add('show');
        }, 250 + i * 350 + 1200);
      });
    }

    function showFinal() {
      paths.forEach(function (p) {
        p.path.classList.add('draw');
        p.path.style.strokeDashoffset = '0';
        p.label.classList.add('show');
      });
    }

    if (prefersReduced) { showFinal(); return; }

    var drawn = false;
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !drawn) {
            drawn = true;
            drawAll();
          }
        });
      }, { threshold: 0.25 });
      io.observe(root);
    } else {
      drawAll();
    }
  }

  // Load CSV
  var csvPath = 'figure_paper.csv';
  var xhr = new XMLHttpRequest();
  xhr.open('GET', csvPath, true);
  xhr.onload = function () {
    if (xhr.status === 200) {
      var data = parseCSV(xhr.responseText);
      buildPlot(data);
    }
  };
  xhr.send();
})();
