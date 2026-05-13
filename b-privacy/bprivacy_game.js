(function () {
  const root = document.querySelector('#bprivacy-game .bribe-lab');
  if (!root) return;

  const phaseEl = {
    step: root.querySelector('.bribe-phase-step'),
    label: root.querySelector('.bribe-phase-label'),
    dots: root.querySelectorAll('.bribe-phase-dots .dot')
  };
  const cells = {
    public: root.querySelector('.bribe-cell[data-mode="public"]'),
    noised: root.querySelector('.bribe-cell[data-mode="noised"]'),
    private: root.querySelector('.bribe-cell[data-mode="private"]')
  };

  const prefersReduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const CONTENT = {
    offer: {
      label: 'The offer',
      public: { adv: '<b>Alice</b>, vote <b>In favour</b> and I will pay you <b>100</b>. I will read your ballot straight from the public tally.' },
      noised: { adv: '<b>Alice</b>, vote <b>In favour</b> and I will pay you <b>100</b> if the noisy totals suggest you complied.' },
      private: { adv: '<b>Alice</b>, vote <b>In favour</b> and I will pay you <b>100</b> if <em>In favour</em> wins.' }
    },
    vote: {
      label: 'Alice decides (w = 3)',
      public: { voter: 'The adversary will see my choice. If I vote <em>In favour</em>, I will be paid. If I vote <em>Against</em>, I won\'t.' },
      noised: { voter: 'The noise hides me. I vote <em>Against</em>. The adversary may still pay me.' },
      private: { voter: 'They only see the winner, not my ballot. I pocket the bribe if <em>In favour</em> wins <em>and</em> still vote <em>Against</em>.' }
    },
    reveal: {
      label: 'What the tally reveals',
      public: { tally: renderPublicTally },
      noised: { tally: renderNoisedTally },
      private: { tally: renderPrivateTally }
    },
    verify: {
      label: 'The adversary checks',
      public: { advVerify: 'Alice voted <em>In favour</em>. <b>I pay 100</b>.' },
      noised: { advVerify: 'Noisy totals are consistent with Alice complying (p&nbsp;&asymp;&nbsp;0.5). <b>I pay 100</b>.' },
      private: { advVerify: '<em>In favour</em> wins. <b>I pay 100</b>.' }
    },
    verdict: {
      label: 'Bribery outcome',
      public: { verdict: { tag: 'Low B-Privacy', text: 'The adversary can observe Alice\'s vote and enforce a per-ballot contract. The voters are heavily incentivised to comply.' } },
      noised: { verdict: { tag: 'Medium B-Privacy', text: 'Alice was able to vote Against and receive the bribe. The probabilistic contract increases the general cost to overturn an election.' } },
      private: { verdict: { tag: 'High B-Privacy', text: 'Alice once again was able to vote privately her preference and receive the bribe. This greatly increases the cost of compliance and therefore the cost of bribery.' } }
    }
  };

  const PHASES = ['offer', 'vote', 'reveal', 'verify', 'verdict'];

  const HOLD = {
    offer: 7000,
    vote: 7000,
    reveal: 7500,
    verify: 8000,
    verdict: 14000
  };
  const CYCLE_BLANK = 1600;
  const STEP_FADE_IN = 550;

  function renderPublicTally() {
    return `
      <div class="tv-title">Full tally &middot; per ballot</div>
      <div class="tv-row"><span><b>Bob</b> &middot; w=10</span><span class="tv-vote-a">In favour</span></div>
      <div class="tv-row"><span><b>Carol</b> &middot; w=9</span><span class="tv-vote-b">Against</span></div>
      <div class="tv-row"><span><b>Dave</b> &middot; w=4</span><span class="tv-vote-b">Against</span></div>
      <div class="tv-row"><span><b>Alice</b> &middot; w=3</span><span class="tv-vote-a">In favour</span></div>
      <div class="tv-row"><span><b>Eve</b> &middot; w=2</span><span class="tv-vote-a">In favour</span></div>
    `;
  }

  function renderNoisedTally() {
    return `
      <div class="tv-title">Noised totals &middot; &plusmn; noise</div>
      <div class="tv-bar">
        <span class="tv-bar-label tv-vote-a">In favour</span>
        <span class="tv-bar-track">
          <span class="tv-bar-fill" style="width: 54%;"></span>
          <span class="tv-bar-err" style="left: 42%; right: 34%;"></span>
        </span>
        <span class="tv-bar-value">&asymp; 13</span>
      </div>
      <div class="tv-bar">
        <span class="tv-bar-label tv-vote-b">Against</span>
        <span class="tv-bar-track">
          <span class="tv-bar-fill against" style="width: 62%;"></span>
          <span class="tv-bar-err" style="left: 50%; right: 26%;"></span>
        </span>
        <span class="tv-bar-value">&asymp; 15</span>
      </div>
    `;
  }

  function renderPrivateTally() {
    return `
      <div class="tv-title">Published result</div>
      <div class="tv-winner">In favour wins</div>
    `;
  }

  function slot(cell, phase) {
    return cell.querySelector('.slot-' + phase);
  }

  function populate(cell, phase) {
    const spec = CONTENT[phase][cell.dataset.mode] || {};
    const s = slot(cell, phase);
    if (!s) return;
    if (phase === 'offer' && spec.adv) {
      s.querySelector('.bubble p').innerHTML = spec.adv;
    } else if (phase === 'vote' && spec.voter) {
      s.querySelector('.bubble p').innerHTML = spec.voter;
    } else if (phase === 'reveal' && spec.tally) {
      s.querySelector('.tally-inner').innerHTML = spec.tally();
    } else if (phase === 'verify' && spec.advVerify) {
      s.querySelector('.bubble p').innerHTML = spec.advVerify;
    } else if (phase === 'verdict' && spec.verdict) {
      s.querySelector('.verdict-tag').textContent = spec.verdict.tag;
      s.querySelector('.verdict-text').innerHTML = spec.verdict.text;
    }
  }

  function setPhase(i) {
    const phase = PHASES[i];
    phaseEl.step.textContent = `Phase ${i + 1} of ${PHASES.length}`;
    phaseEl.label.textContent = CONTENT[phase].label;
    phaseEl.dots.forEach((d, idx) => {
      d.classList.toggle('done', idx < i);
      d.classList.toggle('current', idx === i);
    });

    ['public', 'noised', 'private'].forEach(mode => {
      const cell = cells[mode];
      populate(cell, phase);
      const s = slot(cell, phase);
      if (s) {
        s.classList.add('visible');
        // mark current slot; clear 'current' on the one that was current before
        cell.querySelectorAll('.slot.current').forEach(el => el.classList.remove('current'));
        s.classList.add('current');
      }
    });
  }

  function clearAll() {
    phaseEl.dots.forEach(d => d.classList.remove('done', 'current'));
    ['public', 'noised', 'private'].forEach(mode => {
      cells[mode].querySelectorAll('.slot').forEach(s => {
        s.classList.remove('visible', 'current');
      });
    });
  }

  function showFinal() {
    clearAll();
    PHASES.forEach((_, i) => setPhase(i));
  }

  let timers = [];
  let cancelled = false;
  let running = false;
  let finished = false;

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
  }

  function runPhase(i) {
    if (cancelled) return;
    setPhase(i);
    const phase = PHASES[i];
    const hold = HOLD[phase] || 6000;
    if (i + 1 < PHASES.length) {
      schedule(() => runPhase(i + 1), hold);
    } else {
      finished = true;
    }
  }

  function play() {
    if (running) return;
    if (finished) { showFinal(); return; }
    running = true;
    cancelled = false;
    if (prefersReduced) { showFinal(); return; }
    clearAll();
    schedule(() => runPhase(0), 400);
  }

  function pause() {
    cancelled = true;
    running = false;
    clearTimers();
  }

  // Add click handlers to dots
  phaseEl.dots.forEach((dot, idx) => {
    dot.style.cursor = 'pointer';
    dot.addEventListener('click', () => {
      clearTimers();
      running = false;
      cancelled = false;
      clearAll();
      // Show all phases up to and including the clicked one
      for (let i = 0; i <= idx; i++) {
        setPhase(i);
      }
      // Resume animation from the clicked phase after a delay
      const phase = PHASES[idx];
      const hold = HOLD[phase] || 6000;
      schedule(() => {
        if (idx + 1 < PHASES.length) {
          running = true;
          runPhase(idx + 1);
        }
      }, hold);
    });
  });

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
    }, { threshold: 0.15 });
    io.observe(root);
  } else {
    play();
  }
})();
