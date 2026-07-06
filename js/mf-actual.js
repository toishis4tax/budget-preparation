// ===== MoneyForward 実績取込（月次推移表CSV → actualRows更新） =====

function renderMFActual(container) {
  const company = window.App?.currentCompany;
  const budget  = window.App?.currentBudget;

  if (!company || !budget) {
    container.innerHTML = '<div class="no-data">会社と年度を選択してください</div>';
    return;
  }

  container.innerHTML = `
    <div class="mfa-wrap">
      <div class="mfa-header">
        <div>
          <h2 class="mfa-title">📊 MoneyForward 実績取込</h2>
          <p class="mfa-desc">MoneyForwardクラウド会計の「月次推移表」CSVをアップロードして、実績データを自動更新します。</p>
        </div>
        <a class="btn btn-sm no-print" href="#" onclick="event.preventDefault();_mfaShowHelp()" style="align-self:flex-start">操作ガイド ？</a>
      </div>

      <!-- ステップ説明 -->
      <div class="mfa-steps">
        <div class="mfa-step"><span class="mfa-step-num">1</span><span>MoneyForwardで<strong>帳票→試算表→月次推移</strong>を開く</span></div>
        <div class="mfa-step"><span class="mfa-step-num">2</span><span>右上の<strong>「CSV出力」</strong>でダウンロード</span></div>
        <div class="mfa-step"><span class="mfa-step-num">3</span><span>下にドロップまたは選択して読み込む</span></div>
      </div>

      <!-- アップロードゾーン -->
      <div class="mfa-drop" id="mfa_drop" onclick="document.getElementById('mfa_file').click()">
        <div style="font-size:36px;margin-bottom:10px">📂</div>
        <div style="font-weight:600;color:var(--text)">CSVファイルをドロップ、またはクリックして選択</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">MoneyForward 月次推移表（.csv）</div>
        <input type="file" id="mfa_file" accept=".csv,.xlsx,.xls" style="display:none" onchange="_mfaLoadFile(this)">
      </div>

      <div id="mfa_result"></div>
    </div>
  `;

  // D&D
  const drop = container.querySelector('#mfa_drop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('dragover');
    const f = e.dataTransfer.files[0];
    if (f) _mfaProcessFile(f);
  });
}

function _mfaShowHelp() {
  showToast('MoneyForward：帳票 → 試算表 → 月次推移 → CSV出力 でダウンロードできます。', 'info', 6000);
}

function _mfaLoadFile(input) {
  const f = input.files[0];
  if (f) _mfaProcessFile(f);
  input.value = '';
}

function _mfaProcessFile(file) {
  const isCsv = file.name.toLowerCase().endsWith('.csv');
  if (!isCsv) { showToast('CSVファイル（.csv）を選択してください', 'error'); return; }

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const text = e.target.result;
      const data = _mfaParseCsv(text);
      _mfaShowPreview(data, file.name);
    } catch (err) {
      document.getElementById('mfa_result').innerHTML =
        `<div class="mfa-error">読み込みエラー：${escHtml(err.message)}</div>`;
    }
  };
  reader.readAsText(file, 'shift-jis');
}

// シンプルCSVパーサー
function _mfaParseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  return lines.map(line => {
    const cols = [];
    let inQ = false, cur = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
    cols.push(cur.trim());
    return cols;
  });
}

// 月列を検出
function _mfaDetectMonthCols(headerRow) {
  const result = [];
  headerRow.forEach((cell, col) => {
    const s = String(cell || '').trim().replace(/[\s　年]/g, '');
    const m = s.match(/^(\d{1,2})月$/);
    if (m) result.push({ col, month: parseInt(m[1]) });
  });
  return result;
}

// 数値パース
function _mfaParseNum(v) {
  const s = String(v || '').replace(/,/g, '').replace(/[^\d.\-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.round(n);
}

// CSVデータ → 科目別月次値の抽出
function _mfaExtractAccounts(data, startMonth) {
  let headerRowIdx = -1;
  let monthCols = [];

  for (let ri = 0; ri < Math.min(6, data.length); ri++) {
    const mc = _mfaDetectMonthCols(data[ri]);
    if (mc.length >= 3) { headerRowIdx = ri; monthCols = mc; break; }
  }
  if (headerRowIdx < 0) throw new Error('月次列を検出できませんでした。MoneyForwardの月次推移表CSVか確認してください。');

  // 月→予算インデックスのマッピング
  const budgetMonthMap = new Array(12).fill(-1);
  monthCols.forEach(({ col, month }) => {
    const bi = (month - startMonth + 12) % 12;
    if (bi < 12) budgetMonthMap[bi] = col;
  });

  const detectedMonths = budgetMonthMap.map((col, i) => col >= 0 ? i : -1).filter(i => i >= 0);

  const accounts = [];
  for (let ri = headerRowIdx + 1; ri < data.length; ri++) {
    const row = data[ri];
    const nameRaw = (String(row[0]||'') + String(row[1]||'')).trim()
      || String(row[0]||'').trim();
    const name = nameRaw.replace(/\s+/g, '');
    if (!name || name.length === 0) continue;

    // スキップ行（合計・差引等）
    if (/^(合計|小計|差引|当期利益|税引前|合計額|負債純資産|資産合計|流動|固定|純資産|繰越|当期純|法人税等合計)/.test(name)) continue;

    const vals = new Array(12).fill(0);
    budgetMonthMap.forEach((col, bi) => {
      if (col >= 0) vals[bi] = _mfaParseNum(row[col]);
    });

    // 全ゼロはスキップ
    if (vals.every(v => v === 0)) continue;

    accounts.push({ name: nameRaw, nameNorm: name, vals });
  }

  return { accounts, detectedMonths, monthCols };
}

// 予算科目との名前マッチング
function _mfaMatchAccounts(importedAccounts, budget) {
  const dynAccs = budget.dynamicAccounts;
  if (!dynAccs) return _mfaMatchFixed(importedAccounts, budget);

  const inputAccs = dynAccs.filter(a => a.type === 'input' || a.type === 'leaf' || (!a.type));

  // 正規化名 → account マップ
  const nameMap = {};
  inputAccs.forEach(a => {
    const norm = (a.name || '').replace(/\s+/g, '');
    if (norm) nameMap[norm] = a;
  });

  return importedAccounts.map(imp => {
    const matched = nameMap[imp.nameNorm] || null;
    return { ...imp, matched, matchedId: matched?.id || null };
  });
}

function _mfaMatchFixed(importedAccounts, budget) {
  return importedAccounts.map(imp => {
    const id = ACCOUNT_NAME_MAP?.[imp.nameNorm] || ACCOUNT_NAME_MAP?.[imp.name] || null;
    const hasData = id && (budget.rows?.[id] || budget.actualRows?.[id]);
    return { ...imp, matched: hasData ? { id, name: imp.name } : null, matchedId: id };
  });
}

// プレビュー表示
function _mfaShowPreview(rawData, fileName) {
  const budget = window.App?.currentBudget;
  const startMonth = budget?.startMonth || 4;

  let extracted;
  try { extracted = _mfaExtractAccounts(rawData, startMonth); }
  catch (err) {
    document.getElementById('mfa_result').innerHTML = `<div class="mfa-error">⚠ ${escHtml(err.message)}</div>`;
    return;
  }

  const { accounts, detectedMonths } = extracted;
  const matched = _mfaMatchAccounts(accounts, budget);
  const matchedCount  = matched.filter(r => r.matched).length;
  const unmatchedRows = matched.filter(r => !r.matched);

  const calM = i => ((startMonth - 1 + i) % 12) + 1;
  const monthLabels = detectedMonths.map(i => `${calM(i)}月`).join('・');
  const fmt = v => v === 0 ? '—' : Math.round(v).toLocaleString();

  // 月チェックボックス（取込対象月を選択）
  const monthChecks = detectedMonths.map(i =>
    `<label style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:13px">
      <input type="checkbox" class="mfa-month-cb" value="${i}" checked> ${calM(i)}月
    </label>`
  ).join('');

  const tableRows = matched.filter(r => r.matched).map(r => {
    const previewVals = detectedMonths.slice(0, 4).map(i => `<td style="text-align:right;font-size:11px">${fmt(r.vals[i])}</td>`).join('');
    return `<tr>
      <td style="font-size:12px">${escHtml(r.name)}</td>
      <td style="font-size:12px;color:var(--text-muted)">${escHtml(r.matched?.name || r.matchedId || '')}</td>
      ${previewVals}
    </tr>`;
  }).join('');

  const previewHeaders = detectedMonths.slice(0, 4).map(i => `<th>${calM(i)}月</th>`).join('');

  document.getElementById('mfa_result').innerHTML = `
    <div class="mfa-result-header">
      <div>
        <strong>${escHtml(fileName)}</strong> を読み込みました
        <span class="mfa-badge mfa-badge-ok">${matchedCount}科目マッチ</span>
        ${unmatchedRows.length ? `<span class="mfa-badge mfa-badge-warn">${unmatchedRows.length}科目未マッチ</span>` : ''}
        <span style="font-size:12px;color:var(--text-muted);margin-left:6px">対象月：${monthLabels}</span>
      </div>
    </div>

    <!-- 取込対象月の選択 -->
    <div class="home-card" style="margin-bottom:12px;padding:12px 16px">
      <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:8px">取込対象月（チェックした月のみ実績を更新します）</div>
      <div>${monthChecks}</div>
    </div>

    <!-- マッチ済み科目プレビュー -->
    ${matchedCount > 0 ? `
    <div class="home-card" style="margin-bottom:12px">
      <div class="mfa-section-title">マッチした科目（先頭4か月プレビュー）</div>
      <div class="table-scroll">
        <table class="rpt-table" style="font-size:12px">
          <thead><tr>
            <th style="text-align:left">インポート科目名</th>
            <th style="text-align:left">予算科目</th>
            ${previewHeaders}
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>` : ''}

    <!-- 未マッチ科目 -->
    ${unmatchedRows.length ? `
    <details class="home-card" style="margin-bottom:12px">
      <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--text-muted)">
        未マッチの科目（${unmatchedRows.length}件）— クリックで表示
      </summary>
      <div style="margin-top:10px;font-size:12px;color:var(--text-muted);columns:2;gap:16px">
        ${unmatchedRows.map(r => `<div>・${escHtml(r.name)}</div>`).join('')}
      </div>
    </details>` : ''}

    <!-- 実行ボタン -->
    ${matchedCount > 0 ? `
    <div style="display:flex;gap:10px;align-items:center;margin-top:4px">
      <button class="btn-solid" onclick="_mfaApply(${JSON.stringify(matched)})">
        ✅ ${matchedCount}科目の実績を取込む
      </button>
      <span style="font-size:12px;color:var(--text-muted)">※ 選択した月の実績データが上書きされます</span>
    </div>` : `<div class="mfa-error">マッチする科目がありません。予算の科目名とMoneyForwardの科目名が一致しているか確認してください。</div>`}
  `;

  // 取込データをコンテナに保存
  window._mfaMatchedData = matched;
}

async function _mfaApply(matched) {
  const budget = window.App?.currentBudget;
  if (!budget) return;

  // 取込対象月を取得
  const cbs = document.querySelectorAll('.mfa-month-cb:checked');
  const targetMonths = [...cbs].map(cb => parseInt(cb.value));
  if (targetMonths.length === 0) { showToast('取込対象月を1つ以上選択してください', 'warn'); return; }

  const ok = await showConfirm(
    `${targetMonths.map(i => ((budget.startMonth||4) + i - 1) % 12 + 1).join('・')}月の実績データを更新します。\n既存の実績は上書きされます。`,
    { title: '実績を取込みますか？', okText: '取込む', danger: false }
  );
  if (!ok) return;

  if (!budget.actualRows) budget.actualRows = {};
  if (!budget.actualCols) budget.actualCols = new Array(12).fill(false);

  const matchedData = typeof matched === 'string' ? JSON.parse(matched) : matched;
  let count = 0;
  matchedData.filter(r => r.matchedId).forEach(r => {
    if (!budget.actualRows[r.matchedId]) budget.actualRows[r.matchedId] = new Array(13).fill(0);
    targetMonths.forEach(mi => {
      budget.actualRows[r.matchedId][mi] = r.vals[mi] || 0;
    });
    count++;
  });

  // actualCols を更新
  targetMonths.forEach(mi => { budget.actualCols[mi] = true; });

  saveBudget(budget);
  window.App.currentBudget = budget;

  showToast(`✅ ${count}科目・${targetMonths.length}か月分の実績を取込みました`, 'success', 4000);

  // ホームへ戻ってデータ確認を促す
  setTimeout(() => showPage('home'), 800);
}
