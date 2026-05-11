(function () {
  const root = document.getElementById('dao-chart');
  if (!root) return;

  // Representative sample: low b-privacy + top 5 highest
  const allDaos = [
    { "name": "yieldguild", "private_bprivacy": 1.0, "noised_bprivacy": 1.0, "proposals": 1 },
    { "name": "balancer", "private_bprivacy": 1.016, "noised_bprivacy": 1.001, "proposals": 299 },
    { "name": "curve", "private_bprivacy": 1.114, "noised_bprivacy": 1.014, "proposals": 118 },
    { "name": "uniswap", "private_bprivacy": 2.945, "noised_bprivacy": 1.23, "proposals": 122 },
    { "name": "arbitrum", "private_bprivacy": 5.229, "noised_bprivacy": 1.476, "proposals": 279 },
    { "name": "polygonvalidators", "private_bprivacy": 28.811, "noised_bprivacy": 7.527, "proposals": 1 },
    { "name": "beanstalkdao", "private_bprivacy": 29.558, "noised_bprivacy": 9.283, "proposals": 33 },
    { "name": "poh", "private_bprivacy": 26.452, "noised_bprivacy": 14.134, "proposals": 108 },
    { "name": "shellprotocol", "private_bprivacy": 25.334, "noised_bprivacy": 17.677, "proposals": 13 },
    { "name": "aavegotchi", "private_bprivacy": 24.093, "noised_bprivacy": 18.246, "proposals": 250 }
  ];

  const daos = allDaos.sort((a, b) => a.noised_bprivacy - b.noised_bprivacy);

  drawChart(daos);

  function drawChart(daos) {
    const SVG = 'http://www.w3.org/2000/svg';
    const W = 1000, H = daos.length * 45 + 155;
    const M = { l: 200, r: 60, t: 60, b: 90 };
    const PLOT_W = W - M.l - M.r;
    const PLOT_H = H - M.t - M.b;

    // Log scale for X-axis
    const minLog = Math.log10(0.8);
    const maxLog = Math.log10(100);
    const xScale = (val) => M.l + ((Math.log10(val) - minLog) / (maxLog - minLog)) * PLOT_W;

    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('style', 'max-width: 100%;');
    root.appendChild(svg);

    // Background
    const bg = document.createElementNS(SVG, 'rect');
    bg.setAttribute('width', W);
    bg.setAttribute('height', H);
    bg.setAttribute('fill', '#fbfaf7');
    svg.appendChild(bg);

    // Vertical grid lines for log scale
    const logTicks = [1, 2, 3, 5, 10, 20, 30, 50, 100];
    logTicks.forEach(tick => {
      const x = xScale(tick);
      const line = document.createElementNS(SVG, 'line');
      line.setAttribute('x1', x);
      line.setAttribute('y1', M.t);
      line.setAttribute('x2', x);
      line.setAttribute('y2', M.t + PLOT_H);
      line.setAttribute('stroke', '#e6e2d6');
      line.setAttribute('stroke-width', '0.5');
      svg.appendChild(line);
    });

    // Baseline at 1.0 (dashed)
    const baselineX = xScale(1.0);
    const baseline = document.createElementNS(SVG, 'line');
    baseline.setAttribute('x1', baselineX);
    baseline.setAttribute('y1', M.t);
    baseline.setAttribute('x2', baselineX);
    baseline.setAttribute('y2', M.t + PLOT_H);
    baseline.setAttribute('stroke', '#8a6d1f');
    baseline.setAttribute('stroke-width', '1');
    baseline.setAttribute('stroke-dasharray', '4,4');
    svg.appendChild(baseline);

    // X-axis
    const xAxis = document.createElementNS(SVG, 'line');
    xAxis.setAttribute('x1', M.l);
    xAxis.setAttribute('y1', M.t + PLOT_H);
    xAxis.setAttribute('x2', M.l + PLOT_W);
    xAxis.setAttribute('y2', M.t + PLOT_H);
    xAxis.setAttribute('stroke', '#cfc8b3');
    xAxis.setAttribute('stroke-width', '1');
    svg.appendChild(xAxis);

    // Y-axis
    const yAxis = document.createElementNS(SVG, 'line');
    yAxis.setAttribute('x1', M.l);
    yAxis.setAttribute('y1', M.t);
    yAxis.setAttribute('x2', M.l);
    yAxis.setAttribute('y2', M.t + PLOT_H);
    yAxis.setAttribute('stroke', '#cfc8b3');
    yAxis.setAttribute('stroke-width', '1');
    svg.appendChild(yAxis);

    // X-axis labels
    logTicks.forEach(tick => {
      const x = xScale(tick);
      const label = document.createElementNS(SVG, 'text');
      label.setAttribute('x', x);
      label.setAttribute('y', M.t + PLOT_H + 28);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-family', 'var(--sans)');
      label.setAttribute('font-size', '18');
      label.setAttribute('fill', '#6b6757');
      label.textContent = tick;
      svg.appendChild(label);
    });

    // X-axis title
    const xTitle = document.createElementNS(SVG, 'text');
    xTitle.setAttribute('x', M.l + PLOT_W / 2);
    xTitle.setAttribute('y', H - 22);
    xTitle.setAttribute('text-anchor', 'middle');
    xTitle.setAttribute('font-family', 'var(--sans)');
    xTitle.setAttribute('font-size', '19');
    xTitle.setAttribute('fill', '#1a1a1a');
    xTitle.setAttribute('font-weight', '600');
    xTitle.textContent = 'Relative B-Privacy (Geometric Mean)';
    svg.appendChild(xTitle);

    // Plot dots and labels
    daos.forEach((dao, i) => {
      const y = M.t + i * 45 + 22;

      // DAO label (left side)
      const label = document.createElementNS(SVG, 'text');
      label.setAttribute('x', M.l - 8);
      label.setAttribute('y', y + 6);
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('font-family', 'var(--sans)');
      label.setAttribute('font-size', '18');
      label.setAttribute('fill', '#2c2c2c');
      label.setAttribute('font-weight', '500');
      label.textContent = `${dao.name} (n=${dao.proposals})`;
      svg.appendChild(label);

      // Green dot - Tally Perturbation 10%
      const greenDot = document.createElementNS(SVG, 'circle');
      greenDot.setAttribute('cx', xScale(dao.noised_bprivacy));
      greenDot.setAttribute('cy', y);
      greenDot.setAttribute('r', '5');
      greenDot.setAttribute('fill', '#2f8a3a');
      greenDot.setAttribute('stroke', 'none');
      greenDot.setAttribute('opacity', '0.85');
      svg.appendChild(greenDot);

      // Red dot - Winner-Only
      const redDot = document.createElementNS(SVG, 'circle');
      redDot.setAttribute('cx', xScale(dao.private_bprivacy));
      redDot.setAttribute('cy', y);
      redDot.setAttribute('r', '5');
      redDot.setAttribute('fill', '#d64545');
      redDot.setAttribute('stroke', 'none');
      redDot.setAttribute('opacity', '0.85');
      svg.appendChild(redDot);
    });

    // Legend
    const legendY = M.t + 35;
    const legendX = M.l + PLOT_W - 300;

    const redLegendDot = document.createElementNS(SVG, 'circle');
    redLegendDot.setAttribute('cx', legendX);
    redLegendDot.setAttribute('cy', legendY);
    redLegendDot.setAttribute('r', '4');
    redLegendDot.setAttribute('fill', '#d64545');
    redLegendDot.setAttribute('opacity', '0.85');
    svg.appendChild(redLegendDot);

    const redLegendLabel = document.createElementNS(SVG, 'text');
    redLegendLabel.setAttribute('x', legendX + 14);
    redLegendLabel.setAttribute('y', legendY + 5);
    redLegendLabel.setAttribute('font-family', 'var(--sans)');
    redLegendLabel.setAttribute('font-size', '17');
    redLegendLabel.setAttribute('fill', '#2c2c2c');
    redLegendLabel.setAttribute('font-weight', '500');
    redLegendLabel.textContent = 'Winner-Only';
    svg.appendChild(redLegendLabel);

    const greenLegendDot = document.createElementNS(SVG, 'circle');
    greenLegendDot.setAttribute('cx', legendX);
    greenLegendDot.setAttribute('cy', legendY + 26);
    greenLegendDot.setAttribute('r', '4');
    greenLegendDot.setAttribute('fill', '#2f8a3a');
    greenLegendDot.setAttribute('opacity', '0.85');
    svg.appendChild(greenLegendDot);

    const greenLegendLabel = document.createElementNS(SVG, 'text');
    greenLegendLabel.setAttribute('x', legendX + 14);
    greenLegendLabel.setAttribute('y', legendY + 31);
    greenLegendLabel.setAttribute('font-family', 'var(--sans)');
    greenLegendLabel.setAttribute('font-size', '17');
    greenLegendLabel.setAttribute('fill', '#2c2c2c');
    greenLegendLabel.setAttribute('font-weight', '500');
    greenLegendLabel.textContent = 'Tally Perturbation 10%';
    svg.appendChild(greenLegendLabel);

    const baselineLabel = document.createElementNS(SVG, 'text');
    baselineLabel.setAttribute('x', legendX + 14);
    baselineLabel.setAttribute('y', legendY + 56);
    baselineLabel.setAttribute('font-family', 'var(--sans)');
    baselineLabel.setAttribute('font-size', '17');
    baselineLabel.setAttribute('fill', '#8a6d1f');
    baselineLabel.setAttribute('font-weight', '500');
    baselineLabel.textContent = '─── Full-Disclosure (baseline)';
    svg.appendChild(baselineLabel);
  }
})();
