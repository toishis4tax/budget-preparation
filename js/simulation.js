// 翌年度・5か年シミュレーション

function renderNextYearSim(container, budget) {
  if (!budget) {
    container.innerHTML = '<div class="no-data">予算データがありません。まず月次予算を入力してください。</div>';
    return;
  }

  const inputKeys = [
    { id: 'sales',       label: '売上高成長率' },
    { id: 'cogs',        label: '売上原価増減率' },
    { id: 'sga_exec',    label: '役員報酬増減率' },
    { id: 'sga_emp',     label: '従業員給与増減率' },
    { id: 'sga_bonus',   label: '賞与増減率' },
    { id: 'sga_welfare', label: '法定福利費増減率' },
    { id: 'sga_rent',    label: '地代家賃増減率' },
    { id: 'sga_depr',    label: '減価償却費増減率' },
    { id: 'sga_other',   label: 'その他経費増減率' },
    { id: 'int_expense', label: '支払利息増減率' },
  ];

  const rows = inputKeys.map(k => `
    <tr>
      <td>${k.label}</td>
      <td><input type="number" id="ny_${k.id}" value="105" step="0.1" class="rate-input"> %</td>
    </tr>`).join('');

  container.innerHTML = `
    <div class="sim-panel">
      <h2 class="section-title">翌年度予測</h2>
      <div class="sim-grid">
        <div class="sim-inputs card">
          <h3>増減率設定（前年比%）</h3>
          <table class="rate-table"><tbody>${rows}</tbody></table>
          <button class="btn-solid" onclick="runNextYearSim()">予測実行</button>
        </div>
        <div class="sim-results card" id="ny_result">
          <h3>翌年度PL予測</h3>
          <p class="hint">計算ボタンを押してください</p>
        </div>
      </div>
    </div>`;
}

function runNextYearSim() {
  const budget = window.App?.currentBudget;
  if (!budget) return;

  const getRate = id => parseFloat(document.getElementById(`ny_${id}`)?.value || 100) / 100;

  // --- Static mode (動的科目なし) ---
  if (!budget.dynamicAccounts?.length) {
    const newRows = {};
    Object.keys(budget.rows).forEach(id => {
      const rate = getRate(id);
      newRows[id] = (budget.rows[id] || new Array(12).fill(0)).map(v => Math.round(v * rate));
    });
    const pl = calcPL(newRows);
    _nyDisplay([
      { label: '売上高',               vals: pl.sales },
      { label: '売上原価',             vals: pl.cogs },
      { label: '売上総利益',           vals: pl.gross_profit, bold: true },
      { label: '販売費及び一般管理費', vals: pl.sga },
      { label: '営業利益',             vals: pl.op_profit, bold: true },
      { label: '経常利益',             vals: pl.ord_profit, bold: true },
      { label: '税引前当期純利益',     vals: pl.pretax_profit, bold: true },
      { label: '当期純利益',           vals: pl.net_profit, bold: true },
    ]);
    return;
  }

  // --- Dynamic mode (試算表インポートあり) ---
  const accts = budget.dynamicAccounts;
  const newRows = {};

  // 各入力科目に科目名キーワードで増減率を適用
  Object.keys(budget.rows).forEach(id => {
    const acc = accts.find(a => a.id === id);
    const rate = _nyRate(acc, getRate);
    const orig = budget.rows[id] || [];
    // index 0-11 = 月次に率適用; index 12 = 調整欄はそのまま
    newRows[id] = orig.map((v, i) => i < 12 ? Math.round(v * rate) : v);
  });

  const allVals = calcAllValuesDynamic({ ...budget, rows: newRows });
  const get12 = id => {
    const v = allVals[id];
    return Array.from({ length: 12 }, (_, i) => (v ? (v[i] || 0) : 0));
  };

  // PL section・calculated科目を順序どおり表示
  const items = accts
    .filter(a => a.section === 'pl' && (!a.parentId || a.parentId === ''))
    .map(a => ({ label: a.name, vals: get12(a.id), bold: a.type === 'calculated' || !!a.bold }));

  _nyDisplay(items);
}

// 科目名から増減率カテゴリを判定
function _nyRate(acc, getRate) {
  if (!acc) return 1;
  const n = acc.name || '';
  if (/役員.*(報酬|給与)/.test(n))        return getRate('sga_exec');
  if (/給与|賃金/.test(n))                 return getRate('sga_emp');
  if (/賞与/.test(n))                      return getRate('sga_bonus');
  if (/法定福利|社会保険|厚生年金|健康保険|雇用保険/.test(n)) return getRate('sga_welfare');
  if (/地代|賃借料|家賃/.test(n))          return getRate('sga_rent');
  if (/減価償却/.test(n))                  return getRate('sga_depr');
  if (/支払利息/.test(n))                  return getRate('int_expense');
  if (acc.sign === 1)                      return getRate('sales');
  if (/原価/.test(n))                      return getRate('cogs');
  return getRate('sga_other');
}

function _nyDisplay(items) {
  const el = document.getElementById('ny_result');
  if (!el) return;
  el.innerHTML = `
    <h3>翌年度PL予測</h3>
    <div class="table-scroll">
    <table class="result-table ny-table">
      <thead>
        <tr>
          <th class="acc-col">科目</th>
          ${Array.from({ length: 12 }, (_, i) => `<th>${i + 1}月</th>`).join('')}
          <th>合計</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(item => {
          const total = item.vals.reduce((a, b) => a + b, 0);
          return `<tr class="${item.bold ? 'bold-row' : ''}">
            <td>${item.label}</td>
            ${item.vals.map(v => `<td class="num">${fmtK(v)}</td>`).join('')}
            <td class="num total">${fmtK(total)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>
    <div class="wf-note">単位：千円</div>`;
}

// 5か年計画
function renderFiveYearSim(container, budget) {
  container.innerHTML = `
    <div class="sim-panel">
      <h2 class="section-title">5か年計画</h2>
      <div class="card">
        <h3>年度別成長率設定</h3>
        <div class="table-scroll">
        <table class="rate-table fy-rate-table">
          <thead>
            <tr>
              <th>項目</th>
              ${[1,2,3,4,5].map(y=>`<th>${y}年目</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${[
              { id:'fy_sales',   label:'売上高成長率 (%)', def:110 },
              { id:'fy_cogs',    label:'売上原価増減率 (%)', def:105 },
              { id:'fy_salary',  label:'人件費増減率 (%)', def:103 },
              { id:'fy_rent',    label:'家賃増減率 (%)', def:100 },
              { id:'fy_other',   label:'その他経費増減率 (%)', def:102 },
              { id:'fy_invest',  label:'設備投資（万円）', def:0 },
              { id:'fy_loan_r',  label:'借入返済（万円）', def:0 },
            ].map(row => `
              <tr>
                <td>${row.label}</td>
                ${[1,2,3,4,5].map(y=>`
                  <td><input type="number" id="${row.id}_${y}" value="${row.def}" step="0.1" class="rate-input-sm"></td>
                `).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
        </div>
        <button class="btn-solid" onclick="runFiveYearSim()">5か年計画実行</button>
      </div>
      <div id="fy_result"></div>
    </div>`;
}

function runFiveYearSim() {
  const budget = window.App?.currentBudget;

  const getRate = (id, y) => parseFloat(document.getElementById(`${id}_${y}`)?.value || 100) / 100;
  const getVal  = (id, y) => parseFloat(document.getElementById(`${id}_${y}`)?.value || 0) * 10000;
  const annSum  = (arr) => arr ? arr.slice(0,13).reduce((a,b)=>a+b,0) : 0;

  // ベースライン（動的/静的どちらも対応）
  let curSales, curCogs, curSalary, curRent, curOther, curCash, curLoan;
  if (budget?.dynamicAccounts?.length) {
    const av    = calcAllValuesDynamic(budget);
    const accts = budget.dynamicAccounts;
    const dynSum  = id => annSum(av[id] || []);
    const matchSum = re => {
      const matching = accts.filter(a => a.type !== 'section' && re.test(a.name || ''));
      const ids = new Set(matching.map(a => a.id));
      return matching.filter(a => !ids.has(a.parentId)).reduce((s,a) => s + dynSum(a.id), 0);
    };
    const _actIdxs = (budget.actualCols||[]).map((v,i)=>v?i:-1).filter(i=>i>=0);
    const closeIdx = _actIdxs.length > 0 ? Math.max(..._actIdxs) : 11;
    curSales  = dynSum('sec_revenue') || dynSum('sales');
    curCogs   = dynSum('sec_cogs')    || dynSum('cogs');
    curSalary = matchSum(/給与|給料|賃金|役員報酬|役員賞与|賞与|法定福利|人件費|雑給/);
    curRent   = matchSum(/家賃|地代|賃借料|リース/);
    const sgaTotal = dynSum('sec_sga') || dynSum('sga');
    curOther  = sgaTotal - curSalary - curRent;
    curCash   = (av['sec_cur_asset'] || [])[closeIdx] || 0;
    curLoan   = matchSum(/借入金/);
  } else {
    const basePL = budget ? calcPL(budget.rows) : null;
    const baseBS = budget ? calcBS(budget.rows) : null;
    curSales  = basePL ? annSum(basePL.sales)      : 0;
    curCogs   = basePL ? annSum(basePL.cogs)       : 0;
    curSalary = basePL ? annSum(basePL.sga_salary) : 0;
    curRent   = basePL ? annSum(budget.rows.sga_rent||[]) : 0;
    curOther  = basePL ? annSum(basePL.sga) - annSum(basePL.sga_salary) - annSum(budget.rows.sga_rent||[]) : 0;
    curCash   = baseBS ? (baseBS.current_assets[11]||0) : 0;
    curLoan   = baseBS ? ((baseBS.fixed_liab[11]||0)+(budget.rows.short_loan?.[11]||0)) : 0;
  }

  const years = [];
  for (let y = 1; y <= 5; y++) {
    curSales   = Math.round(curSales  * getRate('fy_sales',  y));
    curCogs    = Math.round(curCogs   * getRate('fy_cogs',   y));
    curSalary  = Math.round(curSalary * getRate('fy_salary', y));
    curRent    = Math.round(curRent   * getRate('fy_rent',   y));
    curOther   = Math.round(curOther  * getRate('fy_other',  y));

    const sga       = curSalary + curRent + curOther;
    const grossP    = curSales - curCogs;
    const opP       = grossP - sga;
    const invest    = getVal('fy_invest', y);
    const loanRepay = getVal('fy_loan_r', y);

    // 概算CF
    const depr = budget?.rows?.sga_depr ? annSum(budget.rows.sga_depr) : 0;
    const opCF  = opP + depr;
    const invCF = -invest;
    const finCF = -loanRepay;
    curCash = curCash + opCF + invCF + finCF;
    curLoan = Math.max(0, curLoan - loanRepay);

    years.push({ y, sales: curSales, grossP, sga, opP, opCF, curCash, curLoan, invest });
  }

  const el = document.getElementById('fy_result');
  if (!el) return;

  const LABELS = ['売上高','売上総利益','販売管理費','営業利益','現預金残高','借入残高'];
  const KEYS   = ['sales','grossP','sga','opP','curCash','curLoan'];

  el.innerHTML = `
    <div class="card" style="margin-top:1rem">
      <h3>5か年推移（概算）</h3>
      <div class="table-scroll">
      <table class="result-table">
        <thead>
          <tr><th>項目</th>${years.map(r=>`<th>${r.y}年目</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${LABELS.map((label,i) => `
            <tr class="${['営業利益','現預金残高'].includes(label)?'bold-row':''}">
              <td>${label}</td>
              ${years.map(r=>`<td class="num">${fmtK(r[KEYS[i]])}</td>`).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
      </div>
      <div class="wf-note">単位：千円</div>
    </div>
    <div class="card" style="margin-top:1rem">
      <canvas id="fy_chart" height="120"></canvas>
    </div>`;

  // Chart.js
  if (typeof Chart !== 'undefined') {
    const ctx = document.getElementById('fy_chart');
    if (ctx._chartInstance) ctx._chartInstance.destroy();
    ctx._chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: years.map(r => `${r.y}年目`),
        datasets: [
          { label: '売上高',   data: years.map(r=>r.sales/1000),  backgroundColor: '#3b82f6', yAxisID:'y' },
          { label: '営業利益', data: years.map(r=>r.opP/1000),    backgroundColor: '#10b981', yAxisID:'y' },
          { label: '現預金',   data: years.map(r=>r.curCash/1000),type:'line', borderColor:'#f59e0b', fill:false, yAxisID:'y' },
          { label: '借入残高', data: years.map(r=>r.curLoan/1000),type:'line', borderColor:'#ef4444', fill:false, yAxisID:'y' },
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position:'bottom' }, title: { display:true, text:'5か年財務推移（千円）' } },
        scales: { y: { beginAtZero: false } }
      }
    });
  }
}

// キャッシュフロー予測
function renderCashFlow(container, budget) {
  if (!budget) {
    container.innerHTML = '<div class="no-data">予算データがありません。</div>';
    return;
  }

  const company     = window.App?.currentCompany;
  const curYear     = window.App?.currentYear || new Date().getFullYear();
  const actualCols  = getActualCols(budget);
  // 実績月は actualRows、予算月は rows をブレンド
  const _rows = budget.dynamicAccounts ? getMergedRows(budget) : null;
  const allVals = budget.dynamicAccounts
    ? calcAllValuesDynamic({ ...budget, rows: _rows })
    : calcAllValues(budget.rows);
  const monthLabels = getMonthLabels(budget.startMonth || 4);

  // 期首現預金: ① 前期末（index 11）→ ② 当期首（index 0）→ ③ 0（手入力）
  // 現金・預金の全口座を合算（単一科目ではなく全口座の合計）
  let autoCash = 0, cashSource = '手動入力';
  const budgetPrev1 = (typeof getBudget === 'function') ? getBudget(company?.id, curYear - 1) : null;

  // 現金・預金の全leaf科目を合算（二重計上防止: 親子両方マッチする場合は子を優先）
  const _sumCashAt = (b, idx) => {
    if (!b?.dynamicAccounts) return 0;
    const av = calcAllValuesDynamic(b);
    const CASH_RE = /現金|預金|信金|銀行|信用組合/;
    const matching = b.dynamicAccounts.filter(a =>
      a.section === 'bs_asset' &&
      a.type !== 'section' &&
      CASH_RE.test((a.name || '').replace(/\s/g,''))
    );
    const matchingIds = new Set(matching.map(a => a.id));
    const deduped = matching.filter(a => !matchingIds.has(a.parentId));
    return deduped.reduce((s, a) => s + ((av[a.id] || [])[idx] || 0), 0);
  };

  // ① 前期末（index 11 = 期末月）
  if (budgetPrev1?.dynamicAccounts) {
    const v = _sumCashAt(budgetPrev1, 11);
    if (v) { autoCash = v; cashSource = '前期末 BS残高（自動取得）'; }
  }
  // ② 当期首（index 0 = 期初月の実績）
  if (!autoCash && budget.dynamicAccounts) {
    const v = _sumCashAt(budget, 0);
    if (v) { autoCash = v; cashSource = '当期首 BS残高（自動取得）'; }
  }

  // 減価償却費: SGA内の減価償却科目から合算
  const deprArr = (() => {
    if (budget.dynamicAccounts) {
      const deprAccs = budget.dynamicAccounts.filter(a =>
        a.name.replace(/\s/g,'').match(/減価償却/) && a.type === 'input'
      );
      return Array.from({length:12}, (_,i) =>
        deprAccs.reduce((s,a) => s + ((allVals[a.id]||[])[i]||0), 0)
      );
    }
    return budget.rows.sga_depr || new Array(12).fill(0);
  })();

  // 税額概算（法人税＋消費税）
  const taxEst    = calcCtaxEstimate ? calcCtaxEstimate(budget, company) : null;
  const corpTax   = (() => {
    const pretaxArr = allVals['calc_pretax'] || (calcPL ? calcPL(budget.rows).pretax_profit : new Array(12).fill(0));
    const pretax = pretaxArr.reduce((a,v)=>a+v,0);
    if (pretax <= 0) return 0;
    const t = calcAllTax ? calcAllTax(pretax, company?.capital||10000000) : null;
    return t ? t.total : 0;
  })();
  const ctaxAmt   = (taxEst && !taxEst.exempt && !taxEst.noData) ? (taxEst.ctax || 0) : 0;
  const prepaid1  = company?.prepaid1  || 0;
  const prepaid2  = company?.prepaid2  || 0;
  const ctaxPrepaid = company?.ctaxPrepaid || 0;

  // 予定納税・中間納付の支払月（デフォルト：第1回=8月=index4、第2回=11月=index7、消費税=8月=index4）
  const fiscalStart = budget.startMonth || 4; // 4月
  const monthOffset = m => ((m - fiscalStart + 12) % 12); // 月→配列index変換

  container.innerHTML = `
    <div class="sim-panel">
      <h2 class="section-title">キャッシュフロー予測
        <span style="font-size:13px;font-weight:normal;color:var(--text-muted);margin-left:12px">【${company?.name || ''}　${budget.year}年度】</span>
      </h2>
      <p class="section-sub">営業CF（利益＋減価償却）＋ 財務CF（借入返済・新規借入）＋ 法人税支払　※消費税はパススルー（計上せず）</p>

      <div class="sim-grid">
        <div class="card-h">
          <h3>⚙️ 設定</h3>

          <div class="tax-block-label">開始残高</div>
          <div class="form-group">
            <label>期首現預金残高（円）<span class="ctax-auto-badge">${cashSource}</span>
              <button type="button" onclick="cfResetOpenCash(${autoCash})" style="margin-left:8px;font-size:11px;padding:2px 7px;border:1px solid var(--primary);border-radius:4px;background:none;color:var(--primary);cursor:pointer">BSから再取得（${(autoCash/1000).toFixed(0)}千円）</button>
            </label>
            <input type="number" id="cf_open_cash" value="${autoCash}" step="100000" class="form-input" oninput="runCashFlow()">
          </div>

          <div class="tax-block-label" style="margin-top:12px">財務CF</div>
          <div class="form-group">
            <label>月次借入返済額（円/月）</label>
            <input type="number" id="cf_loan_repay" value="0" step="10000" class="form-input" oninput="runCashFlow()">
          </div>
          <div class="form-group">
            <label>新規借入（年間・円）</label>
            <input type="number" id="cf_new_loan" value="0" step="100000" class="form-input" oninput="runCashFlow()">
          </div>
          <div class="form-group">
            <label>設備投資（年間・円）</label>
            <input type="number" id="cf_invest" value="0" step="100000" class="form-input" oninput="runCashFlow()">
          </div>

          <div class="tax-block-label" style="margin-top:12px">前期申告納税（期首第2月に支出）</div>
          <div class="form-group">
            <label>前期法人税等 確定申告（円）</label>
            <input type="number" id="cf_prev_corp" value="0" step="10000" class="form-input" oninput="runCashFlow()">
          </div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:3px">→ ${monthLabels[1]}（第2月）に計上</div>

          <div class="tax-block-label" style="margin-top:12px">当期中間納付（法人税）</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="form-group" style="margin:0">
              <label>法人税 中間申告（年1回・円）</label>
              <input type="number" id="cf_tax1_amt" value="${prepaid1}" step="10000" class="form-input" oninput="runCashFlow()">
            </div>
            <div class="form-group" style="margin:0">
              <label>支払月</label>
              <select id="cf_tax1_month" class="form-input" onchange="runCashFlow()">
                ${monthLabels.map((m,i)=>`<option value="${i}" ${i===4?'selected':''}>${m}</option>`).join('')}
              </select>
            </div>
          </div>
          <div style="margin-top:10px;font-size:10px;color:var(--text-muted)">
            ※当期確定申告分（法人税${Math.round(Math.max(0,corpTax-prepaid1)/1000).toLocaleString()}千円）は翌期のため含みません<br>
            ※消費税は仮受（預り）と仮払が相殺されるため資金繰りには計上していません（パススルー）
          </div>
        </div>

        <div class="card-h">
          <h3>📊 月末現預金残高</h3>
          <canvas id="cf_chart" height="160"></canvas>
        </div>
      </div>

      <div class="card-h" style="margin-top:0" id="cf_table_wrap">
        <h3>📋 月次キャッシュフロー明細</h3>
        <div id="cf_result"></div>
      </div>
    </div>`;

  // state 保存（localStorageにも保存して再レンダリング・リロード後も復元）
  // company.id が空の場合は degenerate キーになるので localStorage を使わない
  const _cfKey = company?.id ? `cf_inputs_${company.id}_${budget?.year || ''}` : null;
  const _cfSaved = _cfKey ? (() => { try { return JSON.parse(localStorage.getItem(_cfKey)); } catch { return null; } })() : null;
  const prev = _cfSaved || {};  // window._cfStateは他社の値を引き継ぐためフォールバックに使わない
  window._cfState = {
    allVals, deprArr, monthLabels, actualCols, budget,
    openCash:   prev.openCash   ?? autoCash,
    loanRepay:  prev.loanRepay  ?? 0,
    newLoan:    prev.newLoan    ?? 0,
    invest:     prev.invest     ?? 0,
    prevCorp:   prev.prevCorp   ?? 0,
    tax1Amt:    prev.tax1Amt    ?? prepaid1,
    tax1Month:  prev.tax1Month  ?? 4,
    _cfKey,
  };
  // 保存済み入力値をDOMに復元
  const s = window._cfState;
  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  setV('cf_open_cash',  s.openCash);
  setV('cf_loan_repay', s.loanRepay);
  setV('cf_new_loan',   s.newLoan);
  setV('cf_invest',     s.invest);
  setV('cf_prev_corp',  s.prevCorp);
  setV('cf_tax1_amt',   s.tax1Amt);
  setV('cf_tax1_month', s.tax1Month);
  runCashFlow();
}

function cfResetOpenCash(autoCash) {
  const el = document.getElementById('cf_open_cash');
  if (el) { el.value = autoCash; runCashFlow(); }
  // localStorageの汚染値を上書き
  const state = window._cfState;
  if (state?._cfKey) {
    try {
      const saved = JSON.parse(localStorage.getItem(state._cfKey) || '{}');
      saved.openCash = autoCash;
      localStorage.setItem(state._cfKey, JSON.stringify(saved));
    } catch {}
  }
}

function runCashFlow() {
  const budget = window.App?.currentBudget;
  const state  = window._cfState;
  if (!budget || !state) return;

  const { allVals, deprArr, monthLabels, actualCols } = state;

  const openCash  = parseFloat(document.getElementById('cf_open_cash')?.value  || 0);
  const loanRepay = parseFloat(document.getElementById('cf_loan_repay')?.value || 0);
  const newLoan   = parseFloat(document.getElementById('cf_new_loan')?.value   || 0) / 12;
  const invest    = parseFloat(document.getElementById('cf_invest')?.value     || 0) / 12;
  const prevCorp  = parseFloat(document.getElementById('cf_prev_corp')?.value  || 0);
  const tax1Amt   = parseFloat(document.getElementById('cf_tax1_amt')?.value   || 0);
  const tax1Month = parseInt(document.getElementById('cf_tax1_month')?.value   ?? 4);

  // 入力値を保存（window + localStorage）。消費税はパススルーのため保持しない
  Object.assign(state, {
    openCash, loanRepay, newLoan: newLoan*12, invest: invest*12,
    prevCorp, tax1Amt, tax1Month,
  });
  if (state._cfKey) {
    try {
      localStorage.setItem(state._cfKey, JSON.stringify({
        openCash, loanRepay, newLoan: newLoan*12, invest: invest*12,
        prevCorp, tax1Amt, tax1Month,
      }));
    } catch {}
  }
  // 営業利益・減価償却
  const hasDynamic = !!(budget.dynamicAccounts?.length);
  const netArr = hasDynamic
    ? (allVals['calc_net'] || new Array(12).fill(0))
    : calcPL(budget.rows).net_profit;

  let cash = openCash;
  const rows = [];

  // 前期申告納税: 第2月（index 1）※法人税のみ。消費税はパススルー（仮受と仮払が相殺されCF影響ほぼ0のため計上しない）
  const prevTaxTotal = prevCorp;

  for (let m = 0; m < 12; m++) {
    const isActual  = actualCols ? actualCols[m] : false;
    const opCF      = (netArr[m] || 0) + (deprArr[m] || 0);
    const finCF     = newLoan - loanRepay - invest;
    const taxCF     = -(m === 1 ? prevTaxTotal : 0)
                      -(m === tax1Month ? tax1Amt : 0);
    const netCF     = opCF + finCF + taxCF;
    const openM     = cash;
    cash += netCF;
    rows.push({ m, label: monthLabels[m], openM, opCF, finCF, taxCF, netCF, closeM: cash,
                shortage: cash < 0, isActual });
  }

  // テーブル
  const el = document.getElementById('cf_result');
  if (el) {
    el.innerHTML = `
      <div class="table-scroll">
      <table class="result-table">
        <thead>
          <tr>
            <th>月</th><th>区分</th><th>期首残高</th>
            <th>営業CF<br><span style="font-weight:400;font-size:10px">利益＋償却</span></th>
            <th>財務CF<br><span style="font-weight:400;font-size:10px">借入±返済±投資</span></th>
            <th>税金CF</th>
            <th style="font-weight:700">月末残高</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr class="${r.shortage?'shortage-row':''} ${r.isActual?'actual-cf-row':''}">
              <td>${r.label}</td>
              <td style="font-size:10px;color:var(--text-muted)">${r.isActual?'実績':'予算'}</td>
              <td class="num">${Math.round(r.openM/1000).toLocaleString()}</td>
              <td class="num" style="color:${r.opCF>=0?'#059669':'#dc2626'}">${Math.round(r.opCF/1000).toLocaleString()}</td>
              <td class="num" style="color:${r.finCF>=0?'#0284c7':'#dc2626'}">${Math.round(r.finCF/1000).toLocaleString()}</td>
              <td class="num" style="color:${r.taxCF<0?'#dc2626':'inherit'}">${r.taxCF!==0?Math.round(r.taxCF/1000).toLocaleString():'–'}</td>
              <td class="num" style="font-weight:700;color:${r.shortage?'#dc2626':r.closeM<1000000?'#d97706':'#059669'}">
                ${Math.round(r.closeM/1000).toLocaleString()}${r.shortage?' ⚠':''}
              </td>
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr style="font-weight:700;background:var(--emerald-pale)">
            <td colspan="2">通期合計</td>
            <td></td>
            <td class="num">${Math.round(rows.reduce((a,r)=>a+r.opCF,0)/1000).toLocaleString()}</td>
            <td class="num">${Math.round(rows.reduce((a,r)=>a+r.finCF,0)/1000).toLocaleString()}</td>
            <td class="num">${Math.round(rows.reduce((a,r)=>a+r.taxCF,0)/1000).toLocaleString()}</td>
            <td class="num">${Math.round((rows.at(-1)?.closeM ?? 0)/1000).toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
      </div>
      <div class="wf-note">単位：千円　⚠ 資金ショートリスク　🟡 100万円未満</div>`;
  }

  // チャート（destroy/recreateをやめてupdate()に変更 → フォーカス喪失防止）
  if (typeof Chart !== 'undefined') {
    const ctx = document.getElementById('cf_chart');
    if (ctx) {
      const _dark = ['ocean','forest','poker','sakura','sunset','space','midnight']
        .includes(document.documentElement.getAttribute('data-theme') || '');
      const _a    = _dark ? '.8'  : '.5';
      const _line = _dark ? '#94a3b8' : '#1e293b';
      const _grid = _dark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.04)';
      const _tick = _dark ? 'rgba(255,255,255,.5)' : undefined;

      if (ctx._chartInst) {
        const ds = ctx._chartInst.data.datasets;
        ctx._chartInst.data.labels = rows.map(r => r.label);
        ds[0].data = rows.map(r => r.opCF/1000);
        ds[1].data = rows.map(r => r.finCF/1000);
        ds[2].data = rows.map(r => r.taxCF/1000);
        ds[3].data = rows.map(r => r.closeM/1000);
        ds[0].backgroundColor = `rgba(16,185,129,${_a})`;
        ds[1].backgroundColor = `rgba(59,130,246,${_a})`;
        ds[2].backgroundColor = `rgba(239,68,68,${_a})`;
        ds[3].borderColor = _line;
        ds[3].pointBackgroundColor = rows.map(r => r.shortage ? '#ef4444' : _line);
        ctx._chartInst.update('none');
      } else {
        ctx._chartInst = new Chart(ctx, {
          data: {
            labels: rows.map(r => r.label),
            datasets: [
              { type:'bar', label:'営業CF', data: rows.map(r=>r.opCF/1000),  backgroundColor:`rgba(16,185,129,${_a})`, stack:'cf' },
              { type:'bar', label:'財務CF', data: rows.map(r=>r.finCF/1000), backgroundColor:`rgba(59,130,246,${_a})`, stack:'cf' },
              { type:'bar', label:'税金CF', data: rows.map(r=>r.taxCF/1000), backgroundColor:`rgba(239,68,68,${_a})`,  stack:'cf' },
              { type:'line',label:'月末現預金', data: rows.map(r=>r.closeM/1000),
                borderColor:_line, borderWidth:2, pointBackgroundColor: rows.map(r=>r.shortage?'#ef4444':_line),
                fill:false, yAxisID:'y2', tension:.3 },
            ]
          },
          options: {
            responsive:true,
            plugins:{
              legend:{ position:'bottom', labels:{ color: _dark ? '#e2e8f0' : undefined } },
              title:{ display:true, text:'月次CF内訳と現預金残高（千円）', color: _dark ? '#e2e8f0' : undefined }
            },
            scales:{
              y:  { stacked:true, grid:{ color:_grid }, ticks:{ color:_tick } },
              y2: { position:'right', grid:{ display:false }, ticks:{ color:_tick }, title:{ display:true, text:'残高（千円）', color:_tick } }
            }
          }
        });
      }
    }
  }
}
