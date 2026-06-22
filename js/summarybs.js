// 要約貸借対照表（3期比較）
// 推移表の生科目を、セクション小計＋科目名マッチ＋残差（他の〜）で標準フォーマットに集約する。
// 「他の〜」を残差で出すため、名前マッチが漏れても各小計・総資産は必ず一致する。

function summarizeBS(budget) {
  if (!budget || !budget.dynamicAccounts || !budget.dynamicAccounts.length) return null;
  const av    = calcAllValuesDynamic(budget);
  const accts = budget.dynamicAccounts;
  const cols  = budget.actualCols || [];
  let closeIdx = -1;
  for (let i = 0; i < 12; i++) if (cols[i]) closeIdx = i;
  if (closeIdx < 0) closeIdx = 11;

  const bal  = id => (av[id] || [])[closeIdx] || 0;
  // 末端科目（input）のみを名前で合算（親子の二重計上を回避）
  const leaf = (sec, re) => accts
    .filter(a => a.type === 'input' && a.section === sec && re.test(a.name || ''))
    .reduce((s, a) => s + bal(a.id), 0);

  const curAsset = bal('sec_cur_asset');
  const fixAsset = bal('sec_fix_asset');
  const curLiab  = bal('sec_cur_liab');
  const fixLiab  = bal('sec_fix_liab');
  const equity   = bal('sec_equity');

  const cash      = leaf('bs_asset', /現金|預金/);
  const ar        = leaf('bs_asset', /売掛金|受取手形|電子記録債権|売上債権/);
  const inv       = leaf('bs_asset', /商品|製品|仕掛品|半製品|原材料|貯蔵品|棚卸/);
  const land      = leaf('bs_asset', /土地/);
  const depr      = leaf('bs_asset', /建物|構築物|機械|装置|車両|運搬具|工具|器具|備品|船舶|航空機|リース資産/);
  const deprAccum = leaf('bs_asset', /減価償却累計額/);

  const payable   = leaf('bs_liab', /買掛金|支払手形|電子記録債務|買入債務/);
  const shortLoan = leaf('bs_liab', /短期借入金/);
  const longLoan  = leaf('bs_liab', /長期借入金/);

  const valDiff   = leaf('bs_equity', /評価・換算差額|評価差額|繰延ヘッジ|為替換算|新株予約権/);

  const totalAssets = bal('calc_total_assets') || (curAsset + fixAsset);
  const totalLiab   = bal('calc_total_liab')   || (curLiab + fixLiab);

  return {
    // 資産
    cash, ar, inv,
    otherCurAsset: curAsset - cash - ar - inv,
    curAsset,
    land, depr, deprAccum,
    otherFixAsset: fixAsset - land - depr - deprAccum,
    fixAsset,
    totalAssets,
    // 負債
    payable, shortLoan,
    otherCurLiab: curLiab - payable - shortLoan,
    curLiab,
    longLoan,
    otherFixLiab: fixLiab - longLoan,
    fixLiab,
    totalLiab,
    // 純資産
    shareholderEq: equity - valDiff,
    valDiff,
    equity,
  };
}

function renderSummaryBS(container) {
  const company = window.App?.currentCompany;
  const curYear = window.App?.currentYear || new Date().getFullYear();
  if (!company) { container.innerHTML = '<div class="no-data">会社を選択してください</div>'; return; }
  const fiscalMonth = company.fiscalMonth || 3;

  const years = [curYear - 2, curYear - 1, curYear];
  const budgets = years.map(y => (y === curYear ? window.App.currentBudget : getBudget(company.id, y)));
  const data = budgets.map(summarizeBS);

  if (!data.some(Boolean)) {
    container.innerHTML = `
      <div class="bizanalysis-wrap">
        <div style="font-size:20px;font-weight:800;margin-bottom:6px">🏦 要約貸借対照表（3期比較）</div>
        <div class="no-data">BSデータがありません。推移表（試算表）をインポートしてください。</div>
      </div>`;
    return;
  }

  // 期ラベル（◯年◯月期）
  const colHead = years.map((y, i) => {
    const endYear = y + 1; // 4月始まり前提：年度yの期末は翌暦年のfiscalMonth
    const tag = i === 0 ? '3年前実績' : i === 1 ? '2年前実績' : '前期実績';
    return `<th colspan="2" class="sbs-yhead">${tag}<br><span style="font-weight:400">（${endYear}年${fiscalMonth}月期）</span></th>`;
  }).join('');

  const K = v => (v == null ? null : Math.round(v / 1000));
  const fmtK = v => (v == null ? '—' : K(v).toLocaleString('ja-JP'));
  const fmtPct = (v, base) => (v == null || !base ? '—' : (v / base * 100).toFixed(1));

  // 行: 各期の [金額, 対総資産%]
  const row = (label, key, opts = {}) => {
    const cells = data.map(d => {
      if (!d) return `<td class="num">—</td><td class="num sbs-pct">—</td>`;
      const v = d[key];
      return `<td class="num">${fmtK(v)}</td><td class="num sbs-pct">${fmtPct(v, d.totalAssets)}</td>`;
    }).join('');
    const cls = (opts.subtotal ? 'sbs-subtotal' : '') + (opts.total ? ' sbs-total' : '') + (opts.indent ? ' sbs-indent' : '');
    return `<tr class="${cls.trim()}"><td class="sbs-label">${label}</td>${cells}</tr>`;
  };

  const tbl = `
    <table class="result-table sbs-table">
      <thead>
        <tr><th rowspan="2" class="sbs-label">項　目</th>${colHead}</tr>
        <tr>${data.map(()=>`<th class="num">金額(千円)</th><th class="num sbs-pct">構成比</th>`).join('')}</tr>
      </thead>
      <tbody>
        <tr class="sbs-group"><td colspan="${1+data.length*2}">【資産の部】</td></tr>
        ${row('現金預金', 'cash', {indent:true})}
        ${row('売上債権', 'ar', {indent:true})}
        ${row('棚卸資産', 'inv', {indent:true})}
        ${row('他の流動資産', 'otherCurAsset', {indent:true})}
        ${row('流動資産合計', 'curAsset', {subtotal:true})}
        ${row('土地', 'land', {indent:true})}
        ${row('減価償却資産', 'depr', {indent:true})}
        ${row('償却累計額(△)', 'deprAccum', {indent:true})}
        ${row('他の固定・繰延', 'otherFixAsset', {indent:true})}
        ${row('固定・繰延資産合計', 'fixAsset', {subtotal:true})}
        ${row('総　資　産', 'totalAssets', {total:true})}
        <tr class="sbs-group"><td colspan="${1+data.length*2}">【負債の部】</td></tr>
        ${row('買入債務', 'payable', {indent:true})}
        ${row('短期借入金', 'shortLoan', {indent:true})}
        ${row('他の流動負債', 'otherCurLiab', {indent:true})}
        ${row('流動負債合計', 'curLiab', {subtotal:true})}
        ${row('長期借入金等', 'longLoan', {indent:true})}
        ${row('他の固定負債', 'otherFixLiab', {indent:true})}
        ${row('固定負債合計', 'fixLiab', {subtotal:true})}
        ${row('負債合計', 'totalLiab', {total:true})}
        <tr class="sbs-group"><td colspan="${1+data.length*2}">【純資産の部】</td></tr>
        ${row('株主資本', 'shareholderEq', {indent:true})}
        ${row('評価差額等', 'valDiff', {indent:true})}
        ${row('純資産合計', 'equity', {total:true})}
      </tbody>
    </table>`;

  container.innerHTML = `
    <div class="bizanalysis-wrap">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px">
        <div>
          <div style="font-size:20px;font-weight:800;color:var(--text)">🏦 要約貸借対照表（3期比較）</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${escHtml(company.name)} ／ 構成比は総資産に対する割合</div>
        </div>
        <button class="btn btn-sm btn-outline" onclick="showPage('home')">← ホームに戻る</button>
      </div>
      <div class="card" style="padding:0;overflow-x:auto">${tbl}</div>
      <div class="wf-note">単位：千円。「他の〜」は各小計から名前判別できた科目を差し引いた残差です（合計は必ず一致します）。</div>
    </div>

    <style>
      .sbs-table { font-size:12px; border-collapse:collapse; width:100%; min-width:680px }
      .sbs-table th, .sbs-table td { border:1px solid var(--border, #e2e8f0); padding:5px 8px }
      .sbs-table .sbs-label { text-align:left; white-space:nowrap }
      .sbs-table .num { text-align:right; font-variant-numeric:tabular-nums }
      .sbs-pct { color:var(--text-muted); width:54px }
      .sbs-yhead { text-align:center; background:#f1f5f9 }
      .sbs-group td { background:#eef2ff; font-weight:700; color:#3730a3 }
      .sbs-indent .sbs-label { padding-left:20px }
      .sbs-subtotal { background:#f8fafc; font-weight:700 }
      .sbs-total { background:#e0f2fe; font-weight:800 }
    </style>`;
}
