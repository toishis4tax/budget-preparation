// ===== 月次レポート（印刷/PDF出力） =====

function renderMonthlyReport(container) {
  const company = window.App?.currentCompany;
  const budget  = window.App?.currentBudget;
  const curYear = window.App?.currentYear || new Date().getFullYear();

  if (!company || !budget) {
    container.innerHTML = '<div class="no-data">会社と年度を選択してください</div>';
    return;
  }

  const startMonth  = budget.startMonth || 4;
  const fiscalMonth = company.fiscalMonth || 3;
  const actualCols  = budget.actualCols || [];
  const actIdxs     = actualCols.map((v, i) => v ? i : -1).filter(i => i >= 0);
  const calM        = i => ((startMonth - 1 + i) % 12) + 1;
  const calMLabel   = i => `${calM(i)}月`;

  // デフォルト: 最新実績月（なければ最初の月）
  const defaultIdx  = actIdxs.length > 0 ? actIdxs[actIdxs.length - 1] : 0;

  const av = budget.dynamicAccounts
    ? calcAllValuesDynamic(budget)
    : calcAllValues(budget.rows);

  // 予算専用（実績マージを無効化）。実績月でも「予算」列に予算値を表示するため
  const avBudget = budget.dynamicAccounts
    ? calcAllValuesDynamic({ ...budget, actualRows: {}, actualCols: new Array(12).fill(false), actualThrough: -1 })
    : av;

  const getArr = (...keys) => {
    for (const k of keys) { const a = av[k]; if (a?.some(v => v !== 0)) return a; }
    return new Array(13).fill(0);
  };

  // 選択中の月インデックスを状態として保持
  if (typeof container._reportMonth === 'undefined') {
    container._reportMonth = defaultIdx;
  }
  const selIdx = container._reportMonth;

  _renderReport(container, { company, budget, curYear, startMonth, fiscalMonth, actIdxs, calM, calMLabel, av, avBudget, getArr, selIdx });
}

function _renderReport(container, ctx) {
  const { company, budget, curYear, startMonth, fiscalMonth, actIdxs, calM, calMLabel, av, avBudget, getArr, selIdx } = ctx;

  // 予算専用の配列取得（実績マージなし）
  const getArrB = (...keys) => {
    for (const k of keys) { const a = avBudget[k]; if (a?.some(v => v !== 0)) return a; }
    return new Array(13).fill(0);
  };

  const fmt  = v => Math.round(v || 0).toLocaleString();
  const fmtS = v => (v >= 0 ? '' : '▼') + Math.abs(Math.round(v || 0)).toLocaleString();

  // PL科目（ダイナミック/固定）
  const isD = !!budget.dynamicAccounts?.length;
  const plRows = _buildPLRows(budget, av, isD);

  // 当月・累計の予算・実績
  const monthBudget = id => {
    const arr = getArrB(id, id.replace(/^calc_/, ''));
    return arr[selIdx] || 0;
  };
  const monthActual = id => {
    if (!actIdxs.includes(selIdx)) return null;
    const arr = getArr(id, id.replace(/^calc_/, ''));
    return arr[selIdx] || 0;
  };

  // 累計（期首〜selIdx）
  const cumIdxs = Array.from({ length: selIdx + 1 }, (_, i) => i);
  const cumBudget = id => {
    const arr = getArrB(id, id.replace(/^calc_/, ''));
    return cumIdxs.reduce((s, i) => s + (arr[i] || 0), 0);
  };
  const cumActual = id => {
    const actInCum = cumIdxs.filter(i => actIdxs.includes(i));
    if (actInCum.length === 0) return null;
    const arr = getArr(id, id.replace(/^calc_/, ''));
    return actInCum.reduce((s, i) => s + (arr[i] || 0), 0);
  };

  // KPI値
  const salesId  = isD ? 'sec_revenue' : 'sales';
  const opId     = isD ? 'calc_op'     : 'operating_profit';
  const ordId    = isD ? 'calc_ord'    : 'ordinary_profit';

  const CASH_RE  = /現金|預金|現預金/;
  let cashId = 'cash';
  if (isD && budget.dynamicAccounts) {
    const cashAcc = budget.dynamicAccounts.find(a =>
      a.section === 'bs_asset' && a.type !== 'section' && CASH_RE.test((a.name || '').replace(/\s/g, ''))
    );
    if (cashAcc) cashId = cashAcc.id;
  }

  const kpi = {
    salesB: monthBudget(salesId), salesA: monthActual(salesId),
    opB:    monthBudget(opId),    opA:    monthActual(opId),
    ordB:   monthBudget(ordId),   ordA:   monthActual(ordId),
    cashA:  actIdxs.includes(selIdx) ? (av[cashId]?.[selIdx] ?? null) : null,
    salesCumB: cumBudget(salesId), salesCumA: cumActual(salesId),
    ordCumB:   cumBudget(ordId),   ordCumA:   cumActual(ordId),
  };

  const today = new Date();
  const todayStr = `${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日`;
  const reportMonth = calMLabel(selIdx);
  const hasAct = actIdxs.includes(selIdx);

  // 月選択オプション
  const monthOpts = Array.from({ length: 12 }, (_, i) => {
    const hasA = actIdxs.includes(i);
    return `<option value="${i}" ${i === selIdx ? 'selected' : ''}>${calMLabel(i)}${hasA ? '（実績あり）' : ''}</option>`;
  }).join('');

  container.innerHTML = `
    <!-- ツールバー（印刷時非表示） -->
    <div class="rpt-toolbar no-print">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <label style="font-size:13px;font-weight:600;color:var(--text)">対象月：</label>
        <select id="rpt-month-sel" class="header-select" style="min-width:160px">
          ${monthOpts}
        </select>
        <span style="font-size:12px;color:var(--text-muted)">${hasAct ? '実績データあり' : '予算データのみ（実績未入力）'}</span>
      </div>
      <button class="btn-solid" onclick="window.print()" style="display:flex;align-items:center;gap:6px">
        🖨️ PDF出力 / 印刷
      </button>
    </div>

    <!-- 印刷本体 -->
    <div class="rpt-doc" id="rpt-doc">

      <!-- レポートヘッダー -->
      <div class="rpt-header">
        <div class="rpt-header-left">
          <div class="rpt-company">${escHtml(company.name)}</div>
          <div class="rpt-subtitle">${curYear}年度　${reportMonth}次　月次業績報告書</div>
        </div>
        <div class="rpt-header-right">
          <div class="rpt-meta">作成日：${todayStr}</div>
          <div class="rpt-meta">決算月：${fiscalMonth}月</div>
        </div>
      </div>
      <hr class="rpt-rule">

      ${typeof shVerdictPerf === 'function' ? verdictBarHTML(shVerdictPerf(company, budget)) : ''}
      ${typeof shBoxPLForBudget === 'function' ? shBoxPLForBudget(budget) : ''}

      <!-- KPIサマリー -->
      <div class="rpt-kpi-title">当月サマリー（${reportMonth}）</div>
      <div class="rpt-kpi-grid">
        ${_kpiCard('売上高', kpi.salesB, kpi.salesA, false)}
        ${_kpiCard('営業利益', kpi.opB, kpi.opA, true)}
        ${_kpiCard('経常利益', kpi.ordB, kpi.ordA, true)}
        ${_kpiCard('現金残高', null, kpi.cashA, false, true)}
      </div>

      <!-- 累計KPI -->
      <div class="rpt-kpi-title" style="margin-top:16px">期首〜${reportMonth}累計</div>
      <div class="rpt-kpi-grid">
        ${_kpiCard('累計売上高', kpi.salesCumB, kpi.salesCumA, false)}
        ${_kpiCard('累計経常利益', kpi.ordCumB, kpi.ordCumA, true)}
        ${_kpiCard('売上進捗率', null, kpi.salesCumA != null && kpi.salesCumB > 0 ? (kpi.salesCumA / kpi.salesCumB * 100) : null, false, false, '%')}
        ${_kpiCard('経常利益率', null, kpi.ordCumA != null && kpi.salesCumA > 0 ? (kpi.ordCumA / kpi.salesCumA * 100) : null, true, false, '%')}
      </div>

      <!-- PL比較表 -->
      <div class="rpt-section-title" style="margin-top:20px">損益計算書（予実対比）</div>
      <div class="rpt-table-wrap">
        <table class="rpt-table">
          <thead>
            <tr>
              <th rowspan="2" style="min-width:160px">科目</th>
              <th colspan="3" style="background:#1e40af;color:#fff;text-align:center">当月（${reportMonth}）</th>
              <th colspan="3" style="background:#0f4c75;color:#fff;text-align:center">期首〜${reportMonth}累計</th>
            </tr>
            <tr>
              <th style="text-align:right">予算</th>
              <th style="text-align:right">実績</th>
              <th style="text-align:right">差異</th>
              <th style="text-align:right">予算</th>
              <th style="text-align:right">実績</th>
              <th style="text-align:right">差異</th>
            </tr>
          </thead>
          <tbody>
            ${plRows.map(row => {
              if (row.sep) return `<tr class="rpt-sep-row"><td colspan="7">${escHtml(row.name)}</td></tr>`;
              const mB  = monthBudget(row.id);
              const mA  = monthActual(row.id);
              const mD  = mA != null ? mA - mB : null;
              const cB  = cumBudget(row.id);
              const cA  = cumActual(row.id);
              const cD  = cA != null ? cA - cB : null;
              const cls = row.bold ? 'rpt-bold-row' : (row.indent ? `rpt-indent-${row.indent}` : '');
              const diffCls = d => d == null ? '' : (d >= 0 ? 'rpt-pos' : 'rpt-neg');
              return `<tr class="${cls}">
                <td class="rpt-name" style="padding-left:${(row.indent||0)*12+8}px">${escHtml(row.name)}</td>
                <td class="rpt-num">${fmt(mB)}</td>
                <td class="rpt-num">${mA != null ? fmt(mA) : '—'}</td>
                <td class="rpt-num ${diffCls(mD)}">${mD != null ? fmtS(mD) : '—'}</td>
                <td class="rpt-num">${fmt(cB)}</td>
                <td class="rpt-num">${cA != null ? fmt(cA) : '—'}</td>
                <td class="rpt-num ${diffCls(cD)}">${cD != null ? fmtS(cD) : '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="rpt-footer print-only">
        <span>${curYear}年度　${reportMonth}次 月次業績報告書　／　${escHtml(company.name)}</span>
        <span>作成日：${todayStr}</span>
      </div>
    </div>
  `;

  // 月変更イベント
  document.getElementById('rpt-month-sel')?.addEventListener('change', e => {
    container._reportMonth = parseInt(e.target.value);
    renderMonthlyReport(container);
  });
}

function _kpiCard(label, budgetV, actualV, signed, cashMode = false, unit = '') {
  const fmt = v => {
    if (v == null) return '—';
    if (unit === '%') return v.toFixed(1) + '%';
    return Math.round(v).toLocaleString() + '円';
  };
  const diff = budgetV != null && actualV != null ? actualV - budgetV : null;
  const diffColor = diff == null ? '' : (signed ? (diff >= 0 ? '#059669' : '#e11d48') : (Math.abs(diff) < 1 ? '#888' : '#0369a1'));
  const diffStr = diff == null ? '' : ((diff >= 0 ? '+' : '▼') + (unit === '%' ? Math.abs(diff).toFixed(1) + '%' : Math.abs(Math.round(diff)).toLocaleString() + '円'));

  return `<div class="rpt-kpi-card">
    <div class="rpt-kpi-label">${label}</div>
    ${budgetV != null ? `<div class="rpt-kpi-budget">予算　${fmt(budgetV)}</div>` : ''}
    <div class="rpt-kpi-actual ${actualV == null ? 'rpt-kpi-na' : ''}">${fmt(actualV)}</div>
    ${diff != null ? `<div class="rpt-kpi-diff" style="color:${diffColor}">${diffStr}</div>` : ''}
  </div>`;
}

function _buildPLRows(budget, av, isD) {
  if (isD && budget.dynamicAccounts) {
    const plAccs = budget.dynamicAccounts.filter(a => a.section === 'pl' || a.section == null);
    return plAccs.map(a => {
      if (a.type === 'separator') return { sep: true, name: a.name || '' };
      const hasData = av[a.id]?.some(v => v !== 0);
      return {
        id:     a.id,
        name:   a.name || '',
        indent: a.indent || 0,
        bold:   a.type === 'section' || a.type === 'calculated',
        _hasData: hasData,
      };
    }).filter(r => r.sep || r.bold || r._hasData);
  }

  // 固定科目フォールバック
  const FIXED_PL = [
    { id: 'sales',              name: '売上高',         bold: true },
    { id: 'cogs',               name: '売上原価',        indent: 1 },
    { id: 'gross_profit',       name: '売上総利益',       bold: true },
    { id: 'sga',                name: '販売費及び一般管理費', indent: 1 },
    { id: 'operating_profit',   name: '営業利益',         bold: true },
    { id: 'non_op_inc',         name: '営業外収益',        indent: 1 },
    { id: 'non_op_exp',         name: '営業外費用',        indent: 1 },
    { id: 'ordinary_profit',    name: '経常利益',          bold: true },
    { id: 'extra_inc',          name: '特別利益',          indent: 1 },
    { id: 'extra_exp',          name: '特別損失',          indent: 1 },
    { id: 'pretax_profit',      name: '税引前当期純利益',   bold: true },
    { id: 'corp_tax',           name: '法人税等',          indent: 1 },
    { id: 'net_profit',         name: '当期純利益',         bold: true },
  ];
  return FIXED_PL.filter(r => av[r.id]?.some(v => v !== 0) || r.bold);
}
