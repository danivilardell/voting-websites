(function () {
  'use strict';

  var wrap = document.getElementById('bribe-game-wrap');
  if (!wrap) return;

  var params = { epsilon: 1.0, alpha: 0.60, beta: 0.56, delta: 0.30 };

  var sliderDefs = [
    { key: 'epsilon', label: 'Evasion success (γ)', min: 0,    max: 1, step: 0.01 },
    { key: 'alpha',   label: 'Pay if cooperate (α)', min: 0,    max: 1, step: 0.01 },
    { key: 'beta',    label: 'Pay if defect (β)',    min: 0,    max: 1, step: 0.01 },
    { key: 'delta',   label: 'Pivotality',           min: 0.02, max: 1, step: 0.01 }
  ];

  // ── Protocol parameter sliders ──────────────────────────────────────
  var controlsEl = document.createElement('div');
  controlsEl.className = 'bg-controls';

  var sliderGrid = document.createElement('div');
  sliderGrid.className = 'bg-slider-grid';

  sliderDefs.forEach(function (d) {
    var row = document.createElement('div');
    row.className = 'bg-slider-row';

    var lbl = document.createElement('label');
    var nameSpan = document.createElement('span');
    nameSpan.textContent = d.label;
    var valSpan = document.createElement('span');
    valSpan.className = 'bg-slider-val';
    valSpan.textContent = params[d.key].toFixed(2);
    lbl.appendChild(nameSpan);
    lbl.appendChild(valSpan);

    var inp = document.createElement('input');
    inp.type = 'range';
    inp.min  = d.min;
    inp.max  = d.max;
    inp.step = d.step;
    inp.value = params[d.key];
    inp.addEventListener('input', function () {
      params[d.key] = parseFloat(inp.value);
      valSpan.textContent = params[d.key].toFixed(2);
      updateGap();
    });

    row.appendChild(lbl);
    row.appendChild(inp);
    sliderGrid.appendChild(row);
  });

  var gapEl = document.createElement('div');
  gapEl.className = 'bg-gap';

  function updateGap() {
    var g = params.alpha - params.beta;
    gapEl.innerHTML = 'Detection gap (α&minus;β):&ensp;<strong>' + Math.max(0, g).toFixed(2) + '</strong>';
    gapEl.dataset.level = g < 0.05 ? 'small' : g < 0.2 ? 'mid' : 'large';
  }
  updateGap();

  var distEl = document.createElement('div');
  distEl.className = 'bg-gap';
  distEl.innerHTML = 'Voter utility distribution U<sub>no</sub>&thinsp;&sim;&thinsp;N(1,&thinsp;0.8<sup>2</sup>)';

  var metaRow = document.createElement('div');
  metaRow.className = 'bg-meta-row';
  metaRow.appendChild(distEl);
  metaRow.appendChild(gapEl);

  controlsEl.appendChild(sliderGrid);
  controlsEl.appendChild(metaRow);
  wrap.appendChild(controlsEl);

  // ── Bribe offer row ─────────────────────────────────────────────────
  var offerRowEl = document.createElement('div');
  offerRowEl.className = 'bg-offer-row';

  var brLabel = document.createElement('span');
  brLabel.className = 'bg-bribe-label';
  brLabel.textContent = 'Bribe:';

  var brSlider = document.createElement('input');
  brSlider.type  = 'range';
  brSlider.min   = 0;
  brSlider.max   = 5;
  brSlider.step  = 0.05;
  brSlider.value = 1.5;
  brSlider.className = 'bg-bribe-slider';

  var brValEl = document.createElement('span');
  brValEl.className = 'bg-bribe-val';
  brValEl.textContent = '$1.50';
  brSlider.addEventListener('input', function () {
    brValEl.textContent = '$' + parseFloat(brSlider.value).toFixed(2);
  });

  var offerBtn = document.createElement('button');
  offerBtn.className = 'bg-offer-btn';
  offerBtn.textContent = 'Offer bribe';

  offerRowEl.appendChild(brLabel);
  offerRowEl.appendChild(brSlider);
  offerRowEl.appendChild(brValEl);
  offerRowEl.appendChild(offerBtn);
  wrap.appendChild(offerRowEl);

  // ── Result stage ─────────────────────────────────────────────────────
  var stageEl = document.createElement('div');
  stageEl.className = 'bg-stage';
  wrap.appendChild(stageEl);

  // ── Game logic ────────────────────────────────────────────────────────
  function randn() {
    var u, v;
    do { u = Math.random(); } while (u === 0);
    do { v = Math.random(); } while (v === 0);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  offerBtn.addEventListener('click', function () {
    var b   = parseFloat(brSlider.value);
    var eps = params.epsilon;
    var al  = params.alpha;
    var be  = params.beta;
    var del = params.delta;

    // Voter utility for "no" drawn from N(1, 0.8); positive = prefers no
    var U   = 1 + 0.8 * randn();
    var p0  = 0.5 + del / 2;          // Pr[no wins | voter votes no]
    var p1  = 0.5 - del / 2;          // Pr[no wins | voter votes yes]

    var EU_ign  = U * p0;
    var EU_def  = be * b + U * (eps * p0 + (1 - eps) * p1);
    var EU_coop = al * b + U * p1;

    var maxEU  = Math.max(EU_ign, EU_def, EU_coop);
    var action = maxEU === EU_ign ? 'ignore' : maxEU === EU_def ? 'defect' : 'cooperate';

    var vote;
    if      (action === 'ignore')    vote = 'no';
    else if (action === 'cooperate') vote = 'yes';
    else                             vote = Math.random() < eps ? 'no' : 'yes';

    var payProb = action === 'cooperate' ? al : action === 'defect' ? be : 0;
    var paid    = action !== 'ignore' && Math.random() < payProb;

    render({ b: b, U: U, EU_ign: EU_ign, EU_def: EU_def, EU_coop: EU_coop,
             action: action, vote: vote, payProb: payProb, paid: paid });
  });

  // ── Rendering ─────────────────────────────────────────────────────────
  function render(r) {
    stageEl.innerHTML = '';
    var steps = [step1(r), step2(r), step3(r), step4(r)];
    steps.forEach(function (s, i) {
      s.style.opacity   = '0';
      s.style.transform = 'translateY(8px)';
      stageEl.appendChild(s);
      setTimeout(function () {
        s.style.transition = 'opacity 360ms ease, transform 360ms ease';
        s.style.opacity    = '1';
        s.style.transform  = 'translateY(0)';
      }, 60 + i * 430);
    });
  }

  function makeCard(extra) {
    var el = document.createElement('div');
    el.className = 'bg-step' + (extra ? ' ' + extra : '');
    return el;
  }

  function makeHeader(num, title, muted) {
    var el = document.createElement('div');
    el.className = 'bg-step-hdr';
    el.innerHTML =
      '<span class="bg-step-num">' + num + '</span>' +
      '<span class="bg-step-title' + (muted ? ' bg-step-title-muted' : '') + '">' + title + '</span>';
    return el;
  }

  function step1(r) {
    var c = makeCard();
    c.appendChild(makeHeader('①', 'Bribe sent'));
    var body = document.createElement('div');
    body.className = 'bg-offer-viz';
    body.innerHTML =
      '<span class="bg-pill bg-pill-you">You</span>' +
      '<span class="bg-arrow-txt">──── $' + r.b.toFixed(2) + ' ────▶</span>' +
      '<span class="bg-pill bg-pill-voter">Voter</span>';
    c.appendChild(body);
    return c;
  }

  function step2(r) {
    var c = makeCard('bg-step-hidden');
    c.appendChild(makeHeader('②', 'Voter decides — you cannot see this', true));

    var uEl = document.createElement('div');
    uEl.className = 'bg-u-drawn';
    uEl.innerHTML = 'U<sub>no</sub>&thinsp;=&thinsp;<strong class="bg-u-val">' + r.U.toFixed(3) + '</strong>';
    c.appendChild(uEl);

    var minEU  = Math.min(r.EU_ign, r.EU_def, r.EU_coop);
    var maxEU  = Math.max(r.EU_ign, r.EU_def, r.EU_coop);
    var spread = maxEU - minEU;

    function barW(eu) {
      return spread > 0 ? 12 + 72 * (eu - minEU) / spread : 50;
    }

    var rows = [
      { act: 'ignore',    label: 'Ignore',    eu: r.EU_ign  },
      { act: 'defect',    label: 'Defect',    eu: r.EU_def  },
      { act: 'cooperate', label: 'Cooperate', eu: r.EU_coop }
    ];

    var table = document.createElement('div');
    table.className = 'bg-eu-table';
    rows.forEach(function (row) {
      var best  = row.act === r.action;
      var rowEl = document.createElement('div');
      rowEl.className = 'bg-eu-row' + (best ? ' bg-eu-best' : '');
      rowEl.innerHTML =
        '<span class="bg-eu-act">' + row.label + '</span>' +
        '<span class="bg-eu-bar-wrap"><span class="bg-eu-bar" style="width:' + barW(row.eu).toFixed(1) + '%"></span></span>' +
        '<span class="bg-eu-num">' + row.eu.toFixed(3) + '</span>' +
        '<span class="bg-eu-tag">' + (best ? 'chosen' : '') + '</span>';
      table.appendChild(rowEl);
    });
    c.appendChild(table);
    return c;
  }

  function step3(r) {
    var c = makeCard('bg-step-hidden');
    c.appendChild(makeHeader('③', 'Ballot cast — you cannot see this', true));

    var row = document.createElement('div');
    row.className = 'bg-vote-row';

    var badge = document.createElement('span');
    badge.className = 'bg-ballot bg-ballot-' + r.vote;
    badge.textContent = r.vote.toUpperCase();
    row.appendChild(badge);

    var note = document.createElement('span');
    note.className = 'bg-vote-note';
    if      (r.action === 'ignore')    note.textContent = 'voted honestly — no bribe interaction';
    else if (r.action === 'cooperate') note.textContent = 'voted as instructed';
    else note.textContent = r.vote === 'no'
      ? 'defected — evasion succeeded (γ = ' + params.epsilon.toFixed(2) + ')'
      : 'defected — evasion failed (γ = ' + params.epsilon.toFixed(2) + ')';
    row.appendChild(note);

    c.appendChild(row);
    return c;
  }

  function step4(r) {
    var c = makeCard('bg-step-observe');
    c.appendChild(makeHeader('④', 'What you observe'));

    var body = document.createElement('div');
    body.className = 'bg-observe';

    if (r.action === 'ignore') {
      body.innerHTML = '<div class="bg-obs-row">No payment request &mdash; voter ignored the bribe.</div>';
    } else {
      body.innerHTML =
        '<div class="bg-obs-row bg-obs-ambig">Payment request received &mdash; voter&rsquo;s action is not observable to you.</div>' +
        '<div class="bg-obs-row">Payment determined by:&ensp;' +
          '<strong>α&thinsp;=&thinsp;' + (params.alpha * 100).toFixed(0) + '%</strong> if cooperate &ensp;·&ensp;' +
          '<strong>β&thinsp;=&thinsp;' + (params.beta  * 100).toFixed(0) + '%</strong> if defect' +
        '</div>' +
        '<div class="bg-obs-row"><span class="bg-pay-outcome ' + (r.paid ? 'bg-paid' : 'bg-not-paid') + '">' +
          (r.paid ? '✓&ensp;paid $' + r.b.toFixed(2) : '✗&ensp;not paid') +
        '</span></div>';
    }
    c.appendChild(body);
    return c;
  }
})();