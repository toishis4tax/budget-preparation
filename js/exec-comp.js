// 役員報酬・役員賞与 最適化シミュレーター

// 給与所得控除（令和2年分以降）
function calcSalaryDeduction(annualSalary) {
  if      (annualSalary <= 1_625_000) return 550_000;
  else if (annualSalary <= 1_800_000) return Math.floor(annualSalary * 0.4) - 100_000;
  else if (annualSalary <= 3_600_000) return Math.floor(annualSalary * 0.3) + 80_000;
  else if (annualSalary <= 6_600_000) return Math.floor(annualSalary * 0.2) + 440_000;
  else if (annualSalary <= 8_500_000) return Math.floor(annualSalary * 0.1) + 1_100_000;
  else                                return 1_950_000;
}

// 所得税簡易計算（給与所得控除後・基礎控除48万円適用）
function calcIncomeTax(annualSalary) {
  const deduction = calcSalaryDeduction(annualSalary);
  const taxable = Math.max(0, annualSalary - deduction - 480_000); // 基礎控除
  // 所得税率（超過累進）
  const BRACKETS = [
    [1_950_000, 0.05,  0],
    [3_300_000, 0.10,  97_500],
    [6_950_000, 0.20,  427_500],
    [9_000_000, 0.23,  636_000],
    [18_000_000, 0.33, 1_536_000],
    [40_000_000, 0.40, 2_796_000],
    [Infinity,   0.45, 4_796_000],
  ];
  let tax = 0;
  for (const [limit, rate, deduct] of BRACKETS) {
    if (taxable <= limit) { tax = taxable * rate - deduct; break; }
  }
  // 復興特別所得税 2.1%
  return Math.max(0, Math.round(tax * 1.021));
}

// 住民税概算（所得割10%＋均等割。給与所得控除は所得税と共通、基礎控除43万円）
function calcResidentTax(annualSalary) {
  const deduction = calcSalaryDeduction(annualSalary);
  const taxable = Math.max(0, annualSalary - deduction - 430_000); // 住民税の基礎控除43万
  if (taxable <= 0) return 0;
  return Math.round(taxable * 0.10) + 5_000; // 所得割10% ＋ 均等割（概算5,000円）
}

// 個人社会保険料（本人負担）
function calcPersonalSI(monthlySalary, bonusAnnual, age, pref) {
  const r = calcSocialInsurance(monthlySalary, bonusAnnual, age, pref);
  // 本人負担 ≒ 会社負担（折半）
  return r.monthly; // approx same as company side
}

// 役員報酬シナリオ計算
function calcExecScenario(monthlySalary, bonusAnnual, age, pref, capital) {
  const annual      = monthlySalary * 12 + bonusAnnual;
  const si          = calcSocialInsurance(monthlySalary, bonusAnnual, age, pref);
  const companyTotal = annual + si.annual; // 会社トータルコスト（役員報酬＋会社負担社保）
  const personalSI   = si.personalAnnual;  // 本人負担社保（子ども・子育て拠出金を除く）
  const incomeTax    = calcIncomeTax(annual);
  const residentTax  = calcResidentTax(annual);
  const takeHome     = annual - personalSI - incomeTax - residentTax;
  const effectiveRate = annual > 0 ? ((personalSI + incomeTax + residentTax) / annual * 100) : 0;
  return {
    monthly: monthlySalary, bonus: bonusAnnual, annual,
    companyTotal, companySI: si.annual,
    personalSI, incomeTax, residentTax, takeHome, effectiveRate,
  };
}

// ====== レンダリング ======

let _execState = {
  officers: [{ name: '代表取締役', monthly: 800000, bonuses: [{ month: 6, amount: 0 }, { month: 12, amount: 0 }], age: 50 }],
  pref: '東京都',
  targetProfit: 0,
};

let _execTab = 'si'; // 'zero' | 'optimize' | 'si'

const EXEC_COMP_KEY = 'exec_comp_state_v2';

function _execTotalBonus(officer) {
  return (officer.bonuses || []).reduce((s, b) => s + (b.amount || 0), 0);
}

function _execLoad() {
  const cid = window.App?.currentCompany?.id;
  if (!cid) return;
  try {
    const raw = localStorage.getItem(EXEC_COMP_KEY);
    const all = raw ? JSON.parse(raw) : {};
    const saved = all[cid];
    if (saved?.officers?.length) {
      _execState.officers = saved.officers.map(o => ({
        ...o,
        // migrate old single-bonus field to bonuses array
        bonuses: o.bonuses || (o.bonus
          ? [{ month: 6, amount: Math.round((o.bonus || 0) / 2) }, { month: 12, amount: Math.round((o.bonus || 0) / 2) }]
          : [{ month: 6, amount: 0 }, { month: 12, amount: 0 }]),
      }));
    }
  } catch {}
}

function _execSave() {
  const cid = window.App?.currentCompany?.id;
  if (!cid) return;
  try {
    const raw = localStorage.getItem(EXEC_COMP_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[cid] = { officers: _execState.officers };
    localStorage.setItem(EXEC_COMP_KEY, JSON.stringify(all));
  } catch {}
}

// 役員1人の月次法定福利費（カレンダー月配列、index0=1月）
function _execCalcOfficerMonthly(officer, pref) {
  const rates    = (typeof KENPO_RATES !== 'undefined' ? (KENPO_RATES[pref] || KENPO_RATES['東京都']) : null) || { health: 0.0991, care: 0.0159 };
  const careFlag = (officer.age || 50) >= 40 && (officer.age || 50) < 65;
  const stdP = Math.min(officer.monthly || 0, PENSION_MAX_STD);
  const stdH = Math.min(officer.monthly || 0, HEALTH_MAX_STD);
  const healthC  = Math.floor(stdH * rates.health / 2);
  const careC    = careFlag ? Math.floor(stdH * rates.care / 2) : 0;
  const pensionC = Math.floor(stdP * KOSEI_RATE / 2);
  const kodomoC  = Math.floor(stdP * KODOMO_RATE);
  const monthlySI = healthC + careC + pensionC + kodomoC;
  const result = Array(12).fill(monthlySI);
  // 健保は年度累計573万円上限のため支給月順に累計管理（保険年度=4月〜3月）
  let healthCumulative = 0;
  const sortedBonuses = [...(officer.bonuses || [])].sort((a, b) => {
    const ai = ((a.month || 1) - 4 + 12) % 12;
    const bi = ((b.month || 1) - 4 + 12) % 12;
    return ai - bi;
  });
  sortedBonuses.forEach(b => {
    const m = (b.month || 1) - 1;
    const remaining = Math.max(0, BONUS_MAX_HEALTH - healthCumulative);
    const sbH = Math.min(b.amount || 0, remaining);
    const sbP = Math.min(b.amount || 0, BONUS_MAX_PENSION);
    healthCumulative += b.amount || 0;
    result[m] += Math.floor(sbH * rates.health / 2) +
                 (careFlag ? Math.floor(sbH * rates.care / 2) : 0) +
                 Math.floor(sbP * KOSEI_RATE / 2) +
                 Math.floor(sbP * KODOMO_RATE);
  });
  return result;
}

function _execCalcBreakdown(pref, startMonth) {
  const regularSI  = Array(12).fill(0);
  const bonusSI    = Array(12).fill(0);
  const bonusSalary = Array(12).fill(0);
  _execState.officers.forEach(o => {
    const baseSI     = calcSocialInsurance(o.monthly || 0, 0, o.age || 50, pref).monthly;
    const calMonthly = _execCalcOfficerMonthly(o, pref);
    for (let i = 0; i < 12; i++) {
      const calIdx = (startMonth - 1 + i) % 12;
      regularSI[i] += baseSI;
      bonusSI[i]   += Math.max(0, calMonthly[calIdx] - baseSI);
    }
    (o.bonuses || []).forEach(b => {
      const bi = ((b.month - 1) - (startMonth - 1) + 12) % 12;
      bonusSalary[bi] += b.amount || 0;
    });
  });
  return { regularSI, bonusSI, bonusSalary };
}

function renderExecComp(container, budget) {
  _execLoad();
  // 予算から税引前利益を取得
  const allVals = budget?.dynamicAccounts ? calcAllValuesDynamic(budget) : calcAllValues(budget?.rows || {});
  const basePL  = budget ? calcPL(budget.rows) : null;
  const pretax  = (() => {
    if (budget?.dynamicAccounts) {
      const arr = allVals['calc_pretax'] || [];
      return arr.reduce((a,v)=>a+v,0);
    }
    return basePL ? annualTotal(basePL.pretax_profit) : 0;
  })();
  const capital  = window.App?.currentCompany?.capital || 10_000_000;
  const pref     = window.App?.currentCompany?.prefecture || '東京都';
  _execState.pref     = pref;
  _execState.targetProfit = pretax;


  container.innerHTML = `
    <div class="sim-panel">
      <!-- タブ -->
      <div class="grid-mode-tabs" style="margin-bottom:18px">
        <button class="grid-mode-tab${_execTab==='si'?' active':''}" onclick="switchExecTab('si')">① 法定福利費計算（役員）</button>
        <button class="grid-mode-tab${_execTab==='zero'?' active':''}" onclick="switchExecTab('zero')">② 今期　利益ゼロ化（賞与調整）</button>
        <button class="grid-mode-tab${_execTab==='optimize'?' active':''}" onclick="switchExecTab('optimize')">③ 翌期　トータル最適化（報酬設計）</button>
      </div>

      <!-- ①利益ゼロ化 -->
      <div id="exec_tab_zero" style="display:${_execTab==='zero'?'block':'none'}">
        <div style="display:grid;grid-template-columns:340px 1fr;gap:18px">
          <div style="display:flex;flex-direction:column;gap:14px">
            <div class="card-h">
              <h3>📋 今期の着地予測</h3>
              <div class="form-group">
                <label>現状の税引前利益（予算ベース）</label>
                <input type="number" id="zero_pretax" value="${pretax}" step="100000" class="form-input" oninput="calcZeroOut()">
              </div>
              <div class="form-group">
                <label>配分方法</label>
                <select id="zero_split_mode" class="form-input" onchange="calcZeroOut()">
                  <option value="equal">均等分割（50:50）</option>
                  <option value="ratio">比率指定</option>
                  <option value="officer1">役員①のみ</option>
                  <option value="officer2">役員②のみ</option>
                </select>
              </div>
              <div class="form-group" style="margin:0">
                <label>賞与支払回数</label>
                <select id="zero_bonus_times" class="form-input" onchange="calcZeroOut()">
                  <option value="1">1回</option>
                  <option value="2">2回（÷2 ずつ）</option>
                </select>
              </div>
              <div id="zero_ratio_row" style="display:none;margin-top:10px;padding:10px;background:var(--bg);border-radius:8px">
                <label style="font-size:11px;font-weight:600;color:var(--text-muted)">役員①の配分比率 (%)</label>
                <input type="number" id="zero_ratio1" value="60" min="0" max="100" class="form-input" style="margin-top:4px" oninput="calcZeroOut()">
              </div>
            </div>

            <div class="card-h">
              <h3>👤 役員①</h3>
              <div class="form-group">
                <label>月額報酬（円）</label>
                <input type="number" id="zero_monthly1" value="${_execState.officers[0]?.monthly || 800000}" step="10000" class="form-input" oninput="calcZeroOut()">
              </div>
              <div class="form-group" style="margin:0">
                <label>年齢</label>
                <input type="number" id="zero_age1" value="${_execState.officers[0]?.age || 50}" class="form-input" oninput="calcZeroOut()">
              </div>
            </div>

            <div class="card-h">
              <h3>👤 役員②</h3>
              <div class="form-group">
                <label>月額報酬（円）</label>
                <input type="number" id="zero_monthly2" value="${_execState.officers[1]?.monthly || 500000}" step="10000" class="form-input" oninput="calcZeroOut()">
              </div>
              <div class="form-group" style="margin:0">
                <label>年齢</label>
                <input type="number" id="zero_age2" value="${_execState.officers[1]?.age || 45}" class="form-input" oninput="calcZeroOut()">
              </div>
            </div>
          </div>

          <div class="card-h" id="zero_result">
            <h3>💡 推奨役員賞与・調整額</h3>
            <div class="no-data-small">左の値を入力してください</div>
          </div>
        </div>
      </div>

      <!-- ②トータル最適化 -->
      <div id="exec_tab_optimize" style="display:${_execTab==='optimize'?'block':'none'}">
      <div class="flex-between">
        <div>
          <h2 class="section-title">役員報酬・役員賞与 最適化</h2>
          <p class="section-sub">今期・翌期の利益から役員報酬・役員賞与の最適額を試算し、予算に自動反映します</p>
        </div>
      </div>

      <!-- 基本設定 -->
      <div class="sim-grid">
        <div class="card-h">
          <h3>📋 基本設定</h3>
          <div class="form-group">
            <label>税引前利益（予算ベース）</label>
            <input type="number" id="ec_pretax" value="${pretax}" step="100000" class="form-input"
              oninput="updateExecCalc()">
          </div>
          <div class="form-group">
            <label>資本金</label>
            <input type="number" id="ec_capital" value="${capital}" step="100000" class="form-input"
              oninput="updateExecCalc()">
          </div>
          <div class="form-group">
            <label>役員賞与（会社全体・年間）</label>
            <input type="number" id="ec_total_bonus" value="0" step="100000" class="form-input"
              oninput="updateExecCalc()">
            <div class="text-sm text-muted mt-1">※ 役員賞与は「事前確定届出給与」を前提に損金算入として試算します（届出なしは損金不算入）</div>
          </div>
        </div>

        <div class="card-h">
          <h3>👤 役員設定</h3>
          <div id="exec_officers_list"></div>
          <button class="btn-outline btn-sm" onclick="addOfficer()" style="margin-top:8px">＋ 役員を追加</button>
        </div>
      </div>

      <!-- スライダー式シミュレーター -->
      <div class="card-h" id="exec_slider_panel">
        <h3>💡 役員報酬シミュレーター（月額）</h3>
        <div id="exec_slider_content"></div>
      </div>

      <!-- 比較テーブル -->
      <div class="card-h" id="exec_compare_panel">
        <h3>📊 月額別 トータル最適化（法人税×個人税・社保）</h3>
        <div id="exec_compare_content"></div>
      </div>

      <!-- 予算反映ボタン -->
      <div class="card" id="exec_apply_panel" style="display:none">
        <div class="flex-between">
          <div>
            <strong>予算への自動反映</strong>
            <div class="text-sm text-muted mt-1">役員報酬・法定福利費を予算に反映します</div>
          </div>
          <button class="btn-solid" onclick="applyExecToBudget()">予算に反映する →</button>
        </div>
      </div>
      </div><!-- /#exec_tab_optimize -->

      <!-- ① 法定福利費計算（役員） -->
      <div id="exec_tab_si" style="display:${_execTab==='si'?'block':'none'}">
        <div class="flex-between" style="margin-bottom:12px">
          <div>
            <h2 class="section-title">法定福利費計算（役員）</h2>
            <p class="section-sub">役員ごとの月額報酬・賞与から月次法定福利費を自動計算</p>
          </div>
          <button class="btn-solid" onclick="_execApplySIToBudget()">📊 予算へ反映</button>
        </div>

        <div id="exec_si_officer_cards"></div>
        <button class="btn-outline btn-sm" onclick="addOfficer();renderExecSITable()" style="margin-bottom:16px">＋ 役員追加</button>

        <div class="card" style="padding:0;overflow:hidden;margin-top:4px">
          <div style="overflow-x:auto">
            <table class="result-table" style="min-width:900px">
              <thead><tr id="exec_si_thead"></tr></thead>
              <tbody id="exec_si_tbody"></tbody>
              <tfoot id="exec_si_tfoot"></tfoot>
            </table>
          </div>
        </div>
      </div>

    </div>`;

  renderOfficerList();
  updateExecCalc();
  calcZeroOut();
  renderExecSITable();
}

function renderOfficerList() {
  const el = document.getElementById('exec_officers_list');
  if (!el) return;
  el.innerHTML = _execState.officers.map((o, i) => `
    <div class="exec-card" id="officer_${i}">
      <div class="flex-between">
        <input type="text" class="form-input" style="width:140px;font-weight:700"
          value="${o.name}" oninput="_execState.officers[${i}].name=this.value;updateExecCalc()">
        ${i > 0 ? `<button class="btn-outline btn-xs btn-danger-outline" onclick="removeOfficer(${i})">削除</button>` : ''}
      </div>
      <div style="margin-top:10px;display:grid;grid-template-columns:1fr 80px;gap:8px;flex-wrap:wrap">
        <div class="form-group" style="margin:0">
          <label>月額報酬（円）</label>
          <input type="number" class="form-input" value="${o.monthly}" step="10000"
            oninput="_execState.officers[${i}].monthly=+this.value;renderSlider(${i});updateExecCalc()">
        </div>
        <div class="form-group" style="margin:0">
          <label>年齢</label>
          <input type="number" class="form-input" value="${o.age}" min="15" max="80"
            oninput="_execState.officers[${i}].age=+this.value;updateExecCalc()">
        </div>
        <div class="form-group" style="margin:0;grid-column:span 2">
          <label>役員賞与</label>
          <div id="officer_bonuses_${i}">
            ${(o.bonuses||[]).map((b, bi) => `
              <div style="display:flex;gap:5px;align-items:center;margin-bottom:4px">
                <select class="form-input" style="width:60px;font-size:11px;padding:2px 3px"
                  onchange="_execState.officers[${i}].bonuses[${bi}].month=+this.value;_execSave();updateExecCalc()">
                  ${Array.from({length:12},(_,m)=>`<option value="${m+1}"${b.month===m+1?' selected':''}>${m+1}月</option>`).join('')}
                </select>
                <input type="number" class="form-input" style="width:120px;font-size:12px;text-align:right"
                  value="${b.amount||''}" placeholder="0" step="100000"
                  oninput="_execState.officers[${i}].bonuses[${bi}].amount=+this.value||0;_execSave();updateExecCalc()">
                <span style="font-size:11px;color:var(--text-muted)">円</span>
                <button onclick="removeOfficerBonus(${i},${bi})"
                  style="background:#fee2e2;border:1px solid #fca5a5;color:#dc2626;border-radius:4px;padding:1px 6px;font-size:11px;cursor:pointer">✕</button>
              </div>`).join('')}
            <button onclick="addOfficerBonus(${i})"
              style="font-size:11px;background:var(--emerald-light);border:1px solid var(--teal);color:var(--emerald-dark);border-radius:4px;padding:2px 8px;cursor:pointer;margin-top:2px">＋ 賞与追加</button>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:3px">年間合計 ${Math.round(_execTotalBonus(o)/10000).toLocaleString()}万円</div>
        </div>
      </div>
      <div class="slider-wrap" style="margin-top:8px">
        <label>月額スライダー（0〜200万円）</label>
        <input type="range" id="slider_${i}" min="0" max="2000000" step="10000"
          value="${o.monthly}"
          oninput="
            _execState.officers[${i}].monthly=+this.value;
            this.parentElement.querySelector('.slider-val').textContent=fmtK(+this.value)+'千円';
            updateExecCalc();
            this.style.setProperty('--pct',(this.value/2000000*100)+'%')
          "
          style="--pct:${o.monthly/2000000*100}%">
        <span class="slider-val text-sm" style="float:right;color:var(--primary);font-weight:700">
          ${fmtK(o.monthly)}千円
        </span>
      </div>
    </div>`).join('');
}

function addOfficer() {
  _execState.officers.push({ name: `取締役${_execState.officers.length}`, monthly: 500000, bonuses: [{ month: 6, amount: 0 }, { month: 12, amount: 0 }], age: 45 });
  renderOfficerList();
  updateExecCalc();
  _execSave();
}

function removeOfficer(i) {
  _execState.officers.splice(i, 1);
  renderOfficerList();
  updateExecCalc();
  _execSave();
}

function addOfficerBonus(i) {
  if (!_execState.officers[i].bonuses) _execState.officers[i].bonuses = [];
  _execState.officers[i].bonuses.push({ month: 12, amount: 0 });
  _execSave();
  renderOfficerList();
  updateExecCalc();
}

function removeOfficerBonus(i, bi) {
  _execState.officers[i].bonuses.splice(bi, 1);
  _execSave();
  renderOfficerList();
  updateExecCalc();
}

function updateExecCalc() {
  const pretax  = parseFloat(document.getElementById('ec_pretax')?.value  || 0);
  const capital = parseFloat(document.getElementById('ec_capital')?.value || 10_000_000);
  const pref    = window.App?.currentCompany?.prefecture || '東京都';

  const officers = _execState.officers;

  // 各役員の計算
  const scenarios = officers.map(o =>
    calcExecScenario(o.monthly, _execTotalBonus(o), o.age, pref, capital)
  );

  // 会社全体コスト
  const totalCompanyCost = scenarios.reduce((a, s) => a + s.companyTotal, 0);
  const totalCompanySI   = scenarios.reduce((a, s) => a + s.companySI,   0);
  const adjustedPretax   = pretax - totalCompanyCost;

  // 法人税計算
  const taxResult = calcAllTax(Math.max(0, adjustedPretax), capital);

  // スライダーパネル
  renderExecSliderResult(scenarios, pretax, adjustedPretax, taxResult, totalCompanyCost, totalCompanySI);

  // 比較テーブル（代表取締役のみ）
  renderExecCompareTable(officers[0], pref, capital, pretax);

  // 予算反映ボタン表示
  const applyPanel = document.getElementById('exec_apply_panel');
  if (applyPanel) applyPanel.style.display = 'block';

  _execState._last = { scenarios, pretax, adjustedPretax, taxResult, totalCompanyCost, totalCompanySI };
  _execSave();
}

function renderExecSliderResult(scenarios, pretax, adjustedPretax, taxResult, totalCost, totalSI) {
  const el = document.getElementById('exec_slider_content');
  if (!el) return;

  const rows = scenarios.map((s, i) => {
    const o = _execState.officers[i];
    return `
      <div style="margin-bottom:16px;padding:14px;background:var(--gray-50);border-radius:10px;border:1px solid var(--border)">
        <div class="flex-between" style="margin-bottom:8px">
          <strong>${o.name}</strong>
          <span class="tag tag-blue">月額 ${fmt(s.monthly)}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:12px">
          <div>
            <div class="text-muted text-sm">年収</div>
            <strong>${fmt(s.annual)}</strong>
          </div>
          <div>
            <div class="text-muted text-sm">会社社会保険（年）</div>
            <strong style="color:var(--danger)">${fmt(s.companySI)}</strong>
          </div>
          <div>
            <div class="text-muted text-sm">手取り（概算）</div>
            <strong style="color:var(--green)">${fmt(s.takeHome)}</strong>
          </div>
          <div>
            <div class="text-muted text-sm">実質負担率</div>
            <strong>${s.effectiveRate.toFixed(1)}%</strong>
          </div>
        </div>
      </div>`;
  }).join('');

  const shortfall = adjustedPretax < 0;
  el.innerHTML = `
    ${rows}
    <hr class="divider">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
      <div style="padding:14px;background:#f0f8fd;border-radius:10px;border:1px solid rgba(29,111,184,.15)">
        <div class="text-muted text-sm" style="margin-bottom:4px">役員報酬・社会保険 合計コスト（年）</div>
        <div style="font-size:20px;font-weight:800;color:var(--primary-dark)">${fmt(totalCost)}</div>
      </div>
      <div style="padding:14px;background:${shortfall?'#fff1f2':'#f0fdf4'};border-radius:10px;border:1px solid ${shortfall?'var(--danger)':'var(--green)'}">
        <div class="text-muted text-sm" style="margin-bottom:4px">控除後 税引前利益</div>
        <div style="font-size:20px;font-weight:800;color:${shortfall?'var(--danger)':'var(--green)'}">${fmt(adjustedPretax)}</div>
        ${shortfall ? '<div class="text-sm" style="color:var(--danger);margin-top:4px">⚠ 利益がマイナスになります</div>' : ''}
      </div>
      <div style="padding:14px;background:var(--gray-50);border-radius:10px;border:1px solid var(--border)">
        <div class="text-muted text-sm" style="margin-bottom:4px">概算法人税等</div>
        <div style="font-size:20px;font-weight:800;color:var(--gray-700)">${fmt(taxResult.total)}</div>
        <div class="text-sm text-muted" style="margin-top:4px">実効税率 ${adjustedPretax>0?(taxResult.total/adjustedPretax*100).toFixed(1):0}%</div>
      </div>
    </div>`;
}

function renderExecCompareTable(officer, pref, capital, pretax) {
  const el = document.getElementById('exec_compare_content');
  if (!el || !officer) return;

  const bonus = _execTotalBonus(officer);
  const steps = [0, 300000, 500000, 800000, 1000000, 1200000, 1500000, 1800000, 2000000];

  // 各月額ステップで「会社＋個人の手残り」と「国等への流出」を計算
  const calc = steps.map(m => {
    const s = calcExecScenario(m, bonus, officer.age || 50, pref, capital);
    const adjustedPretax = pretax - s.companyTotal;          // 報酬控除後の会社利益
    const corpTax = calcAllTax(Math.max(0, adjustedPretax), capital).total;
    const companyAfter = adjustedPretax - corpTax;           // 会社の税引後利益（内部留保）
    const personalTax  = s.incomeTax + s.residentTax;
    const outflow = s.companySI + corpTax + s.personalSI + personalTax; // 国等への流出計
    const retained = companyAfter + s.takeHome;              // 手残り（会社＋個人）= pretax − outflow
    return { m, s, corpTax, companyAfter, personalTax, outflow, retained };
  });

  // 手残り最大（＝流出最小）が最適
  const maxRetained = Math.max(...calc.map(c => c.retained));

  const rows = calc.map(c => {
    const isCurrent = officer.monthly === c.m;
    const isOptimal = c.retained === maxRetained;
    const cls = isOptimal ? 'opt-best' : (isCurrent ? 'highlight' : '');
    const badges = `${isOptimal ? '<span class="optimal-badge" style="background:#16a34a">最適</span>' : ''}${isCurrent ? '<span class="optimal-badge">現在</span>' : ''}`;
    return `<tr class="${cls}">
      <td>${fmt(c.m)}/月${badges}</td>
      <td class="num">${fmt(c.s.annual)}</td>
      <td class="num" style="color:var(--danger)">${fmt(c.corpTax)}</td>
      <td class="num" style="color:var(--primary)">${fmt(c.personalTax + c.s.personalSI)}</td>
      <td class="num" style="font-weight:700">${fmt(c.outflow)}</td>
      <td class="num" style="color:var(--green);font-weight:800">${fmt(c.retained)}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="opt-explain" style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12.5px;line-height:1.7">
      <strong>📌 この表の見方</strong><br>
      役員報酬を<strong>上げる</strong>と会社の利益が減り<strong>法人税は↓</strong>、一方で個人の<strong>所得税・住民税・社会保険は↑</strong>。
      両者の綱引きで、<strong style="color:#16a34a">「手残り（会社の税引後利益＋役員の手取り）」が最大＝国等への流出が最小</strong>になる月額が<strong>最適</strong>です（緑行）。
    </div>
    <div class="table-scroll">
    <table class="comp-table">
      <thead>
        <tr>
          <th>役員月額</th>
          <th>役員年収</th>
          <th>法人税等</th>
          <th>個人税・社保</th>
          <th>国等への流出計</th>
          <th>手残り（会社＋個人）</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
    <div class="wf-note">
      ※ 税引前利益 ${fmt(pretax)} を前提に試算。役員賞与 ${fmt(bonus)}/年（事前確定届出＝損金算入を前提）<br>
      ※ 法人税等＝控除後利益への法人税・地方法人税・住民税・事業税の概算。個人税・社保＝所得税(復興税込)＋住民税＋本人負担社会保険<br>
      ※ 手残り ＝ 税引前利益 −（法人税等＋会社負担社保＋個人税・社保）。最も大きい月額が最適です
    </div>
    <style>
      .comp-table .opt-best td { background:#dcfce7 !important; }
      .comp-table .opt-best td:last-child { color:#15803d; }
    </style>`;
}

// 予算へ反映
function applyExecToBudget() {
  const budget = window.App?.currentBudget;
  if (!budget) { alert('予算データがありません'); return; }

  const last = _execState._last;
  if (!last) return;

  const { scenarios } = last;

  // 役員報酬: 月次に均等配分
  const execMonthly = _execState.officers.find(o => o.name.includes('代表') || o.name.includes('役員'))?.monthly
    || _execState.officers[0]?.monthly || 0;
  const empMonthly  = scenarios.slice(1).reduce((a, s) => a + s.monthly, 0);

  // 全役員合計月額
  const totalExec = _execState.officers.reduce((a, o) => a + o.monthly, 0);

  // 月次配列（均等）
  if (!budget.rows.sga_exec)    budget.rows.sga_exec    = new Array(12).fill(0);
  if (!budget.rows.sga_welfare) budget.rows.sga_welfare = new Array(12).fill(0);
  budget.rows.sga_exec    = new Array(12).fill(Math.round(totalExec));
  // 法定福利費（会社負担分）
  const totalMonthlySI = scenarios.reduce((a, s) => a + s.companySI / 12, 0);
  budget.rows.sga_welfare = new Array(12).fill(Math.round(totalMonthlySI));

  saveBudget(budget);
  window.App.currentBudget = budget;

  alert(`予算を更新しました。\n役員報酬：${fmt(totalExec)}/月\n法定福利費（社会保険）：${fmt(Math.round(totalMonthlySI))}/月`);
  showPage('budget');
}

// ===== タブ切替 =====
function switchExecTab(tab) {
  _execTab = tab;
  document.getElementById('exec_tab_zero')?.style.setProperty('display', tab === 'zero' ? 'block' : 'none');
  document.getElementById('exec_tab_optimize')?.style.setProperty('display', tab === 'optimize' ? 'block' : 'none');
  document.getElementById('exec_tab_si')?.style.setProperty('display', tab === 'si' ? 'block' : 'none');
  document.querySelectorAll('.grid-mode-tab').forEach(btn => {
    btn.classList.toggle('active',
      (btn.textContent.includes('ゼロ化') && tab === 'zero') ||
      (btn.textContent.includes('最適化') && tab === 'optimize') || (btn.textContent.includes('法定福利費計算') && tab === 'si')
    );
  });
}

function renderExecSICards() {
  const el = document.getElementById('exec_si_officer_cards');
  if (!el) return;
  const pref = window.App?.currentCompany?.prefecture || '東京都';

  el.innerHTML = _execState.officers.map((o, i) => {
    const baseSI = calcSocialInsurance(o.monthly || 0, 0, o.age || 50, pref).monthly;
    const annualBonus = _execTotalBonus(o);
    const totalSI = calcSocialInsurance(o.monthly || 0, annualBonus, o.age || 50, pref).annual;

    const bonusRows = (o.bonuses || []).map((b, bi) => `
      <div style="display:flex;gap:5px;align-items:center;margin-bottom:4px">
        <span style="font-size:11px;color:var(--text-muted);width:32px">賞与${bi+1}</span>
        <select class="form-input" style="width:68px;font-size:11px;padding:3px"
          onchange="_execState.officers[${i}].bonuses[${bi}].month=+this.value;_execSave();renderExecSITable()">
          ${Array.from({length:12},(_,m)=>`<option value="${m+1}"${b.month===m+1?' selected':''}>${m+1}月</option>`).join('')}
        </select>
        <input type="number" class="form-input" style="width:110px;font-size:12px;text-align:right"
          value="${b.amount||''}" placeholder="0" step="100000"
          oninput="_execState.officers[${i}].bonuses[${bi}].amount=+this.value||0;_execSave()"
          onblur="renderExecSITable()">
        <span style="font-size:11px;color:var(--text-muted)">円</span>
        <button onclick="removeOfficerBonus(${i},${bi});renderExecSITable()"
          style="background:#fee2e2;border:1px solid #fca5a5;color:#dc2626;border-radius:4px;padding:2px 7px;font-size:11px;cursor:pointer">✕</button>
      </div>`).join('');

    return `
      <div class="card" style="padding:14px 16px;margin-bottom:10px">
        <div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap">
          <div style="flex:1;min-width:160px">
            <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">氏名</label>
            <input class="form-input" style="font-size:13px;font-weight:600" value="${escHtml(o.name)}" placeholder="役員名"
              oninput="_execState.officers[${i}].name=this.value;_execSave()"
              onblur="renderExecSITable()">
          </div>
          <div style="min-width:130px">
            <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">月額報酬（円）</label>
            <input type="number" class="form-input" style="font-size:12px;text-align:right"
              value="${o.monthly||''}" placeholder="800000" step="10000"
              oninput="_execState.officers[${i}].monthly=+this.value||0;_execSave()"
              onblur="renderExecSITable()">
          </div>
          <div style="min-width:80px">
            <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">年齢</label>
            <input type="number" class="form-input" style="font-size:12px"
              value="${o.age||50}" min="15" max="80"
              oninput="_execState.officers[${i}].age=+this.value||50;_execSave()"
              onblur="renderExecSITable()">
          </div>
          <div style="min-width:180px">
            <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">役員賞与</label>
            ${bonusRows}
            <button onclick="addOfficerBonus(${i});renderExecSITable()"
              style="margin-top:4px;font-size:11px;background:var(--emerald-light);border:1px solid var(--teal);color:var(--emerald-dark);border-radius:4px;padding:2px 10px;cursor:pointer">＋ 賞与追加</button>
          </div>
          <div style="min-width:130px;border-left:1px solid var(--border);padding-left:14px">
            <div style="font-size:10px;color:var(--text-muted)">月額法定福利費</div>
            <div style="font-size:18px;font-weight:700;color:var(--emerald-dark)">${Math.round(baseSI).toLocaleString()}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:4px">年間合計</div>
            <div style="font-size:14px;font-weight:600">${Math.round(totalSI).toLocaleString()}</div>
            ${(o.age||50)>=40&&(o.age||50)<65?'<div style="font-size:10px;color:#d97706;margin-top:2px">介護保険対象</div>':''}
          </div>
          ${i > 0 ? `<button onclick="removeOfficer(${i});renderExecSITable()" title="削除"
            style="align-self:flex-start;background:#fee2e2;border:1px solid #fca5a5;color:#dc2626;border-radius:4px;padding:4px 10px;font-size:12px;cursor:pointer">🗑</button>` : ''}
        </div>
      </div>`;
  }).join('');
}

function renderExecSITable() {
  renderExecSICards();
  const thead = document.getElementById('exec_si_thead');
  const tbody = document.getElementById('exec_si_tbody');
  const tfoot = document.getElementById('exec_si_tfoot');
  if (!thead || !tbody || !tfoot) return;

  const pref       = window.App?.currentCompany?.prefecture || '東京都';
  const startMonth = window.App?.currentBudget?.startMonth || 4;
  const months     = getMonthLabels(startMonth);

  thead.innerHTML = `
    <th style="position:sticky;left:0;background:#e0f2fe;z-index:5">役員</th>
    <th style="text-align:right">月額SI</th>
    ${months.map(m => `<th style="text-align:right">${m}</th>`).join('')}
    <th style="text-align:right">年間合計</th>`;

  const officerData = _execState.officers.map(o => {
    const calMonthly    = _execCalcOfficerMonthly(o, pref);
    const budgetMonthly = Array.from({length:12},(_,i)=>calMonthly[(startMonth-1+i)%12]);
    const annualTotal   = budgetMonthly.reduce((s,v)=>s+v,0);
    const baseSI        = calcSocialInsurance(o.monthly||0, 0, o.age||50, pref).monthly;
    return { o, budgetMonthly, annualTotal, baseSI };
  });

  const bonusMonths = new Set();
  _execState.officers.forEach(o => {
    (o.bonuses||[]).forEach(b => {
      bonusMonths.add(((b.month-1)-(startMonth-1)+12)%12);
    });
  });

  tbody.innerHTML = officerData.map(({ o, budgetMonthly, annualTotal, baseSI }) => `
    <tr>
      <td style="position:sticky;left:0;background:#fff;font-weight:600;font-size:12px">${escHtml(o.name||'(未入力)')}</td>
      <td style="text-align:right;font-size:11px;color:var(--text-muted)">${Math.round(baseSI).toLocaleString()}</td>
      ${budgetMonthly.map((v, mi) => {
        const bonusPart = Math.max(0, v - baseSI);
        return `<td style="text-align:right;font-size:12px;${bonusPart>0?'background:#fffbeb':''}">
          <div style="${bonusPart>0?'font-weight:700':''}">${Math.round(baseSI).toLocaleString()}</div>
          ${bonusPart>0?`<div style="font-size:9px;color:#d97706;font-weight:700">+${Math.round(bonusPart).toLocaleString()}<br>▲賞与SI</div>`:''}
        </td>`;
      }).join('')}
      <td style="text-align:right;font-weight:700;color:var(--emerald-dark)">${Math.round(annualTotal).toLocaleString()}</td>
    </tr>`).join('');

  const { regularSI, bonusSI, bonusSalary } = _execCalcBreakdown(pref, startMonth);
  const tfRow = (label, arr, total, bg, color, bold) => `
    <tr style="background:${bg}">
      <td style="position:sticky;left:0;background:${bg};padding:6px 10px;font-size:11.5px;${bold?'font-weight:700':'color:var(--text-muted)'}">${label}</td>
      <td></td>
      ${arr.map(v=>`<td style="text-align:right;padding:5px 8px;font-size:11.5px;${v>0&&color?'color:'+color:''}">${v?Math.round(v).toLocaleString():'–'}</td>`).join('')}
      <td style="text-align:right;padding:5px 8px;font-weight:700;${color?'color:'+color:''}">${Math.round(total).toLocaleString()}</td>
    </tr>`;

  tfoot.innerHTML =
    tfRow('法定福利費（月額）合計', regularSI, regularSI.reduce((s,v)=>s+v,0), '#f0f9ff', '', true) +
    tfRow('うち賞与分法定福利費',  bonusSI,   bonusSI.reduce((s,v)=>s+v,0),   '#fffbeb', '#d97706', false) +
    tfRow('役員賞与支給額合計',   bonusSalary, bonusSalary.reduce((s,v)=>s+v,0),'#fff7f0','#ea580c', false) +
    `<tr style="background:#e0f2fe;font-weight:700;border-top:2px solid #bae6fd">
      <td style="position:sticky;left:0;background:#e0f2fe;padding:7px 10px">法定福利費 総合計</td><td></td>
      ${Array.from({length:12},(_,i)=>`<td style="text-align:right;padding:6px 8px">${Math.round(regularSI[i]+bonusSI[i]).toLocaleString()}</td>`).join('')}
      <td style="text-align:right;padding:6px 8px;color:var(--emerald-dark)">${Math.round(regularSI.reduce((s,v)=>s+v,0)+bonusSI.reduce((s,v)=>s+v,0)).toLocaleString()}</td>
    </tr>`;
}

function _execApplySIToBudget() {
  const budget = window.App?.currentBudget;
  if (!budget) { alert('予算データがありません'); return; }
  const pref       = window.App?.currentCompany?.prefecture || '東京都';
  const startMonth = budget.startMonth || 4;
  const { regularSI, bonusSI, bonusSalary } = _execCalcBreakdown(pref, startMonth);
  if (!budget.rows) budget.rows = {};

  if (budget.dynamicAccounts) {
    budget.dynamicAccounts = budget.dynamicAccounts.filter(a => !a.id?.startsWith('wf_auto_'));

    // 反映グループ（販管費末尾）を確保（welfare.js の共有ヘルパーを使用）
    _ensureReflectGroup(budget);
    _wfEnsureChildOf(budget, 'exec_welfare_bonus', '法定福利費（役員賞与）', 'wf_reflect_welfare');
    _wfEnsureChildOf(budget, 'exec_bonus',          '役員賞与',               'wf_reflect_bonus');

    // 役員月額報酬：動的な役員報酬科目を探して書き込む
    const accts = budget.dynamicAccounts;
    const execMonthly = Array(12).fill(_execState.officers.reduce((s,o)=>s+(o.monthly||0),0));
    const execAcct = accts.find(a => a.name?.includes('役員報酬') && !a.name?.includes('賞与')) ||
                     accts.find(a => a.id === 'sga_exec');
    if (execAcct) budget.rows[execAcct.id] = execMonthly;
    else           budget.rows['sga_exec']  = execMonthly;

    budget.rows['exec_welfare_bonus'] = bonusSI;
    budget.rows['exec_bonus']         = bonusSalary;
  } else {
    budget.rows['sga_exec']    = Array(12).fill(_execState.officers.reduce((s,o)=>s+(o.monthly||0),0));
    budget.rows['sga_welfare'] = regularSI.map((v,i)=>v+bonusSI[i]);
    budget.rows['sga_bonus']   = bonusSalary;
  }
  saveBudget(budget);
  window.App.currentBudget = budget;
  alert(
    `予算に反映しました。\n` +
    `役員報酬：${Math.round(_execState.officers.reduce((s,o)=>s+(o.monthly||0),0)).toLocaleString()}円/月\n` +
    `法定福利費（役員賞与分）：${Math.round(bonusSI.reduce((s,v)=>s+v,0)).toLocaleString()}\n` +
    `役員賞与合計：${Math.round(bonusSalary.reduce((s,v)=>s+v,0)).toLocaleString()}\n` +
    `→ 「法定福利費（反映）」「賞与（反映）」グループに書き込みました`
  );
}

let _siBonuses = [{ month: 6, amount: 0 }, { month: 12, amount: 0 }];

function addSIBonus() {
  _siBonuses.push({ month: 12, amount: 0 });
  renderSIBonusList();
  runSICalc();
}

function removeSIBonus(bi) {
  _siBonuses.splice(bi, 1);
  renderSIBonusList();
  runSICalc();
}

function renderSIBonusList() {
  const el = document.getElementById('si_bonus_list');
  if (!el) return;
  el.innerHTML = _siBonuses.map((b, bi) => `
    <div style="display:flex;gap:5px;align-items:center;margin-bottom:4px">
      <select class="form-input" style="width:60px;font-size:11px;padding:2px 3px"
        onchange="_siBonuses[${bi}].month=+this.value;runSICalc()">
        ${Array.from({length:12},(_,m)=>`<option value="${m+1}"${b.month===m+1?' selected':''}>${m+1}月</option>`).join('')}
      </select>
      <input type="number" class="form-input" style="width:130px;font-size:12px;text-align:right"
        value="${b.amount||''}" placeholder="0" step="100000"
        oninput="_siBonuses[${bi}].amount=+this.value||0;runSICalc()">
      <span style="font-size:11px;color:var(--text-muted)">円</span>
      <button onclick="removeSIBonus(${bi})"
        style="background:#fee2e2;border:1px solid #fca5a5;color:#dc2626;border-radius:4px;padding:1px 6px;font-size:11px;cursor:pointer">✕</button>
    </div>`).join('');
}

function runSICalc() {
  const salary = parseFloat(document.getElementById('si_salary')?.value || 0);
  const age    = parseInt(document.getElementById('si_age')?.value || 50);
  const pref   = document.getElementById('si_pref')?.value || '東京都';
  const el     = document.getElementById('si_result');
  if (!el) return;

  renderSIBonusList();

  const rates    = (typeof KENPO_RATES !== 'undefined' ? (KENPO_RATES[pref] || KENPO_RATES['東京都']) : null) || { health: 0.0991, care: 0.0159 };
  const careFlag = age >= 40 && age < 65;
  const stdP     = Math.min(salary, PENSION_MAX_STD);
  const stdH     = Math.min(salary, HEALTH_MAX_STD);

  const healthC  = Math.floor(stdH * rates.health / 2);
  const careC    = careFlag ? Math.floor(stdH * rates.care / 2) : 0;
  const pensionC = Math.floor(stdP * KOSEI_RATE / 2);
  const kodomoC  = Math.floor(stdP * KODOMO_RATE);
  const monthlySI = healthC + careC + pensionC + kodomoC;

  // 賞与月別（健保は年度累計573万円上限、4月〜3月の保険年度順で処理）
  const sortedSIBonuses = [..._siBonuses.filter(b=>b.amount)]
    .sort((a, b) => ((a.month||1)-4+12)%12 - ((b.month||1)-4+12)%12);
  let siHealthCumulative = 0;
  const bonusSIMap = new Map();
  sortedSIBonuses.forEach(b => {
    const remaining = Math.max(0, BONUS_MAX_HEALTH - siHealthCumulative);
    const sbH = Math.min(b.amount, remaining);
    const sbP = Math.min(b.amount, BONUS_MAX_PENSION);
    siHealthCumulative += b.amount;
    const total = Math.floor(sbH*rates.health/2) + (careFlag?Math.floor(sbH*rates.care/2):0)
                + Math.floor(sbP*KOSEI_RATE/2) + Math.floor(sbP*KODOMO_RATE);
    bonusSIMap.set(b, total);
  });

  const bonusRows = _siBonuses.map((b, bi) => {
    if (!b.amount) return '';
    const total = bonusSIMap.get(b) ?? 0;
    return `<tr style="background:#fffbeb">
      <td>賞与${bi+1}（${b.month}月・${Math.round(b.amount/10000).toLocaleString()}万円）</td>
      <td class="num" style="color:#d97706;font-weight:700">${Math.round(total).toLocaleString()}</td>
    </tr>`;
  }).filter(Boolean).join('');

  const annualBonus = _siBonuses.reduce((s,b)=>s+(b.amount||0),0);
  const annualSI = monthlySI * 12 + [...bonusSIMap.values()].reduce((s,v)=>s+v,0);

  el.innerHTML = `
    <h3>法定福利費（会社負担）</h3>
    <table class="result-table" style="margin-bottom:12px">
      <thead><tr><th>項目</th><th style="text-align:right">金額（円）</th></tr></thead>
      <tbody>
        <tr><td>健康保険（${(rates.health*100).toFixed(3)}%・折半）</td><td class="num">${Math.round(healthC).toLocaleString()}/月</td></tr>
        ${careFlag ? `<tr><td>介護保険（${(rates.care*100).toFixed(3)}%・折半）</td><td class="num">${Math.round(careC).toLocaleString()}/月</td></tr>` : ''}
        <tr><td>厚生年金（${(KOSEI_RATE*100).toFixed(3)}%・折半）</td><td class="num">${Math.round(pensionC).toLocaleString()}/月</td></tr>
        <tr><td>子ども・子育て拠出金（${(KODOMO_RATE*100).toFixed(3)}%）</td><td class="num">${Math.round(kodomoC).toLocaleString()}/月</td></tr>
        <tr class="total-row"><td><strong>月額法定福利費</strong></td><td class="num"><strong>${Math.round(monthlySI).toLocaleString()}</strong></td></tr>
        <tr class="total-row"><td><strong>月額 × 12ヶ月</strong></td><td class="num"><strong>${Math.round(monthlySI*12).toLocaleString()}</strong></td></tr>
        ${bonusRows}
        <tr class="total-row" style="background:#e0f2fe"><td><strong>年間合計</strong></td><td class="num" style="color:var(--emerald-dark);font-weight:800;font-size:15px">${Math.round(annualSI).toLocaleString()}</td></tr>
      </tbody>
    </table>
    ${!careFlag ? `<div style="font-size:11px;color:var(--text-muted)">※ 年齢${age}歳 → 介護保険対象外（40〜64歳が対象）</div>` : ''}`;
}

// ===== ①利益ゼロ化計算（2名対応） =====
function calcZeroOut() {
  const el = document.getElementById('zero_result');
  if (!el) return;

  const pretax      = parseFloat(document.getElementById('zero_pretax')?.value || 0);
  const pref        = window.App?.currentCompany?.prefecture || '東京都';
  const splitMode   = document.getElementById('zero_split_mode')?.value || 'equal';
  const bonusTimes  = parseInt(document.getElementById('zero_bonus_times')?.value || 1);
  const monthly1  = parseFloat(document.getElementById('zero_monthly1')?.value || 800000);
  const age1      = parseFloat(document.getElementById('zero_age1')?.value || 50);
  const monthly2  = parseFloat(document.getElementById('zero_monthly2')?.value || 500000);
  const age2      = parseFloat(document.getElementById('zero_age2')?.value || 45);

  // 比率行の表示切替
  const ratioRow = document.getElementById('zero_ratio_row');
  if (ratioRow) ratioRow.style.display = splitMode === 'ratio' ? 'block' : 'none';

  if (pretax <= 0) {
    el.innerHTML = '<h3>💡 推奨役員賞与・調整額</h3><div class="no-data-small">利益がありません。賞与調整は不要です。</div>';
    return;
  }

  // 賞与の法定福利費（会社負担）をキャップ込みで正確に計算
  // bonusTimes=2 の場合は ÷2 を2回計算（厚生年金上限150万×2回・健保573万上限考慮）
  function _bonusWelfare(bonus, monthly, age, p) {
    if (bonusTimes === 2 && bonus > 0) {
      const half = Math.floor(bonus / 2 / 1000) * 1000;
      const rates    = (typeof KENPO_RATES !== 'undefined' ? KENPO_RATES : {})[p] || KENPO_RATES?.['東京都'] || { health: 0.0991, care: 0.0159 };
      const careFlag = age >= 40 && age < 65;
      const BONUS_CAP_H = 5730000, BONUS_CAP_P = 1500000;
      const KOSEI = 0.183, KODOMO = 0.0036;
      // 1回目
      const h1 = Math.min(half, BONUS_CAP_H);
      const p1 = Math.min(half, BONUS_CAP_P);
      const w1 = Math.floor(h1 * rates.health / 2) + (careFlag ? Math.floor(h1 * rates.care / 2) : 0)
               + Math.floor(p1 * KOSEI / 2) + Math.floor(p1 * KODOMO);
      // 2回目: 健保は累計上限の残り分のみ
      const h2 = Math.min(half, Math.max(0, BONUS_CAP_H - half));
      const p2 = Math.min(half, BONUS_CAP_P);
      const w2 = Math.floor(h2 * rates.health / 2) + (careFlag ? Math.floor(h2 * rates.care / 2) : 0)
               + Math.floor(p2 * KOSEI / 2) + Math.floor(p2 * KODOMO);
      return w1 + w2;
    }
    return calcSocialInsurance(monthly, bonus, age, p).annual
         - calcSocialInsurance(monthly, 0,     age, p).annual;
  }

  // 配分比率を決定
  let ratio1 = 0.5, ratio2 = 0.5;
  if (splitMode === 'equal')   { ratio1 = 0.5;  ratio2 = 0.5; }
  if (splitMode === 'officer1'){ ratio1 = 1.0;  ratio2 = 0.0; }
  if (splitMode === 'officer2'){ ratio1 = 0.0;  ratio2 = 1.0; }
  if (splitMode === 'ratio') {
    const r = Math.min(100, Math.max(0, parseFloat(document.getElementById('zero_ratio1')?.value || 60)));
    ratio1 = r / 100; ratio2 = 1 - ratio1;
  }

  // 二分探索で総賞与額を求める
  // B + bonusWelfare(ratio1×B) + bonusWelfare(ratio2×B) = pretax
  let lo = 0, hi = pretax;
  for (let iter = 0; iter < 60; iter++) {
    const mid = Math.round((lo + hi) / 2);
    const b1  = Math.round(mid * ratio1);
    const b2  = Math.round(mid * ratio2);
    const total = mid + _bonusWelfare(b1, monthly1, age1, pref) + _bonusWelfare(b2, monthly2, age2, pref);
    if (total < pretax) lo = mid; else hi = mid;
    if (hi - lo <= 1) break;
  }
  const totalBonus = Math.round((lo + hi) / 2);
  const bonus1  = Math.round(totalBonus * ratio1);
  const bonus2  = Math.round(totalBonus * ratio2);
  const welfare1 = _bonusWelfare(bonus1, monthly1, age1, pref);
  const welfare2 = _bonusWelfare(bonus2, monthly2, age2, pref);
  const totalWelfare = welfare1 + welfare2;
  const remain = pretax - totalBonus - totalWelfare;

  const capital = window.App?.currentCompany?.capital || 10_000_000;
  const taxBefore = calcAllTax(pretax, capital);
  const taxAfter  = calcAllTax(Math.max(0, remain), capital);
  const fmtV = v => Math.round(v).toLocaleString();

  const perPayLabel = bonusTimes === 2 ? `（1回あたり ${Math.round(bonus1/2).toLocaleString()}円 / ${Math.round(bonus2/2).toLocaleString()}円）` : '';
  const officerRow = (label, bonus, welfare) => bonus === 0 ? '' : `
    <div style="background:#fff;border:1px solid #d1fae5;border-radius:8px;padding:12px;margin-bottom:8px">
      <div style="font-size:11px;font-weight:700;color:#065f46;margin-bottom:8px">${label}</div>
      <div class="tax-kpi-row"><span>役員賞与</span><span style="font-weight:700">${fmtV(bonus)}円</span></div>
      <div class="tax-kpi-row"><span>法定福利費（賞与分）</span><span>${fmtV(welfare)}円</span></div>
    </div>`;

  el.innerHTML = `
    <h3>💡 推奨役員賞与・調整額</h3>
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;margin-bottom:14px">
      <div style="font-size:11px;color:#166534;font-weight:700;margin-bottom:10px">合計</div>
      <div class="tax-kpi-row"><span>役員賞与 合計（${bonusTimes}回払い）${bonusTimes===2?'<span style="font-size:10px;color:#64748b;margin-left:6px">'+perPayLabel+'</span>':''}</span><span style="font-weight:700;color:#166534">${fmtV(totalBonus)}円</span></div>
      <div class="tax-kpi-row"><span>法定福利費 合計</span><span style="font-weight:700;color:#166534">${fmtV(totalWelfare)}円</span></div>
      <div class="tax-kpi-total"><span>支出合計</span><span>${fmtV(totalBonus + totalWelfare)}円</span></div>
      <div class="tax-kpi-row" style="margin-top:6px"><span>調整後　税引前利益</span>
        <span style="font-weight:700;color:${Math.abs(remain)<1000?'#166534':'#dc2626'}">${fmtV(remain)}円</span></div>
    </div>
    <div style="margin-bottom:12px">
      ${officerRow('👤 役員①', bonus1, welfare1)}
      ${officerRow('👤 役員②', bonus2, welfare2)}
    </div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">法人税の変化（概算）</div>
    <div class="tax-kpi-row"><span>賞与なし　法人税等</span><span>${fmtV(taxBefore.total)}円</span></div>
    <div class="tax-kpi-row"><span>賞与あり　法人税等</span><span style="color:#059669">${fmtV(taxAfter.total)}円</span></div>
    <div class="tax-kpi-total"><span>節税額（概算）</span><span style="color:#059669">▲${fmtV(taxBefore.total - taxAfter.total)}円</span></div>
    <div style="margin-top:14px;font-size:10px;color:var(--text-muted);margin-bottom:12px">
      ※役員賞与を損金算入するには事前確定届出給与の届出が必要です<br>
      ※社会保険料率は月額報酬の標準報酬月額から概算
    </div>
    <button class="btn-solid" onclick="applyZeroOutToAdj(${totalBonus}, ${totalWelfare})">調整列に反映する →</button>
    <div style="margin-top:16px;text-align:right">
      <button class="btn-solid" onclick="_execApplyZeroToBudget(${bonus1},${bonus2},${welfare1},${welfare2})">📊 この金額を予算へ反映</button>
    </div>`;
}

// 調整列（col 12）へ反映
function applyZeroOutToAdj(bonus, welfare) {
  const budget = window.App?.currentBudget;
  if (!budget) { alert('予算データがありません'); return; }

  // 役員賞与アカウントを探す（動的 or 静的）
  let bonusAccId   = null;
  let welfareAccId = 'sga_welfare';

  if (budget.dynamicAccounts) {
    const bonusAcc = budget.dynamicAccounts.find(a =>
      a.name.replace(/\s/g,'').match(/役員賞与|役員ボーナス/) && a.type === 'input'
    );
    const welfAcc = budget.dynamicAccounts.find(a =>
      a.name.replace(/\s/g,'').match(/法定福利費/) && a.type === 'input'
    );
    if (bonusAcc) bonusAccId = bonusAcc.id;
    if (welfAcc)  welfareAccId = welfAcc.id;
  } else {
    bonusAccId = 'sga_exec'; // 静的の場合は役員報酬行に追記
  }

  const ensure13 = id => {
    if (!budget.rows[id]) budget.rows[id] = new Array(13).fill(0);
    while (budget.rows[id].length < 13) budget.rows[id].push(0);
  };

  if (bonusAccId) {
    ensure13(bonusAccId);
    budget.rows[bonusAccId][12] = bonus;
  }
  ensure13(welfareAccId);
  budget.rows[welfareAccId][12] = (budget.rows[welfareAccId][12] || 0) + welfare;

  budget.updatedAt = new Date().toISOString();
  saveBudget(budget);
  window.App.currentBudget = budget;

  alert(`調整列に反映しました。\n役員賞与：${Math.round(bonus).toLocaleString()}円\n法定福利費：${Math.round(welfare).toLocaleString()}円`);
  showPage('budget');
}

function _execApplyZeroToBudget(bonus1, bonus2, welfare1, welfare2) {
  const budget = window.App?.currentBudget;
  if (!budget) { alert('予算データがありません'); return; }
  const pref = window.App?.currentCompany?.prefecture || '東京都';
  const startMonth = budget.startMonth || 4;
  if (!budget.rows) budget.rows = {};

  // 役員賞与を支払月に計上（デフォルト: 12月）
  const bonusByMonth = Array(12).fill(0);
  const welfareBonus = Array(12).fill(0);
  const bonusMonth = ((12 - 1) - (startMonth - 1) + 12) % 12; // 12月の予算月インデックス
  bonusByMonth[bonusMonth] = bonus1 + bonus2;
  welfareBonus[bonusMonth] = welfare1 + welfare2;

  if (budget.dynamicAccounts) {
    _ensureReflectGroup(budget);
    _wfEnsureChildOf(budget, 'exec_welfare_bonus', '法定福利費（役員賞与）', 'wf_reflect_welfare');
    _wfEnsureChildOf(budget, 'exec_bonus',          '役員賞与',               'wf_reflect_bonus');
    budget.rows['exec_bonus']         = bonusByMonth;
    budget.rows['exec_welfare_bonus'] = welfareBonus;
  } else {
    const curBonus = budget.rows['sga_bonus'] || Array(12).fill(0);
    curBonus[bonusMonth] = (curBonus[bonusMonth]||0) + bonus1 + bonus2;
    budget.rows['sga_bonus'] = curBonus;
  }

  saveBudget(budget);
  window.App.currentBudget = budget;
  alert(`役員賞与を12月に計上しました。\n合計賞与：${(bonus1+bonus2).toLocaleString()}円\n賞与法定福利費：${(welfare1+welfare2).toLocaleString()}円`);
}

function annualTotal(arr) { return (arr || []).reduce((a,b)=>a+b,0); }

