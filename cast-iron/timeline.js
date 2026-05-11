(function () {
  const stage = document.querySelector('.timeline-stage');
  if (!stage) return;

  const svgExisting = stage.querySelector('.tl-track[data-track="existing"] svg');
  const svgCastIron = stage.querySelector('.tl-track[data-track="cast-iron"] svg');
  const descBox = document.getElementById('tl-description');

  const SVG = 'http://www.w3.org/2000/svg';

  // ---------- Layout (viewBox 800 x 140) ----------
  const X0 = 55, X1 = 740, AXIS_Y = 65;
  const xAt = t => X0 + (X1 - X0) * t;

  // Normalized time positions
  const T_IC         = 0.04;
  const T_REG_OPEN   = 0.50;
  const T_REG_CLOSE  = 0.62;
  const T_VOTE_OPEN  = 0.62;
  const T_VOTE_CLOSE = 0.86;
  const T_TALLY_END  = 0.97;

  const T_SIG_EXISTING = 0.56;
  const T_SIG_CASTIRON = 0.18;
  const T_CI_REG_START = 0.06;

  // Phase colors
  const COLORS = {
    reg:   { fill: 'rgba(155, 58, 28, 0.08)',  stroke: 'rgba(155, 58, 28, 0.35)', text: '#9b3a1c' },
    regCI: { fill: 'rgba(138, 109, 31, 0.08)', stroke: 'rgba(138, 109, 31, 0.35)', text: '#8a6d1f' },
    vote:  { fill: 'rgba(47, 91, 115, 0.08)',  stroke: 'rgba(47, 91, 115, 0.35)', text: '#2f5b73' },
    tally: { fill: 'rgba(107, 138, 58, 0.08)', stroke: 'rgba(107, 138, 58, 0.35)', text: '#4a6d2a' }
  };

  // ---------- Helpers ----------
  function el(tag, attrs, parent) {
    const node = document.createElementNS(SVG, tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (parent) parent.appendChild(node);
    return node;
  }

  function txt(parent, x, y, str, extra) {
    const t = el('text', { x, y, ...extra }, parent);
    t.textContent = str;
    return t;
  }

  function setFont(node, family, size, weight, fill) {
    node.setAttribute('font-family', family);
    node.setAttribute('font-size', size);
    if (weight) node.setAttribute('font-weight', weight);
    if (fill) node.setAttribute('fill', fill);
  }

  function showDescription(text) {
    if (!descBox) return;
    descBox.textContent = text;
    descBox.classList.add('visible');
  }

  function hideDescription() {
    if (!descBox) return;
    descBox.textContent = 'Hover over elements in the diagram to learn more.';
    descBox.classList.remove('visible');
  }

  function addHotspot(svg, cx, cy, r, tipText) {
    const g = el('g', { class: 'tl-hotspot' }, svg);
    el('circle', { cx, cy, r: r + 7, class: 'tl-hotspot-ring' }, g);
    el('circle', { cx, cy, r: r + 12, fill: 'transparent' }, g);
    g.addEventListener('mouseenter', () => showDescription(tipText));
    g.addEventListener('mouseleave', hideDescription);
    return g;
  }

  function phaseBox(svg, x0, x1, color, label) {
    const pad = 30;
    el('rect', {
      x: xAt(x0), y: AXIS_Y - pad,
      width: xAt(x1) - xAt(x0), height: pad * 2, rx: 6,
      fill: color.fill,
      stroke: color.stroke,
      'stroke-width': 1.2,
      'stroke-dasharray': '5 3'
    }, svg);
    const lbl = txt(svg, (xAt(x0) + xAt(x1)) / 2, AXIS_Y - pad - 7, label, { 'text-anchor': 'middle' });
    setFont(lbl, 'var(--sans)', '14', '600', color.text);
  }

  // ---------- Build a track ----------
  function buildTrack(svg, opts) {
    svg.innerHTML = '';
    const isExisting = opts.track === 'existing';

    // Phase boxes
    if (isExisting) {
      phaseBox(svg, T_REG_OPEN, T_REG_CLOSE, COLORS.reg, 'Registration');
    }
    phaseBox(svg, T_VOTE_OPEN, T_VOTE_CLOSE, COLORS.vote, 'Voting');
    phaseBox(svg, T_VOTE_CLOSE, T_TALLY_END, COLORS.tally, 'Tallying');

    // Axis line
    el('line', {
      x1: X0 - 6, y1: AXIS_Y, x2: X1, y2: AXIS_Y,
      stroke: '#cfc8b3', 'stroke-width': 1.5
    }, svg);
    el('polygon', {
      fill: '#cfc8b3', stroke: 'none',
      points: `${X1},${AXIS_Y - 6} ${X1 + 9},${AXIS_Y} ${X1},${AXIS_Y + 6}`
    }, svg);
    const timeLbl = txt(svg, X1 + 15, AXIS_Y + 6, 'time', { 'text-anchor': 'start' });
    setFont(timeLbl, 'var(--mono)', '14', null, '#999');

    // ----- IC marker -----
    const icX = xAt(T_IC);
    el('rect', { x: icX - 16, y: AXIS_Y - 16, width: 32, height: 32, rx: 6, fill: '#1a1a1a' }, svg);
    const icTxt = txt(svg, icX, AXIS_Y + 7, 'IC', { 'text-anchor': 'middle' });
    setFont(icTxt, 'var(--sans)', '16', '700', '#fff');
    const icTime = txt(svg, icX, AXIS_Y + 40, 't₀', { 'text-anchor': 'middle' });
    setFont(icTime, 'var(--mono)', '15', null, '#888');

    addHotspot(svg, icX, AXIS_Y, 16,
      'Inalienable credential (IC): a long-lived secret (e.g. a key pair on a hardware wallet) that authenticates the voter. Created once, used across elections.');

    // ----- σ registration event -----
    const sigX = isExisting ? xAt(T_SIG_EXISTING) : xAt(T_SIG_CASTIRON);
    el('circle', { cx: sigX, cy: AXIS_Y, r: 13, fill: '#8a6d1f' }, svg);
    const sigTxt = txt(svg, sigX, AXIS_Y + 8, 'σ', { 'text-anchor': 'middle' });
    setFont(sigTxt, 'var(--serif)', '24', '600', '#fff');
    const sigTime = txt(svg, sigX, AXIS_Y + 40, 't₁', { 'text-anchor': 'middle' });
    setFont(sigTime, 'var(--mono)', '15', null, '#888');

    addHotspot(svg, sigX, AXIS_Y, 13,
      isExisting
        ? 'The voter registers their credential (σ) inside the prescribed registration window, interacting with a registration authority.'
        : 'The voter covertly self-registers their credential (σ) as an ordinary blockchain transaction. The adversary observes the chain but cannot tell which transaction, if any, is a registration.'
    );

    // ----- Adversary -----
    const atkX = xAt(T_REG_OPEN);
    const atkY = AXIS_Y + 56;

    el('line', {
      x1: atkX, y1: AXIS_Y + 4, x2: atkX, y2: atkY - 10,
      stroke: '#9b3a1c', 'stroke-width': 1.5, 'stroke-dasharray': '3 3'
    }, svg);

    el('path', {
      d: `M ${atkX} ${atkY - 10} L ${atkX - 9} ${atkY + 5} L ${atkX + 9} ${atkY + 5} Z`,
      fill: '#9b3a1c'
    }, svg);
    const atkIcon = txt(svg, atkX, atkY + 3, '!', { 'text-anchor': 'middle' });
    setFont(atkIcon, 'serif', '13', '700', '#fff');

    const atkLabel = txt(svg, atkX, atkY + 24, 'Adversary', { 'text-anchor': 'middle' });
    setFont(atkLabel, 'var(--sans)', '14', '600', '#9b3a1c');

    addHotspot(svg, atkX, atkY, 14,
      isExisting
        ? 'The adversary arrives at the start of the registration window. With a fixed window, the adversary need only act first to coerce the voter before they can register an honest credential.'
        : 'The adversary arrives, but with no fixed registration window, no matter how quickly they act, the voter could already have registered.'
    );
  }

  buildTrack(svgExisting, { track: 'existing' });
  buildTrack(svgCastIron, { track: 'cast-iron' });
})();
