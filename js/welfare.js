// 法定福利費計算（複数従業員・複数賞与対応）

// 令和8年度（2026年3月分〜）協会けんぽ 健康保険料率。介護保険料率は全国一律 1.62%
// 出典: 全国健康保険協会 https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/premium_prefectures/r08/
const KAIGO_RATE = 0.0162;
const KAIGO_RATE_R07 = KAIGO_RATE; // 後方互換（旧名参照）
const KENPO_RATES = {
  '北海道': { health: 0.1028, care: KAIGO_RATE },
  '青森県': { health: 0.0985, care: KAIGO_RATE },
  '岩手県': { health: 0.0951, care: KAIGO_RATE },
  '宮城県': { health: 0.1010, care: KAIGO_RATE },
  '秋田県': { health: 0.1001, care: KAIGO_RATE },
  '山形県': { health: 0.0975, care: KAIGO_RATE },
  '福島県': { health: 0.0950, care: KAIGO_RATE },
  '茨城県': { health: 0.0952, care: KAIGO_RATE },
  '栃木県': { health: 0.0982, care: KAIGO_RATE },
  '群馬県': { health: 0.0968, care: KAIGO_RATE },
  '埼玉県': { health: 0.0967, care: KAIGO_RATE },
  '千葉県': { health: 0.0973, care: KAIGO_RATE },
  '東京都': { health: 0.0985, care: KAIGO_RATE },
  '神奈川県': { health: 0.0992, care: KAIGO_RATE },
  '新潟県': { health: 0.0921, care: KAIGO_RATE },
  '富山県': { health: 0.0959, care: KAIGO_RATE },
  '石川県': { health: 0.0970, care: KAIGO_RATE },
  '福井県': { health: 0.0971, care: KAIGO_RATE },
  '山梨県': { health: 0.0955, care: KAIGO_RATE },
  '長野県': { health: 0.0963, care: KAIGO_RATE },
  '岐阜県': { health: 0.0980, care: KAIGO_RATE },
  '静岡県': { health: 0.0961, care: KAIGO_RATE },
  '愛知県': { health: 0.0993, care: KAIGO_RATE },
  '三重県': { health: 0.0977, care: KAIGO_RATE },
  '滋賀県': { health: 0.0988, care: KAIGO_RATE },
  '京都府': { health: 0.0989, care: KAIGO_RATE },
  '大阪府': { health: 0.1013, care: KAIGO_RATE },
  '兵庫県': { health: 0.1012, care: KAIGO_RATE },
  '奈良県': { health: 0.0991, care: KAIGO_RATE },
  '和歌山県': { health: 0.1006, care: KAIGO_RATE },
  '鳥取県': { health: 0.0986, care: KAIGO_RATE },
  '島根県': { health: 0.0994, care: KAIGO_RATE },
  '岡山県': { health: 0.1005, care: KAIGO_RATE },
  '広島県': { health: 0.0978, care: KAIGO_RATE },
  '山口県': { health: 0.1015, care: KAIGO_RATE },
  '徳島県': { health: 0.1024, care: KAIGO_RATE },
  '香川県': { health: 0.1002, care: KAIGO_RATE },
  '愛媛県': { health: 0.0998, care: KAIGO_RATE },
  '高知県': { health: 0.1005, care: KAIGO_RATE },
  '福岡県': { health: 0.1011, care: KAIGO_RATE },
  '佐賀県': { health: 0.1055, care: KAIGO_RATE },
  '長崎県': { health: 0.1006, care: KAIGO_RATE },
  '熊本県': { health: 0.1008, care: KAIGO_RATE },
  '大分県': { health: 0.1008, care: KAIGO_RATE },
  '宮崎県': { health: 0.0977, care: KAIGO_RATE },
  '鹿児島県': { health: 0.1013, care: KAIGO_RATE },
  '沖縄県': { health: 0.0944, care: KAIGO_RATE },
};

const KOSEI_RATE     = 0.183;
const KODOMO_RATE    = 0.0036;
const PENSION_MAX_STD  = 650000;   // 月額標準報酬上限
const HEALTH_MAX_STD   = 1390000;  // 月額標準報酬上限
const BONUS_MAX_PENSION = 1500000; // 賞与標準賞与額上限（1回の支給につき）
const BONUS_MAX_HEALTH  = 5730000; // 賞与標準賞与額上限（年度累計）

// 後方互換: exec-comp.js から参照される
function calcSocialInsurance(salary, bonusAnnual, age, pref) {
  const rates    = KENPO_RATES[pref] || KENPO_RATES['東京都'];
  const careFlag = age >= 40 && age < 65;
  const stdPension = Math.min(salary, PENSION_MAX_STD);
  const stdHealth  = Math.min(salary, HEALTH_MAX_STD);

  const healthCompany  = Math.floor(stdHealth  * rates.health / 2);
  const careCompany    = careFlag ? Math.floor(stdHealth * rates.care / 2) : 0;
  const pensionCompany = Math.floor(stdPension * KOSEI_RATE / 2);
  const kodomo         = Math.floor(stdPension * KODOMO_RATE);

  // 健保：年度累計573万円上限、厚年：1回150万円上限（概算として1回払い想定）
  const stdBonusHealth   = Math.min(bonusAnnual, BONUS_MAX_HEALTH);
  const stdBonusPension  = Math.min(bonusAnnual, BONUS_MAX_PENSION);
  const bonusHealthComp  = Math.floor(stdBonusHealth  * rates.health / 2);
  const bonusCareComp    = careFlag ? Math.floor(stdBonusHealth * rates.care / 2) : 0;
  const bonusPensionComp = Math.floor(stdBonusPension * KOSEI_RATE / 2);
  const bonusKodomoComp  = Math.floor(stdBonusPension * KODOMO_RATE);

  const monthlyCompany = healthCompany + careCompany + pensionCompany + kodomo;
  const bonusCompany   = bonusHealthComp + bonusCareComp + bonusPensionComp + bonusKodomoComp;
  const annualCompany  = monthlyCompany * 12 + bonusCompany;

  // 個人（本人）負担：子ども・子育て拠出金は全額事業主負担のため除外。それ以外は労使折半（≒会社負担と同額）
  const personalMonthly = healthCompany + careCompany + pensionCompany;
  const bonusPersonal   = bonusHealthComp + bonusCareComp + bonusPensionComp;
  const personalAnnual  = personalMonthly * 12 + bonusPersonal;

  return {
    health:  { rate: rates.health, monthly: healthCompany },
    care:    { rate: rates.care,   monthly: careCompany, applicable: careFlag },
    pension: { rate: KOSEI_RATE,   monthly: pensionCompany },
    kodomo:  { rate: KODOMO_RATE,  monthly: kodomo },
    monthly: monthlyCompany,
    annual:  annualCompany,
    personalMonthly,
    personalAnnual,
  };
}

// ===== 複数従業員 =====

const WELFARE_KEY = 'welfare_employees_v2';

function loadWelfareEmployees(companyId) {
  try {
    const raw = localStorage.getItem(WELFARE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    return all[companyId] || [];
  } catch { return []; }
}

function saveWelfareEmployees(companyId, employees) {
  try {
    const raw = localStorage.getItem(WELFARE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[companyId] = employees;
    localStorage.setItem(WELFARE_KEY, JSON.stringify(all));
  } catch {}
}

function newEmployee() {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: '',
    salary: 300000,
    age: 35,
    bonuses: [
      { month: 6,  amount: 500000 },
      { month: 12, amount: 500000 },
    ],
  };
}

// 従業員1人の月次法定福利費（12要素配列、カレンダー月）
function calcEmpMonthly(emp, pref) {
  const rates    = KENPO_RATES[pref] || KENPO_RATES['東京都'];
  const careFlag = emp.age >= 40 && emp.age < 65;
  const stdPension = Math.min(emp.salary || 0, PENSION_MAX_STD);
  const stdHealth  = Math.min(emp.salary || 0, HEALTH_MAX_STD);

  const healthComp  = Math.floor(stdHealth  * rates.health / 2);
  const careComp    = careFlag ? Math.floor(stdHealth  * rates.care   / 2) : 0;
  const pensionComp = Math.floor(stdPension * KOSEI_RATE / 2);
  const kodomoComp  = Math.floor(stdPension * KODOMO_RATE);
  const monthlySI   = healthComp + careComp + pensionComp + kodomoComp;

  // インデックス0=1月 〜 11=12月
  const result = Array(12).fill(monthlySI);

  // 健保は年度累計573万円上限のため支給月順に累計管理（保険年度=4月〜3月）
  let healthCumulative = 0;
  const sortedBonuses = [...(emp.bonuses || [])].sort((a, b) => {
    const ai = ((a.month || 1) - 4 + 12) % 12; // 保険年度順（4月=0）
    const bi = ((b.month || 1) - 4 + 12) % 12;
    return ai - bi;
  });
  sortedBonuses.forEach(b => {
    const m = (b.month || 1) - 1;
    const remaining = Math.max(0, BONUS_MAX_HEALTH - healthCumulative);
    const stdBH = Math.min(b.amount || 0, remaining);
    const stdBP = Math.min(b.amount || 0, BONUS_MAX_PENSION);
    healthCumulative += b.amount || 0;
    const bH  = Math.floor(stdBH * rates.health / 2);
    const bC  = careFlag ? Math.floor(stdBH * rates.care / 2) : 0;
    const bP  = Math.floor(stdBP * KOSEI_RATE / 2);
    const bK  = Math.floor(stdBP * KODOMO_RATE);
    result[m] += bH + bC + bP + bK;
  });

  return result; // index 0=1月
}

// カレンダー月配列を予算月順に並び替え
function calTobudgetOrder(calArr, startMonth) {
  return Array.from({ length: 12 }, (_, i) => calArr[(startMonth - 1 + i) % 12]);
}

// ===== State =====
let _wfEmployees = [];
let _wfCompanyId = null;

// ===== レンダリング =====
function renderWelfare(container) {
  const company = window.App?.currentCompany;
  const budget  = window.App?.currentBudget;
  _wfCompanyId  = company?.id || null;
  const pref    = company?.prefecture || '東京都';
  const startMonth = budget?.startMonth || 4;

  _wfEmployees = _wfCompanyId ? loadWelfareEmployees(_wfCompanyId) : [];
  if (!_wfEmployees.length) _wfEmployees = [newEmployee()];

  container.innerHTML = `
    <div class="sim-panel">
      <div class="flex-between" style="margin-bottom:16px">
        <div>
          <h2 class="section-title">法定福利費計算</h2>
          <p class="section-sub">複数従業員・複数賞与対応　会社負担額の月次シミュレーション（${pref}）</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn-solid" onclick="_wfAddEmployee()">＋ 従業員追加</button>
          <button class="btn-outline" onclick="_wfApplyToBudget()" title="予算の法定福利費行に反映">📊 予算へ反映</button>
        </div>
      </div>

      <div id="wf_emp_list"></div>

      <div class="card" style="padding:0;overflow:hidden;margin-top:16px">
        <div style="overflow-x:auto">
          <table class="result-table" id="wf_monthly_table" style="min-width:900px">
            <thead><tr id="wf_thead_row"></tr></thead>
            <tbody id="wf_tbody"></tbody>
            <tfoot id="wf_tfoot"></tfoot>
          </table>
        </div>
      </div>

      <div class="card" style="background:#e0f2fe;border-color:#bae6fd;padding:12px 16px;font-size:11.5px;color:#0369a1;margin-top:12px">
        💡 標準報酬月額は月額給与をそのまま使用した概算です。健保上限${Math.round(HEALTH_MAX_STD/10000)}万・厚年上限${Math.round(PENSION_MAX_STD/10000)}万。
        賞与は指定した月に一括計上。介護保険は40〜64歳が対象。
      </div>
    </div>`;

  _wfRender();
}

function _wfRender() {
  _wfRenderEmployees();
  _wfRenderTable();
}

function _wfSave() {
  if (_wfCompanyId) saveWelfareEmployees(_wfCompanyId, _wfEmployees);
}

function _wfAddEmployee() {
  _wfEmployees.push(newEmployee());
  _wfSave();
  _wfRender();
}

function _wfRemoveEmployee(idx) {
  if (_wfEmployees.length <= 1) { alert('最低1名は必要です'); return; }
  if (!confirm(`「${_wfEmployees[idx].name || '(未入力)'}」を削除しますか？`)) return;
  _wfEmployees.splice(idx, 1);
  _wfSave();
  _wfRender();
}

function _wfAddBonus(empIdx) {
  if (!_wfEmployees[empIdx].bonuses) _wfEmployees[empIdx].bonuses = [];
  _wfEmployees[empIdx].bonuses.push({ month: 12, amount: 300000 });
  _wfSave();
  _wfRender();
}

function _wfRemoveBonus(empIdx, bonusIdx) {
  _wfEmployees[empIdx].bonuses.splice(bonusIdx, 1);
  _wfSave();
  _wfRender();
}

function _wfRenderEmployees() {
  const el = document.getElementById('wf_emp_list');
  if (!el) return;

  const MONTH_OPTS = Array.from({ length: 12 }, (_, i) =>
    `<option value="${i+1}">${i+1}月</option>`
  ).join('');

  el.innerHTML = _wfEmployees.map((emp, ei) => {
    const bonusRows = (emp.bonuses || []).map((b, bi) => `
      <div style="display:flex;gap:6px;align-items:center;margin-top:6px">
        <span style="font-size:11px;color:var(--text-muted);width:32px">賞与${bi+1}</span>
        <select class="form-input" style="width:68px;font-size:11px;padding:3px"
          onchange="_wfEmployees[${ei}].bonuses[${bi}].month=+this.value;_wfSave();_wfRenderTable()">
          ${Array.from({length:12},(_,i)=>`<option value="${i+1}"${b.month===i+1?' selected':''}>${i+1}月</option>`).join('')}
        </select>
        <input type="number" class="form-input" style="width:110px;font-size:12px;text-align:right"
          value="${b.amount||''}" placeholder="0" step="10000"
          oninput="_wfEmployees[${ei}].bonuses[${bi}].amount=+this.value||0;_wfSave();_wfRenderTable()">
        <span style="font-size:11px;color:var(--text-muted)">円</span>
        <button onclick="_wfRemoveBonus(${ei},${bi})"
          style="background:#fee2e2;border:1px solid #fca5a5;color:#dc2626;border-radius:4px;padding:2px 7px;font-size:11px;cursor:pointer">✕</button>
      </div>`).join('');

    const annualBonus = (emp.bonuses || []).reduce((s, b) => s + (b.amount || 0), 0);
    const pref = window.App?.currentCompany?.prefecture || '東京都';
    const si   = calcSocialInsurance(emp.salary || 0, annualBonus, emp.age || 35, pref);

    return `
      <div class="card" style="padding:14px 16px;margin-bottom:10px">
        <div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap">
          <div style="flex:1;min-width:160px">
            <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">氏名</label>
            <input class="form-input" style="font-size:13px;font-weight:600" value="${escHtml(emp.name)}" placeholder="従業員名"
              oninput="_wfEmployees[${ei}].name=this.value;_wfSave();_wfRenderTable()">
          </div>
          <div style="min-width:130px">
            <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">月額給与（円）</label>
            <input type="number" class="form-input" style="font-size:12px;text-align:right"
              value="${emp.salary||''}" placeholder="300000" step="10000"
              oninput="_wfEmployees[${ei}].salary=+this.value||0;_wfSave();_wfRenderTable()">
          </div>
          <div style="min-width:80px">
            <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">年齢</label>
            <input type="number" class="form-input" style="font-size:12px"
              value="${emp.age||35}" min="15" max="80"
              oninput="_wfEmployees[${ei}].age=+this.value||35;_wfSave();_wfRenderTable()">
          </div>
          <div style="min-width:180px">
            <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">賞与</label>
            ${bonusRows}
            <button onclick="_wfAddBonus(${ei})"
              style="margin-top:6px;font-size:11px;background:var(--emerald-light);border:1px solid var(--teal);color:var(--emerald-dark);border-radius:4px;padding:2px 10px;cursor:pointer">＋ 賞与追加</button>
          </div>
          <div style="min-width:120px;border-left:1px solid var(--border);padding-left:14px">
            <div style="font-size:10px;color:var(--text-muted)">月額法定福利費</div>
            <div style="font-size:18px;font-weight:700;color:var(--emerald-dark)">${fmt(si.monthly)}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:4px">年間合計</div>
            <div style="font-size:14px;font-weight:600">${fmt(si.annual)}</div>
            ${emp.age>=40&&emp.age<65?'<div style="font-size:10px;color:#d97706;margin-top:2px">介護保険対象</div>':''}
          </div>
          <button onclick="_wfRemoveEmployee(${ei})" title="削除"
            style="align-self:flex-start;background:#fee2e2;border:1px solid #fca5a5;color:#dc2626;border-radius:4px;padding:4px 10px;font-size:12px;cursor:pointer">🗑</button>
        </div>
      </div>`;
  }).join('');
}

function _wfCalcBreakdown(pref, startMonth) {
  // 月次を3種類に分解して返す（予算月順）
  const regularSI  = Array(12).fill(0); // 通常月の法定福利費
  const bonusSI    = Array(12).fill(0); // 賞与月の法定福利費追加分
  const bonusSalary = Array(12).fill(0); // 賞与支給額

  _wfEmployees.forEach(emp => {
    const baseSI     = calcSocialInsurance(emp.salary || 0, 0, emp.age || 35, pref).monthly;
    const calMonthly = calcEmpMonthly(emp, pref); // index 0=1月

    for (let i = 0; i < 12; i++) {
      const calIdx = (startMonth - 1 + i) % 12;
      regularSI[i] += baseSI;
      bonusSI[i]   += Math.max(0, calMonthly[calIdx] - baseSI);
    }
    (emp.bonuses || []).forEach(b => {
      const bi = ((b.month - 1) - (startMonth - 1) + 12) % 12;
      bonusSalary[bi] += b.amount || 0;
    });
  });

  return { regularSI, bonusSI, bonusSalary };
}

function _wfRenderTable() {
  const theadRow = document.getElementById('wf_thead_row');
  const tbody    = document.getElementById('wf_tbody');
  const tfoot    = document.getElementById('wf_tfoot');
  if (!theadRow || !tbody || !tfoot) return;

  const pref       = window.App?.currentCompany?.prefecture || '東京都';
  const startMonth = window.App?.currentBudget?.startMonth || 4;
  const months     = getMonthLabels(startMonth);

  theadRow.innerHTML = `
    <th style="position:sticky;left:0;background:#e0f2fe;z-index:5">従業員</th>
    <th style="text-align:right">月額SI</th>
    ${months.map(m => `<th style="text-align:right">${m}</th>`).join('')}
    <th style="text-align:right">年間合計</th>`;

  const empData = _wfEmployees.map(emp => {
    const calMonthly    = calcEmpMonthly(emp, pref);
    const budgetMonthly = calTobudgetOrder(calMonthly, startMonth);
    const annualTotal   = budgetMonthly.reduce((s, v) => s + v, 0);
    const baseSI        = calcSocialInsurance(emp.salary || 0, 0, emp.age || 35, pref).monthly;
    return { emp, budgetMonthly, annualTotal, baseSI };
  });

  // 賞与が発生する予算月インデックス
  const bonusMonths = new Set();
  _wfEmployees.forEach(emp => {
    (emp.bonuses || []).forEach(b => {
      bonusMonths.add(((b.month - 1) - (startMonth - 1) + 12) % 12);
    });
  });

  tbody.innerHTML = empData.map(({ emp, budgetMonthly, annualTotal, baseSI }) => `
    <tr>
      <td style="position:sticky;left:0;background:#fff;font-weight:600;font-size:12px">${escHtml(emp.name||'(未入力)')}</td>
      <td style="text-align:right;font-size:11px;color:var(--text-muted)">${fmt(baseSI)}</td>
      ${budgetMonthly.map((v, mi) => {
        const bonusPart = Math.max(0, v - baseSI);
        const isBonusMonth = bonusPart > 0;
        return `<td style="text-align:right;font-size:12px;${isBonusMonth ? 'background:#fffbeb' : ''}">
          <div style="${isBonusMonth ? 'font-weight:700' : ''}">${fmt(baseSI)}</div>
          ${isBonusMonth ? `<div style="font-size:9px;color:#d97706;font-weight:700">+${fmt(bonusPart)}<br>▲賞与SI</div>` : ''}
        </td>`;
      }).join('')}
      <td style="text-align:right;font-weight:700;color:var(--emerald-dark)">${fmt(annualTotal)}</td>
    </tr>`).join('');

  const { regularSI, bonusSI, bonusSalary } = _wfCalcBreakdown(pref, startMonth);
  const totalRegSI   = regularSI.reduce((s, v) => s + v, 0);
  const totalBonSI   = bonusSI.reduce((s, v) => s + v, 0);
  const totalBonSal  = bonusSalary.reduce((s, v) => s + v, 0);
  const grandSI      = totalRegSI + totalBonSI;

  const tfRow = (label, arr, total, bg, color, bold) => `
    <tr style="background:${bg}">
      <td style="position:sticky;left:0;background:${bg};padding:6px 10px;font-size:11.5px;${bold?'font-weight:700':'color:var(--text-muted)'}">${label}</td>
      <td></td>
      ${arr.map(v => `<td style="text-align:right;padding:5px 8px;font-size:11.5px;${v>0&&color?'color:'+color:''}">${v ? fmt(v) : '–'}</td>`).join('')}
      <td style="text-align:right;padding:5px 8px;font-weight:700;${color?'color:'+color:''}">${fmt(total)}</td>
    </tr>`;

  tfoot.innerHTML =
    tfRow('法定福利費（月額）合計',   regularSI,  totalRegSI,  '#f0f9ff', '',        true) +
    tfRow('うち賞与分法定福利費',      bonusSI,    totalBonSI,  '#fffbeb', '#d97706', false) +
    tfRow('賞与支給額合計',           bonusSalary, totalBonSal, '#fff7f0', '#ea580c', false) +
    `<tr style="background:#e0f2fe;font-weight:700;border-top:2px solid #bae6fd">
      <td style="position:sticky;left:0;background:#e0f2fe;padding:7px 10px">法定福利費 総合計</td>
      <td></td>
      ${Array.from({length:12},(_,i)=>`<td style="text-align:right;padding:6px 8px">${fmt(regularSI[i]+bonusSI[i])}</td>`).join('')}
      <td style="text-align:right;padding:6px 8px;color:var(--emerald-dark)">${fmt(grandSI)}</td>
    </tr>`;
}

// ===== 反映グループ共通ヘルパー =====

// 販売費及び一般管理費の末尾に「法定福利費（反映）」「賞与（反映）」親科目を作成
// 既存（旧バージョンで誤った位置に作られたもの）も子科目ごと正しい位置へ再配置する
function _ensureReflectGroup(budget) {
  let accts = budget.dynamicAccounts;
  if (!accts) return { wfWelfarePar: null, wfBonusPar: null };

  const REFLECT_IDS = ['wf_reflect_welfare', 'wf_reflect_bonus'];
  const CHILD_IDS   = ['wf_welfare_bonus', 'wf_emp_bonus', 'exec_welfare_bonus', 'exec_bonus'];

  // 反映グループ（親＋子）を一旦すべて取り出す
  const groupIds = new Set([...REFLECT_IDS, ...CHILD_IDS]);
  const pulled = accts.filter(a => groupIds.has(a.id));
  accts = budget.dynamicAccounts = accts.filter(a => !groupIds.has(a.id));

  // 親科目を取得 or 生成
  let wfWelfarePar = pulled.find(a => a.id === 'wf_reflect_welfare') || {
    id: 'wf_reflect_welfare', name: '法定福利費（反映）', type: 'parent',
    indent: 1, parentId: 'sec_sga', section: 'pl', sign: -1, bold: true, custom: true,
  };
  let wfBonusPar = pulled.find(a => a.id === 'wf_reflect_bonus') || {
    id: 'wf_reflect_bonus', name: '賞与（反映）', type: 'parent',
    indent: 1, parentId: 'sec_sga', section: 'pl', sign: -1, bold: true, custom: true,
  };
  // 名前・位置情報を正規化
  wfWelfarePar.name = '法定福利費（反映）'; wfWelfarePar.type = 'parent';
  wfWelfarePar.indent = 1; wfWelfarePar.parentId = 'sec_sga'; wfWelfarePar.section = 'pl'; wfWelfarePar.sign = -1; wfWelfarePar.bold = true;
  wfBonusPar.name = '賞与（反映）'; wfBonusPar.type = 'parent';
  wfBonusPar.indent = 1; wfBonusPar.parentId = 'sec_sga'; wfBonusPar.section = 'pl'; wfBonusPar.sign = -1; wfBonusPar.bold = true;

  // 子科目（存在するものだけ）を親ごとに振り分け
  const welfareKids = pulled.filter(a => a.id === 'wf_welfare_bonus' || a.id === 'exec_welfare_bonus');
  const bonusKids   = pulled.filter(a => a.id === 'wf_emp_bonus'     || a.id === 'exec_bonus');

  // sec_sga 配下（その子孫）の末尾を挿入位置とする（営業利益などの計算行の手前で止める）
  const sgaIdx = accts.findIndex(a => a.id === 'sec_sga');
  let insertPos = accts.length;
  if (sgaIdx >= 0) {
    const sgaMembers = new Set(['sec_sga']);
    insertPos = sgaIdx + 1;
    for (let i = sgaIdx + 1; i < accts.length; i++) {
      const a = accts[i];
      if (a.type !== 'section' && a.parentId && sgaMembers.has(a.parentId)) {
        sgaMembers.add(a.id);
        insertPos = i + 1;
      } else {
        break;
      }
    }
  }

  // ブロックとして組み立てて一括挿入
  const block = [wfWelfarePar, ...welfareKids, wfBonusPar, ...bonusKids];
  accts.splice(insertPos, 0, ...block);

  return { wfWelfarePar, wfBonusPar };
}

// 指定親IDの下に子科目を作成（既存なら名前・親を更新）
function _wfEnsureChildOf(budget, childId, childName, parentId) {
  const accts = budget.dynamicAccounts;
  const parent = accts.find(a => a.id === parentId);
  if (!parent) return;

  const existing = accts.find(a => a.id === childId);
  if (existing) {
    existing.name     = childName;
    existing.parentId = parentId;
    existing.indent   = (parent.indent ?? 1) + 1;
    existing.section  = parent.section || 'pl';
    existing.sign     = parent.sign ?? -1;
    return;
  }

  let pos = accts.indexOf(parent) + 1;
  while (pos < accts.length && accts[pos].parentId === parentId) pos++;
  accts.splice(pos, 0, {
    id: childId, name: childName, type: 'input',
    indent: (parent.indent ?? 1) + 1, parentId: parentId,
    section: parent.section || 'pl', sign: parent.sign ?? -1,
    bold: false, custom: true,
  });
}

function _wfApplyToBudget() {
  const budget = window.App?.currentBudget;
  if (!budget) { alert('予算データがありません'); return; }

  const pref       = window.App?.currentCompany?.prefecture || '東京都';
  const startMonth = budget.startMonth || 4;
  const { regularSI, bonusSI, bonusSalary } = _wfCalcBreakdown(pref, startMonth);

  if (!budget.rows) budget.rows = {};

  if (budget.dynamicAccounts) {
    // 旧コードが作った wf_auto_* 科目を除去
    budget.dynamicAccounts = budget.dynamicAccounts.filter(a => !a.id?.startsWith('wf_auto_'));

    // 反映グループ（販管費末尾）を確保
    _ensureReflectGroup(budget);

    // 子科目を法定福利費（反映）・賞与（反映）の下に配置
    _wfEnsureChildOf(budget, 'wf_welfare_bonus', '法定福利費（従業員賞与）', 'wf_reflect_welfare');
    _wfEnsureChildOf(budget, 'wf_emp_bonus',     '従業員賞与',               'wf_reflect_bonus');

    // 値を書き込み（既存のCSVインポート済み科目は変更しない）
    budget.rows['wf_welfare_bonus'] = bonusSI;
    budget.rows['wf_emp_bonus']     = bonusSalary;
  } else {
    budget.rows['sga_welfare'] = regularSI.map((v, i) => v + bonusSI[i]);
    budget.rows['sga_bonus']   = bonusSalary;
  }

  saveBudget(budget);
  window.App.currentBudget = budget;
  alert(
    `予算に反映しました。\n` +
    `法定福利費（従業員賞与分）：${fmt(bonusSI.reduce((s,v)=>s+v,0))}\n` +
    `従業員賞与合計：${fmt(bonusSalary.reduce((s,v)=>s+v,0))}\n` +
    `→ 「法定福利費（反映）」「賞与（反映）」グループに書き込みました`
  );
}

function fmt(n) {
  return Math.round(n || 0).toLocaleString();
}
