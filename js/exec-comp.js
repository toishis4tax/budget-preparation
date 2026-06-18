// 役員報酬・役員賞与 最適化シミュレーター

// 所得税簡易計算（給与所得控除後・基礎控除48万円適用）
function calcIncomeTax(annualSalary) {
  // 給与所得控除
  let deduction;
  if      (annualSalary <= 1_625_000) deduction = 550_000;
  else if (annualSalary <= 1_800_000) deduction = Math.floor(annualSalary * 0.4);
  else if (annualSalary <= 3_600_000) deduction = Math.floor(annualSalary * 0.3) + 180_000;
  else if (annualSalary <= 6_600_000) deduction = Math.floor(annualSalary * 0.2) + 540_000;
  else if (annualSalary <= 8_500_000) deduction = Math.floor(annualSalary * 0.1) + 1_200_000;
  else                                deduction = 1_950_000;

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

// 住民税概算（所得の約10%）
function calcResidentTax(annualSalary) {
  const deduction = Math.min(annualSalary * 0.3 + 180_000, 1_950_000);
  const taxable = Math.max(0, annualSalary - deduction - 430_000);
  return Math.round(taxable * 0.10);
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
  const companyTotal = annual + si.annual; // 会社トータルコスト
  const personalSI   = si.monthly * 12 + (bonusAnnual > 0 ? si.annual - si.monthly * 12 : 0);
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

let _execTab = 'zero'; // 'zero' | 'optimize' | 'si'

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

  const prefs = Object.keys(KENPO_RATES || {});
  const prefOptions = prefs.map(p =>
    `<option value="${p}" ${p===pref?'selected':''}>${p}</option>`).join('');

  container.innerHTML = `
    <div class="sim-panel">
      <!-- タブ -->
      <div class="grid-mode-tabs" style="margin-bottom:18px">
        <button class="grid-mode-tab${_execTab==='zero'?' active':''}" onclick="switchExecTab('zero')">①今期　利益ゼロ化（賞与調整）</button>
        <button class="grid-mode-tab${_execTab==='optimize'?' active':''}" onclick="switchExecTab('optimize')">②翌期　トータル最適化（報酬設計）</button>
        <button class="grid-mode-tab${_execTab==='si'?' active':''}" onclick="switchExecTab('si')">③ 法定福利費シミュレーター</button>
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
                <label>協会けんぽ（都道府県）</label>
                <select id="zero_pref" class="form-input" onchange="calcZeroOut()">${prefOptions}</select>
              </div>
              <div class="form-group" style="margin:0">
                <label>配分方法</label>
                <select id="zero_split_mode" class="form-input" onchange="calcZeroOut()">
                  <option value="equal">均等分割（50:50）</option>
                  <option value="ratio">比率指定</option>
                  <option value="officer1">役員①のみ</option>
                  <option value="officer2">役員②のみ</option>
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
            <label>協会けんぽ（都道府県）</label>
            <select id="ec_pref" class="form-input" onchange="updateExecCalc()">${prefOptions}</select>
          </div>
          <div class="form-group">
            <label>役員賞与（会社全体・年間）</label>
            <input type="number" id="ec_total_bonus" value="0" step="100000" class="form-input"
              oninput="updateExecCalc()">
            <div class="text-sm text-muted mt-1">役員賞与は損金不算入のため法人税に影響しません（定期同額外）</div>
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
        <h3>📊 月額別比較表</h3>
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

      <!-- ③ 法定福利費シミュレーター -->
      <div id="exec_tab_si" style="display:${_execTab==='si'?'block':'none'}">
        <div style="display:grid;grid-template-columns:320px 1fr;gap:18px">
          <div class="card-h">
            <h3>入力</h3>
            <div class="form-group">
              <label>月額報酬（円）</label>
              <input type="number" id="si_salary" class="form-input" value="500000" step="10000" oninput="runSICalc()">
            </div>
            <div class="form-group">
              <label>年齢</label>
              <input type="number" id="si_age" class="form-input" value="50" min="15" max="80" oninput="runSICalc()">
            </div>
            <div class="form-group">
              <label>協会けんぽ</label>
              <select id="si_pref" class="form-input" onchange="runSICalc()">${prefOptions}</select>
            </div>
            <div class="form-group" style="margin:0">
              <label>賞与</label>
              <div id="si_bonus_list"></div>
              <button onclick="addSIBonus()" style="margin-top:6px;font-size:11px;background:var(--emerald-light);border:1px solid var(--teal);color:var(--emerald-dark);border-radius:4px;padding:2px 10px;cursor:pointer">＋ 賞与追加</button>
            </div>
          </div>
          <div class="card-h" id="si_result">
            <h3>法定福利費（会社負担）</h3>
            <div class="no-data-small">左の値を入力してください</div>
          </div>
        </div>
      </div>

    </div>`;

  renderOfficerList();
  updateExecCalc();
  calcZeroOut();
  renderSIBonusList();
  if (_execTab === 'si') runSICalc();
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
  const pref    = document.getElementById('ec_pref')?.value || '東京都';

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

  const steps = [0, 300000, 500000, 800000, 1000000, 1200000, 1500000, 1800000, 2000000];
  const rows = steps.map(m => {
    const s = calcExecScenario(m, _execTotalBonus(officer), officer.age || 50, pref, capital);
    const highlight = officer.monthly === m;
    return `<tr class="${highlight ? 'highlight' : ''}">
      <td>${fmt(m)}/月${highlight ? '<span class="optimal-badge">現在</span>' : ''}</td>
      <td class="num">${fmt(s.annual)}</td>
      <td class="num" style="color:var(--danger)">${fmt(s.companySI)}</td>
      <td class="num">${fmt(s.companyTotal)}</td>
      <td class="num" style="color:var(--primary)">${fmt(s.personalSI)}</td>
      <td class="num">${fmt(s.incomeTax)}</td>
      <td class="num">${fmt(s.residentTax)}</td>
      <td class="num" style="color:var(--green);font-weight:700">${fmt(s.takeHome)}</td>
      <td class="num">${s.effectiveRate.toFixed(1)}%</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="table-scroll">
    <table class="comp-table">
      <thead>
        <tr>
          <th>月額報酬</th>
          <th>年収</th>
          <th>会社社会保険</th>
          <th>会社総コスト</th>
          <th>個人社会保険</th>
          <th>所得税</th>
          <th>住民税</th>
          <th>手取り（概算）</th>
          <th>負担率</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
    <div class="wf-note">
      ※ 所得税は給与所得控除・基礎控除(48万円)適用後の概算値（復興特別所得税2.1%含む）<br>
      ※ 住民税は所得の約10%の概算値 ／ 役員賞与：${fmt(_execTotalBonus(officer))}/年（設定値）
    </div>`;
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
      (btn.textContent.includes('最適化') && tab === 'optimize') || (btn.textContent.includes('法定福利費') && tab === 'si')
    );
  });
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

  const rates    = (typeof KENPO_RATES !== 'undefined' ? KENPO_RATES : {})[pref] || { health: 0.0982, care: 0.0182 };
  const careFlag = age >= 40 && age < 65;
  const stdP     = Math.min(salary, PENSION_MAX_STD);
  const stdH     = Math.min(salary, HEALTH_MAX_STD);

  const healthC  = Math.floor(stdH * rates.health / 2);
  const careC    = careFlag ? Math.floor(stdH * rates.care / 2) : 0;
  const pensionC = Math.floor(stdP * KOSEI_RATE / 2);
  const kodomoC  = Math.floor(stdP * KODOMO_RATE);
  const monthlySI = healthC + careC + pensionC + kodomoC;

  // 賞与月別
  const bonusRows = _siBonuses.map((b, bi) => {
    if (!b.amount) return '';
    const sbH  = Math.min(b.amount, HEALTH_MAX_STD);
    const sbP  = Math.min(b.amount, PENSION_MAX_STD);
    const bHC  = Math.floor(sbH * rates.health / 2);
    const bCC  = careFlag ? Math.floor(sbH * rates.care / 2) : 0;
    const bPC  = Math.floor(sbP * KOSEI_RATE / 2);
    const bKC  = Math.floor(sbP * KODOMO_RATE);
    const total = bHC + bCC + bPC + bKC;
    return `<tr style="background:#fffbeb">
      <td>賞与${bi+1}（${b.month}月・${Math.round(b.amount/10000).toLocaleString()}万円）</td>
      <td class="num" style="color:#d97706;font-weight:700">${Math.round(total).toLocaleString()}</td>
    </tr>`;
  }).filter(Boolean).join('');

  const annualBonus = _siBonuses.reduce((s,b)=>s+(b.amount||0),0);
  const annualSI = monthlySI * 12 + _siBonuses.reduce((s, b) => {
    const sbH = Math.min(b.amount||0, HEALTH_MAX_STD);
    const sbP = Math.min(b.amount||0, PENSION_MAX_STD);
    return s + Math.floor(sbH*rates.health/2) + (careFlag?Math.floor(sbH*rates.care/2):0)
             + Math.floor(sbP*KOSEI_RATE/2) + Math.floor(sbP*KODOMO_RATE);
  }, 0);

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

  const pretax    = parseFloat(document.getElementById('zero_pretax')?.value || 0);
  const pref      = document.getElementById('zero_pref')?.value || '東京都';
  const splitMode = document.getElementById('zero_split_mode')?.value || 'equal';
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

  // 各役員の社会保険料率（会社負担）を算出
  const si1 = calcSocialInsurance(monthly1, 0, age1, pref);
  const rate1 = monthly1 > 0 ? si1.annual / (monthly1 * 12) : 0.145;
  const si2 = calcSocialInsurance(monthly2, 0, age2, pref);
  const rate2 = monthly2 > 0 ? si2.annual / (monthly2 * 12) : 0.145;

  // 配分比率を決定
  let ratio1 = 0.5, ratio2 = 0.5;
  if (splitMode === 'equal')   { ratio1 = 0.5;  ratio2 = 0.5; }
  if (splitMode === 'officer1'){ ratio1 = 1.0;  ratio2 = 0.0; }
  if (splitMode === 'officer2'){ ratio1 = 0.0;  ratio2 = 1.0; }
  if (splitMode === 'ratio') {
    const r = Math.min(100, Math.max(0, parseFloat(document.getElementById('zero_ratio1')?.value || 60)));
    ratio1 = r / 100; ratio2 = 1 - ratio1;
  }

  // 全体の賞与総額を計算
  // 賞与B全体、各人に r1×B, r2×B 支給
  // 法定福利費 = r1×B×rate1 + r2×B×rate2
  // B + r1×B×rate1 + r2×B×rate2 = pretax
  // B × (1 + r1×rate1 + r2×rate2) = pretax
  const combinedRate = ratio1 * rate1 + ratio2 * rate2;
  const totalBonus   = Math.round(pretax / (1 + combinedRate));
  const bonus1  = Math.round(totalBonus * ratio1);
  const bonus2  = Math.round(totalBonus * ratio2);
  const welfare1 = Math.round(bonus1 * rate1);
  const welfare2 = Math.round(bonus2 * rate2);
  const totalWelfare = welfare1 + welfare2;
  const remain = pretax - totalBonus - totalWelfare;

  const capital = window.App?.currentCompany?.capital || 10_000_000;
  const taxBefore = calcAllTax(pretax, capital);
  const taxAfter  = calcAllTax(Math.max(0, remain), capital);
  const fmtV = v => Math.round(v).toLocaleString();

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
      <div class="tax-kpi-row"><span>役員賞与 合計</span><span style="font-weight:700;color:#166534">${fmtV(totalBonus)}円</span></div>
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
    <button class="btn-solid" onclick="applyZeroOutToAdj(${totalBonus}, ${totalWelfare})">調整列に反映する →</button>`;
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

function annualTotal(arr) { return (arr || []).reduce((a,b)=>a+b,0); }
