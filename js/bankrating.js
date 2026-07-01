// ===== 銀行格付けシミュレーター =====

function renderBankRating(container) {
  const budget = App.currentBudget;

  const style = `
<style>
.br-wrap { max-width: 900px; margin: 0 auto; padding: 24px 16px; }
.br-title { font-size: 22px; font-weight: 800; color: var(--text); margin-bottom: 4px; }
.br-sub   { font-size: 13px; color: var(--text-muted); margin-bottom: 24px; }

/* 格付けバッジ */
.br-badge-wrap { display:flex; align-items:center; gap: 20px; background: var(--surface-2); border:1px solid var(--border); border-radius:16px; padding:24px 28px; margin-bottom:24px; }
.br-badge { width:96px; height:96px; border-radius:50%; display:flex; flex-direction:column; align-items:center; justify-content:center; font-weight:900; flex-shrink:0; border:4px solid transparent; }
.br-badge .grade-num { font-size:42px; line-height:1; }
.br-badge .grade-lbl { font-size:11px; font-weight:700; letter-spacing:.05em; }
.br-badge-info { flex:1; }
.br-badge-title { font-size:18px; font-weight:800; color:var(--text); margin-bottom:4px; }
.br-badge-desc  { font-size:13px; color:var(--text-muted); line-height:1.6; }
.br-score-bar-wrap { margin-top:12px; }
.br-score-label { font-size:12px; color:var(--text-muted); margin-bottom:4px; }
.br-score-track { height:10px; background:var(--border); border-radius:99px; overflow:hidden; }
.br-score-fill  { height:100%; border-radius:99px; transition: width .5s; }

/* 指標テーブル */
.br-table-wrap { background:var(--surface-2); border:1px solid var(--border); border-radius:14px; overflow:hidden; margin-bottom:20px; }
.br-table { width:100%; border-collapse:collapse; font-size:13px; }
.br-table th { background:var(--blue-100); color:var(--primary); padding:10px 14px; text-align:left; font-weight:700; }
.br-table td { padding:10px 14px; border-top:1px solid var(--border); color:var(--text); }
.br-table tr:hover td { background:var(--surface-3); }
.grade-pill { display:inline-block; width:28px; height:28px; border-radius:50%; text-align:center; line-height:28px; font-size:12px; font-weight:800; }
.g-A { background:#d1fae5; color:#065f46; }
.g-B { background:#dbeafe; color:#1e40af; }
.g-C { background:#fef9c3; color:#854d0e; }
.g-D { background:#ffedd5; color:#9a3412; }
.g-E { background:#fee2e2; color:#991b1b; }

/* アドバイス */
.br-advice-wrap { background:var(--surface-2); border:1px solid var(--border); border-radius:14px; padding:20px; margin-bottom:20px; }
.br-advice-title { font-size:14px; font-weight:700; color:var(--text); margin-bottom:12px; display:flex; align-items:center; gap:6px; }
.br-advice-item { display:flex; align-items:flex-start; gap:10px; padding:10px 0; border-top:1px solid var(--border); font-size:13px; color:var(--text-muted); line-height:1.6; }
.br-advice-item:first-of-type { border-top:none; padding-top:0; }
.br-advice-tag { flex-shrink:0; font-size:11px; font-weight:700; padding:2px 8px; border-radius:99px; }
.tag-up   { background:#d1fae5; color:#065f46; }
.tag-warn { background:#fef9c3; color:#854d0e; }

/* 格付別色 */
.r1 { background:#1e3a8a; color:#fff; border-color:#1e3a8a; }
.r2 { background:#1d4ed8; color:#fff; border-color:#1d4ed8; }
.r3 { background:#0284c7; color:#fff; border-color:#0284c7; }
.r4 { background:#059669; color:#fff; border-color:#059669; }
.r5 { background:#65a30d; color:#fff; border-color:#65a30d; }
.r6 { background:#d97706; color:#fff; border-color:#d97706; }
.r7 { background:#dc2626; color:#fff; border-color:#dc2626; }
.r8 { background:#7f1d1d; color:#fff; border-color:#7f1d1d; }
.r1-bar { background:#1e3a8a; }
.r2-bar { background:#1d4ed8; }
.r3-bar { background:#0284c7; }
.r4-bar { background:#059669; }
.r5-bar { background:#65a30d; }
.r6-bar { background:#d97706; }
.r7-bar { background:#dc2626; }
.r8-bar { background:#7f1d1d; }

.br-nodata { text-align:center; padding:60px 20px; color:var(--text-muted); font-size:14px; }
</style>`;

  if (!budget) {
    container.innerHTML = style + `<div class="br-wrap"><div class="br-nodata">📊 推移表をアップロードしてからご利用ください</div></div>`;
    return;
  }

  // 財務指標を取得
  const m = calcHealthMetricsDynamic(budget, 0);

  // 5指標スコア (各0〜4点)
  const METRICS = [
    {
      key: 'equity_ratio',
      label: '自己資本比率',
      unit: '%',
      thresholds: [30, 20, 10, 0],   // >= でA,B,C,D, else E
      inverted: false,
      desc: '自己資本 ÷ 総資産',
      advice: {
        D: '内部留保の積み上げと増資を検討してください。',
        E: '債務超過リスクがあります。資本増強が急務です。',
      },
    },
    {
      key: 'loan_month_ratio',
      label: '有利子負債月商倍率',
      unit: '倍',
      thresholds: [6, 10, 15, 24],   // <= でA,B,C,D, else E
      inverted: true,
      desc: '有利子負債 ÷ 月商',
      advice: {
        D: '借入金の圧縮計画を策定し、返済を加速させることを検討してください。',
        E: '返済能力を超えた借入水準です。金融機関との早期協議を推奨します。',
      },
    },
    {
      key: 'current_ratio',
      label: '流動比率',
      unit: '%',
      thresholds: [150, 120, 100, 80],
      inverted: false,
      desc: '流動資産 ÷ 流動負債',
      advice: {
        D: '短期の資金繰りが逼迫しています。運転資金の確保を急いでください。',
        E: '流動負債が流動資産を上回っており、支払い能力に懸念があります。',
      },
    },
    {
      key: 'op_margin',
      label: '売上高経常利益率',
      unit: '%',
      thresholds: [5, 3, 1, 0],
      inverted: false,
      desc: '経常利益 ÷ 売上高',
      advice: {
        D: '収益力が低下しています。コスト構造の見直しと価格政策の改善を検討してください。',
        E: '赤字状態です。早急な収益改善策が必要です。',
      },
    },
    {
      key: 'ebitda',
      label: 'EBITDA',
      unit: '万円',
      thresholds: null, // EBITDAは絶対額なのでポジティブかどうかで判定
      inverted: false,
      desc: '営業利益 + 減価償却費',
      advice: {
        D: 'EBITDAが低水準です。収益力と生産性の向上が課題です。',
        E: 'EBITDAがマイナスです。事業の抜本的な見直しが必要です。',
      },
    },
  ];

  // 各指標をスコア化 (A=4, B=3, C=2, D=1, E=0)
  function scoreMetric(metric, value) {
    if (metric.key === 'ebitda') {
      // EBITDAは単純に正負と規模で判定（売上比で代替）
      const sales = m._detail?.op_margin?.den || 1;
      const ratio = sales > 0 ? (value / sales * 100) : 0;
      if (ratio >= 10) return { grade: 'A', score: 4 };
      if (ratio >= 5)  return { grade: 'B', score: 3 };
      if (ratio >= 2)  return { grade: 'C', score: 2 };
      if (ratio >= 0)  return { grade: 'D', score: 1 };
      return { grade: 'E', score: 0 };
    }
    const t = metric.thresholds;
    let grade;
    if (metric.inverted) {
      grade = value <= t[0] ? 'A' : value <= t[1] ? 'B' : value <= t[2] ? 'C' : value <= t[3] ? 'D' : 'E';
    } else {
      grade = value >= t[0] ? 'A' : value >= t[1] ? 'B' : value >= t[2] ? 'C' : value >= t[3] ? 'D' : 'E';
    }
    return { grade, score: { A: 4, B: 3, C: 2, D: 1, E: 0 }[grade] };
  }

  const results = METRICS.map(metric => {
    const rawVal = m[metric.key] ?? 0;
    const { grade, score } = scoreMetric(metric, rawVal);
    return { ...metric, value: rawVal, grade, score };
  });

  const totalScore = results.reduce((s, r) => s + r.score, 0);
  const maxScore = METRICS.length * 4; // 20

  // 格付け変換 (スコア20→1, 0→8)
  function scoreToRating(score) {
    if (score >= 18) return 1;
    if (score >= 15) return 2;
    if (score >= 12) return 3;
    if (score >= 9)  return 4;
    if (score >= 7)  return 5;
    if (score >= 5)  return 6;
    if (score >= 3)  return 7;
    return 8;
  }

  const rating = scoreToRating(totalScore);
  const pct = Math.round(totalScore / maxScore * 100);

  const RATING_INFO = {
    1: { label: '最優良', desc: '財務基盤が極めて強固です。銀行からの最優遇金利での融資が期待できます。', cls: 'r1' },
    2: { label: '優良',   desc: '財務健全性が高く、有利な条件での資金調達が可能です。',                cls: 'r2' },
    3: { label: '良好',   desc: '財務状態は良好で、通常条件での融資が受けやすい状態です。',           cls: 'r3' },
    4: { label: '標準',   desc: '平均的な財務水準です。改善余地がありますが融資は問題なく受けられます。', cls: 'r4' },
    5: { label: 'やや注意', desc: '一部の指標に課題があります。改善策を講じることで格付向上が見込めます。', cls: 'r5' },
    6: { label: '要注意', desc: '複数の指標に課題があり、融資条件が厳しくなる可能性があります。',      cls: 'r6' },
    7: { label: '警戒',   desc: '財務状態に重大な懸念があります。早急な改善計画の策定が必要です。',    cls: 'r7' },
    8: { label: '危険',   desc: '財務状態が危機的水準です。事業再生の検討が必要な可能性があります。',  cls: 'r8' },
  };

  const ri = RATING_INFO[rating];

  // 改善アドバイス
  const weakItems = results
    .filter(r => r.score <= 1)
    .sort((a, b) => a.score - b.score);

  const adviceHtml = weakItems.length === 0
    ? '<div class="br-advice-item">すべての指標が良好です。現在の財務水準を維持し、さらなる成長に向けた投資を検討してください。</div>'
    : weakItems.map(r => {
        const msg = (r.advice && (r.advice[r.grade] || r.advice.D)) || `${r.label}の改善が格付向上に繋がります。`;
        const tagCls = r.score === 0 ? 'tag-warn' : 'tag-up';
        return `<div class="br-advice-item">
          <span class="br-advice-tag ${tagCls}">${r.label}</span>
          <span>${msg}</span>
        </div>`;
      }).join('');

  const fmt = (v, unit) => {
    if (unit === '万円') return Math.round(v / 10000).toLocaleString() + ' 万円';
    if (unit === '%') return v.toFixed(1) + '%';
    return v.toFixed(1) + unit;
  };

  const tableRows = results.map(r => `
    <tr>
      <td style="font-weight:600">${r.label}</td>
      <td style="color:var(--text-muted); font-size:12px">${r.desc}</td>
      <td style="font-variant-numeric:tabular-nums; font-weight:700">${fmt(r.value, r.unit)}</td>
      <td><span class="grade-pill g-${r.grade}">${r.grade}</span></td>
    </tr>
  `).join('');

  container.innerHTML = style + `
<div class="br-wrap">
  <div class="br-title">🏦 銀行格付けシミュレーター</div>
  <div class="br-sub">財務指標から銀行内部格付け（1〜8）を推定します。実際の格付けとは異なる場合があります。</div>

  <div class="br-badge-wrap">
    <div class="br-badge ${ri.cls}">
      <div class="grade-num">${rating}</div>
      <div class="grade-lbl">格付け</div>
    </div>
    <div class="br-badge-info">
      <div class="br-badge-title">格付け ${rating}（${ri.label}）</div>
      <div class="br-badge-desc">${ri.desc}</div>
      <div class="br-score-bar-wrap">
        <div class="br-score-label">スコア ${totalScore} / ${maxScore}点（${pct}%）</div>
        <div class="br-score-track">
          <div class="br-score-fill r${rating}-bar" style="width:${pct}%"></div>
        </div>
      </div>
    </div>
  </div>

  <div class="br-table-wrap">
    <table class="br-table">
      <thead>
        <tr>
          <th>指標</th>
          <th>計算式</th>
          <th>実績値</th>
          <th>評価</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  <div class="br-advice-wrap">
    <div class="br-advice-title">💡 格付改善アドバイス</div>
    ${adviceHtml}
  </div>
</div>`;
}
