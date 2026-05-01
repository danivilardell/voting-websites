(function () {
  const root = document.querySelector('#timeline .timeline-stage');
  if (!root) return;

  const svgExisting = root.querySelector('.tl-track[data-track="existing"] svg');
  const svgCastIron = root.querySelector('.tl-track[data-track="cast-iron"] svg');
  const steps = root.querySelectorAll('.tl-narration .tl-step');

  const prefersReduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const SVG = 'http://www.w3.org/2000/svg';

  // ---------- Layout constants (viewBox 800 x 130) ----------
  const X0 = 30, X1 = 770, AXIS_Y = 80;
  const xAt = t => X0 + (X1 - X0) * t;

  // Time positions, normalized [0..1]
  const T_IC          = 0.04;
  const T_REG_OPEN    = 0.30;
  const T_REG_CLOSE   = 0.45;
  const T_VOTE_OPEN   = 0.58;
  const T_VOTE_CLOSE  = 0.86;
  const T_VOTE_CAST   = 0.72;
  const T_TALLY       = 0.94;

  const T_SIG_EXISTING = 0.40;   // σ inside registration window
  const T_SIG_CASTIRON = 0.14;   // σ posted very early, far before any window

  // ---------- Helpers ----------
  function el(tag, attrs, parent) {
    const node = document.createElementNS(SVG, tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (parent) parent.appendChild(node);
    return node;
  }

  function txt(parent, x, y, str, cls) {
    const t = el('text', { x, y, class: cls || '' }, parent);
    t.textContent = str;
    return t;
  }

  // ---------- Build a track ----------
  function buildTrack(svg, opts) {
    svg.innerHTML = '';

    // Stage band: voting + tallying
    el('rect', {
      class: 'tl-stage-band',
      x: xAt(T_VOTE_OPEN), y: AXIS_Y - 18,
      width: xAt(T_TALLY + 0.025) - xAt(T_VOTE_OPEN), height: 36, rx: 4
    }, svg);

    // Voting / Tallying labels
    txt(svg, (xAt(T_VOTE_OPEN) + xAt(T_VOTE_CLOSE)) / 2, AXIS_Y - 24,
        'Voting', 'tl-stage-label')
      .setAttribute('text-anchor', 'middle');
    txt(svg, xAt(T_TALLY), AXIS_Y - 24, 'Tallying', 'tl-stage-label')
      .setAttribute('text-anchor', 'middle');

    // Axis
    el('line', { class: 'tl-axis', x1: X0, y1: AXIS_Y, x2: X1, y2: AXIS_Y, 'marker-end': '' }, svg);
    // arrow at right end
    el('polygon', {
      class: 'tl-axis',
      fill: '#cfc8b3',
      stroke: 'none',
      points: `${X1},${AXIS_Y - 4} ${X1 + 6},${AXIS_Y} ${X1},${AXIS_Y + 4}`
    }, svg);
    txt(svg, X1 + 12, AXIS_Y + 4, 'time', 'tl-label-time');

    // IC marker
    const icX = xAt(T_IC);
    el('rect', { x: icX - 9, y: AXIS_Y - 9, width: 18, height: 18, rx: 3, fill: '#1a1a1a' }, svg);
    txt(svg, icX, AXIS_Y + 4, 'IC', 'tl-label-event')
      .setAttribute('text-anchor', 'middle');
    const icLabel = txt(svg, icX, AXIS_Y + 22, 't₀', 'tl-label-time');
    icLabel.setAttribute('text-anchor', 'middle');
    icLabel.setAttribute('fill', '#777');

    // Voting tick (the actual ballot cast moment)
    const vX = xAt(T_VOTE_CAST);
    el('circle', { cx: vX, cy: AXIS_Y, r: 4, fill: '#1a1a1a' }, svg);

    // Tallying tick
    const taX = xAt(T_TALLY);
    el('polygon', {
      points: `${taX-5},${AXIS_Y-5} ${taX+5},${AXIS_Y-5} ${taX+5},${AXIS_Y+5} ${taX-5},${AXIS_Y+5}`,
      fill: '#1a1a1a'
    }, svg);

    // Track-specific overlay (registration window or σ-anytime band)
    if (opts.track === 'existing') {
      // Registration window box (a fixed prescribed window)
      const wx = xAt(T_REG_OPEN), ww = xAt(T_REG_CLOSE) - xAt(T_REG_OPEN);
      const winRect = el('rect', {
        class: 'tl-window-existing',
        x: wx, y: AXIS_Y - 22, width: ww, height: 44, rx: 4,
        opacity: 0
      }, svg);
      winRect.setAttribute('data-layer', 'window');

      // Window label
      const winLbl = txt(svg, wx + ww / 2, AXIS_Y - 28, 'Registration window', 'tl-stage-label');
      winLbl.setAttribute('text-anchor', 'middle');
      winLbl.setAttribute('fill', '#9b3a1c');
      winLbl.setAttribute('opacity', '0');
      winLbl.setAttribute('data-layer', 'window');

      // R icon at start of window
      const rX = xAt(T_REG_OPEN);
      const rGroup = el('g', { 'data-layer': 'window', opacity: 0 }, svg);
      el('circle', { cx: rX, cy: AXIS_Y, r: 8, fill: '#9b3a1c' }, rGroup);
      txt(rGroup, rX, AXIS_Y + 4, 'R', 'tl-icon-r')
        .setAttribute('text-anchor', 'middle');
      const rLbl = txt(rGroup, rX, AXIS_Y + 22, 't_R', 'tl-label-time');
      rLbl.setAttribute('text-anchor', 'middle');

      // σ event inside window
      const sX = xAt(T_SIG_EXISTING);
      const sGroup = el('g', { 'data-layer': 'window', opacity: 0 }, svg);
      el('circle', { cx: sX, cy: AXIS_Y, r: 6, fill: '#8a6d1f' }, sGroup);
      txt(sGroup, sX, AXIS_Y + 4, 'σ', 'tl-icon-sigma')
        .setAttribute('text-anchor', 'middle');
      const sLbl = txt(sGroup, sX, AXIS_Y + 22, 't₁', 'tl-label-time');
      sLbl.setAttribute('text-anchor', 'middle');

    } else {
      // Cast Iron: σ can land anywhere after IC
      // Show a faint dotted band from IC up to voting open, suggesting "any time"
      const fromX = xAt(T_IC + 0.012);
      const toX   = xAt(T_VOTE_OPEN - 0.01);
      const bandRect = el('rect', {
        class: 'tl-window-castiron',
        x: fromX, y: AXIS_Y - 18, width: toX - fromX, height: 36, rx: 4,
        opacity: 0
      }, svg);
      bandRect.setAttribute('data-layer', 'window');

      // Band label
      const bandLbl = txt(svg, (fromX + toX) / 2, AXIS_Y - 24,
                         'Self-register at any time', 'tl-stage-label');
      bandLbl.setAttribute('text-anchor', 'middle');
      bandLbl.setAttribute('fill', '#8a6d1f');
      bandLbl.setAttribute('opacity', '0');
      bandLbl.setAttribute('data-layer', 'window');

      // σ event (the actual chosen moment, far earlier than the existing-scheme window)
      const sX = xAt(T_SIG_CASTIRON);
      const sGroup = el('g', { 'data-layer': 'sigma', opacity: 0 }, svg);
      el('circle', { cx: sX, cy: AXIS_Y, r: 6, fill: '#8a6d1f' }, sGroup);
      txt(sGroup, sX, AXIS_Y + 4, 'σ', 'tl-icon-sigma')
        .setAttribute('text-anchor', 'middle');
      const sLbl = txt(sGroup, sX, AXIS_Y + 22, 't₁', 'tl-label-time');
      sLbl.setAttribute('text-anchor', 'middle');
    }

    // Attacker layer (added but invisible until step 3).
    // Both attackers arrive at the same conceptual time — the start of the
    // registration window in the existing scheme — so the contrast is purely
    // about whether the voter has already self-registered.
    const atkX = xAt(T_REG_OPEN);
    const atkGroup = el('g', {
      'data-layer': 'attacker',
      class: 'tl-attacker',
      transform: `translate(${atkX} ${AXIS_Y - 44})`
    }, svg);
    // Attacker icon: a downward arrow with ! mark
    el('path', {
      d: 'M 0 0 L -8 -14 L 8 -14 Z',
      fill: '#9b3a1c'
    }, atkGroup);
    txt(atkGroup, 0, -4, '!', null)
      .setAttribute('text-anchor', 'middle');
    const last = atkGroup.querySelector('text');
    if (last) {
      last.setAttribute('font-family', 'serif');
      last.setAttribute('font-size', '11');
      last.setAttribute('font-weight', '700');
      last.setAttribute('fill', '#fff');
    }
    const atkLbl = txt(atkGroup, 0, 12, opts.track === 'existing' ? 'Attacker arrives' : 'Attacker arrives', null);
    atkLbl.setAttribute('text-anchor', 'middle');
    atkLbl.setAttribute('font-family', 'Inter, sans-serif');
    atkLbl.setAttribute('font-size', '10');
    atkLbl.setAttribute('fill', '#9b3a1c');

    // Verdict mark to the right of attacker (success / overridden)
    const verdictGroup = el('g', {
      'data-layer': 'verdict',
      transform: `translate(${atkX + 60} ${AXIS_Y - 44})`,
      opacity: 0
    }, svg);
    if (opts.track === 'existing') {
      // Cross / vulnerable
      el('circle', { cx: 0, cy: -7, r: 9, fill: '#9b3a1c' }, verdictGroup);
      const x1 = el('line', { x1: -4, y1: -11, x2: 4, y2: -3, stroke: '#fff', 'stroke-width': '2', 'stroke-linecap': 'round' }, verdictGroup);
      const x2 = el('line', { x1: 4, y1: -11, x2: -4, y2: -3, stroke: '#fff', 'stroke-width': '2', 'stroke-linecap': 'round' }, verdictGroup);
      const v = txt(verdictGroup, 0, 12, 'voter compromised', null);
      v.setAttribute('text-anchor', 'middle');
      v.setAttribute('font-family', 'Inter, sans-serif');
      v.setAttribute('font-size', '10');
      v.setAttribute('fill', '#9b3a1c');
    } else {
      // Check / safe
      el('circle', { cx: 0, cy: -7, r: 9, fill: '#3a7d2f' }, verdictGroup);
      el('path', {
        d: 'M -4 -7 L -1 -3 L 5 -10',
        fill: 'none',
        stroke: '#fff',
        'stroke-width': '2',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      }, verdictGroup);
      const v = txt(verdictGroup, 0, 12, 'already registered', null);
      v.setAttribute('text-anchor', 'middle');
      v.setAttribute('font-family', 'Inter, sans-serif');
      v.setAttribute('font-size', '10');
      v.setAttribute('fill', '#3a7d2f');
    }
  }

  function showLayer(svg, name, on) {
    svg.querySelectorAll(`[data-layer="${name}"]`).forEach(node => {
      if (on) {
        if (node.classList.contains('tl-attacker')) node.classList.add('show');
        node.setAttribute('opacity', '1');
      } else {
        if (node.classList.contains('tl-attacker')) node.classList.remove('show');
        node.setAttribute('opacity', '0');
      }
    });
  }

  function setStep(i) {
    steps.forEach((s, idx) => s.classList.toggle('active', idx === i));
  }

  function applyStep(i) {
    // Reset all layers
    [svgExisting, svgCastIron].forEach(s => {
      ['window', 'sigma', 'attacker', 'verdict'].forEach(layer => showLayer(s, layer, false));
    });

    if (i >= 1) {
      showLayer(svgExisting, 'window', true);
    }
    if (i >= 2) {
      showLayer(svgCastIron, 'sigma', true);
      showLayer(svgCastIron, 'window', true);
    }
    if (i >= 3) {
      showLayer(svgExisting, 'attacker', true);
      showLayer(svgCastIron, 'attacker', true);
      showLayer(svgExisting, 'verdict', true);
      showLayer(svgCastIron, 'verdict', true);
    }
    setStep(i);
  }

  // Build both tracks once
  buildTrack(svgExisting,  { track: 'existing'  });
  buildTrack(svgCastIron,  { track: 'cast-iron' });

  // ---------- Animation ----------
  const STEP_HOLD = [3500, 4000, 4500, 8000];
  const RESET_GAP = 1200;

  let timers = [];
  let cancelled = false;
  let running = false;

  function clearTimers() {
    timers.forEach(t => clearTimeout(t));
    timers = [];
  }
  function schedule(fn, delay) {
    const id = setTimeout(() => { if (!cancelled) fn(); }, delay);
    timers.push(id);
  }

  function runCycle() {
    if (cancelled) return;
    let acc = 0;
    for (let i = 0; i < STEP_HOLD.length; i++) {
      const idx = i;
      schedule(() => applyStep(idx), acc);
      acc += STEP_HOLD[i];
    }
    schedule(() => {
      applyStep(0);
      schedule(runCycle, RESET_GAP);
    }, acc);
  }

  function play() {
    if (running) return;
    running = true;
    cancelled = false;
    if (prefersReduced) { applyStep(3); return; }
    applyStep(0);
    schedule(runCycle, 600);
  }

  function pause() {
    cancelled = true;
    running = false;
    clearTimers();
  }

  if (prefersReduced) {
    applyStep(3);
    return;
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) play();
        else pause();
      });
    }, { threshold: 0.2 });
    io.observe(root);
  } else {
    play();
  }
})();
