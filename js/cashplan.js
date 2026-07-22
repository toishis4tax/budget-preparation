// ===== 資金繰り予定表 =====

// 指定budgetの現預金残高（idx月時点）を集計（画面・スマートホーム診断の共通ヘルパー）
function _sumCashAt(b, idx) {
  if (!b?.dynamicAccounts?.length) return 0;
  const av2 = calcAllValuesDynamic(b);
  const all = b.dynamicAccounts.filter(a =>
    a.section === 'bs_asset' &&
    a.type !== 'section' &&
    !a.cashGroup &&
    CASH_ACCOUNT_RE.test((a.name || '').replace(/\s/g, ''))
  );
  const ids = new Set(all.map(a => a.id));
  const leaf = all.filter(a => !ids.has(a.parentId));
  return leaf.reduce((s, a) => {
    const v = (av2[a.id] || [])[idx];
    return s + (_cpSafeN(v));
  }, 0);
}

// 期首現預金の自動取得（前期末BS優先→当期首BS）。renderCashPlanと診断で共通
function cpAutoOpeningCash(company, budget, curYear) {
  const budgetPrev = (typeof getBudget === 'function') ? getBudget(company?.id, curYear - 1) : null;
  if (budgetPrev?.dynamicAccounts?.length) {
    const v = _sumCashAt(budgetPrev, 11);
    if (v) return { value: v, source: '前期末BS残高（自動取得）' };
  }
  if (budget?.dynamicAccounts?.length) {
    const v = _sumCashAt(budget, 0);
    if (v) return { value: v, source: '当期首BS残高（自動取得）' };
  }
  return { value: 0, source: '未設定（手動入力してください）' };
}

function renderCashPlan(container) {
  const budget  = window.App?.currentBudget;
  const company = window.App?.currentCompany;
  const curYear = window.App?.currentYear || new Date().getFullYear();

  if (!budget) {
    container.innerHTML = '<div class="no-data">予算データがありません。まず月次予算を入力してください。</div>';
    return;
  }

  const monthLabels = getMonthLabels(budget.startMonth || 4);

  // 期首現預金を前期末BSから取得（共通ヘルパー）
  const _auto = cpAutoOpeningCash(company, budget, curYear);
  const autoCash = _auto.value, cashSource = _auto.source;

  // 保存済み設定を復元
  const _key = `cashplan_${company?.id || ''}_${budget?.year ?? curYear}`;
  const saved = (() => { try { return JSON.parse(localStorage.getItem(_key) || '{}'); } catch { return {}; } })();

  const defOpen      = saved.open      ?? autoCash;
  const defSiteSales = saved.siteSales ?? 1;
  const defSiteCogs  = saved.siteCogs  ?? 1;
  const defRepay     = saved.repay     ?? 0;
  const defTax       = saved.tax       ?? 0;
  const defTaxMonth  = saved.taxMonth  ?? 2;

  container.innerHTML = `
    <div class="sim-panel">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.25rem">
        <h2 class="section-title" style="margin-bottom:0">資金繰り予定表</h2>
        <button class="btn btn-sm btn-outline" onclick="showPage('home')" style="margin-left:auto">← ホームに戻る</button>
      </div>

      <!-- 設定カード -->
      <div style="background:var(--surface-2);border:0.5px solid var(--border);border-radius:12px;padding:1.25rem;margin-bottom:1.25rem">
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:14px">設定</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:16px">

          <div>
            <label style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:5px;font-weight:600">期首現預金残高</label>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="number" id="cp_open" value="${Math.round(defOpen/10000)}" step="10" min="0" oninput="_runCashPlan()" style="flex:1;text-align:right">
              <span style="font-size:12px;color:var(--text-muted);white-space:nowrap">万円</span>
            </div>
            <div style="font-size:10px;color:var(--text-accent);margin-top:3px">${cashSource}</div>
          </div>

          <div>
            <label style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:5px;font-weight:600">売上回収サイト</label>
            <select id="cp_site_sales" oninput="_runCashPlan()" style="width:100%">
              <option value="0" ${defSiteSales===0?'selected':''}>当月回収</option>
              <option value="1" ${defSiteSales===1?'selected':''}>翌月回収</option>
              <option value="2" ${defSiteSales===2?'selected':''}>翌々月回収</option>
            </select>
          </div>

          <div>
            <label style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:5px;font-weight:600">仕入支払サイト</label>
            <select id="cp_site_cogs" oninput="_runCashPlan()" style="width:100%">
              <option value="0" ${defSiteCogs===0?'selected':''}>当月払い</option>
              <option value="1" ${defSiteCogs===1?'selected':''}>翌月払い</option>
              <option value="2" ${defSiteCogs===2?'selected':''}>翌々月払い</option>
            </select>
          </div>

          <div>
            <label style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:5px;font-weight:600">月次借入返済額</label>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="number" id="cp_repay" value="${Math.round(defRepay/10000)}" step="5" min="0" oninput="_runCashPlan()" style="flex:1;text-align:right">
              <span style="font-size:12px;color:var(--text-muted);white-space:nowrap">万円/月</span>
            </div>
          </div>

          <div>
            <label style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:5px;font-weight:600">税金支払額（年間）</label>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="number" id="cp_tax" value="${Math.round(defTax/10000)}" step="10" min="0" oninput="_runCashPlan()" style="flex:1;text-align:right">
              <span style="font-size:12px;color:var(--text-muted);white-space:nowrap">万円</span>
            </div>
          </div>

          <div>
            <label style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:5px;font-weight:600">税金支払月</label>
            <select id="cp_tax_month" oninput="_runCashPlan()" style="width:100%">
              ${monthLabels.map((m,i)=>`<option value="${i}" ${defTaxMonth===i?'selected':''}>${m}</option>`).join('')}
            </select>
          </div>

        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:12px;padding-top:10px;border-top:0.5px solid var(--border)">
          経費（人件費・家賃等）は当月払い前提　/　前期末売掛金の回収は含まず　/　消費税は計上外（仮受・仮払の相殺）
        </div>
      </div>

      <!-- ステータスカード -->
      <div id="cp_status" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:1.25rem"></div>

      <!-- テーブル -->
      <div style="background:var(--surface-2);border:0.5px solid var(--border);border-radius:12px;padding:1.25rem">
        <div style="overflow-x:auto">
          <table id="cp_table" style="width:100%;min-width:900px;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums"></table>
        </div>
      </div>
    </div>`;

  window._cpMeta = { budget, company, monthLabels, _key };
  _runCashPlan();
}

// 安全な数値変換
function _cpSafeN(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return (n == null || isNaN(n) || !isFinite(n)) ? 0 : n;
}

// 千円フォーマット
function _cpFmt(v) {
  const n = _cpSafeN(v);
  return Math.round(n / 1000).toLocaleString('ja-JP');
}

// 資金繰り計算コア（純関数・DOM非依存）
// settings: { open, siteSales, siteCogs, repay, tax, taxMonth }（金額は円単位）
// 画面（_runCashPlan）とスマートホーム診断（calcCompanyDiagnosis）の両方から使う
function calcCashPlanSeries(budget, settings) {
  if (!budget) return null;
  const open      = _cpSafeN(settings?.open);
  const siteSales = _cpSafeN(settings?.siteSales);
  const siteCogs  = _cpSafeN(settings?.siteCogs);
  const repay     = _cpSafeN(settings?.repay);
  const taxAmt    = _cpSafeN(settings?.tax);
  const taxMonth  = _cpSafeN(settings?.taxMonth);

  // 予算データ取得（動的・旧形式両対応）
  const hasDynamic = budget.dynamicAccounts?.length > 0;
  const av = hasDynamic
    ? calcAllValuesDynamic(budget)
    : calcAllValues(budget.rows || {});

  const _get12 = (...ids) => {
    for (const id of ids) {
      const arr = av[id];
      if (Array.isArray(arr) && arr.some(v => v != null && v !== 0)) {
        return arr.slice(0, 12).map(v => _cpSafeN(v));
      }
    }
    return new Array(12).fill(0);
  };

  // 売上・原価・販管費（複数キーでフォールバック）
  const salesArr = _get12('sec_revenue', 'calc_sales', 'rev_total').map(v => Math.abs(v));
  const cogsArr  = _get12('sec_cogs',    'calc_cogs',  'cogs_total').map(v => Math.abs(v));
  const sgaArr   = _get12('sec_sga',     'calc_sga',   'sga_total').map(v => Math.abs(v));

  // 回収・支払サイト適用（月をずらす）
  const _shift = (arr, n) => {
    const out = new Array(12).fill(0);
    for (let i = 0; i < 12; i++) {
      if (i + n < 12) out[i + n] += _cpSafeN(arr[i]);
    }
    return out;
  };

  const cashIn   = _shift(salesArr, siteSales);
  const cashCogs = _shift(cogsArr,  siteCogs);
  const cashSga  = sgaArr.slice();

  // 月次計算
  const rows = [];
  let balance = _cpSafeN(open);
  for (let i = 0; i < 12; i++) {
    const inTotal  = _cpSafeN(cashIn[i]);
    const taxOut   = i === taxMonth ? _cpSafeN(taxAmt) : 0;
    const outTotal = _cpSafeN(cashCogs[i]) + _cpSafeN(cashSga[i]) + _cpSafeN(repay) + taxOut;
    const net      = inTotal - outTotal;
    const openBal  = balance;
    balance        = openBal + net;
    rows.push({ i, openBal, inTotal, cashIn: cashIn[i], cashCogs: cashCogs[i], cashSga: cashSga[i], repay, taxOut, outTotal, net, closeBal: balance });
  }

  const totalIn  = rows.reduce((s,r) => s + r.inTotal, 0);
  const totalOut = rows.reduce((s,r) => s + r.outTotal, 0);
  const minBal   = Math.min(...rows.map(r => r.closeBal));
  const minIdx   = rows.findIndex(r => r.closeBal === minBal);
  const finalBal = rows[11]?.closeBal ?? 0;
  return { rows, totalIn, totalOut, minBal, minIdx, finalBal, open };
}

function _runCashPlan() {
  const meta = window._cpMeta;
  if (!meta) return;
  const { budget, monthLabels, _key } = meta;

  const openMan   = _cpSafeN(document.getElementById('cp_open')?.value);
  const siteSales = parseInt(document.getElementById('cp_site_sales')?.value ?? 1); // selectは"0"（当月）が正当値のため??
  const siteCogs  = parseInt(document.getElementById('cp_site_cogs')?.value  ?? 1);
  const repayMan  = _cpSafeN(document.getElementById('cp_repay')?.value);
  const taxMan    = _cpSafeN(document.getElementById('cp_tax')?.value);
  const taxMonth  = parseInt(document.getElementById('cp_tax_month')?.value ?? 2); // selectは"0"が正当値のため??

  const open   = openMan  * 10_000;
  const repay  = repayMan * 10_000;
  const taxAmt = taxMan   * 10_000;

  try {
    localStorage.setItem(_key, JSON.stringify({
      open, siteSales, siteCogs, repay, tax: taxAmt, taxMonth
    }));
  } catch {}

  const series = calcCashPlanSeries(budget, { open, siteSales, siteCogs, repay, tax: taxAmt, taxMonth });
  if (!series) return;
  const { rows, totalIn, totalOut, minBal, minIdx, finalBal } = series;
  const minMonth  = monthLabels[minIdx];
  const hasShort  = minBal < 0;
  const hasWarn   = !hasShort && minBal < 3_000_000;

  // ステータスカード
  const statusEl = document.getElementById('cp_status');
  if (statusEl) {
    const _card = (label, value, color, sub) => `
      <div style="background:var(--surface-2);border:0.5px solid var(--border);border-left:4px solid ${color};border-radius:12px;padding:14px 16px">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:5px;font-weight:500">${label}</div>
        <div style="font-size:22px;font-weight:700;color:${color};font-variant-numeric:tabular-nums">${value}</div>
        ${sub ? `<div style="font-size:10px;color:var(--text-muted);margin-top:4px">${sub}</div>` : ''}
      </div>`;
    statusEl.innerHTML =
      _card('最低月末残高', _cpFmt(minBal) + '千円',
        hasShort ? '#ef4444' : hasWarn ? '#f59e0b' : '#10b981',
        hasShort ? `⚠️ ${minMonth}に資金ショート` : hasWarn ? `⚠️ ${minMonth}に300万円割れ` : '全月で黒字維持') +
      _card('期末残高', _cpFmt(finalBal) + '千円',
        finalBal >= 0 ? 'var(--text-accent)' : '#ef4444', '期首' + _cpFmt(open) + '千円から') +
      _card('年間収支', (totalIn - totalOut >= 0 ? '+' : '') + _cpFmt(totalIn - totalOut) + '千円',
        totalIn - totalOut >= 0 ? '#10b981' : '#ef4444', `収入 ${_cpFmt(totalIn)} / 支出 ${_cpFmt(totalOut)}（千円）`);
  }

  // テーブル描画
  const tableEl = document.getElementById('cp_table');
  if (!tableEl) return;

  const thStyle = 'style="padding:7px 10px;text-align:right;font-size:11px;font-weight:600;color:var(--text-muted);white-space:nowrap;border-bottom:2px solid var(--border)"';
  const th1Style = 'style="padding:7px 10px;text-align:left;font-size:11px;font-weight:600;color:var(--text-muted);border-bottom:2px solid var(--border);min-width:130px"';

  const headerCols = monthLabels.map(m => `<th ${thStyle}>${m}</th>`).join('') +
    `<th ${thStyle} style="border-left:1px solid var(--border)">合計</th>`;

  const _td = (v, color='var(--text)', bold=false, extraStyle='') =>
    `<td style="padding:5px 10px;text-align:right;color:${color};${bold?'font-weight:700;':''};font-variant-numeric:tabular-nums;${extraStyle}">${_cpFmt(v)}</td>`;

  const _row = (label, arr, total, opts={}) => {
    const { indent=false, bold=false, color='var(--text)', bg='transparent', borderTop=false } = opts;
    const bStyle = borderTop ? 'border-top:1.5px solid var(--border);' : '';
    return `<tr style="background:${bg}">
      <td style="padding:5px 10px;${bold?'font-weight:700;':''}color:${bold?color:'var(--text-secondary)'};white-space:nowrap;${bStyle}${indent?'padding-left:22px;font-size:11px;':''}">${label}</td>
      ${arr.map((v,i) => _td(v, color, bold)).join('')}
      <td style="padding:5px 10px;text-align:right;color:${color};${bold?'font-weight:700;':''}font-variant-numeric:tabular-nums;border-left:1px solid var(--border)">${_cpFmt(total)}</td>
    </tr>`;
  };

  // 月末残高行（色付き）
  const balanceRow = `<tr style="background:var(--blue-50)">
    <td style="padding:6px 10px;font-weight:700;color:var(--primary);border-top:2px solid var(--border)">月末残高</td>
    ${rows.map(r => {
      const neg  = r.closeBal < 0;
      const warn = !neg && r.closeBal < 3_000_000;
      const c    = neg ? 'var(--rose)' : warn ? 'var(--amber)' : 'var(--primary)';
      const bg   = neg ? 'background:var(--rose-bg);' : warn ? 'background:var(--amber-bg);' : '';
      return `<td style="padding:6px 10px;text-align:right;font-weight:700;color:${c};${bg}font-variant-numeric:tabular-nums;border-top:2px solid var(--border)">${_cpFmt(r.closeBal)}</td>`;
    }).join('')}
    <td style="padding:6px 10px;text-align:right;font-weight:700;color:${finalBal<0?'var(--rose)':'var(--primary)'};border-left:1px solid var(--border);border-top:2px solid var(--border)">${_cpFmt(finalBal)}</td>
  </tr>`;

  tableEl.innerHTML = `
    <thead>
      <tr style="background:var(--surface-1)">
        <th ${th1Style}>項目（千円）</th>${headerCols}
      </tr>
    </thead>
    <tbody>
      <!-- 月初残高 -->
      <tr style="background:var(--green-bg)">
        <td style="padding:6px 10px;font-weight:700;color:var(--green)">月初残高</td>
        ${rows.map(r=>`<td style="padding:6px 10px;text-align:right;font-weight:700;color:var(--green);font-variant-numeric:tabular-nums">${_cpFmt(r.openBal)}</td>`).join('')}
        <td style="padding:6px 10px;text-align:right;color:var(--text-muted);font-size:11px;border-left:1px solid var(--border)">—</td>
      </tr>

      <!-- 収入の部 -->
      <tr style="background:var(--surface-1)">
        <td colspan="14" style="padding:5px 10px;font-size:11px;font-weight:700;color:var(--green);letter-spacing:.05em">▼ 収入の部</td>
      </tr>
      ${_row('売上回収', rows.map(r=>r.cashIn), totalIn, {indent:true})}
      ${_row('収入合計', rows.map(r=>r.inTotal), totalIn, {bold:true, color:'var(--green)', bg:'var(--green-bg)', borderTop:true})}

      <!-- 支出の部 -->
      <tr style="background:var(--surface-1)">
        <td colspan="14" style="padding:5px 10px;font-size:11px;font-weight:700;color:var(--rose);letter-spacing:.05em">▼ 支出の部</td>
      </tr>
      ${_row('仕入支払', rows.map(r=>r.cashCogs), rows.reduce((s,r)=>s+r.cashCogs,0), {indent:true})}
      ${_row('経費支払', rows.map(r=>r.cashSga),  rows.reduce((s,r)=>s+r.cashSga,0),  {indent:true})}
      ${repay > 0 ? _row('借入返済', rows.map(_=>repay), repay*12, {indent:true}) : ''}
      ${taxAmt > 0 ? _row('税金支払', rows.map(r=>r.taxOut), taxAmt, {indent:true}) : ''}
      ${_row('支出合計', rows.map(r=>r.outTotal), totalOut, {bold:true, color:'var(--rose)', bg:'var(--rose-bg)', borderTop:true})}

      <!-- 当月収支 -->
      <tr>
        <td style="padding:6px 10px;font-weight:700;color:var(--text)">当月収支</td>
        ${rows.map(r=>`<td style="padding:6px 10px;text-align:right;font-weight:600;color:${r.net>=0?'var(--green)':'var(--rose)'};font-variant-numeric:tabular-nums">${_cpFmt(r.net)}</td>`).join('')}
        <td style="padding:6px 10px;text-align:right;font-weight:600;color:${totalIn-totalOut>=0?'var(--green)':'var(--rose)'};border-left:1px solid var(--border);font-variant-numeric:tabular-nums">${_cpFmt(totalIn-totalOut)}</td>
      </tr>

      <!-- 月末残高 -->
      ${balanceRow}
    </tbody>`;
}
