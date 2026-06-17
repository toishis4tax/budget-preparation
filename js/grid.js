// Excelライク入力グリッド

const safeRound = v => (isNaN(v) || !isFinite(v)) ? 0 : Math.round(v);

let _copyBuffer    = null;
let _selectedCell  = null;
let _selectedRows  = new Set();   // 選択中の行 (accId)
let _selAnchor     = null;        // Shift選択のアンカー行 (accId)
let _collapsedParents = new Set(); // 折りたたみ中の親 (accId)
let _gridMode      = 'pl';        // 'pl' | 'bs'

// ===== モード切替 =====
function setGridMode(mode) {
  _gridMode = mode;
  document.querySelectorAll('.grid-mode-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.mode === mode)
  );
  _selectedRows.clear();
  const budget = window.App?.currentBudget;
  if (!budget) return;
  const allVals = budget.dynamicAccounts ? calcAllValuesDynamic(budget) : calcAllValues(getMergedRows(budget));
  renderGridRows(budget, allVals, getMonthLabels(budget.startMonth || 4));
}

// ===== 実績/予算データ統合 =====
// actualColsで「実」の月はactualRows、「予」の月はrowsの値を使う
function getMergedRows(budget) {
  const cols = getActualCols(budget);
  const base = budget.rows || {};
  const actual = budget.actualRows || {};
  const merged = {};
  const allIds = new Set([...Object.keys(base), ...Object.keys(actual)]);
  allIds.forEach(id => {
    merged[id] = Array.from({length: 13}, (_, i) => {
      if (i >= 12) return (base[id]?.[i] || 0); // 調整列は予算のまま
      return cols[i] ? (actual[id]?.[i] || 0) : (base[id]?.[i] || 0);
    });
  });
  return merged;
}

// ===== 実績/予算トグル =====
function getActualCols(budget) {
  // 新形式: budget.actualCols = [bool x 12]
  if (budget.actualCols) return budget.actualCols;
  // 旧形式 actualThrough から移行
  const at = budget.actualThrough ?? -1;
  return Array.from({length: 12}, (_, i) => i <= at);
}

function toggleActualCol(colIdx) {
  const budget = window.App?.currentBudget;
  if (!budget) return;
  const cols = getActualCols(budget);
  cols[colIdx] = !cols[colIdx];
  budget.actualCols = cols;
  saveBudget(budget);
  _applyActualStyles(cols);
}

function _applyActualStyles(cols) {
  // ヘッダーバッジ更新
  document.querySelectorAll('#budget_grid thead th.month-col[data-col]').forEach(th => {
    const i = parseInt(th.dataset.col);
    if (i < 0 || i >= 12) return;
    const isActual = cols[i];
    th.classList.toggle('actual-hdr', isActual);
    th.classList.toggle('budget-hdr', !isActual);
    const badge = th.querySelector('.act-badge');
    if (badge) {
      badge.textContent = isActual ? '実' : '予';
      badge.className = 'act-badge ' + (isActual ? 'act-actual' : 'act-budget');
    }
  });
  // セル背景更新
  document.querySelectorAll('#grid_tbody .val-cell[data-col]').forEach(td => {
    const col = parseInt(td.dataset.col);
    if (col < 0 || col >= 12) return;
    td.classList.toggle('actual-col', !!cols[col]);
    const inp = td.querySelector('.cell-input');
    if (inp) inp.classList.toggle('actual-input', !!cols[col]);
  });
}

// ===== 折りたたみ =====
function toggleCollapse(parentId, e) {
  e?.stopPropagation();
  if (_collapsedParents.has(parentId)) _collapsedParents.delete(parentId);
  else _collapsedParents.add(parentId);

  const budget = window.App?.currentBudget;
  if (!budget) return;
  const allVals = budget.dynamicAccounts ? calcAllValuesDynamic(budget) : calcAllValues(getMergedRows(budget));
  renderGridRows(budget, allVals, getMonthLabels(budget.startMonth || 4));
}

function isHiddenByCollapse(acc, accounts) {
  if (!acc.parentId) return false;
  if (_collapsedParents.has(acc.parentId)) return true;
  const parent = accounts.find(a => a.id === acc.parentId);
  return parent ? isHiddenByCollapse(parent, accounts) : false;
}

// ===== 行選択 =====
let _lastSelectedAccId = null;

function toggleRowSelect(accId, e) {
  e?.stopPropagation();

  if (e?.shiftKey && _lastSelectedAccId && _lastSelectedAccId !== accId) {
    // Shift+クリック: 前回〜今回の範囲を一括選択
    const rows = Array.from(document.querySelectorAll('#grid_tbody tr[data-acc-id]'));
    const ids  = rows.map(tr => tr.dataset.accId);
    const a = ids.indexOf(_lastSelectedAccId);
    const b = ids.indexOf(accId);
    const [lo, hi] = a < b ? [a, b] : [b, a];
    ids.slice(lo, hi + 1).forEach(id => {
      // 入力行のみ選択（calc/header行はスキップ）
      const tr = document.querySelector(`#grid_tbody tr[data-acc-id="${id}"]`);
      if (tr && tr.classList.contains('input-row')) {
        _selectedRows.add(id);
        tr.classList.add('selected-row');
      }
    });
  } else {
    // 通常クリック: トグル
    if (_selectedRows.has(accId)) _selectedRows.delete(accId);
    else _selectedRows.add(accId);
    document.querySelectorAll(`#grid_tbody tr[data-acc-id="${accId}"]`).forEach(tr =>
      tr.classList.toggle('selected-row', _selectedRows.has(accId))
    );
  }

  _lastSelectedAccId = accId;
  updateFillHint();
}

// ===== 表示対象科目フィルタ =====
function getAccountsForMode(budget) {
  const all = budget.dynamicAccounts || ACCOUNTS;
  if (!budget.dynamicAccounts) return all;
  if (_gridMode === 'pl') return all.filter(a => !a.section || a.section === 'pl');
  if (_gridMode === 'bs') return all.filter(a => a.section?.startsWith('bs'));
  return all;
}

// ===== グリッド描画 =====
function renderGrid(container, budget) {
  if (!budget) {
    container.innerHTML = '<div class="no-data">会社と年度を選択してください。</div>';
    return;
  }

  const months = getMonthLabels(budget.startMonth || 4);
  const allVals = budget.dynamicAccounts ? calcAllValuesDynamic(budget) : calcAllValues(getMergedRows(budget));
  const actualCols = getActualCols(budget);
  const hasDynamic = !!(budget.dynamicAccounts?.length);

  // PL/BSタブ（動的インポート時のみ）
  const modeTabs = hasDynamic ? `
    <div class="grid-mode-tabs">
      <button class="grid-mode-tab${_gridMode==='pl'?' active':''}" data-mode="pl" onclick="setGridMode('pl')">📊 損益計算書</button>
      <button class="grid-mode-tab${_gridMode==='bs'?' active':''}" data-mode="bs" onclick="setGridMode('bs')">🏦 貸借対照表</button>
    </div>` : '';

  let html = `
    <div class="grid-toolbar">
      <div class="toolbar-left">
        <button class="btn btn-sm" onclick="addSubAccount()">＋補助科目追加</button>
        <button class="btn btn-sm" onclick="deleteSelectedRow()">行削除</button>
        <button class="btn btn-sm" onclick="clearRowSelection()" title="選択解除">✕ 選択解除</button>
        <span class="sep">|</span>
        <select id="fill_type" class="toolbar-select">
          <option value="copy">横引きコピー（選択値）</option>
          <option value="prev_month_pct">前月比 ＋%</option>
          <option value="prev_year_pct">前年比 ＋%</option>
          <option value="fixed">毎月一定額</option>
          <option value="bulk_delta">一括増減</option>
        </select>
        <input type="number" id="fill_value" value="0" step="0.1" class="toolbar-input" placeholder="値 or %">
        <button class="btn btn-sm btn-accent" onclick="applyFill()" title="選択行すべてに適用">適用</button>
        <span class="toolbar-hint" id="fill_hint"></span>
      </div>
      <div class="toolbar-right">
        <button class="btn-solid btn-sm" onclick="showBudgetCompleteModal()" style="gap:5px">✅ 入力完了 →</button>
        <button class="btn btn-sm" onclick="exportCSV(window.App?.currentBudget)">CSV出力</button>
        <button class="btn btn-sm" onclick="exportExcel(window.App?.currentBudget)">Excel出力</button>
        <button class="btn btn-sm" onclick="printBudget()">印刷</button>
      </div>
    </div>
    ${modeTabs}
    <div class="grid-wrap" id="grid_wrap">
      <table class="budget-grid" id="budget_grid" cellspacing="0">
        <thead>
          <tr>
            <th class="acc-col sticky-col" style="font-size:10px;color:var(--text-muted);font-weight:400;padding:0 6px">科目名クリックで行選択</th>
            ${months.map((m,i) => {
              const isA = actualCols[i];
              return `<th class="month-col${isA?' actual-hdr':' budget-hdr'}" data-col="${i}" onclick="toggleActualCol(${i})" style="cursor:pointer" title="クリックで実績/予算を切替">
                <div style="display:flex;flex-direction:column;align-items:center;gap:2px;line-height:1.2">
                  <span>${m}</span>
                  <span class="act-badge ${isA?'act-actual':'act-budget'}">${isA?'実':'予'}</span>
                </div>
              </th>`;
            }).join('')}
            <th class="month-col adj-col" data-col="12">調整</th>
            <th class="total-col">合計</th>
          </tr>
        </thead>
        <tbody id="grid_tbody"></tbody>
      </table>
    </div>`;

  container.innerHTML = html;
  renderGridRows(budget, allVals, months);
  attachGridEvents();
}

function renderGridRows(budget, allVals, months) {
  const tbody = document.getElementById('grid_tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const actualCols = getActualCols(budget);
  const accounts = getAccountsForMode(budget);
  // 子供を持つ親のSet
  const parentIds = new Set(accounts.filter(a => a.parentId).map(a => a.parentId));

  accounts.forEach((acc, accIdx) => {
    if (acc.type === 'separator') {
      const tr = document.createElement('tr');
      tr.className = 'sep-row';
      tr.innerHTML = `<td colspan="15" class="sep-cell"></td>`;
      tbody.appendChild(tr);
      return;
    }

    // 折りたたみで非表示
    if (isHiddenByCollapse(acc, accounts)) return;

    const isInput   = acc.type === 'input';
    const isCalc    = acc.type === 'calculated';
    const isHeader  = acc.type === 'header' || acc.type === 'parent';
    const isSection = acc.type === 'section';
    const hasKids   = parentIds.has(acc.id);
    const isCollapsed = _collapsedParents.has(acc.id);

    const vals  = allVals[acc.id] || new Array(13).fill(0);
    const total = vals.reduce((a,b)=>a+b,0);

    const tr = document.createElement('tr');
    tr.dataset.accId  = acc.id;
    tr.dataset.accIdx = accIdx;
    tr.className = [
      isCalc    ? 'calc-row'   : '',
      (isHeader || isSection) ? 'header-row' : '',
      isSection    ? 'section-row'  : '',
      acc.bold     ? 'bold-row'    : '',
      isInput      ? 'input-row'   : '',
      acc.tentative? 'tentative-row':'',
      _selectedRows.has(acc.id) ? 'selected-row' : '',
    ].filter(Boolean).join(' ');

    // 科目名セル
    const indent = '　'.repeat(acc.indent || 0);
    const collapseBtn = hasKids
      ? `<button class="collapse-btn" onclick="toggleCollapse('${acc.id}',event)" title="${isCollapsed?'展開':'折りたたむ'}">${isCollapsed?'▶':'▼'}</button>`
      : '<span class="collapse-spacer"></span>';

    let nameCell;
    if (isInput) {
      nameCell = `<td class="acc-col sticky-col acc-name" onclick="toggleRowSelect('${acc.id}',event)">
        ${collapseBtn}<span class="indent">${indent}</span>
        <span class="acc-label" ondblclick="editAccName(this,'${acc.id}')">${escHtml(acc.name)}</span>
      </td>`;
    } else {
      nameCell = `<td class="acc-col sticky-col acc-name ${isCalc?'calculated':acc.type}-label" onclick="toggleRowSelect('${acc.id}',event)">
        ${collapseBtn}<span class="indent">${indent}</span>${escHtml(acc.name)}
      </td>`;
    }

    const nonInputCell = (v, colIdx) => {
      const isAdj = colIdx === 12;
      return `<td class="val-cell calc-val${actualCols[colIdx]?' actual-col':''}${isAdj?' adj-col':''}" data-col="${colIdx}" style="text-align:right">${v === 0 ? '–' : safeRound(v).toLocaleString()}</td>`;
    };

    const isTaxRow = /tax|corp|法人税/.test(acc.id) || (acc.name || '').includes('法人税');

    // Build month cells (indices 0-11)
    const monthVals = vals.slice(0, 12);
    const adjVal = vals[12] || 0;

    const monthCells = isInput
      ? monthVals.map((v, colIdx) => `
          <td class="val-cell${actualCols[colIdx]?' actual-col':''}" data-acc-id="${acc.id}" data-col="${colIdx}">
            <input type="text"
              class="cell-input${actualCols[colIdx]?' actual-input':''}"
              value="${v === 0 ? '' : safeRound(v).toLocaleString()}"
              data-acc-id="${acc.id}"
              data-col="${colIdx}"
              data-raw="${v}"
              autocomplete="off"
              inputmode="numeric">
          </td>`).join('')
      : monthVals.map((v, i) => nonInputCell(v, i)).join('');

    // Adjustment cell (col 12)
    let adjCell;
    if (isTaxRow) {
      adjCell = `<td class="val-cell adj-col" data-acc-id="${acc.id}" data-col="12"><a class="adj-tax-link" onclick="showPage('tax')">→法人税</a></td>`;
    } else if (isInput) {
      adjCell = `<td class="val-cell adj-col" data-acc-id="${acc.id}" data-col="12">
        <input type="text"
          class="cell-input adj-input"
          value="${adjVal === 0 ? '' : Math.round(adjVal).toLocaleString()}"
          data-acc-id="${acc.id}"
          data-col="12"
          data-raw="${adjVal}"
          autocomplete="off"
          inputmode="numeric">
      </td>`;
    } else {
      adjCell = nonInputCell(adjVal, 12);
    }

    tr.innerHTML = nameCell + monthCells + adjCell +
      `<td class="total-col calc-val" style="text-align:right">${total === 0 ? (isInput?'':'–') : Math.round(total).toLocaleString()}</td>`;
    tbody.appendChild(tr);
  });

  // 選択行ヒント更新
  updateFillHint();
}

function updateFillHint() {
  const hint = document.getElementById('fill_hint');
  if (!hint) return;
  hint.textContent = _selectedRows.size > 0 ? `${_selectedRows.size}行選択中` : '';
}

function refreshCalcRows() {
  const budget = window.App?.currentBudget;
  if (!budget) return;
  const allVals = budget.dynamicAccounts ? calcAllValuesDynamic(budget) : calcAllValues(getMergedRows(budget));

  document.querySelectorAll('#grid_tbody tr.calc-row, #grid_tbody tr.header-row').forEach(tr => {
    const accId = tr.dataset.accId;
    if (!accId) return;
    const vals = allVals[accId] || new Array(13).fill(0);
    const cells = tr.querySelectorAll('td.val-cell');
    cells.forEach((td, i) => { td.textContent = vals[i] === 0 ? '–' : Math.round(vals[i]).toLocaleString(); });
    const totalTd = tr.querySelector('td.total-col');
    if (totalTd) {
      const total = vals.reduce((a,b)=>a+b,0);
      totalTd.textContent = total === 0 ? '–' : Math.round(total).toLocaleString();
    }
  });

  document.querySelectorAll('#grid_tbody tr.input-row').forEach(tr => {
    const accId = tr.dataset.accId;
    if (!accId) return;
    const vals = budget.rows[accId] || new Array(13).fill(0);
    const total = vals.reduce((a,b)=>a+b,0);
    const totalTd = tr.querySelector('td.total-col');
    if (totalTd) totalTd.textContent = total === 0 ? '' : Math.round(total).toLocaleString();
  });
}

function attachGridEvents() {
  const tbody = document.getElementById('grid_tbody');
  if (!tbody) return;

  tbody.addEventListener('focusin', e => {
    const input = e.target.closest('.cell-input');
    if (!input) return;
    _selectedCell = input;
    _selAnchor = input.dataset.accId; // Shift選択のアンカーをリセット
    input.parentElement.classList.add('selected');
    input.select();
  });

  tbody.addEventListener('focusout', e => {
    const input = e.target.closest('.cell-input');
    if (!input) return;
    input.parentElement.classList.remove('selected');
    commitCell(input);
  });

  tbody.addEventListener('keydown', e => {
    const input = e.target.closest('.cell-input');
    if (!input) return;
    handleGridKeydown(e, input);
  });

  tbody.addEventListener('input', e => {
    const input = e.target.closest('.cell-input');
    if (!input) return;
    const raw = input.value.replace(/[^\d.-]/g, '');
    if (raw !== input.value) input.value = raw;
  });

  tbody.addEventListener('contextmenu', e => {
    e.preventDefault();
    const input = e.target.closest('.cell-input');
    showContextMenu(e.clientX, e.clientY, input);
  });

  document.addEventListener('paste', handlePaste);
  document.addEventListener('copy', handleCopy);
}

function handleGridKeydown(e, input) {
  const accId = input.dataset.accId;
  const col   = parseInt(input.dataset.col);

  switch (e.key) {
    case 'Tab': {
      e.preventDefault();
      commitCell(input);
      const nextCol = e.shiftKey ? col - 1 : col + 1;
      if (nextCol >= 0 && nextCol <= 12) {
        focusCell(accId, nextCol);
      } else {
        const nextRow = nextInputRow(accId, e.shiftKey ? -1 : 1);
        if (nextRow) focusCell(nextRow, e.shiftKey ? 12 : 0);
      }
      break;
    }
    case 'Enter': {
      e.preventDefault();
      commitCell(input);
      const nextRow = nextInputRow(accId, e.shiftKey ? -1 : 1);
      if (nextRow) focusCell(nextRow, col);
      break;
    }
    case 'ArrowRight': {
      if (input.selectionStart === input.value.length) {
        e.preventDefault(); commitCell(input);
        if (col < 12) focusCell(accId, col + 1);
      }
      break;
    }
    case 'ArrowLeft': {
      if (input.selectionStart === 0) {
        e.preventDefault(); commitCell(input);
        if (col > 0) focusCell(accId, col - 1);
      }
      break;
    }
    case 'ArrowDown': {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+↓: アンカーから下に範囲選択拡張
        _extendRowSelection(accId, 1);
      } else {
        commitCell(input);
        _selectedRows.clear();
        document.querySelectorAll('#grid_tbody tr.selected-row').forEach(tr => tr.classList.remove('selected-row'));
        const nr = nextInputRow(accId, 1);
        if (nr) focusCell(nr, col);
      }
      break;
    }
    case 'ArrowUp': {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+↑: アンカーから上に範囲選択拡張
        _extendRowSelection(accId, -1);
      } else {
        commitCell(input);
        _selectedRows.clear();
        document.querySelectorAll('#grid_tbody tr.selected-row').forEach(tr => tr.classList.remove('selected-row'));
        const pr = nextInputRow(accId, -1);
        if (pr) focusCell(pr, col);
      }
      break;
    }
  }
}

function _extendRowSelection(currentAccId, dir) {
  // アンカーが未設定なら現在行をアンカーにする
  if (!_selAnchor) _selAnchor = currentAccId;

  const rows = Array.from(document.querySelectorAll('#grid_tbody tr[data-acc-id].input-row'));
  const ids  = rows.map(tr => tr.dataset.accId);
  const anchorIdx  = ids.indexOf(_selAnchor);
  const currentIdx = ids.indexOf(currentAccId);
  const nextIdx    = currentIdx + dir;
  if (nextIdx < 0 || nextIdx >= ids.length) return;

  const nextAccId = ids[nextIdx];

  // アンカー〜nextの範囲を選択
  const lo = Math.min(anchorIdx, nextIdx);
  const hi = Math.max(anchorIdx, nextIdx);
  _selectedRows.clear();
  document.querySelectorAll('#grid_tbody tr.selected-row').forEach(tr => tr.classList.remove('selected-row'));
  for (let i = lo; i <= hi; i++) {
    _selectedRows.add(ids[i]);
    document.querySelectorAll(`#grid_tbody tr[data-acc-id="${ids[i]}"]`).forEach(tr => tr.classList.add('selected-row'));
  }

  // フォーカスを次の行に移動（セルは編集しない）
  const nextInput = document.querySelector(`#grid_tbody input[data-acc-id="${nextAccId}"][data-col="${_selectedCell ? parseInt(_selectedCell.dataset.col) : 0}"]`);
  if (nextInput) {
    nextInput.focus();
    nextInput.select();
  }

  updateSelectionHint();
}

function commitCell(input) {
  const accId = input.dataset.accId;
  const col   = parseInt(input.dataset.col);
  const raw   = parseFloat(input.value.replace(/,/g, '')) || 0;
  input.dataset.raw = raw;

  const budget = window.App?.currentBudget;
  if (!budget) return;

  const cols = getActualCols(budget);
  const isActualCol = col < 12 && cols[col];
  const store = isActualCol ? 'actualRows' : 'rows';
  if (!budget[store]) budget[store] = {};
  if (!budget[store][accId]) budget[store][accId] = new Array(13).fill(0);
  if (budget[store][accId].length < 13) budget[store][accId].push(0);
  budget[store][accId][col] = raw;

  input.value = raw === 0 ? '' : safeRound(raw).toLocaleString();
  saveBudget(budget);
  refreshCalcRows();
}

function focusCell(accId, col) {
  const input = document.querySelector(`.cell-input[data-acc-id="${accId}"][data-col="${col}"]`);
  if (input) { input.focus(); input.select(); }
}

function nextInputRow(currentAccId, direction) {
  const budget = window.App?.currentBudget;
  const accounts = getAccountsForMode(budget || {});
  const inputAccs = accounts.filter(a => a.type === 'input' && !isHiddenByCollapse(a, accounts));
  const idx = inputAccs.findIndex(a => a.id === currentAccId);
  if (idx < 0) return null;
  const next = inputAccs[idx + direction];
  return next ? next.id : null;
}

// ===== コピー/ペースト =====
function handleCopy(e) {
  const input = document.activeElement?.closest?.('.cell-input');
  if (!input) return;
  const accId = input.dataset.accId;
  const col   = parseInt(input.dataset.col);
  const budget = window.App?.currentBudget;
  if (!budget) return;
  const vals = budget.rows[accId] || new Array(12).fill(0);
  _copyBuffer = { rows: [[vals[col]]], startRow: accId, startCol: col };
}

function handlePaste(e) {
  const input = document.activeElement?.closest?.('.cell-input');
  if (!input) return;
  e.preventDefault();

  const text = (e.clipboardData || window.clipboardData).getData('text');
  if (!text) return;

  const pasteRows = text.trim().split(/\r?\n/).map(line =>
    line.split('\t').map(v => parseFloat(v.replace(/,/g,'')) || 0)
  );

  const budget = window.App?.currentBudget;
  if (!budget) return;

  const startAccId = input.dataset.accId;
  const startCol   = parseInt(input.dataset.col);
  const accounts   = getAccountsForMode(budget);
  const inputAccs  = accounts.filter(a => a.type === 'input');
  const startIdx   = inputAccs.findIndex(a => a.id === startAccId);

  pasteRows.forEach((row, ri) => {
    const acc = inputAccs[startIdx + ri];
    if (!acc) return;
    if (!budget.rows[acc.id]) budget.rows[acc.id] = new Array(12).fill(0);
    row.forEach((val, ci) => {
      const col = startCol + ci;
      if (col < 12) budget.rows[acc.id][col] = val;
    });
  });

  saveBudget(budget);
  const container = document.getElementById('main_content');
  if (container) renderGrid(container, budget);
}

// ===== 横引き一括適用 =====
// 選択行がある場合は全選択行に適用、なければ現在のセルの行のみ
function applyFill() {
  const type  = document.getElementById('fill_type')?.value;
  const value = parseFloat(document.getElementById('fill_value')?.value || 0);
  const input = document.querySelector('#grid_tbody .cell-input:focus') || _selectedCell;
  const budget = window.App?.currentBudget;
  if (!budget) return;

  // 適用対象のaccIdリストを決定
  let targetIds = [];
  if (_selectedRows.size > 0) {
    targetIds = [..._selectedRows];
  } else if (input) {
    targetIds = [input.dataset.accId];
  } else {
    alert('適用するセルまたは行を選択してください');
    return;
  }

  const startCol = input ? parseInt(input.dataset.col) : 0;

  targetIds.forEach(accId => {
    if (!budget.rows[accId]) budget.rows[accId] = new Array(12).fill(0);
    const vals = budget.rows[accId];
    switch (type) {
      case 'copy':
        for (let i = startCol; i < 12; i++) vals[i] = vals[startCol];
        break;
      case 'prev_month_pct':
        for (let i = startCol + 1; i < 12; i++)
          vals[i] = Math.round(vals[i-1] * (1 + value / 100));
        break;
      case 'prev_year_pct':
        for (let i = startCol; i < 12; i++)
          vals[i] = Math.round(vals[i] * (1 + value / 100));
        break;
      case 'fixed':
        for (let i = startCol; i < 12; i++) vals[i] = value;
        break;
      case 'bulk_delta':
        for (let i = startCol; i < 12; i++) vals[i] += value;
        break;
    }

    // 該当行のinputを更新
    const tr = document.querySelector(`#grid_tbody tr[data-acc-id="${accId}"]`);
    if (tr) {
      tr.querySelectorAll('.cell-input').forEach((inp, i) => {
        const v = vals[i] || 0;
        inp.value = v === 0 ? '' : safeRound(v).toLocaleString();
        inp.dataset.raw = v;
      });
      const totalTd = tr.querySelector('td.total-col');
      if (totalTd) {
        const total = vals.reduce((a,b)=>a+b,0);
        totalTd.textContent = total === 0 ? '' : Math.round(total).toLocaleString();
      }
    }
  });

  saveBudget(budget);
  refreshCalcRows();
}

// ===== 科目名編集 =====
function editAccName(span, accId) {
  const budget = window.App?.currentBudget;
  const accounts = budget?.dynamicAccounts || ACCOUNTS;
  const acc = accounts.find(a => a.id === accId);
  if (!acc) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = acc.name;
  input.className = 'acc-name-edit';
  span.replaceWith(input);
  input.focus();
  input.select();
  const finish = () => {
    acc.name = input.value || acc.name;
    if (budget) saveBudget(budget);
    const newSpan = document.createElement('span');
    newSpan.className = 'acc-label';
    newSpan.textContent = acc.name;
    newSpan.setAttribute('ondblclick', `editAccName(this,'${accId}')`);
    input.replaceWith(newSpan);
  };
  input.addEventListener('blur', finish);
  input.addEventListener('keydown', e => { if (e.key==='Enter') finish(); });
}

// ===== 補助科目追加 =====
function addSubAccount() {
  const input = document.querySelector('#grid_tbody .cell-input:focus') || _selectedCell;
  const currentAccId = input?.dataset.accId;
  const budget = window.App?.currentBudget;
  const accounts = budget?.dynamicAccounts || ACCOUNTS;
  const currentAcc = currentAccId ? accounts.find(a => a.id === currentAccId) : null;

  const name = prompt('補助科目名を入力してください:');
  if (!name) return;

  const parentId = currentAcc?.parentId || currentAccId || null;
  const parent   = parentId ? accounts.find(a => a.id === parentId) : null;
  const indent   = parent ? parent.indent + 1 : (currentAcc?.indent || 1);

  const newAcc = {
    id:      'custom_' + generateId(),
    name,
    type:    'input',
    indent,
    parentId,
    section: currentAcc?.section || 'pl',
    sign:    currentAcc?.sign || 1,
    custom:  true,
  };

  const idx = currentAccId ? accounts.findIndex(a => a.id === currentAccId) : accounts.length;
  accounts.splice(idx + 1, 0, newAcc);

  if (budget) {
    budget.rows[newAcc.id] = new Array(12).fill(0);
    saveBudget(budget);
    renderGrid(document.getElementById('main_content'), budget);
  }
}

// ===== 入力完了モーダル =====
function showBudgetCompleteModal() {
  const budget = window.App?.currentBudget;
  if (!budget) return;

  const merged = getMergedRows(budget);
  const pl = calcPL(merged);
  const fmtK = v => Math.round((isNaN(v)||!isFinite(v)?0:v) / 1000).toLocaleString();
  const pct  = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '–';

  const sales     = pl.sales?.reduce((s,v)=>s+v,0) || 0;
  const gross     = pl.gross_profit?.reduce((s,v)=>s+v,0) || 0;
  const op        = pl.op_profit?.reduce((s,v)=>s+v,0) || 0;
  const net       = pl.net_profit?.reduce((s,v)=>s+v,0) || 0;

  const kpiColor = v => v >= 0 ? '#065f46' : '#dc2626';

  // モーダルを動的生成
  let modal = document.getElementById('budget_complete_modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'budget_complete_modal';
    modal.className = 'modal';
    modal.onclick = e => { if (e.target === modal) modal.classList.remove('open'); };
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-box" style="width:480px;max-width:95vw">
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:40px;margin-bottom:8px">✅</div>
        <h2 style="font-size:20px;margin:0">予算入力完了！</h2>
        <p style="font-size:12px;color:var(--text-muted);margin-top:4px">${window.App?.currentYear || ''}年度　${window.App?.currentCompany?.name || ''}</p>
      </div>

      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:14px 16px;margin-bottom:20px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <div style="font-size:10px;color:#6b7280;font-weight:600;margin-bottom:2px">売上高</div>
            <div style="font-size:18px;font-weight:800;color:#0f172a">${fmtK(sales)}<span style="font-size:11px;font-weight:400">千円</span></div>
          </div>
          <div>
            <div style="font-size:10px;color:#6b7280;font-weight:600;margin-bottom:2px">粗利益</div>
            <div style="font-size:18px;font-weight:800;color:${kpiColor(gross)}">${fmtK(gross)}<span style="font-size:11px;font-weight:400">千円</span></div>
            <div style="font-size:10px;color:#6b7280">${pct(gross, sales)}</div>
          </div>
          <div>
            <div style="font-size:10px;color:#6b7280;font-weight:600;margin-bottom:2px">営業利益</div>
            <div style="font-size:18px;font-weight:800;color:${kpiColor(op)}">${fmtK(op)}<span style="font-size:11px;font-weight:400">千円</span></div>
            <div style="font-size:10px;color:#6b7280">${pct(op, sales)}</div>
          </div>
          <div>
            <div style="font-size:10px;color:#6b7280;font-weight:600;margin-bottom:2px">当期純利益</div>
            <div style="font-size:18px;font-weight:800;color:${kpiColor(net)}">${fmtK(net)}<span style="font-size:11px;font-weight:400">千円</span></div>
            <div style="font-size:10px;color:#6b7280">${pct(net, sales)}</div>
          </div>
        </div>
      </div>

      <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;text-align:center">次のステップに進みましょう</p>

      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
        <button class="btn-solid" style="justify-content:flex-start;gap:12px;padding:12px 16px"
          onclick="document.getElementById('budget_complete_modal').classList.remove('open');showPage('simulation')">
          <span style="font-size:18px">📊</span>
          <div style="text-align:left">
            <div style="font-weight:700">単年度 PL / BS を確認</div>
            <div style="font-size:11px;opacity:.8">損益・貸借対照表をグラフで確認</div>
          </div>
        </button>
        <button class="btn-outline" style="justify-content:flex-start;gap:12px;padding:12px 16px"
          onclick="document.getElementById('budget_complete_modal').classList.remove('open');showPage('nextyear')">
          <span style="font-size:18px">🔮</span>
          <div style="text-align:left">
            <div style="font-weight:700">翌年度予測</div>
            <div style="font-size:11px;color:var(--text-muted)">成長率を設定して来期を試算</div>
          </div>
        </button>
        <button class="btn-outline" style="justify-content:flex-start;gap:12px;padding:12px 16px"
          onclick="document.getElementById('budget_complete_modal').classList.remove('open');showPage('fiveyear')">
          <span style="font-size:18px">📅</span>
          <div style="text-align:left">
            <div style="font-weight:700">5か年計画</div>
            <div style="font-size:11px;color:var(--text-muted)">中期的な業績推移をシミュレーション</div>
          </div>
        </button>
        <button class="btn-outline" style="justify-content:flex-start;gap:12px;padding:12px 16px"
          onclick="document.getElementById('budget_complete_modal').classList.remove('open');showPage('health')">
          <span style="font-size:18px">💊</span>
          <div style="text-align:left">
            <div style="font-weight:700">財務健康診断</div>
            <div style="font-size:11px;color:var(--text-muted)">財務比率を自動採点・コメント</div>
          </div>
        </button>
      </div>

      <button class="btn-ghost" style="width:100%;justify-content:center"
        onclick="document.getElementById('budget_complete_modal').classList.remove('open')">
        後で確認する
      </button>
    </div>`;

  modal.classList.add('open');
}

// ===== 行削除 =====
function clearRowSelection() {
  _selectedRows.clear();
  _selAnchor = null;
  document.querySelectorAll('#grid_tbody tr.selected-row').forEach(tr => tr.classList.remove('selected-row'));
  updateSelectionHint();
}

function deleteSelectedRow() {
  const input = document.querySelector('#grid_tbody .cell-input:focus') || _selectedCell;
  if (!input) { alert('削除する行のセルを選択してください'); return; }
  const accId = input.dataset.accId;
  const budget = window.App?.currentBudget;
  const accounts = budget?.dynamicAccounts || ACCOUNTS;
  const acc = accounts.find(a => a.id === accId);
  if (!acc?.custom) { alert('デフォルト科目は削除できません'); return; }
  if (!confirm(`「${acc.name}」を削除しますか?`)) return;

  const idx = accounts.findIndex(a => a.id === accId);
  accounts.splice(idx, 1);

  if (budget) {
    delete budget.rows[accId];
    saveBudget(budget);
    renderGrid(document.getElementById('main_content'), budget);
  }
}

// ===== コンテキストメニュー =====
function showContextMenu(x, y, input) {
  document.getElementById('ctx_menu')?.remove();
  const menu = document.createElement('div');
  menu.id = 'ctx_menu';
  menu.className = 'ctx-menu';
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  menu.innerHTML = `
    <div class="ctx-item" onclick="addSubAccount()">補助科目を追加</div>
    <div class="ctx-item" onclick="deleteSelectedRow()">行を削除</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item" onclick="applyFillFromMenu('copy')">右にコピー（横引き）</div>
    <div class="ctx-item" onclick="applyFillFromMenu('fixed')">一定額で全月埋める</div>
  `;
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
}

function applyFillFromMenu(type) {
  document.getElementById('fill_type').value = type;
  applyFill();
}

// escHtml は app.js で定義
