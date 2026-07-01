// ===== KPI信号機ダッシュボード =====

function renderKpiBoard(container) {
  const budget  = window.App?.currentBudget;
  const company = window.App?.currentCompany;

  if (!budget) {
    container.innerHTML = '<div class="no-data">予算データがありません。まず月次予算を入力してください。</div>';
    return;
  }

  const capital  = company?.capital || 10_000_000;
  const metrics  = (budget.dynamicAccounts?.length)
    ? calcHealthMetricsDynamic(budget, capital)
    : calcHealthMetrics(budget.rows || {}, capital);

  // 売上達成率・粗利率を追加計算
  const salesAchievement = _kpiBudgetActual(budget);

  // 各指標のカード定義
  const cards = [
    {
      key: 'op_margin',
      label: '売上高経常利益率',
      value: metrics.op_margin,
      fmt: v => v == null || isNaN(v) ? '—' : v.toFixed(1) + '%',
      threshold: '目標：5%以上',
    },
    {
      key: 'labor_ratio',
      label: '労働分配率',
      value: metrics.labor_ratio,
      fmt: v => v == null || isNaN(v) ? '—' : v.toFixed(1) + '%',
      threshold: '目標：50%未満',
    },
    {
      key: 'equity_ratio',
      label: '自己資本比率',
      value: metrics.equity_ratio,
      fmt: v => v == null || isNaN(v) ? '—' : v.toFixed(1) + '%',
      threshold: '目標：30%以上',
    },
    {
      key: 'current_ratio',
      label: '流動比率',
      value: metrics.current_ratio,
      fmt: v => v == null || isNaN(v) ? '—' : v.toFixed(1) + '%',
      threshold: '目標：150%以上',
    },
    {
      key: 'quick_ratio',
      label: '当座比率',
      value: metrics.quick_ratio,
      fmt: v => v == null || isNaN(v) ? '—' : v.toFixed(1) + '%',
      threshold: '目標：75%以上',
    },
    {
      key: 'loan_month_ratio',
      label: '借入金月商倍率',
      value: metrics.loan_month_ratio,
      fmt: v => v == null || isNaN(v) ? '—' : v.toFixed(1) + 'か月',
      threshold: '目標：6か月未満',
    },
  ];

  // 売上達成率カードを追加（実績データがある場合）
  if (salesAchievement != null) {
    cards.unshift({
      key: '_sales_ach',
      label: '売上達成率',
      value: salesAchievement,
      fmt: v => v.toFixed(1) + '%',
      threshold: '目標：100%',
      gradeOverride: salesAchievement >= 100 ? 'A' : salesAchievement >= 90 ? 'B' : salesAchievement >= 80 ? 'C' : salesAchievement >= 70 ? 'D' : 'E',
    });
  }

  // グレード計算
  const gradeColor = { A:'#10b981', B:'#3b82f6', C:'#f59e0b', D:'#f97316', E:'#ef4444' };
  const gradedCards = cards.map(c => ({
    ...c,
    grade: c.gradeOverride || (c.value != null && !isNaN(c.value) ? gradeMetric(c.key, c.value) : 'C'),
  }));

  // サマリーカウント
  const greenCnt  = gradedCards.filter(c => ['A','B'].includes(c.grade)).length;
  const yellowCnt = gradedCards.filter(c => c.grade === 'C').length;
  const redCnt    = gradedCards.filter(c => ['D','E'].includes(c.grade)).length;

  // 信号機ラベル
  const signalLabel = g => {
    if (['A','B'].includes(g)) return { icon: '●', label: '良好', bg: '#d1fae5', fg: '#065f46', border: '#6ee7b7' };
    if (g === 'C')              return { icon: '●', label: '要注意', bg: '#fef3c7', fg: '#92400e', border: '#fcd34d' };
    return                             { icon: '●', label: '要改善', bg: '#fee2e2', fg: '#991b1b', border: '#fca5a5' };
  };

  // コメント（短めに）
  const shortComment = {
    equity_ratio:     { A:'安定。投資余力あり', B:'良好。内部留保を継続', C:'借入依存やや高め', D:'純資産の増強が急務', E:'債務超過リスクあり' },
    current_ratio:    { A:'短期支払能力は万全', B:'流動性は良好', C:'短期資金に余裕薄め', D:'資金繰りに注意', E:'支払不能リスク高' },
    quick_ratio:      { A:'即時換金力は十分', B:'当座資産は良好', C:'回収サイクル短縮を', D:'在庫依存が高め', E:'即時換金力が不足' },
    op_margin:        { A:'高収益体質を維持', B:'収益性は良好', C:'粗利または販管費を改善', D:'収益構造を見直し', E:'赤字改善が最優先' },
    labor_ratio:      { A:'生産性が高い状態', B:'人件費バランス良好', C:'業務効率化を検討', D:'人件費が収益を圧迫', E:'抜本的な見直しが必要' },
    loan_month_ratio: { A:'借入負担は軽微', B:'返済ペースは適正', C:'返済計画を再確認', D:'資金繰りへの影響大', E:'緊急の返済交渉を' },
    _sales_ach:       { A:'目標超過達成', B:'目標達成圏内', C:'若干の遅れあり', D:'目標との乖離大', E:'大幅な未達状態' },
  };

  // カードHTML
  const cardHtml = gradedCards.map(c => {
    const sig = signalLabel(c.grade);
    const gc  = gradeColor[c.grade];
    const cmt = (shortComment[c.key] || {})[c.grade] || '';
    const tgt = (METRIC_TARGETS[c.key] || {})[c.grade] || c.threshold || '';
    return `
      <div style="background:var(--surface-2);border:0.5px solid var(--border);border-radius:12px;border-left:4px solid ${gc};padding:1rem 1.125rem;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:12px;color:var(--text-muted);font-weight:500">${c.label}</span>
          <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:${sig.bg};color:${sig.fg};border:1px solid ${sig.border}">${sig.icon} ${sig.label}</span>
        </div>
        <div style="font-size:28px;font-weight:700;color:${gc};line-height:1;font-variant-numeric:tabular-nums">${c.fmt(c.value)}</div>
        <div style="font-size:11px;color:var(--text-muted);line-height:1.5">${cmt}</div>
        ${tgt ? `<div style="font-size:10px;color:${gc};font-weight:600;border-top:0.5px solid var(--border);padding-top:6px;margin-top:2px">→ ${tgt}</div>` : ''}
      </div>`;
  }).join('');

  // 総合判定
  const overallStatus = redCnt >= 3 ? { label: '要緊急対応', color: '#ef4444', bg: '#fee2e2' }
    : redCnt >= 1 || yellowCnt >= 3 ? { label: '改善が必要', color: '#f97316', bg: '#fff7ed' }
    : yellowCnt >= 1                 ? { label: 'おおむね良好', color: '#f59e0b', bg: '#fef3c7' }
    :                                  { label: '財務良好', color: '#10b981', bg: '#d1fae5' };

  const asOf = _kpiAsOfLabel(budget);

  container.innerHTML = `
    <div class="sim-panel">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:1rem">
        <h2 class="section-title" style="margin-bottom:0">KPI信号機ダッシュボード</h2>
        <button class="btn btn-sm btn-outline" onclick="showPage('home')" style="margin-left:auto">← ホームに戻る</button>
      </div>

      <!-- サマリーバー -->
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:10px;background:${overallStatus.bg};border:1px solid ${overallStatus.color}33;margin-bottom:1rem;flex-wrap:wrap">
        <div style="font-size:15px;font-weight:700;color:${overallStatus.color};min-width:100px">${overallStatus.label}</div>
        <div style="display:flex;gap:16px;font-size:13px;flex-wrap:wrap">
          <span style="display:flex;align-items:center;gap:5px">
            <span style="width:10px;height:10px;border-radius:50%;background:#10b981;display:inline-block"></span>
            <span style="color:var(--text)">良好 <strong>${greenCnt}</strong></span>
          </span>
          <span style="display:flex;align-items:center;gap:5px">
            <span style="width:10px;height:10px;border-radius:50%;background:#f59e0b;display:inline-block"></span>
            <span style="color:var(--text)">要注意 <strong>${yellowCnt}</strong></span>
          </span>
          <span style="display:flex;align-items:center;gap:5px">
            <span style="width:10px;height:10px;border-radius:50%;background:#ef4444;display:inline-block"></span>
            <span style="color:var(--text)">要改善 <strong>${redCnt}</strong></span>
          </span>
        </div>
        ${asOf ? `<div style="margin-left:auto;font-size:11px;color:var(--text-muted)">${asOf}時点</div>` : ''}
      </div>

      <!-- KPIカードグリッド -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-bottom:1rem">
        ${cardHtml}
      </div>

      <!-- 詳細診断へのリンク -->
      <div style="text-align:center;padding:.5rem 0">
        <button class="btn btn-outline" onclick="showPage('health')">詳細な財務健康診断を見る →</button>
      </div>
    </div>`;
}

// 実績月の売上達成率を計算
function _kpiBudgetActual(budget) {
  if (!budget) return null;
  const av = budget.dynamicAccounts?.length
    ? calcAllValuesDynamic(budget)
    : calcAllValues(budget.rows || {});
  const salesArr = av['sec_revenue'] || av['calc_sales'] || [];
  if (!salesArr.length) return null;

  // actualRowsがある場合：実績月を特定
  const actual = budget.actualRows || {};
  const actualSalesArr = actual['sec_revenue'] || actual['calc_sales'] || [];

  // 実績月数（actualRowsに値がある月）
  let actualMonths = 0, actualSalesTotal = 0, budgetSalesTotal = 0;
  for (let i = 0; i < 12; i++) {
    const bv = salesArr[i] || 0;
    const av2 = actualSalesArr[i];
    if (av2 != null && av2 !== 0) {
      actualMonths++;
      actualSalesTotal += av2;
      budgetSalesTotal += bv;
    }
  }
  if (actualMonths === 0 || budgetSalesTotal === 0) return null;
  return actualSalesTotal / budgetSalesTotal * 100;
}

// 「〇月時点」ラベル
function _kpiAsOfLabel(budget) {
  if (!budget) return '';
  const months = getMonthLabels ? getMonthLabels(budget.startMonth || 4) : null;
  const actual = budget.actualRows || {};
  // 実績が入っている最後の月を探す
  let lastActualIdx = -1;
  for (const key of Object.keys(actual)) {
    const arr = actual[key];
    if (!Array.isArray(arr)) continue;
    for (let i = 11; i >= 0; i--) {
      if (arr[i] != null && arr[i] !== 0 && i > lastActualIdx) {
        lastActualIdx = i;
        break;
      }
    }
  }
  if (lastActualIdx < 0 || !months) return '';
  return months[lastActualIdx];
}
