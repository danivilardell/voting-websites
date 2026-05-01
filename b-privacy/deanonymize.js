(function () {
  const root = document.querySelector('#deanonymize .deanon');
  if (!root) return;

  const sequence = [
    {
      narration: 1,
      reveals: [{ bar: 'a', weight: 12, chip: 0 }]
    },
    {
      narration: 2,
      reveals: [{ bar: 'b', weight: 7, chip: 1 }]
    },
    {
      narration: 3,
      reveals: [
        { bar: 'b', weight: 4, chip: 2 },
        { bar: 'a', weight: 3, chip: 3 },
        { bar: 'a', weight: 2, chip: 4 }
      ]
    }
  ];

  const REVEAL_TO_REMOVE = 2200;
  const BETWEEN_STEPS    = 2900;
  const INITIAL_DELAY    = 2000;
  const FINAL_HOLD       = 4500;
  const CYCLE_GAP        = 2000;

  const rows = root.querySelectorAll('.row');
  const totalEl = { a: rows[0].querySelector('.row-total'), b: rows[1].querySelector('.row-total') };
  const steps = root.querySelectorAll('.narration .step');
  const ledgerChips = root.querySelectorAll('.ledger-chip');

  const prefersReduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let timers = [];
  let remaining = { a: 17, b: 11 };
  let running = false;
  let cancelled = false;

  function clearTimers() {
    timers.forEach(t => clearTimeout(t));
    timers = [];
  }

  function schedule(fn, delay) {
    const id = setTimeout(() => {
      if (cancelled) return;
      fn();
    }, delay);
    timers.push(id);
    return id;
  }

  function setStep(i) {
    steps.forEach((s, idx) => s.classList.toggle('active', idx === i));
  }

  function resetVisuals() {
    remaining = { a: 17, b: 11 };
    root.querySelectorAll('.seg').forEach(s => s.classList.remove('revealed', 'removed'));
    ledgerChips.forEach(c => c.classList.remove('shown'));
    totalEl.a.textContent = '17';
    totalEl.b.textContent = '11';
    setStep(0);
  }

  function nextSeg(bar) {
    return root.querySelector('.bar-' + bar + ' .seg:not(.revealed)');
  }

  function showFinalState() {
    resetVisuals();
    sequence.forEach(tick => {
      tick.reveals.forEach(r => {
        const seg = nextSeg(r.bar);
        if (seg) seg.classList.add('revealed', 'removed');
        remaining[r.bar] -= r.weight;
        ledgerChips[r.chip].classList.add('shown');
      });
    });
    totalEl.a.textContent = remaining.a;
    totalEl.b.textContent = remaining.b;
    setStep(sequence[sequence.length - 1].narration);
  }

  function revealTick(i) {
    if (cancelled || i >= sequence.length) return;
    const tick = sequence[i];

    const segs = tick.reveals.map(r => {
      const seg = nextSeg(r.bar);
      if (seg) seg.classList.add('revealed');
      return { r, seg };
    });
    setStep(tick.narration);

    schedule(() => {
      segs.forEach(({ r, seg }) => {
        if (seg) seg.classList.add('removed');
        remaining[r.bar] -= r.weight;
        totalEl[r.bar].textContent = remaining[r.bar];
        ledgerChips[r.chip].classList.add('shown');
      });

      if (i + 1 < sequence.length) {
        schedule(() => revealTick(i + 1), BETWEEN_STEPS);
      } else {
        schedule(cycle, FINAL_HOLD);
      }
    }, REVEAL_TO_REMOVE);
  }

  function cycle() {
    if (cancelled) return;
    resetVisuals();
    schedule(() => revealTick(0), CYCLE_GAP);
  }

  function play() {
    if (running) return;
    running = true;
    cancelled = false;
    if (prefersReduced) { showFinalState(); return; }
    resetVisuals();
    schedule(() => revealTick(0), INITIAL_DELAY);
  }

  function pause() {
    cancelled = true;
    running = false;
    clearTimers();
  }

  if (prefersReduced) {
    showFinalState();
    return;
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) play();
        else pause();
      });
    }, { threshold: 0.25 });
    io.observe(root);
  } else {
    play();
  }
})();
