// ===== 翌期月次予算入力 =====
// 当期の科目構成をベースに来期PLを手入力するスタンドアロン画面
// 他画面（健康診断・5か年シム等）へのデータ連携なし

const NY_KEY = 'nextyear_pl_v1';

let _nyData = null; // { accounts, rows, startMonth }

function _nyStorageKey(companyId, year) { return `${companyId}_${year}`; }

function _nyLoad(companyId, year) {
  try {
    const all = JSON.parse(localStorage.getItem(NY_KEY) || '{}');
    return all[_nyStorageKey(companyId, year)] || null;
  } catch { return null; }
}

function _nySave() {
  const company = window.App?.currentCompany;
  const budget  = window.App?.currentBudget;
  if (!company || !budget || !_nyData) return;
  try {
    const all = JSON.parse(localStorage.getItem(NY_KEY) || '{}');
    all[_nyStorageKey(company.id, budget.year + 1)] = { ..._nyData, updatedAt: Date.now() };
    localStorage.setItem(NY_KEY, JSON.stringify(all));
  } catch(e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      showToast('ストレージ容量不足です', 'error');
    }
  }
}

// ===== 当期予算から翌期へコピーしてページ遷移 =====
function copyToNextYearPL() {
  const budget  = window.App?.currentBudget;
  const company = window.App?.currentCompany;
  if (!budget || !company) { showToast('予算データがありません', 'warn'); return; }

  const accounts = budget.dynamicAccounts
    ? budget.dynamicAccounts.filter(a => !a.section?.startsWith('bs'))
    : null;

  if (!accounts || accounts.length === 0) {
    showToast('科目データがありません（動的インポート後にご利用ください）', 'warn');
    return;
  }

  // 計算行も含めて全値を取得（calcAllValuesDynamic で利益等を算出）
  let allVals = {};
  try { allVals = calcAllValuesDynamic(budget); } catch {}

  const rows = {};
  accounts.forEach(a => {
    const v = allVals[a.id] || budget.rows[a.id] || [];
    rows[a.id] = Array.from({length: 13}, (_, i) => v[i] || 0);
  });

  _nyData = { accounts, rows, startMonth: budget.startMonth || 4, _companyId: company.id, _year: budget.year + 1 };
  _nySave();
  showPage('nextyear_pl');
}

// ===== メイン描画 =====
function renderNextYearPL(container) {
  const company = window.App?.currentCompany;
  const budget  = window.App?.currentBudget;
  if (!company || !budget) {
    container.innerHTML = '<div class="no-data">会社・予算を選択してください</div>';
    return;
  }

  const nextYear = budget.year + 1;

  // 保存済みデータ優先、次にメモリ内（同会社・同年度のみ）、なければ空
  const saved = _nyLoad(company.id, nextYear);
  if (saved) {
    _nyData = saved;
  } else if (_nyData && _nyData._companyId === company.id && _nyData._year === nextYear) {
    // copyToNextYearPL 直後で未保存のデータ（同会社・同年度）はそのまま使う
  } else {
    // 別会社・別年度のデータが残っていても絶対に使わない
    _nyData = null;
    container.innerHTML = `
      <div class="sim-panel">
        <h2 class="section-title">翌期月次予算入力 — ${nextYear}年度</h2>
        <div class="no-data" style="padding:40px;text-align:center">
          <p style="margin-bottom:16px;color:var(--text-muted)">まだデータがありません。</p>
          <p style="margin-bottom:24px;color:var(--text-muted)">月次予算入力画面の「→ 翌期へコピー」を押すと<br>当期の科目・金額を引き継いで編集できます。</p>
          <button class="btn-solid" onclick="showPage('budget')">← 月次予算入力へ</button>
        </div>
      </div>`;
    return;
  }

  const { accounts, rows, startMonth } = _nyData;
  if (!accounts || accounts.length === 0) {
    container.innerHTML = '<div class="no-data">科目データがありません。月次予算入力から「→ 翌期へコピー」を押してください。</div>';
    return;
  }

  const months = getMonthLabels(startMonth);

  const thBase = 'position:sticky;top:0;z-index:10;font-size:11px;font-weight:600;text-align:right;padding:6px 5px;white-space:nowrap;background:var(--blue-50);color:var(--primary);border-bottom:2px solid var(--blue-200)';
  const monthHeaders = months.map(m =>
    `<th style="min-width:72px;${thBase}">${m}</th>`
  ).join('') + `<th style="min-width:70px;${thBase};background:var(--gray-100);color:var(--text-muted)">調整</th>`;

  const tbody = accounts.map(acc => {
    if (acc.type === 'separator') {
      return `<tr><td colspan="${14 + months.length}" style="height:6px;background:var(--bg)"></td></tr>`;
    }

    const indent = '　'.repeat(acc.indent || 0);
    const isSection = acc.type === 'section';
    const isCalc    = acc.type === 'calculated';
    const isParent  = acc.type === 'parent';

    // 行の背景色（科目名セルのみ色付き、入力セルは白）
    const nameBg = isSection
      ? 'background:var(--gray-800);color:#fff;font-weight:700'
      : isCalc
        ? 'background:var(--blue-50);color:var(--primary);font-weight:700'
        : isParent
          ? 'background:var(--gray-100);font-weight:600;color:var(--text-muted)'
          : '';

    const stored = rows[acc.id] || new Array(13).fill(0);
    const makeCell = (v, ci) => {
      const display = v ? Math.round(v).toLocaleString() : '';
      const isAdj = ci === 12;
      return `<td style="padding:2px 3px;border:1px solid var(--border);${isAdj ? 'background:var(--gray-50)' : ''}">
        <input type="text" class="cell-input ny-cell"
          value="${display}"
          data-acc-id="${acc.id}" data-col="${ci}"
          style="width:${isAdj ? '70' : '72'}px;text-align:right;font-size:11px;padding:2px 4px;border:none;background:transparent"
          inputmode="numeric"
          onfocus="this.select()"
          onblur="_nyCommit(this)"
          onkeydown="_nyKeyNav(event,this)"
          oncontextmenu="_nyContextMenu(event,this)">
      </td>`;
    };
    const monthCells = Array.from({length: 12}, (_, ci) => makeCell(stored[ci] || 0, ci)).join('');
    const adjCell   = makeCell(stored[12] || 0, 12);
    const total = stored.reduce((s, v) => s + (v || 0), 0);

    return `<tr data-acc-id="${acc.id}" class="input-row">
      <td class="acc-col sticky-col acc-name" style="font-size:12px;padding:4px 8px;${nameBg}">${indent}${escHtml(acc.name)}</td>
      ${monthCells}
      ${adjCell}
      <td data-ny-total="${acc.id}" class="total-col" style="text-align:right;font-size:12px;font-weight:600;padding:4px 6px;white-space:nowrap">${total ? Math.round(total).toLocaleString() : ''}</td>
    </tr>`;
  }).join('');

  const startMonthLabel = `${startMonth}月`;
  container.innerHTML = `
    <div style="padding:16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
        <h2 class="section-title" style="margin:0">翌期月次予算入力 — ${nextYear}年度（${startMonthLabel}〜）</h2>
        <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm btn-outline" onclick="showPage('budget')">← 当期に戻る</button>
          <button class="btn btn-sm" onclick="copyToNextYearPL()" title="当期予算の金額を翌期へコピー（上書き）">↩ 当期からコピー</button>
          <button class="btn btn-sm" onclick="_nyClear()" title="入力をすべてクリア">🗑 クリア</button>
          <button class="btn-solid btn-sm" onclick="_nySave();showToast('保存しました','success',2000)">💾 保存</button>
        </div>
      </div>
      <div style="overflow:auto;max-height:calc(100vh - 140px)">
        <table class="budget-grid" cellspacing="0">
          <thead>
            <tr>
              <th class="acc-col sticky-col" style="font-size:11px;padding:6px 8px;font-weight:400;color:var(--text-muted);position:sticky;top:0;z-index:20;background:var(--white);border-bottom:2px solid var(--blue-200)">科目名</th>
              ${monthHeaders}
              <th class="total-col" style="font-size:11px;padding:6px;${thBase}">合計</th>
            </tr>
          </thead>
          <tbody id="ny_tbody">${tbody}</tbody>
        </table>
      </div>
    </div>`;

  _nyRecalc();
}

// ===== セル確定（onblur） =====
function _nyCommit(input) {
  if (!_nyData) return;
  const accId  = input.dataset.accId;
  const colIdx = parseInt(input.dataset.col);
  const raw = input.value.replace(/,/g, '');
  const v = parseFloat(raw) || 0;
  if (!_nyData.rows[accId]) _nyData.rows[accId] = new Array(12).fill(0);
  _nyData.rows[accId][colIdx] = v;
  input.value = v ? Math.round(v).toLocaleString() : '';
  _nyRecalc();
  _nySave();
}

// ===== キーボードナビ（Tab/Enter/矢印） =====
function _nyKeyNav(e, input) {
  const col  = parseInt(input.dataset.col);
  const accId = input.dataset.accId;
  let nextAccId = accId;
  let nextCol   = col;

  if (e.key === 'Tab' || e.key === 'Enter') {
    e.preventDefault();
    nextCol = e.shiftKey ? col - 1 : col + 1;
    if (nextCol < 0) { nextCol = 11; nextAccId = _nyPrevInputAccId(accId); }
    else if (nextCol > 11) { nextCol = 0; nextAccId = _nyNextInputAccId(accId); }
  } else if (e.key === 'ArrowRight') { nextCol = Math.min(col + 1, 11); }
  else if (e.key === 'ArrowLeft')  { nextCol = Math.max(col - 1, 0); }
  else if (e.key === 'ArrowDown')  { nextAccId = _nyNextInputAccId(accId); }
  else if (e.key === 'ArrowUp')    { nextAccId = _nyPrevInputAccId(accId); }
  else return;

  const next = document.querySelector(`.ny-cell[data-acc-id="${nextAccId}"][data-col="${nextCol}"]`);
  if (next) { next.focus(); next.select(); }
}

function _nyNextInputAccId(accId) {
  if (!_nyData?.accounts) return accId;
  const inputs = _nyData.accounts.filter(a => a.type === 'input');
  const idx = inputs.findIndex(a => a.id === accId);
  return idx < inputs.length - 1 ? inputs[idx + 1].id : accId;
}

function _nyPrevInputAccId(accId) {
  if (!_nyData?.accounts) return accId;
  const inputs = _nyData.accounts.filter(a => a.type === 'input');
  const idx = inputs.findIndex(a => a.id === accId);
  return idx > 0 ? inputs[idx - 1].id : accId;
}

// ===== 再計算（入力行→合計列、計算行→calcAllValuesDynamicで自動算出） =====
function _nyRecalc() {
  if (!_nyData?.accounts || !_nyData.rows) return;

  const fakeBudget = {
    dynamicAccounts: _nyData.accounts,
    rows: _nyData.rows,
    startMonth: _nyData.startMonth || 4,
    actualRows: {},
    actualCols: new Array(12).fill(false),
  };
  let allVals = {};
  try { allVals = calcAllValuesDynamic(fakeBudget); } catch {}

  _nyData.accounts.forEach(acc => {
    if (acc.type === 'separator') return;

    const isAutoCalc = acc.type === 'calculated' || acc.type === 'parent' || acc.type === 'section';

    if (isAutoCalc) {
      const vals = allVals[acc.id] || new Array(13).fill(0);
      _nyData.rows[acc.id] = Array.from({length: 13}, (_, i) => vals[i] || 0);
      for (let ci = 0; ci < 13; ci++) {
        const inp = document.querySelector(`.ny-cell[data-acc-id="${acc.id}"][data-col="${ci}"]`);
        if (inp) inp.value = vals[ci] ? Math.round(vals[ci]).toLocaleString() : '';
      }
    }

    const stored = _nyData.rows[acc.id] || [];
    const total = stored.reduce((s, v) => s + (v || 0), 0);
    const td = document.querySelector(`[data-ny-total="${acc.id}"]`);
    if (td) td.textContent = total ? Math.round(total).toLocaleString() : '';
  });
}

// ===== 右クリックコンテキストメニュー（横引き） =====
function _nyContextMenu(e, input) {
  e.preventDefault();
  document.getElementById('_nyCtxMenu')?.remove();

  const accId = input.dataset.accId;
  const raw = input.value.replace(/,/g, '');
  const v = parseFloat(raw) || 0;

  const menu = document.createElement('div');
  menu.id = '_nyCtxMenu';
  menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;background:#fff;border:1px solid var(--border);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:9999;min-width:200px;padding:4px 0;font-size:13px`;

  const items = [
    { label: `全月に「${v ? Math.round(v).toLocaleString() : '0'}」を入力`, fn: () => _nyFillAll(accId, v) },
    { label: '全月をクリア', fn: () => _nyFillAll(accId, 0) },
  ];

  items.forEach(({ label, fn }) => {
    const li = document.createElement('div');
    li.textContent = label;
    li.style.cssText = 'padding:8px 14px;cursor:pointer;color:var(--text)';
    li.onmouseenter = () => li.style.background = 'var(--blue-50)';
    li.onmouseleave = () => li.style.background = '';
    li.onclick = () => { menu.remove(); fn(); };
    menu.appendChild(li);
  });

  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
}

function _nyFillAll(accId, v) {
  if (!_nyData) return;
  if (!_nyData.rows[accId]) _nyData.rows[accId] = new Array(13).fill(0);
  for (let ci = 0; ci < 12; ci++) {
    _nyData.rows[accId][ci] = v;
    const inp = document.querySelector(`.ny-cell[data-acc-id="${accId}"][data-col="${ci}"]`);
    if (inp) inp.value = v ? Math.round(v).toLocaleString() : '';
  }
  _nyRecalc();
  _nySave();
}

// ===== 全クリア =====
function _nyClear() {
  if (!confirm('翌期の入力内容をすべてクリアしますか？')) return;
  if (_nyData) _nyData.rows = {};
  document.querySelectorAll('.ny-cell').forEach(inp => inp.value = '');
  _nyRecalc();
  _nySave();
  showToast('クリアしました', 'info', 2000);
}
