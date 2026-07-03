// ===== 損益分岐点分析 =====

function _bepCalc(plData) {
  if (!plData) return null;
  const sales    = plData.sales    || 0;
  const varCost  = plData.varTotal || 0;  // 変動費（売上原価）
  const marginal = plData.marginal || (sales - varCost);
  const fixed    = plData.fixedTotal || (plData.sga || 0);
  const ord      = plData.ord      || 0;
  const margRate = sales > 0 ? marginal / sales : 0;
  const bep      = margRate > 0 ? fixed / margRate : null;
  const safety   = (bep != null && sales > 0) ? (sales - bep) / sales * 100 : null;
  return { sales, varCost, marginal, margRate, fixed, ord, bep, safety };
}

function _bepSummarizeBudgetOnly(budget) {
  if (!budget || !budget.dynamicAccounts || !budget.dynamicAccounts.length) return null;
  // 予算のみ（actualRowsを使わない）
  const av    = calcAllValuesDynamic(budget);
  const accts = budget.dynamicAccounts;
  const sum13 = id => (av[id] || []).slice(0, 13).reduce((s, v) => s + (v || 0), 0);
  const sgaSec     = _sbsFindSec(accts, 'sec_sga',        /販売費|一般管理費/);
  const nonOpIncSec = _sbsFindSec(accts, 'sec_non_op_inc', /営業外収益/);
  const nonOpExpSec = _sbsFindSec(accts, 'sec_non_op_exp', /営業外費用/);
  const sales    = sum13('sec_revenue');
  const cogs     = sum13('sec_cogs');
  const sga      = sum13('sec_sga')        ?? (sgaSec     ? sum13(sgaSec.id)     : 0);
  const nonOpInc = sum13('sec_non_op_inc') ?? (nonOpIncSec ? sum13(nonOpIncSec.id) : 0);
  const nonOpExp = sum13('sec_non_op_exp') ?? (nonOpExpSec ? sum13(nonOpExpSec.id) : 0);
  const ord      = sum13('calc_ord');
  return {
    sales, varTotal: cogs, marginal: sales - cogs,
    fixedTotal: sga + nonOpExp - nonOpInc,
    ord,
  };
}

function renderBEPAnalysis(container) {
  const company  = window.App?.currentCompany;
  const budget   = window.App?.currentBudget;
  const curYear  = window.App?.currentYear || new Date().getFullYear();
  if (!company || !budget) {
    container.innerHTML = '<div class="no-data">会社と年度を選択してください</div>';
    return;
  }

  const fiscalMonth = company.fiscalMonth || 3;
  const prevBudget  = getBudget(company.id, curYear - 1);

  const curPL   = summarizePL(budget);
  const prevPL  = prevBudget ? summarizePL(prevBudget) : null;
  const budPL   = _bepSummarizeBudgetOnly(budget);

  const cur  = _bepCalc(curPL);
  const prev = _bepCalc(prevPL);
  const bud  = _bepCalc(budPL);

  if (!cur) {
    container.innerHTML = '<div class="no-data">PLデータがありません。推移表をインポートしてください。</div>';
    return;
  }

  // 表示年度ラベル
  const rYear = y => `${y}年${fiscalMonth}月期`;
  const curLabel  = rYear(curYear);
  const prevLabel = rYear(curYear - 1);

  // フォーマット
  const K    = v => v == null ? '—' : Math.round(v / 1000).toLocaleString('ja-JP');
  const pct  = v => (v == null || isNaN(v)) ? '—' : v.toFixed(1) + '%';
  const yoy  = (c, p) => (p == null || p === 0) ? '—' : (c / p * 100).toFixed(1) + '%';
  const budR = (c, b) => (b == null || b === 0) ? '—' : (c / b * 100).toFixed(1) + '%';

  // テーブル行
  const row = (label, cV, cP, pV, pP, yoyV, bV, brV, opts = {}) => {
    const bold = opts.bold ? 'font-weight:700' : '';
    const bg   = opts.total ? 'background:var(--blue-50)' : opts.sub ? 'background:var(--surface-2)' : '';
    const neg  = v => (typeof v === 'number' && v < 0) ? 'color:#dc2626' : '';
    return `<tr style="${bg}">
      <td class="bep-label" style="${bold}">${label}</td>
      <td class="bep-num" style="${bold};${neg(cV)}">${K(cV)}</td>
      <td class="bep-pct">${cP}</td>
      <td class="bep-num" style="${neg(pV)}">${K(pV)}</td>
      <td class="bep-pct">${pP}</td>
      <td class="bep-num">${yoyV}</td>
      <td class="bep-num" style="${neg(bV)}">${K(bV)}</td>
      <td class="bep-num">${brV}</td>
    </tr>`;
  };

  const cMR = cur.sales > 0 ? pct(cur.marginal / cur.sales * 100) : '—';
  const pMR = (prev && prev.sales > 0) ? pct(prev.marginal / prev.sales * 100) : '—';
  const bMR = (bud  && bud.sales  > 0) ? pct(bud.marginal  / bud.sales  * 100) : '—';

  const table = `
  <table class="bep-table">
    <thead>
      <tr>
        <th class="bep-label">項　目</th>
        <th colspan="2" class="bep-head">${curLabel}<br><span style="font-weight:400;font-size:10px">当期実績</span></th>
        <th colspan="2" class="bep-head">${prevLabel}<br><span style="font-weight:400;font-size:10px">前年同期</span></th>
        <th class="bep-head">前年比</th>
        <th class="bep-head">予　算</th>
        <th class="bep-head">予算比</th>
      </tr>
      <tr style="font-size:10px;background:var(--surface-2)">
        <th></th>
        <th class="bep-num">金額(千円)</th><th class="bep-pct">構成比</th>
        <th class="bep-num">金額(千円)</th><th class="bep-pct">構成比</th>
        <th></th><th class="bep-num">金額(千円)</th><th></th>
      </tr>
    </thead>
    <tbody>
      ${row('売 上 高',
        cur.sales, '100.0%',
        prev?.sales, '100.0%',
        yoy(cur.sales, prev?.sales),
        bud?.sales, budR(cur.sales, bud?.sales),
        {bold:true, total:true})}
      ${row('変 動 費',
        cur.varCost,  pct(cur.sales>0 ? cur.varCost/cur.sales*100 : 0),
        prev?.varCost, pct(prev&&prev.sales>0 ? prev.varCost/prev.sales*100 : 0),
        yoy(cur.varCost, prev?.varCost),
        bud?.varCost, budR(cur.varCost, bud?.varCost))}
      ${row('限 界 利 益',
        cur.marginal, cMR,
        prev?.marginal, pMR,
        yoy(cur.marginal, prev?.marginal),
        bud?.marginal, budR(cur.marginal, bud?.marginal),
        {bold:true, sub:true})}
      ${row('固 定 費',
        cur.fixed, pct(cur.sales>0 ? cur.fixed/cur.sales*100 : 0),
        prev?.fixed, pct(prev&&prev.sales>0 ? prev.fixed/prev.sales*100 : 0),
        yoy(cur.fixed, prev?.fixed),
        bud?.fixed, budR(cur.fixed, bud?.fixed))}
      ${row('経 常 利 益',
        cur.ord, pct(cur.sales>0 ? cur.ord/cur.sales*100 : 0),
        prev?.ord, pct(prev&&prev.sales>0 ? prev.ord/prev.sales*100 : 0),
        yoy(cur.ord, prev?.ord),
        bud?.ord, budR(cur.ord, bud?.ord),
        {bold:true, total:true})}
      ${row('損益分岐点売上高',
        cur.bep, '—',
        prev?.bep, '—',
        yoy(cur.bep, prev?.bep),
        bud?.bep, '—',
        {bold:true})}
      <tr>
        <td class="bep-label" style="font-weight:700">経 営 安 全 率</td>
        <td class="bep-num" style="font-weight:700;${cur.safety<0?'color:#dc2626':''}">${pct(cur.safety)}</td>
        <td class="bep-pct">—</td>
        <td class="bep-num">${pct(prev?.safety)}</td>
        <td class="bep-pct">—</td>
        <td class="bep-num">—</td>
        <td class="bep-num">${pct(bud?.safety)}</td>
        <td class="bep-num">—</td>
      </tr>
    </tbody>
  </table>`;

  // ===== SVGチャート =====
  const chart = _bepDrawChart(cur, prev, bud, curLabel, prevLabel, fiscalMonth);

  container.innerHTML = `
  <div class="bizanalysis-wrap">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px">
      <div>
        <div style="font-size:20px;font-weight:800;color:var(--text)">📉 損益分岐点分析図表</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${escHtml(company.name)} ／ ${curYear}年${fiscalMonth}月期</div>
      </div>
      <button class="btn btn-sm btn-outline" onclick="window.print()">🖨 印刷</button>
    </div>
    <div class="card" style="padding:16px;margin-bottom:12px;overflow-x:auto">${chart}</div>
    <div class="card" style="padding:0;overflow-x:auto">${table}</div>
    <div class="wf-note">単位：千円。変動費＝売上原価。固定費＝販管費＋営業外費用－営業外収益。経営安全率＝（売上高－損益分岐点売上高）÷売上高×100。</div>
  </div>

  <style>
    .bep-table { font-size:12px; border-collapse:collapse; width:100%; min-width:700px }
    .bep-table th, .bep-table td { border:1px solid var(--border,#e2e8f0); padding:5px 8px; color:var(--text) }
    .bep-label { text-align:left; white-space:nowrap; min-width:120px }
    .bep-num   { text-align:right; font-variant-numeric:tabular-nums }
    .bep-pct   { text-align:right; color:var(--text-muted); font-size:11px; width:52px }
    .bep-head  { text-align:center; background:var(--blue-100); color:var(--primary); font-size:12px }
    @media print {
      aside, .main-header, button { display:none !important }
      .bizanalysis-wrap { padding:0 }
    }
  </style>`;
}

function _bepDrawChart(cur, prev, bud, curLabel, prevLabel, fiscalMonth) {
  const W = 680, H = 360;
  const pad = { l: 70, r: 20, t: 40, b: 50 };
  const cw = W - pad.l - pad.r;
  const ch = H - pad.t - pad.b;

  // スケール
  const maxSales = (Math.max(cur.sales, prev?.sales || 0, bud?.sales || 0, cur.bep || 0, cur.fixed || 0) * 1.15) || 1;
  const xS = v => pad.l + (v / maxSales) * cw;
  const yS = v => pad.t + ch - (v / maxSales) * ch;

  // 各期の変動費率（総費用線の傾き）
  const varRate = (d) => d && d.sales > 0 ? d.varCost / d.sales : 0;

  // 期ごとに色を割り当て
  const periods = [
    { d: cur,  label: curLabel,    color: '#1e40af', dash: '' },
    { d: prev, label: prevLabel,   color: '#0891b2', dash: '6,3' },
    { d: bud,  label: '当期予算',  color: '#7c3aed', dash: '3,3' },
  ].filter(p => p.d != null);

  // グリッド・軸
  const tickCount = 6;
  let gridLines = '', xLabels = '', yLabels = '';
  for (let i = 0; i <= tickCount; i++) {
    const v = (maxSales / tickCount) * i;
    const x = xS(v);
    const y = yS(v);
    gridLines += `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>`;
    yLabels   += `<text x="${pad.l - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#64748b">${Math.round(v/1000).toLocaleString()}</text>`;
    gridLines += `<line x1="${x}" y1="${pad.t}" x2="${x}" y2="${pad.t + ch}" stroke="#e2e8f0" stroke-width="1"/>`;
    xLabels   += `<text x="${x}" y="${pad.t + ch + 16}" text-anchor="middle" font-size="10" fill="#64748b">${Math.round(v/1000).toLocaleString()}</text>`;
  }

  // 売上高線（45°: y=x）
  const revLine = `<line x1="${xS(0)}" y1="${yS(0)}" x2="${xS(maxSales)}" y2="${yS(maxSales)}"
    stroke="#1e293b" stroke-width="1.5" stroke-dasharray="4,2"/>`;

  // 固定費線・総費用線（最初の期の値を使用）
  const fixedY = yS(cur.fixed);
  const fixedLine = `<line x1="${pad.l}" y1="${fixedY}" x2="${W - pad.r}" y2="${fixedY}"
    stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="6,3"/>`;

  // 総費用線: y = 固定費 + 変動費率 × x
  const vr = varRate(cur);
  const tcY0 = yS(cur.fixed);
  const tcY1 = yS(cur.fixed + vr * maxSales);
  const totalCostLine = `<line x1="${pad.l}" y1="${tcY0}" x2="${W - pad.r}" y2="${tcY1}"
    stroke="#e11d48" stroke-width="1.5"/>`;

  // 各期の垂直線とBEPマーカー
  let verticals = '', bepMarkers = '', salesMarkers = '';
  periods.forEach((p, i) => {
    const { d, color, dash, label } = p;
    if (!d.sales) return;
    const sx = xS(d.sales);
    const sy = yS(d.sales);
    // 垂直線（売上高まで）
    verticals += `<line x1="${sx}" y1="${pad.t + ch}" x2="${sx}" y2="${sy}"
      stroke="${color}" stroke-width="1.5" stroke-dasharray="${dash || ''}"/>`;
    // 売上高マーカー
    salesMarkers += `<circle cx="${sx}" cy="${sy}" r="4" fill="${color}"/>`;
    salesMarkers += `<text x="${sx}" y="${sy - 8}" text-anchor="middle" font-size="10" fill="${color}" font-weight="700">${Math.round(d.sales/1000).toLocaleString()}</text>`;
    // BEP点（売上高線と総費用線の交点）
    if (d.bep != null) {
      const bx = xS(d.bep);
      const by = yS(d.bep);
      bepMarkers += `<circle cx="${bx}" cy="${by}" r="4" fill="none" stroke="${color}" stroke-width="2"/>`;
      bepMarkers += `<text x="${bx}" y="${by + 16}" text-anchor="middle" font-size="9" fill="${color}">${Math.round(d.bep/1000).toLocaleString()}</text>`;
    }
  });

  // 凡例
  const legend = [
    { label: '売上高（45°線）', color: '#1e293b', dash: '4,2', type: 'line' },
    { label: '固定費',          color: '#94a3b8', dash: '6,3', type: 'line' },
    { label: '総費用',          color: '#e11d48', dash: '',    type: 'line' },
    ...periods.map(p => ({ label: p.label + ' 売上高', color: p.color, dash: '', type: 'dot' })),
  ];
  const legendSvg = legend.map((l, i) => {
    const lx = 10 + i * 140;
    const ly = H - 12;
    if (l.type === 'line') {
      return `<line x1="${lx}" y1="${ly}" x2="${lx+20}" y2="${ly}" stroke="${l.color}" stroke-width="2" stroke-dasharray="${l.dash}"/>
              <text x="${lx+24}" y="${ly+4}" font-size="10" fill="#374151">${l.label}</text>`;
    } else {
      return `<circle cx="${lx+10}" cy="${ly}" r="4" fill="${l.color}"/>
              <text x="${lx+18}" y="${ly+4}" font-size="10" fill="${l.color}">${l.label}</text>`;
    }
  }).join('');

  return `
  <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block;margin:0 auto"
       xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">
    <!-- 背景 -->
    <rect width="${W}" height="${H}" fill="white"/>
    <!-- グリッド -->
    ${gridLines}
    <!-- 軸ラベル -->
    ${yLabels}
    ${xLabels}
    <text x="${pad.l - 50}" y="${pad.t + ch/2}" text-anchor="middle" font-size="10" fill="#64748b"
      transform="rotate(-90,${pad.l-50},${pad.t+ch/2})">売上高・費用（千円）</text>
    <text x="${pad.l + cw/2}" y="${H - 4}" text-anchor="middle" font-size="10" fill="#64748b">売上高（千円）</text>
    <!-- ライン -->
    ${revLine}
    ${fixedLine}
    ${totalCostLine}
    <!-- 各期マーカー -->
    ${verticals}
    ${salesMarkers}
    ${bepMarkers}
    <!-- 凡例 -->
    ${legendSvg}
    <!-- 軸 -->
    <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t+ch}" stroke="#334155" stroke-width="1.5"/>
    <line x1="${pad.l}" y1="${pad.t+ch}" x2="${W-pad.r}" y2="${pad.t+ch}" stroke="#334155" stroke-width="1.5"/>
  </svg>`;
}
