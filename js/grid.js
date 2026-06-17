// Excelライク入力グリッド

let _copyBuffer = null; // { rows: number[][], startRow, startCol }
let _selectedCell = null;
let _selectionStart = null;
let _selectedRange = null;

function renderGrid(container, budget) {
  if (!budget) {
    container.innerHTML = '<div class="no-data">会社と年度を選択してください。</div>';
    return;
  }

  const months = getMonthLabels(budget.startMonth || 4);
  const allVals = calcAllValues(budget.rows);

  const colCount = 12; // months

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
        <button class="btn btn-sm btn-accent" onclick="applyFill()">適用</button>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-sm" onclick="exportCSV(window.App?.currentBudget)">CSV出力</button>
        <button class="btn btn-sm" onclick="exportExcel(window.App?.currentBudget)">Excel出力</button>
        <button class="btn btn-sm" onclick="printBudget()">印刷</button>
      </div>
    </div>
    <div class="grid-wrap" id="grid_wrap">
      <table class="budget-grid" id="budget_grid" cellspacing="0">
        <thead>
          <tr>
            <th class="acc-col sticky-col">科目</th>
            ${months.map((m,i) => `<th class="month-col" data-col="${i}">${m}</th>`).join('')}
            <th class="total-col">合計</th>
          </tr>
        </thead>
        <tbody id="grid_tbody">
        </tbody>
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

  ACCOUNTS.forEach((acc, accIdx) => {
    if (acc.type === 'separator') {
      const tr = document.createElement('tr');
      tr.className = 'sep-row';
      tr.innerHTML = `<td colspan="14" class="sep-cell"></td>`;
      tbody.appendChild(tr);
      return;
    }

    const isInput = acc.type === 'input';
    const vals = allVals[acc.id] || new Array(12).fill(0);
    const total = vals.reduce((a,b)=>a+b,0);

    const tr = document.createElement('tr');
    tr.dataset.accId = acc.id;
    tr.dataset.accIdx = accIdx;
    tr.className = [
      acc.type === 'calculated' ? 'calc-row' : '',
      acc.type === 'header'     ? 'header-row' : '',
      acc.bold                  ? 'bold-row'   : '',
      isInput                   ? 'input-row'  : '',
    ].filter(Boolean).join(' ');

    const indent = '　'.repeat(acc.indent);
    let nameCell;
    if (isInput) {
      nameCell = `<td class="acc-col sticky-col acc-name" data-acc-id="${acc.id}">
        <span class="indent">${indent}</span>
        <span class="acc-label" ondblclick="editAccName(this,'${acc.id}')">${escHtml(acc.name)}</span>
      </td>`;
    } else {
      nameCell = `<td class="acc-col sticky-col acc-name ${acc.type}-label">
        <span class="indent">${indent}</span>${escHtml(acc.name)}
      </td>`;
    }

    const cells = isInput
      ? vals.map((v, colIdx) => `
          <td class="val-cell" data-acc-id="${acc.id}" data-col="${colIdx}">
            <input type="text"
              class="cell-input"
              value="${v === 0 ? '' : Math.round(v).toLocaleString()}"
              data-acc-id="${acc.id}"
              data-col="${colIdx}"
              data-raw="${v}"
              autocomplete="off"
              inputmode="numeric">
          </td>`).join('')
      : vals.map(v => `<td class="val-cell calc-val">${v === 0 ? '–' : Math.round(v).toLocaleString()}</td>`).join('');

    tr.innerHTML = nameCell + cells +
      `<td class="total-col ${isInput?'':'calc-val'}">${total === 0 ? (isInput?'':'–') : Math.round(total).toLocaleString()}</td>`;
    tbody.appendChild(tr);
  });
}

function refreshCalcRows() {
  const budget = window.App?.currentBudget;
  if (!budget) return;
  const allVals = calcAllValues(budget.rows);

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

  // update totals for input rows
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
    _selectionStart = { accId: input.dataset.accId, col: parseInt(input.dataset.col) };
    _selectedRange = null;
    input.parentElement.classList.add('selected');
    // select all text
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
    // live clean: remove non-numeric except minus, dot
    const raw = input.value.replace(/[^\d.-]/g, '');
    if (raw !== input.value) input.value = raw;
  });

  // right-click context menu
  tbody.addEventListener('contextmenu', e => {
    e.preventDefault();
    const input = e.target.closest('.cell-input');
    showContextMenu(e.clientX, e.clientY, input);
  });

  // paste
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
    case 'Delete':
    case 'Backspace': {
      if (input.value === '') {
        // already empty, allow default
      }
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
  if (input) {
    input.focus();
    input.select();
  }
}

function nextInputRow(currentAccId, direction) {
  const inputAccs = ACCOUNTS.filter(a => a.type === 'input');
  const idx = inputAccs.findIndex(a => a.id === currentAccId);
  if (idx < 0) return null;
  const next = inputAccs[idx + direction];
  return next ? next.id : null;
}

// コピー
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

// ペースト
function handlePaste(e) {
  const input = document.activeElement?.closest?.('.cell-input');
  if (!input) return;
  e.preventDefault();

  const text = (e.clipboardData || window.clipboardData).getData('text');
  if (!text) return;

  const rows = text.trim().split(/\r?\n/).map(line =>
    line.split('\t').map(v => parseFloat(v.replace(/,/g,'')) || 0)
  );

  const budget = window.App?.currentBudget;
  if (!budget) return;

  const startAccId = input.dataset.accId;
  const startCol   = parseInt(input.dataset.col);
  const inputAccs  = ACCOUNTS.filter(a => a.type === 'input');
  const startIdx   = inputAccs.findIndex(a => a.id === startAccId);

  rows.forEach((row, ri) => {
    const acc = inputAccs[startIdx + ri];
    if (!acc) return;
    if (!budget.rows[acc.id]) budget.rows[acc.id] = new Array(12).fill(0);
    row.forEach((val, ci) => {
      const col = startCol + ci;
      if (col < 12) budget.rows[acc.id][col] = val;
    });
  });

  saveBudget(budget);
  // re-render grid
  const container = document.getElementById('main_content');
  if (container) renderGrid(container, budget);
}

// 横引きコピー・一括計算
function applyFill() {
  const type  = document.getElementById('fill_type')?.value;
  const value = parseFloat(document.getElementById('fill_value')?.value || 0);
  const input = document.querySelector('#grid_tbody .cell-input:focus') || _selectedCell;
  if (!input) { alert('適用するセルを選択してください'); return; }

  const accId = input.dataset.accId;
  const col   = parseInt(input.dataset.col);
  const budget = window.App?.currentBudget;
  if (!budget) return;
  if (!budget.rows[accId]) budget.rows[accId] = new Array(12).fill(0);
  const vals = budget.rows[accId];

  switch (type) {
    case 'copy':
      // 選択セルの値を右方向にコピー
      for (let i = col; i < 12; i++) vals[i] = vals[col];
      break;
    case 'prev_month_pct':
      for (let i = col + 1; i < 12; i++)
        vals[i] = Math.round(vals[i-1] * (1 + value / 100));
      break;
    case 'prev_year_pct':
      for (let i = col; i < 12; i++)
        vals[i] = Math.round(vals[i] * (1 + value / 100));
      break;
    case 'fixed':
      for (let i = col; i < 12; i++) vals[i] = value;
      break;
    case 'bulk_delta':
      for (let i = col; i < 12; i++) vals[i] += value;
      break;
  }

  saveBudget(budget);
  const allVals = calcAllValues(budget.rows);

  // refresh this row
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
  refreshCalcRows();
}

// 科目名編集
function editAccName(span, accId) {
  const acc = ACCOUNTS.find(a => a.id === accId);
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
    const newSpan = document.createElement('span');
    newSpan.className = 'acc-label';
    newSpan.textContent = acc.name;
    newSpan.setAttribute('ondblclick', `editAccName(this,'${accId}')`);
    input.replaceWith(newSpan);
  };
  input.addEventListener('blur', finish);
  input.addEventListener('keydown', e => { if (e.key==='Enter') finish(); });
}

// 補助科目追加
function addSubAccount() {
  const input = document.querySelector('#grid_tbody .cell-input:focus') || _selectedCell;
  const currentAccId = input?.dataset.accId;
  const currentAcc = currentAccId ? ACCOUNTS.find(a => a.id === currentAccId) : null;

  const name = prompt('補助科目名を入力してください:');
  if (!name) return;

  const parentId = currentAcc?.parentId || currentAccId || null;
  const parent   = parentId ? ACCOUNTS.find(a => a.id === parentId) : null;
  const indent   = parent ? parent.indent + 1 : (currentAcc?.indent || 1);

  const newAcc = {
    id:       'custom_' + generateId(),
    name,
    type:     'input',
    indent,
    parentId,
    section:  currentAcc?.section || 'pl',
    sign:     currentAcc?.sign || 1,
    custom:   true,
  };

  // 現在の科目の直後に挿入
  const idx = currentAccId ? ACCOUNTS.findIndex(a => a.id === currentAccId) : ACCOUNTS.length;
  ACCOUNTS.splice(idx + 1, 0, newAcc);

  const budget = window.App?.currentBudget;
  if (budget) {
    budget.rows[newAcc.id] = new Array(12).fill(0);
    saveBudget(budget);
    renderGrid(document.getElementById('main_content'), budget);
  }
}

// 行削除
function deleteSelectedRow() {
  const input = document.querySelector('#grid_tbody .cell-input:focus') || _selectedCell;
  if (!input) { alert('削除する行のセルを選択してください'); return; }
  const accId = input.dataset.accId;
  const acc = ACCOUNTS.find(a => a.id === accId);
  if (!acc?.custom) { alert('デフォルト科目は削除できません'); return; }
  if (!confirm(`「${acc.name}」を削除しますか?`)) return;

  const idx = ACCOUNTS.findIndex(a => a.id === accId);
  ACCOUNTS.splice(idx, 1);

  const budget = window.App?.currentBudget;
  if (budget) {
    delete budget.rows[accId];
    saveBudget(budget);
    renderGrid(document.getElementById('main_content'), budget);
  }
}

// コンテキストメニュー
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
    <div class="ctx-item" onclick="applyFillFromMenu('copy')">右にコピー</div>
    <div class="ctx-item" onclick="applyFillFromMenu('fixed')">一定額で埋める</div>
  `;
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
}

function applyFillFromMenu(type) {
  document.getElementById('fill_type').value = type;
  applyFill();
}

// escHtml は app.js で定義
