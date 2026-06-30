// 財務健康診断

function renderHealthDiag(container, budget) {
  if (!budget) {
    container.innerHTML = '<div class="no-data">予算データがありません。</div>';
    return;
  }

  const company = window.App?.currentCompany;
  const capital = company?.capital || 10000000;
  const metrics = (budget.dynamicAccounts && budget.dynamicAccounts.length)
    ? calcHealthMetricsDynamic(budget, capital)
    : calcHealthMetrics(budget.rows, capital);
  const items = [
  const _fmtPct = v => (v == null || isNaN(v)) ? '—' : v.toFixed(1);
  const _fmtNum = v => (v == null || isNaN(v)) ? '—' : fmt(v);
  const items = [
    { key: 'equity_ratio',     label: '自己資本比率',       value: metrics.equity_ratio,     unit: '%',   fmt: _fmtPct },
    { key: 'current_ratio',    label: '流動比率',           value: metrics.current_ratio,    unit: '%',   fmt: _fmtPct },
    { key: 'quick_ratio',      label: '当座比率',           value: metrics.quick_ratio,      unit: '%',   fmt: _fmtPct },
    { key: 'op_margin',        label: '売上高経常利益率',   value: metrics.op_margin,        unit: '%',   fmt: _fmtPct },
    { key: 'labor_ratio',      label: '労働分配率',         value: metrics.labor_ratio,      unit: '%',   fmt: _fmtPct },
    { key: 'ebitda',           label: 'EBITDA',             value: metrics.ebitda,           unit: '',    fmt: _fmtNum },
    { key: 'loan_month_ratio', label: '借入金月商倍率',     value: metrics.loan_month_ratio, unit: 'か月', fmt: _fmtPct },
  ];

  const gradeColor = { A:'#10b981', B:'#3b82f6', C:'#f59e0b', D:'#f97316', E:'#ef4444' };

  const rows = items.map(item => {
    const grade = item.key === 'ebitda' ? '–' : gradeMetric(item.key, item.value);
    const color = gradeColor[grade] || '#6b7280';
    const comment = (METRIC_COMMENTS[item.key]||{})[grade] || '';
    return `
      <tr>
        <td>${item.label}</td>
        <td class="num">${item.fmt(item.value)} ${item.unit}</td>
        <td><span class="grade-badge" style="background:${color}">${grade}</span></td>
        <td class="comment">${comment}</td>
      </tr>`;
  }).join('');

  // 総合スコア
  const grades = items
    .filter(i => i.key !== 'ebitda')
    .map(i => gradeMetric(i.key, i.value));
  const scoreMap = {A:5,B:4,C:3,D:2,E:1};
  const avg = grades.reduce((a,g) => a + (scoreMap[g]||3), 0) / grades.length;
  const overallGrade = avg >= 4.5?'A': avg>=3.5?'B': avg>=2.5?'C': avg>=1.5?'D':'E';
  const overallColor = gradeColor[overallGrade];

  // 優先改善アクション（グレードが低い順）
  const scoredItems = items
    .filter(i => i.key !== 'ebitda')
    .map(i => ({ ...i, grade: gradeMetric(i.key, i.value), score: {A:5,B:4,C:3,D:2,E:1}[gradeMetric(i.key, i.value)] || 3 }))
    .sort((a, b) => a.score - b.score);
  const priorities = scoredItems.slice(0, 2);

  const overallSummary = (() => {
    if (overallGrade === 'A') return '財務体力は非常に高く、経営の安定性・成長投資の余力ともに十分な状態です。';
    if (overallGrade === 'B') return '財務状態は良好です。一部の指標をさらに改善することで、より盤石な経営基盤が築けます。';
    if (overallGrade === 'C') return '財務体力は中程度です。強みと課題が混在しており、優先課題への集中的な取り組みが鍵です。';
    if (overallGrade === 'D') return '財務状態にいくつかの課題があります。早めの対策が将来のリスク軽減につながります。';
    return '財務上の緊急課題があります。優先度の高い指標から順に、具体的な改善アクションを実行してください。';
  })();

  const gradeDistHtml = ['A','B','C','D','E'].map(g => {
    const cnt = scoredItems.filter(i => i.grade === g).length;
    const c = gradeColor[g];
    return cnt > 0 ? `<span style="display:inline-flex;align-items:center;gap:3px;font-size:12px;font-weight:700;color:${c}"><span style="width:18px;height:18px;border-radius:50%;background:${c};display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:10px">${g}</span>×${cnt}</span>` : '';
  }).filter(Boolean).join('<span style="color:var(--border);margin:0 2px">|</span>');

  container.innerHTML = `
    <div class="sim-panel">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px">
        <h2 class="section-title" style="margin-bottom:0">財務健康診断</h2>
        <button class="btn btn-sm btn-outline" onclick="showPage('home')" style="margin-left:auto">← ホームに戻る</button>
      </div>
      <div class="health-overview card">
        <div class="overall-grade">
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:.05em;margin-bottom:6px">総合評価</div>
          <div class="grade-big" style="color:${overallColor}">${overallGrade}</div>
          <div style="font-size:11px;color:var(--text-muted);margin:8px 0 12px;line-height:1.6">${overallSummary}</div>
          <div style="margin-bottom:14px">${gradeDistHtml}</div>
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:8px">▼ 優先改善ポイント</div>
          ${priorities.map(p => `
            <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;padding:8px 10px;background:var(--bg);border-radius:8px;border-left:3px solid ${gradeColor[p.grade]}">
              <span style="font-size:13px;font-weight:800;color:${gradeColor[p.grade]};min-width:18px">${p.grade}</span>
              <div>
                <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:2px">${p.label}</div>
                <div style="font-size:11px;color:var(--text-muted);line-height:1.5">${(METRIC_COMMENTS[p.key]||{})[p.grade]||''}</div>
              </div>
            </div>`).join('')}
        </div>
        <div class="radar-wrap">
          <canvas id="health_radar" style="width:100%;height:100%"></canvas>
        </div>
      </div>
      <div class="card" style="margin-top:1rem">
        <table class="result-table health-table">
          <thead>
            <tr><th>指標</th><th>数値</th><th>評価</th><th>コメント</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;

  // レーダーチャート
  if (typeof Chart !== 'undefined') {
    const radarItems = items.filter(i => i.key !== 'ebitda');
    const data = radarItems.map(i => {
      const g = gradeMetric(i.key, i.value);
      return scoreMap[g] || 3;
    });
    const ctx = document.getElementById('health_radar');
    if (ctx) {
      new Chart(ctx, {
        type: 'radar',
        data: {
          labels: radarItems.map(i => i.label),
          datasets: [{
            label: '財務スコア',
            data,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.2)',
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          scales: { r: { min:0, max:5, ticks: { stepSize:1 } } },
          plugins: { legend: { display: false } }
        }
      });
    }
  }
}
