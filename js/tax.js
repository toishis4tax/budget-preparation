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
  container.innerHTML = `
    <div class="sim-panel">
      <h2 class="section-title">法人税額シミュレーション</h2>
      <div class="sim-grid">
        <div class="sim-inputs card">
          <h3>入力</h3>
          <div class="form-group">
            <label>税引前利益（円）</label>
            <input type="number" id="tax_pretax" value="10000000" class="form-input" step="10000">
          </div>
          <div class="form-group">
            <label>資本金（円）</label>
            <input type="number" id="tax_capital" value="10000000" class="form-input" step="10000">
          </div>
          <div class="form-group">
            <label>第1回予定納税（円）</label>
            <input type="number" id="tax_prepaid1" value="0" class="form-input" step="10000">
          </div>
          <div class="form-group">
            <label>第2回予定納税（円）</label>
            <input type="number" id="tax_prepaid2" value="0" class="form-input" step="10000">
          </div>
          <button class="btn btn-primary" onclick="runTaxSim()">計算</button>
        </div>
        <div class="sim-results card">
          <h3>税額内訳</h3>
          <table class="result-table" id="tax_result_table">
            <thead><tr><th>税目</th><th>概算税額</th></tr></thead>
            <tbody id="tax_tbody"></tbody>
          </table>
          <div id="tax_summary" class="tax-summary"></div>
        </div>
      </div>
    </div>`;
  runTaxSim();
}

function runTaxSim() {
  const pretax   = parseFloat(document.getElementById('tax_pretax')?.value  || 0);
  const capital  = parseFloat(document.getElementById('tax_capital')?.value || 10000000);
  const prepaid1 = parseFloat(document.getElementById('tax_prepaid1')?.value || 0);
  const prepaid2 = parseFloat(document.getElementById('tax_prepaid2')?.value || 0);

  const taxes = calcAllTax(pretax, capital);
  const prepaid = prepaid1 + prepaid2;
  const balance = taxes.total - prepaid;

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
    const tag = isSmall(capital) ? '中小法人' : '大法人';
    const effectiveRate = pretax > 0 ? (taxes.total / pretax * 100).toFixed(1) : '0.0';
    summaryEl.innerHTML = `
      <div class="summary-item"><span>判定</span><span class="badge">${tag}</span></div>
      <div class="summary-item"><span>実効税率（概算）</span><span>${effectiveRate}%</span></div>
      <div class="summary-item"><span>予定納税合計</span><span>${fmt(prepaid)}</span></div>
      <div class="summary-item ${balance >= 0 ? 'positive' : 'negative'}">
        <span>${balance >= 0 ? '納付差額（追加納付）' : '還付見込額'}</span>
        <span><strong>${fmt(Math.abs(balance))}</strong></span>
      </div>
    `;
  }
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
          <div class="form-group">
            <label>基準期間の課税売上高（円）</label>
            <input type="number" id="ct_base_sales" value="${company?.kijunUriage || 30000000}" class="form-input" step="100000">
          </div>
          <div class="form-group">
            <label>特定期間の課税売上高（円）</label>
            <input type="number" id="ct_spec_sales" value="0" class="form-input" step="100000">
          </div>
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
          <button class="btn btn-primary" onclick="runCtaxJudge()">判定</button>
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
