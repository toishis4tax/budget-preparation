// ===== 借入シミュレーター =====

function renderLoanSim(container) {
  const budget  = window.App?.currentBudget;
  const company = window.App?.currentCompany;

  container.innerHTML = `
    <div class="sim-panel">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:1rem">
        <h2 class="section-title" style="margin-bottom:0">借入シミュレーター</h2>
        <button class="btn btn-sm btn-outline" onclick="showPage('home')" style="margin-left:auto">← ホームに戻る</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">

        <!-- 入力パネル -->
        <div class="card" style="padding:1.25rem">
          <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:16px">借入条件</div>

          <div class="loan-field">
            <label>借入額</label>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="range" id="ls_amount" min="100" max="30000" step="100" value="5000"
                oninput="_lsUpdate()" style="flex:1">
              <input type="number" id="ls_amount_n" min="100" max="300000" step="100" value="5000"
                oninput="document.getElementById('ls_amount').value=Math.min(this.value,30000);_lsUpdate()"
                style="width:100px;text-align:right">
              <span style="font-size:12px;color:var(--text-muted);white-space:nowrap">万円</span>
            </div>
          </div>

          <div class="loan-field">
            <label>金利（年率）</label>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="range" id="ls_rate" min="0.1" max="10" step="0.1" value="1.5"
                oninput="_lsUpdate();" style="flex:1">
              <input type="number" id="ls_rate_n" min="0.1" max="30" step="0.1" value="1.5"
                oninput="document.getElementById('ls_rate').value=Math.min(this.value,10);_lsUpdate()"
                style="width:70px;text-align:right">
              <span style="font-size:12px;color:var(--text-muted);white-space:nowrap">%</span>
            </div>
          </div>

          <div class="loan-field">
            <label>返済期間</label>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="range" id="ls_term" min="1" max="30" step="1" value="7"
                oninput="_lsUpdate()" style="flex:1">
              <input type="number" id="ls_term_n" min="1" max="50" step="1" value="7"
                oninput="document.getElementById('ls_term').value=Math.min(this.value,30);_lsUpdate()"
                style="width:70px;text-align:right">
              <span style="font-size:12px;color:var(--text-muted);white-space:nowrap">年</span>
            </div>
          </div>

          <div class="loan-field" style="margin-bottom:0">
            <label>返済方式</label>
            <div style="display:flex;gap:12px;margin-top:4px">
              <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer">
                <input type="radio" name="ls_method" value="equal_payment" checked oninput="_lsUpdate()"> 元利均等
              </label>
              <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer">
                <input type="radio" name="ls_method" value="equal_principal" oninput="_lsUpdate()"> 元金均等
              </label>
            </div>
          </div>
        </div>

        <!-- 結果パネル -->
        <div id="ls_result"></div>
      </div>

      <!-- 返済スケジュール -->
      <div class="card" style="margin-top:16px;padding:1.25rem">
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">返済スケジュール</div>
        <div style="overflow-x:auto">
          <table class="result-table" id="ls_table" style="width:100%;min-width:480px"></table>
        </div>
      </div>
    </div>

    <style>
      .loan-field { margin-bottom:18px }
      .loan-field > label { display:block;font-size:12px;color:var(--text-muted);margin-bottom:6px;font-weight:500 }
    </style>`;

  _lsUpdate();
}

function _lsVal(id) {
  const n = parseFloat(document.getElementById(id + '_n')?.value || document.getElementById(id)?.value);
  return isNaN(n) ? 0 : n;
}

function _lsUpdate() {
  const amount  = _lsVal('ls_amount') * 10000;  // 万円→円
  const rateAnn = _lsVal('ls_rate') / 100;
  const termYr  = _lsVal('ls_term');
  const method  = document.querySelector('input[name="ls_method"]:checked')?.value || 'equal_payment';

  // スライダーと数値入力の同期
  const syncRange = (rangeId, numId) => {
    const r = document.getElementById(rangeId);
    const n = document.getElementById(numId);
    if (r && n) r.value = Math.min(parseFloat(n.value) || 0, parseFloat(r.max));
  };
  syncRange('ls_amount', 'ls_amount_n');
  syncRange('ls_rate',   'ls_rate_n');
  syncRange('ls_term',   'ls_term_n');

  if (amount <= 0 || rateAnn <= 0 || termYr <= 0) return;

  const r = rateAnn / 12;  // 月次金利
  const n = Math.round(termYr * 12);  // 返済回数

  let schedule = [];

  if (method === 'equal_payment') {
    // 元利均等：月次返済額 = P*r*(1+r)^n / ((1+r)^n-1)
    const monthlyPmt = r === 0 ? amount / n : amount * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
    let balance = amount;
    for (let i = 1; i <= n; i++) {
      const interest = balance * r;
      const principal = monthlyPmt - interest;
      balance = Math.max(0, balance - principal);
      schedule.push({ month: i, payment: monthlyPmt, principal, interest, balance });
    }
  } else {
    // 元金均等：毎月の元金 = P/n、利息は残高×r
    const monthlyPrincipal = amount / n;
    let balance = amount;
    for (let i = 1; i <= n; i++) {
      const interest = balance * r;
      const payment  = monthlyPrincipal + interest;
      balance = Math.max(0, balance - monthlyPrincipal);
      schedule.push({ month: i, payment, principal: monthlyPrincipal, interest, balance });
    }
  }

  const totalPayment  = schedule.reduce((s, row) => s + row.payment, 0);
  const totalInterest = schedule.reduce((s, row) => s + row.interest, 0);
  const firstPayment  = schedule[0]?.payment || 0;
  const lastPayment   = schedule[schedule.length - 1]?.payment || 0;

  // 現在の予算との比較
  const budget = window.App?.currentBudget;
  let budgetImpact = '';
  if (budget) {
    const av = budget.dynamicAccounts?.length
      ? calcAllValuesDynamic(budget)
      : calcAllValues(budget.rows || {});
    const annualSales = (av['sec_revenue'] || av['calc_sales'] || []).slice(0, 12).reduce((s, v) => s + (v || 0), 0);
    const annualOrd   = (av['calc_ord'] || []).slice(0, 12).reduce((s, v) => s + (v || 0), 0);
    if (annualSales > 0) {
      const annualDebt  = firstPayment * 12;
      const newOrd      = annualOrd - totalInterest / (termYr);
      budgetImpact = `
        <div style="margin-top:10px;padding:10px 12px;background:var(--bg-warning);border-radius:8px;border:1px solid var(--border-warning)">
          <div style="font-size:11px;font-weight:700;color:var(--text-warning);margin-bottom:6px">現在の予算への影響（年間）</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px">
            <div><span style="color:var(--text-muted)">年間返済額</span><br><strong style="color:var(--text);font-size:13px">${_lsFmt(annualDebt)}</strong></div>
            <div><span style="color:var(--text-muted)">売上比</span><br><strong style="color:var(--text);font-size:13px">${(annualDebt / annualSales * 100).toFixed(1)}%</strong></div>
          </div>
        </div>`;
    }
  }

  // 結果サマリー
  const isEqualPmt = method === 'equal_payment';
  const resultEl = document.getElementById('ls_result');
  if (resultEl) {
    resultEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="card" style="padding:1rem;text-align:center">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">月次返済額${isEqualPmt ? '' : '（初月）'}</div>
          <div style="font-size:22px;font-weight:700;color:var(--primary)">${_lsFmtMan(firstPayment)}</div>
          ${!isEqualPmt ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">最終月：${_lsFmtMan(lastPayment)}</div>` : ''}
        </div>
        <div class="card" style="padding:1rem;text-align:center">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">総利息</div>
          <div style="font-size:22px;font-weight:700;color:#f59e0b">${_lsFmtMan(totalInterest)}</div>
        </div>
        <div class="card" style="padding:1rem;text-align:center">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">総返済額</div>
          <div style="font-size:18px;font-weight:700;color:var(--text)">${_lsFmtMan(totalPayment)}</div>
        </div>
        <div class="card" style="padding:1rem;text-align:center">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">元本に対する利息比率</div>
          <div style="font-size:18px;font-weight:700;color:var(--text)">${(totalInterest / amount * 100).toFixed(1)}%</div>
        </div>
      </div>
      ${budgetImpact}`;
  }

  // 返済スケジュール表（年単位でまとめ）
  const tableEl = document.getElementById('ls_table');
  if (!tableEl) return;

  // 年次サマリーを作成
  let yearRows = '';
  for (let y = 1; y <= termYr; y++) {
    const startIdx = (y - 1) * 12;
    const endIdx   = Math.min(y * 12, schedule.length);
    const yearData = schedule.slice(startIdx, endIdx);
    const totalPmt = yearData.reduce((s, r) => s + r.payment, 0);
    const totalPrin = yearData.reduce((s, r) => s + r.principal, 0);
    const totalInt  = yearData.reduce((s, r) => s + r.interest, 0);
    const endBalance = yearData[yearData.length - 1]?.balance || 0;
    yearRows += `<tr>
      <td style="text-align:center">${y}年目</td>
      <td class="num">${_lsFmtK(totalPmt)}</td>
      <td class="num">${_lsFmtK(totalPrin)}</td>
      <td class="num" style="color:#f59e0b">${_lsFmtK(totalInt)}</td>
      <td class="num">${_lsFmtK(endBalance)}</td>
    </tr>`;
  }

  tableEl.innerHTML = `
    <thead>
      <tr>
        <th style="text-align:center;min-width:60px">年</th>
        <th>年間返済額（千円）</th>
        <th>元金（千円）</th>
        <th>利息（千円）</th>
        <th>残高（千円）</th>
      </tr>
    </thead>
    <tbody>${yearRows}</tbody>
    <tfoot>
      <tr style="font-weight:700;background:var(--surface-1)">
        <td style="text-align:center">合計</td>
        <td class="num">${_lsFmtK(totalPayment)}</td>
        <td class="num">${_lsFmtK(amount)}</td>
        <td class="num" style="color:#f59e0b">${_lsFmtK(totalInterest)}</td>
        <td class="num">—</td>
      </tr>
    </tfoot>`;
}

const _lsFmt    = v => Math.round(v).toLocaleString('ja-JP') + '円';
const _lsFmtMan = v => Math.round(v / 10000).toLocaleString('ja-JP') + '万円';
const _lsFmtK   = v => Math.round(v / 1000).toLocaleString('ja-JP');
