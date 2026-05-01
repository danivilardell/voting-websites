(function () {
  const root = document.querySelector('#coco .coco-plot');
  if (!root) return;

  const legend = document.querySelector('#coco .coco-legend');
  const SVG = 'http://www.w3.org/2000/svg';

  const prefersReduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Plot geometry ----------
  const W = 820, H = 420;
  const M = { l: 64, r: 160, t: 24, b: 48 };
  const PLOT_W = W - M.l - M.r;
  const PLOT_H = H - M.t - M.b;

  const xMin = 0, xMax = 1;
  const yMin = 1, yMax = 40;

  const xScale = p => M.l + (p - xMin) / (xMax - xMin) * PLOT_W;
  const yScale = c => M.t + PLOT_H - (c - yMin) / (yMax - yMin) * PLOT_H;

  // ---------- Curve models (match paper Figure 9 qualitatively) ----------
  // Cast Iron: perfect evasion (γ=1) ⇒ flat at 1/(α-β) ≈ 25 across all p.
  function castIron(p) { return 25; }

  // Loki: hybrid signaling. ~Linear rise from ~1 to ~12.
  function loki(p) { return 1 + 11 * p; }

  // Revoting with voter latency advantage (γ ≈ 0.7).
  // Stays near 1 until p ≈ 0.75, then climbs sharply, peaking near 30 at p = 1.
  function revoteAdv(p) {
    const base = 1;
    const sig  = 32 / (1 + Math.exp(-22 * (p - 0.86)));
    return base + sig;
  }

  // Plain revoting (coin-flip race, γ = 0.5). Effectively flat at ~1.
  function revote(p) { return 1.05; }

  const SAMPLES = 220;
  function pathFor(fn) {
    let d = '';
    for (let i = 0; i <= SAMPLES; i++) {
      const p = i / SAMPLES;
      const x = xScale(p);
      const y = yScale(Math.max(yMin, Math.min(yMax, fn(p))));
      d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2) + ' ';
    }
    return d.trim();
  }

  // ---------- Build SVG ----------
  function el(tag, attrs, parent) {
    const node = document.createElementNS(SVG, tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (parent) parent.appendChild(node);
    return node;
  }

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img'
  });
  root.appendChild(svg);

  // Grid: y at 1, 5, 10, 15, 20, 25, 30, 35, 40
  const yTicks = [1, 5, 10, 15, 20, 25, 30, 35, 40];
  yTicks.forEach(t => {
    el('line', {
      class: 'coco-grid',
      x1: M.l, y1: yScale(t), x2: M.l + PLOT_W, y2: yScale(t)
    }, svg);
    const lbl = el('text', {
      class: 'coco-tick',
      x: M.l - 8, y: yScale(t) + 4,
      'text-anchor': 'end'
    }, svg);
    lbl.textContent = (t === 1 ? '1×' : t + '×');
  });

  // X ticks
  const xTicks = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
  xTicks.forEach(t => {
    el('line', {
      class: 'coco-grid',
      x1: xScale(t), y1: M.t, x2: xScale(t), y2: M.t + PLOT_H
    }, svg);
    const lbl = el('text', {
      class: 'coco-tick',
      x: xScale(t), y: M.t + PLOT_H + 18,
      'text-anchor': 'middle'
    }, svg);
    lbl.textContent = t.toFixed(1);
  });

  // Axes
  el('line', { class: 'coco-axis-line', x1: M.l, y1: M.t, x2: M.l, y2: M.t + PLOT_H }, svg);
  el('line', { class: 'coco-axis-line', x1: M.l, y1: M.t + PLOT_H, x2: M.l + PLOT_W, y2: M.t + PLOT_H }, svg);

  // Axis titles
  const xt = el('text', {
    class: 'coco-axis-title',
    x: M.l + PLOT_W / 2,
    y: H - 12,
    'text-anchor': 'middle'
  }, svg);
  xt.textContent = 'Target win probability  p';

  const yt = el('text', {
    class: 'coco-axis-title',
    x: 16, y: M.t + PLOT_H / 2,
    'text-anchor': 'middle',
    transform: `rotate(-90 16 ${M.t + PLOT_H / 2})`
  }, svg);
  yt.textContent = 'CoCo(p)  —  cost factor vs. no CR';

  // ---------- Curves ----------
  const curves = [
    {
      name: 'Cast Iron',
      meta: 'success 100%, detection 4%',
      fn: castIron,
      cls: 'coco-curve-cast',
      labelCls: 'coco-label-cast',
      labelAt: 25,
      labelText: 'Cast Iron'
    },
    {
      name: 'Loki',
      meta: 'success 80%, detection 4%',
      fn: loki,
      cls: 'coco-curve-loki',
      labelCls: 'coco-label-loki',
      labelAt: 12,
      labelText: 'Loki'
    },
    {
      name: 'Revoting (voter adv.)',
      meta: 'success 70%, detection 1%',
      fn: revoteAdv,
      cls: 'coco-curve-revote-adv',
      labelCls: 'coco-label-revote-adv',
      labelAt: 32,
      labelText: 'Revoting (voter adv.)'
    },
    {
      name: 'Revoting',
      meta: 'success 50%, detection 1%',
      fn: revote,
      cls: 'coco-curve-revote',
      labelCls: 'coco-label-revote',
      labelAt: 1.0,
      labelText: 'Revoting'
    }
  ];

  // Compute path lengths so we can drive stroke-dashoffset properly per curve.
  const paths = [];
  curves.forEach((c, i) => {
    const path = el('path', {
      class: `coco-curve ${c.cls}`,
      d: pathFor(c.fn)
    }, svg);
    paths.push({ ...c, path });
  });

  // After insertion, set stroke-dasharray to the actual length of each path.
  paths.forEach(p => {
    let len = 0;
    try { len = p.path.getTotalLength(); } catch (e) { len = 1000; }
    p.length = len || 1000;
    p.path.style.strokeDasharray  = `${p.length}`;
    p.path.style.strokeDashoffset = `${p.length}`;
  });

  // Curve labels (right edge)
  paths.forEach(p => {
    const lblY = yScale(p.labelAt);
    const labelX = M.l + PLOT_W + 8;
    const t = el('text', {
      class: `coco-label ${p.labelCls}`,
      x: labelX,
      y: lblY + 4
    }, svg);
    t.textContent = p.labelText;
    p.label = t;
  });

  // ---------- Legend ----------
  if (legend) {
    legend.innerHTML = '';
    curves.forEach(c => {
      const li = document.createElement('span');
      li.className = 'lg-item';
      const sw = document.createElement('span');
      sw.className = 'lg-swatch';
      sw.style.background = swatchColor(c.cls);
      const text = document.createElement('span');
      text.innerHTML = `<strong style="color: var(--ink);">${c.name}</strong> <span class="lg-meta">— ${c.meta}</span>`;
      li.appendChild(sw);
      li.appendChild(text);
      legend.appendChild(li);
    });
  }

  function swatchColor(cls) {
    return ({
      'coco-curve-cast': '#8a6d1f',
      'coco-curve-loki': '#b87333',
      'coco-curve-revote': '#6b8a3a',
      'coco-curve-revote-adv': '#2f5b73'
    })[cls] || '#1a1a1a';
  }

  // ---------- Animation ----------
  function drawAll() {
    paths.forEach((p, i) => {
      setTimeout(() => {
        p.path.classList.add('draw');
        p.path.style.strokeDashoffset = '0';
      }, 250 + i * 350);
      setTimeout(() => {
        p.label.classList.add('show');
      }, 250 + i * 350 + 1200);
    });
  }

  function showFinal() {
    paths.forEach(p => {
      p.path.classList.add('draw');
      p.path.style.strokeDashoffset = '0';
      p.label.classList.add('show');
    });
  }

  if (prefersReduced) {
    showFinal();
    return;
  }

  let drawn = false;
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
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
})();
