// ===== 顧問先売上管理 =====
// 税理士法人専用：顧問先ごとの売上を月別展開して補助科目として予算へ反映

const REVENUE_KEY = 'revenue_clients_v1';

function loadRevenueClients(companyId, year) {
  try {
    const raw = localStorage.getItem(REVENUE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    return all[`${companyId}_${year}`] || [];
  } catch { return []; }
}

function saveRevenueClients(companyId, year, clients) {
  try {
    const raw = localStorage.getItem(REVENUE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[`${companyId}_${year}`] = clients;
    localStorage.setItem(REVENUE_KEY, JSON.stringify(all));
  } catch {}
  if (typeof fbSaveRevenue === 'function') fbSaveRevenue(companyId, year, clients);
}

// 顧問先売上・課税設定を翌年度へ引き継ぐ
//  - 顧問先リスト（契約条件・報酬）をそのままコピー
//  - 翌年度に解約済みの顧問先は除外（契約開始/終了ロジックで月次0だが一覧も整理）
//  - 課税設定もコピー
function carryRevenueToNextYear(companyId, fromYear) {
  const toYear  = fromYear + 1;
  const clients = loadRevenueClients(companyId, fromYear);

  const kept = clients.filter(c => {
    const end = c.contractEnd;
    if (!end || !end.year || !end.month) return true;        // 継続中は残す
    return end.year >= toYear;                                // 翌年度以降に解約 → 残す（前年度までに解約済みは除外）
  }).map(c => JSON.parse(JSON.stringify(c)));

  saveRevenueClients(companyId, toYear, kept);
  saveRevCtaxSettings(companyId, toYear, loadRevCtaxSettings(companyId, fromYear));
  return kept.length;
}

// 課税設定（売上区分ごと）
const REV_CTAX_KEY = 'revenue_ctax_v1';
function loadRevCtaxSettings(companyId, year) {
  try {
    const all = JSON.parse(localStorage.getItem(REV_CTAX_KEY) || '{}');
    return all[`${companyId}_${year}`] ?? { sales_advisory: true, sales_compliance: true, sales_consulting: true };
  } catch { return { sales_advisory: true, sales_compliance: true, sales_consulting: true }; }
}
function saveRevCtaxSettings(companyId, year, settings) {
  try {
    const all = JSON.parse(localStorage.getItem(REV_CTAX_KEY) || '{}');
    all[`${companyId}_${year}`] = settings;
    localStorage.setItem(REV_CTAX_KEY, JSON.stringify(all));
  } catch {}
}

// 売上区分の定義
const REV_CATEGORIES = [
  { id: 'sales_advisory',   name: '顧問報酬' },
  { id: 'sales_compliance', name: 'コンプライアンス報酬' },
  { id: 'sales_consulting', name: 'コンサルティング報酬' },
];

function newClient() {
  const now = new Date();
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2,5),
    name: '',
    confirmed: true,       // 確定/未確定
    indiv: false,          // true=個人（申告月+3）、false=法人（申告月+2）
    category: 'sales_advisory', // 売上区分
    contractStart: { year: now.getFullYear(), month: now.getMonth() + 1 },
    contractEnd:   { year: '', month: '' },  // 解約年月（空なら継続）
    retainer: 0,
    retainerSteps: [],  // [{from:{year,month}, amount:N}] 途中変更
    taxable: true,
    filingCalMonth: -1,
    settlementFee: 0,
    yearEndAdj: 0,
    consulting: {},
  };
}

// 指定カレンダー月の顧問料を取得（ステップ変更対応）
function _getRetainerAt(client, calYear, calMonth) {
  const steps = client.retainerSteps;
  if (!steps || steps.length === 0) return client.retainer || 0;
  const sorted = [...steps].sort((a, b) =>
    (a.from.year * 100 + a.from.month) - (b.from.year * 100 + b.from.month)
  );
  let amount = client.retainer || 0;
  for (const step of sorted) {
    if (calYear * 100 + calMonth >= step.from.year * 100 + step.from.month) {
      amount = step.amount;
    }
  }
  return amount;
}

// 申告月を決算月から自動計算（法人+2、個人+3）
function calcFilingMonth(settlementCalMonth, indiv) {
  if (settlementCalMonth < 1) return -1;
  const offset = indiv ? 3 : 2;
  return ((settlementCalMonth - 1 + offset) % 12) + 1;
}

// 顧問先1件の12ヶ月売上配列（予算月インデックス 0-11）
function calcClientMonthly(client, startMonth, budgetYear) {
  return Array.from({length: 12}, (_, i) => {
    // 予算月インデックスiが対応するカレンダー年月
    const calMonth = ((startMonth - 1 + i) % 12) + 1; // 1-12
    const calYear  = budgetYear + Math.floor((startMonth - 1 + i) / 12);

    // 契約開始前は0
    const cs = client.contractStart;
    if (cs?.year && cs?.month) {
      if (calYear * 100 + calMonth < cs.year * 100 + cs.month) return 0;
    }

    // 解約月以降は0（解約月も含めて0）
    const ce = client.contractEnd;
    if (ce?.year && ce?.month) {
      if (calYear * 100 + calMonth >= ce.year * 100 + ce.month) return 0;
    }

    let total = _getRetainerAt(client, calYear, calMonth);

    // 申告月に決算報酬
    if (client.filingCalMonth > 0 && calMonth === client.filingCalMonth) {
      total += client.settlementFee || 0;
    }

    // 1月に年末調整
    if (calMonth === 1) {
      total += client.yearEndAdj || 0;
    }

    // コンサル（予算月インデックス）
    total += client.consulting?.[i] || 0;

    return total;
  });
}

// HTMLエスケープ（XSS防止）
function _escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== 顧問料ステップ UI =====

function _renderRetainerCell(c, ci) {
  const steps = c.retainerSteps || [];
  const base = c.retainer || 0;
  const badge = steps.length > 0
    ? `<span style="font-size:9px;background:#dbeafe;color:#1d4ed8;border-radius:3px;padding:1px 4px;white-space:nowrap">${steps.length}件変更</span>`
    : '';
  return `
    <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
      <input type="number" class="form-input" style="width:80px;font-size:12px;padding:3px 5px;text-align:right"
        value="${base||''}" placeholder="0" step="1000"
        oninput="_revClients[${ci}].retainer=Math.max(0,+this.value||0)"
        onblur="_revRefresh()">
      <button style="font-size:10px;padding:2px 6px;background:#eff6ff;border:1px solid #93c5fd;border-radius:4px;cursor:pointer;white-space:nowrap;color:#1d4ed8"
        onclick="_revOpenStepModal(${ci})">±</button>
      ${badge}
    </div>`;
}

function _revOpenStepModal(ci) {
  const c = _revClients[ci];
  const steps = c.retainerSteps || [];
  const fmt = v => v || 0;

  // 年月の選択肢（現在から±3年）
  const budget = window.App?.currentBudget;
  const startMonth = budget?.startMonth || 4;
  const baseYear = _revBudgetYear;
  let yearOpts = '';
  for (let y = baseYear - 1; y <= baseYear + 2; y++) {
    yearOpts += `<option value="${y}">${y}</option>`;
  }
  let monthOpts = '';
  for (let m = 1; m <= 12; m++) {
    monthOpts += `<option value="${m}">${m}月</option>`;
  }

  const stepsHtml = steps.length === 0
    ? '<div style="color:#9ca3af;font-size:12px;padding:4px 0">変更なし</div>'
    : steps.map((s, si) => `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:12px">
          <span style="color:#6b7280">${s.from.year}/${String(s.from.month).padStart(2,'0')}〜</span>
          <b style="color:#1d4ed8">${Math.round(+s.amount || 0).toLocaleString()}円</b>
          <button onclick="_revDelStep(${ci},${si});_revOpenStepModal(${ci})"
            style="font-size:10px;padding:1px 6px;background:#fee2e2;border:1px solid #fca5a5;color:#dc2626;border-radius:3px;cursor:pointer">削除</button>
        </div>`).join('');

  const html = `
    <div id="retainer-modal-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9999;display:flex;align-items:center;justify-content:center"
      onclick="if(event.target===this)this.remove()">
      <div style="background:#fff;border-radius:12px;padding:24px;min-width:320px;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
        <h3 style="margin:0 0 4px;font-size:15px;font-weight:700">${_escHtml(c.name)||'（名称未設定）'}</h3>
        <p style="margin:0 0 16px;font-size:12px;color:#6b7280">顧問料の途中変更（何月から新金額）</p>

        <div style="margin-bottom:12px">
          <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:6px">基本顧問料（期首〜）</div>
          <b style="font-size:14px;color:#111">${Math.round(c.retainer||0).toLocaleString()} 円/月</b>
        </div>

        <div style="margin-bottom:16px">
          <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:6px">変更履歴</div>
          ${stepsHtml}
        </div>

        <div style="border-top:1px solid #e5e7eb;padding-top:14px">
          <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:8px">変更を追加</div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <select id="step-year" style="padding:5px 6px;border:1px solid #d1d5db;border-radius:6px;font-size:12px">${yearOpts}</select>
            <select id="step-month" style="padding:5px 6px;border:1px solid #d1d5db;border-radius:6px;font-size:12px">${monthOpts}</select>
            <span style="font-size:12px;color:#6b7280">〜</span>
            <input id="step-amount" type="number" step="1000" placeholder="新金額"
              style="width:100px;padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;text-align:right">
            <span style="font-size:12px;color:#6b7280">円/月</span>
          </div>
          <div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end">
            <button onclick="document.getElementById('retainer-modal-overlay').remove()"
              style="padding:6px 14px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;cursor:pointer;background:#fff">閉じる</button>
            <button onclick="_revAddStep(${ci})"
              style="padding:6px 14px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600">追加</button>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('retainer-modal-overlay')?.remove();
  document.body.insertAdjacentHTML('beforeend', html);

  // デフォルト年を今年に
  const sel = document.getElementById('step-year');
  if (sel) sel.value = String(baseYear);
}

function _revAddStep(ci) {
  const year   = parseInt(document.getElementById('step-year').value, 10);
  const month  = parseInt(document.getElementById('step-month').value, 10);
  const amount = parseFloat(document.getElementById('step-amount').value);
  if (isNaN(year) || year < 2000 || year > 2100) { showToast('年が不正です', 'warn'); return; }
  if (isNaN(month) || month < 1 || month > 12)   { showToast('月が不正です', 'warn'); return; }
  if (isNaN(amount) || amount < 0)                { showToast('金額を正しく入力してください', 'warn'); return; }
  if (!_revClients[ci].retainerSteps) _revClients[ci].retainerSteps = [];
  _revClients[ci].retainerSteps.push({ from: { year, month }, amount });
  // 年月順に常にソート
  _revClients[ci].retainerSteps.sort((a, b) =>
    (a.from.year * 100 + a.from.month) - (b.from.year * 100 + b.from.month));
  _revSave();
  _revOpenStepModal(ci);
  _revRefresh();
}

function _revDelStep(ci, si) {
  if (!_revClients[ci].retainerSteps) return;
  _revClients[ci].retainerSteps.splice(si, 1);
  _revSave();
  _revRefresh();
}

// ===== レンダリング =====
let _revClients = [];
let _revBudgetYear = new Date().getFullYear();
let _revFilter = { name: '', category: '', confirmed: 'all' };
let _revDragSrcIdx = null;

function renderRevenue(container) {
  const budget  = window.App?.currentBudget;
  const company = window.App?.currentCompany;
  if (!budget || !company) {
    container.innerHTML = `<div class="no-data">会社と年度を選択してください</div>`;
    return;
  }

  _revBudgetYear = budget.year || window.App.currentYear;
  _revClients = loadRevenueClients(company.id, _revBudgetYear);
  const _revCtax = loadRevCtaxSettings(company.id, _revBudgetYear);
  const startMonth = budget.startMonth || 4;
  const months = getMonthLabels(startMonth);

  const totalByMonth = _calcTotals(startMonth);
  const grandTotal   = totalByMonth.reduce((a,b)=>a+b,0);

  container.innerHTML = `
    <div class="sim-panel">
      <div class="flex-between">
        <div>
          <h2 class="section-title">顧問先売上管理</h2>
          <p class="section-sub">顧問先ごとの報酬設定から月次売上を自動計算 → 予算の補助科目へ反映</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn-solid" onclick="applyRevenueToBudget()">📊 予算へ反映 →</button>
          <button class="btn-outline" onclick="addRevenueClient()">＋ 顧問先追加</button>
          <button class="btn-ghost" onclick="exportRevenueExcel()" title="Excelエクスポート">⬇ Excel出力</button>
          <label class="btn-ghost" style="cursor:pointer" title="Excelインポート">
            ⬆ Excel取込
            <input type="file" accept=".xlsx,.xls" style="display:none"
              onchange="importRevenueExcel(this.files[0]);this.value=''">
          </label>
        </div>
      </div>

      <div class="stat-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="stat-card" id="rev_stat_count">
          <div class="stat-label">顧問先数</div>
          <div class="stat-value">${_revClients.length}<span style="font-size:14px;font-weight:400">社</span></div>
        </div>
        <div class="stat-card" id="rev_stat_annual">
          <div class="stat-label">年間売上合計</div>
          <div class="stat-value">${isFinite(grandTotal) ? Math.round(grandTotal/1000).toLocaleString() : '—'}<span style="font-size:14px;font-weight:400">千円</span></div>
        </div>
        <div class="stat-card" id="rev_stat_avg">
          <div class="stat-label">月平均売上</div>
          <div class="stat-value">${isFinite(grandTotal) ? Math.round(grandTotal/12/1000).toLocaleString() : '—'}<span style="font-size:14px;font-weight:400">千円</span></div>
        </div>
        <div class="stat-card" id="rev_stat_retainer">
          <div class="stat-label">顧問料合計（月額）</div>
          <div class="stat-value">${Math.round(_revClients.reduce((s,c)=>s+(c.retainer||0),0)/1000).toLocaleString()}<span style="font-size:14px;font-weight:400">千円</span></div>
        </div>
      </div>

      <div class="card" style="padding:16px">
        <h3 style="margin-bottom:12px">月別売上合計</h3>
        <div style="height:140px"><canvas id="rev_chart"></canvas></div>
      </div>

      <div class="card" style="padding:10px 14px;margin-bottom:8px">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input type="text" class="form-input" style="width:180px;font-size:12px" id="rev_filter_name"
            placeholder="🔍 顧問先名で検索" value=""
            oninput="_revFilter.name=this.value;_revApplyFilter()">
          <select class="form-input" style="width:150px;font-size:12px" id="rev_filter_cat"
            onchange="_revFilter.category=this.value;_revApplyFilter()">
            <option value="">全区分</option>
            ${REV_CATEGORIES.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}
          </select>
          <select class="form-input" style="width:130px;font-size:12px" id="rev_filter_confirmed"
            onchange="_revFilter.confirmed=this.value;_revApplyFilter()">
            <option value="all">確定・未確定</option>
            <option value="confirmed">確定のみ</option>
            <option value="unconfirmed">未確定のみ</option>
          </select>
          <span style="font-size:11px;color:var(--text-muted)" id="rev_filter_count"></span>
          <button class="btn-ghost btn-sm" onclick="_revClearFilter()" style="font-size:11px">✕ クリア</button>
        </div>
      </div>

      <div class="card-h" style="padding:0;overflow:hidden">
        <div style="overflow-x:auto;overflow-y:auto;max-height:calc(100vh - 420px)">
          <table class="result-table" style="min-width:800px;table-layout:fixed">
            <colgroup>
              <col style="width:20px"> <!-- ドラッグ -->
              <col style="width:140px"><!-- 顧問先名 -->
              <col style="width:86px"> <!-- 区分 -->
              <col style="width:40px"> <!-- 確定 -->
              <col style="width:34px"> <!-- 課税 -->
              <col style="width:86px"> <!-- 契約開始 -->
              <col style="width:76px"> <!-- 解約年月 -->
              <col style="width:170px"><!-- 顧問料+決算+報酬+年末 -->
              ${months.map(()=>'<col style="width:60px">').join('')}
              <col style="width:68px"> <!-- 合計 -->
              <col style="width:100px"><!-- メモ -->
              <col style="width:56px"> <!-- 操作 -->
            </colgroup>
            <thead style="position:sticky;top:0;z-index:10">
              <tr>
                <th style="background:#e0f2fe;z-index:15;padding:4px 2px;text-align:center;font-size:11px;color:#94a3b8">☰</th>
                <th style="position:sticky;left:0;background:#e0f2fe;z-index:15">顧問先名</th>
                <th>区分</th>
                <th>確定</th>
                <th title="課税売上かどうか（消費税設定へ反映）">課税</th>
                <th>契約開始</th>
                <th>解約年月</th>
                <th>顧問料・決算</th>
                ${months.map(m=>`<th>${m}</th>`).join('')}
                <th style="position:sticky;right:156px;background:#e0f2fe;z-index:11">合計</th>
                <th style="position:sticky;right:56px;background:#e0f2fe;z-index:11">メモ</th>
                <th style="position:sticky;right:0;background:#e0f2fe;z-index:11"></th>
              </tr>
            </thead>
            <tbody id="rev_tbody"></tbody>
            <tfoot id="rev_tfoot"></tfoot>
          </table>
        </div>
      </div>

      <div class="card" style="background:#fffbeb;border-color:#fcd34d;padding:12px 16px;font-size:11.5px;color:#78350f">
        💡 <strong>反映について：</strong>
        顧問先ごとに売上の補助科目（例：顧問料、決算報酬）が自動作成されます。
        既存の補助科目があれば上書きします。コンサルは💼ボタンから月別入力できます。
      </div>
    </div>`;

  renderRevTable(startMonth, months);
  renderRevChart(months, totalByMonth, startMonth);
}

const MONTH_LABELS_JP = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

function _calcTotals(startMonth) {
  const totalByMonth = Array(12).fill(0);
  _revClients.forEach(c => {
    calcClientMonthly(c, startMonth, _revBudgetYear).forEach((v, i) => totalByMonth[i] += v);
  });
  return totalByMonth;
}

function renderRevTable(startMonth, months) {
  const tbody = document.getElementById('rev_tbody');
  const tfoot = document.getElementById('rev_tfoot');
  if (!tbody) return;

  const totalByMonth = _calcTotals(startMonth);
  const grandTotal   = totalByMonth.reduce((a,b)=>a+b,0);

  if (!_revClients.length) {
    tbody.innerHTML = `<tr><td colspan="${9+12+2}" class="no-data" style="padding:40px">「顧問先追加」で顧問先を登録してください</td></tr>`;
    tfoot.innerHTML = '';
    return;
  }

  // フィルタリング
  const displayClients = _revClients
    .map((c, ci) => ({ c, ci }))
    .filter(({ c }) => {
      if (_revFilter.name && !c.name.toLowerCase().includes(_revFilter.name.toLowerCase())) return false;
      if (_revFilter.category && (c.category || 'sales_advisory') !== _revFilter.category) return false;
      if (_revFilter.confirmed === 'confirmed' && c.confirmed === false) return false;
      if (_revFilter.confirmed === 'unconfirmed' && c.confirmed !== false) return false;
      return true;
    });

  // フィルター件数表示
  const fcEl = document.getElementById('rev_filter_count');
  if (fcEl) {
    const isFiltered = _revFilter.name || _revFilter.category || _revFilter.confirmed !== 'all';
    fcEl.textContent = isFiltered ? `${displayClients.length} / ${_revClients.length}社表示` : `${_revClients.length}社`;
  }

  tbody.innerHTML = displayClients.map(({ c, ci }) => {
    const monthly = calcClientMonthly(c, startMonth, _revBudgetYear);
    const total   = monthly.reduce((a,b)=>a+b,0);
    const cs = c.contractStart || {};

    // 申告月セレクト（直接編集可・決算月変更時は自動上書き）
    const filingOpts = `<option value="-1"${(c.filingCalMonth??-1)<0?' selected':''}>なし</option>` +
      MONTH_LABELS_JP.map((m,i)=>`<option value="${i+1}"${c.filingCalMonth===i+1?' selected':''}>${m}</option>`).join('');

    const monthCells = monthly.map((v, mi) => {
      const isSpecial = v > (c.retainer || 0);
      const style = isSpecial ? 'background:#fffbeb' : '';
      return `<td style="text-align:right;padding:4px 6px;font-size:11.5px;${style}">
        <div style="display:flex;flex-direction:column;align-items:flex-end">
          <span>${v !== 0 ? Math.round(v/1000).toLocaleString() : '–'}</span>
          ${isSpecial ? `<span style="font-size:9px;color:#d97706">+${Math.round((v-(c.retainer||0))/1000).toLocaleString()}</span>` : ''}
        </div>
      </td>`;
    }).join('');

    const isConfirmed = c.confirmed !== false;
    const rowBg = isConfirmed ? '' : 'background:#fffbeb';
    const catOpts = REV_CATEGORIES.map(cat =>
      `<option value="${cat.id}"${(c.category||'sales_advisory')===cat.id?' selected':''}>${cat.name}</option>`
    ).join('');

    return `<tr data-ci="${ci}" draggable="true" style="${rowBg}"
      ondragstart="_revDragSrcIdx=${ci};this.style.opacity='.4';event.dataTransfer.effectAllowed='move'"
      ondragend="this.style.opacity='1'"
      ondragover="event.preventDefault();this.style.background='#bae6fd'"
      ondragleave="this.style.background=''"
      ondrop="event.preventDefault();this.style.background='';_revDropClient(${ci})">
      <td style="padding:4px 2px;text-align:center;cursor:grab;color:#94a3b8;user-select:none;font-size:14px"
        title="ドラッグして並び替え">☰</td>
      <td style="padding:4px 6px;position:sticky;left:0;background:${isConfirmed?'#fff':'#fffbeb'};z-index:2">
        <div style="display:flex;align-items:center;gap:5px">
          <input class="form-input" style="flex:1;font-size:12px;padding:4px 6px"
            value="${escHtml(c.name)}" placeholder="顧問先名"
            oninput="_revClients[${ci}].name=this.value" onblur="_revSave()">
          ${!isConfirmed ? '<span style="font-size:9px;background:#fcd34d;color:#78350f;border-radius:3px;padding:1px 4px;white-space:nowrap;font-weight:700">未確定</span>' : ''}
        </div>
      </td>
      <td style="padding:4px 5px">
        <select class="form-input" style="width:115px;font-size:11px;padding:3px 4px"
          onchange="_revClients[${ci}].category=this.value;_revRefresh()">
          ${catOpts}
        </select>
      </td>
      <td style="padding:4px 5px;text-align:center">
        <label style="cursor:pointer;display:flex;align-items:center;justify-content:center;gap:3px;font-size:11px">
          <input type="checkbox" ${isConfirmed?'checked':''} style="width:14px;height:14px;accent-color:var(--emerald-mid)"
            onchange="_revClients[${ci}].confirmed=this.checked;_revRefresh()">
        </label>
      </td>
      <td style="padding:4px 5px;text-align:center">
        <label style="cursor:pointer;display:flex;align-items:center;justify-content:center" title="課税売上（消費税設定へ反映）">
          <input type="checkbox" ${c.taxable !== false ? 'checked' : ''} style="width:14px;height:14px;accent-color:#f59e0b"
            onchange="_revClients[${ci}].taxable=this.checked;_revSave()">
        </label>
      </td>
      <td style="padding:4px 5px">
        <div style="display:flex;gap:3px">
          <input type="number" class="form-input" style="width:52px;font-size:11px;padding:3px 4px;text-align:right"
            value="${cs.year||''}" placeholder="年" min="2020" max="2040"
            oninput="_revClients[${ci}].contractStart={..._revClients[${ci}].contractStart,year:+this.value||''}"
            onblur="_revRefresh()">
          <select class="form-input" style="width:50px;font-size:11px;padding:3px 3px"
            onchange="_revClients[${ci}].contractStart={..._revClients[${ci}].contractStart,month:+this.value};_revRefresh()">
            ${MONTH_LABELS_JP.map((m,i)=>`<option value="${i+1}"${(cs.month||1)===i+1?' selected':''}>${m}</option>`).join('')}
          </select>
        </div>
      </td>
      <td style="padding:4px 5px">
        ${(()=>{const ce=c.contractEnd||{};return`<div style="display:flex;gap:3px">
          <input type="number" class="form-input" style="width:52px;font-size:11px;padding:3px 4px;text-align:right"
            value="${ce.year||''}" placeholder="年" min="2020" max="2040"
            oninput="_revClients[${ci}].contractEnd={..._revClients[${ci}].contractEnd,year:+this.value||''}"
            onblur="_revRefresh()">
          <select class="form-input" style="width:50px;font-size:11px;padding:3px 3px"
            onchange="_revClients[${ci}].contractEnd={..._revClients[${ci}].contractEnd,month:+this.value};_revRefresh()">
            <option value="">月</option>
            ${MONTH_LABELS_JP.map((m,i)=>`<option value="${i+1}"${(ce.month||'')===i+1?' selected':''}>${m}</option>`).join('')}
          </select>
        </div>`})()}
      </td>
      <td style="padding:3px 5px">
        ${_renderRetainerCell(c, ci)}
        <div style="display:flex;gap:3px;margin-top:3px;align-items:center;flex-wrap:wrap">
          <select class="form-input" style="width:36px;font-size:10px;padding:1px 2px"
            onchange="(function(el){const oldIndiv=c.indiv;_revClients[${ci}].indiv=el.value==='1';const newIndiv=_revClients[${ci}].indiv;const fm=_revClients[${ci}].filingCalMonth;if(fm>0){const dm=(((fm-1+(oldIndiv?9:10))%12)+1);_revClients[${ci}].filingCalMonth=calcFilingMonth(dm,newIndiv);}  _revRefresh();})(this)">
            <option value="0"${!c.indiv?' selected':''}>法人</option>
            <option value="1"${c.indiv?' selected':''}>個人</option>
          </select>
          <select class="form-input" style="width:46px;font-size:10px;padding:1px 2px"
            onchange="const dm=+this.value;_revClients[${ci}].filingCalMonth=dm>0?calcFilingMonth(dm,_revClients[${ci}].indiv):-1;_revRefresh()">
            <option value="-1">決算–</option>
            ${MONTH_LABELS_JP.map((m,i)=>`<option value="${i+1}"${c.filingCalMonth>0&&(((c.filingCalMonth-1+(c.indiv?9:10))%12)+1)===i+1?' selected':''}>${m}</option>`).join('')}
          </select>
          <input type="number" class="form-input" style="width:62px;font-size:10px;padding:1px 3px;text-align:right" placeholder="決算報酬"
            value="${c.settlementFee||''}" step="10000"
            oninput="_revClients[${ci}].settlementFee=Math.max(0,+this.value||0)" onblur="_revRefresh()">
          <input type="number" class="form-input" style="width:54px;font-size:10px;padding:1px 3px;text-align:right" placeholder="年末調整"
            value="${c.yearEndAdj||''}" step="10000"
            oninput="_revClients[${ci}].yearEndAdj=Math.max(0,+this.value||0)" onblur="_revRefresh()">
        </div>
      </td>
      ${monthCells}
      <td style="text-align:right;padding:4px 8px;font-weight:700;color:var(--emerald-dark);font-size:12px;position:sticky;right:156px;background:${isConfirmed?'#fff':'#fffbeb'};z-index:2">
        ${Math.round(total/1000).toLocaleString()}
      </td>
      <td style="padding:4px 5px;position:sticky;right:56px;background:${isConfirmed?'#fff':'#fffbeb'};z-index:2">
        <input type="text" class="remarks-input" style="width:100%;font-size:11px"
          value="${escHtml(c.memo||'')}" placeholder="メモ"
          onchange="updateClientMemo('${c.id}', this.value)">
      </td>
      <td style="padding:3px;text-align:center;white-space:nowrap;position:sticky;right:0;background:${isConfirmed?'#fff':'#fffbeb'};z-index:2">
        <button class="btn-xs btn-ghost" onclick="openConsulting(${ci})" title="コンサル入力" style="display:block;margin:0 auto 4px">💼</button>
        <button onclick="removeRevenueClient(${ci})" title="削除" style="display:block;margin:0 auto;background:#fee2e2;border:1px solid #fca5a5;color:#dc2626;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;white-space:nowrap">🗑 削除</button>
      </td>
    </tr>`;
  }).join('');

  tfoot.innerHTML = `
    <tr style="background:#f0fdf4;font-weight:700">
      <td colspan="8" style="padding:8px 10px;position:sticky;left:0;background:#f0fdf4;z-index:9">合計（千円）</td>
      ${totalByMonth.map(v=>`<td style="text-align:right;padding:6px 8px">${v?Math.round(v/1000).toLocaleString():'–'}</td>`).join('')}
      <td style="text-align:right;padding:6px 8px;color:var(--emerald-dark);position:sticky;right:156px;background:#f0fdf4;z-index:9">${Math.round(grandTotal/1000).toLocaleString()}</td>
      <td style="position:sticky;right:56px;background:#f0fdf4;z-index:9"></td>
      <td style="position:sticky;right:0;background:#f0fdf4;z-index:9"></td>
    </tr>`;

  // 右クリックコンテキストメニュー
  tbody.addEventListener('contextmenu', e => {
    e.preventDefault();
    const tr = e.target.closest('tr[data-ci]');
    if (!tr) return;
    const ci = parseInt(tr.dataset.ci);
    showRevContextMenu(e.clientX, e.clientY, ci);
  });
}

// 区分ごとの色
const CAT_COLORS = {
  sales_advisory:   { bg: 'rgba(37,99,235,.7)',   border: 'rgba(37,99,235,.9)'   }, // blue
  sales_compliance: { bg: 'rgba(16,185,129,.7)',  border: 'rgba(16,185,129,.9)'  }, // green
  sales_consulting: { bg: 'rgba(245,158,11,.7)',  border: 'rgba(245,158,11,.9)'  }, // amber
  sales_ec:         { bg: 'rgba(139,92,246,.7)',  border: 'rgba(139,92,246,.9)'  }, // violet
  sales_store:      { bg: 'rgba(239,68,68,.7)',   border: 'rgba(239,68,68,.9)'   }, // red
  sales_other:      { bg: 'rgba(107,114,128,.7)', border: 'rgba(107,114,128,.9)' }, // gray
};

function renderRevChart(months, totalByMonth, startMonth) {
  const canvas = document.getElementById('rev_chart');
  if (!canvas) return;
  if (window._revChartInstance) window._revChartInstance.destroy();

  // 区分ごとに月次データを集計
  const sm = startMonth || (window.App?.currentBudget?.startMonth) || 4;
  const catDatasets = REV_CATEGORIES.map(cat => {
    const clients = _revClients.filter(c => (c.category || 'sales_advisory') === cat.id);
    if (!clients.length) return null;
    const data = Array(12).fill(0);
    clients.forEach(c => {
      calcClientMonthly(c, sm, _revBudgetYear).forEach((v, i) => { data[i] += v; });
    });
    if (data.every(v => v === 0)) return null;
    const col = CAT_COLORS[cat.id] || CAT_COLORS.sales_other;
    return {
      label: cat.name,
      data: data.map(v => Math.round(v / 1000)),
      backgroundColor: col.bg,
      borderColor: col.border,
      borderWidth: 1,
      borderRadius: 3,
    };
  }).filter(Boolean);

  window._revChartInstance = new Chart(canvas, {
    type: 'bar',
    data: { labels: months, datasets: catDatasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: catDatasets.length > 1, position: 'bottom', labels: { font:{size:11}, boxWidth:12, padding:10 } },
      },
      scales: {
        x: { stacked: true, ticks: { font:{size:10} }, grid: { display:false } },
        y: { stacked: true, ticks: { callback: v => v.toLocaleString()+'千', font:{size:10} }, grid: { color:'#f1f5f9' } },
      }
    }
  });
}

function _revApplyFilter() {
  const budget = window.App?.currentBudget;
  const startMonth = budget?.startMonth || 4;
  const months = getMonthLabels(startMonth);
  renderRevTable(startMonth, months);
}

function _revClearFilter() {
  _revFilter = { name: '', category: '', confirmed: 'all' };
  const fn = document.getElementById('rev_filter_name');
  const fc = document.getElementById('rev_filter_cat');
  const fconf = document.getElementById('rev_filter_confirmed');
  if (fn) fn.value = '';
  if (fc) fc.value = '';
  if (fconf) fconf.value = 'all';
  _revApplyFilter();
}

function _revDropClient(targetCi) {
  if (_revDragSrcIdx === null || _revDragSrcIdx === targetCi) { _revDragSrcIdx = null; return; }
  const src = _revClients.splice(_revDragSrcIdx, 1)[0];
  const adjusted = _revDragSrcIdx < targetCi ? targetCi - 1 : targetCi;
  _revClients.splice(adjusted, 0, src);
  _revDragSrcIdx = null;
  _revSave();
  _revApplyFilter();
}

function showRevContextMenu(x, y, ci) {
  document.getElementById('rev_ctx_menu')?.remove();
  const menu = document.createElement('div');
  menu.id = 'rev_ctx_menu';
  menu.className = 'ctx-menu';
  menu.style.cssText = `left:${x}px;top:${y}px`;
  const name = escHtml(_revClients[ci]?.name || '(未入力)');
  menu.innerHTML = `
    <div class="ctx-item" onclick="_revAddClientAt(${ci})">＋ 上に顧問先追加</div>
    <div class="ctx-item" onclick="_revAddClientAt(${ci + 1})">＋ 下に顧問先追加</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item" style="color:#dc2626" onclick="removeRevenueClient(${ci})">🗑 削除（${name}）</div>
  `;
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 10);
}

function _revAddClientAt(idx) {
  _revClients.splice(idx, 0, newClient());
  _revRefresh();
}

function _revSave() {
  const company = window.App?.currentCompany;
  if (!company) return;
  saveRevenueClients(company.id, _revBudgetYear, _revClients);
}

function _revSaveCtax(catId, checked) {
  const company = window.App?.currentCompany;
  if (!company) return;
  const settings = loadRevCtaxSettings(company.id, _revBudgetYear);
  settings[catId] = checked;
  saveRevCtaxSettings(company.id, _revBudgetYear, settings);
}

let _revRefreshTimer = null;
function _revRefreshDebounced() {
  clearTimeout(_revRefreshTimer);
  _revRefreshTimer = setTimeout(_revRefresh, 300);
}

function _revRefresh() {
  _revSave();
  const budget = window.App?.currentBudget;
  const startMonth = budget?.startMonth || 4;
  const months = getMonthLabels(startMonth);
  const totalByMonth = _calcTotals(startMonth);
  const grandTotal   = totalByMonth.reduce((a,b)=>a+b,0);

  renderRevTable(startMonth, months);
  renderRevChart(months, totalByMonth, startMonth);

  // サマリー更新
  const setS = (id, html) => { const el=document.getElementById(id); if(el) el.querySelector('.stat-value').innerHTML=html; };
  setS('rev_stat_count',   `${_revClients.length}<span style="font-size:14px;font-weight:400">社</span>`);
  setS('rev_stat_annual',  `${Math.round(grandTotal/1000).toLocaleString()}<span style="font-size:14px;font-weight:400">千円</span>`);
  setS('rev_stat_avg',     `${Math.round(grandTotal/12/1000).toLocaleString()}<span style="font-size:14px;font-weight:400">千円</span>`);
  setS('rev_stat_retainer',`${Math.round(_revClients.reduce((s,c)=>s+(c.retainer||0),0)/1000).toLocaleString()}<span style="font-size:14px;font-weight:400">千円</span>`);
}

function addRevenueClient() {
  _revClients.push(newClient());
  _revRefresh();
}

function removeRevenueClient(ci) {
  if (!confirm(`「${_revClients[ci].name || '(未入力)'}」を削除しますか？`)) return;
  _revClients.splice(ci, 1);
  _revRefresh();
}

// コンサル入力モーダル
function openConsulting(ci) {
  const budget = window.App?.currentBudget;
  const startMonth = budget?.startMonth || 4;
  const months = getMonthLabels(startMonth);
  const c = _revClients[ci];

  let modal = document.getElementById('rev_consulting_modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'rev_consulting_modal';
    modal.className = 'modal';
    modal.onclick = e => { if (e.target === modal) modal.classList.remove('open'); };
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-box" style="width:440px">
      <h2>💼 コンサル報酬</h2>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">${escHtml(c.name||'(未入力)')}　月ごとに臨時コンサル報酬を入力</p>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:20px">
        ${months.map((m, i) => `
          <div class="form-group" style="margin:0">
            <label style="font-size:11px">${m}</label>
            <input type="number" class="form-input" style="padding:5px 8px;font-size:12px"
              value="${c.consulting?.[i]||''}" placeholder="0" step="10000"
              oninput="if(!_revClients[${ci}].consulting)_revClients[${ci}].consulting={};_revClients[${ci}].consulting[${i}]=+this.value||0">
          </div>`).join('')}
      </div>
      <div class="modal-footer">
        <button class="btn-ghost" onclick="document.getElementById('rev_consulting_modal').classList.remove('open')">キャンセル</button>
        <button class="btn-solid" onclick="document.getElementById('rev_consulting_modal').classList.remove('open');_revRefresh()">保存</button>
      </div>
    </div>`;
  modal.classList.add('open');
}

// ===== 予算の補助科目へ反映 =====
function applyRevenueToBudget() {
  const budget  = window.App?.currentBudget;
  const company = window.App?.currentCompany;
  if (!budget || !company) { showToast('予算データがありません', 'error'); return; }

  const startMonth = budget.startMonth || 4;
  if (!budget.rows) budget.rows = {};

  // 既存の rev_ データを全削除（重複防止）
  Object.keys(budget.rows).forEach(k => { if (k.startsWith('rev_')) delete budget.rows[k]; });

  // dynamicAccounts が試算表インポート由来でない場合はクリア
  if (budget.dynamicAccounts) {
    budget.dynamicAccounts = budget.dynamicAccounts.filter(a => !a.id.startsWith('rev_'));
  }

  // 静的カテゴリの定義（名前照合用）
  const CAT_NAMES = {
    sales_advisory:   '顧問報酬',
    sales_compliance: 'コンプライアンス報酬',
    sales_consulting: 'コンサルティング報酬',
    sales_ec:         'EC売上',
    sales_store:      '店舗売上',
    sales_other:      'その他売上',
  };

  // dynamicAccountsがある場合：名前照合でIDを解決、なければカテゴリ科目自体を追加
  function ensureCategoryInDynamic(catId) {
    if (!budget.dynamicAccounts) return catId;
    const catName = CAT_NAMES[catId];
    // 名前一致で探す
    const found = budget.dynamicAccounts.find(a => a.name === catName);
    if (found) return found.id;
    // IDで探す（静的IDがそのまま残っている場合）
    const byId = budget.dynamicAccounts.find(a => a.id === catId);
    if (byId) return catId;
    // 存在しない → 売上高の下に追加
    const salesIdx = budget.dynamicAccounts.findIndex(
      a => a.name?.includes('売上高') || a.id === 'sales'
    );
    let insertAt = salesIdx >= 0 ? salesIdx + 1 : budget.dynamicAccounts.length;
    // 既存の sales 子をスキップ
    while (insertAt < budget.dynamicAccounts.length &&
           (budget.dynamicAccounts[insertAt].parentId === 'sales' ||
            budget.dynamicAccounts[insertAt].id === catId)) insertAt++;
    budget.dynamicAccounts.splice(insertAt, 0, {
      id: catId, name: catName, type: 'input',
      section: 'pl', indent: 1, sign: 1, bold: false,
      parentId: budget.dynamicAccounts[salesIdx]?.id || 'sales',
    });
    return catId;
  }

  const actualCols = budget.actualCols || [];

  // dynamicAccounts内で名前が一致する子科目を探す
  function findExistingChild(catId, clientName) {
    if (!budget.dynamicAccounts) return null;
    return budget.dynamicAccounts.find(a =>
      a.parentId === catId && a.name === clientName && !a.id.startsWith('rev_')
    ) || null;
  }

  // 新規クライアント（名前不一致）のrev_注入用
  const newRevToInject = []; // { catId, acc }
  const revAccounts = [];

  _revClients.filter(c => c.name).forEach(c => {
    const cat     = c.category || 'sales_advisory';
    const catId   = ensureCategoryInDynamic(cat);
    const monthly = calcClientMonthly(c, startMonth, _revBudgetYear);

    if (budget.dynamicAccounts) {
      // dynamicAccounts パス
      const existing = findExistingChild(catId, c.name);
      if (existing) {
        // 名前一致 → 同じ行の予算月だけ上書き（実績月は触らない）
        const cur = budget.rows[existing.id] || new Array(13).fill(0);
        budget.rows[existing.id] = monthly.map((v, i) => i < 12 && !actualCols[i] ? v : cur[i]);
      } else {
        // 名前不一致 → 新しいrev_行として追加
        const revId = `rev_${c.id}`;
        budget.rows[revId] = [...monthly.map((v, i) => actualCols[i] ? 0 : v), 0];
        newRevToInject.push({
          catId,
          acc: {
            id: revId, name: c.name, type: 'rev_display',
            section: 'pl', parentId: catId, indent: 2, sign: 1, bold: false,
            tentative: c.confirmed === false,
          },
        });
        revAccounts.push({ id: revId, name: c.name, parentId: catId,
          indent: 2, tentative: c.confirmed === false, section: 'pl' });
      }
    } else {
      // 静的ACCOUNTSパス → カテゴリ行に予算月のみ書き込む（+rev_表示）
      const revId = `rev_${c.id}`;
      budget.rows[revId] = [...monthly, 0];
      revAccounts.push({ id: revId, name: c.name, parentId: catId,
        indent: 2, tentative: c.confirmed === false, section: 'pl' });
    }
  });

  // 静的ACCOUNTSパスのカテゴリ合計書き込み
  if (!budget.dynamicAccounts) {
    const catTotals = {};
    revAccounts.forEach(a => {
      const vals = budget.rows[a.id] || [];
      if (!catTotals[a.parentId]) catTotals[a.parentId] = new Array(13).fill(0);
      vals.forEach((v, i) => { catTotals[a.parentId][i] += v; });
    });
    Object.entries(catTotals).forEach(([catId, totals]) => {
      const existing = budget.rows[catId] || new Array(13).fill(0);
      budget.rows[catId] = totals.map((v, i) => actualCols[i] ? existing[i] : v);
    });
  }

  // 新規クライアントをdynamicAccountsに注入（カテゴリ直後）
  if (budget.dynamicAccounts && newRevToInject.length) {
    const byCat = {};
    newRevToInject.forEach(({ catId, acc }) => { (byCat[catId] = byCat[catId] || []).push(acc); });
    Object.entries(byCat).reverse().forEach(([catId, accs]) => {
      let idx = budget.dynamicAccounts.findIndex(a => a.id === catId);
      if (idx < 0) return;
      let spliceAt = idx + 1;
      while (spliceAt < budget.dynamicAccounts.length &&
             budget.dynamicAccounts[spliceAt].parentId === catId) spliceAt++;
      budget.dynamicAccounts.splice(spliceAt, 0, ...accs);
    });
  }

  budget.revenueAccounts = revAccounts;

  // 課税設定を ctaxClassification に反映（顧問先ごと）
  if (!budget.ctaxClassification) budget.ctaxClassification = {};
  _revClients.filter(c => c.name).forEach(c => {
    const revId = `rev_${c.id}`;
    budget.ctaxClassification[revId] = c.taxable !== false;
    // 名前一致で既存dynamicAccounts行にも反映
    if (budget.dynamicAccounts) {
      const cat = c.category || 'sales_advisory';
      const existing = budget.dynamicAccounts.find(a => a.parentId === cat && a.name === c.name);
      if (existing) budget.ctaxClassification[existing.id] = c.taxable !== false;
    }
  });

  saveBudget(budget);
  window.App.currentBudget = budget;

  const total = _revClients.reduce((s, c) =>
    s + calcClientMonthly(c, startMonth, _revBudgetYear).reduce((a,b)=>a+b,0), 0);

  showToast(`${_revClients.filter(c=>c.name).length}社 反映完了 — 年間合計 ${Math.round(total/1000).toLocaleString()}千円`, 'success', 4000);
  showPage('budget');
}

// ===== Excel エクスポート =====
function exportRevenueExcel() {
  const budget = window.App?.currentBudget;
  const startMonth = budget?.startMonth || 4;
  const months = getMonthLabels(startMonth);

  // ステップ変更の最大数を計算
  const maxSteps = Math.max(0, ..._revClients.map(c => (c.retainerSteps || []).length));

  // ヘッダー行
  const stepHeaders = [];
  for (let si = 0; si < maxSteps; si++) {
    stepHeaders.push(`変更${si+1}_年月`, `変更${si+1}_金額`);
  }
  const headers = [
    '顧問先名', '確定', '法人個人', '売上区分', '契約開始年', '契約開始月',
    '解約年', '解約月',
    '顧問料/月', ...stepHeaders, '決算月', '決算報酬', '年末調整',
    ...months.map(m => `コンサル_${m}`)
  ];

  const rows = _revClients.map(c => {
    const cs = c.contractStart || {};
    const ce = c.contractEnd || {};
    const decMonth = c.filingCalMonth > 0
      ? MONTH_LABELS_JP[((c.filingCalMonth - 1 + (c.indiv ? 9 : 10)) % 12)]
      : '';
    const catName = REV_CATEGORIES.find(r => r.id === (c.category || 'sales_advisory'))?.name || '顧問報酬';
    const steps = c.retainerSteps || [];
    const stepCells = [];
    for (let si = 0; si < maxSteps; si++) {
      const s = steps[si];
      stepCells.push(
        s ? `${s.from.year}/${String(s.from.month).padStart(2,'0')}` : '',
        s ? s.amount : ''
      );
    }
    return [
      c.name || '',
      c.confirmed === false ? '未確定' : '確定',
      c.indiv ? '個人' : '法人',
      catName,
      cs.year || '',
      cs.month ? MONTH_LABELS_JP[cs.month - 1] : '',
      ce.year || '',
      ce.month ? MONTH_LABELS_JP[ce.month - 1] : '',
      c.retainer || 0,
      ...stepCells,
      decMonth,
      c.settlementFee || 0,
      c.yearEndAdj || 0,
      ...Array.from({length: 12}, (_, i) => c.consulting?.[i] || 0),
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // 列幅
  const stepColWidths = Array(maxSteps * 2).fill({wch:14});
  ws['!cols'] = [
    {wch:20},{wch:10},{wch:8},{wch:10},{wch:12},{wch:8},{wch:10},{wch:8},{wch:12},
    ...stepColWidths,
    {wch:10},{wch:10},{wch:10},
    ...Array(12).fill({wch:10})
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '顧問先売上管理');
  const company = window.App?.currentCompany?.name || '会社';
  XLSX.writeFile(wb, `顧問先売上管理_${company}_${_revBudgetYear}.xlsx`);
}

// ===== Excel インポート =====
function importRevenueExcel(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (data.length < 2) { alert('データが見つかりません'); return; }

      const header = data[0].map(h => String(h).trim());
      const nameIdx      = header.findIndex(h => h.includes('顧問先名'));
      const confirmedIdx = header.findIndex(h => h.includes('確定') && !h.includes('法人'));
      const indivIdx     = header.findIndex(h => h.includes('法人個人') || h.includes('個人法人'));
      const catIdx       = header.findIndex(h => h.includes('売上区分'));
      const yearIdx      = header.findIndex(h => h.includes('契約開始年'));
      const monthIdx     = header.findIndex(h => h.includes('契約開始月'));
      const endYearIdx   = header.findIndex(h => h.includes('解約年'));
      const endMonthIdx  = header.findIndex(h => h.includes('解約月'));
      const retIdx       = header.findIndex(h => h.includes('顧問料'));
      const decIdx       = header.findIndex(h => h.includes('決算月'));
      const feeIdx       = header.findIndex(h => h.includes('決算報酬'));
      const adjIdx       = header.findIndex(h => h.includes('年末調整'));

      // ステップ変更列（変更N_年月 / 変更N_金額）
      const stepGroups = {};
      header.forEach((h, i) => {
        const m = h.match(/^変更(\d+)_(年月|金額)$/);
        if (m) {
          const n = parseInt(m[1]);
          if (!stepGroups[n]) stepGroups[n] = {};
          stepGroups[n][m[2]] = i;
        }
      });

      // コンサル列（コンサル_○月）
      const consultingCols = header.map((h, i) => h.startsWith('コンサル_') ? i : -1).filter(i => i >= 0);

      const imported = [];
      for (let ri = 1; ri < data.length; ri++) {
        const row = data[ri];
        const name = String(row[nameIdx] ?? '').trim();
        if (!name) continue;

        // 決算月から申告月を計算（法人+2、個人+3）
        const decMonthStr = String(row[decIdx] ?? '').replace('月','');
        const decMonthNum = MONTH_LABELS_JP.findIndex(m => m.replace('月','') === decMonthStr);
        const indivVal = String(row[indivIdx] ?? '').trim();
        const indiv = ['個人','1','true','yes'].includes(indivVal.toLowerCase()) || indivVal === '個人';
        const filingCalMonth = decMonthNum >= 0 ? calcFilingMonth(decMonthNum + 1, indiv) : -1;

        // 契約開始月（文字列 "4月" → 4）
        const startMonthStr = String(row[monthIdx] ?? '').replace('月','');
        const startMonthNum = MONTH_LABELS_JP.findIndex(m => m.replace('月','') === startMonthStr);

        const consulting = {};
        consultingCols.forEach((col, i) => {
          const v = parseFloat(String(row[col]).replace(/,/g,'')) || 0;
          if (v) consulting[i] = v;
        });

        // 確定列：「未確定」「×」「no」「0」以外はすべて確定
        const confirmedVal = String(row[confirmedIdx] ?? '').trim().toLowerCase();
        const confirmed = confirmedIdx < 0
          ? true
          : !['未確定','×','no','false','0'].includes(confirmedVal);

        // 売上区分
        const catName = catIdx >= 0 ? String(row[catIdx] ?? '').trim() : '';
        const category = REV_CATEGORIES.find(r => r.name === catName)?.id || 'sales_advisory';

        imported.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2,5) + ri,
          name,
          confirmed,
          indiv,
          category,
          contractStart: {
            year:  parseInt(row[yearIdx]) || new Date().getFullYear(),
            month: startMonthNum >= 0 ? startMonthNum + 1 : 1,
          },
          contractEnd: (()=>{
            const ey = endYearIdx >= 0 ? parseInt(row[endYearIdx]) || '' : '';
            const emStr = endMonthIdx >= 0 ? String(row[endMonthIdx] ?? '').replace('月','') : '';
            const emNum = MONTH_LABELS_JP.findIndex(m => m.replace('月','') === emStr);
            return { year: ey, month: emNum >= 0 ? emNum + 1 : '' };
          })(),
          retainer:      parseFloat(String(row[retIdx] ?? '').replace(/,/g,'')) || 0,
          retainerSteps: Object.keys(stepGroups).sort((a,b)=>a-b).reduce((arr, n) => {
            const g = stepGroups[n];
            const ymStr = g['年月'] !== undefined ? String(row[g['年月']] ?? '').trim() : '';
            const amount = g['金額'] !== undefined ? parseFloat(String(row[g['金額']] ?? '').replace(/,/g,'')) : NaN;
            const ymMatch = ymStr.match(/^(\d{4})[\/\-](\d{1,2})$/);
            if (ymMatch && !isNaN(amount) && amount > 0) {
              arr.push({ from: { year: parseInt(ymMatch[1]), month: parseInt(ymMatch[2]) }, amount });
            }
            return arr;
          }, []),
          filingCalMonth,
          settlementFee: parseFloat(String(row[feeIdx] ?? '').replace(/,/g,'')) || 0,
          yearEndAdj:    parseFloat(String(row[adjIdx] ?? '').replace(/,/g,'')) || 0,
          consulting,
        });
      }

      if (!imported.length) { showToast('インポートできる顧問先が見つかりませんでした', 'warn'); return; }


      if (_revClients.length) {
        const choice = confirm(
          `既存の顧問先が${_revClients.length}社あります。\n\n` +
          `【OK】　　上書き（既存データを全て置き換え）\n` +
          `【キャンセル】　追加（既存データに追記）`
        );
        if (choice) {
          _revClients = imported;
        } else {
          _revClients.push(...imported);
        }
      } else {
        _revClients = imported;
      }

      _revRefresh();
      showToast(`${imported.length}社をインポートしました`, 'success');
    } catch(err) {
      showToast('インポートに失敗しました: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

// ===== 顧問先メモ更新 =====
function updateClientMemo(clientId, value) {
  const companyId = App.currentCompany?.id;
  const year = _revBudgetYear || App.currentYear;
  if (!companyId) return;
  const clients = loadRevenueClients(companyId, year);
  const client = clients.find(c => c.id === clientId);
  if (!client) return;
  client.memo = value;
  saveRevenueClients(companyId, year, clients);
  // also update in-memory
  const inMem = _revClients.find(c => c.id === clientId);
  if (inMem) inMem.memo = value;
}
