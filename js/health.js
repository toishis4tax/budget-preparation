// 財務健康診断

function renderHealthDiag(container, budget) {
  if (!budget) {
    container.innerHTML = '<div class="no-data">予算データがありません。</div>';
    return;
  }

  const metrics = calcHealthMetrics(budget.rows, 10000000);
  const items = [
    { key: 'equity_ratio',     label: '自己資本比率',       value: metrics.equity_ratio,     unit: '%',   fmt: v => v.toFixed(1) },
    { key: 'current_ratio',    label: '流動比率',           value: metrics.current_ratio,    unit: '%',   fmt: v => v.toFixed(1) },
    { key: 'quick_ratio',      label: '当座比率',           value: metrics.quick_ratio,      unit: '%',   fmt: v => v.toFixed(1) },
    { key: 'op_margin',        label: '売上高経常利益率',   value: metrics.op_margin,        unit: '%',   fmt: v => v.toFixed(1) },
    { key: 'labor_ratio',      label: '労働分配率',         value: metrics.labor_ratio,      unit: '%',   fmt: v => v.toFixed(1) },
    { key: 'ebitda',           label: 'EBITDA',             value: metrics.ebitda,           unit: '円',  fmt: v => fmt(v) },
    { key: 'loan_month_ratio', label: '借入金月商倍率',     value: metrics.loan_month_ratio, unit: 'か月', fmt: v => v.toFixed(1) },
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

  container.innerHTML = `
    <div class="sim-panel">
      <h2 class="section-title">財務健康診断</h2>
      <div class="health-overview card">
        <div class="overall-grade">
          <span class="grade-label">総合評価</span>
          <span class="grade-big" style="color:${overallColor}">${overallGrade}</span>
        </div>
        <div class="radar-wrap">
          <canvas id="health_radar" width="300" height="300"></canvas>
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
          responsive: false,
          scales: { r: { min:0, max:5, ticks: { stepSize:1 } } },
          plugins: { legend: { display: false } }
        }
      });
    }
  }
}
