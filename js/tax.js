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

// 消費税判定
function renderCtaxJudge(container) {
  container.innerHTML = `
    <div class="sim-panel">
      <h2 class="section-title">消費税判定</h2>
      <div class="sim-grid">
        <div class="sim-inputs card">
          <h3>入力</h3>
          <div class="form-group">
            <label>基準期間の課税売上高（円）</label>
            <input type="number" id="ct_base_sales" value="30000000" class="form-input" step="100000">
          </div>
          <div class="form-group">
            <label>特定期間の課税売上高（円）</label>
            <input type="number" id="ct_spec_sales" value="0" class="form-input" step="100000">
          </div>
          <div class="form-group">
            <label>インボイス登録</label>
            <select id="ct_invoice" class="form-input">
              <option value="0">未登録</option>
              <option value="1">登録済</option>
            </select>
          </div>
          <div class="form-group">
            <label>簡易課税届出</label>
            <select id="ct_simplified" class="form-input">
              <option value="0">届出なし</option>
              <option value="1">届出あり</option>
            </select>
          </div>
          <button class="btn btn-primary" onclick="runCtaxJudge()">判定</button>
        </div>
        <div class="sim-results card">
          <h3>判定結果</h3>
          <div id="ctax_result" class="ctax-result"></div>
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
