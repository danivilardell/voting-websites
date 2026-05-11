(function () {
  const feed = document.getElementById('ctc-feed');
  const input = document.getElementById('ctc-input');
  const commitBtn = document.getElementById('ctc-commit-btn');
  const openPanel = document.getElementById('ctc-open-panel');
  const openBtn = document.getElementById('ctc-open-btn');
  const verifyBox = document.getElementById('ctc-verify');
  if (!feed || !input || !commitBtn) return;

  // ---------- Random hex ----------
  function randHex(len) {
    const chars = '0123456789abcdef';
    let s = '';
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * 16)];
    return s;
  }
  function shortAddr() { return '0x' + randHex(4) + '…' + randHex(4); }
  function randNonce() { return '0x' + randHex(8) + '…' + randHex(6); }
  function fakeAmount() {
    const v = (Math.random() * 250 + 0.01).toFixed(2);
    return v + ' USDT';
  }

  // ---------- Simple hash (FNV-1a → hex) for demo ----------
  function simpleHash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    const h2 = Math.imul(h, 0x5bd1e995) ^ (h >>> 15);
    const a = (h >>> 0).toString(16).padStart(8, '0');
    const b = (h2 >>> 0).toString(16).padStart(8, '0');
    return a + b + a.split('').reverse().join('') + b.split('').reverse().join('');
  }

  // ---------- State ----------
  const TX_COUNT = 8;
  const CTC_INDEX = 4;
  let committedMessage = '';
  let randomness = '';
  let commitmentHash = '';

  function truncate(s, pre, suf) {
    if (s.length <= pre + suf + 1) return s;
    return s.slice(0, pre) + '…' + s.slice(-suf);
  }

  // ---------- Build transactions ----------
  function buildFeed() {
    feed.innerHTML = '';

    for (let i = 0; i < TX_COUNT; i++) {
      const isCtc = i === CTC_INDEX && committedMessage;
      const block = (28_500_000 + Math.floor(Math.random() * 50)).toLocaleString();
      const nonce = isCtc ? '0x' + truncate(commitmentHash, 8, 6) : randNonce();

      const row = document.createElement('div');
      row.className = 'ctc-tx';
      row.setAttribute('role', 'listitem');
      if (isCtc) row.dataset.ctc = '1';

      row.innerHTML =
        '<div class="ctc-tx-line">' +
          '<span class="ctc-tx-cell"><span class="ctc-key">from</span><span class="ctc-val">' + shortAddr() + '</span></span>' +
          '<span class="ctc-tx-cell"><span class="ctc-key">to</span><span class="ctc-val">' + shortAddr() + '</span></span>' +
          '<span class="ctc-tx-cell"><span class="ctc-key">amt</span><span class="ctc-val">' + fakeAmount() + '</span></span>' +
          '<span class="ctc-tx-cell"><span class="ctc-key">nonce</span><span class="ctc-val ctc-nonce">' + nonce + '</span></span>' +
        '</div>' +
        '<span class="ctc-tx-block">blk ' + block + '</span>';

      feed.appendChild(row);
    }

    var rows = feed.querySelectorAll('.ctc-tx');
    rows.forEach(function (r, i) {
      setTimeout(function () { r.classList.add('visible'); }, 100 + i * 140);
    });
  }

  // ---------- Commit ----------
  function doCommit() {
    var msg = input.value.trim();
    if (!msg) return;

    committedMessage = msg;
    randomness = randHex(16);
    commitmentHash = simpleHash(msg + '||' + randomness);
    input.disabled = true;
    commitBtn.disabled = true;

    if (openPanel) openPanel.classList.remove('visible');
    if (verifyBox) { verifyBox.classList.remove('visible'); verifyBox.innerHTML = ''; }

    buildFeed();

    setTimeout(function () {
      if (openPanel) openPanel.classList.add('visible');
    }, 100 + TX_COUNT * 140 + 400);
  }

  // ---------- Open ----------
  function doOpen() {
    if (!committedMessage) return;
    if (openPanel) openPanel.classList.remove('visible');

    var recomputed = simpleHash(committedMessage + '||' + randomness);
    var match = recomputed === commitmentHash;
    var nonceDisplay = '0x' + truncate(commitmentHash, 8, 6);

    // Step 1: Show the revealed values (the "opening")
    if (verifyBox) {
      verifyBox.innerHTML =
        '<div class="ctc-verify-box">' +
          '<div class="ctc-verify-header">Opening revealed:</div>' +
          '<span class="ctc-verify-line"><span class="ctc-verify-key">message (m)</span><span class="ctc-verify-val">' + committedMessage + '</span></span>' +
          '<span class="ctc-verify-line"><span class="ctc-verify-key">randomness (r)</span><span class="ctc-verify-val">0x' + randomness + '</span></span>' +
          '<div class="ctc-verify-result" id="ctc-verify-step2"></div>' +
        '</div>';
      verifyBox.classList.add('visible');
    }

    // Step 2: After a beat, compute and verify against the on-chain nonce
    setTimeout(function () {
      var step2 = document.getElementById('ctc-verify-step2');
      if (!step2) return;

      step2.innerHTML =
        '<div class="ctc-verify-header">Verification:</div>' +
        '<span class="ctc-verify-line"><span class="ctc-verify-key">H(m || r)</span><span class="ctc-verify-val">0x' + truncate(recomputed, 8, 6) + '</span></span>' +
        '<span class="ctc-verify-line"><span class="ctc-verify-key">on-chain nonce</span><span class="ctc-verify-val">' + nonceDisplay + '</span></span>' +
        '<span class="ctc-verify-line"><span class="ctc-verify-key">result</span><span class="ctc-verify-val ctc-verify-match">' + (match ? 'H(m || r) = nonce  ✓  Commitment verified' : 'mismatch ✗') + '</span></span>';
      step2.classList.add('ctc-verify-step2-visible');

      // Highlight the CTC transaction
      var ctcRow = feed.querySelector('.ctc-tx[data-ctc="1"]');
      if (ctcRow) {
        ctcRow.classList.add('highlight');
        setTimeout(function () {
          ctcRow.classList.remove('highlight');
          ctcRow.classList.add('opened');
          var reveal = document.createElement('div');
          reveal.className = 'ctc-tx-reveal';
          reveal.innerHTML =
            '<span class="rv-line"><span class="rv-key">m</span><span class="rv-val">' + committedMessage + '</span></span>' +
            '<span class="rv-line"><span class="rv-key">r</span><span class="rv-val">0x' + randomness + '</span></span>' +
            '<span class="rv-line"><span class="rv-key">H(m || r)</span><span class="rv-val">0x' + truncate(recomputed, 8, 6) + '</span></span>' +
            '<span class="rv-line"><span class="rv-key">match</span><span class="rv-val">nonce <span class="rv-arrow">=</span> H(m || r) ✓</span></span>';
          ctcRow.appendChild(reveal);
        }, 600);
      }
    }, 1200);
  }

  // ---------- Events ----------
  commitBtn.addEventListener('click', doCommit);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') doCommit();
  });
  if (openBtn) openBtn.addEventListener('click', doOpen);
})();
