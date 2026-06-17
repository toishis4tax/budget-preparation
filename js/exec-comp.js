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
  officers: [{ name: '代表取締役', monthly: 800000, bonus: 0, age: 50 }],
  pref: '東京都',
  targetProfit: 0,
};

function renderExecComp(container, budget) {
  // 予算から税引前利益を取得
  const basePL = budget ? calcPL(budget.rows) : null;
  const pretax  = basePL ? annualTotal(basePL.pretax_profit) : 0;
  const capital  = window.App?.currentCompany?.capital || 10_000_000;
  const pref     = window.App?.currentCompany?.prefecture || '東京都';
  _execState.pref     = pref;
  _execState.targetProfit = pretax;

  const prefs = Object.keys(KENPO_RATES || {});
  const prefOptions = prefs.map(p =>
    `<option value="${p}" ${p===pref?'selected':''}>${p}</option>`).join('');

  container.innerHTML = `
    <div class="sim-panel">
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
    </div>`;

  renderOfficerList();
  updateExecCalc();
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
      <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr 80px;gap:8px">
        <div class="form-group" style="margin:0">
          <label>月額報酬（円）</label>
          <input type="number" class="form-input" value="${o.monthly}" step="10000"
            oninput="_execState.officers[${i}].monthly=+this.value;renderSlider(${i});updateExecCalc()">
        </div>
        <div class="form-group" style="margin:0">
          <label>役員賞与（年間・円）</label>
          <input type="number" class="form-input" value="${o.bonus}" step="100000"
            oninput="_execState.officers[${i}].bonus=+this.value;updateExecCalc()">
        </div>
        <div class="form-group" style="margin:0">
          <label>年齢</label>
          <input type="number" class="form-input" value="${o.age}" min="15" max="80"
            oninput="_execState.officers[${i}].age=+this.value;updateExecCalc()">
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
  _execState.officers.push({ name: `取締役${_execState.officers.length}`, monthly: 500000, bonus: 0, age: 45 });
  renderOfficerList();
  updateExecCalc();
}

function removeOfficer(i) {
  _execState.officers.splice(i, 1);
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
    calcExecScenario(o.monthly, o.bonus, o.age, pref, capital)
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
    const s = calcExecScenario(m, officer.bonus || 0, officer.age || 50, pref, capital);
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
      ※ 住民税は所得の約10%の概算値 ／ 役員賞与：${fmt(officer.bonus || 0)}/年（設定値）
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

function annualTotal(arr) { return (arr || []).reduce((a,b)=>a+b,0); }
