(function () {
  const root = document.querySelector('#ctc .ctc-demo');
  if (!root) return;

  const feed = root.querySelector('#ctc-feed');
  const steps = root.querySelectorAll('.ctc-narration .ctc-step');

  const prefersReduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Pseudo-random hex generator ----------
  // Deterministic so reloads produce the same sample feed.
  let rngState = 0xc0ffee;
  function rand() {
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return rngState;
  }
  function hex(len) {
    const chars = '0123456789abcdef';
    let s = '';
    for (let i = 0; i < len; i++) s += chars[rand() % 16];
    return s;
  }
  function shortAddr() {
    return '0x' + hex(4) + '…' + hex(4);
  }
  function nonceShort() {
    return '0x' + hex(6) + '…' + hex(4);
  }
  function fakeAmount() {
    const presets = ['12.40 USDT', '187.00 USDT', '4.31 USDT', '0.85 USDT', '52.10 USDT', '230.00 USDT', '0.07 USDT', '8.42 USDT'];
    return presets[rand() % presets.length];
  }

  // The "real" CTC values shown when opened.
  // m is a voting credential bound to the voter's IC; r is fresh randomness.
  const REAL_CTC = {
    nonce: '0xb4c1…2a7e',                    // the on-chain nonce (truncated)
    m: 'σ_reg = Sign(IC.sk, (vk, IC.pk))',   // the registration message
    r: '0x' + 'fc09a1' + '…' + 'd817',       // the randomness
    hash: 'H(m ∥ r) = 0xb4c1…2a7e'      // the resulting commitment
  };

  // ---------- Build a fixed sample of 8 transactions ----------
  const TX_COUNT = 8;
  const HIGHLIGHT_INDEX = 4; // 0-based position of the CTC in the visible feed

  function makeTx(i, isCtc) {
    const block = 28_500_000 + i * 3 + (rand() % 3);
    const idx = rand() % 200;
    return {
      from: shortAddr(),
      to: shortAddr(),
      amount: fakeAmount(),
      nonce: isCtc ? REAL_CTC.nonce : nonceShort(),
      block,
      idx,
      isCtc
    };
  }

  const TRANSACTIONS = [];
  for (let i = 0; i < TX_COUNT; i++) {
    TRANSACTIONS.push(makeTx(i, i === HIGHLIGHT_INDEX));
  }

  function buildTxRow(tx) {
    const row = document.createElement('div');
    row.className = 'ctc-tx';
    row.setAttribute('role', 'listitem');
    if (tx.isCtc) row.dataset.ctc = '1';

    const main = document.createElement('div');
    main.className = 'ctc-tx-line';
    main.innerHTML = `
      <span class="ctc-tx-cell"><span class="ctc-key">from</span><span class="ctc-val">${tx.from}</span></span>
      <span class="ctc-tx-cell"><span class="ctc-key">to</span><span class="ctc-val">${tx.to}</span></span>
      <span class="ctc-tx-cell"><span class="ctc-key">amt</span><span class="ctc-val">${tx.amount}</span></span>
      <span class="ctc-tx-cell"><span class="ctc-key">r&sigma;</span><span class="ctc-val ctc-nonce">${tx.nonce}</span></span>
    `;

    const meta = document.createElement('span');
    meta.className = 'ctc-tx-block';
    meta.textContent = `blk ${tx.block.toLocaleString()} · ${tx.idx}`;

    row.appendChild(main);
    row.appendChild(meta);

    if (tx.isCtc) {
      const reveal = document.createElement('div');
      reveal.className = 'ctc-tx-reveal';
      reveal.innerHTML = `
        <span class="rv-line"><span class="rv-key">m</span><span class="rv-val">${REAL_CTC.m}</span></span>
        <span class="rv-line"><span class="rv-key">r</span><span class="rv-val">${REAL_CTC.r}</span></span>
        <span class="rv-line"><span class="rv-key">commitment</span><span class="rv-val">${REAL_CTC.hash}</span></span>
        <span class="rv-line"><span class="rv-key">match</span><span class="rv-val">on-chain r&sigma; <span class="rv-arrow">=</span> H(m ∥ r) ✓</span></span>
      `;
      row.appendChild(reveal);
    }

    return row;
  }

  // ---------- Animation timing ----------
  const APPEAR_GAP    = 220;   // delay between each tx appearing
  const HIGHLIGHT_AT  = 1100;  // after all visible: hold, then highlight
  const OPEN_AT       = 2400;  // after highlight: hold, then open
  const HOLD_FINAL    = 6000;  // hold the opened state before resetting
  const RESET_GAP     = 900;   // brief blank before next cycle

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

  function setStep(i) {
    steps.forEach((s, idx) => s.classList.toggle('active', idx === i));
  }

  function buildFeed() {
    feed.innerHTML = '';
    TRANSACTIONS.forEach(tx => feed.appendChild(buildTxRow(tx)));
  }

  function showAllVisible() {
    feed.querySelectorAll('.ctc-tx').forEach(r => r.classList.add('visible'));
  }

  function highlightCtc() {
    const ctc = feed.querySelector('.ctc-tx[data-ctc="1"]');
    if (ctc) ctc.classList.add('highlight');
  }

  function openCtc() {
    const ctc = feed.querySelector('.ctc-tx[data-ctc="1"]');
    if (ctc) {
      ctc.classList.remove('highlight');
      ctc.classList.add('opened');
    }
  }

  function resetCtc() {
    const ctc = feed.querySelector('.ctc-tx[data-ctc="1"]');
    if (ctc) ctc.classList.remove('highlight', 'opened');
    feed.querySelectorAll('.ctc-tx').forEach(r => r.classList.remove('visible'));
  }

  function showFinal() {
    buildFeed();
    showAllVisible();
    highlightCtc();
    openCtc();
    setStep(3);
  }

  function runCycle() {
    if (cancelled) return;
    buildFeed();
    setStep(0);

    // Stagger appearance of each transaction
    const rows = feed.querySelectorAll('.ctc-tx');
    rows.forEach((r, i) => {
      schedule(() => r.classList.add('visible'), 200 + i * APPEAR_GAP);
    });
    const allVisibleAt = 200 + (rows.length - 1) * APPEAR_GAP + 400;

    // Step 1: highlight
    schedule(() => {
      setStep(1);
      highlightCtc();
    }, allVisibleAt + HIGHLIGHT_AT);

    // Step 2: open
    schedule(() => {
      setStep(2);
      openCtc();
    }, allVisibleAt + HIGHLIGHT_AT + OPEN_AT);

    // Step 3: key-insight call out
    schedule(() => {
      setStep(3);
    }, allVisibleAt + HIGHLIGHT_AT + OPEN_AT + 2400);

    // Reset
    schedule(() => {
      resetCtc();
      schedule(runCycle, RESET_GAP);
    }, allVisibleAt + HIGHLIGHT_AT + OPEN_AT + HOLD_FINAL);
  }

  function play() {
    if (running) return;
    running = true;
    cancelled = false;
    if (prefersReduced) { showFinal(); return; }
    runCycle();
  }

  function pause() {
    cancelled = true;
    running = false;
    clearTimers();
  }

  // Initial build (hidden)
  buildFeed();

  if (prefersReduced) {
    showFinal();
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
