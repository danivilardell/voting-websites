(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs = {}, parent = null) {
    const node = document.createElementNS(SVG_NS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function scale(d0, d1, r0, r1) {
    return v => r0 + (v - d0) / (d1 - d0) * (r1 - r0);
  }

  function ticksLinear(min, max, count = 5) {
    const step = (max - min) / count;
    const out = [];
    for (let i = 0; i <= count; i++) out.push(min + i * step);
    return out;
  }

  // ---------- DAO display names ----------
  const DAO_NAMES = {
    'aavegotchi.eth': 'Aavegotchi',
    'apecoin.eth': 'ApeCoin',
    'arbitrumfoundation.eth': 'Arbitrum',
    'balancer.eth': 'Balancer',
    'beanstalkdao.eth': 'Beanstalk DAO',
    'beanstalkfarms.eth': 'Beanstalk Farms',
    'bitdao.eth': 'BitDAO',
    'cakevote.eth': 'PancakeSwap',
    'comp-vote.eth': 'Compound',
    'curve.eth': 'Curve',
    'dexe.network': 'DeXe',
    'dydxgov.eth': 'dYdX',
    'ens.eth': 'ENS',
    'g-dao.eth': 'Gnosis Guild',
    'gitcoindao.eth': 'Gitcoin',
    'gmx.eth': 'GMX',
    'gnosis.eth': 'Gnosis',
    'lido-snapshot.eth': 'Lido',
    'metislayer2.eth': 'Metis',
    'opcollective.eth': 'Optimism',
    'poh.eth': 'Proof of Humanity',
    'quickvote.eth': 'QuickSwap',
    'radiantcapital.eth': 'Radiant Capital',
    'safe.eth': 'Safe',
    'shellprotocol.eth': 'Shell Protocol',
    'snapshot.dcl.eth': 'Decentraland',
    'speraxdao.eth': 'Sperax',
    'stgdao.eth': 'Stargate',
    'sushigov.eth': 'Sushi',
    'uma.eth': 'UMA',
    'uniswapgovernance.eth': 'Uniswap'
  };

  function prettyDao(id) {
    if (DAO_NAMES[id]) return DAO_NAMES[id];
    return id;
  }

  // ---------- Bubble sizing ----------
  function bubbleScale(bubbles) {
    const minVoters = 45;
    const lv = bubbles.map(b => Math.log10(Math.max(b.voters, minVoters)));
    return { lMin: Math.min(...lv), lMax: Math.max(...lv), minVoters };
  }
  function rOf(voters, sc, RMIN, RMAX) {
    const lvv = Math.log10(Math.max(voters, sc.minVoters));
    let u = (lvv - sc.lMin) / (sc.lMax - sc.lMin);
    if (u < 0) u = 0; else if (u > 1) u = 1;
    return RMIN + u * (RMAX - RMIN);
  }

  // ---------- Tooltip ----------
  function makeTooltip() {
    const tip = document.createElement('div');
    tip.className = 'plot-tooltip';
    tip.hidden = true;
    return tip;
  }

  function attachHoverTip(circle, plotArea, tip, bubble, mode) {
    const name = prettyDao(bubble.id);
    const voters = Math.round(bubble.voters).toLocaleString();
    const ballotsRaw = bubble.x_raw.toFixed(1);
    const weightRaw = bubble.y_raw.toFixed(1);
    const ballotsNoise = bubble.x_noise != null ? bubble.x_noise.toFixed(1) : null;
    const weightNoise = bubble.y_noise != null ? bubble.y_noise.toFixed(1) : null;

    function show(e) {
      let html = `<div class="tt-name">${name}</div>` +
        `<div class="tt-row"><span>Mean voters</span><span>${voters}</span></div>`;
      if (mode === 'compare') {
        html += `<div class="tt-row"><span>Ballots leaked</span><span>${ballotsRaw}% &rarr; ${ballotsNoise}%</span></div>` +
          `<div class="tt-row"><span>Weight leaked</span><span>${weightRaw}% &rarr; ${weightNoise}%</span></div>`;
      } else {
        html += `<div class="tt-row"><span>Ballots leaked</span><span>${ballotsRaw}%</span></div>` +
          `<div class="tt-row"><span>Weight leaked</span><span>${weightRaw}%</span></div>`;
      }
      tip.innerHTML = html;
      tip.hidden = false;
      position(e);
    }
    function position(e) {
      const rect = plotArea.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const tw = tip.offsetWidth || 180;
      const th = tip.offsetHeight || 80;
      let left = x + 14;
      let top = y + 14;
      if (left + tw > rect.width - 4) left = x - tw - 14;
      if (top + th > rect.height - 4) top = y - th - 14;
      if (left < 4) left = 4;
      if (top < 4) top = 4;
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    }
    function hide() { tip.hidden = true; }

    circle.addEventListener('mouseenter', show);
    circle.addEventListener('mousemove', position);
    circle.addEventListener('mouseleave', hide);
  }

  // ---------- HTML bubble-size legend ----------
  // SVG is authored at viewBox width SVG_VIEW_W and scales to fit the container via
  // preserveAspectRatio. The legend dots are plain HTML, so we must multiply their
  // radii by the live render scale (containerWidth / SVG_VIEW_W) to match the plot.
  const SVG_VIEW_W = 720;

  function buildBubbleLegend(sc, RMIN, RMAX, title, svgHost) {
    const wrap = document.createElement('div');
    wrap.className = 'bubble-legend';

    const t = document.createElement('div');
    t.className = 'bubble-legend-title';
    t.textContent = title;
    wrap.appendChild(t);

    const items = document.createElement('div');
    items.className = 'bubble-legend-items';
    const samples = [
      { v: 30, label: '<45' },
      { v: 100, label: '100' },
      { v: 1000, label: '1k' },
      { v: 10000, label: '10k' },
      { v: 100000, label: '100k' }
    ];
    const dots = [];
    samples.forEach(s => {
      const r = rOf(s.v, sc, RMIN, RMAX);
      const item = document.createElement('div');
      item.className = 'bubble-legend-item';
      const dot = document.createElement('span');
      dot.className = 'bubble-legend-dot';
      dots.push({ dot, r });
      const lbl = document.createElement('span');
      lbl.className = 'bubble-legend-label';
      lbl.textContent = s.label;
      item.appendChild(dot);
      item.appendChild(lbl);
      items.appendChild(item);
    });
    wrap.appendChild(items);

    function applyScale() {
      const w = svgHost ? svgHost.getBoundingClientRect().width : SVG_VIEW_W;
      const scale = w > 0 ? w / SVG_VIEW_W : 1;
      dots.forEach(({ dot, r }) => {
        const d = Math.max(4, r * 2 * scale);
        dot.style.width = d + 'px';
        dot.style.height = d + 'px';
      });
    }
    applyScale();

    if (svgHost && 'ResizeObserver' in window) {
      const ro = new ResizeObserver(applyScale);
      ro.observe(svgHost);
    } else if (svgHost) {
      window.addEventListener('resize', applyScale);
    }
    return wrap;
  }

  // ---------- Aggregate bubble plot ----------
  function renderAggregate(container, bubbles) {
    container.innerHTML = '';
    container.classList.add('plot-host');

    const W = 720, H = 440;
    const ML = 64, MR = 48, MT = 40, MB = 56;
    const innerW = W - ML - MR;
    const innerH = H - MT - MB;

    const xs = scale(0, 100, ML, ML + innerW);
    const ys = scale(0, 100, MT + innerH, MT);

    const sc = bubbleScale(bubbles);
    const RMIN = 5, RMAX = 36;

    const plotArea = document.createElement('div');
    plotArea.className = 'plot-area';

    const svg = el('svg', {
      viewBox: `0 0 ${W} ${H}`,
      preserveAspectRatio: 'xMidYMid meet',
      class: 'plot-svg agg-svg'
    });

    el('rect', {
      x: ML, y: MT, width: innerW, height: innerH,
      fill: '#fbf9f2', stroke: 'none'
    }, svg);

    drawGridAndAxes(svg, ML, MT, innerW, innerH, xs, ys);

    const gBubbles = el('g', { class: 'agg-base' }, svg);

    const tip = makeTooltip();

    bubbles.forEach(b => {
      const r = rOf(b.voters, sc, RMIN, RMAX);
      const cx = xs(b.x_raw);
      const cy = ys(b.y_raw);
      const c = el('circle', {
        cx, cy, r,
        fill: '#1a1a1a',
        'fill-opacity': 0.62,
        stroke: '#5e5d57',
        'stroke-width': 0.6,
        class: 'agg-bubble'
      }, gBubbles);
      attachHoverTip(c, plotArea, tip, b, 'raw');
    });

    plotArea.appendChild(svg);
    plotArea.appendChild(tip);
    container.appendChild(plotArea);
    container.appendChild(buildBubbleLegend(sc, RMIN, RMAX, 'Mean voters per proposal', svg));
  }

  // ---------- Noise comparison ----------
  function renderNoise(container, bubbles) {
    container.innerHTML = '';
    container.classList.add('plot-host');

    const W = 720, H = 440;
    const ML = 64, MR = 48, MT = 40, MB = 56;
    const innerW = W - ML - MR;
    const innerH = H - MT - MB;

    const xs = scale(0, 100, ML, ML + innerW);
    const ys = scale(0, 100, MT + innerH, MT);

    const sc = bubbleScale(bubbles);
    const RMIN = 5, RMAX = 36;

    const plotArea = document.createElement('div');
    plotArea.className = 'plot-area';

    const svg = el('svg', {
      viewBox: `0 0 ${W} ${H}`,
      preserveAspectRatio: 'xMidYMid meet',
      class: 'plot-svg noise-svg'
    });

    el('rect', {
      x: ML, y: MT, width: innerW, height: innerH,
      fill: '#fbf9f2', stroke: 'none'
    }, svg);

    drawGridAndAxes(svg, ML, MT, innerW, innerH, xs, ys);

    const gGhost = el('g', { class: 'ghost-layer' }, svg);
    const gArrow = el('g', { class: 'arrow-layer' }, svg);
    const gBubble = el('g', { class: 'bubble-layer' }, svg);

    const labelRightEdge = ML + innerW - 56;
    const labelY = MT + innerH - 68;
    function makePhaseLabel(text, cls) {
      const g = el('g', { class: 'phase-label ' + cls }, svg);
      const rect = el('rect', {
        rx: 999, ry: 999,
        class: 'phase-label-bg'
      }, g);
      const t = el('text', {
        y: labelY,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        class: 'phase-label-text'
      }, g);
      t.textContent = text;
      return { g, rect, t };
    }
    const labelRaw = makePhaseLabel('Raw tally', 'phase-label-raw');
    const labelNoise = makePhaseLabel('Noised tally', 'phase-label-noise');
    requestAnimationFrame(() => {
      const bbR = labelRaw.t.getBBox();
      const bbN = labelNoise.t.getBBox();
      const padX = 22, padY = 10;
      const width = Math.max(bbR.width, bbN.width) + padX * 2;
      const height = Math.max(bbR.height, bbN.height) + padY * 2;
      const rectX = labelRightEdge - width;
      const centerX = rectX + width / 2;
      const rectY = labelY - height / 2;
      [labelRaw, labelNoise].forEach(({ rect, t }) => {
        rect.setAttribute('x', rectX);
        rect.setAttribute('y', rectY);
        rect.setAttribute('width', width);
        rect.setAttribute('height', height);
        t.setAttribute('x', centerX);
      });
    });

    const tip = makeTooltip();

    const items = bubbles.map(b => {
      const r = rOf(b.voters, sc, RMIN, RMAX);
      const xRaw = xs(b.x_raw);
      const yRaw = ys(b.y_raw);
      const xN = xs(b.x_noise);
      const yN = ys(b.y_noise);

      el('circle', {
        cx: xRaw, cy: yRaw, r: r,
        fill: '#cdc6b3',
        'fill-opacity': 0.35,
        stroke: 'none'
      }, gGhost);

      const dx = xN - xRaw, dy = yN - yRaw;
      let arrow = null;
      if (Math.sqrt(dx * dx + dy * dy) > 14) {
        arrow = el('line', {
          x1: xRaw, y1: yRaw, x2: xRaw, y2: yRaw,
          stroke: '#5e5d57', 'stroke-width': 1,
          'stroke-opacity': 0,
          'stroke-dasharray': '3 3'
        }, gArrow);
      }

      const c = el('circle', {
        cx: xRaw, cy: yRaw, r: r,
        fill: '#cdc6b3',
        'fill-opacity': 0.55,
        stroke: '#1a1a1a',
        'stroke-width': 0.6,
        class: 'bubble'
      }, gBubble);

      attachHoverTip(c, plotArea, tip, b, 'compare');

      return { c, arrow, xRaw, yRaw, xN, yN };
    });

    plotArea.appendChild(svg);
    plotArea.appendChild(tip);
    container.appendChild(plotArea);
    container.appendChild(buildBubbleLegend(sc, RMIN, RMAX, 'Mean voters per proposal', svg));

    // ---------- Animation loop ----------
    const PHASE_HOLD_RAW = 2500;
    const PHASE_TRANSITION = 1900;
    const PHASE_HOLD_NOISE = 3500;

    let timer = null;
    let cancelled = false;
    let active = false;

    function clearAll() {
      if (timer) { clearTimeout(timer); timer = null; }
    }

    function setRaw(animated) {
      items.forEach(it => {
        it.c.classList.toggle('no-trans', !animated);
        it.c.setAttribute('cx', it.xRaw);
        it.c.setAttribute('cy', it.yRaw);
        it.c.setAttribute('fill', '#cdc6b3');
        it.c.setAttribute('fill-opacity', '0.55');
        if (it.arrow) {
          it.arrow.setAttribute('x2', it.xRaw);
          it.arrow.setAttribute('y2', it.yRaw);
          it.arrow.setAttribute('stroke-opacity', '0');
        }
      });
      labelRaw.g.classList.add('on');
      labelNoise.g.classList.remove('on');
    }
    function setNoise() {
      items.forEach(it => {
        it.c.classList.remove('no-trans');
        it.c.setAttribute('cx', it.xN);
        it.c.setAttribute('cy', it.yN);
        it.c.setAttribute('fill', '#1a1a1a');
        it.c.setAttribute('fill-opacity', '0.78');
        if (it.arrow) {
          it.arrow.setAttribute('x2', it.xN);
          it.arrow.setAttribute('y2', it.yN);
          it.arrow.setAttribute('stroke-opacity', '0.45');
        }
      });
      labelNoise.g.classList.add('on');
      labelRaw.g.classList.remove('on');
    }
    let firstRun = true;
    function loopOnce() {
      if (cancelled) return;
      setRaw(!firstRun);
      firstRun = false;
      void container.offsetHeight;
      timer = setTimeout(() => {
        if (cancelled) return;
        setNoise();
        timer = setTimeout(() => {
          if (cancelled) return;
          timer = setTimeout(() => {
            if (cancelled) return;
            loopOnce();
          }, PHASE_HOLD_NOISE);
        }, PHASE_TRANSITION);
      }, PHASE_HOLD_RAW);
    }
    function play() {
      if (active) return;
      active = true; cancelled = false;
      loopOnce();
    }
    function pause() {
      cancelled = true; active = false; clearAll();
    }

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        entries.forEach(e => e.isIntersecting ? play() : pause());
      }, { threshold: 0.2 });
      io.observe(container);
    } else {
      play();
    }
  }

  // ---------- Shared chart chrome ----------
  function drawGridAndAxes(svg, ML, MT, innerW, innerH, xs, ys) {
    ticksLinear(0, 100, 5).forEach(t => {
      const y = ys(t);
      el('line', {
        x1: ML, y1: y, x2: ML + innerW, y2: y,
        stroke: '#e8e1cf', 'stroke-width': 1
      }, svg);
      const lbl = el('text', {
        x: ML - 8, y: y + 4,
        'text-anchor': 'end', class: 'tick-text'
      }, svg);
      lbl.textContent = t + '%';
    });
    ticksLinear(0, 100, 5).forEach(t => {
      const x = xs(t);
      el('line', {
        x1: x, y1: MT, x2: x, y2: MT + innerH,
        stroke: '#e8e1cf', 'stroke-width': 1
      }, svg);
      el('line', {
        x1: x, y1: MT + innerH, x2: x, y2: MT + innerH + 4,
        stroke: '#aaa28b', 'stroke-width': 1
      }, svg);
      const lbl = el('text', {
        x: x, y: MT + innerH + 18,
        'text-anchor': 'middle', class: 'tick-text'
      }, svg);
      lbl.textContent = t + '%';
    });
    el('line', {
      x1: ML, y1: MT + innerH, x2: ML + innerW, y2: MT + innerH,
      stroke: '#1a1a1a', 'stroke-width': 1
    }, svg);
    el('line', {
      x1: ML, y1: MT, x2: ML, y2: MT + innerH,
      stroke: '#1a1a1a', 'stroke-width': 1
    }, svg);

    const yt = el('text', {
      x: 0, y: 0,
      transform: `translate(18, ${MT + innerH / 2}) rotate(-90)`,
      'text-anchor': 'middle',
      class: 'axis-title-lg'
    }, svg);
    yt.textContent = 'Mean voting weight leaked (%)';

    const xt = el('text', {
      x: ML + innerW / 2, y: MT + innerH + 44,
      'text-anchor': 'middle',
      class: 'axis-title-lg'
    }, svg);
    xt.textContent = 'Mean ballots leaked (%)';
  }

  // ---------- Bootstrap ----------
  function init() {
    const aggEl = document.querySelector('[data-plot="aggregate"]');
    const noiseEl = document.querySelector('[data-plot="noise"]');
    if (!aggEl && !noiseEl) return;

    const data = window.PLOT_DATA;
    if (!data) {
      console.warn('PLOT_DATA not loaded');
      if (aggEl) aggEl.textContent = 'Plot data unavailable.';
      if (noiseEl) noiseEl.textContent = 'Plot data unavailable.';
      return;
    }
    if (aggEl) renderAggregate(aggEl, data.noise_bubbles);
    if (noiseEl) renderNoise(noiseEl, data.noise_bubbles);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
