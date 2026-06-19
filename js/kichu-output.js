// ===== 期中成果物出力 (kichu-output.js) =====
// Entry: showKichuOutput(type) where type = 'monthly' | 'cashflow' | 'forecast' | 'execcomp'

window._kichuCharts = {};

var _kichuPhaseTypes = {
  1: [
    { type:'forecast',    label:'着地予測' },
    { type:'monthly',     label:'月次業績' },
    { type:'cashflow',    label:'資金繰り' },
    { type:'prevcomp',    label:'前期比較' },
    { type:'taxplanning', label:'決算対策' },
    { type:'execcomp',    label:'役員報酬' },
  ],
  2: [
    { type:'taxplanning', label:'決算対策' },
    { type:'forecast',    label:'着地予測' },
    { type:'execcomp',    label:'役員報酬' },
    { type:'prevcomp',    label:'前期比較' },
  ],
  3: [
    { type:'monthly',     label:'月次業績' },
    { type:'prevcomp',    label:'前期比較' },
    { type:'cashflow',    label:'資金繰り' },
  ],
};

function showKichuOutput(type) {
  const modal = document.getElementById('kichu_output_modal');
  const body  = document.getElementById('kichu_output_body');
  const tabsEl = document.getElementById('kichu_output_tabs');
  if (!modal) return;

  const phase = (window.App && window.App.currentPhase) || 1;
  const tabList = _kichuPhaseTypes[phase] || _kichuPhaseTypes[1];

  if (tabsEl) {
    tabsEl.innerHTML = tabList.map(t => `
      <button id="kichu_tab_${t.type}"
        style="padding:5px 13px;border-radius:20px;border:1.5px solid ${t.type===type?'var(--emerald-mid)':'var(--border)'};
               background:${t.type===type?'var(--emerald-mid)':'transparent'};color:${t.type===type?'#fff':'var(--text-muted)'};
               font-size:11.5px;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap;font-family:inherit"
        onclick="showKichuOutput('${t.type}')">${t.label}</button>`).join('');
  }

  modal.style.display = 'block';
  body.innerHTML = '';
  renderKichuOutput(type, body);
}

function closeKichuOutput() {
  document.getElementById('kichu_output_modal').style.display = 'none';
}

function renderKichuOutput(type, container) {
  const budget  = window.App && window.App.currentBudget;
  const company = window.App && window.App.currentCompany;
  if (!company || !budget) {
    container.innerHTML = '<div class="no-data">会社を選択してください</div>';
    return;
  }
  if (type === 'monthly')     renderKichuMonthly(container, budget, company);
  if (type === 'cashflow')    renderKichuCashflow(container, budget, company);
  if (type === 'forecast')    renderKichuForecast(container, budget, company);
  if (type === 'execcomp')    renderKichuExecComp(container, budget, company);
  if (type === 'socialins')   renderKichuSocialIns(container, budget, company);
  if (type === 'prevcomp')    renderKichuPrevComp(container, budget, company);
  if (type === 'taxplanning') renderKichuTaxPlanning(container, budget, company);
}

// ===== Helper: 実績＋予算をブレンドした着地予測用PL =====
// actualThrough月まで → dynamicAccounts（実績）
// actualThrough+1月以降 → budget.rows（予算入力値）
function getKichuPL(budget) {
  if (!budget) return null;

  if (budget.dynamicAccounts?.length) {
    // getMergedRows で実績月はactualRows、予算月はrowsを正しくブレンド
    const mergedRows = getMergedRows(budget);
    const av = calcAllValuesDynamic({ ...budget, rows: mergedRows });
    const g = function(id) { return av[id] || new Array(13).fill(0); };
    return {
      sales:  g('sec_revenue'),
      gross:  g('calc_gross'),
      sga:    g('sec_sga'),
      op:     g('calc_op'),
      ord:    g('calc_ord'),
      pretax: g('calc_pretax'),
      net:    g('calc_net'),
    };
  }

  if (budget.rows && Object.keys(budget.rows).length > 0) {
    try {
      const pl = calcPL(budget.rows);
      const n = function(arr) { return Array.from({length:12}, function(_,i){ return arr ? (arr[i]||0) : 0; }); };
      return {
        sales:  n(pl.sales),
        gross:  n(pl.gross_profit),
        sga:    n(pl.sga),
        op:     n(pl.op_profit),
        ord:    n(pl.ord_profit),
        pretax: n(pl.pretax_profit),
        net:    n(pl.net_profit),
      };
    } catch(e) {}
  }

  return null;
}

// 純予算PL（比較用・予算入力値のみ）
function getKichuBudgetPL(budget) {
  if (!budget || !budget.rows) return null;
  try {
    if (budget.dynamicAccounts?.length) {
      const dv = calcAllValuesDynamic(budget);
      const g = function(id) { return dv[id] || new Array(13).fill(0); };
      return { sales: g('sec_revenue'), gross: g('calc_gross'), sga: g('sec_sga'),
               op: g('calc_op'), ord: g('calc_ord'), pretax: g('calc_pretax'), net: g('calc_net') };
    }
    const pl = calcPL(budget.rows);
    const n = function(arr) { return Array.from({length:12}, function(_,i){ return arr ? (arr[i]||0) : 0; }); };
    return { sales: n(pl.sales), gross: n(pl.gross_profit), sga: n(pl.sga),
             op: n(pl.op_profit), ord: n(pl.ord_profit),
             pretax: n(pl.pretax_profit), net: n(pl.net_profit) };
  } catch(e) { return null; }
}

function _kichuSum(arr) {
  if (!arr) return 0;
  return arr.reduce(function(a,v){ return a + (v||0); }, 0);
}

function _kichuToday() {
  var d = new Date();
  return d.getFullYear() + '年' + (d.getMonth()+1) + '月' + d.getDate() + '日';
}

// ===== ① 月次業績報告書 =====
function renderKichuMonthly(container, budget, company) {
  var pl = getKichuPL(budget);
  if (!pl) { container.innerHTML = '<div class="no-data">データがありません</div>'; return; }

  // actualCols（月次予算入力の実績/予算トグル）を参照
  var actualCols = getActualCols(budget);
  var startMonth = budget.startMonth || 4;
  var labels     = getMonthLabels(startMonth);
  var curYear    = window.App ? window.App.currentYear : new Date().getFullYear();

  var rows = [
    { label: '売上高',     data: pl.sales,  bold: false },
    { label: '売上総利益', data: pl.gross,  bold: true  },
    { label: '販管費',     data: pl.sga,    bold: false },
    { label: '営業利益',   data: pl.op,     bold: true  },
    { label: '経常利益',   data: pl.ord,    bold: true  },
    { label: '当期純利益', data: pl.net,    bold: true  },
  ];

  var actMon = actualCols.filter(Boolean).length;
  var bdgMon = 12 - actMon;
  var hasAct = actMon > 0;

  // 実績の最初と最後のラベル（通知文用）
  var firstActIdx = actualCols.indexOf(true);
  var lastActIdx  = actualCols.reduce(function(last, v, i){ return v ? i : last; }, -1);

  // Build table header
  var thCols = '<th class="kichu-label-th">科目</th>';
  for (var m = 0; m < 12; m++) {
    var isActual = actualCols[m];
    thCols += '<th style="' + (isActual ? 'background:#1a5276;color:#fff' : '') + '">' + escHtml(labels[m]) + '</th>';
  }
  if (hasAct) thCols += '<th style="background:#1a5276;color:#fff;white-space:nowrap">実績合計<br><span style="font-size:9px;font-weight:400">' + actMon + 'か月</span></th>';
  if (bdgMon > 0) thCols += '<th style="white-space:nowrap">予算合計<br><span style="font-size:9px;font-weight:400">' + bdgMon + 'か月</span></th>';
  thCols += '<th style="background:#2e4057;color:#fff;white-space:nowrap">年間合計</th>';

  // Build table body
  var tbodyRows = rows.map(function(row) {
    var actSum = 0, bdgSum = 0;
    var cells = '';
    for (var m = 0; m < 12; m++) {
      var v = row.data[m] || 0;
      var isAct = actualCols[m];
      var extra = '';
      if (row.bold) extra += ' kichu-bold';
      if (isAct)    { extra += ' kichu-actual'; actSum += v; }
      else          { extra += ' kichu-forecast'; bdgSum += v; }
      if (v < 0)    extra += ' kichu-neg';
      cells += '<td class="' + extra.trim() + '">' + fmtK(v) + '</td>';
    }
    bdgSum += (row.data[12] || 0);
    var total = actSum + bdgSum;
    var boldCls = row.bold ? ' kichu-bold' : '';
    return '<tr>' +
      '<td class="kichu-label' + boldCls + '">' + escHtml(row.label) + '</td>' +
      cells +
      (hasAct ? '<td class="' + boldCls + (actSum < 0 ? ' kichu-neg' : '') + '" style="background:#d6eaf8">' + fmtK(actSum) + '</td>' : '') +
      (bdgMon > 0 ? '<td class="' + boldCls + (bdgSum < 0 ? ' kichu-neg' : '') + '">' + fmtK(bdgSum) + '</td>' : '') +
      '<td class="' + boldCls + (total < 0 ? ' kichu-neg' : '') + '" style="background:#eef2ff">' + fmtK(total) + '</td>' +
    '</tr>';
  }).join('');

  // Actual-through notice
  var noticeText = hasAct
    ? '実績確定: ' + labels[firstActIdx] + '～' + labels[lastActIdx] + '（' + actMon + 'か月）/ 残り' + bdgMon + 'か月は予算値'
    : '実績確定なし — 全月予算値';

  // Unique canvas id
  var canvasId = 'kichu_monthly_chart_' + Date.now();

  container.innerHTML = `
    <div class="kichu-doc-title">${escHtml(company.name)} — 月次業績報告書</div>
    <div class="kichu-doc-sub">${curYear}年度　作成日: ${_kichuToday()}</div>

    <div class="kichu-section">
      <div style="font-size:11px;background:#e8f4f8;border-left:4px solid #2196f3;padding:8px 12px;margin-bottom:12px;border-radius:4px">
        📌 ${escHtml(noticeText)}（青背景＝実績、白背景＝予算値）
      </div>
      <div style="overflow-x:auto">
        <table class="kichu-table">
          <thead><tr>${thCols}</tr></thead>
          <tbody>${tbodyRows}</tbody>
        </table>
      </div>
      <div style="font-size:10px;color:#64748b;margin-top:4px">単位：千円</div>
    </div>

    <div class="kichu-section">
      <div class="kichu-section-title">月次推移グラフ（売上高 vs 営業利益）</div>
      <canvas id="${canvasId}" style="max-height:280px"></canvas>
    </div>
  `;

  // Destroy previous chart
  if (window._kichuCharts['monthly']) {
    try { window._kichuCharts['monthly'].destroy(); } catch(e) {}
  }

  // Build chart datasets
  var salesActual = pl.sales.map(function(v, i){ return actualCols[i] ? v/1000 : null; });
  var salesBudget = pl.sales.map(function(v, i){ return actualCols[i] ? null : v/1000; });
  var opActual    = pl.op.map(function(v, i){ return actualCols[i] ? v/1000 : null; });
  var opBudget    = pl.op.map(function(v, i){ return actualCols[i] ? null : v/1000; });

  var ctx = document.getElementById(canvasId);
  if (ctx) {
    window._kichuCharts['monthly'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: '売上高（実績）',
            data: salesActual,
            backgroundColor: 'rgba(30,58,95,0.8)',
            order: 2
          },
          {
            label: '売上高（予算）',
            data: salesBudget,
            backgroundColor: 'rgba(30,58,95,0.35)',
            order: 2
          },
          {
            label: '営業利益（実績）',
            data: opActual,
            backgroundColor: 'rgba(5,150,105,0.85)',
            order: 2
          },
          {
            label: '営業利益（予算）',
            data: opBudget,
            backgroundColor: 'rgba(5,150,105,0.35)',
            order: 2
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top', labels: { font: { size: 10 } } },
          tooltip: {
            callbacks: {
              label: function(ctx) { return ctx.dataset.label + ': ' + (ctx.raw != null ? ctx.raw.toLocaleString() : '—') + '千円'; }
            }
          }
        },
        scales: {
          y: { ticks: { callback: function(v){ return v.toLocaleString() + '千'; } } }
        }
      }
    });
  }
}

// ===== ② 資金繰り予測表 =====

// 前期末現預金を取得（budgetPrev1のBS現金・預金科目から）
function _getPrevYearCash(budgetPrev1) {
  if (!budgetPrev1) return null;
  if (budgetPrev1.dynamicAccounts && budgetPrev1.dynamicAccounts.length) {
    var cashAcc = budgetPrev1.dynamicAccounts.find(function(a) {
      return a.name && a.name.replace(/\s/g,'').match(/現金|預金|現預金/) && a.section && a.section.startsWith('bs');
    });
    if (cashAcc) {
      var src = budgetPrev1.actualRows || budgetPrev1.rows || {};
      var v = (src[cashAcc.id] || [])[11]; // 期末月（index 11）のみ。途中月は拾わない
      if (v) return v;
    }
  }
  return null;
}

function renderKichuCashflow(container, budget, company) {
  var pl = getKichuPL(budget);
  if (!pl) { container.innerHTML = '<div class="no-data">データがありません</div>'; return; }

  var startMonth = budget.startMonth || 4;
  var labels     = getMonthLabels(startMonth);
  var curYear    = window.App ? window.App.currentYear : new Date().getFullYear();
  var companyId  = company.id || 'default';
  var lsKey      = 'kichu_cf2_' + companyId + '_' + curYear;

  // 前期末現預金を自動取得（① 前期末 index 11 → ② 当期首 index 0 → ③ 0）
  var budgetPrev1    = (typeof getBudget === 'function') ? getBudget(company.id, curYear - 1) : null;
  var prevCashAuto   = _getPrevYearCash(budgetPrev1);
  // ② 前期末がなければ当期首（index 0）を使用
  if (prevCashAuto == null && budget.dynamicAccounts) {
    var _curCashAcc = budget.dynamicAccounts.find(function(a) {
      return a.name && a.name.replace(/\s/g,'').match(/現金|預金|現預金/) && a.section && a.section.startsWith('bs');
    });
    if (_curCashAcc) {
      var _curSrc = budget.actualRows || budget.rows || {};
      var _v0 = (_curSrc[_curCashAcc.id] || [])[0];
      if (_v0) prevCashAuto = _v0;
    }
  }

  // localStorage から設定値を読み込む
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(lsKey) || '{}'); } catch(e) {}

  // 期首現預金: 手動入力 > 自動取得
  var startCashK = saved.startCash != null ? saved.startCash
                 : (prevCashAuto != null ? Math.round(prevCashAuto / 1000) : 0);
  var prevCorpTaxK = saved.prevCorpTax || 0;  // 前期法人税等（千円）
  var prevCtaxK    = saved.prevCtax    || 0;  // 前期消費税等（千円）

  // 中間納付: 会社設定から（千円単位に変換）
  var interimCorpK = Math.round(((company.prepaid1 || 0) + (company.prepaid2 || 0)) / 1000);
  var interimCtaxK = Math.round((company.ctaxPrepaid || 0) / 1000);

  // 納税アウトフロー（千円、負値）
  // 前期申告納税: 第2月（index 1）/ 中間納付: 第8月（index 7）
  var taxOutflow = new Array(12).fill(0);
  if (prevCorpTaxK > 0 || prevCtaxK > 0) taxOutflow[1] -= (prevCorpTaxK + prevCtaxK);
  if (interimCorpK > 0)                  taxOutflow[7] -= interimCorpK;
  if (interimCtaxK > 0)                  taxOutflow[7] -= interimCtaxK;

  var startCash = startCashK * 1000;

  function save() {
    var sc = parseFloat(document.getElementById('kichu_cf2_startcash')?.value || startCashK);
    var pc = parseFloat(document.getElementById('kichu_cf2_prevcorp')?.value  || 0);
    var px = parseFloat(document.getElementById('kichu_cf2_prevctax')?.value  || 0);
    localStorage.setItem(lsKey, JSON.stringify({ startCash: sc, prevCorpTax: pc, prevCtax: px }));
    renderKichuOutput('cashflow', document.getElementById('kichu_output_body'));
  }
  window._kichuCfSave = save;

  // 月次データ構築
  var monthData = [];
  var cumCF = 0, runCash = startCash;
  for (var i = 0; i < 12; i++) {
    var ord    = pl.ord[i] || 0;
    var opCF   = Math.round(ord * 0.662);
    var taxOut = taxOutflow[i] * 1000; // 千円 → 円
    var netCF  = opCF + taxOut;
    cumCF   += netCF;
    runCash += netCF;
    monthData.push({ label: labels[i], ord: ord, opCF: opCF, taxOut: taxOut, netCF: netCF, cumCF: cumCF, endCash: runCash });
  }

  var hasTax = taxOutflow.some(function(v){ return v !== 0; });

  var tableRows = monthData.map(function(d) {
    var taxCell = hasTax
      ? '<td class="' + (d.taxOut < 0 ? 'kichu-neg' : '') + '" style="background:#fff8f0">' + (d.taxOut !== 0 ? fmtK(d.taxOut) : '—') + '</td>'
      : '';
    return '<tr>' +
      '<td class="kichu-label">' + escHtml(d.label) + '</td>' +
      '<td class="' + (d.ord   < 0 ? 'kichu-neg' : '') + '">' + fmtK(d.ord)     + '</td>' +
      '<td class="' + (d.opCF  < 0 ? 'kichu-neg' : '') + '">' + fmtK(d.opCF)    + '</td>' +
      taxCell +
      '<td class="' + (d.netCF < 0 ? 'kichu-neg' : '') + '">' + fmtK(d.netCF)   + '</td>' +
      '<td class="' + (d.endCash < 0 ? 'kichu-neg kichu-bold' : 'kichu-bold') + '">' + fmtK(d.endCash) + '</td>' +
    '</tr>';
  }).join('');

  var taxTh = hasTax ? '<th style="background:#7c4700;color:#fff;white-space:nowrap">納税等（千円）</th>' : '';

  var canvasId = 'kichu_cf_chart_' + Date.now();

  var autoNote = prevCashAuto != null
    ? '前期末現預金より自動取得: ' + Math.round(prevCashAuto/1000).toLocaleString() + '千円'
    : '前期データなし（手動入力）';

  var interimNote = (interimCorpK > 0 || interimCtaxK > 0)
    ? '中間納付 法人税等 ' + interimCorpK.toLocaleString() + '千円・消費税 ' + interimCtaxK.toLocaleString() + '千円 → 第8月に計上'
    : '';

  container.innerHTML = `
    <div class="kichu-doc-title">${escHtml(company.name)} — 資金繰り予測表</div>
    <div class="kichu-doc-sub">${curYear}年度　作成日: ${_kichuToday()}</div>

    <div class="kichu-section">
      <div class="kichu-section-title">基本設定</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:8px">
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">期首現預金残高（千円）</label>
          <input type="number" id="kichu_cf2_startcash" class="form-input" style="width:100%"
            value="${startCashK}" placeholder="0" onchange="window._kichuCfSave()">
          <div style="font-size:10px;color:#64748b;margin-top:3px">📌 ${escHtml(autoNote)}</div>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">前期法人税等 申告納税額（千円）</label>
          <input type="number" id="kichu_cf2_prevcorp" class="form-input" style="width:100%"
            value="${prevCorpTaxK}" placeholder="0" onchange="window._kichuCfSave()">
          <div style="font-size:10px;color:#64748b;margin-top:3px">第2月（${escHtml(labels[1])}）に支出</div>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">前期消費税等 申告納税額（千円）</label>
          <input type="number" id="kichu_cf2_prevctax" class="form-input" style="width:100%"
            value="${prevCtaxK}" placeholder="0" onchange="window._kichuCfSave()">
          <div style="font-size:10px;color:#64748b;margin-top:3px">第2月（${escHtml(labels[1])}）に支出</div>
        </div>
      </div>
      ${interimNote ? '<div style="font-size:11px;background:#fffbeb;border-left:3px solid #f59e0b;padding:6px 10px;border-radius:4px">⚙️ ' + escHtml(interimNote) + '</div>' : ''}
    </div>

    <div class="kichu-section">
      <div style="overflow-x:auto">
        <table class="kichu-table">
          <thead>
            <tr>
              <th class="kichu-label-th">月</th>
              <th>経常利益（千円）</th>
              <th>営業CF推定（千円）</th>
              ${taxTh}
              <th>月次純CF（千円）</th>
              <th style="background:#2e4057;color:#fff">推定期末現預金（千円）</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      <div style="font-size:10px;color:#64748b;margin-top:4px">単位：千円　営業CFは経常利益×66.2%の簡易推定</div>
    </div>

    <div class="kichu-section">
      <div class="kichu-section-title">現預金残高推移</div>
      <canvas id="${canvasId}" style="max-height:260px"></canvas>
    </div>

    <div style="font-size:11px;color:#64748b;border-top:1px solid var(--border);padding-top:10px;margin-top:8px">
      ※ 推定CFは経常利益×66.2%の簡易計算です。借入返済・設備投資等は含まれていません。詳細は別途ご確認ください。
    </div>
  `;

  if (window._kichuCharts['cashflow']) {
    try { window._kichuCharts['cashflow'].destroy(); } catch(e) {}
  }

  var ctx = document.getElementById(canvasId);
  if (ctx) {
    window._kichuCharts['cashflow'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: '推定期末現預金（千円）',
            data: monthData.map(function(d){ return Math.round(d.endCash / 1000); }),
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37,99,235,0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top', labels: { font: { size: 10 } } },
          tooltip: {
            callbacks: {
              label: function(ctx) { return ctx.dataset.label + ': ' + ctx.raw.toLocaleString() + '千円'; }
            }
          }
        },
        scales: {
          y: { ticks: { callback: function(v){ return v.toLocaleString() + '千'; } } }
        }
      }
    });
  }
}

// ===== ③ 着地予測・税金概算 =====
function renderKichuForecast(container, budget, company) {
  var pl = getKichuPL(budget);
  if (!pl) { container.innerHTML = '<div class="no-data">データがありません</div>'; return; }

  var actualCols = getActualCols(budget);
  var actMon     = actualCols.filter(Boolean).length;
  var lastActIdx = actualCols.reduce(function(last, v, i){ return v ? i : last; }, -1);
  var startMonth = budget.startMonth || 4;
  var labels     = getMonthLabels(startMonth);
  var curYear    = window.App ? window.App.currentYear : new Date().getFullYear();
  var capital    = company.capital || 10000000;

  // Landing forecast = sum all 12 months (actual months already contain actual data)
  var annualPretax = _kichuSum(pl.pretax);
  var annualNet    = _kichuSum(pl.net);
  var annualSales  = _kichuSum(pl.sales);

  // 純予算PL（比較用: 実績に関係なく予算入力値のみ）
  var budgetOnlyPL = getKichuBudgetPL(budget);
  var budgetAnnualPretax = budgetOnlyPL ? _kichuSum(budgetOnlyPL.pretax) : annualPretax;
  var budgetAnnualNet    = budgetOnlyPL ? _kichuSum(budgetOnlyPL.net)    : annualNet;

  // 実績累計（実績月のみ合計）
  var actualCumPretax = actMon > 0
    ? pl.pretax.reduce(function(a,v,i){ return actualCols[i] ? a+(v||0) : a; }, 0) : null;

  // 着地予測 = ブレンド済みpl の合計（実績月＋残り予算月）
  var landingPretax = annualPretax;
  var landingNet    = annualNet;
  var landingDiff   = landingPretax - budgetAnnualPretax; // 予算比

  // Tax calculation
  var taxBreak = null, taxTotal = 0;
  if (landingPretax > 0) {
    taxBreak = calcAllTax(landingPretax, capital);
    taxTotal  = taxBreak.total;
  }
  var prepaid1 = company.prepaid1 || 0;
  var prepaid2 = company.prepaid2 || 0;

  // Consumption tax
  var ctaxEst = calcCtaxEstimate(budget, company);
  var ctaxAmt = (ctaxEst && !ctaxEst.exempt && !ctaxEst.noData) ? (ctaxEst.ctax || 0) : 0;
  var ctaxPrepaid = company.ctaxPrepaid || 0;

  // Advice localStorage key
  var companyId = company.id || 'default';
  var advKey    = 'kichu_advice_' + companyId + '_' + curYear;
  var advText   = localStorage.getItem(advKey) || '';

  // Tax table rows
  var taxRows = '';
  if (taxBreak) {
    var localTaxTotal = (taxBreak.inhabitant || 0) + (taxBreak.business || 0) + (taxBreak.special || 0) + (taxBreak.localCorp || 0);
    var corpPay  = taxBreak.corp - (prepaid1 + prepaid2);
    var ctaxPay  = ctaxAmt - ctaxPrepaid;
    var grandTotal    = taxTotal + ctaxAmt;
    var grandPrepaid  = (prepaid1 + prepaid2) + ctaxPrepaid;
    var grandPay      = grandTotal - grandPrepaid;

    taxRows = `
      <tr>
        <td class="kichu-label">法人税</td>
        <td>${fmtK(taxBreak.corp)}</td>
        <td>${fmtK(prepaid1 + prepaid2)}</td>
        <td class="${corpPay > 0 ? 'kichu-neg' : ''}">${fmtK(corpPay)}</td>
      </tr>
      <tr>
        <td class="kichu-label">地方法人税</td>
        <td>${fmtK(taxBreak.localCorp || 0)}</td>
        <td>—</td>
        <td>${fmtK(taxBreak.localCorp || 0)}</td>
      </tr>
      <tr>
        <td class="kichu-label">都道府県・市町村税等</td>
        <td>${fmtK((taxBreak.inhabitant||0) + (taxBreak.business||0) + (taxBreak.special||0))}</td>
        <td>—</td>
        <td>${fmtK((taxBreak.inhabitant||0) + (taxBreak.business||0) + (taxBreak.special||0))}</td>
      </tr>
      <tr>
        <td class="kichu-label">消費税等</td>
        <td>${fmtK(ctaxAmt)}</td>
        <td>${fmtK(ctaxPrepaid)}</td>
        <td class="${ctaxPay > 0 ? 'kichu-neg' : ''}">${fmtK(ctaxPay)}</td>
      </tr>
      <tr style="font-weight:700;background:#f0f7ff">
        <td class="kichu-label kichu-bold">合計</td>
        <td class="kichu-bold">${fmtK(grandTotal)}</td>
        <td class="kichu-bold">${fmtK(grandPrepaid)}</td>
        <td class="kichu-bold ${grandPay > 0 ? 'kichu-neg' : ''}">${fmtK(grandPay)}</td>
      </tr>
    `;

    var highlightVal = Math.round(grandPay / 10000);
    var highlightText = grandPay > 0
      ? '今期の納付見込み合計: ' + Math.abs(highlightVal).toLocaleString() + '万円'
      : '今期の還付見込み: ' + Math.abs(highlightVal).toLocaleString() + '万円（還付）';
    var highlightColor = grandPay > 0 ? '#dc2626' : '#059669';

    var highlightHtml = `
      <div class="kichu-tax-highlight" style="background:linear-gradient(135deg,${grandPay>0?'#7f1d1d,#dc2626':'#064e3b,#059669'})">
        <div class="kichu-tax-highlight-label">差引 納付見込み（税引前利益 ${fmtK(annualPretax)}千円ベース）</div>
        <div class="kichu-tax-highlight-val">${highlightText}</div>
      </div>`;
  } else {
    taxRows = '<tr><td colspan="4" class="no-data-small" style="text-align:center;padding:12px">利益が0以下のため税額概算なし</td></tr>';
    var highlightHtml = '';
  }

  // Monthly mini-table
  var miniRows = labels.map(function(lbl, i) {
    var isActual = actualCols[i];
    return '<tr>' +
      '<td class="kichu-label">' + escHtml(lbl) + (isActual ? ' <span style="font-size:9px;color:#2196f3">実</span>' : '') + '</td>' +
      '<td class="' + (isActual ? 'kichu-actual' : 'kichu-forecast') + '">' + fmtK(pl.pretax[i] || 0) + '</td>' +
    '</tr>';
  }).join('');

  container.innerHTML = `
    <div class="kichu-doc-title">${escHtml(company.name)} — 着地予測・税金概算シート</div>
    <div class="kichu-doc-sub">${curYear}年度　作成日: ${_kichuToday()}</div>

    <!-- Section A: 着地予測 -->
    <div class="kichu-section">
      <div class="kichu-section-title">A. 着地予測</div>
      <div class="kichu-summary-grid">
        <div class="kichu-summary-card">
          <div class="kichu-summary-label">年間予算利益（税引前）</div>
          <div class="kichu-summary-val ${budgetAnnualPretax >= 0 ? 'positive' : 'negative'}">${fmtK(budgetAnnualPretax)}千円</div>
        </div>
        ${actMon > 0 ? `
        <div class="kichu-summary-card">
          <div class="kichu-summary-label">実績累計（${labels[lastActIdx]}まで ${actMon}か月）</div>
          <div class="kichu-summary-val ${actualCumPretax >= 0 ? 'positive' : 'negative'}">${fmtK(actualCumPretax)}千円</div>
        </div>` : `
        <div class="kichu-summary-card" style="opacity:.45">
          <div class="kichu-summary-label">実績累計</div>
          <div class="kichu-summary-val" style="font-size:13px;color:var(--text-muted)">実績インポート待ち</div>
        </div>`}
        <div class="kichu-summary-card" style="border-color:#3b82f6;border-width:2px">
          <div class="kichu-summary-label">着地予測利益（税引前）${actMon > 0 ? '<br><span style="font-size:9px;color:#3b82f6">実績'+labels[lastActIdx]+'まで＋残り予算</span>' : ''}</div>
          <div class="kichu-summary-val ${landingPretax >= 0 ? 'positive' : 'negative'}">${fmtK(landingPretax)}千円</div>
        </div>
        <div class="kichu-summary-card">
          <div class="kichu-summary-label">予算比（着地−予算）</div>
          <div class="kichu-summary-val ${landingDiff >= 0 ? 'positive' : 'negative'}">${landingDiff >= 0 ? '+' : ''}${fmtK(landingDiff)}千円</div>
        </div>
      </div>
      <div style="display:flex;gap:16px">
        <div style="flex:1">
          <table class="kichu-table">
            <thead>
              <tr>
                <th class="kichu-label-th">月</th>
                <th>${actMon > 0 ? '実績／予算（千円）<br><span style="font-weight:400;font-size:9px">🔵実績 ⬜予算</span>' : '予算（千円）'}</th>
              </tr>
            </thead>
            <tbody>${miniRows}</tbody>
            <tfoot>
              <tr style="font-weight:700;background:#f0f7ff">
                <td class="kichu-label kichu-bold">年間合計</td>
                <td class="kichu-bold ${annualPretax < 0 ? 'kichu-neg' : ''}">${fmtK(annualPretax)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>

    <!-- Section B: 税金概算 -->
    <div class="kichu-section">
      <div class="kichu-section-title">B. 税金概算（着地予測利益ベース）</div>
      <table class="kichu-table">
        <thead>
          <tr>
            <th class="kichu-label-th">税目</th>
            <th>概算年税額（千円）</th>
            <th>中間(予定)納付（千円）</th>
            <th>差引納付見込（千円）</th>
          </tr>
        </thead>
        <tbody>${taxRows}</tbody>
      </table>
      ${highlightHtml || ''}
    </div>

    <!-- Section C: アドバイス欄 -->
    <div class="kichu-section">
      <div class="kichu-section-title">C. アドバイス欄（税理士コメント）</div>
      <textarea class="kichu-advice-area" id="kichu_advice_area"
        placeholder="税理士より / 着地予測・税金対策のコメントを入力..."
        onblur="localStorage.setItem('${advKey}', this.value)"
      >${escHtml(advText)}</textarea>
    </div>
  `;
}

// ===== ④ 役員報酬提案書 =====
function estimateIncomeTax(annualIncome) {
  var deduction = annualIncome <= 1800000   ? annualIncome * 0.4 :
                  annualIncome <= 3600000   ? annualIncome * 0.3  + 180000 :
                  annualIncome <= 6600000   ? annualIncome * 0.2  + 540000 :
                  annualIncome <= 8500000   ? annualIncome * 0.1  + 1200000 : 1950000;
  var taxableIncome = Math.max(0, annualIncome - deduction - 480000);
  var tax = taxableIncome <= 1950000   ? taxableIncome * 0.05 :
            taxableIncome <= 3300000   ? taxableIncome * 0.10 - 97500 :
            taxableIncome <= 6950000   ? taxableIncome * 0.20 - 427500 :
            taxableIncome <= 9000000   ? taxableIncome * 0.23 - 636000 :
            taxableIncome <= 18000000  ? taxableIncome * 0.33 - 1536000 :
            taxableIncome <= 40000000  ? taxableIncome * 0.40 - 2796000 :
                                         taxableIncome * 0.45 - 4796000;
  return Math.max(0, Math.round(tax * 1.021));
}

function renderKichuExecComp(container, budget, company) {
  var pl = getKichuPL(budget);
  if (!pl) { container.innerHTML = '<div class="no-data">データがありません</div>'; return; }

  var curYear    = window.App ? window.App.currentYear : new Date().getFullYear();
  var capital    = company.capital || 10000000;
  var companyId  = company.id || 'default';

  // Landing pretax (before exec comp adjustment)
  var annualPretax = _kichuSum(pl.pretax);

  // Try to get current exec comp from execcomp localStorage
  var currentMonthlyComp = 0;
  try {
    var ecData = JSON.parse(localStorage.getItem('execcomp_v1') || '{}');
    var ecForCompany = ecData[companyId];
    if (ecForCompany && ecForCompany.monthly) {
      currentMonthlyComp = ecForCompany.monthly;
    } else {
      // Try to find from SGA entries in budget
      var allVals = budget.dynamicAccounts ? calcAllValuesDynamic(budget) : calcAllValues(budget.rows);
      var execArr = allVals['sga_exec'] || allVals['exec_comp'] || [];
      var execAnnual = execArr.reduce(function(a,v){ return a+(v||0); }, 0);
      currentMonthlyComp = Math.round(execAnnual / 12);
    }
  } catch(e) {}

  // 3 scenarios: current, +増額1, +増額2
  // Increase amounts based on pretax profit level
  var inc1 = Math.round(annualPretax * 0.1 / 12 / 10000) * 10000; // ~10% of pretax as monthly
  var inc2 = Math.round(annualPretax * 0.2 / 12 / 10000) * 10000; // ~20% of pretax as monthly
  if (inc1 < 100000) inc1 = 100000;
  if (inc2 < 200000) inc2 = 200000;

  var scenarios = [
    { label: '現状維持', monthly: currentMonthlyComp, tag: '' },
    { label: '節税重視', monthly: currentMonthlyComp + inc1, tag: '+' + Math.round(inc1/10000) + '万円/月' },
    { label: 'バランス', monthly: currentMonthlyComp + Math.round(inc2/2), tag: '+' + Math.round(inc2/2/10000) + '万円/月' },
  ];

  // For each scenario: new pretax = annualPretax - additional exec comp
  // (current exec comp is already in pretax as cost; increasing by delta reduces pretax by delta)
  var scenarioHtmls = scenarios.map(function(sc, idx) {
    var annualComp    = sc.monthly * 12;
    var deltaComp     = annualComp - currentMonthlyComp * 12;
    var newPretax     = annualPretax - deltaComp;
    var corpTaxBreak  = newPretax > 0 ? calcAllTax(newPretax, capital) : null;
    var corpTax       = corpTaxBreak ? corpTaxBreak.total : 0;
    var incomeTax     = estimateIncomeTax(annualComp);
    var totalBurden   = corpTax + incomeTax;

    // Find best scenario (lowest total burden)
    sc._total = totalBurden;
    sc._corpTax = corpTax;
    sc._incomeTax = incomeTax;
    sc._newPretax = newPretax;
    return sc;
  });

  // Determine recommended (lowest total)
  var minBurden = Math.min.apply(null, scenarioHtmls.map(function(s){ return s._total; }));

  var cardHtmls = scenarioHtmls.map(function(sc) {
    var isRec = sc._total === minBurden;
    return `
      <div class="kichu-scenario-card${isRec ? ' recommended' : ''}">
        <div class="kichu-scenario-title">
          ${isRec ? '⭐ ' : ''}${escHtml(sc.label)}
          ${sc.tag ? `<span style="font-size:10px;color:#64748b;font-weight:400">&nbsp;${escHtml(sc.tag)}</span>` : ''}
          ${isRec ? '<span style="font-size:10px;color:#2563eb;float:right">最適</span>' : ''}
        </div>
        <div class="kichu-scenario-row"><span>役員報酬 月額</span><span>${fmtK(sc.monthly)}千円</span></div>
        <div class="kichu-scenario-row"><span>役員報酬 年間</span><span>${fmtK(sc.monthly*12)}千円</span></div>
        <div class="kichu-scenario-row"><span>推定 税引前利益</span><span class="${sc._newPretax < 0 ? 'kichu-neg' : ''}">${fmtK(sc._newPretax)}千円</span></div>
        <div class="kichu-scenario-row"><span>推定 法人税等</span><span>${fmtK(sc._corpTax)}千円</span></div>
        <div class="kichu-scenario-row"><span>推定 所得税等(役員)</span><span>${fmtK(sc._incomeTax)}千円</span></div>
        <div class="kichu-scenario-row total"><span>合計税負担(概算)</span><span>${fmtK(sc._total)}千円</span></div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="kichu-doc-title">${escHtml(company.name)} — 役員報酬・賞与 最適化提案</div>
    <div class="kichu-doc-sub">${curYear}年度　作成日: ${_kichuToday()}</div>

    <div class="kichu-section">
      <div class="kichu-section-title">着地予測ベース</div>
      <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">
        <div class="kichu-summary-card" style="flex:1;min-width:180px">
          <div class="kichu-summary-label">着地予測 税引前利益</div>
          <div class="kichu-summary-val ${annualPretax >= 0 ? 'positive' : 'negative'}">${fmtK(annualPretax)}千円</div>
        </div>
        <div class="kichu-summary-card" style="flex:1;min-width:180px">
          <div class="kichu-summary-label">現在の役員報酬（月額）</div>
          <div class="kichu-summary-val">${fmtK(currentMonthlyComp)}千円</div>
        </div>
      </div>
    </div>

    <div class="kichu-section">
      <div class="kichu-section-title">3シナリオ比較</div>
      <div class="kichu-scenario-grid">${cardHtmls}</div>
      <div style="font-size:10px;color:#64748b;margin-top:10px">
        ※ 所得税は給与所得控除・基礎控除適用後の概算値（社会保険料・住民税は含まず）。
        法人税等は簡易計算。必ず顧問税理士との確認を行ってください。
      </div>
    </div>

    <div class="kichu-section">
      <div class="kichu-section-title">詳細シミュレーション表（役員報酬 vs 税負担）</div>
      <table class="kichu-table">
        <thead>
          <tr>
            <th class="kichu-label-th">シナリオ</th>
            <th>役員報酬月額（千円）</th>
            <th>役員報酬年額（千円）</th>
            <th>推定法人税等（千円）</th>
            <th>推定所得税(役員)（千円）</th>
            <th>合計税負担（千円）</th>
          </tr>
        </thead>
        <tbody>
          ${scenarioHtmls.map(function(sc) {
            var isRec = sc._total === minBurden;
            return '<tr' + (isRec ? ' style="background:#eff6ff;font-weight:700"' : '') + '>' +
              '<td class="kichu-label">' + (isRec ? '⭐ ' : '') + escHtml(sc.label) + '</td>' +
              '<td>' + fmtK(sc.monthly) + '</td>' +
              '<td>' + fmtK(sc.monthly*12) + '</td>' +
              '<td>' + fmtK(sc._corpTax) + '</td>' +
              '<td>' + fmtK(sc._incomeTax) + '</td>' +
              '<td class="' + (isRec ? 'kichu-bold' : '') + '">' + fmtK(sc._total) + '</td>' +
            '</tr>';
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ===== ⑤ 社会保険試算 =====
function renderKichuSocialIns(container, budget, company) {
  var curYear = window.App ? window.App.currentYear : new Date().getFullYear();

  // 協会けんぽ料率2024年度（%）
  var KENPO = {
    '北海道':10.21,'青森':9.70,'岩手':9.72,'宮城':10.04,'秋田':10.04,'山形':10.04,
    '福島':9.68,'茨城':9.74,'栃木':9.84,'群馬':9.76,'埼玉':9.87,'千葉':9.87,
    '東京':9.98,'神奈川':10.02,'新潟':9.35,'富山':9.99,'石川':10.09,'福井':10.08,
    '山梨':9.84,'長野':9.49,'静岡':9.78,'愛知':10.01,'三重':9.99,'滋賀':9.99,
    '京都':10.18,'大阪':10.29,'兵庫':10.18,'奈良':10.22,'和歌山':10.01,
    '鳥取':9.87,'島根':10.01,'岡山':10.17,'広島':10.00,'山口':9.99,
    '徳島':10.28,'香川':10.27,'愛媛':10.04,'高知':9.98,'福岡':10.32,
    '佐賀':10.41,'長崎':10.22,'熊本':10.24,'大分':10.10,'宮崎':10.15,
    '鹿児島':10.24,'沖縄':9.09,
  };

  // 標準報酬月額表（円）
  var HYOJUN_M = [88000,98000,104000,110000,118000,126000,134000,142000,
    150000,160000,170000,180000,190000,200000,220000,240000,260000,280000,
    300000,320000,340000,360000,380000,410000,440000,470000,500000,530000,
    560000,590000,620000,650000];

  function getHyojunM(salary) {
    for (var i = 0; i < HYOJUN_M.length; i++) {
      if (salary <= HYOJUN_M[i]) return HYOJUN_M[i];
    }
    return HYOJUN_M[HYOJUN_M.length - 1];
  }

  // 計算関数
  function calcSocialIns(monthlyComp, pref, kaigo, bonusAmt) {
    var prefKey = pref ? pref.replace(/[都道府県]$/, '') : pref; // '東京都'→'東京'
    var kenpoRate = (KENPO[prefKey] || 10.00) / 100;
    var kaigoRate = kaigo ? 0.016 : 0;
    var nenkinRate = 0.183;

    var hyojunM = getHyojunM(monthlyComp);

    // 月額
    var kenpoTotal   = Math.floor(hyojunM * kenpoRate / 2) * 2;  // 労使折半後の合計
    var kaigoTotal   = Math.floor(hyojunM * kaigoRate / 2) * 2;
    var nenkinTotal  = Math.floor(hyojunM * nenkinRate / 2) * 2;
    var monthlyTotal = kenpoTotal + kaigoTotal + nenkinTotal;
    var companyM     = monthlyTotal / 2;
    var employeeM    = monthlyTotal / 2;

    // 決算賞与（標準賞与額 = 千円未満切捨て）
    var hyojunB      = Math.floor(bonusAmt / 1000) * 1000;
    // 健保上限: 年間5,730,000、厚生年金上限: 1回1,500,000
    var hyojunBKenpo = Math.min(hyojunB, 5730000);
    var hyojunBNenkin= Math.min(hyojunB, 1500000);
    var bonusKenpo   = Math.floor(hyojunBKenpo * (kenpoRate + kaigoRate) / 2) * 2;
    var bonusNenkin  = Math.floor(hyojunBNenkin * nenkinRate / 2) * 2;
    var bonusTotal   = bonusKenpo + bonusNenkin;
    var bonusCompany = bonusTotal / 2;
    var bonusEmployee= bonusTotal / 2;

    // 年間合計
    var annualCompany  = companyM * 12 + bonusCompany;
    var annualEmployee = employeeM * 12 + bonusEmployee;
    var annualTotal    = annualCompany + annualEmployee;

    return {
      hyojunM, kenpoTotal, kaigoTotal, nenkinTotal, monthlyTotal,
      companyM, employeeM,
      hyojunB, bonusTotal, bonusCompany, bonusEmployee,
      annualCompany, annualEmployee, annualTotal,
    };
  }

  var lsKey = 'socialins_' + (company.id||'') + '_' + curYear;
  var saved = JSON.parse(localStorage.getItem(lsKey) || '{}');

  var defaultComp  = saved.monthlyComp  || (company.execComp || 500000);
  var defaultPref  = saved.pref         || (company.prefecture ? company.prefecture.replace(/[都道府県]$/, '') : '東京');
  var defaultKaigo = saved.kaigo != null ? saved.kaigo : true;
  var defaultBonus = saved.bonusAmt     || 0;

  var prefOptions = Object.keys(KENPO).map(function(p) {
    return '<option value="' + p + '"' + (p === defaultPref ? ' selected' : '') + '>' + p + '</option>';
  }).join('');

  container.innerHTML = `
    <div class="kichu-doc-title">${escHtml(company.name)} — 社会保険試算</div>
    <div class="kichu-doc-sub">${curYear}年度　作成日: ${_kichuToday()}</div>

    <div class="kichu-section">
      <div class="kichu-section-title">入力</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px">
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">役員報酬（月額・円）</label>
          <input type="number" id="si_comp" value="${defaultComp}" step="10000" class="form-input" style="width:100%" oninput="calcSocialInsUI()">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">都道府県（協会けんぽ）</label>
          <select id="si_pref" class="form-input" style="width:100%" onchange="calcSocialInsUI()">
            ${prefOptions}
          </select>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">介護保険対象（40〜64歳）</label>
          <select id="si_kaigo" class="form-input" style="width:100%" onchange="calcSocialInsUI()">
            <option value="1" ${defaultKaigo?'selected':''}>対象（40〜64歳）</option>
            <option value="0" ${!defaultKaigo?'selected':''}>対象外（65歳以上 or 39歳以下）</option>
          </select>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">決算賞与予定額（円）</label>
          <input type="number" id="si_bonus" value="${defaultBonus}" step="10000" class="form-input" style="width:100%" oninput="calcSocialInsUI()">
        </div>
      </div>
    </div>

    <div class="kichu-section" id="si_result">
      <div style="color:var(--text-muted);font-size:13px">↑ 入力すると自動計算されます</div>
    </div>

    <div style="font-size:10px;color:#64748b;border-top:1px solid var(--border);padding-top:10px;margin-top:8px">
      ※ 協会けんぽ2024年度料率を使用。組合健保・個別健保の場合は料率が異なります。<br>
      ※ 厚生年金保険料は18.3%固定。賞与の健保上限573万円/年、厚生年金上限150万円/回。
    </div>
  `;

  // 初期計算
  window.calcSocialInsUI = function() {
    var comp  = parseFloat(document.getElementById('si_comp')?.value  || 0);
    var pref  = document.getElementById('si_pref')?.value  || '東京';
    var kaigo = document.getElementById('si_kaigo')?.value === '1';
    var bonus = parseFloat(document.getElementById('si_bonus')?.value || 0);

    localStorage.setItem(lsKey, JSON.stringify({ monthlyComp:comp, pref, kaigo, bonusAmt:bonus }));

    var r = calcSocialIns(comp, pref, kaigo, bonus);
    var fmtR = function(v) { return Math.round(v).toLocaleString('ja-JP') + '円'; };
    var fmtK = function(v) { return Math.round(v/1000).toLocaleString('ja-JP') + '千円'; };

    var kenpoRate = (KENPO[pref] || 10.00).toFixed(2);

    var resultEl = document.getElementById('si_result');
    if (!resultEl) return;
    resultEl.innerHTML = `
      <div class="kichu-section-title">月額保険料（標準報酬月額 ${r.hyojunM.toLocaleString()}円）</div>
      <table class="kichu-table" style="margin-bottom:16px">
        <thead>
          <tr>
            <th class="kichu-label-th">保険種別</th>
            <th>料率</th>
            <th>合計（労使）</th>
            <th>会社負担（月）</th>
            <th>本人負担（月）</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="kichu-label">健康保険（協会けんぽ ${pref}）</td>
            <td style="text-align:center">${kenpoRate}%</td>
            <td style="text-align:right">${fmtR(r.kenpoTotal)}</td>
            <td style="text-align:right">${fmtR(r.kenpoTotal/2)}</td>
            <td style="text-align:right">${fmtR(r.kenpoTotal/2)}</td>
          </tr>
          ${kaigo ? `<tr>
            <td class="kichu-label">介護保険</td>
            <td style="text-align:center">1.60%</td>
            <td style="text-align:right">${fmtR(r.kaigoTotal)}</td>
            <td style="text-align:right">${fmtR(r.kaigoTotal/2)}</td>
            <td style="text-align:right">${fmtR(r.kaigoTotal/2)}</td>
          </tr>` : ''}
          <tr>
            <td class="kichu-label">厚生年金保険</td>
            <td style="text-align:center">18.30%</td>
            <td style="text-align:right">${fmtR(r.nenkinTotal)}</td>
            <td style="text-align:right">${fmtR(r.nenkinTotal/2)}</td>
            <td style="text-align:right">${fmtR(r.nenkinTotal/2)}</td>
          </tr>
          <tr style="font-weight:700;background:rgba(59,130,246,.05)">
            <td class="kichu-label">月額合計</td>
            <td></td>
            <td style="text-align:right">${fmtR(r.monthlyTotal)}</td>
            <td style="text-align:right">${fmtR(r.companyM)}</td>
            <td style="text-align:right">${fmtR(r.employeeM)}</td>
          </tr>
        </tbody>
      </table>

      ${bonus > 0 ? `
      <div class="kichu-section-title">決算賞与 ${bonus.toLocaleString()}円 の追加保険料</div>
      <table class="kichu-table" style="margin-bottom:16px">
        <thead>
          <tr>
            <th class="kichu-label-th">内容</th>
            <th>標準賞与額</th>
            <th>追加保険料合計</th>
            <th>会社負担</th>
            <th>本人負担</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="kichu-label">決算賞与の社会保険料</td>
            <td style="text-align:right">${fmtR(r.hyojunB)}</td>
            <td style="text-align:right;font-weight:700;color:#dc2626">${fmtR(r.bonusTotal)}</td>
            <td style="text-align:right">${fmtR(r.bonusCompany)}</td>
            <td style="text-align:right">${fmtR(r.bonusEmployee)}</td>
          </tr>
        </tbody>
      </table>
      ` : ''}

      <div class="kichu-summary-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="kichu-summary-card">
          <div class="kichu-summary-label">会社負担 年間合計</div>
          <div class="kichu-summary-value" style="color:#dc2626">${fmtK(r.annualCompany)}</div>
          <div class="kichu-summary-sub">月額×12${bonus>0?' + 賞与分':''}</div>
        </div>
        <div class="kichu-summary-card">
          <div class="kichu-summary-label">本人負担 年間合計</div>
          <div class="kichu-summary-value">${fmtK(r.annualEmployee)}</div>
          <div class="kichu-summary-sub">月額×12${bonus>0?' + 賞与分':''}</div>
        </div>
        <div class="kichu-summary-card" style="border:2px solid #2563eb">
          <div class="kichu-summary-label">社会保険料 総計（労使）</div>
          <div class="kichu-summary-value" style="color:#2563eb">${fmtK(r.annualTotal)}</div>
          <div class="kichu-summary-sub">会社＋本人 合計</div>
        </div>
      </div>
    `;
  };

  window.calcSocialInsUI();
  // 都道府県の初期値を設定
  if (document.getElementById('si_pref')) {
    document.getElementById('si_pref').value = defaultPref;
    window.calcSocialInsUI();
  }
}

// ===== ⑥ 前期比較表 =====
function renderKichuPrevComp(container, budget, company) {
  var curYear   = window.App ? window.App.currentYear : new Date().getFullYear();
  var prevBudget = (typeof getBudget === 'function') ? getBudget(company.id, curYear - 1) : null;

  var curPL  = getKichuPL(budget);
  var prevPL = prevBudget ? getKichuPL(prevBudget) : null;

  if (!curPL) { container.innerHTML = '<div class="no-data">当期データがありません</div>'; return; }

  var ROWS = [
    { label: '売上高',     key: 'sales',  bold: true  },
    { label: '売上総利益', key: 'gross',  bold: true  },
    { label: '（粗利率）', key: '_gross_rate', rate: true },
    { label: '販管費',     key: 'sga',    bold: false },
    { label: '営業利益',   key: 'op',     bold: true  },
    { label: '（営業利益率）', key: '_op_rate', rate: true },
    { label: '経常利益',   key: 'ord',    bold: true  },
    { label: '当期純利益', key: 'net',    bold: true  },
  ];

  var sum = function(arr) { return arr ? arr.reduce(function(a,v){ return a+(v||0); }, 0) : 0; };

  var curTotals  = { sales: sum(curPL.sales), gross: sum(curPL.gross), sga: sum(curPL.sga), op: sum(curPL.op), ord: sum(curPL.ord), net: sum(curPL.net) };
  var prevTotals = prevPL ? { sales: sum(prevPL.sales), gross: sum(prevPL.gross), sga: sum(prevPL.sga), op: sum(prevPL.op), ord: sum(prevPL.ord), net: sum(prevPL.net) } : null;

  // 月次列ヘッダー
  var startMonth = budget.startMonth || 4;
  var labels = getMonthLabels(startMonth);
  var actualCols = getActualCols(budget);
  var actMon = actualCols.filter(Boolean).length;

  // 月次テーブル（当期 vs 前期）
  var monthTh = '<th class="kichu-label-th">科目</th>';
  for (var m = 0; m < 12; m++) {
    monthTh += '<th style="font-size:10px;' + (actualCols[m] ? 'background:#1a5276;color:#fff' : '') + '">' + labels[m] + '</th>';
  }
  monthTh += '<th style="background:#2e4057;color:#fff">年間計</th>';

  var monthRows = ROWS.filter(function(r){ return !r.rate; }).map(function(row) {
    var boldCls = row.bold ? ' kichu-bold' : '';
    var cells = '';
    for (var m = 0; m < 12; m++) {
      var cv = (curPL[row.key] || [])[m] || 0;
      var pv = prevPL ? ((prevPL[row.key] || [])[m] || 0) : null;
      var diff = pv !== null ? cv - pv : null;
      var diffStr = diff !== null ? (diff >= 0 ? '+' + fmtK(diff) : fmtK(diff)) : '—';
      var diffColor = diff !== null ? (diff >= 0 ? '#059669' : '#dc2626') : '#94a3b8';
      cells += '<td style="padding:3px 6px;text-align:right">' +
        '<div class="' + boldCls + '">' + fmtK(cv) + '</div>' +
        (pv !== null ? '<div style="font-size:9px;color:#64748b">' + fmtK(pv) + '</div>' : '') +
        '<div style="font-size:9px;color:' + diffColor + '">' + diffStr + '</div>' +
      '</td>';
    }
    var ct = curTotals[row.key] || 0;
    var pt = prevTotals ? (prevTotals[row.key] || 0) : null;
    var td = pt !== null ? ct - pt : null;
    var tStr = td !== null ? (td >= 0 ? '+' + fmtK(td) : fmtK(td)) : '—';
    var tColor = td !== null ? (td >= 0 ? '#059669' : '#dc2626') : '#94a3b8';
    cells += '<td style="background:#eef2ff;padding:3px 8px;text-align:right">' +
      '<div class="kichu-bold">' + fmtK(ct) + '</div>' +
      (pt !== null ? '<div style="font-size:9px;color:#64748b">' + fmtK(pt) + '</div>' : '') +
      '<div style="font-size:9px;color:' + tColor + '">' + tStr + '</div>' +
    '</td>';
    return '<tr><td class="kichu-label' + boldCls + '">' + escHtml(row.label) + '</td>' + cells + '</tr>';
  }).join('');

  // サマリー行（科目別・年間比較）
  var pct = function(cur, prev) {
    if (!prev || prev === 0) return '—';
    var p = (cur - prev) / Math.abs(prev) * 100;
    return (p >= 0 ? '+' : '') + p.toFixed(1) + '%';
  };

  var summaryRows = ROWS.map(function(row) {
    var cur, prev, boldCls = row.bold ? ' kichu-bold' : '';
    if (row.rate) {
      var baseKey = row.key === '_gross_rate' ? 'gross' : 'op';
      cur  = curTotals.sales  ? curTotals[baseKey]  / curTotals.sales  * 100 : 0;
      prev = prevTotals && prevTotals.sales ? prevTotals[baseKey] / prevTotals.sales * 100 : null;
      var diff = prev !== null ? cur - prev : null;
      var diffStr = diff !== null ? (diff >= 0 ? '+' : '') + diff.toFixed(1) + 'pt' : '—';
      var diffColor = diff !== null ? (diff >= 0 ? '#059669' : '#dc2626') : '#94a3b8';
      return '<tr style="background:#f8fafc">' +
        '<td class="kichu-label" style="color:#64748b;font-size:11px">' + escHtml(row.label) + '</td>' +
        '<td style="text-align:right;color:#64748b;font-size:11px">' + cur.toFixed(1) + '%</td>' +
        '<td style="text-align:right;color:#64748b;font-size:11px">' + (prev !== null ? prev.toFixed(1) + '%' : '—') + '</td>' +
        '<td style="text-align:right;font-size:11px;color:' + diffColor + '">' + diffStr + '</td>' +
        '<td></td>' +
      '</tr>';
    }
    cur  = curTotals[row.key]  || 0;
    prev = prevTotals ? (prevTotals[row.key] || 0) : null;
    var diff = prev !== null ? cur - prev : null;
    var p    = prev !== null ? pct(cur, prev) : '—';
    var diffColor = diff !== null ? (diff >= 0 ? '#059669' : '#dc2626') : '#94a3b8';
    return '<tr>' +
      '<td class="kichu-label' + boldCls + '">' + escHtml(row.label) + '</td>' +
      '<td class="' + boldCls + '" style="text-align:right">' + fmtK(cur) + '</td>' +
      '<td style="text-align:right;color:#64748b">' + (prev !== null ? fmtK(prev) : '—') + '</td>' +
      '<td style="text-align:right;color:' + diffColor + '">' + (diff !== null ? (diff >= 0 ? '+' : '') + fmtK(diff) : '—') + '</td>' +
      '<td style="text-align:right;color:' + diffColor + ';font-weight:600">' + p + '</td>' +
    '</tr>';
  }).join('');

  var noPrevNote = prevPL ? '' :
    '<div style="font-size:11px;background:#fff7ed;border-left:3px solid #f59e0b;padding:8px 12px;margin-bottom:12px;border-radius:4px">⚠️ 前期データ（' + (curYear-1) + '年度）が未登録のため前期比較列は表示できません。前期データを登録してください。</div>';

  container.innerHTML = `
    <div class="kichu-doc-title">${escHtml(company.name)} — 前期比較表</div>
    <div class="kichu-doc-sub">${curYear}年度　作成日: ${_kichuToday()}</div>
    ${noPrevNote}

    <div class="kichu-section">
      <div class="kichu-section-title">年間サマリー（当期 vs 前期）</div>
      <div style="font-size:10px;color:#64748b;margin-bottom:6px">単位：千円　当期着地予測（実績${actMon}か月＋残り予算）vs 前期実績</div>
      <div style="overflow-x:auto">
        <table class="kichu-table">
          <thead>
            <tr>
              <th class="kichu-label-th">科目</th>
              <th>当期着地（千円）</th>
              <th>前期実績（千円）</th>
              <th>増減額（千円）</th>
              <th>増減率</th>
            </tr>
          </thead>
          <tbody>${summaryRows}</tbody>
        </table>
      </div>
    </div>

    <div class="kichu-section">
      <div class="kichu-section-title">月次明細（上段: 当期 / 中段: 前期 / 下段: 増減）</div>
      <div style="font-size:10px;color:#64748b;margin-bottom:6px">単位：千円　青背景＝実績月</div>
      <div style="overflow-x:auto">
        <table class="kichu-table" style="font-size:11px">
          <thead><tr>${monthTh}</tr></thead>
          <tbody>${monthRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

// ===== ⑦ 決算対策提案書 =====
function renderKichuTaxPlanning(container, budget, company) {
  var curYear    = window.App ? window.App.currentYear : new Date().getFullYear();
  var pl         = getKichuPL(budget);
  if (!pl) { container.innerHTML = '<div class="no-data">データがありません</div>'; return; }

  var capital    = company.capital || 10000000;
  var isSmall    = capital <= 100000000; // 中小企業判定（1億円以下）
  var actualCols = getActualCols(budget);
  var actMon     = actualCols.filter(Boolean).length;
  var remainMon  = 12 - actMon;
  var startMonth = budget.startMonth || 4;
  var labels     = getMonthLabels(startMonth);

  var sum = function(arr) { return arr ? arr.reduce(function(a,v){ return a+(v||0); }, 0) : 0; };
  var landingPretax = sum(pl.pretax);
  var landingSales  = sum(pl.sales);
  var taxBreak = landingPretax > 0 ? calcAllTax(landingPretax, capital) : null;
  var currentTax = taxBreak ? taxBreak.total : 0;

  // 決算月ラベル
  var lastMonIdx  = (startMonth - 2 + 12) % 12; // 期末月インデックス（0-based暦月）
  var lastFisIdx  = 11; // 期末 = 第12月
  var lastMonLabel = labels[lastFisIdx];
  var endMonthCal  = ((startMonth - 1 + 11) % 12) + 1; // カレンダー上の決算月

  // 節税メニュー定義
  var measures = [];

  if (landingPretax > 0) {
    // 倒産防止共済
    var touson_max = Math.min(2400000, Math.floor(landingPretax * 0.5 / 200000) * 200000);
    if (touson_max > 0) {
      var touson_tax = calcAllTax(Math.max(0, landingPretax - touson_max), capital);
      measures.push({
        name: '経営セーフティ共済（倒産防止共済）',
        desc: '月額最大20万円・年間240万円まで損金算入。解約時は益金算入に注意。',
        limit: '年間240万円',
        amount: touson_max,
        taxSave: currentTax - (touson_tax ? touson_tax.total : 0),
        priority: 'high',
        deadline: '決算月末までに加入・掛金払込',
        note: '解約手当金は益金。40ヶ月以上加入で全額返戻。',
        isSmallOnly: false,
      });
    }

    // 決算賞与
    var bonus_est = Math.min(Math.floor(landingPretax * 0.3 / 100000) * 100000, 5000000);
    if (bonus_est > 0) {
      var bonus_tax = calcAllTax(Math.max(0, landingPretax - bonus_est), capital);
      measures.push({
        name: '決算賞与の支給',
        desc: '決算月末日までに全従業員へ通知・同時期支給で損金算入可。役員賞与は事前確定届出が必要。',
        limit: '上限なし（相当額）',
        amount: bonus_est,
        taxSave: currentTax - (bonus_tax ? bonus_tax.total : 0),
        priority: 'high',
        deadline: '決算日までに通知・支給（または未払計上）',
        note: '役員賞与は事前確定届出給与の届出が必要。従業員分は翌月末支払でも可。',
        isSmallOnly: false,
      });
    }

    // 少額減価償却（中小のみ）
    if (isSmall) {
      var shoug_est = Math.min(Math.floor(landingPretax * 0.15 / 300000) * 300000, 3000000);
      if (shoug_est > 0) {
        var shoug_tax = calcAllTax(Math.max(0, landingPretax - shoug_est), capital);
        measures.push({
          name: '少額減価償却資産の取得（30万円未満）',
          desc: '取得価額30万円未満の資産は全額即時損金算入（年間300万円上限）。決算前の設備購入で活用。',
          limit: '年間300万円',
          amount: shoug_est,
          taxSave: currentTax - (shoug_tax ? shoug_tax.total : 0),
          priority: 'mid',
          deadline: '決算日までに取得・事業供用',
          note: '中小企業者等の少額減価償却資産の特例（措法67条の5）。令和8年3月末まで。',
          isSmallOnly: true,
        });
      }
    }

    // 修繕費・前払費用
    var repair_est = Math.round(landingPretax * 0.05 / 100000) * 100000;
    if (repair_est > 200000) {
      measures.push({
        name: '修繕費・前払費用の計上',
        desc: '事務所・設備の修繕や保険料・リース料等の短期前払費用を計上。継続適用が条件。',
        limit: '実費・継続適用要件あり',
        amount: repair_est,
        taxSave: null,
        priority: 'mid',
        deadline: '決算日までに支出・契約',
        note: '短期前払費用は翌年以降も継続して同様の処理が必要。',
        isSmallOnly: false,
      });
    }

    // 不良在庫・貸倒引当金
    measures.push({
      name: '不良在庫・不良債権の評価損・貸倒処理',
      desc: '回収見込みのない売掛金の貸倒損失、陳腐化した棚卸資産の評価損を計上。',
      limit: '実態に応じて',
      amount: null,
      taxSave: null,
      priority: 'mid',
      deadline: '決算日まで',
      note: '税務上の要件（事実上の貸倒等）を満たすか顧問税理士と確認。',
      isSmallOnly: false,
    });

    // 小規模企業共済
    if (isSmall) {
      measures.push({
        name: '小規模企業共済（個人向け）',
        desc: '経営者個人の掛金（月最大7万円・年84万円）が全額所得控除。役員報酬と組み合わせると効果的。',
        limit: '月7万円（年84万円）',
        amount: 840000,
        taxSave: null,
        priority: 'low',
        deadline: '加入は随時。掛金は月払い。',
        note: '法人の損金ではなく経営者個人の所得控除。役員報酬最適化とセットで検討。',
        isSmallOnly: true,
      });
    }
  }

  // 利益が少ない・赤字の場合
  if (landingPretax <= 0) {
    measures.push({
      name: '繰越欠損金の確認',
      desc: '当期が赤字の場合、翌期以降10年間繰越可能。過去の黒字と通算できなかった欠損金の確認を。',
      limit: '翌期以降10年間',
      amount: null,
      taxSave: null,
      priority: 'high',
      deadline: '申告時に確認',
      note: '繰越欠損金は法人税申告書別表七(一)で管理。',
      isSmallOnly: false,
    });
    measures.push({
      name: '中間納付の還付確認',
      desc: '中間納付額が確定税額を超える場合は還付申請が可能。資金繰りへの影響を確認。',
      limit: '—',
      amount: null,
      taxSave: null,
      priority: 'high',
      deadline: '申告書提出時',
      note: '',
      isSmallOnly: false,
    });
  }

  var priorityLabel = { high: '優先度：高', mid: '優先度：中', low: '優先度：低' };
  var priorityColor = { high: '#dc2626', mid: '#d97706', low: '#64748b' };
  var priorityBg    = { high: '#fef2f2', mid: '#fffbeb', low: '#f8fafc' };

  var measureCards = measures.map(function(m) {
    var amtHtml = m.amount ? '<span style="font-size:13px;font-weight:600;color:#1e40af">' + fmtK(m.amount) + '千円の損金算入目安</span>' : '';
    var taxHtml = m.taxSave && m.taxSave > 0
      ? '<span style="font-size:12px;color:#059669">→ 概算節税効果: <strong>' + fmtK(m.taxSave) + '千円</strong></span>'
      : '';
    return `
      <div style="background:${priorityBg[m.priority]};border:0.5px solid ${priorityColor[m.priority]}44;border-left:4px solid ${priorityColor[m.priority]};border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:10px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px">
          <div style="font-size:14px;font-weight:600;color:#1e293b">${escHtml(m.name)}</div>
          <div style="font-size:10px;color:${priorityColor[m.priority]};background:${priorityColor[m.priority]}18;padding:2px 8px;border-radius:99px;white-space:nowrap;flex-shrink:0">${priorityLabel[m.priority]}</div>
        </div>
        <div style="font-size:12px;color:#475569;line-height:1.6;margin-bottom:6px">${escHtml(m.desc)}</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:4px">
          ${amtHtml}
          ${taxHtml}
        </div>
        <div style="font-size:11px;color:#64748b;display:flex;gap:16px;flex-wrap:wrap">
          <span>⏰ ${escHtml(m.deadline)}</span>
          <span>上限: ${escHtml(m.limit)}</span>
        </div>
        ${m.note ? '<div style="font-size:10px;color:#94a3b8;margin-top:4px">※ ' + escHtml(m.note) + '</div>' : ''}
      </div>`;
  }).join('');

  var lastActLabel = actMon > 0 ? labels[actMon - 1] : '—';
  var companyId = company.id || 'default';
  var advKey2   = 'taxplan_advice_' + companyId + '_' + curYear;
  var advText2  = localStorage.getItem(advKey2) || '';

  container.innerHTML = `
    <div class="kichu-doc-title">${escHtml(company.name)} — 決算対策提案書</div>
    <div class="kichu-doc-sub">${curYear}年度　作成日: ${_kichuToday()}</div>

    <div class="kichu-section">
      <div class="kichu-summary-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
        <div class="kichu-summary-card">
          <div class="kichu-summary-label">着地予測 税引前利益</div>
          <div class="kichu-summary-val ${landingPretax >= 0 ? 'positive' : 'negative'}">${fmtK(landingPretax)}千円</div>
        </div>
        <div class="kichu-summary-card">
          <div class="kichu-summary-label">現状の概算税額</div>
          <div class="kichu-summary-val ${currentTax > 0 ? 'negative' : ''}">${fmtK(currentTax)}千円</div>
        </div>
        <div class="kichu-summary-card">
          <div class="kichu-summary-label">実績確定済み</div>
          <div class="kichu-summary-val">${actMon}か月（〜${lastActLabel}）</div>
        </div>
        <div class="kichu-summary-card" style="border-color:#ef4444;border-width:2px">
          <div class="kichu-summary-label">決算まで残り</div>
          <div class="kichu-summary-val" style="color:#dc2626">${remainMon}か月</div>
        </div>
      </div>
    </div>

    <div class="kichu-section">
      <div class="kichu-section-title">今期実施可能な決算対策</div>
      <div style="font-size:11px;color:#64748b;margin-bottom:12px">
        ※ 金額はすべて概算・参考値です。各対策の節税効果は独立計算のため合計できません。実施前に必ず詳細を確認してください。
      </div>
      ${measureCards || '<div class="no-data-small">該当する対策項目がありません</div>'}
    </div>

    <div class="kichu-section">
      <div class="kichu-section-title">税理士コメント・追加対策メモ</div>
      <textarea class="kichu-advice-area" id="kichu_taxplan_advice"
        placeholder="個別の対策案・顧問先へのメモを入力..."
        onblur="localStorage.setItem('${advKey2}', this.value)"
      >${escHtml(advText2)}</textarea>
    </div>
  `;
}
