// 法人税額シミュレーション

function _showToast(msg, duration = 2500) {
  let el = document.getElementById('_tax_toast');
  if (!el) {
    el = document.createElement('div');
    el.id = '_tax_toast';
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#323232;color:#fff;padding:10px 20px;border-radius:6px;font-size:14px;z-index:9999;opacity:0;transition:opacity .2s;pointer-events:none';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, duration);
}

// デフォルト税率（全国標準）
const TAX_RATES_DEFAULT = {
  corp_small_low:   0.150,  // 法人税 中小・年800万以下
  corp_small_high:  0.232,  // 法人税 中小・年800万超
  corp_large:       0.232,  // 法人税 大法人
  local_corp:       0.103,  // 地方法人税（法人税額の10.3%）
  pref_wari:        0.010,  // 道府県民税 法人税割
  city_wari:        0.060,  // 市町村民税 法人税割
  pref_kintou_small:  20000, // 道府県民税 均等割（中小）
  city_kintou_small:  50000, // 市町村民税 均等割（中小）
  pref_kintou_large:  70000, // 道府県民税 均等割（大法人）
  city_kintou_large: 130000, // 市町村民税 均等割（大法人）
  biz_low:          0.035,  // 法人事業税 年400万以下
  biz_mid:          0.053,  // 法人事業税 年400万〜800万
  biz_high:         0.070,  // 法人事業税 年800万超
  biz_special:      0.374,  // 特別法人事業税（所得割×37.4%）
};

// 会社別税率設定のロード/セーブ
function loadTaxSettings(companyId) {
  try {
    const raw = localStorage.getItem(`taxSettings_v1_${companyId || ''}`);
    return raw ? { ...TAX_RATES_DEFAULT, ...JSON.parse(raw) } : { ...TAX_RATES_DEFAULT };
  } catch(e) { return { ...TAX_RATES_DEFAULT }; }
}
function saveTaxSettings(companyId, settings) {
  localStorage.setItem(`taxSettings_v1_${companyId || ''}`, JSON.stringify(settings));
}

function loadTaxAdj(companyId, year) {
  try {
    const raw = localStorage.getItem(`taxAdj_v1_${companyId || ''}_${year || ''}`);
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}
function saveTaxAdj(companyId, year, data) {
  localStorage.setItem(`taxAdj_v1_${companyId || ''}_${year || ''}`, JSON.stringify(data));
}

// 後方互換用エイリアス（calcCorpTax等から参照）
const TAX_RATES = {
  corp: { small_low: TAX_RATES_DEFAULT.corp_small_low, small_high: TAX_RATES_DEFAULT.corp_small_high, large: TAX_RATES_DEFAULT.corp_large },
  local_corp: TAX_RATES_DEFAULT.local_corp,
  inhabitant: { pref: { small: TAX_RATES_DEFAULT.pref_wari }, city: { small: TAX_RATES_DEFAULT.city_wari } },
  business: { small_low: TAX_RATES_DEFAULT.biz_low, small_mid: TAX_RATES_DEFAULT.biz_mid, small_high: TAX_RATES_DEFAULT.biz_high, special: TAX_RATES_DEFAULT.biz_special },
};

const THRESHOLD_800 = 8_000_000;
const THRESHOLD_400 = 4_000_000;
const CAPITAL_THRESHOLD = 100_000_000;

function isSmall(capital) {
  return capital <= CAPITAL_THRESHOLD;
}

// 切捨てヘルパー
const trunc100  = v => v <= 0 ? 0 : Math.floor(v / 100)  * 100;
const trunc1000 = v => v <= 0 ? 0 : Math.floor(v / 1000) * 1000;

// 税額控除・切捨て前の法人税額（地方法人税の課税標準算定用）
function _calcCorpTaxRaw(pretaxProfit, capital, r) {
  r = r || TAX_RATES_DEFAULT;
  if (pretaxProfit <= 0) return 0;
  const small = isSmall(capital);
  if (small) {
    if (pretaxProfit <= THRESHOLD_800) {
      return pretaxProfit * r.corp_small_low;
    } else {
      return THRESHOLD_800 * r.corp_small_low
           + (pretaxProfit - THRESHOLD_800) * r.corp_small_high;
    }
  } else {
    return pretaxProfit * r.corp_large;
  }
}

function calcCorpTax(pretaxProfit, capital, r, taxCredit = 0) {
  // 税額控除は百円未満切捨ての前に控除する
  return trunc100(Math.max(0, _calcCorpTaxRaw(pretaxProfit, capital, r) - taxCredit));
}

function calcLocalCorpTax(corpTax, r) {
  r = r || TAX_RATES_DEFAULT;
  return trunc100(corpTax * r.local_corp);
}

function calcBusinessTax(pretaxProfit, capital, r) {
  r = r || TAX_RATES_DEFAULT;
  if (pretaxProfit <= 0) return { income: 0, special: 0 };
  const small = isSmall(capital);

  // 法人事業税（都道府県の実際税率 = 超過税率を反映したr使用）
  let income;
  if (small) {
    if (pretaxProfit <= THRESHOLD_400) {
      income = pretaxProfit * r.biz_low;
    } else if (pretaxProfit <= THRESHOLD_800) {
      income = THRESHOLD_400 * r.biz_low
             + (pretaxProfit - THRESHOLD_400) * r.biz_mid;
    } else {
      income = THRESHOLD_400 * r.biz_low
             + THRESHOLD_400 * r.biz_mid
             + (pretaxProfit - THRESHOLD_800) * r.biz_high;
    }
  } else {
    income = pretaxProfit * r.biz_high;
  }
  income = trunc100(income);

  // 特別法人事業税は国定の軽減税率ベースで計算（超過税率は含めない）
  const D = TAX_RATES_DEFAULT;
  let specialBase;
  if (small) {
    if (pretaxProfit <= THRESHOLD_400) {
      specialBase = pretaxProfit * D.biz_low;
    } else if (pretaxProfit <= THRESHOLD_800) {
      specialBase = THRESHOLD_400 * D.biz_low
                  + (pretaxProfit - THRESHOLD_400) * D.biz_mid;
    } else {
      specialBase = THRESHOLD_400 * D.biz_low
                  + THRESHOLD_400 * D.biz_mid
                  + (pretaxProfit - THRESHOLD_800) * D.biz_high;
    }
  } else {
    specialBase = pretaxProfit * D.biz_high;
  }
  specialBase = trunc100(specialBase);
  const special = trunc100(specialBase * r.biz_special);

  return { income, special, specialBase };
}

// 防衛特別法人税（令和7年法律第13号、2026年4月1日以降開始事業年度から適用）
// 法人税額から500万円控除後の金額に4%を乗じた付加税
const DEFENSE_TAX_RATE       = 0.04;
const DEFENSE_TAX_DEDUCTION  = 5_000_000; // 基礎控除500万円

function calcDefenseTax(corp) {
  const base = Math.max(0, corp - DEFENSE_TAX_DEDUCTION);
  return trunc100(base * DEFENSE_TAX_RATE);
}

function calcAllTax(pretaxProfit, capital, { includeDefense = false, rates = null, taxCredit = 0 } = {}) {
  const r = rates || TAX_RATES_DEFAULT;
  // 課税標準（所得）は1,000円未満切捨て
  const taxBase = trunc1000(pretaxProfit);

  // 法人税額（税額控除前・切捨て前）→ 地方法人税の課税標準算定に使用
  const corpRaw = _calcCorpTaxRaw(taxBase, capital, r);
  // 差引法人税額（税額控除後・百円未満切捨て）
  const corp = trunc100(Math.max(0, corpRaw - taxCredit));

  // 地方法人税: 課税標準 = 税額控除前法人税額を千円未満切捨て（別表一 Row28→30）
  const localCorpBase = trunc1000(corpRaw);
  const localCorp = trunc100(localCorpBase * r.local_corp);

  const small = isSmall(capital);
  // 住民税法人税割: 課税標準 = 差引法人税額を千円未満切捨て
  const wariBase = trunc1000(corp);
  const prefWari   = trunc100(wariBase * r.pref_wari);
  const cityWari   = trunc100(wariBase * r.city_wari);
  const prefKintou = small ? r.pref_kintou_small : r.pref_kintou_large;
  const cityKintou = small ? r.city_kintou_small : r.city_kintou_large;
  const inhabitant = prefWari + cityWari + prefKintou + cityKintou;

  const { income: business, special, specialBase } = calcBusinessTax(taxBase, capital, r);
  const defense = includeDefense ? calcDefenseTax(corp) : 0;
  const total   = corp + localCorp + inhabitant + business + special + defense;
  return { corp, localCorpBase, wariBase, localCorp, inhabitant, prefWari, prefKintou, cityWari, cityKintou, business, special, specialBase, defense, total };
}

function renderTaxSimulator(container) {
  window._lastTaxTotal     = null;  // 会社切替時に前社の税額が引き継がれないようリセット
  const budget  = window.App?.currentBudget;
  const company = window.App?.currentCompany;
  window._lastTaxCompanyId = company?.id;

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

  // 中間納付 — taxsummary_v1 と同じストレージから読み込み（税金一覧表と連動）
  const curYear = window.App?.currentYear || new Date().getFullYear();
  const savedAdj = loadTaxAdj(company?.id, curYear);
  const tsaved  = loadTaxSummaryData(company?.id, curYear);
  const corpInterimKeys = [
    { key: 'i_corp',      label: '法人税',                 indent: false },
    { key: 'i_localCorp', label: '地方法人税',              indent: true  },
    { key: 'i_prefKatsu', label: '道府県民税　法人税割',    indent: false },
    { key: 'i_prefKintou',label: '道府県民税　均等割',      indent: true  },
    { key: 'i_business',  label: '事業税（所得割）',        indent: false },
    { key: 'i_special',   label: '特別法人事業税',          indent: true  },
    { key: 'i_cityKatsu', label: '市町村民税　法人税割',    indent: false },
    { key: 'i_cityKintou',label: '市町村民税　均等割',      indent: true  },
  ];
  const corpInterimHtml = corpInterimKeys.map(({ key, label, indent }) => `
    <div class="form-group" style="margin-bottom:4px${indent ? ';padding-left:12px' : ''}">
      <label style="font-size:11px">${label}</label>
      <input type="number" id="taxp_${key}" value="${tsaved[key] || ''}" class="form-input" step="10000" placeholder="0"
        oninput="updateCorpInterim('${key}', this.value)">
    </div>`).join('');

  const r = loadTaxSettings(company?.id);
  const pctV = v => parseFloat((v * 100).toFixed(3)).toString();
  const taxSettingsHtml = `
    <details id="tax_settings_details" style="margin-bottom:16px">
      <summary style="cursor:pointer;font-weight:700;font-size:13px;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;list-style:none;display:flex;justify-content:space-between;align-items:center">
        <span>⚙️ 税率・均等割設定</span>
        <span style="font-size:11px;color:var(--text-muted);font-weight:400">会社別にカスタマイズできます（デフォルト＝全国標準税率）</span>
      </summary>
      <div style="border:1px solid var(--border);border-top:none;border-radius:0 0 8px 8px;padding:14px;background:var(--bg)">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">

          <div>
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">法人税率</div>
            <div class="form-group" style="margin-bottom:6px">
              <label style="font-size:12px">年800万円以下（中小）%</label>
              <input type="number" id="tr_corp_small_low" class="form-input" value="${pctV(r.corp_small_low)}" step="0.001" min="0" max="50" oninput="runTaxSim()">
            </div>
            <div class="form-group" style="margin-bottom:6px">
              <label style="font-size:12px">年800万円超（中小）%</label>
              <input type="number" id="tr_corp_small_high" class="form-input" value="${pctV(r.corp_small_high)}" step="0.001" min="0" max="50" oninput="runTaxSim()">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label style="font-size:12px">大法人 %</label>
              <input type="number" id="tr_corp_large" class="form-input" value="${pctV(r.corp_large)}" step="0.001" min="0" max="50" oninput="runTaxSim()">
            </div>
          </div>

          <div>
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">地方法人税・住民税（法人税割）</div>
            <div class="form-group" style="margin-bottom:6px">
              <label style="font-size:12px">地方法人税（法人税額の）%</label>
              <input type="number" id="tr_local_corp" class="form-input" value="${pctV(r.local_corp)}" step="0.001" min="0" max="50" oninput="runTaxSim()">
            </div>
            <div class="form-group" style="margin-bottom:6px">
              <label style="font-size:12px">道府県民税 法人税割 %</label>
              <input type="number" id="tr_pref_wari" class="form-input" value="${pctV(r.pref_wari)}" step="0.001" min="0" max="20" oninput="runTaxSim()">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label style="font-size:12px">市町村民税 法人税割 %</label>
              <input type="number" id="tr_city_wari" class="form-input" value="${pctV(r.city_wari)}" step="0.001" min="0" max="20" oninput="runTaxSim()">
            </div>
          </div>

          <div>
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">均等割（円）</div>
            <div class="form-group" style="margin-bottom:6px">
              <label style="font-size:12px">道府県民税 均等割（中小）</label>
              <input type="number" id="tr_pref_kintou_small" class="form-input" value="${r.pref_kintou_small}" step="1000" min="0" oninput="runTaxSim()">
            </div>
            <div class="form-group" style="margin-bottom:6px">
              <label style="font-size:12px">市町村民税 均等割（中小）</label>
              <input type="number" id="tr_city_kintou_small" class="form-input" value="${r.city_kintou_small}" step="1000" min="0" oninput="runTaxSim()">
            </div>
            <div class="form-group" style="margin-bottom:6px">
              <label style="font-size:12px">道府県民税 均等割（大法人）</label>
              <input type="number" id="tr_pref_kintou_large" class="form-input" value="${r.pref_kintou_large}" step="1000" min="0" oninput="runTaxSim()">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label style="font-size:12px">市町村民税 均等割（大法人）</label>
              <input type="number" id="tr_city_kintou_large" class="form-input" value="${r.city_kintou_large}" step="1000" min="0" oninput="runTaxSim()">
            </div>
          </div>

          <div>
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">法人事業税</div>
            <div class="form-group" style="margin-bottom:6px">
              <label style="font-size:12px">年400万以下 %</label>
              <input type="number" id="tr_biz_low" class="form-input" value="${pctV(r.biz_low)}" step="0.001" min="0" max="30" oninput="runTaxSim()">
            </div>
            <div class="form-group" style="margin-bottom:6px">
              <label style="font-size:12px">年400万〜800万 %</label>
              <input type="number" id="tr_biz_mid" class="form-input" value="${pctV(r.biz_mid)}" step="0.001" min="0" max="30" oninput="runTaxSim()">
            </div>
            <div class="form-group" style="margin-bottom:6px">
              <label style="font-size:12px">年800万超 %</label>
              <input type="number" id="tr_biz_high" class="form-input" value="${pctV(r.biz_high)}" step="0.001" min="0" max="30" oninput="runTaxSim()">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label style="font-size:12px">特別法人事業税（所得割の）%</label>
              <input type="number" id="tr_biz_special" class="form-input" value="${pctV(r.biz_special)}" step="0.1" min="0" max="100" oninput="runTaxSim()">
            </div>
          </div>

        </div>
        <div style="display:flex;gap:8px;margin-top:12px;align-items:center">
          <button class="btn-solid" onclick="saveTaxSettingsFromUI()">💾 この設定を保存</button>
          <button class="btn btn-sm btn-outline" onclick="resetTaxSettings()">デフォルトに戻す</button>
        </div>
      </div>
    </details>`;

  container.innerHTML = `
    <div class="sim-panel">
      <h2 class="section-title">法人税額シミュレーション</h2>
      ${taxSettingsHtml}
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
          <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#f5f3ff;border:1px solid #c4b5fd;border-radius:8px;margin-top:4px">
            <input type="checkbox" id="tax_defense" onchange="runTaxSim()" style="width:16px;height:16px;accent-color:#7c3aed;cursor:pointer">
            <label for="tax_defense" style="font-size:12px;font-weight:700;color:#5b21b6;cursor:pointer;margin:0">
              防衛特別法人税を含める
              <span style="display:block;font-size:10px;font-weight:400;color:#7c3aed">2026年4月施行・法人税額×4%（500万円基礎控除）</span>
            </label>
          </div>

          <h3 style="margin-top:14px">📝 税務調整</h3>
          <div class="form-group">
            <label>役員賞与（損金不算入・加算）</label>
            <input type="number" id="tax_adj_exec_bonus" value="${savedAdj.exec_bonus || ''}" class="form-input" step="100000" oninput="runTaxSim()" placeholder="0">
          </div>
          <div class="form-group">
            <label>交際費等（損金不算入・加算）</label>
            <input type="number" id="tax_adj_entertainment" value="${savedAdj.entertainment || ''}" class="form-input" step="100000" oninput="runTaxSim()" placeholder="0">
          </div>
          <div class="form-group">
            <label>その他加算項目</label>
            <input type="number" id="tax_adj_add" value="${savedAdj.add || ''}" class="form-input" step="100000" oninput="runTaxSim()" placeholder="0">
          </div>
          <div class="form-group">
            <label>当期事業税支払額（減算）</label>
            <input type="number" id="tax_adj_biztax" value="${savedAdj.biztax || ''}" class="form-input" step="100000" oninput="runTaxSim()" placeholder="0">
            <div style="font-size:10px;color:var(--text-muted);margin-top:3px">※ 前期確定分・予定納税など当期中に支払った事業税</div>
          </div>
          <div class="form-group">
            <label>その他減算項目</label>
            <input type="number" id="tax_adj_sub" value="${savedAdj.sub || ''}" class="form-input" step="100000" oninput="runTaxSim()" placeholder="0">
          </div>
          <div class="form-group">
            <label>繰越欠損金控除（マイナスで入力）</label>
            <input type="number" id="tax_nol" value="${savedAdj.nol || ''}" class="form-input" step="100000" oninput="runTaxSim()" placeholder="0（控除する場合は入力）">
            <div style="font-size:10px;color:var(--text-muted);margin-top:3px">※ 所得の最大50%まで控除可（中小法人は100%）</div>
          </div>
          <div class="form-group">
            <label>税額控除（所得税額控除等）</label>
            <input type="number" id="tax_credit" value="${savedAdj.tax_credit || ''}" class="form-input" step="10000" oninput="runTaxSim()" placeholder="0">
            <div style="font-size:10px;color:var(--text-muted);margin-top:3px">※ 法人税額から直接控除（所得税額控除・外国税額控除等）</div>
          </div>

          <h3 style="margin-top:14px">💳 中間申告納付（税目別入力）</h3>
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">税金一覧表と連動して保存されます</div>
          ${corpInterimHtml}
          <div style="font-size:12px;font-weight:600;margin-top:6px;padding:6px 8px;background:#f1f5f9;border-radius:6px">
            合計: <span id="taxp_total">—</span> 円
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

function _readTaxSettingsFromUI() {
  const g = id => document.getElementById(id);
  if (!g('tr_corp_small_low')) return null;
  const pct = id => (parseFloat(g(id)?.value) || 0) / 100;
  const num = id => parseFloat(g(id)?.value) || 0;
  return {
    corp_small_low:     pct('tr_corp_small_low'),
    corp_small_high:    pct('tr_corp_small_high'),
    corp_large:         pct('tr_corp_large'),
    local_corp:         pct('tr_local_corp'),
    pref_wari:          pct('tr_pref_wari'),
    city_wari:          pct('tr_city_wari'),
    pref_kintou_small:  num('tr_pref_kintou_small'),
    city_kintou_small:  num('tr_city_kintou_small'),
    pref_kintou_large:  num('tr_pref_kintou_large'),
    city_kintou_large:  num('tr_city_kintou_large'),
    biz_low:            pct('tr_biz_low'),
    biz_mid:            pct('tr_biz_mid'),
    biz_high:           pct('tr_biz_high'),
    biz_special:        pct('tr_biz_special'),
  };
}

function saveTaxSettingsFromUI() {
  const companyId = window.App?.currentCompany?.id;
  const settings = _readTaxSettingsFromUI();
  if (!settings) return;
  saveTaxSettings(companyId, settings);
  _showToast('税率設定を保存しました');
}

function resetTaxSettings() {
  const companyId = window.App?.currentCompany?.id;
  localStorage.removeItem(`taxSettings_v1_${companyId || ''}`);
  // UIを再描画してデフォルト値に戻す
  const container = document.querySelector('.sim-panel')?.parentElement;
  if (container) renderTaxSimulator(container);
}

function updateCorpInterim(key, val) {
  const company = window.App?.currentCompany;
  const curYear = window.App?.currentYear || new Date().getFullYear();
  if (!company) return;
  const saved = loadTaxSummaryData(company.id, curYear);
  saved[key] = parseFloat(val) || 0;
  saveTaxSummaryData(company.id, curYear, saved);
  runTaxSim();
}

function runTaxSim() {
  const pretax   = parseFloat(document.getElementById('tax_pretax')?.value  || 0);
  const capital  = parseFloat(document.getElementById('tax_capital')?.value || 10_000_000);
  // 中間納付は税目別inputの合計
  const corpInterimKeys = ['i_corp','i_localCorp','i_prefKatsu','i_prefKintou','i_business','i_special','i_cityKatsu','i_cityKintou'];
  const prepaid1 = corpInterimKeys.reduce((sum, k) => {
    const el = document.getElementById(`taxp_${k}`);
    return sum + (parseFloat(el?.value) || 0);
  }, 0);
  // 合計表示を更新
  const totalEl = document.getElementById('taxp_total');
  if (totalEl) totalEl.textContent = prepaid1 > 0 ? prepaid1.toLocaleString('ja-JP') : '0';

  // カスタム税率を画面から読む
  const companyId = window.App?.currentCompany?.id;
  const rates = _readTaxSettingsFromUI() || loadTaxSettings(companyId);

  const adjExecBonus     = parseFloat(document.getElementById('tax_adj_exec_bonus')?.value     || 0);
  const adjEntertainment = parseFloat(document.getElementById('tax_adj_entertainment')?.value   || 0);
  const adjAdd           = parseFloat(document.getElementById('tax_adj_add')?.value             || 0);
  const adjBizTax        = parseFloat(document.getElementById('tax_adj_biztax')?.value          || 0);
  const adjSub           = parseFloat(document.getElementById('tax_adj_sub')?.value             || 0);
  const nolRaw           = parseFloat(document.getElementById('tax_nol')?.value                 || 0);
  const taxCredit        = parseFloat(document.getElementById('tax_credit')?.value              || 0);

  // 税務調整を保存（ページ移動後も復元できるよう）
  const _adjCompanyId = window.App?.currentCompany?.id;
  const _adjYear = window.App?.currentYear || new Date().getFullYear();
  saveTaxAdj(_adjCompanyId, _adjYear, {
    exec_bonus: adjExecBonus || undefined,
    entertainment: adjEntertainment || undefined,
    add: adjAdd || undefined,
    biztax: adjBizTax || undefined,
    sub: adjSub || undefined,
    nol: nolRaw || undefined,
    tax_credit: taxCredit || undefined,
  });

  const totalAdd = adjExecBonus + adjEntertainment + adjAdd;
  const totalSub = adjBizTax + adjSub;

  // 課税所得 = 税引前利益 + 加算 - 減算 - 欠損金
  const incomeBeforeNol = pretax + totalAdd - totalSub;
  const small = isSmall(capital);
  // 欠損金控除: 中小は100%、大法人は50%上限
  const nolLimit = small ? incomeBeforeNol : incomeBeforeNol * 0.5;
  const nolDeduction = Math.min(Math.abs(nolRaw), Math.max(0, nolLimit));
  const taxableIncome = Math.max(0, incomeBeforeNol - nolDeduction);

  const includeDefense = document.getElementById('tax_defense')?.checked || false;
  const taxes = calcAllTax(taxableIncome, capital, { includeDefense, rates, taxCredit });

  const prepaid = prepaid1;
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

  // 計算内訳テキスト生成（taxBase = 千円未満切捨て済の課税標準）
  const taxBase = trunc1000(taxableIncome);
  const sub = s => `<div style="font-size:10px;color:var(--text-muted);margin-top:1px">${s}</div>`;
  const pct = v => parseFloat((v * 100).toFixed(3)) + '%';
  const fmtM = v => (v / 10000).toFixed(0) + '万';

  let corpDetail;
  if (small) {
    if (taxBase <= THRESHOLD_800) {
      corpDetail = `課税所得 ${fmtM(taxBase)} × ${pct(rates.corp_small_low)}`;
    } else {
      corpDetail = `800万 × ${pct(rates.corp_small_low)} ＋ ${fmtM(taxBase - THRESHOLD_800)} × ${pct(rates.corp_small_high)}`;
    }
  } else {
    corpDetail = `課税所得 ${fmtM(taxBase)} × ${pct(rates.corp_large)}（大法人）`;
  }

  const localCorpDetail  = `課税標準 ${fmt(taxes.localCorpBase)} × ${pct(rates.local_corp)}`;
  const prefWariDetail   = `法人税 ${fmt(taxes.wariBase)} × ${pct(rates.pref_wari)}`;
  const prefKintouDetail = `均等割（道府県）`;
  const cityWariDetail   = `法人税 ${fmt(taxes.wariBase)} × ${pct(rates.city_wari)}`;
  const cityKintouDetail = `均等割（市町村）`;

  let bizDetail;
  if (small) {
    if (taxBase <= THRESHOLD_400) {
      bizDetail = `${fmtM(taxBase)} × ${pct(rates.biz_low)}`;
    } else if (taxBase <= THRESHOLD_800) {
      bizDetail = `400万×${pct(rates.biz_low)} ＋ ${fmtM(taxBase-THRESHOLD_400)}×${pct(rates.biz_mid)}`;
    } else {
      bizDetail = `400万×${pct(rates.biz_low)} ＋ 400万×${pct(rates.biz_mid)} ＋ ${fmtM(taxBase-THRESHOLD_800)}×${pct(rates.biz_high)}`;
    }
  } else {
    bizDetail = `課税所得 ${fmtM(taxBase)} × ${pct(rates.biz_high)}（外形非対象）`;
  }
  const specialDetail = `軽減ベース ${fmt(taxes.specialBase)} × ${pct(rates.biz_special)}`;

  const tbody = document.getElementById('tax_tbody');
  if (!tbody) return;
  const corpCreditNote = taxCredit > 0 ? sub(`税額控除 ${fmt(taxCredit)} 控除後`) : '';
  tbody.innerHTML = `
    <tr><td>法人税${sub(corpDetail)}${corpCreditNote}</td><td class="num">${fmt(taxes.corp)}</td></tr>
    <tr><td>地方法人税${sub(localCorpDetail)}</td><td class="num">${fmt(taxes.localCorp)}</td></tr>
    <tr style="color:var(--text-muted)"><td style="padding-left:8px;font-size:12px">道府県民税　法人税割${sub(prefWariDetail)}</td><td class="num" style="font-size:12px">${fmt(taxes.prefWari)}</td></tr>
    <tr style="color:var(--text-muted)"><td style="padding-left:8px;font-size:12px">道府県民税　均等割${sub(prefKintouDetail)}</td><td class="num" style="font-size:12px">${fmt(taxes.prefKintou)}</td></tr>
    <tr style="color:var(--text-muted)"><td style="padding-left:8px;font-size:12px">市町村民税　法人税割${sub(cityWariDetail)}</td><td class="num" style="font-size:12px">${fmt(taxes.cityWari)}</td></tr>
    <tr style="color:var(--text-muted)"><td style="padding-left:8px;font-size:12px">市町村民税　均等割${sub(cityKintouDetail)}</td><td class="num" style="font-size:12px">${fmt(taxes.cityKintou)}</td></tr>
    <tr><td>法人事業税${sub(bizDetail)}</td><td class="num">${fmt(taxes.business)}</td></tr>
    <tr><td>特別法人事業税${sub(specialDetail)}</td><td class="num">${fmt(taxes.special)}</td></tr>
    ${includeDefense ? `<tr style="color:#7c3aed"><td>防衛特別法人税${sub('（法人税額 − 500万円）× 4%　※2026年4月施行')}</td><td class="num">${fmt(taxes.defense)}</td></tr>` : ''}
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
  if (!budget) { showAlert('予算データがありません', 'warn'); return; }
  if (window._lastTaxTotal === null || window._lastTaxTotal === undefined ||
      window._lastTaxCompanyId !== window.App?.currentCompany?.id) {
    runTaxSim();  // 未計算 or 別会社のデータなら先に計算してから反映
  }
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
}

// 消費税関連ページ
// ---- 消費税・科目別簡易計算ヘルパー ----

function _ctaxAcctCalc(budget, company) {
  if (!budget?.dynamicAccounts?.length) return null;
  // 旧データ移行: company.ctaxClassification → budget.ctaxClassification（一度だけ）
  if (!budget.ctaxClassification && company?.ctaxClassification && Object.keys(company.ctaxClassification).length) {
    budget.ctaxClassification = { ...company.ctaxClassification };
    saveBudget(budget);
  }
  const cls  = budget.ctaxClassification || {};
  // 末端科目（type=input）のみ対象 → 親集計不要。getMergedRows で実績月(actualRows)+予算月(rows)を正しくブレンド
  const merged = getMergedRows(budget);
  let taxableRevenue = 0, taxableExpense = 0;
  for (const acc of budget.dynamicAccounts) {
    // input（予算入力）と rev_display（未確定・実績表示）の両方を対象にする
    if (acc.type !== 'input' && acc.type !== 'rev_display') continue;
    if (cls[acc.id] === false) continue;
    // BS残高科目（section = bs_asset/bs_liab/bs_equity）は除外 — 残高は月次フローではないため
    if (acc.section?.startsWith('bs')) continue;
    // 実績＋予算ブレンド済み月次値（調整欄 index 12 含む）
    const vals = merged[acc.id] || [];
    const total = vals.reduce((s, v, i) => i <= 12 ? s + Math.abs(v || 0) : s, 0);
    if (acc.sign === 1) taxableRevenue += total;
    else                taxableExpense += total;
  }
  return {
    taxableRevenue,
    taxableExpense,
    kariUke:   taxableRevenue * 0.1,
    kariHarai: taxableExpense * 0.1,
    ctax: (taxableRevenue - taxableExpense) * 0.1,
  };
}

function _ctaxAcctResultHtml(calc, ctaxPrepaid) {
  if (!calc) return '<div class="no-data-small">補助科目データがありません</div>';
  const balance = calc.ctax - (ctaxPrepaid || 0);
  return `
    <div class="tax-kpi-row"><span>課税売上合計</span><span>${Math.round(calc.taxableRevenue/1000).toLocaleString()}千円</span></div>
    <div class="tax-kpi-row"><span>課税仕入合計</span><span>${Math.round(calc.taxableExpense/1000).toLocaleString()}千円</span></div>
    <hr style="margin:6px 0;border-color:var(--border);border-style:dashed">
    <div class="tax-kpi-row"><span>仮受消費税（課税売上×10%）</span><span>${Math.round(calc.kariUke/1000).toLocaleString()}千円</span></div>
    <div class="tax-kpi-row"><span>仮払消費税（課税仕入×10%）</span><span>▲${Math.round(calc.kariHarai/1000).toLocaleString()}千円</span></div>
    <div class="tax-kpi-total"><span>消費税額（推計）</span><span>${Math.round(calc.ctax/1000).toLocaleString()}千円</span></div>
    <div class="tax-kpi-row"><span>中間納付額</span><span>▲${Math.round((ctaxPrepaid||0)/1000).toLocaleString()}千円</span></div>
    <div class="tax-kpi-row ${balance>=0?'tax-pay':'tax-refund'}">
      <span>${balance>=0?'確定申告　納付見込':'確定申告　還付見込'}</span>
      <span><strong>${Math.round(Math.abs(balance)/1000).toLocaleString()}千円</strong></span>
    </div>`;
}

function setCtaxClassification(accId, checked) {
  const company = window.App?.currentCompany;
  const budget  = window.App?.currentBudget;
  if (!company || !budget) return;
  if (!budget.ctaxClassification) budget.ctaxClassification = {};
  budget.ctaxClassification[accId] = !!checked;
  saveBudget(budget);
  const el = document.getElementById('ctax_acct_result');
  if (el) {
    const co = window.App?.currentCompany;
    const cy = window.App?.currentYear || new Date().getFullYear();
    const sv = loadTaxSummaryData(co?.id, cy);
    const sp = (parseFloat(sv['i_ctax']) || 0) + (parseFloat(sv['i_localCtax']) || 0);
    el.innerHTML = _ctaxAcctResultHtml(_ctaxAcctCalc(budget, co), sp);
  }
}

function toggleCtaxClassification(accId) {
  const company = window.App?.currentCompany;
  const budget = window.App?.currentBudget;
  setCtaxClassification(accId, !(budget?.ctaxClassification?.[accId] !== false));
}

// ---- メイン ----

function updateCtaxInterim(key, val) {
  const company = window.App?.currentCompany;
  const curYear = window.App?.currentYear || new Date().getFullYear();
  if (!company) return;
  const saved = loadTaxSummaryData(company.id, curYear);
  saved[key] = parseFloat(val) || 0;
  saveTaxSummaryData(company.id, curYear, saved);
  // 概算パネルを再描画して①②③の中間納付額・納付見込を更新
  if (window._ctaxContainer) {
    const inputCtax   = document.getElementById('ctaxp_i_ctax')?.value;
    const inputLctax  = document.getElementById('ctaxp_i_localCtax')?.value;
    renderCtaxJudge(window._ctaxContainer);
    // 再描画後にフォーカスが外れるので入力値を復元
    const elC = document.getElementById('ctaxp_i_ctax');
    const elL = document.getElementById('ctaxp_i_localCtax');
    if (elC && inputCtax  != null) elC.value  = inputCtax;
    if (elL && inputLctax != null) elL.value  = inputLctax;
  }
}

function renderCtaxJudge(container) {
  window._ctaxContainer = container;
  const company = window.App?.currentCompany;
  const budget  = window.App?.currentBudget;
  const ctaxEst = (company && budget) ? calcCtaxEstimate(budget, company) : null;
  const hasDynamic = !!budget?.dynamicAccounts?.length;

  // 中間納付額 — taxsummary_v1 から読み込み（税金一覧表・消費税ページで共有）
  const ctaxCurYear = window.App?.currentYear || new Date().getFullYear();
  const ctaxTsaved  = loadTaxSummaryData(company?.id, ctaxCurYear);
  const ctaxStoredPrepaid = (parseFloat(ctaxTsaved['i_ctax']) || 0) + (parseFloat(ctaxTsaved['i_localCtax']) || 0);

  // ③ 簡易課税列は動的科目があれば常に表示（どのブランチでも共通）
  const kaniCol = hasDynamic ? `
    <div style="border-left:1px solid var(--border);padding-left:16px">
      <div class="ctax-method-label">③ 簡易課税（業種別）</div>
      ${_kaniColHtml(budget, company, ctaxCurYear, ctaxStoredPrepaid)}
    </div>` : '';

  const estHtml = (() => {
    if (!ctaxEst) return '<div class="no-data-small">会社情報・予算データがありません</div>';
    if (ctaxEst.exempt) return `
      <div class="no-data-small">免税事業者のため消費税概算は不要です</div>
      ${hasDynamic ? `
        <div style="display:grid;grid-template-columns:1fr;gap:0 16px;margin-top:8px">
          ${kaniCol}
        </div>` : ''}`;

    const isHonzoku  = ctaxEst.method !== 'kani';
    const showTabs   = isHonzoku && hasDynamic && !ctaxEst.noData;
    const acctOnly   = isHonzoku && ctaxEst.noData && hasDynamic;

    // 本則課税 + 動的科目あり + noData → 科目別タブのみ表示
    if (acctOnly) {
      window._ctaxTab = 'acct';
      return `
        <div class="tax-kpi-row"><span>計算方法</span><span>本則課税</span></div>
        <div style="font-size:11px;color:var(--text-muted);margin:4px 0 8px">仮払・仮受消費税の残高データなし。科目別簡易計算をご利用ください。</div>
        ${_ctaxAcctTabHtml(budget, company)}`;
    }

    const usedPrepaid = ctaxStoredPrepaid;
    const balance = (ctaxEst.ctax || 0) - usedPrepaid;
    const acctCalc = hasDynamic ? _ctaxAcctCalc(budget, company) : null;

    // ① 試算表ベース コンテンツ
    const metodLabel = isHonzoku
      ? '本則課税'
      : `簡易課税（第${ctaxEst.businessType}種・みなし${Math.round((ctaxEst.minasRate ?? 0)*100)}%）`;

    const bsContent = ctaxEst.method === 'kani' ? `
        <div class="tax-kpi-row"><span>売上高（年間試算）</span><span>${Math.round(ctaxEst.salesTotal/1000).toLocaleString()}千円</span></div>
        <div class="tax-kpi-row"><span>仮受消費税相当</span><span>${Math.round(ctaxEst.outputTax/1000).toLocaleString()}千円</span></div>
        <div class="tax-kpi-row"><span>みなし仕入税額控除</span><span>▲${Math.round(ctaxEst.outputTax*ctaxEst.minasRate/1000).toLocaleString()}千円</span></div>
      ` : (() => {
        const hasActual = ctaxEst.actualMonths > 0;
        const ml = getMonthLabels ? getMonthLabels(budget.startMonth || 4) : [];
        const throughLabel = hasActual && ml[ctaxEst.actualThrough] ? ml[ctaxEst.actualThrough] : '';
        const actualLabel  = hasActual ? `実績 ${throughLabel}まで ${ctaxEst.actualMonths}か月` : null;
        return `
          ${hasActual ? `
            <div class="tax-kpi-row" style="color:var(--text-muted);font-size:11px;padding:4px 0 2px">── 実績確定分 ──</div>
            <div class="tax-kpi-row"><span>仮受消費税（${actualLabel}）</span><span>${Math.round(ctaxEst.kariUkeActual/1000).toLocaleString()}千円</span></div>
            <div class="tax-kpi-row"><span>仮払消費税（${actualLabel}）</span><span>▲${Math.round(ctaxEst.kariHaraiActual/1000).toLocaleString()}千円</span></div>
            <div class="tax-kpi-row" style="color:var(--text-muted);font-size:11px;padding:6px 0 2px">── 年間試算（実績残高÷月数×12） ──</div>
          ` : ''}
          <div class="tax-kpi-row"><span>仮受消費税（年間試算）</span><span>${Math.round(ctaxEst.kariUke/1000).toLocaleString()}千円</span></div>
          <div class="tax-kpi-row"><span>仮払消費税（年間試算）</span><span>▲${Math.round(ctaxEst.kariHarai/1000).toLocaleString()}千円</span></div>
        `;
      })();

    const bsFooter = `
      <div class="tax-kpi-total"><span>消費税額（概算）</span><span>${Math.round(ctaxEst.ctax/1000).toLocaleString()}千円</span></div>
      <div class="tax-kpi-row"><span>中間納付額</span><span>▲${Math.round(usedPrepaid/1000).toLocaleString()}千円</span></div>
      <div class="tax-kpi-row ${balance>=0?'tax-pay':'tax-refund'}">
        <span>${balance>=0?'確定申告　納付見込':'確定申告　還付見込'}</span>
        <span><strong>${Math.round(Math.abs(balance)/1000).toLocaleString()}千円</strong></span>
      </div>`;

    const note = `<div style="margin-top:8px;font-size:10px;color:var(--text-muted)">※概算値。</div>`;

    // 両方並列表示（① ② ③ の3列）
    if (showTabs && acctCalc) {
      return `
        <div class="tax-kpi-row"><span>計算方法</span><span>本則課税</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 16px;margin-top:8px;align-items:start">
          <div>
            <div class="ctax-method-label">① 試算表ベース</div>
            ${bsContent}
            ${bsFooter}
          </div>
          <div style="border-left:1px solid var(--border);padding-left:16px">
            <div class="ctax-method-label">② 科目別簡易計算</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">課税科目は「月次予算入力」の各科目行で設定</div>
            <div id="ctax_acct_result">${_ctaxAcctResultHtml(acctCalc, ctaxStoredPrepaid)}</div>
          </div>
          ${kaniCol}
        </div>
        ${note}`;
    }

    // 科目別のみ（BSデータなし）
    if (acctOnly) {
      return `
        <div class="tax-kpi-row"><span>計算方法</span><span>本則課税</span></div>
        <div style="font-size:11px;color:var(--text-muted);margin:4px 0 8px">仮払・仮受消費税の残高データなし。科目別簡易計算をご利用ください。</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px;margin-top:8px;align-items:start">
          <div>
            <div class="ctax-method-label">② 科目別簡易計算</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">課税科目は「月次予算入力」の各科目行で設定</div>
            <div id="ctax_acct_result">${_ctaxAcctResultHtml(acctCalc, ctaxStoredPrepaid)}</div>
          </div>
          ${kaniCol}
        </div>
        ${note}`;
    }

    // ① のみ（動的科目なし）
    if (!hasDynamic) return `
      <div class="tax-kpi-row"><span>計算方法</span><span>${metodLabel}</span></div>
      ${bsContent}
      ${bsFooter}
      ${note}`;

    // 簡易課税 + 動的科目あり → 原則課税同様の3列比較表示（Bug(5)）
    if (!isHonzoku && acctCalc) return `
      <div class="tax-kpi-row"><span>計算方法</span><span>${metodLabel}</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 16px;margin-top:8px;align-items:start">
        <div>
          <div class="ctax-method-label">① 試算表ベース</div>
          ${bsContent}${bsFooter}
        </div>
        <div style="border-left:1px solid var(--border);padding-left:16px">
          <div class="ctax-method-label">② 科目別簡易計算</div>
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">課税科目は「月次予算入力」の各科目行で設定</div>
          <div id="ctax_acct_result">${_ctaxAcctResultHtml(acctCalc, ctaxStoredPrepaid)}</div>
        </div>
        ${kaniCol}
      </div>
      ${note}`;

    // ① + ③（動的科目あり、BS試算表のみ）
    return `
      <div class="tax-kpi-row"><span>計算方法</span><span>${metodLabel}</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px;margin-top:8px;align-items:start">
        <div>
          <div class="ctax-method-label">① 試算表ベース</div>
          ${bsContent}${bsFooter}
        </div>
        ${kaniCol}
      </div>
      ${note}`;
  })();

  // 中間納付 input — taxsummary_v1 と連動（ctaxCurYear / ctaxTsaved は上部で定義済み）
  const ctaxPrepaidSection = company ? `
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">💳 中間申告納付（直接入力・税金一覧表と連動）</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="form-group" style="margin-bottom:0">
          <label style="font-size:11px">消費税　中間納付額（円）</label>
          <input type="number" id="ctaxp_i_ctax" value="${ctaxTsaved['i_ctax'] || ''}" class="form-input" step="10000" placeholder="0"
            oninput="updateCtaxInterim('i_ctax', this.value)">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label style="font-size:11px">地方消費税　中間納付額（円）</label>
          <input type="number" id="ctaxp_i_localCtax" value="${ctaxTsaved['i_localCtax'] || ''}" class="form-input" step="10000" placeholder="0"
            oninput="updateCtaxInterim('i_localCtax', this.value)">
        </div>
      </div>
    </div>` : '';

  container.innerHTML = `
    <div class="sim-panel">
      <h2 class="section-title">消費税関連</h2>
      <div class="card-h" style="margin-bottom:16px">
        <h3>💰 消費税額概算</h3>
        ${estHtml}
        ${ctaxPrepaidSection}
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
            <button class="btn-solid" onclick="runCtaxJudge()">判定</button>
            ${company ? `<button class="btn btn-sm btn-outline" onclick="saveCtaxToCompany()">会社情報に保存</button>` : ''}
          </div>
          <div id="ctax_result" class="ctax-result" style="margin-top:14px"></div>
        </div>
      </div>
    </div>`;
  runCtaxJudge();
  if (budget?.dynamicAccounts?.length) _kaniCalc(company, ctaxCurYear);
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

// ===== ③ 簡易課税 科目別業種区分 =====

const KANI_MINAS = { 1:0.90, 2:0.80, 3:0.70, 4:0.60, 5:0.50, 6:0.40 };

// 勘定科目ベースの課税売上科目を返す
// 設計: 売上セクションの「直接の子」だけを返す
//   - 2層構造（section → input補助科目）: 補助科目を表示
//   - 3層構造（section → header勘定科目 → input補助科目）: 勘定科目を表示
// calcAllValuesDynamic がヘッダーの子を集計済みなので av[id] の値はどちらも正しい
function _kaniRevAccs(budget) {
  if (!budget?.dynamicAccounts?.length) return [];

  // 売上セクション特定: id='sec_revenue' または名前に売上/収入を含む section 型
  const revSection = budget.dynamicAccounts.find(a =>
    a.id === 'sec_revenue' ||
    (a.type === 'section' && a.sign === 1 && /売上|収入/i.test(a.name || ''))
  );
  // 静的科目（accounts.js）のフォールバック: parentId='sales' の科目
  if (!revSection) {
    return budget.dynamicAccounts.filter(a =>
      a.parentId === 'sales' && (a.type === 'input' || a.type === 'rev_display') && a.sign === 1
    );
  }

  // 売上セクションの直接の子（section 以外の全型）
  return budget.dynamicAccounts.filter(a =>
    a.parentId === revSection.id && a.type !== 'section' && a.type !== 'calculated'
  );
}
const KANI_LABEL = { 1:'第1種（卸売）', 2:'第2種（小売）', 3:'第3種（製造等）', 4:'第4種（その他）', 5:'第5種（サービス等）', 6:'第6種（不動産）' };

function _kaniKey(company, year) {
  return `kani_ctax_v1_${company?.id || ''}_${year || ''}`;
}

function _kaniSave(company, year) {
  const data = {};
  document.querySelectorAll('[data-kani-acc]').forEach(el => {
    data[el.dataset.kaniAcc] = parseInt(el.value) || 5;
  });
  const otherEl   = document.getElementById('kani_other_sales');
  const otherType = document.getElementById('kani_other_type');
  data._otherSales = parseFloat(otherEl?.value) || 0;
  data._otherType  = parseInt(otherType?.value) || 4;
  localStorage.setItem(_kaniKey(company, year), JSON.stringify(data));
  _kaniCalc(company, year);
}

function _kaniCalc(company, year) {
  const data = {};
  document.querySelectorAll('[data-kani-acc]').forEach(el => {
    data[el.dataset.kaniAcc] = parseInt(el.value) || 5;
  });
  const otherSales = parseFloat(document.getElementById('kani_other_sales')?.value) || 0;

  const budget = window.App?.currentBudget;
  if (!budget) return;

  // getMergedRows で実績+予算をブレンド（actualRows のみの会社でも正しく取得）
  const allVals = budget.dynamicAccounts
    ? calcAllValuesDynamic({ ...budget, rows: getMergedRows(budget) })
    : calcAllValues(budget.rows);

  // 科目ごとに消費税計算（勘定科目ベース = 補助科目除外）
  let totalSales = 0, totalCtax = 0;
  const rows = [];
  _kaniRevAccs(budget).forEach(acc => {
    const annual = (allVals[acc.id] || []).slice(0, 13).reduce((s, v) => s + Math.abs(v || 0), 0);
    if (annual === 0) return;
    const type = data[acc.id] || 5;
    const minas = KANI_MINAS[type] || 0.50;
    const ctax = annual * 0.10 * (1 - minas);
    totalSales += annual;
    totalCtax  += ctax;
    rows.push({ name: acc.name, annual, type, minas, ctax });
  });

  // その他
  if (otherSales > 0) {
    const type = parseInt(document.getElementById('kani_other_type')?.value) || 4;
    const minas = KANI_MINAS[type] || 0.60;
    const ctax = otherSales * 0.10 * (1 - minas);
    totalSales += otherSales;
    totalCtax  += ctax;
    rows.push({ name: 'その他', annual: otherSales, type, minas, ctax });
  }

  // 結果表示更新（#kani_result に種別集計 + 合計 + 中間納付 + 納付見込を出力）
  const resEl = document.getElementById('kani_result');
  if (!resEl) return;
  const fmtN = v => Math.round(v / 1000).toLocaleString('ja-JP');

  if (rows.length === 0) {
    resEl.innerHTML = '<div class="tax-kpi-row" style="color:var(--text-muted);font-size:11px">売上データがありません</div>';
    return;
  }

  // 種別集計
  const byType = {};
  rows.forEach(r => { byType[r.type] = (byType[r.type] || 0) + r.ctax; });
  const typeRows = Object.keys(byType).sort((a,b) => +a - +b).map(t =>
    `<div class="tax-kpi-row" style="font-size:11px;color:var(--text-muted)">
       <span>第${t}種（みなし${Math.round(KANI_MINAS[+t]*100)}%）</span>
       <span>${fmtN(byType[t])}千円</span>
     </div>`
  ).join('');

  // 中間納付（taxsummary から読む）
  const co = window.App?.currentCompany;
  const cy = window.App?.currentYear || new Date().getFullYear();
  const sv = loadTaxSummaryData(co?.id, cy);
  const prepaid = (parseFloat(sv['i_ctax']) || 0) + (parseFloat(sv['i_localCtax']) || 0);
  const kaniTotal = Math.round(totalCtax);
  const balance   = kaniTotal - prepaid;

  resEl.innerHTML = `
    <div style="border-top:1px solid var(--border);margin-top:8px;padding-top:8px">
      ${typeRows}
    </div>
    <div class="tax-kpi-total" style="margin-top:6px"><span>消費税額（推計）</span><span>${fmtN(kaniTotal)}千円</span></div>
    <div class="tax-kpi-row"><span>中間納付額</span><span>▲${fmtN(prepaid)}千円</span></div>
    <div class="tax-kpi-row ${balance>=0?'tax-pay':'tax-refund'}">
      <span>${balance>=0?'確定申告　納付見込':'確定申告　還付見込'}</span>
      <span><strong>${fmtN(Math.abs(balance))}千円</strong></span>
    </div>`;
}

// 簡易課税の消費税合計を返す純計算関数（DOM不要・forecast-reportからも呼び出し可）
function _kaniCtaxTotal(budget, company, year) {
  if (!budget?.dynamicAccounts?.length) return 0;
  const saved = {};
  try { Object.assign(saved, JSON.parse(localStorage.getItem(_kaniKey(company, year)) || '{}')); } catch(e) {}

  const allVals = calcAllValuesDynamic({ ...budget, rows: getMergedRows(budget) });

  let total = 0;
  _kaniRevAccs(budget).forEach(acc => {
    const annual = (allVals[acc.id] || []).slice(0, 13).reduce((s, v) => s + Math.abs(v || 0), 0);
    if (!annual) return;
    const type  = saved[acc.id] || 5;
    total += annual * 0.10 * (1 - (KANI_MINAS[type] || 0.50));
  });

  const otherSales = saved._otherSales || 0;
  if (otherSales > 0) {
    const type = saved._otherType || 4;
    total += otherSales * 0.10 * (1 - (KANI_MINAS[type] || 0.60));
  }
  return Math.round(total);
}

// ③ 列のコンテンツHTMLを返す（外枠なし・estHtml の3列目として埋め込む）
function _kaniColHtml(budget, company, year, prepaid) {
  if (!budget?.dynamicAccounts?.length) {
    return '<div style="color:var(--text-muted);font-size:11px">予算データがありません</div>';
  }
  const saved = {};
  try { Object.assign(saved, JSON.parse(localStorage.getItem(_kaniKey(company, year)) || '{}')); } catch(e) {}

  const merged     = getMergedRows(budget);
  const mergedVals = calcAllValuesDynamic({ ...budget, rows: merged });

  const typeOpts = (accId, def) => [1,2,3,4,5,6].map(t =>
    `<option value="${t}" ${(saved[accId] ?? def) === t ? 'selected' : ''}>${t}種</option>`
  ).join('');

  const revAccs = _kaniRevAccs(budget);

  const accRows = revAccs.map(acc => {
    const annual = (mergedVals[acc.id] || []).slice(0, 13).reduce((s, v) => s + Math.abs(v || 0), 0);
    const fmtA   = Math.round(annual / 1000).toLocaleString();
    return `
      <div style="display:grid;grid-template-columns:1fr auto auto;gap:4px;align-items:center;border-bottom:1px solid var(--border);padding:4px 0">
        <span style="font-size:11px">${escHtml(acc.name)}</span>
        <span style="font-size:11px;color:var(--text-muted);white-space:nowrap">${fmtA}千円</span>
        <select data-kani-acc="${acc.id}" style="font-size:10px;padding:1px 2px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);height:24px"
          onchange="_kaniSave(window.App?.currentCompany, window.App?.currentYear)">
          ${typeOpts(acc.id, 5)}
        </select>
      </div>`;
  }).join('');

  const otherSales = saved._otherSales || 0;
  const otherType  = saved._otherType  || 4;
  const otherRow = `
    <div style="display:grid;grid-template-columns:1fr auto auto;gap:4px;align-items:center;padding:4px 0;border-top:1px dashed var(--border)">
      <span style="font-size:11px;color:var(--text-muted)">その他</span>
      <input type="number" id="kani_other_sales" value="${otherSales || ''}" placeholder="円" step="100000"
        style="font-size:10px;padding:1px 4px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);height:24px;width:90px;text-align:right"
        oninput="_kaniSave(window.App?.currentCompany, window.App?.currentYear)">
      <select id="kani_other_type" style="font-size:10px;padding:1px 2px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);height:24px"
        onchange="_kaniSave(window.App?.currentCompany, window.App?.currentYear)">
        ${[1,2,3,4,5,6].map(t => `<option value="${t}" ${otherType===t?'selected':''}>${t}種</option>`).join('')}
      </select>
    </div>`;

  return `
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">売上科目ごとに業種区分を設定</div>
    ${accRows}
    ${otherRow}
    <div id="kani_result" style="margin-top:6px">
      <div style="color:var(--text-muted);font-size:11px">↑ 種を選択すると自動計算されます</div>
    </div>`;
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
  _showToast('会社情報を更新しました');
}
