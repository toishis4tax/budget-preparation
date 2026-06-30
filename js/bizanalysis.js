// 3期比較経営分析表

function extractBizMetrics(budget, company) {
  if (!budget) return null;
  let av;
  try {
    av = budget.dynamicAccounts ? calcAllValuesDynamic(budget) : calcAllValues(budget.rows);
  } catch(e) { return null; }
  const sum = id => ((av[id] || []).reduce((a, v) => a + v, 0));

  let sales, cogs, gross, sga, op, otherInc, otherExp, ord, pretax, net;

  if (budget.dynamicAccounts) {
    sales    = sum('sec_revenue');
    cogs     = sum('sec_cogs');
    gross    = sum('calc_gross');
    sga      = sum('sec_sga');
    op       = sum('calc_op');
    otherInc = sum('sec_non_op_inc');
    otherExp = sum('sec_non_op_exp');
    ord      = sum('calc_ord');
    pretax   = sum('calc_pretax');
    net      = sum('calc_net');
  } else {
    try {
      const pl = calcPL(budget.rows);
      const s12 = arr => (arr || []).reduce((a, v) => a + v, 0);
      sales  = s12(pl.sales);
      cogs   = s12(pl.cogs);
      gross  = s12(pl.gross_profit);
      sga    = s12(pl.sga);
      op     = s12(pl.op_profit);
      ord    = s12(pl.ord_profit);
      pretax = s12(pl.pretax_profit);
      net    = s12(pl.net_profit);
      otherInc = 0; otherExp = 0;
    } catch(e) { return null; }
  }

  const marginalProfit = gross;
  const fixedCost      = sga;
  const employees      = budget.employees || company.employees || 1;
  const cf             = pretax > 0 ? Math.round(pretax * 0.662) : pretax;

  let currentRatio = 0, equityRatio = 0, debtMonthRatio = 0;
  try {
    const hm = calcHealthMetrics(budget.rows || {}, company.capital || 10_000_000);
    currentRatio   = hm.current_ratio   || 0;
    equityRatio    = hm.equity_ratio    || 0;
    debtMonthRatio = hm.loan_month_ratio || 0;
  } catch(e) {}

  const marginRate = sales > 0 ? marginalProfit / sales : 0;
  const breakEven  = marginRate > 0 ? Math.round(fixedCost / marginRate) : 0;

  return {
    sales, cogs, gross, sga, op, ord, pretax, net,
    marginalProfit, fixedCost, cf, employees,
    currentRatio, equityRatio, debtMonthRatio,
    breakEven, marginRate,
  };
}

function renderBizAnalysis(container) {
  const company = window.App?.currentCompany;
  const curYear = window.App?.currentYear || new Date().getFullYear();

  if (!company) {
    container.innerHTML = '<div class="no-data">会社を選択してください</div>';
    return;
  }

  const budgetCur  = window.App?.currentBudget;
  const budgetPrev = getBudget(company.id, curYear - 1);
  const budgetPrev2= getBudget(company.id, curYear - 2);

  const mCur  = extractBizMetrics(budgetCur,  company);
  const mPrev = extractBizMetrics(budgetPrev, company);
  const mPrev2= extractBizMetrics(budgetPrev2,company);

  // ===== ヘルパー =====
  const K = v => (v == null ? null : Math.round(v / 1000));
  const pct = v => (v == null ? null : (v * 100));
  const fmtV = (v, decimals, suffix) => {
    if (v == null || isNaN(v)) return '<span class="biz-nodata">—</span>';
    const n = decimals != null ? v.toFixed(decimals) : Math.round(v).toLocaleString('ja-JP');
    return n + (suffix || '');
  };
  const fmtDiff = (cur, prev, decimals, suffix) => {
    if (cur == null || prev == null) return '<span class="biz-nodata">—</span>';
    const d = cur - prev;
    const sign = d >= 0 ? '+' : '';
    const cls  = d >= 0 ? 'biz-diff-pos' : 'biz-diff-neg';
    const n    = decimals != null ? d.toFixed(decimals) : Math.round(d).toLocaleString('ja-JP');
    return `<span class="${cls}">${sign}${n}${suffix || ''}</span>`;
  };

  // 対前年売上高比率
  const salesGrowthPrev  = (mPrev  && mPrev2 && mPrev2.sales > 0) ? pct(mPrev.sales  / mPrev2.sales  - 1) : null;
  const salesGrowthCur   = (mCur   && mPrev  && mPrev.sales  > 0) ? pct(mCur.sales   / mPrev.sales   - 1) : null;

  // 固定費増加率
  const fixedGrowthPrev  = (mPrev  && mPrev2 && mPrev2.fixedCost > 0) ? pct(mPrev.fixedCost  / mPrev2.fixedCost  - 1) : null;
  const fixedGrowthCur   = (mCur   && mPrev  && mPrev.fixedCost  > 0) ? pct(mCur.fixedCost   / mPrev.fixedCost   - 1) : null;

  // 売上高経常利益率
  const ordRatePrev2 = (mPrev2 && mPrev2.sales > 0) ? pct(mPrev2.ord / mPrev2.sales) : null;
  const ordRatePrev  = (mPrev  && mPrev.sales  > 0) ? pct(mPrev.ord  / mPrev.sales)  : null;
  const ordRateCur   = (mCur   && mCur.sales   > 0) ? pct(mCur.ord   / mCur.sales)   : null;

  // 1人当たり各種
  const perEmpSalesPrev2  = mPrev2 ? K(mPrev2.sales          / (mPrev2.employees || 1)) : null;
  const perEmpSalesPrev   = mPrev  ? K(mPrev.sales           / (mPrev.employees  || 1)) : null;
  const perEmpSalesCur    = mCur   ? K(mCur.sales            / (mCur.employees   || 1)) : null;
  const perEmpMargPrev2   = mPrev2 ? K(mPrev2.marginalProfit / (mPrev2.employees || 1)) : null;
  const perEmpMargPrev    = mPrev  ? K(mPrev.marginalProfit  / (mPrev.employees  || 1)) : null;
  const perEmpMargCur     = mCur   ? K(mCur.marginalProfit   / (mCur.employees   || 1)) : null;
  const perEmpOrdPrev2    = mPrev2 ? K(mPrev2.ord            / (mPrev2.employees || 1)) : null;
  const perEmpOrdPrev     = mPrev  ? K(mPrev.ord             / (mPrev.employees  || 1)) : null;
  const perEmpOrdCur      = mCur   ? K(mCur.ord              / (mCur.employees   || 1)) : null;

  // ===== PL サマリー =====
  const plRow = (label, getVal) => {
    const v2 = getVal(mPrev2);
    const v1 = getVal(mPrev);
    const v0 = getVal(mCur);
    const yoy1 = (v1 != null && v2 != null && v2 !== 0) ? ((v1 - v2) / Math.abs(v2) * 100).toFixed(1) + '%' : '—';
    const yoy0 = (v0 != null && v1 != null && v1 !== 0) ? ((v0 - v1) / Math.abs(v1) * 100).toFixed(1) + '%' : '—';
    return `<tr>
      <td>${label}</td>
      <td class="num">${v2 != null ? Math.round(v2/1000).toLocaleString('ja-JP') : '—'}</td>
      <td class="num">${v1 != null ? Math.round(v1/1000).toLocaleString('ja-JP') : '—'}</td>
      <td class="num">${v0 != null ? Math.round(v0/1000).toLocaleString('ja-JP') : '—'}</td>
      <td class="num">${yoy1}</td>
      <td class="num">${yoy0}</td>
    </tr>`;
  };

  // ===== 分析行ヘルパー =====
  const anaRow = (label, v2, v1, v0, decimals, suffix, formula) => `<tr>
    <td>${label}${formula ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px;line-height:1.4">${formula}</div>` : ''}</td>
    <td class="num">${fmtV(v2, decimals, suffix)}</td>
    <td class="num">${fmtV(v1, decimals, suffix)}</td>
    <td class="num">${fmtV(v0, decimals, suffix)}</td>
    <td class="num">${fmtDiff(v1, v2, decimals, suffix)}</td>
    <td class="num">${fmtDiff(v0, v1, decimals, suffix)}</td>
  </tr>`;

  const yr2 = curYear - 2;
  const yr1 = curYear - 1;
  const yr0 = curYear;

  container.innerHTML = `
    <div class="bizanalysis-wrap">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:4px">
        <div>
          <div style="font-size:20px;font-weight:800;color:var(--text)">📊 3期比較経営分析表</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${escHtml(company.name)} ／ ${yr2}年度〜${yr0}年度</div>
        </div>
      </div>

      <!-- PL サマリー -->
      <div class="bizanalysis-section">
        <div class="bizanalysis-section-title">📋 損益サマリー（3期比較）</div>
        <div style="overflow-x:auto">
          <table class="result-table yr3-table" style="width:100%;font-size:12px">
            <thead>
              <tr>
                <th style="min-width:140px">科目</th>
                <th>${yr2}年度（千円）</th>
                <th>${yr1}年度（千円）</th>
                <th>${yr0}年度（千円）</th>
                <th>対前期比<br>${yr2}→${yr1}</th>
                <th>対前期比<br>${yr1}→${yr0}</th>
              </tr>
            </thead>
            <tbody>
              ${plRow('売上高',         m => m?.sales)}
              ${plRow('売上総利益',     m => m?.gross)}
              ${plRow('営業利益',       m => m?.op)}
              ${plRow('経常利益',       m => m?.ord)}
              ${plRow('当期純利益',     m => m?.net)}
            </tbody>
          </table>
        </div>
        <div class="wf-note">単位：千円</div>
      </div>

      <!-- ① 収益性 -->
      <div class="bizanalysis-section">
        <div class="bizanalysis-section-title">① 収益性</div>
        <div style="overflow-x:auto">
          <table class="result-table yr3-table" style="width:100%;font-size:12px">
            <thead>
              <tr>
                <th style="min-width:200px">指標</th>
                <th>${yr2}年度</th>
                <th>${yr1}年度</th>
                <th>${yr0}年度<br>（予算）</th>
                <th>差異<br>${yr2}→${yr1}</th>
                <th>差異<br>${yr1}→${yr0}</th>
              </tr>
            </thead>
            <tbody>
              ${anaRow('対前年売上高比率（%）', null, salesGrowthPrev != null ? salesGrowthPrev : null, salesGrowthCur != null ? salesGrowthCur : null, 1, '%', '（当期売上 − 前期売上）÷ 前期売上')}
              ${anaRow('限界利益率（%）',
                mPrev2 ? pct(mPrev2.marginRate) : null,
                mPrev  ? pct(mPrev.marginRate)  : null,
                mCur   ? pct(mCur.marginRate)   : null,
                1, '%', '限界利益 ÷ 売上高')}
              ${anaRow('売上高経常利益率（%）', ordRatePrev2, ordRatePrev, ordRateCur, 1, '%', '経常利益 ÷ 売上高')}
              ${anaRow('固定費増加率（%）', null, fixedGrowthPrev, fixedGrowthCur, 1, '%', '（当期固定費 − 前期固定費）÷ 前期固定費')}
              ${anaRow('損益分岐点売上高（千円）',
                mPrev2 ? K(mPrev2.breakEven) : null,
                mPrev  ? K(mPrev.breakEven)  : null,
                mCur   ? K(mCur.breakEven)   : null,
                null, '', '固定費 ÷ 限界利益率')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- ② 運転資金・生産性 -->
      <div class="bizanalysis-section">
        <div class="bizanalysis-section-title">② 運転資金・生産性</div>
        <div style="overflow-x:auto">
          <table class="result-table yr3-table" style="width:100%;font-size:12px">
            <thead>
              <tr>
                <th style="min-width:200px">指標</th>
                <th>${yr2}年度</th>
                <th>${yr1}年度</th>
                <th>${yr0}年度<br>（予算）</th>
                <th>差異<br>${yr2}→${yr1}</th>
                <th>差異<br>${yr1}→${yr0}</th>
              </tr>
            </thead>
            <tbody>
              ${anaRow('キャッシュ・フロー（千円）',
                mPrev2 ? K(mPrev2.cf) : null,
                mPrev  ? K(mPrev.cf)  : null,
                mCur   ? K(mCur.cf)   : null,
                null, '', '税引前利益 × 66.2%（簡易CF）')}
              ${anaRow('1人当り売上高（千円）',   perEmpSalesPrev2, perEmpSalesPrev, perEmpSalesCur, null, '', '売上高 ÷ 従業員数')}
              ${anaRow('1人当り限界利益（千円）', perEmpMargPrev2,  perEmpMargPrev,  perEmpMargCur,  null, '', '限界利益 ÷ 従業員数')}
              ${anaRow('1人当り経常利益（千円）', perEmpOrdPrev2,   perEmpOrdPrev,   perEmpOrdCur,   null, '', '経常利益 ÷ 従業員数')}
              ${anaRow('平均従業員数（人）',
                mPrev2?.employees || null,
                mPrev?.employees  || null,
                mCur?.employees   || null,
                null, '', '会社設定より')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- ③ 安全性 -->
      <div class="bizanalysis-section">
        <div class="bizanalysis-section-title">③ 安全性</div>
        <div style="overflow-x:auto">
          <table class="result-table yr3-table" style="width:100%;font-size:12px">
            <thead>
              <tr>
                <th style="min-width:200px">指標</th>
                <th>${yr2}年度</th>
                <th>${yr1}年度</th>
                <th>${yr0}年度<br>（予算）</th>
                <th>差異<br>${yr2}→${yr1}</th>
                <th>差異<br>${yr1}→${yr0}</th>
              </tr>
            </thead>
            <tbody>
              ${anaRow('流動比率（%）',
                mPrev2?.currentRatio   || null,
                mPrev?.currentRatio    || null,
                mCur?.currentRatio     || null,
                1, '%', '流動資産 ÷ 流動負債')}
              ${anaRow('借入金対月商倍率（倍）',
                mPrev2?.debtMonthRatio || null,
                mPrev?.debtMonthRatio  || null,
                mCur?.debtMonthRatio   || null,
                1, '倍', '借入金残高 ÷ 月商（売上高 ÷ 12）')}
              ${anaRow('自己資本比率（%）',
                mPrev2?.equityRatio    || null,
                mPrev?.equityRatio     || null,
                mCur?.equityRatio      || null,
                1, '%', '自己資本 ÷ 総資産')}
            </tbody>
          </table>
        </div>
        <div class="wf-note">※安全性指標はBSデータが必要です。Mirokuからインポートすると自動計算されます。</div>
      </div>
    </div>
  `;
}
