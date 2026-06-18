// ===== 期中成果物出力 (kichu-output.js) =====
// Entry: showKichuOutput(type) where type = 'monthly' | 'cashflow' | 'forecast' | 'execcomp'

window._kichuCharts = {};

function showKichuOutput(type) {
  const modal = document.getElementById('kichu_output_modal');
  const body  = document.getElementById('kichu_output_body');
  const title = document.getElementById('kichu_output_title');
  if (!modal) return;
  const titles = {
    monthly:   '月次業績報告書',
    cashflow:  '資金繰り予測表',
    forecast:  '着地予測・税金概算',
    execcomp:  '役員報酬提案書',
    socialins: '社会保険試算'
  };
  title.textContent = titles[type] || type;
  modal.style.display = 'block';
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
  if (type === 'monthly')   renderKichuMonthly(container, budget, company);
  if (type === 'cashflow')  renderKichuCashflow(container, budget, company);
  if (type === 'forecast')  renderKichuForecast(container, budget, company);
  if (type === 'execcomp')  renderKichuExecComp(container, budget, company);
  if (type === 'socialins') renderKichuSocialIns(container, budget, company);
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
function renderKichuCashflow(container, budget, company) {
  var pl = getKichuPL(budget);
  if (!pl) { container.innerHTML = '<div class="no-data">データがありません</div>'; return; }

  var startMonth = budget.startMonth || 4;
  var labels     = getMonthLabels(startMonth);
  var curYear    = window.App ? window.App.currentYear : new Date().getFullYear();
  var companyId  = company.id || 'default';
  var lsKey      = 'kichu_cf_' + companyId + '_' + curYear;
  var startCash  = parseFloat(localStorage.getItem(lsKey) || '0') * 1000; // stored in 千円, convert to 円

  // Build monthly data
  var monthData = [];
  var cumCF = 0;
  for (var i = 0; i < 12; i++) {
    var ord = pl.ord[i] || 0;
    var cf  = Math.round(ord * 0.662);
    cumCF += cf;
    monthData.push({ label: labels[i], ord: ord, cf: cf, cumCF: cumCF, endCash: startCash + cumCF });
  }

  var tableRows = monthData.map(function(d) {
    return '<tr>' +
      '<td class="kichu-label">' + escHtml(d.label) + '</td>' +
      '<td class="' + (d.ord < 0 ? 'kichu-neg' : '') + '">' + fmtK(d.ord) + '</td>' +
      '<td class="' + (d.cf  < 0 ? 'kichu-neg' : '') + '">' + fmtK(d.cf)  + '</td>' +
      '<td class="' + (d.cumCF < 0 ? 'kichu-neg' : '') + '">' + fmtK(d.cumCF) + '</td>' +
      '<td class="' + (d.endCash < 0 ? 'kichu-neg kichu-bold' : 'kichu-bold') + '">' + fmtK(d.endCash) + '</td>' +
    '</tr>';
  }).join('');

  var canvasId = 'kichu_cf_chart_' + Date.now();

  container.innerHTML = `
    <div class="kichu-doc-title">${escHtml(company.name)} — 資金繰り予測表</div>
    <div class="kichu-doc-sub">${curYear}年度　作成日: ${_kichuToday()}</div>

    <div class="kichu-section">
      <div class="kichu-section-title">期首現預金残高</div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <input type="number" id="kichu_cf_startcash" class="form-input" style="width:200px"
          placeholder="0" value="${parseFloat(localStorage.getItem(lsKey) || '0')}"
          onchange="localStorage.setItem('${lsKey}', this.value||'0'); renderKichuOutput('cashflow', document.getElementById('kichu_output_body'))">
        <span style="font-size:12px;color:var(--text-muted)">千円（入力後Enterまたはタブで反映）</span>
      </div>
    </div>

    <div class="kichu-section">
      <div style="overflow-x:auto">
        <table class="kichu-table">
          <thead>
            <tr>
              <th class="kichu-label-th">月</th>
              <th>経常利益（千円）</th>
              <th>推定CF（千円）</th>
              <th>累計CF（千円）</th>
              <th>推定期末現預金（千円）</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>

    <div class="kichu-section">
      <div class="kichu-section-title">現預金残高推移</div>
      <canvas id="${canvasId}" style="max-height:260px"></canvas>
    </div>

    <div style="font-size:11px;color:#64748b;border-top:1px solid var(--border);padding-top:10px;margin-top:8px">
      ※ 推定CFは経常利益×66.2%の簡易計算です。詳細な資金繰りは別途ご確認ください。
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
            data: monthData.map(function(d){ return d.endCash / 1000; }),
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
          y: {
            ticks: { callback: function(v){ return v.toLocaleString() + '千'; } }
          }
        }
      }
    });
  }
}

// ===== ③ 着地予測・税金概算 =====
function renderKichuForecast(container, budget, company) {
  var pl = getKichuPL(budget);
  if (!pl) { container.innerHTML = '<div class="no-data">データがありません</div>'; return; }

  var actualThrough = budget.actualThrough != null ? budget.actualThrough : -1;
  var startMonth    = budget.startMonth || 4;
  var labels        = getMonthLabels(startMonth);
  var curYear       = window.App ? window.App.currentYear : new Date().getFullYear();
  var capital       = company.capital || 10000000;

  // Landing forecast = sum all 12 months (actual months already contain actual data)
  var annualPretax = _kichuSum(pl.pretax);
  var annualNet    = _kichuSum(pl.net);
  var annualOp     = _kichuSum(pl.op);
  var annualSales  = _kichuSum(pl.sales);

  // Budget = same (in this app budget.rows is the only source)
  var budgetPretax = annualPretax;

  // Actual cumulative
  var actualCumPretax = actualThrough >= 0
    ? pl.pretax.slice(0, actualThrough + 1).reduce(function(a,v){ return a+(v||0); }, 0)
    : 0;

  // 純予算PL（比較用: 実績に関係なく予算入力値のみ）
  var budgetOnlyPL = getKichuBudgetPL(budget);
  var budgetAnnualPretax = budgetOnlyPL ? _kichuSum(budgetOnlyPL.pretax) : annualPretax;
  var budgetAnnualNet    = budgetOnlyPL ? _kichuSum(budgetOnlyPL.net)    : annualNet;

  // 実績累計（actualThrough月まで）
  var actualCumPretax = actualThrough >= 0
    ? pl.pretax.slice(0, actualThrough + 1).reduce(function(a,v){ return a+(v||0); }, 0) : null;
  var actualCumSales = actualThrough >= 0
    ? pl.sales.slice(0, actualThrough + 1).reduce(function(a,v){ return a+(v||0); }, 0) : null;

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
    var isActual = i <= actualThrough;
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
        ${actualThrough >= 0 ? `
        <div class="kichu-summary-card">
          <div class="kichu-summary-label">実績累計（${labels[actualThrough]}まで ${actualThrough+1}か月）</div>
          <div class="kichu-summary-val ${actualCumPretax >= 0 ? 'positive' : 'negative'}">${fmtK(actualCumPretax)}千円</div>
        </div>` : `
        <div class="kichu-summary-card" style="opacity:.45">
          <div class="kichu-summary-label">実績累計</div>
          <div class="kichu-summary-val" style="font-size:13px;color:var(--text-muted)">実績インポート待ち</div>
        </div>`}
        <div class="kichu-summary-card" style="border-color:#3b82f6;border-width:2px">
          <div class="kichu-summary-label">着地予測利益（税引前）${actualThrough >= 0 ? '<br><span style="font-size:9px;color:#3b82f6">実績'+labels[actualThrough]+'まで＋残り予算</span>' : ''}</div>
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
                <th>${actualThrough >= 0 ? '実績／予算（千円）<br><span style="font-weight:400;font-size:9px">🔵実績 ⬜予算</span>' : '予算（千円）'}</th>
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
    var kenpoRate = (KENPO[pref] || 10.00) / 100;
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

  var prefOptions = Object.keys(KENPO).map(function(p) {
    return '<option value="' + p + '"' + (p === '東京' ? ' selected' : '') + '>' + p + '</option>';
  }).join('');

  var lsKey = 'socialins_' + (company.id||'') + '_' + curYear;
  var saved = JSON.parse(localStorage.getItem(lsKey) || '{}');

  var defaultComp  = saved.monthlyComp  || (company.execComp || 500000);
  var defaultPref  = saved.pref         || '東京';
  var defaultKaigo = saved.kaigo != null ? saved.kaigo : true;
  var defaultBonus = saved.bonusAmt     || 0;

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
