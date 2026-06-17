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
          <button class="btn btn-primary" onclick="runNextYearSim()">予測実行</button>
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

  const rows = budget.rows;
  const getRate = (id) => (parseFloat(document.getElementById(`ny_${id}`)?.value || 100)) / 100;
  const annSum = (id) => (rows[id] || new Array(12).fill(0)).reduce((a,b)=>a+b,0);

  // 全入力科目に増減率を適用
  const newRows = {};
  Object.keys(rows).forEach(id => {
    const rate = getRate(id);
    newRows[id] = (rows[id] || new Array(12).fill(0)).map(v => Math.round(v * rate));
  });

  const pl = calcPL(newRows);
  const PLItems = [
    { label: '売上高',           vals: pl.sales },
    { label: '売上原価',         vals: pl.cogs },
    { label: '売上総利益',       vals: pl.gross_profit, bold: true },
    { label: '販売費及び一般管理費', vals: pl.sga },
    { label: '営業利益',         vals: pl.op_profit, bold: true },
    { label: '経常利益',         vals: pl.ord_profit, bold: true },
    { label: '税引前当期純利益', vals: pl.pretax_profit, bold: true },
    { label: '当期純利益',       vals: pl.net_profit, bold: true },
  ];

  const el = document.getElementById('ny_result');
  if (!el) return;

  el.innerHTML = `
    <h3>翌年度PL予測</h3>
    <div class="table-scroll">
    <table class="result-table ny-table">
      <thead>
        <tr>
          <th class="acc-col">科目</th>
          ${Array.from({length:12},(_,i)=>`<th>${i+1}月</th>`).join('')}
          <th>合計</th>
        </tr>
      </thead>
      <tbody>
        ${PLItems.map(item => {
          const total = item.vals.reduce((a,b)=>a+b,0);
          return `<tr class="${item.bold?'bold-row':''}">
            <td>${item.label}</td>
            ${item.vals.map(v=>`<td class="num">${fmtK(v)}</td>`).join('')}
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
        <button class="btn btn-primary" onclick="runFiveYearSim()">5か年計画実行</button>
      </div>
      <div id="fy_result"></div>
    </div>`;
}

function runFiveYearSim() {
  const budget = window.App?.currentBudget;
  const basePL = budget ? calcPL(budget.rows) : null;
  const baseBS = budget ? calcBS(budget.rows) : null;

  const getRate = (id, y) => parseFloat(document.getElementById(`${id}_${y}`)?.value || 100) / 100;
  const getVal  = (id, y) => parseFloat(document.getElementById(`${id}_${y}`)?.value || 0) * 10000;

  const annSum = (arr) => arr ? arr.reduce((a,b)=>a+b,0) : 0;

  // ベースライン（現在の予算）
  let curSales    = basePL ? annSum(basePL.sales)       : 0;
  let curCogs     = basePL ? annSum(basePL.cogs)        : 0;
  let curSalary   = basePL ? annSum(basePL.sga_salary)  : 0;
  let curRent     = basePL ? annSum(budget.rows.sga_rent||[]) : 0;
  let curOther    = basePL ? annSum(basePL.sga) - annSum(basePL.sga_salary) - annSum(budget.rows.sga_rent||[]) : 0;
  let curCash     = baseBS ? (baseBS.current_assets[11]||0) : 0;
  let curLoan     = baseBS ? ((baseBS.fixed_liab[11]||0)+(budget.rows.short_loan?.[11]||0)) : 0;

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
  container.innerHTML = `
    <div class="sim-panel">
      <h2 class="section-title">キャッシュフロー予測</h2>
      <div class="sim-grid">
        <div class="sim-inputs card">
          <h3>追加入力</h3>
          <div class="form-group"><label>月次借入返済額（円）</label>
            <input type="number" id="cf_loan_repay" value="0" step="10000" class="form-input"></div>
          <div class="form-group"><label>設備投資（年間・円）</label>
            <input type="number" id="cf_invest" value="0" step="100000" class="form-input"></div>
          <div class="form-group"><label>新規借入（年間・円）</label>
            <input type="number" id="cf_new_loan" value="0" step="100000" class="form-input"></div>
          <div class="form-group"><label>期首現預金残高（円）</label>
            <input type="number" id="cf_open_cash" value="5000000" step="100000" class="form-input"></div>
          <button class="btn btn-primary" onclick="runCashFlow()">予測実行</button>
        </div>
        <div id="cf_result" class="sim-results card">
          <h3>CF予測</h3><p class="hint">計算ボタンを押してください</p>
        </div>
      </div>
      <div class="card" style="margin-top:1rem"><canvas id="cf_chart" height="100"></canvas></div>
    </div>`;
}

function runCashFlow() {
  const budget = window.App?.currentBudget;
  if (!budget) return;

  const loanRepay  = parseFloat(document.getElementById('cf_loan_repay')?.value || 0);
  const invest     = parseFloat(document.getElementById('cf_invest')?.value     || 0) / 12;
  const newLoan    = parseFloat(document.getElementById('cf_new_loan')?.value   || 0) / 12;
  let cash         = parseFloat(document.getElementById('cf_open_cash')?.value  || 0);

  const pl = calcPL(budget.rows);
  const depr = budget.rows.sga_depr || new Array(12).fill(0);

  const months = [];
  for (let m = 0; m < 12; m++) {
    const opCF   = pl.net_profit[m] + depr[m];
    const invCF  = -invest;
    const finCF  = -loanRepay + newLoan;
    const netCF  = opCF + invCF + finCF;
    cash += netCF;
    months.push({ m: m+1, opCF, invCF, finCF, netCF, cash, shortage: cash < 0 });
  }

  const el = document.getElementById('cf_result');
  if (!el) return;
  el.innerHTML = `
    <h3>月次CF推移</h3>
    <div class="table-scroll">
    <table class="result-table">
      <thead><tr><th>月</th><th>営業CF</th><th>投資CF</th><th>財務CF</th><th>月末現預金</th></tr></thead>
      <tbody>
        ${months.map(r=>`
          <tr class="${r.shortage?'shortage-row':''}">
            <td>${r.m}月</td>
            <td class="num">${fmtK(r.opCF)}</td>
            <td class="num">${fmtK(r.invCF)}</td>
            <td class="num">${fmtK(r.finCF)}</td>
            <td class="num ${r.shortage?'shortage-val':''}">${fmtK(r.cash)}${r.shortage?' ⚠':''}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    </div>
    <div class="wf-note">単位：千円　⚠ 資金ショートリスク</div>`;

  if (typeof Chart !== 'undefined') {
    const ctx = document.getElementById('cf_chart');
    if (ctx?._chartInstance) ctx._chartInstance.destroy();
    if (ctx) ctx._chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: months.map(r=>`${r.m}月`),
        datasets: [
          { label:'月末現預金（千円）', data: months.map(r=>r.cash/1000),
            borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,0.1)', fill:true }
        ]
      },
      options: {
        responsive: true,
        plugins: { title:{ display:true, text:'月末現預金残高推移' } },
        scales: { y:{ beginAtZero:false } }
      }
    });
  }
}
