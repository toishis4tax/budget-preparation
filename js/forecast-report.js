// ===== 当期決算予測報告書 =====

function _frCalcDetailedTax(pretax, capital) {
  if (!pretax || pretax <= 0) return null;
  // calcAllTax と同じロジック（法人税概算ページと一致）
  const base      = Math.floor(pretax / 1000) * 1000;
  const corp      = calcCorpTax(base, capital);
  const localCorp = calcLocalCorpTax(corp);
  // 住民税を都道府県・市町村に分割
  const prefWari  = Math.floor(corp * 0.032 / 100) * 100;
  const cityWari  = Math.floor(corp * 0.096 / 100) * 100;
  const { income: business, special } = calcBusinessTax(base, capital);
  return {
    corp, localCorp,
    pref: prefWari + 20000,   // 均等割2万 + 法人税割
    city: cityWari + 50000,   // 均等割5万 + 法人税割
    business, special,
    // inhabitant合計（法人税概算の「法人住民税」と一致）
    inhabitant: prefWari + cityWari + 70000,
  };
}

function renderForecastReport(container) {
  const company  = window.App?.currentCompany;
  const budget   = window.App?.currentBudget;
  const curYear  = window.App?.currentYear || new Date().getFullYear();

  if (!company || !budget) {
    container.innerHTML = '<div class="no-data">会社と年度を選択してください</div>';
    return;
  }

  const startMonth  = budget.startMonth || 4;
  const fiscalMonth = company.fiscalMonth || 3;
  const capital     = company.capital || 10_000_000;
  const actualCols  = budget.actualCols || [];

  const actIdxs  = actualCols.map((v, i) => v ? i : -1).filter(i => i >= 0);
  const fcstIdxs = Array.from({length: 12}, (_, i) => i).filter(i => !actualCols[i]);
  const calM     = i => ((startMonth - 1 + i) % 12) + 1;

  const actRange  = actIdxs.length > 0
    ? `${calM(actIdxs[0])}月〜${calM(actIdxs[actIdxs.length - 1])}月` : '実績なし';
  const fcstRange = fcstIdxs.length > 0
    ? `${calM(fcstIdxs[0])}月〜${calM(fcstIdxs[fcstIdxs.length - 1])}月` : '—';

  const av      = budget.dynamicAccounts ? calcAllValuesDynamic(budget) : calcAllValues(budget.rows || {});
  const sumAct  = arr => actIdxs.reduce((s, i) => s + (arr?.[i] || 0), 0);
  const sumFcst = arr => fcstIdxs.reduce((s, i) => s + (arr?.[i] || 0), 0);

  const getArr = (...keys) => {
    for (const k of keys) { const a = av[k]; if (a?.some(v => v !== 0)) return a; }
    return new Array(12).fill(0);
  };

  // 人件費: 動的科目の場合は名前で探す、静的の場合はsga_salary
  const getLaborArr = () => {
    if (budget.dynamicAccounts) {
      const LABOR_RE = /給与|給料|賃金|役員報酬|役員賞与|賞与|法定福利|福利厚生|厚生費|福利費|雑給|人件費|退職|手当/;
      // 親科目（indent<=1）のみ対象。補助科目（indent>=2）は親に集計済みなので除外し二重計上を防ぐ
      const matched = budget.dynamicAccounts.filter(a =>
        a.section?.startsWith('pl') &&
        a.type !== 'section' &&
        (a.indent ?? 1) <= 1 &&
        LABOR_RE.test(a.name)
      );
      if (matched.length > 0) {
        const sum = new Array(12).fill(0);
        matched.forEach(a => {
          const vals = av[a.id] || [];
          vals.slice(0, 12).forEach((v, i) => { sum[i] += v || 0; });
        });
        if (sum.some(v => v !== 0)) return sum;
      }
    }
    return getArr('sga_salary');
  };

  const salesArr  = getArr('sec_revenue', 'sales');
  const grossArr  = getArr('calc_gross', 'gross_profit');
  const laborArr  = getLaborArr();
  const ordArr    = getArr('calc_ord', 'ord_profit');
  const netArr    = getArr('calc_net', 'net_profit');
  const pretaxArr = getArr('calc_pretax', 'pretax_profit');

  const aS = sumAct(salesArr),  fS = sumFcst(salesArr),  tS = aS + fS;
  const aG = sumAct(grossArr),  fG = sumFcst(grossArr),  tG = aG + fG;
  const aL = sumAct(laborArr),  fL = sumFcst(laborArr),  tL = aL + fL;
  const aO = sumAct(ordArr),    fO = sumFcst(ordArr),    tO = aO + fO;
  const aN = sumAct(netArr),    fN = sumFcst(netArr),    tN = aN + fN;
  const landPretax = sumAct(pretaxArr) + sumFcst(pretaxArr);

  // 前期
  const prevBudget = getBudget(company.id, curYear - 1);
  const prevAv = prevBudget
    ? (prevBudget.dynamicAccounts ? calcAllValuesDynamic(prevBudget) : calcAllValues(prevBudget.rows || {}))
    : null;
  const pSum = (...keys) => {
    if (!prevAv) return null;
    for (const k of keys) { const a = prevAv[k]; if (a?.some(v => v !== 0)) return a.slice(0,12).reduce((s,v)=>s+v,0); }
    return null;
  };
  const pS = pSum('sec_revenue','sales');
  const pG = pSum('calc_gross','gross_profit');
  const pL = pSum('sec_sga','sga_salary');
  const pO = pSum('calc_ord','ord_profit');
  const pN = pSum('calc_net','net_profit');
  const pPretax = pSum('calc_pretax','pretax_profit');

  // 税額
  const tax     = _frCalcDetailedTax(landPretax, capital);
  const prevTax = _frCalcDetailedTax(pPretax, capital);
  // 消費税：簡易課税届出ありなら③簡易課税計算、なければ②科目別簡易計算
  const useKani  = !!(company?.kanijukazei);
  let ctaxAmt, prevCtaxAmt;
  if (useKani && typeof _kaniCtaxTotal === 'function') {
    ctaxAmt     = _kaniCtaxTotal(budget, company, curYear);
    prevCtaxAmt = prevBudget ? _kaniCtaxTotal(prevBudget, company, curYear - 1) : 0;
  } else {
    const ctaxAcct     = (typeof _ctaxAcctCalc === 'function') ? _ctaxAcctCalc(budget, company) : null;
    const prevCtaxAcct = (prevBudget && typeof _ctaxAcctCalc === 'function') ? _ctaxAcctCalc(prevBudget, company) : null;
    ctaxAmt     = ctaxAcct ? Math.round(ctaxAcct.ctax) : 0;
    prevCtaxAmt = prevCtaxAcct ? Math.round(prevCtaxAcct.ctax) : 0;
  }

  // 中間納付：taxsummary_v1 から読み込み（消費税ページの入力値と連動）
  const corpPrepaid = parseFloat(document.getElementById('tax_prepaid1')?.value) || company.prepaid1 || 0;
  const tsaved = (typeof loadTaxSummaryData === 'function') ? loadTaxSummaryData(company?.id, curYear) : {};
  const ctaxPrepaid = (parseFloat(tsaved['i_ctax']) || 0) + (parseFloat(tsaved['i_localCtax']) || 0) || company.ctaxPrepaid || 0;

  const taxRows = [
    { label: '法人税・地方法人税',     annual: tax ? tax.corp + tax.localCorp : 0, prepaid: corpPrepaid, prev: prevTax ? prevTax.corp + prevTax.localCorp : 0 },
    { label: '都 道 府 県 民 税',      annual: tax ? tax.pref : 0,                  prepaid: 0,          prev: prevTax ? prevTax.pref : 0 },
    { label: '市 町 村 民 税',         annual: tax ? tax.city : 0,                  prepaid: 0,          prev: prevTax ? prevTax.city : 0 },
    { label: '事業税・特別法人事業税', annual: tax ? tax.business + tax.special : 0, prepaid: 0,         prev: prevTax ? prevTax.business + prevTax.special : 0 },
    { label: '消　費　税　等',         annual: ctaxAmt,                              prepaid: ctaxPrepaid, prev: prevCtaxAmt },
  ];
  const totalAnnual  = taxRows.reduce((s, r) => s + r.annual, 0);
  const totalPrepaid = taxRows.reduce((s, r) => s + r.prepaid, 0);
  const totalPrev    = taxRows.reduce((s, r) => s + r.prev, 0);

  // フォーマット
  const K    = v => v == null ? '—' : Math.round(v/1000).toLocaleString('ja-JP');
  const pct  = (v, b) => (!b || b === 0) ? '' : `${(v/b*100).toFixed(1)}%`;
  const yoy  = (c, p) => (p == null || p === 0) ? '' : `${(c/p*100).toFixed(1)}%`;
  const neg  = v => v < 0 ? 'fr-neg' : '';

  // インタビュー日
  const FR_KEY = 'forecast_report_v1';
  const frData = JSON.parse(localStorage.getItem(FR_KEY) || '{}');
  const interviewDate = frData[`${company.id}_${curYear}`]?.interviewDate || '';

  const fyS = startMonth;
  const fyE = fiscalMonth;
  // 期首年・期末年（西暦）
  const fyStartYear = fyS <= fyE ? curYear - 1 : curYear - 1;
  const fyEndYear   = curYear;
  const lastD = new Date(fyEndYear, fyE, 0).getDate();

  container.innerHTML = `
<div class="frp-wrap">
  <div class="frp-toolbar">
    <span style="font-size:14px;font-weight:700;color:var(--text)">当期決算予測報告書</span>
    <button class="btn-solid" onclick="window.print()" style="font-size:12px;padding:6px 16px">🖨 印刷 / PDF</button>
  </div>

  <div class="frp-doc" id="fr-doc">

    <!-- ヘッダー -->
    <div class="frp-header-band">
      <div class="frp-header-title">当期決算予測報告書</div>
      <div class="frp-header-sub">${company.name}　／　${fyEndYear}年${fyE}月期（${fyStartYear}年${fyS}月〜${fyEndYear}年${fyE}月）</div>
    </div>

    <p class="frp-lead">
      貴社の${fyEndYear}年${fyE}月期（${fyStartYear}年${fyS}月1日〜${fyEndYear}年${fyE}月${lastD}日）における当期決算予測についてご報告いたします。
    </p>

    <!-- Section 1 -->
    <div class="frp-section-label">１．当期決算の業績予測</div>
    <div class="frp-table-wrap">
      <table class="frp-table">
        <thead>
          <tr>
            <th class="frp-th-label"></th>
            <th>当期実績（Ａ）<div class="frp-col-sub">${actRange}</div></th>
            <th>未経過月の予測（Ｂ）<div class="frp-col-sub">${fcstRange}</div></th>
            <th class="frp-th-total">当期決算の予測<div class="frp-col-sub">（Ａ＋Ｂ）</div></th>
            <th>前期実績</th>
          </tr>
        </thead>
        <tbody>
          ${frpRow('(1) 売 上 高', '前年比', K(aS), K(fS), K(tS), K(pS), yoy(tS,pS), yoy(pS,null), neg(tS))}
          ${frpRow('(2) 限界利益', `限界利益率 ${pct(tG,tS)}`, K(aG), K(fG), K(tG), K(pG), pct(tG,tS), pct(pG,pS), neg(tG))}
          ${frpRow('(3) 人 件 費', `労働分配率 ${pct(tL,tG||1)}`, K(aL), K(fL), K(tL), K(pL), pct(tL,tG||1), pct(pL,pG||1), '')}
          ${frpRow('(4) 経 常 利 益', `売上高経常利益率 ${pct(tO,tS)}`, K(aO), K(fO), K(tO), K(pO), pct(tO,tS), pct(pO,pS), neg(tO))}
          ${frpRow('(5) 税引後当期純利益', `前年比 ${yoy(tN,pN)}`, K(aN), K(fN), K(tN), K(pN), yoy(tN,pN), '', neg(tN))}
        </tbody>
      </table>
      <div class="frp-table-note">単位：千円</div>
    </div>

    <!-- Section 2 -->
    <div class="frp-section-label" style="margin-top:28px">２．納税額の予測</div>
    <div class="frp-table-wrap">
      <table class="frp-table">
        <thead>
          <tr>
            <th class="frp-th-label"></th>
            <th>予測年税額</th>
            <th>中間納付額</th>
            <th class="frp-th-total">予測納付額</th>
            <th>前期年税額</th>
          </tr>
        </thead>
        <tbody>
          ${taxRows.map((r,i) => `
          <tr>
            <td class="frp-td-label">(${i+1}) ${r.label}</td>
            <td class="frp-td-num">${r.annual > 0 ? K(r.annual)+'千円' : '0千円'}</td>
            <td class="frp-td-num">${r.prepaid > 0 ? K(r.prepaid)+'千円' : '0千円'}</td>
            <td class="frp-td-num frp-td-total">${K(r.annual - r.prepaid)}千円</td>
            <td class="frp-td-num frp-td-prev">${r.prev > 0 ? K(r.prev)+'千円' : '0千円'}</td>
          </tr>`).join('')}
          <tr class="frp-tr-total">
            <td class="frp-td-label">合　　計</td>
            <td class="frp-td-num">${K(totalAnnual)}千円</td>
            <td class="frp-td-num">${K(totalPrepaid)}千円</td>
            <td class="frp-td-num frp-td-total">${K(totalAnnual - totalPrepaid)}千円</td>
            <td class="frp-td-num frp-td-prev">${totalPrev > 0 ? K(totalPrev)+'千円' : '—'}</td>
          </tr>
        </tbody>
      </table>
      <div class="frp-table-note">※税額は概算です。確定申告により変動します。</div>
    </div>

    <div class="frp-interview">
      なお、この予測は、貴社へのインタビュー（<input type="text" id="fr_interview_date"
        value="${interviewDate}" placeholder="令和　年　月　日"
        style="border:none;border-bottom:1.5px solid #94a3b8;background:transparent;font-size:13px;width:160px;padding:0 4px;font-family:inherit;color:inherit"
        oninput="_frSaveDate(this.value)">）に基づいて作成したものです。
    </div>

  </div>
</div>

<style>
.frp-wrap { padding: 16px 20px; }
.frp-toolbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }

.frp-doc {
  max-width: 900px; margin: 0 auto;
  background: #fff; border-radius: 12px;
  box-shadow: 0 2px 16px rgba(0,0,0,.08);
  overflow: hidden; font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #1e293b; font-size: 13px;
}
.frp-header-band {
  background: linear-gradient(135deg, #0f172a 0%, #1e40af 100%);
  padding: 28px 36px; color: #fff;
}
.frp-header-title { font-size: 22px; font-weight: 800; letter-spacing: .05em; margin-bottom: 6px; }
.frp-header-sub   { font-size: 14px; opacity: .8; }

.frp-lead { padding: 20px 36px 0; line-height: 1.9; color: #475569; font-size: 13px; }

.frp-section-label {
  margin: 24px 36px 10px; font-size: 13px; font-weight: 700;
  color: #1e40af; padding-left: 10px; border-left: 3px solid #1e40af;
}
.frp-table-wrap { padding: 0 36px; }
.frp-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.frp-table thead tr { background: #f1f5f9; }
.frp-table th {
  padding: 8px 12px; text-align: center; font-weight: 700;
  border: 1px solid #cbd5e1; color: #334155; font-size: 11.5px;
}
.frp-th-label { text-align: left !important; min-width: 200px; }
.frp-th-total { background: #eff6ff !important; color: #1e40af !important; }
.frp-table td { border: 1px solid #e2e8f0; padding: 8px 12px; }
.frp-td-label { font-weight: 600; color: #1e293b; }
.frp-td-num   { text-align: right; font-variant-numeric: tabular-nums; }
.frp-td-total { background: #eff6ff; font-weight: 700; color: #1e40af; }
.frp-td-prev  { color: #64748b; }
.frp-col-sub  { font-size: 10px; font-weight: 400; color: #64748b; margin-top: 2px; }
.frp-row-sub  { font-size: 10px; color: #64748b; margin-top: 2px; }
.frp-tr-total td { background: #f8fafc; font-weight: 700; border-top: 2px solid #cbd5e1; }
.frp-tr-total .frp-td-total { background: #dbeafe; color: #1e40af; }
.frp-table-note { font-size: 10.5px; color: #94a3b8; margin-top: 6px; text-align: right; }
.fr-neg { color: #dc2626; }

.frp-interview {
  margin: 28px 36px 32px; line-height: 2.2;
  color: #475569; font-size: 13px;
  padding-top: 20px; border-top: 1px solid #e2e8f0;
}

@media print {
  aside, .main-header, .frp-toolbar, button { display: none !important; }
  .frp-doc { box-shadow: none; border-radius: 0; }
  .frp-wrap { padding: 0; }
}
</style>`;
}

function frpRow(label, sub, aV, fV, tV, pV, tSub, pSub, negCls) {
  return `<tr>
    <td class="frp-td-label">
      ${label}
      ${sub ? `<div class="frp-row-sub">${sub}</div>` : ''}
    </td>
    <td class="frp-td-num ${negCls}">${aV}千円</td>
    <td class="frp-td-num ${negCls}">${fV}千円</td>
    <td class="frp-td-num frp-td-total ${negCls}">
      ${tV}千円
      ${tSub ? `<div class="frp-row-sub">${tSub}</div>` : ''}
    </td>
    <td class="frp-td-num frp-td-prev">
      ${pV != null ? pV+'千円' : '—'}
      ${pSub ? `<div class="frp-row-sub">${pSub}</div>` : ''}
    </td>
  </tr>`;
}

function _frSaveDate(val) {
  const company = window.App?.currentCompany;
  const curYear = window.App?.currentYear;
  if (!company) return;
  const FR_KEY = 'forecast_report_v1';
  const all = JSON.parse(localStorage.getItem(FR_KEY) || '{}');
  const key = `${company.id}_${curYear}`;
  all[key] = { ...(all[key] || {}), interviewDate: val };
  localStorage.setItem(FR_KEY, JSON.stringify(all));
}
