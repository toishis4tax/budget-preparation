// ===== 資金繰り予定表 =====

function renderCashPlan(container) {
  const budget  = window.App?.currentBudget;
  const company = window.App?.currentCompany;
  const curYear = window.App?.currentYear || new Date().getFullYear();

  if (!budget) {
    container.innerHTML = '<div class="no-data">予算データがありません。まず月次予算を入力してください。</div>';
    return;
  }

  const monthLabels = getMonthLabels(budget.startMonth || 4);

  // 期首現預金を前期末BSから取得
  let autoCash = 0, cashSource = '手動入力';
  const budgetPrev = (typeof getBudget === 'function') ? getBudget(company?.id, curYear - 1) : null;
  const _sumCashAt = (b, idx) => {
    if (!b?.dynamicAccounts) return 0;
    const av = calcAllValuesDynamic(b);
    const CASH_RE = /現金|預金|信金|銀行|信用組合/;
    const matching = b.dynamicAccounts.filter(a =>
      a.section?.startsWith('bs') && a.type !== 'section' && CASH_RE.test((a.name||'').replace(/\s/g,''))
    );
    const ids = new Set(matching.map(a => a.id));
    return matching.filter(a => !ids.has(a.parentId)).reduce((s,a) => s + ((av[a.id]||[])[idx]||0), 0);
  };
  const prevCash = budgetPrev?.dynamicAccounts ? _sumCashAt(budgetPrev, 11) : 0;
  if (prevCash) { autoCash = prevCash; cashSource = '前期末BS（自動取得）'; }
  else {
    const thisCash = budget.dynamicAccounts ? _sumCashAt(budget, 0) : 0;
    if (thisCash) { autoCash = thisCash; cashSource = '当期首BS（自動取得）'; }
  }

  // 保存済み設定を復元
  const _key = `cashplan_${company?.id||''}_${budget?.year||''}`;
  const saved = (() => { try { return JSON.parse(localStorage.getItem(_key)||'{}'); } catch { return {}; } })();

  container.innerHTML = `
    <div class="sim-panel">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:1rem">
        <h2 class="section-title" style="margin-bottom:0">資金繰り予定表</h2>
        <button class="btn btn-sm btn-outline" onclick="showPage('home')" style="margin-left:auto">← ホームに戻る</button>
      </div>

      <!-- 設定カード -->
      <div class="card" style="padding:1.25rem;margin-bottom:1rem">
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:14px">設定</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px">

          <div>
            <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:5px;font-weight:500">
              期首現預金残高 <span style="font-size:10px;opacity:.7">(${cashSource})</span>
            </label>
            <div style="display:flex;gap:5px;align-items:center">
              <input type="number" id="cp_open" value="${Math.round((saved.open ?? autoCash)/10000)}"
                step="10" oninput="_runCashPlan()" style="flex:1;text-align:right">
              <span style="font-size:12px;color:var(--text-muted)">万円</span>
            </div>
          </div>

          <div>
            <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:5px;font-weight:500">売上回収サイト</label>
            <select id="cp_site_sales" oninput="_runCashPlan()" style="width:100%">
              <option value="0" ${(saved.siteSales??1)===0?'selected':''}>当月回収</option>
              <option value="1" ${(saved.siteSales??1)===1?'selected':''}>翌月回収</option>
              <option value="2" ${(saved.siteSales??1)===2?'selected':''}>翌々月回収</option>
            </select>
          </div>

          <div>
            <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:5px;font-weight:500">仕入支払サイト</label>
            <select id="cp_site_cogs" oninput="_runCashPlan()" style="width:100%">
              <option value="0" ${(saved.siteCogs??1)===0?'selected':''}>当月払い</option>
              <option value="1" ${(saved.siteCogs??1)===1?'selected':''}>翌月払い</option>
              <option value="2" ${(saved.siteCogs??1)===2?'selected':''}>翌々月払い</option>
            </select>
          </div>

          <div>
            <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:5px;font-weight:500">月次借入返済額</label>
            <div style="display:flex;gap:5px;align-items:center">
              <input type="number" id="cp_repay" value="${Math.round((saved.repay??0)/10000)}"
                step="5" min="0" oninput="_runCashPlan()" style="flex:1;text-align:right">
              <span style="font-size:12px;color:var(--text-muted)">万円/月</span>
            </div>
          </div>

          <div>
            <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:5px;font-weight:500">税金支払額（年間）</label>
            <div style="display:flex;gap:5px;align-items:center">
              <input type="number" id="cp_tax" value="${Math.round((saved.tax??0)/10000)}"
                step="10" min="0" oninput="_runCashPlan()" style="flex:1;text-align:right">
              <span style="font-size:12px;color:var(--text-muted)">万円</span>
            </div>
          </div>

          <div>
            <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:5px;font-weight:500">税金支払月</label>
            <select id="cp_tax_month" oninput="_runCashPlan()" style="width:100%">
              ${monthLabels.map((m,i)=>`<option value="${i}" ${(saved.taxMonth??2)===i?'selected':''}>${m}</option>`).join('')}
            </select>
          </div>

        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:10px;line-height:1.6">
          ※ 経費（人件費・家賃等）は当月払い前提。前期末売掛金回収分は含みません。消費税は計上外（仮受・仮払の相殺）。
        </div>
      </div>

      <!-- テーブル -->
      <div class="card" style="padding:1.25rem">
        <div style="overflow-x:auto">
          <table id="cp_table" style="width:100%;min-width:900px;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums"></table>
        </div>
      </div>
    </div>`;

  window._cpMeta = { budget, company, monthLabels, _key };
  _runCashPlan();
}

function _runCashPlan() {
  const meta = window._cpMeta;
  if (!meta) return;
  const { budget, monthLabels, _key } = meta;

  const openMan   = parseFloat(document.getElementById('cp_open')?.value  || 0);
  const siteSales = parseInt(document.getElementById('cp_site_sales')?.value ?? 1);
  const siteCogs  = parseInt(document.getElementById('cp_site_cogs')?.value  ?? 1);
  const repayMan  = parseFloat(document.getElementById('cp_repay')?.value  || 0);
  const taxMan    = parseFloat(document.getElementById('cp_tax')?.value    || 0);
  const taxMonth  = parseInt(document.getElementById('cp_tax_month')?.value ?? 2);

  const open   = openMan  * 10_000;
  const repay  = repayMan * 10_000;
  const taxAmt = taxMan   * 10_000;

  // 保存
  try { localStorage.setItem(_key, JSON.stringify({ open, siteSales, siteCogs, repay, tax: taxAmt, taxMonth })); } catch {}

  // 予算データ取得
  const av = budget.dynamicAccounts?.length
    ? calcAllValuesDynamic(budget)
    : calcAllValues(budget.rows || {});

  const _get12 = id => (av[id] || []).slice(0, 12).map(v => v || 0);

  // 売上・原価・販管費の各月配列
  const salesArr = _get12('sec_revenue').map(v => Math.abs(v));
  const cogsArr  = _get12('sec_cogs').map(v => Math.abs(v));
  const sgaArr   = _get12('sec_sga').map(v => Math.abs(v));

  // 回収サイト・支払サイト適用（前にずらす = 後で受領）
  const _shift = (arr, n) => {
    const out = new Array(12).fill(0);
    for (let i = 0; i < 12; i++) {
      if (i + n < 12) out[i + n] += arr[i];
    }
    return out;
  };

  const cashIn   = _shift(salesArr, siteSales);  // 売上回収
  const cashCogs = _shift(cogsArr,  siteCogs);   // 仕入支払
  // SGAは当月払い
  const cashSga  = sgaArr.slice();

  // 月次計算
  const rows = [];
  let balance = open;
  for (let i = 0; i < 12; i++) {
    const inTotal  = cashIn[i];
    const taxOut   = i === taxMonth ? taxAmt : 0;
    const outTotal = cashCogs[i] + cashSga[i] + repay + taxOut;
    const net      = inTotal - outTotal;
    const openBal  = balance;
    balance        = balance + net;
    rows.push({ i, openBal, inTotal, cashIn: cashIn[i], cashCogs: cashCogs[i], cashSga: cashSga[i], repay, taxOut, outTotal, net, closeBal: balance });
  }

  // サマリー計算
  const totalIn  = rows.reduce((s,r) => s + r.inTotal, 0);
  const totalOut = rows.reduce((s,r) => s + r.outTotal, 0);
  const minBal   = Math.min(...rows.map(r => r.closeBal));

  const _f  = v => Math.round(v / 1000).toLocaleString();
  const _fc = (v, danger=false) => {
    const cls = v < 0 ? 'style="color:#ef4444;font-weight:700"' : danger && v < 3_000_000 ? 'style="color:#f59e0b;font-weight:600"' : '';
    return `<td class="num" ${cls}>${_f(v)}</td>`;
  };

  const headerCols = monthLabels.map(m => `<th style="min-width:68px;text-align:right;padding:6px 8px">${m}</th>`).join('') +
    `<th style="min-width:80px;text-align:right;padding:6px 8px">合計</th>`;

  const dataRow = (label, arr, total, opts = {}) => {
    const { bold, bg, colorFn } = opts;
    const style = `style="background:${bg||'transparent'};${bold?'font-weight:700':''};"`;
    const cells = arr.map((v,i) => colorFn ? colorFn(v,i) : `<td class="num" style="padding:4px 8px">${_f(v)}</td>`).join('');
    const totalCell = colorFn ? colorFn(total, -1) : `<td class="num" style="padding:4px 8px">${_f(total)}</td>`;
    return `<tr ${style}><td style="padding:4px 8px;white-space:nowrap;color:var(--text-muted)">${label}</td>${cells}${totalCell}</tr>`;
  };

  const tableEl = document.getElementById('cp_table');
  if (!tableEl) return;

  const openRow  = [open, ...rows.map(r => r.closeBal)].slice(0, 12);
  const closeRow = rows.map(r => r.closeBal);
  const balTotal = closeRow[11]; // 期末残高
  const netArr   = rows.map(r => r.net);

  tableEl.innerHTML = `
    <thead>
      <tr style="background:var(--surface-1)">
        <th style="text-align:left;padding:6px 8px;min-width:130px">項目</th>
        ${headerCols}
      </tr>
    </thead>
    <tbody>
      <!-- 月初残高 -->
      <tr style="background:var(--bg-accent)">
        <td style="padding:5px 8px;font-weight:700;color:var(--text-accent)">月初残高</td>
        ${rows.map((r,i) => `<td class="num" style="padding:4px 8px;font-weight:700;color:var(--text-accent)">${_f(r.openBal)}</td>`).join('')}
        <td class="num" style="padding:4px 8px;font-weight:700;color:var(--text-accent)">${_f(open)}</td>
      </tr>

      <!-- 収入の部 -->
      <tr style="background:var(--surface-1)">
        <td colspan="${14}" style="padding:5px 8px;font-weight:700;font-size:11px;color:#10b981;letter-spacing:.04em">▼ 収入の部（千円）</td>
      </tr>
      ${dataRow('　売上回収', rows.map(r=>r.cashIn), totalIn)}

      <!-- 収入合計 -->
      <tr style="background:#e8faf4">
        <td style="padding:5px 8px;font-weight:700;color:#065f46">収入合計</td>
        ${rows.map(r=>`<td class="num" style="padding:4px 8px;font-weight:700;color:#065f46">${_f(r.inTotal)}</td>`).join('')}
        <td class="num" style="padding:4px 8px;font-weight:700;color:#065f46">${_f(totalIn)}</td>
      </tr>

      <!-- 支出の部 -->
      <tr style="background:var(--surface-1)">
        <td colspan="${14}" style="padding:5px 8px;font-weight:700;font-size:11px;color:#ef4444;letter-spacing:.04em">▼ 支出の部（千円）</td>
      </tr>
      ${dataRow('　仕入支払', rows.map(r=>r.cashCogs), rows.reduce((s,r)=>s+r.cashCogs,0))}
      ${dataRow('　経費支払', rows.map(r=>r.cashSga),  rows.reduce((s,r)=>s+r.cashSga,0))}
      ${dataRow('　借入返済', rows.map(_=>repay),      repay*12)}
      ${dataRow('　税金支払', rows.map(r=>r.taxOut),   taxAmt)}

      <!-- 支出合計 -->
      <tr style="background:#fef2f2">
        <td style="padding:5px 8px;font-weight:700;color:#991b1b">支出合計</td>
        ${rows.map(r=>`<td class="num" style="padding:4px 8px;font-weight:700;color:#991b1b">${_f(r.outTotal)}</td>`).join('')}
        <td class="num" style="padding:4px 8px;font-weight:700;color:#991b1b">${_f(totalOut)}</td>
      </tr>

      <!-- 当月収支 -->
      <tr style="border-top:2px solid var(--border)">
        <td style="padding:5px 8px;font-weight:700;color:var(--text)">当月収支</td>
        ${rows.map(r=>{
          const c = r.net >= 0 ? '#065f46' : '#991b1b';
          return `<td class="num" style="padding:4px 8px;font-weight:700;color:${c}">${_f(r.net)}</td>`;
        }).join('')}
        <td class="num" style="padding:4px 8px;font-weight:700;color:${totalIn-totalOut>=0?'#065f46':'#991b1b'}">${_f(totalIn-totalOut)}</td>
      </tr>

      <!-- 月末残高 -->
      <tr style="background:var(--bg-accent);border-top:2px solid var(--border-accent)">
        <td style="padding:5px 8px;font-weight:700;color:var(--text-accent)">月末残高</td>
        ${rows.map(r=>{
          const neg = r.closeBal < 0;
          const warn = !neg && r.closeBal < 3_000_000;
          const c = neg ? '#ef4444' : warn ? '#d97706' : 'var(--text-accent)';
          const bg = neg ? '#fee2e2' : warn ? '#fffbeb' : 'transparent';
          return `<td class="num" style="padding:4px 8px;font-weight:700;color:${c};background:${bg}">${_f(r.closeBal)}</td>`;
        }).join('')}
        <td class="num" style="padding:4px 8px;font-weight:700;color:${balTotal<0?'#ef4444':'var(--text-accent)'}">${_f(balTotal)}</td>
      </tr>
    </tbody>
    <tfoot>
      <tr>
        <td colspan="${14}" style="padding:10px 8px;font-size:11px;color:var(--text-muted)">
          最低月末残高：<strong style="color:${minBal<0?'#ef4444':minBal<3_000_000?'#d97706':'#065f46'}">${_f(minBal)}千円</strong>
          　（${minBal < 0 ? '⚠️ 資金ショートが発生します' : minBal < 3_000_000 ? '⚠️ 残高が300万円を下回る月があります' : '✓ 全月で黒字を維持できています'}）
        </td>
      </tr>
    </tfoot>`;
}
