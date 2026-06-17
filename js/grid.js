// Excelライク入力グリッド

let _copyBuffer    = null;
let _selectedCell  = null;
let _selectedRows  = new Set();   // 選択中の行 (accId)
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
  const allVals = budget.dynamicAccounts ? calcAllValuesDynamic(budget) : calcAllValues(budget.rows);
  renderGridRows(budget, allVals, getMonthLabels(budget.startMonth || 4));
}

// ===== 実績確定月 =====
function setActualThrough(val) {
  const budget = window.App?.currentBudget;
  if (!budget) return;
  budget.actualThrough = parseInt(val);
  saveBudget(budget);
  // ヘッダー色を更新（再描画）
  const at = budget.actualThrough ?? -1;
  document.querySelectorAll('#budget_grid thead th.month-col').forEach((th, i) => {
    th.classList.toggle('actual-hdr', i <= at);
    th.classList.toggle('budget-hdr', i > at);
  });
  document.querySelectorAll('#budget_grid thead th.actual-label').forEach(th => th.remove());
  // 入力セルの背景更新
  document.querySelectorAll('#grid_tbody .val-cell').forEach(td => {
    const col = parseInt(td.dataset.col ?? td.querySelector('.cell-input')?.dataset.col ?? -1);
    if (col < 0) return;
    td.classList.toggle('actual-col', col <= at);
  });
}

// ===== 折りたたみ =====
function toggleCollapse(parentId, e) {
  e?.stopPropagation();
  if (_collapsedParents.has(parentId)) _collapsedParents.delete(parentId);
  else _collapsedParents.add(parentId);

  const budget = window.App?.currentBudget;
  if (!budget) return;
  const allVals = budget.dynamicAccounts ? calcAllValuesDynamic(budget) : calcAllValues(budget.rows);
  renderGridRows(budget, allVals, getMonthLabels(budget.startMonth || 4));
}

function isHiddenByCollapse(acc, accounts) {
  if (!acc.parentId) return false;
  if (_collapsedParents.has(acc.parentId)) return true;
  const parent = accounts.find(a => a.id === acc.parentId);
  return parent ? isHiddenByCollapse(parent, accounts) : false;
}

// ===== 行選択 =====
function toggleRowSelect(accId, e) {
  e?.stopPropagation();
  if (_selectedRows.has(accId)) _selectedRows.delete(accId);
  else _selectedRows.add(accId);
  document.querySelectorAll(`#grid_tbody tr[data-acc-id="${accId}"]`).forEach(tr =>
    tr.classList.toggle('selected-row', _selectedRows.has(accId))
  );
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
  const allVals = budget.dynamicAccounts ? calcAllValuesDynamic(budget) : calcAllValues(budget.rows);
  const at = budget.actualThrough ?? -1;
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
        <label class="toolbar-label">実績確定月:</label>
        <select id="actual_through" class="toolbar-select" onchange="setActualThrough(this.value)">
          <option value="-1"${at===-1?' selected':''}>なし</option>
          ${months.map((m,i)=>`<option value="${i}"${at===i?' selected':''}>${m}まで</option>`).join('')}
        </select>
        <span class="sep">|</span>
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
            <th class="acc-col sticky-col">科目</th>
            ${months.map((m,i) => `<th class="month-col${i<=at?' actual-hdr':' budget-hdr'}" data-col="${i}">${m}</th>`).join('')}
            <th class="total-col">合計</th>
          </tr>
          <tr class="actual-label-row">
            <th class="acc-col sticky-col" style="font-size:10px;color:var(--text-muted);font-weight:400;padding:0 6px">科目名クリックで行選択</th>
            ${months.map((_,i) => `<th class="actual-label-cell${i<=at?' actual-hdr':' budget-hdr'}">${i<=at?'実':'予'}</th>`).join('')}
            <th class="total-col" style="background:#d1fae5"></th>
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

  const at = budget.actualThrough ?? -1;
  const accounts = getAccountsForMode(budget);
  // 子供を持つ親のSet
  const parentIds = new Set(accounts.filter(a => a.parentId).map(a => a.parentId));

  accounts.forEach((acc, accIdx) => {
    if (acc.type === 'separator') {
      const tr = document.createElement('tr');
      tr.className = 'sep-row';
      tr.innerHTML = `<td colspan="14" class="sep-cell"></td>`;
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

    const vals  = allVals[acc.id] || new Array(12).fill(0);
    const total = vals.reduce((a,b)=>a+b,0);

    const tr = document.createElement('tr');
    tr.dataset.accId  = acc.id;
    tr.dataset.accIdx = accIdx;
    tr.className = [
      isCalc    ? 'calc-row'   : '',
      (isHeader || isSection) ? 'header-row' : '',
      isSection ? 'section-row': '',
      acc.bold  ? 'bold-row'   : '',
      isInput   ? 'input-row'  : '',
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

    const nonInputCell = (v, colIdx) =>
      `<td class="val-cell calc-val${colIdx<=at?' actual-col':''}" data-col="${colIdx}" style="text-align:right">${v === 0 ? '–' : Math.round(v).toLocaleString()}</td>`;

    const cells = isInput
      ? vals.map((v, colIdx) => `
          <td class="val-cell${colIdx<=at?' actual-col':''}" data-acc-id="${acc.id}" data-col="${colIdx}">
            <input type="text"
              class="cell-input${colIdx<=at?' actual-input':''}"
              value="${v === 0 ? '' : Math.round(v).toLocaleString()}"
              data-acc-id="${acc.id}"
              data-col="${colIdx}"
              data-raw="${v}"
              autocomplete="off"
              inputmode="numeric">
          </td>`).join('')
      : vals.map((v, i) => nonInputCell(v, i)).join('');

    tr.innerHTML = nameCell + cells +
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
  const allVals = budget.dynamicAccounts ? calcAllValuesDynamic(budget) : calcAllValues(budget.rows);

  document.querySelectorAll('#grid_tbody tr.calc-row, #grid_tbody tr.header-row').forEach(tr => {
    const accId = tr.dataset.accId;
    if (!accId) return;
    const vals = allVals[accId] || new Array(12).fill(0);
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
    const vals = budget.rows[accId] || new Array(12).fill(0);
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
      if (nextCol >= 0 && nextCol < 12) {
        focusCell(accId, nextCol);
      } else {
        const nextRow = nextInputRow(accId, e.shiftKey ? -1 : 1);
        if (nextRow) focusCell(nextRow, e.shiftKey ? 11 : 0);
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
        if (col < 11) focusCell(accId, col + 1);
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
      e.preventDefault(); commitCell(input);
      const nr = nextInputRow(accId, 1);
      if (nr) focusCell(nr, col);
      break;
    }
    case 'ArrowUp': {
      e.preventDefault(); commitCell(input);
      const pr = nextInputRow(accId, -1);
      if (pr) focusCell(pr, col);
      break;
    }
  }
}

function commitCell(input) {
  const accId = input.dataset.accId;
  const col   = parseInt(input.dataset.col);
  const raw   = parseFloat(input.value.replace(/,/g, '')) || 0;
  input.dataset.raw = raw;

  const budget = window.App?.currentBudget;
  if (!budget) return;
  if (!budget.rows[accId]) budget.rows[accId] = new Array(12).fill(0);
  budget.rows[accId][col] = raw;

  input.value = raw === 0 ? '' : Math.round(raw).toLocaleString();
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
        inp.value = v === 0 ? '' : Math.round(v).toLocaleString();
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

// ===== 行削除 =====
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
