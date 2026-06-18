// 法人税額シミュレーション

const TAX_RATES = {
  corp: {
    small_low:   0.15,  // 資本金1億円以下・年800万円以下
    small_high:  0.234, // 資本金1億円以下・年800万円超
    large:       0.234, // 大法人
  },
  local_corp:    0.103, // 地方法人税(法人税額の10.3%)
  inhabitant: {
    pref: {
      small: 0.032,     // 道府県民税 法人税割 標準税率
      large: 0.032,
    },
    city: {
      small: 0.096,     // 市町村民税 法人税割 標準税率
      large: 0.096,
    },
    per_capita_small: 70000,  // 均等割(中小)
    per_capita_large: 200000,
  },
  business: {
    small_low:  0.035,  // 法人事業税 所得割 (年400万以下)
    small_mid:  0.075,  // 年400万超800万以下
    small_high: 0.072,  // 年800万超（外形非対象）
    special:    0.374,  // 特別法人事業税 (所得割×37.4%)
  },
};

const THRESHOLD_800 = 8_000_000;
const THRESHOLD_400 = 4_000_000;
const CAPITAL_THRESHOLD = 100_000_000;

function isSmall(capital) {
  return capital <= CAPITAL_THRESHOLD;
}

function calcCorpTax(pretaxProfit, capital) {
  if (pretaxProfit <= 0) return 0;
  const small = isSmall(capital);
  if (small) {
    if (pretaxProfit <= THRESHOLD_800) {
      return pretaxProfit * TAX_RATES.corp.small_low;
    } else {
      return THRESHOLD_800 * TAX_RATES.corp.small_low
           + (pretaxProfit - THRESHOLD_800) * TAX_RATES.corp.small_high;
    }
  }
  return pretaxProfit * TAX_RATES.corp.large;
}

function calcLocalCorpTax(corpTax) {
  return corpTax * TAX_RATES.local_corp;
}

function calcInhabitantTax(corpTax, capital) {
  const small = isSmall(capital);
  const perCapita = small
    ? TAX_RATES.inhabitant.per_capita_small
    : TAX_RATES.inhabitant.per_capita_large;
  const prefK割 = corpTax * TAX_RATES.inhabitant.pref.small;
  const cityKatsuWari = corpTax * TAX_RATES.inhabitant.city.small;
  return perCapita + prefK割 + cityKatsuWari;
}

function calcBusinessTax(pretaxProfit, capital) {
  if (pretaxProfit <= 0) return { income: 0, special: 0 };
  const small = isSmall(capital);
  let income;
  if (small) {
    if (pretaxProfit <= THRESHOLD_400) {
      income = pretaxProfit * TAX_RATES.business.small_low;
    } else if (pretaxProfit <= THRESHOLD_800) {
      income = THRESHOLD_400 * TAX_RATES.business.small_low
             + (pretaxProfit - THRESHOLD_400) * TAX_RATES.business.small_mid;
    } else {
      income = THRESHOLD_400 * TAX_RATES.business.small_low
             + THRESHOLD_400 * TAX_RATES.business.small_mid
             + (pretaxProfit - THRESHOLD_800) * TAX_RATES.business.small_high;
    }
  } else {
    income = pretaxProfit * TAX_RATES.business.small_high;
  }
  const special = income * TAX_RATES.business.special;
  return { income, special };
}

function calcAllTax(pretaxProfit, capital) {
  const corp       = calcCorpTax(pretaxProfit, capital);
  const localCorp  = calcLocalCorpTax(corp);
  const inhabitant = calcInhabitantTax(corp, capital);
  const { income: business, special } = calcBusinessTax(pretaxProfit, capital);
  const total      = corp + localCorp + inhabitant + business + special;
  return { corp, localCorp, inhabitant, business, special, total };
}

function renderTaxSimulator(container) {
  const budget  = window.App?.currentBudget;
  const company = window.App?.currentCompany;

  // 税引前利益を予算から自動取得
  let budgetPretax = 0;
  if (budget) {
    if (budget.dynamicAccounts) {
      const av = calcAllValuesDynamic(budget);
      budgetPretax = (av['calc_pretax'] || []).reduce((a,v)=>a+v,0);
    } else {
      const pl = calcPL(budget.rows);
      budgetPretax = pl.pretax_profit.reduce((a,v)=>a+v,0);
    }
  }

  const capital  = company?.capital  || 10_000_000;
  const prepaid1 = company?.prepaid1 || 0;
  const prepaid2 = company?.prepaid2 || 0;

  container.innerHTML = `
    <div class="sim-panel">
      <h2 class="section-title">法人税額シミュレーション</h2>
      <div class="sim-grid">

        <div class="card-h" style="display:flex;flex-direction:column;gap:0">
          <h3>📋 基本情報</h3>
          <div class="form-group">
            <label>税引前利益（予算ベース・円）
              <span style="font-size:10px;background:#e0f2fe;color:#0369a1;padding:1px 6px;border-radius:4px;margin-left:6px">自動取得</span>
            </label>
            <input type="number" id="tax_pretax" value="${Math.round(budgetPretax)}" class="form-input" step="10000" oninput="runTaxSim()">
          </div>
          <div class="form-group">
            <label>資本金（円）</label>
            <input type="number" id="tax_capital" value="${capital}" class="form-input" step="100000" oninput="runTaxSim()">
          </div>

          <h3 style="margin-top:14px">📝 税務調整</h3>
          <div class="form-group">
            <label>役員賞与（損金不算入・加算）</label>
            <input type="number" id="tax_adj_exec_bonus" value="0" class="form-input" step="100000" oninput="runTaxSim()" placeholder="0">
          </div>
          <div class="form-group">
            <label>交際費等（損金不算入・加算）</label>
            <input type="number" id="tax_adj_entertainment" value="0" class="form-input" step="100000" oninput="runTaxSim()" placeholder="0">
          </div>
          <div class="form-group">
            <label>その他加算項目</label>
            <input type="number" id="tax_adj_add" value="0" class="form-input" step="100000" oninput="runTaxSim()" placeholder="0">
          </div>
          <div class="form-group">
            <label>その他減算項目</label>
            <input type="number" id="tax_adj_sub" value="0" class="form-input" step="100000" oninput="runTaxSim()" placeholder="0">
          </div>
          <div class="form-group">
            <label>繰越欠損金控除（マイナスで入力）</label>
            <input type="number" id="tax_nol" value="0" class="form-input" step="100000" oninput="runTaxSim()" placeholder="0（控除する場合は入力）">
            <div style="font-size:10px;color:var(--text-muted);margin-top:3px">※ 所得の最大50%まで控除可（中小法人は100%）</div>
          </div>

          <h3 style="margin-top:14px">💳 予定納税</h3>
          <div class="form-group">
            <label>第1回予定納税（円）</label>
            <input type="number" id="tax_prepaid1" value="${prepaid1}" class="form-input" step="10000" oninput="runTaxSim()">
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label>第2回予定納税（円）</label>
            <input type="number" id="tax_prepaid2" value="${prepaid2}" class="form-input" step="10000" oninput="runTaxSim()">
          </div>
        </div>

        <div class="card-h">
          <h3>💡 計算結果</h3>
          <div id="tax_adj_summary" style="background:#f0f9ff;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px"></div>
          <table class="result-table" id="tax_result_table">
            <thead><tr><th>税目</th><th style="text-align:right">概算税額</th></tr></thead>
            <tbody id="tax_tbody"></tbody>
          </table>
          <div id="tax_summary" class="tax-summary" style="margin-top:14px"></div>
          <div style="margin-top:18px;text-align:right">
            <button class="btn-solid" onclick="applyTaxToBudget()">📊 法人税等へ反映</button>
          </div>
        </div>

      </div>
    </div>`;
  runTaxSim();
}

function runTaxSim() {
  const pretax   = parseFloat(document.getElementById('tax_pretax')?.value  || 0);
  const capital  = parseFloat(document.getElementById('tax_capital')?.value || 10_000_000);
  const prepaid1 = parseFloat(document.getElementById('tax_prepaid1')?.value || 0);
  const prepaid2 = parseFloat(document.getElementById('tax_prepaid2')?.value || 0);

  const adjExecBonus     = parseFloat(document.getElementById('tax_adj_exec_bonus')?.value     || 0);
  const adjEntertainment = parseFloat(document.getElementById('tax_adj_entertainment')?.value   || 0);
  const adjAdd           = parseFloat(document.getElementById('tax_adj_add')?.value             || 0);
  const adjSub           = parseFloat(document.getElementById('tax_adj_sub')?.value             || 0);
  const nolRaw           = parseFloat(document.getElementById('tax_nol')?.value                 || 0);

  const totalAdd = adjExecBonus + adjEntertainment + adjAdd;
  const totalSub = adjSub;

  // 課税所得 = 税引前利益 + 加算 - 減算 - 欠損金
  const incomeBeforeNol = pretax + totalAdd - totalSub;
  const small = isSmall(capital);
  // 欠損金控除: 中小は100%、大法人は50%上限
  const nolLimit = small ? incomeBeforeNol : incomeBeforeNol * 0.5;
  const nolDeduction = Math.min(Math.abs(nolRaw), Math.max(0, nolLimit));
  const taxableIncome = Math.max(0, incomeBeforeNol - nolDeduction);

  const taxes = calcAllTax(taxableIncome, capital);
  const prepaid = prepaid1 + prepaid2;
  const balance = taxes.total - prepaid;

  // 調整サマリー
  const adjEl = document.getElementById('tax_adj_summary');
  if (adjEl) {
    adjEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span>税引前利益</span><span>${Math.round(pretax).toLocaleString()}円</span>
      </div>
      ${totalAdd > 0 ? `<div style="display:flex;justify-content:space-between;color:#d97706">
        <span>＋ 加算合計（損金不算入等）</span><span>${Math.round(totalAdd).toLocaleString()}円</span>
      </div>` : ''}
      ${totalSub > 0 ? `<div style="display:flex;justify-content:space-between;color:#059669">
        <span>－ 減算合計</span><span>${Math.round(totalSub).toLocaleString()}円</span>
      </div>` : ''}
      ${nolDeduction > 0 ? `<div style="display:flex;justify-content:space-between;color:#059669">
        <span>－ 繰越欠損金控除</span><span>${Math.round(nolDeduction).toLocaleString()}円</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px solid #bae6fd;padding-top:4px;margin-top:4px">
        <span>課税所得</span><span>${Math.round(taxableIncome).toLocaleString()}円</span>
      </div>`;
  }

  const tbody = document.getElementById('tax_tbody');
  if (!tbody) return;
  tbody.innerHTML = `
    <tr><td>法人税</td><td class="num">${fmt(taxes.corp)}</td></tr>
    <tr><td>地方法人税</td><td class="num">${fmt(taxes.localCorp)}</td></tr>
    <tr><td>法人住民税</td><td class="num">${fmt(taxes.inhabitant)}</td></tr>
    <tr><td>法人事業税</td><td class="num">${fmt(taxes.business)}</td></tr>
    <tr><td>特別法人事業税</td><td class="num">${fmt(taxes.special)}</td></tr>
    <tr class="total-row"><td><strong>税額合計</strong></td><td class="num"><strong>${fmt(taxes.total)}</strong></td></tr>
  `;

  const summaryEl = document.getElementById('tax_summary');
  if (summaryEl) {
    const tag = small ? '中小法人' : '大法人';
    const effectiveRate = pretax > 0 ? (taxes.total / pretax * 100).toFixed(1) : '0.0';
    summaryEl.innerHTML = `
      <div class="summary-item"><span>判定</span><span class="badge">${tag}</span></div>
      <div class="summary-item"><span>実効税率（課税所得ベース）</span><span>${taxableIncome > 0 ? (taxes.total/taxableIncome*100).toFixed(1) : '0.0'}%</span></div>
      <div class="summary-item"><span>実効税率（税引前利益ベース）</span><span>${effectiveRate}%</span></div>
      <div class="summary-item"><span>予定納税合計</span><span>${fmt(prepaid)}</span></div>
      <div class="summary-item ${balance >= 0 ? 'positive' : 'negative'}">
        <span>${balance >= 0 ? '納付差額（追加納付）' : '還付見込額'}</span>
        <span><strong>${fmt(Math.abs(balance))}</strong></span>
      </div>
    `;
  }

  // グローバルに最新税額を保持（applyTaxToBudget で参照）
  window._lastTaxTotal = taxes.total;
}

function applyTaxToBudget() {
  const budget = window.App?.currentBudget;
  if (!budget) { alert('予算データがありません'); return; }
  const total = window._lastTaxTotal || 0;
  if (!budget.rows) budget.rows = {};

  // 調整欄（index12）に一括計上
  const monthly = [...Array(12).fill(0), Math.round(total)];

  // 法人税等（PL費用科目）を特定・なければ動的追加
  let taxAccId = 'corp_tax';
  if (budget.dynamicAccounts) {
    const accts = budget.dynamicAccounts;

    // PL section の法人税等 input 科目のみ対象（BSの未払法人税等は除外）
    let taxAcc = accts.find(a => a.id === 'corp_tax' && a.section === 'pl') ||
                 accts.find(a => a.section === 'pl' && a.type === 'input' &&
                   a.name?.replace(/\s+/g,'').includes('法人税') &&
                   !a.name?.includes('未払'));

    if (!taxAcc) {
      // PL科目として新規作成（calc_pretax の直後）
      const pretaxIdx = accts.findIndex(a => a.id === 'calc_pretax');
      const insertAt = pretaxIdx >= 0 ? pretaxIdx + 1 : accts.length;
      taxAcc = {
        id: 'corp_tax', name: '法人税等', type: 'input',
        indent: 0, section: 'pl', sign: -1, bold: false, custom: true,
      };
      accts.splice(insertAt, 0, taxAcc);
    }
    taxAccId = taxAcc.id;

    // calc_net の formula を正しいPL科目を参照するよう強制更新
    const calcNet = accts.find(a => a.id === 'calc_net');
    if (calcNet) {
      calcNet.formula = `calc_pretax - ${taxAccId}`;
    }
  }

  budget.rows[taxAccId] = monthly;
  saveBudget(budget);
  window.App.currentBudget = budget;
  const calcNet = budget.dynamicAccounts?.find(a => a.id === 'calc_net');
  const taxAccCheck = budget.dynamicAccounts?.find(a => a.id === taxAccId);
  console.log('applyTax: taxAccId=', taxAccId, 'taxAcc=', taxAccCheck, 'calc_net formula=', calcNet?.formula, 'rows=', budget.rows[taxAccId]);
  alert(`反映完了\n科目ID: ${taxAccId}\n科目名: ${taxAccCheck?.name ?? '見つからず'}\n当期純利益formula: ${calcNet?.formula ?? 'なし'}\n月次合計: ${(budget.rows[taxAccId]||[]).reduce((s,v)=>s+v,0).toLocaleString()}円`);
}

// 消費税関連ページ
function renderCtaxJudge(container) {
  const company = window.App?.currentCompany;
  const budget  = window.App?.currentBudget;
  const ctaxEst = (company && budget) ? calcCtaxEstimate(budget, company) : null;

  const estHtml = (() => {
    if (!ctaxEst) return '<div class="no-data-small">会社情報・予算データがありません</div>';
    if (ctaxEst.exempt) return '<div class="no-data-small">免税事業者のため消費税概算は不要です</div>';
    if (ctaxEst.noData) return '<div class="no-data-small">仮払・仮受消費税のデータがありません。<br>Mirokuからインポートすると自動計算されます。</div>';
    const balance = ctaxEst.ctax - (ctaxEst.ctaxPrepaid || 0);
    return `
      <div class="tax-kpi-row"><span>計算方法</span><span>${ctaxEst.method === 'kani' ? `簡易課税（第${ctaxEst.businessType}種・みなし${Math.round(ctaxEst.minasRate*100)}%）` : '本則課税'}</span></div>
      ${ctaxEst.method === 'kani' ? `
        <div class="tax-kpi-row"><span>売上高（年換算）</span><span>${Math.round(ctaxEst.salesTotal/1000).toLocaleString()}千円</span></div>
        <div class="tax-kpi-row"><span>仮受消費税相当</span><span>${Math.round(ctaxEst.outputTax/1000).toLocaleString()}千円</span></div>
        <div class="tax-kpi-row"><span>みなし仕入税額控除</span><span>▲${Math.round(ctaxEst.outputTax*ctaxEst.minasRate/1000).toLocaleString()}千円</span></div>
      ` : `
        <div class="tax-kpi-row"><span>仮受消費税（年換算）</span><span>${Math.round(ctaxEst.kariUke/1000).toLocaleString()}千円</span></div>
        <div class="tax-kpi-row"><span>仮払消費税（年換算）</span><span>▲${Math.round(ctaxEst.kariHarai/1000).toLocaleString()}千円</span></div>
      `}
      ${ctaxEst.filledMonths < 12 ? `<div class="tax-kpi-row" style="font-size:10px;color:var(--text-muted)"><span>※${ctaxEst.filledMonths}か月データ→12か月換算</span><span></span></div>` : ''}
      <div class="tax-kpi-total"><span>消費税額（概算）</span><span>${Math.round(ctaxEst.ctax/1000).toLocaleString()}千円</span></div>
      <div class="tax-kpi-row"><span>中間納付額</span><span>▲${Math.round((ctaxEst.ctaxPrepaid||0)/1000).toLocaleString()}千円</span></div>
      <div class="tax-kpi-row ${balance>=0?'tax-pay':'tax-refund'}">
        <span>${balance>=0?'確定申告　納付見込':'確定申告　還付見込'}</span>
        <span><strong>${Math.round(Math.abs(balance)/1000).toLocaleString()}千円</strong></span>
      </div>
      <div style="margin-top:8px;font-size:10px;color:var(--text-muted)">
        ※概算値。予定納税・中間納付の設定は「会社情報を編集」から変更できます。
      </div>`;
  })();

  container.innerHTML = `
    <div class="sim-panel">
      <h2 class="section-title">消費税関連</h2>
      <div class="sim-grid">
        <div class="card-h">
          <h3>💰 消費税額概算</h3>
          ${estHtml}
          ${company ? `<div style="margin-top:12px"><button class="btn btn-sm btn-outline" onclick="openCompanyModal('${company.id}')">会社情報を編集（業種・中間納付）</button></div>` : ''}
        </div>
        <div class="card-h">
          <h3>📋 課税区分チェック</h3>
          ${(() => {
            const curYear = window.App?.currentYear || new Date().getFullYear();
            // 基準期間 = 前々期の売上合計
            const b2 = company ? getBudget(company.id, curYear - 2) : null;
            let baseSalesAuto = null;
            if (b2) {
              const av2 = b2.dynamicAccounts ? calcAllValuesDynamic(b2) : calcAllValues(b2.rows);
              const arr2 = av2['sec_revenue'] || av2['sales'] || [];
              baseSalesAuto = arr2.reduce((a,v)=>a+v,0);
            }
            // 特定期間 = 前期の開始6ヶ月の売上合計
            const b1 = company ? getBudget(company.id, curYear - 1) : null;
            let specSalesAuto = null;
            if (b1) {
              const av1 = b1.dynamicAccounts ? calcAllValuesDynamic(b1) : calcAllValues(b1.rows);
              const arr1 = av1['sec_revenue'] || av1['sales'] || [];
              specSalesAuto = arr1.slice(0, 6).reduce((a,v)=>a+v,0);
            }
            const baseSalesVal = baseSalesAuto ?? company?.kijunUriage ?? 30000000;
            const specSalesVal = specSalesAuto ?? 0;
            const baseSrc = baseSalesAuto != null ? `<span class="ctax-auto-badge">前々期実績から自動取得</span>` : '';
            const specSrc = specSalesAuto != null ? `<span class="ctax-auto-badge">前期上半期から自動取得</span>` : '';
            return `
              <div class="form-group">
                <label>基準期間の課税売上高（${curYear-2}年度）${baseSrc}</label>
                <input type="number" id="ct_base_sales" value="${baseSalesVal}" class="form-input" step="100000">
              </div>
              <div class="form-group">
                <label>特定期間の課税売上高（${curYear-1}年度 前半6ヶ月）${specSrc}</label>
                <input type="number" id="ct_spec_sales" value="${specSalesVal}" class="form-input" step="100000">
              </div>`;
          })()}
          <div class="form-group">
            <label>インボイス登録</label>
            <select id="ct_invoice" class="form-input">
              <option value="0" ${!company?.invoiceRegistered?'selected':''}>未登録</option>
              <option value="1" ${company?.invoiceRegistered?'selected':''}>登録済</option>
            </select>
          </div>
          <div class="form-group">
            <label>簡易課税届出</label>
            <select id="ct_simplified" class="form-input">
              <option value="0" ${!company?.kanijukazei?'selected':''}>届出なし</option>
              <option value="1" ${company?.kanijukazei?'selected':''}>届出あり</option>
            </select>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn btn-primary" onclick="runCtaxJudge()">判定</button>
            ${company ? `<button class="btn btn-sm btn-outline" onclick="saveCtaxToCompany()">会社情報に保存</button>` : ''}
          </div>
          <div id="ctax_result" class="ctax-result" style="margin-top:14px"></div>
        </div>
      </div>
    </div>`;
  runCtaxJudge();
}

function runCtaxJudge() {
  const baseSales  = parseFloat(document.getElementById('ct_base_sales')?.value  || 0);
  const specSales  = parseFloat(document.getElementById('ct_spec_sales')?.value  || 0);
  const invoice    = document.getElementById('ct_invoice')?.value === '1';
  const simplified = document.getElementById('ct_simplified')?.value === '1';

  const el = document.getElementById('ctax_result');
  if (!el) return;

  const EXEMPT_THRESHOLD    = 10_000_000;
  const SIMPLIFIED_THRESHOLD = 50_000_000;

  let status, badge, notes = [];

  if (!invoice && baseSales <= EXEMPT_THRESHOLD) {
    status = '免税事業者の可能性あり';
    badge = 'badge-green';
    notes.push(`基準期間課税売上高 ${fmt(baseSales)} ≦ 1,000万円`);
    notes.push('インボイス未登録のため、免税事業者に該当する可能性があります。');
    if (specSales > EXEMPT_THRESHOLD) {
      notes.push('※ 特定期間の課税売上高が1,000万円超の場合は課税事業者となります。');
    }
  } else if (invoice || baseSales > EXEMPT_THRESHOLD) {
    if (simplified && baseSales <= SIMPLIFIED_THRESHOLD) {
      status = '簡易課税適用可能';
      badge = 'badge-blue';
      notes.push(`基準期間課税売上高 ${fmt(baseSales)} ≦ 5,000万円`);
      notes.push('簡易課税届出あり → 簡易課税制度が適用できます。');
    } else if (baseSales > SIMPLIFIED_THRESHOLD) {
      status = '原則課税適用（簡易課税不可）';
      badge = 'badge-orange';
      notes.push(`基準期間課税売上高 ${fmt(baseSales)} ＞ 5,000万円`);
      notes.push('簡易課税制度は適用不可。原則課税で申告してください。');
    } else {
      status = '原則課税適用';
      badge = 'badge-orange';
      notes.push('課税事業者（原則課税）です。');
      notes.push('基準期間課税売上高が5,000万円以下の場合、簡易課税届出で簡易課税が選択できます。');
    }
  }

  el.innerHTML = `
    <div class="ctax-badge ${badge}">${status}</div>
    <ul class="ctax-notes">${notes.map(n => `<li>${n}</li>`).join('')}</ul>
    <table class="result-table ctax-table">
      <tr><th>判定項目</th><th>基準</th><th>実績</th><th>結果</th></tr>
      <tr>
        <td>免税判定</td><td>1,000万円以下</td><td>${fmt(baseSales)}</td>
        <td>${baseSales <= EXEMPT_THRESHOLD ? '✔ 以下' : '✗ 超過'}</td>
      </tr>
      <tr>
        <td>簡易課税</td><td>5,000万円以下</td><td>${fmt(baseSales)}</td>
        <td>${baseSales <= SIMPLIFIED_THRESHOLD ? '✔ 対象' : '✗ 対象外'}</td>
      </tr>
    </table>
  `;
}

// 課税区分チェックの値を会社情報に保存
function saveCtaxToCompany() {
  const company = window.App?.currentCompany;
  if (!company) return;
  const baseSales = parseFloat(document.getElementById('ct_base_sales')?.value || 0);
  const invoice   = document.getElementById('ct_invoice')?.value === '1';
  const kani      = document.getElementById('ct_simplified')?.value === '1';
  company.kijunUriage      = baseSales;
  company.invoiceRegistered = invoice;
  company.kanijukazei       = kani;
  saveCompany(company);
  window.App.companies = getCompanies();
  alert('会社情報を更新しました');
}
