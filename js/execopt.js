// ===== 役員報酬最適化シミュレーター =====

// ---- 税率・計算ロジック ----

function _eoSalaryDeduction(annual) {
  if (annual <= 1_625_000)  return 550_000;
  if (annual <= 1_800_000)  return annual * 0.4 - 100_000;
  if (annual <= 3_600_000)  return annual * 0.3 + 80_000;
  if (annual <= 6_600_000)  return annual * 0.2 + 440_000;
  if (annual <= 8_500_000)  return annual * 0.1 + 1_100_000;
  return 1_950_000;
}

function _eoIncomeTax(taxable) {
  if (taxable <= 0) return 0;
  let tax;
  if      (taxable <= 1_950_000)  tax = taxable * 0.05;
  else if (taxable <= 3_300_000)  tax = taxable * 0.10 - 97_500;
  else if (taxable <= 6_950_000)  tax = taxable * 0.20 - 427_500;
  else if (taxable <= 9_000_000)  tax = taxable * 0.23 - 636_000;
  else if (taxable <= 18_000_000) tax = taxable * 0.33 - 1_536_000;
  else if (taxable <= 40_000_000) tax = taxable * 0.40 - 2_796_000;
  else                            tax = taxable * 0.45 - 4_796_000;
  return Math.round(tax * 1.021); // 復興特別所得税2.1%
}

function _eoSocialIns(monthly, age40plus) {
  const health  = Math.min(monthly, 1_390_000) * 0.04985;
  const kaigo   = age40plus ? Math.min(monthly, 1_390_000) * 0.0091 : 0;
  const pension = Math.min(monthly, 650_000) * 0.0915;
  return Math.round((health + kaigo + pension) * 12);
}

function _eoCorporateTax(pretax) {
  if (pretax <= 0) return 0;
  // 中小法人: 800万以下21.4%、超過34.4%（実効税率概算）
  if (pretax <= 8_000_000) return Math.round(pretax * 0.214);
  return Math.round(8_000_000 * 0.214 + (pretax - 8_000_000) * 0.344);
}

function _eoCalc(monthly, companyPretaxBefore, age40plus) {
  const annual   = monthly * 12;
  const corpPretax = Math.max(0, companyPretaxBefore - annual);
  const corpTax    = _eoCorporateTax(corpPretax);

  const salaryDed  = _eoSalaryDeduction(annual);
  const salaryInc  = Math.max(0, annual - salaryDed);
  const socialIns  = _eoSocialIns(monthly, age40plus);
  const basicDed   = 480_000;
  const taxable    = Math.max(0, salaryInc - socialIns - basicDed);
  const incomeTax  = _eoIncomeTax(taxable);
  const residentTax = Math.max(0, taxable - 330_000) * 0.10 + 5_000;
  const totalPersonal = incomeTax + Math.round(residentTax) + socialIns;
  const takehome   = annual - totalPersonal;
  const totalTax   = corpTax + totalPersonal;
  const totalCash  = takehome + (companyPretaxBefore - annual - corpPretax) + Math.max(0, corpPretax - corpTax);

  return {
    monthly, annual,
    corpPretax, corpTax,
    salaryDed, salaryInc, socialIns,
    taxable, incomeTax,
    residentTax: Math.round(residentTax),
    totalPersonal, takehome,
    totalTax,
  };
}

// ---- 画面描画 ----

function renderExecOpt(container) {
  const company = window.App?.currentCompany;
  const budget  = window.App?.currentBudget;

  // 予算から経常利益を拾う（あれば）
  let defaultProfit = 30_000_000;
  if (budget) {
    const av = budget.dynamicAccounts?.length
      ? calcAllValuesDynamic(budget)
      : calcAllValues(budget.rows || {});
    const ord = (av['calc_ord'] || []).slice(0, 12).reduce((s, v) => s + (v || 0), 0);
    if (ord > 0) defaultProfit = Math.round(ord / 100_000) * 100_000;
  }
  const defaultMonthly = company?.execMonthly || 600_000;

  container.innerHTML = `
    <div class="sim-panel">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:1rem">
        <h2 class="section-title" style="margin-bottom:0">役員報酬最適化シミュレーター</h2>
        <button class="btn btn-sm btn-outline" onclick="showPage('home')" style="margin-left:auto">← ホームに戻る</button>
      </div>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:1.25rem;line-height:1.6">
        所得税・住民税・社会保険料（協会けんぽ東京）・法人税（中小法人実効税率）を合算し、役員報酬の最適水準を試算します。<br>
        ※ 概算です。実際の申告には必ず税理士にご確認ください。
      </p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">

        <!-- 入力 -->
        <div class="card" style="padding:1.25rem">
          <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:16px">条件入力</div>

          <div class="loan-field">
            <label>会社の年間利益（役員報酬支払前）</label>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="number" id="eo_profit" value="${Math.round(defaultProfit/10000)}" min="0" step="100"
                oninput="_eoUpdate()" style="flex:1;text-align:right">
              <span style="font-size:12px;color:var(--text-muted);white-space:nowrap">万円</span>
            </div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:4px">※ 予算の経常利益から自動セット</div>
          </div>

          <div class="loan-field">
            <label>役員報酬（月額）</label>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="range" id="eo_monthly" min="0" max="300" step="5" value="${Math.round(defaultMonthly/10000)}"
                oninput="_eoUpdate()" style="flex:1">
              <input type="number" id="eo_monthly_n" min="0" max="5000" step="5" value="${Math.round(defaultMonthly/10000)}"
                oninput="document.getElementById('eo_monthly').value=Math.min(this.value,300);_eoUpdate()"
                style="width:80px;text-align:right">
              <span style="font-size:12px;color:var(--text-muted);white-space:nowrap">万円/月</span>
            </div>
          </div>

          <div class="loan-field" style="margin-bottom:0">
            <label>介護保険対象（40歳以上）</label>
            <label style="display:flex;align-items:center;gap:8px;margin-top:6px;cursor:pointer">
              <input type="checkbox" id="eo_age40" oninput="_eoUpdate()" style="width:16px;height:16px">
              <span style="font-size:13px">40歳以上として計算する</span>
            </label>
          </div>
        </div>

        <!-- 結果サマリー -->
        <div id="eo_result"></div>
      </div>

      <!-- 内訳 -->
      <div class="card" style="margin-top:16px;padding:1.25rem">
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">税負担の内訳</div>
        <div id="eo_breakdown"></div>
      </div>

      <!-- 月額別比較テーブル -->
      <div class="card" style="margin-top:16px;padding:1.25rem">
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px">月額別シミュレーション</div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">★は税負担合計が最小となる水準</div>
        <div style="overflow-x:auto">
          <table class="result-table" id="eo_table" style="width:100%;min-width:580px"></table>
        </div>
      </div>
    </div>

    <style>
      .loan-field { margin-bottom:18px }
      .loan-field > label { display:block;font-size:12px;color:var(--text-muted);margin-bottom:6px;font-weight:500 }
      .eo-bar-wrap { display:flex;gap:6px;align-items:center;margin-bottom:8px }
      .eo-bar-label { font-size:11px;color:var(--text-muted);min-width:120px }
      .eo-bar-bg { flex:1;height:8px;background:var(--surface-1);border-radius:4px;overflow:hidden }
      .eo-bar-fill { height:100%;border-radius:4px }
      .eo-bar-val { font-size:11px;color:var(--text);min-width:80px;text-align:right;font-variant-numeric:tabular-nums }
    </style>`;

  _eoUpdate();
}

function _eoUpdate() {
  const profitMan  = parseFloat(document.getElementById('eo_profit')?.value) || 0;
  const monthlyN   = document.getElementById('eo_monthly_n');
  const monthlyR   = document.getElementById('eo_monthly');
  if (monthlyR && monthlyN) monthlyR.value = Math.min(parseFloat(monthlyN.value) || 0, 300);
  const monthlyMan = parseFloat(monthlyR?.value) || 0;
  const age40      = document.getElementById('eo_age40')?.checked || false;

  const profit  = profitMan  * 10_000;
  const monthly = monthlyMan * 10_000;

  const res = _eoCalc(monthly, profit, age40);

  // 最適値を探す（月額0〜500万を10万刻み）
  let best = null, bestTax = Infinity;
  for (let m = 0; m <= 500; m += 5) {
    const r = _eoCalc(m * 10_000, profit, age40);
    if (r.totalTax < bestTax) { bestTax = r.totalTax; best = r; }
  }

  const _fmtM = v => Math.round(v / 10_000).toLocaleString() + '万円';
  const _fmtK = v => Math.round(v / 1_000).toLocaleString() + '千円';

  // 結果サマリー
  const isBest = best && Math.abs(best.monthly - monthly) < 50_000;
  const bestDiff = best ? best.monthly - monthly : 0;
  const resultEl = document.getElementById('eo_result');
  if (resultEl) {
    resultEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="card" style="padding:1rem;text-align:center;grid-column:1/-1">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">個人手取り（年間）</div>
          <div style="font-size:26px;font-weight:700;color:var(--primary)">${_fmtM(res.takehome)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">年収 ${_fmtM(res.annual)} の手取り率 ${res.annual > 0 ? (res.takehome/res.annual*100).toFixed(1) : '—'}%</div>
        </div>
        <div class="card" style="padding:1rem;text-align:center">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">個人+法人 合計税負担</div>
          <div style="font-size:20px;font-weight:700;color:#f97316">${_fmtM(res.totalTax)}</div>
        </div>
        <div class="card" style="padding:1rem;text-align:center">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">法人税</div>
          <div style="font-size:20px;font-weight:700;color:var(--text)">${_fmtM(res.corpTax)}</div>
        </div>
      </div>
      ${best ? `
        <div style="margin-top:10px;padding:10px 14px;border-radius:8px;background:${isBest?'var(--bg-success)':'var(--bg-warning)'};border:1px solid ${isBest?'var(--border-success)':'var(--border-warning)'}">
          <div style="font-size:11px;font-weight:700;color:${isBest?'var(--text-success)':'var(--text-warning)'};margin-bottom:4px">
            ${isBest ? '✓ 現在の設定は最適水準付近です' : `最適月額：${_fmtM(best.monthly/12*12/12)}（月${Math.round(best.monthly/10000)}万円）`}
          </div>
          ${!isBest ? `<div style="font-size:11px;color:var(--text-muted)">現在より ${_fmtM(Math.abs(bestDiff > 0 ? best.totalTax - res.totalTax : res.totalTax - best.totalTax))} 節税できる可能性があります</div>` : ''}
        </div>` : ''}`;
  }

  // 内訳バーチャート
  const maxVal = Math.max(res.incomeTax, res.residentTax, res.socialIns, res.corpTax, 1);
  const bars = [
    { label: '所得税（復興税含）', val: res.incomeTax,   color: '#ef4444' },
    { label: '住民税',             val: res.residentTax, color: '#f97316' },
    { label: '社会保険料（本人）', val: res.socialIns,   color: '#f59e0b' },
    { label: '法人税（実効）',     val: res.corpTax,     color: '#8b5cf6' },
  ];
  const breakEl = document.getElementById('eo_breakdown');
  if (breakEl) {
    breakEl.innerHTML = bars.map(b => `
      <div class="eo-bar-wrap">
        <div class="eo-bar-label">${b.label}</div>
        <div class="eo-bar-bg">
          <div class="eo-bar-fill" style="width:${Math.round(b.val/maxVal*100)}%;background:${b.color}"></div>
        </div>
        <div class="eo-bar-val">${_fmtK(b.val)}</div>
      </div>`).join('') + `
      <div style="border-top:1px dashed var(--border);margin:8px 0;padding-top:8px;display:flex;justify-content:space-between;font-size:12px;font-weight:700">
        <span style="color:var(--text-muted)">合計税負担</span>
        <span style="color:#ef4444">${_fmtM(res.totalTax)}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;font-size:11px;color:var(--text-muted)">
        <div>給与所得控除：${_fmtM(res.salaryDed)}</div>
        <div>課税所得：${_fmtM(res.taxable)}</div>
        <div>法人課税前利益：${_fmtM(res.corpPretax)}</div>
      </div>`;
  }

  // 月額別比較テーブル
  const tableEl = document.getElementById('eo_table');
  if (!tableEl) return;

  const steps = [0,10,20,30,40,50,60,70,80,90,100,120,150,200,250,300,400,500];
  let rows = '';
  steps.forEach(m => {
    const r = _eoCalc(m * 10_000, profit, age40);
    const isCurrent = Math.abs(monthly - m * 10_000) < 1;
    const isOptimal = best && Math.abs(best.monthly - m * 10_000) < 1;
    const rowStyle = isCurrent ? 'background:var(--bg-accent);font-weight:700' : '';
    rows += `<tr style="${rowStyle}">
      <td style="text-align:center">${isOptimal ? '★' : ''} ${m}万円</td>
      <td class="num">${_fmtM(r.annual)}</td>
      <td class="num">${_fmtM(r.takehome)}</td>
      <td class="num" style="color:#f59e0b">${_fmtM(r.socialIns)}</td>
      <td class="num" style="color:#ef4444">${_fmtM(r.incomeTax + r.residentTax)}</td>
      <td class="num" style="color:#8b5cf6">${_fmtM(r.corpTax)}</td>
      <td class="num" style="color:#f97316;font-weight:600">${_fmtM(r.totalTax)}</td>
    </tr>`;
  });

  tableEl.innerHTML = `
    <thead>
      <tr>
        <th style="text-align:center">月額</th>
        <th>年収</th>
        <th>個人手取り</th>
        <th style="color:#f59e0b">社会保険</th>
        <th style="color:#ef4444">所得税+住民税</th>
        <th style="color:#8b5cf6">法人税</th>
        <th style="color:#f97316">合計税負担</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>`;
}
