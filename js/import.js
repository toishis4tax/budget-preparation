// CSV/Excelインポート（ミロク・MoneyForward対応）

// 勘定科目名 → 内部ID マッピング
const ACCOUNT_NAME_MAP = {
  // 売上
  '売上高': 'sales', '売上': 'sales', '総売上': 'sales',
  'EC売上': 'sales_ec', 'ネット売上': 'sales_ec', 'オンライン売上': 'sales_ec',
  '店舗売上': 'sales_store', '小売売上': 'sales_store',
  'その他売上': 'sales_other', '雑収益': 'sales_other',

  // 売上原価
  '売上原価': 'cogs', '商品原価': 'cogs',
  '期首商品棚卸高': 'cogs_open', '期首棚卸高': 'cogs_open',
  '当期仕入高': 'cogs_purchase', '商品仕入高': 'cogs_purchase', '仕入高': 'cogs_purchase', '仕入': 'cogs_purchase',
  '期末商品棚卸高': 'cogs_close', '期末棚卸高': 'cogs_close',

  // 販管費
  '給与手当': 'sga_emp', '給与': 'sga_emp', '給料手当': 'sga_emp', '給料': 'sga_emp',
  '役員報酬': 'sga_exec', '役員給与': 'sga_exec',
  '賞与': 'sga_bonus', '従業員賞与': 'sga_bonus',
  '法定福利費': 'sga_welfare', '社会保険料': 'sga_welfare',
  '福利厚生費': 'sga_fringe', '厚生費': 'sga_fringe',
  '旅費交通費': 'sga_travel', '旅費': 'sga_travel', '交通費': 'sga_travel',
  '通信費': 'sga_comm', '電話代': 'sga_comm',
  '広告宣伝費': 'sga_ad', '広告費': 'sga_ad', '宣伝費': 'sga_ad',
  '接待交際費': 'sga_entertain', '交際費': 'sga_entertain',
  '地代家賃': 'sga_rent', '家賃': 'sga_rent', '賃借料': 'sga_rent',
  '減価償却費': 'sga_depr', '償却費': 'sga_depr',
  'その他経費': 'sga_other', '雑費': 'sga_other', '消耗品費': 'sga_other',
  '水道光熱費': 'sga_other', '事務用品費': 'sga_other',
  '外注費': 'sga_other', '外注工賃': 'sga_other',

  // 営業外
  '受取利息': 'int_income', '受取利息配当金': 'int_income',
  '雑収入': 'misc_income', '営業外収益その他': 'misc_income',
  '支払利息': 'int_expense', '借入金利息': 'int_expense',
  '雑損失': 'misc_expense', '営業外費用その他': 'misc_expense',

  // 特別
  '特別利益': 'extra_income', '固定資産売却益': 'extra_income',
  '特別損失': 'extra_expense', '固定資産除却損': 'extra_expense',

  // 法人税
  '法人税等': 'corp_tax', '法人税、住民税及び事業税': 'corp_tax',

  // BS 資産
  '現金及び預金': 'cash', '現金預金': 'cash', '現金': 'cash', '預金': 'cash',
  '売掛金': 'ar', '売掛': 'ar',
  '棚卸資産': 'inventory', '商品': 'inventory', '製品': 'inventory',
  'その他流動資産': 'other_ca', '前払費用': 'other_ca', '未収入金': 'other_ca',
  '建物': 'building', '建物附属設備': 'building',
  '機械装置': 'machinery', '機械及び装置': 'machinery',
  '工具器具備品': 'equipment', '器具備品': 'equipment',
  '土地': 'land',
  '投資有価証券': 'invest', '有価証券': 'invest',
  '差入保証金': 'deposit', '敷金': 'deposit', '保証金': 'deposit',

  // BS 負債
  '買掛金': 'ap', '買掛': 'ap',
  '短期借入金': 'short_loan', '銀行短期借入': 'short_loan',
  '未払金': 'unpaid', '未払費用': 'unpaid',
  '未払法人税等': 'unpaid_tax',
  '未払消費税': 'unpaid_ct', '仮受消費税': 'unpaid_ct',
  '長期借入金': 'long_loan', '銀行長期借入': 'long_loan',

  // BS 純資産
  '資本金': 'capital',
  '利益剰余金': 'retained', '繰越利益剰余金': 'retained',
};

// 月名 → インデックス
const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const MONTH_PATS  = [/^1月|jan/i,/^2月|feb/i,/^3月|mar/i,/^4月|apr/i,/^5月|may/i,/^6月|jun/i,
                     /^7月|jul/i,/^8月|aug/i,/^9月|sep/i,/^10月|oct/i,/^11月|nov/i,/^12月|dec/i];

function detectMonthCol(header) {
  // ヘッダー行のどの列が月かを検出 → { colIdx: monthIdx(0-11) }[]
  const monthCols = [];
  header.forEach((cell, i) => {
    const s = String(cell || '').trim();
    MONTH_PATS.forEach((pat, mi) => {
      if (pat.test(s)) monthCols.push({ col: i, month: mi });
    });
  });
  return monthCols;
}

function matchAccount(name) {
  const s = String(name || '').trim()
    .replace(/\s+/g, '')
    .replace(/（.*?）/g, '')
    .replace(/\(.*?\)/g, '');
  if (ACCOUNT_NAME_MAP[s]) return ACCOUNT_NAME_MAP[s];
  // 部分一致
  for (const [key, val] of Object.entries(ACCOUNT_NAME_MAP)) {
    if (s.includes(key) || key.includes(s)) return val;
  }
  return null;
}

function parseNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  const s = String(v).replace(/,/g,'').replace(/[^\d.\-]/g,'');
  return parseFloat(s) || 0;
}

// 汎用CSV/Excelパーサー
function parseImportData(data, source, startMonth) {
  // data: 2D配列 (rows × cols)
  // source: 'mjs' | 'mf' | 'generic'
  // returns: { rows: {accId: [12 months]}, unmapped: [{name, values}] }

  const result = {};
  const unmapped = [];

  // ヘッダー行を探す（月名が含まれる行）
  let headerRowIdx = -1;
  let monthCols = [];
  for (let ri = 0; ri < Math.min(10, data.length); ri++) {
    const mc = detectMonthCol(data[ri]);
    if (mc.length >= 6) { // 6か月以上の列があればヘッダー行とみなす
      headerRowIdx = ri;
      monthCols = mc;
      break;
    }
  }
  if (headerRowIdx < 0 || monthCols.length === 0) {
    return { rows: result, unmapped, error: '月次データの列を検出できませんでした。' };
  }

  // 科目名列を推定（最初の文字列列）
  const headerRow = data[headerRowIdx];
  let nameCol = 0;
  // MJS: 科目コード(col0), 科目名(col1)
  // MF: 科目名(col0)
  if (source === 'mjs') {
    nameCol = 1; // 通常col1が科目名
  } else {
    nameCol = 0;
  }

  // 決算月・開始月から12か月のmapping
  // monthCols: [{col, month(0-11)}]
  // 予算データは startMonth から12か月 → budgetIdx=0はstartMonth
  const budgetMonthMap = new Array(12).fill(-1);
  monthCols.forEach(({ col, month }) => {
    const budgetIdx = (month - (startMonth - 1) + 12) % 12;
    if (budgetIdx < 12) budgetMonthMap[budgetIdx] = col;
  });

  // データ行を処理
  for (let ri = headerRowIdx + 1; ri < data.length; ri++) {
    const row = data[ri];
    const name = String(row[nameCol] || '').trim().replace(/\s+/g,'');
    if (!name || name === '合計' || name === '計' || name === '小計') continue;

    const accId = matchAccount(name);
    const values = budgetMonthMap.map(col => col >= 0 ? parseNum(row[col]) : 0);
    const hasData = values.some(v => v !== 0);
    if (!hasData) continue;

    if (accId) {
      if (!result[accId]) result[accId] = new Array(12).fill(0);
      result[accId] = result[accId].map((v, i) => v + values[i]);
    } else {
      unmapped.push({ name, values });
    }
  }

  return { rows: result, unmapped, error: null };
}

// ====== レンダリング ======

let _importState = {
  source: 'generic',
  parsedData: null, // 2D array
  importResult: null,
  fileName: '',
};

function renderImport(container) {
  const prefs = Object.keys(KENPO_RATES || {});
  container.innerHTML = `
    <div class="sim-panel">
      <div class="flex-between">
        <div>
          <h2 class="section-title">試算表・月次推移表インポート</h2>
          <p class="section-sub">ミロク(MJS)・MoneyForward のCSV/Excelをアップロードして予算データを自動作成します</p>
        </div>
      </div>

      <div class="card-h">
        <div class="source-tabs">
          <div class="source-tab active" data-src="generic" onclick="setImportSource('generic',this)">
            汎用CSV/Excel
          </div>
          <div class="source-tab" data-src="mjs" onclick="setImportSource('mjs',this)">
            ミロク(MJS)財務大将
          </div>
          <div class="source-tab" data-src="mf" onclick="setImportSource('mf',this)">
            MoneyForward
          </div>
        </div>

        <div id="import_source_note" class="text-sm text-muted mt-1" style="margin-bottom:12px">
          会計ソフトから「月次推移表（試算表）」をCSVまたはExcelでエクスポートしてください。
        </div>

        <div class="form-group" style="max-width:200px">
          <label>期首月（決算年度の開始月）</label>
          <select id="import_start_month" class="form-input">
            ${MONTH_NAMES.map((m,i)=>`<option value="${i+1}"${i===3?' selected':''}>${m}始まり</option>`).join('')}
          </select>
        </div>

        <!-- アップロードゾーン -->
        <div class="upload-zone" id="import_drop_zone"
             onclick="document.getElementById('import_file_input').click()"
             ondragover="event.preventDefault();this.classList.add('drag-over')"
             ondragleave="this.classList.remove('drag-over')"
             ondrop="handleImportDrop(event)">
          <div class="upload-zone-icon">📂</div>
          <h2>ファイルをドロップまたはクリックして選択</h2>
          <p>CSV・Excel(.xlsx/.xls)対応 ／ 過去3年分まで対応</p>
          <button class="upload-btn-pill" onclick="event.stopPropagation();document.getElementById('import_file_input').click()">
            ファイルを選択
          </button>
        </div>
        <input type="file" id="import_file_input" accept=".csv,.xlsx,.xls" style="display:none" onchange="handleImportFile(this.files[0])">
      </div>

      <div id="import_preview"></div>
    </div>`;
}

function setImportSource(src, el) {
  _importState.source = src;
  document.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const notes = {
    generic: 'CSV/Excelの1行目またはそれ以降に月名（4月、5月…）が含まれていれば自動認識します。',
    mjs:     '財務大将の「月次推移表」→「CSV出力」でエクスポートしたファイルを選択してください。',
    mf:      'MoneyForwardの「帳票・数字」→「試算表」→「月次推移」→「CSV」でエクスポートしたファイル。',
  };
  document.getElementById('import_source_note').textContent = notes[src] || '';
}

function handleImportDrop(e) {
  e.preventDefault();
  document.getElementById('import_drop_zone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleImportFile(file);
}

function handleImportFile(file) {
  if (!file) return;
  _importState.fileName = file.name;
  const ext = file.name.split('.').pop().toLowerCase();

  const reader = new FileReader();
  if (ext === 'csv') {
    reader.onload = e => {
      const text = detectEncoding(e.target.result) || e.target.result;
      const data = parseCSV(text);
      _importState.parsedData = data;
      runImportPreview();
    };
    reader.readAsText(file, 'Shift-JIS');
  } else {
    reader.onload = e => {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      _importState.parsedData = data;
      runImportPreview();
    };
    reader.readAsArrayBuffer(file);
  }
}

function detectEncoding(text) {
  // Shift-JIS → UTF-8 変換は readAsText('Shift-JIS') で行う
  // 文字化けチェック（簡易）
  if (text.includes('縺') || text.includes('繧')) return null; // UTF-8で読んで化けてる
  return text;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  return lines.map(line => {
    const cells = [];
    let inQuote = false, cur = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQuote = !inQuote; }
      else if (c === ',' && !inQuote) { cells.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
    cells.push(cur.trim());
    return cells;
  });
}

function runImportPreview() {
  if (!_importState.parsedData) return;
  const startMonth = parseInt(document.getElementById('import_start_month')?.value || 4);
  const result = parseImportData(_importState.parsedData, _importState.source, startMonth);
  _importState.importResult = { ...result, startMonth };

  const el = document.getElementById('import_preview');
  if (!el) return;

  const mappedCount  = Object.keys(result.rows).length;
  const unmappedCount = result.unmapped.length;

  if (result.error) {
    el.innerHTML = `<div class="card" style="color:var(--danger);padding:16px">${result.error}</div>`;
    return;
  }

  // マッピング結果プレビュー
  const mappedRows = ACCOUNTS
    .filter(a => a.type === 'input' && result.rows[a.id])
    .map(a => {
      const vals = result.rows[a.id];
      const total = vals.reduce((s,v)=>s+v,0);
      return `<tr>
        <td>${a.name}</td>
        <td class="num">${vals.map(v=>v?fmtK(v):'-').join('</td><td class="num">')}</td>
        <td class="num">${fmtK(total)}</td>
      </tr>`;
    }).join('');

  const unmappedRows = result.unmapped.map(u => `
    <tr>
      <td class="text-muted">${u.name}</td>
      <td colspan="13" class="text-muted text-sm">← マッピング不可（手動入力が必要）</td>
    </tr>`).join('');

  const months = getMonthLabels(startMonth);

  el.innerHTML = `
    <div class="card-h">
      <div class="flex-between" style="margin-bottom:14px">
        <h3>📋 インポートプレビュー：${_importState.fileName}</h3>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="tag tag-green">認識済み ${mappedCount}科目</span>
          ${unmappedCount ? `<span class="tag tag-orange">未マッピング ${unmappedCount}科目</span>` : ''}
        </div>
      </div>

      <div class="table-scroll">
        <table class="result-table">
          <thead>
            <tr>
              <th style="min-width:150px">科目名</th>
              ${months.map(m=>`<th style="min-width:60px">${m}</th>`).join('')}
              <th>合計</th>
            </tr>
          </thead>
          <tbody>${mappedRows}${unmappedRows}</tbody>
        </table>
      </div>
      <div class="wf-note">単位：千円</div>

      <div class="import-actions">
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--gray-600)">インポート先年度：</label>
          <select id="import_target_year" class="form-input" style="width:120px;display:inline-block">
            ${getImportYearOptions()}
          </select>
        </div>
        <button class="btn-solid" onclick="executeImport()">この内容でインポート</button>
        <button class="btn-outline" onclick="document.getElementById('import_file_input').click()">別のファイル</button>
      </div>

      ${unmappedCount ? `
        <div class="mt-3">
          <details>
            <summary style="cursor:pointer;font-size:12px;color:var(--gray-500);font-weight:600">
              未マッピング科目（${unmappedCount}件）の詳細
            </summary>
            <ul style="margin-top:8px;padding-left:20px;font-size:11px;color:var(--gray-400);line-height:2">
              ${result.unmapped.map(u=>`<li>${u.name}（合計：${fmtK(u.values.reduce((a,b)=>a+b,0))}千円）</li>`).join('')}
            </ul>
          </details>
        </div>` : ''}
    </div>`;
}

function getImportYearOptions() {
  const cur = new Date().getFullYear();
  return [cur, cur-1, cur-2, cur-3].map(y =>
    `<option value="${y}">${y}年度</option>`
  ).join('');
}

function executeImport() {
  const result = _importState.importResult;
  if (!result || result.error) return;

  const company = window.App?.currentCompany;
  if (!company) { alert('会社を選択してください'); return; }

  const year = parseInt(document.getElementById('import_target_year')?.value || new Date().getFullYear());

  let budget = getBudget(company.id, year);
  if (!budget) budget = createDefaultBudget(company.id, year);

  // マージ（既存データ上書き）
  Object.assign(budget.rows, result.rows);
  budget.startMonth = result.startMonth;
  saveBudget(budget);

  // 現在の年度と一致すればAppに反映
  if (year === window.App.currentYear) {
    window.App.currentBudget = budget;
    // 年度セレクトを更新
    renderYearSelect(getYearsForCompany(company.id));
  }

  const el = document.getElementById('import_preview');
  if (el) {
    const mapped = Object.keys(result.rows).length;
    el.insertAdjacentHTML('afterbegin', `
      <div class="card" style="background:var(--green-light);border-color:var(--green);margin-bottom:12px;padding:14px 18px">
        <strong style="color:#065f46">✅ インポート完了</strong>
        <span style="font-size:12px;color:#065f46;margin-left:10px">
          ${year}年度に ${mapped}科目 をインポートしました。
        </span>
        <button class="btn-outline" style="margin-left:16px;font-size:12px"
          onclick="window.App.currentYear=${year};loadBudget('${company.id}',${year});showPage('budget')">
          月次予算を確認する →
        </button>
      </div>`);
  }
}
