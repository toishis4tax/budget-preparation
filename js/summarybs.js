// 要約貸借対照表・損益計算書（3期比較）
// セクション直接子アプローチ: parentId で勘定科目レベルを特定し、
// calcAllValuesDynamic の集計済み値を使う（二重計上なし・漏れなし）

// ===== 共通ユーティリティ =====

function _sbsSecOf(byId, id) {
  let a = byId[id], g = 0;
  while (a && g++ < 20) {
    if (!a.parentId) return a.id;
    const p = byId[a.parentId];
    if (!p) return a.parentId;
    if (p.type === 'section') return p.id;
    a = p;
  }
  return null;
}

function _sbsFindSec(accts, id, re) {
  return accts.find(a => a.id === id) ||
         accts.find(a => a.type === 'section' && re && re.test(a.name || ''));
}

// セクションの直接子（勘定科目レベル）の中から正規表現でマッチして合算
// av[a.id] には子科目の集計値が含まれるため二重計上しない
function _sbsSumChildren(accts, av, secId, re, transform) {
  const fn = transform || (v => v);
  return accts
    .filter(a => a.parentId === secId && re.test(a.name || ''))
    .reduce((s, a) => s + fn((av[a.id] || []).slice(0, 13).reduce((t, v) => t + (v || 0), 0)), 0);
}

// ===== 要約損益計算書 =====
function summarizePL(budget) {
  if (!budget || !budget.dynamicAccounts || !budget.dynamicAccounts.length) return null;
  const av    = calcAllValuesDynamic({ ...budget, rows: getMergedRows(budget) });
  const accts = budget.dynamicAccounts;
  const sum13 = id => (av[id] || []).slice(0, 13).reduce((s, v) => s + (v || 0), 0);
  const sc    = (secId, re) => _sbsSumChildren(accts, av, secId, re);

  const revSec     = _sbsFindSec(accts, 'sec_revenue',    /売上|収入/);
  const cogsSec    = _sbsFindSec(accts, 'sec_cogs',       /売上原価|仕入原価/);
  const sgaSec     = _sbsFindSec(accts, 'sec_sga',        /販売費|一般管理費/);
  const nonOpIncSec = _sbsFindSec(accts, 'sec_non_op_inc', /営業外収益/);
  const nonOpExpSec = _sbsFindSec(accts, 'sec_non_op_exp', /営業外費用/);

  const _s13 = (key, sec) => (av[key] !== undefined ? sum13(key) : (sec ? sum13(sec.id) : 0));
  const sales    = _s13('sec_revenue',    revSec);
  const cogs     = _s13('sec_cogs',       cogsSec);
  const sga      = _s13('sec_sga',        sgaSec);
  const nonOpInc = _s13('sec_non_op_inc', nonOpIncSec);
  const nonOpExp = _s13('sec_non_op_exp', nonOpExpSec);
  const ord      = sum13('calc_ord');
  const pretax   = sum13('calc_pretax');
  const net      = sum13('calc_net');

  const cogsId = cogsSec?.id || 'sec_cogs';
  const sgaId  = sgaSec?.id  || 'sec_sga';

  // 変動費の内訳
  const purchase  = sc(cogsId, /仕入/);
  const outsource = sc(cogsId, /外注/);
  const otherVar  = cogs - purchase - outsource;
  const marginal  = sales - cogs;

  // 人件費の内訳（SGAの直接子）
  const LABOR_RE  = /給与|給料|賃金|役員報酬|役員賞与|賞与|法定福利|福利厚生|厚生費|福利費|雑給|人件費|退職|手当/;
  const labor     = sc(sgaId, LABOR_RE);
  const execComp  = sc(sgaId, /役員報酬/) + sc(sgaId, /役員賞与/);
  const welfare   = sc(sgaId, /法定福利|福利厚生|厚生費|福利費/);
  const wages     = sc(sgaId, /給料|給与|賃金|賞与|雑給/) - sc(sgaId, /役員賞与/);
  const otherLabor = labor - execComp - welfare - wages;

  // 設備費（SGAの直接子）
  const depr   = sc(sgaId, /減価償却/);
  const rent   = sc(sgaId, /地代|家賃|賃借料|リース料/);
  const insRep = sc(sgaId, /保険料|修繕/);
  const equip  = depr + rent + insRep;

  const otherFixedSga = sga - labor - equip;
  const fixedTotal    = sga + nonOpExp - nonOpInc;

  return {
    sales,
    purchase, outsource, otherVar, varTotal: cogs, marginal,
    execComp, wages, welfare, otherLabor, labor,
    depr, rent, insRep, equip,
    otherFixedSga, nonOpExp, nonOpInc, fixedTotal,
    ord, special: pretax - ord, pretax, tax: pretax - net, net,
  };
}

// ===== 要約貸借対照表 =====
function summarizeBS(budget) {
  if (!budget || !budget.dynamicAccounts || !budget.dynamicAccounts.length) return null;
  const av    = calcAllValuesDynamic({ ...budget, rows: getMergedRows(budget) });
  const accts = budget.dynamicAccounts;
  const byId  = {}; accts.forEach(a => byId[a.id] = a);

  const cols = budget.actualCols || [];
  let closeIdx = -1;
  for (let i = 0; i < 12; i++) if (cols[i]) closeIdx = i;
  if (closeIdx < 0) closeIdx = 11;

  const bal = id => (av[id] || [])[closeIdx] || 0;

  // セクション直接子から名前マッチして残高合算
  const sc = (secId, re) => accts
    .filter(a => a.parentId === secId && re.test(a.name || ''))
    .reduce((s, a) => s + bal(a.id), 0);

  // フォールバック: input科目を secOf で特定して合算
  const scDeep = (secId, re) => {
    const direct = sc(secId, re);
    if (direct !== 0) return direct;
    return accts
      .filter(a => (a.type === 'input' || a.type === 'rev_display') &&
                   _sbsSecOf(byId, a.id) === secId && re.test(a.name || ''))
      .reduce((s, a) => s + bal(a.id), 0);
  };

  const curAssetSec = _sbsFindSec(accts, 'sec_cur_asset', /流動資産/);
  const fixAssetSec = _sbsFindSec(accts, 'sec_fix_asset', /固定資産|繰延資産/);
  const curLiabSec  = _sbsFindSec(accts, 'sec_cur_liab',  /流動負債/);
  const fixLiabSec  = _sbsFindSec(accts, 'sec_fix_liab',  /固定負債/);
  const equitySec   = _sbsFindSec(accts, 'sec_equity',    /純資産|資本/);

  const curAssetId = curAssetSec?.id || 'sec_cur_asset';
  const fixAssetId = fixAssetSec?.id || 'sec_fix_asset';
  const curLiabId  = curLiabSec?.id  || 'sec_cur_liab';
  const fixLiabId  = fixLiabSec?.id  || 'sec_fix_liab';
  const equityId   = equitySec?.id   || 'sec_equity';

  const _bal = (key, fallbackId) => (av[key] !== undefined ? bal(key) : bal(fallbackId));
  const curAsset = _bal('sec_cur_asset', curAssetId);
  const fixAsset = _bal('sec_fix_asset', fixAssetId);
  const curLiab  = _bal('sec_cur_liab',  curLiabId);
  const fixLiab  = _bal('sec_fix_liab',  fixLiabId);
  const equity   = _bal('sec_equity',    equityId);

  const cash      = scDeep(curAssetId, /現金|預金/);
  const ar        = scDeep(curAssetId, /売掛金|受取手形|電子記録債権|売上債権/);
  const inv       = scDeep(curAssetId, /商品|製品|仕掛品|半製品|原材料|貯蔵品|棚卸/);
  const land      = scDeep(fixAssetId, /土地/);
  const depr      = scDeep(fixAssetId, /建物|構築物|機械|装置|車両|運搬具|工具|器具|備品|船舶|航空機|リース資産/);
  const deprAccum = scDeep(fixAssetId, /減価償却累計額/);

  const payable   = scDeep(curLiabId, /買掛金|支払手形|電子記録債務|買入債務/);
  const shortLoan = scDeep(curLiabId, /短期借入金/);
  const longLoan  = scDeep(fixLiabId, /長期借入金/);
  const valDiff   = scDeep(equityId,  /評価・換算差額|評価差額|繰延ヘッジ|為替換算|新株予約権/);

  const totalAssets = bal('calc_total_assets') || (curAsset + fixAsset);
  const totalLiab   = bal('calc_total_liab')   || (curLiab + fixLiab);

  return {
    cash, ar, inv,
    otherCurAsset: curAsset - cash - ar - inv,
    curAsset,
    land, depr, deprAccum,
    otherFixAsset: fixAsset - land - depr + Math.abs(deprAccum),
    fixAsset,
    totalAssets,
    payable, shortLoan,
    otherCurLiab: curLiab - payable - shortLoan,
    curLiab,
    longLoan,
    otherFixLiab: fixLiab - longLoan,
    fixLiab,
    totalLiab,
    shareholderEq: equity - valDiff,
    valDiff,
    equity,
  };
}

// ===== 表示: 要約PL =====
function renderSummaryPL(container) {
  const company = window.App?.currentCompany;
  const curYear = window.App?.currentYear || new Date().getFullYear();
  if (!company) { container.innerHTML = '<div class="no-data">会社を選択してください</div>'; return; }
  const fiscalMonth = company.fiscalMonth || 3;

  const years = [curYear - 2, curYear - 1, curYear];
  const budgets = years.map(y => (y === curYear ? window.App.currentBudget : getBudget(company.id, y)));
  const data = budgets.map(summarizePL);

  if (!data.some(Boolean)) {
    container.innerHTML = `
      <div class="bizanalysis-wrap">
        <div style="font-size:20px;font-weight:800;margin-bottom:6px">📈 要約損益計算書（3期比較）</div>
        <div class="no-data">PLデータがありません。推移表（試算表）をインポートしてください。</div>
      </div>`;
    return;
  }

  const colHead = years.map((y, i) => {
    const tag = i === 0 ? '前々期実績' : i === 1 ? '前期実績' : '当期予算';
    return `<th colspan="2" class="sbs-yhead">${tag}<br><span style="font-weight:400">（${y + 1}年${fiscalMonth}月期）</span></th>`;
  }).join('');

  const K = v => (v == null ? null : Math.round(v / 1000));
  const fmtK = v => (v == null || isNaN(v)) ? '—' : K(v).toLocaleString('ja-JP');
  const fmtPct = (v, base) => (v == null || isNaN(v) || !base) ? '—' : (v / base * 100).toFixed(1);

  const row = (label, key, opts = {}) => {
    const cells = data.map(d => {
      if (!d) return `<td class="num">—</td><td class="num sbs-pct">—</td>`;
      const v = d[key];
      return `<td class="num">${fmtK(v)}</td><td class="num sbs-pct">${fmtPct(v, d.sales)}</td>`;
    }).join('');
    const cls = (opts.subtotal ? 'sbs-subtotal' : '') + (opts.total ? ' sbs-total' : '') + (opts.indent ? ' sbs-indent' : '');
    return `<tr class="${cls.trim()}"><td class="sbs-label">${label}</td>${cells}</tr>`;
  };
  const ratioRow = (label, fn) => {
    const cells = data.map((d, i) => {
      const r = d ? fn(d, data[i - 1]) : null;
      return `<td class="num sbs-ratio" colspan="2">${r == null ? '—' : r.toFixed(1) + '%'}</td>`;
    }).join('');
    return `<tr class="sbs-ratiorow"><td class="sbs-label sbs-indent">${label}</td>${cells}</tr>`;
  };

  const tbl = `
    <table class="result-table sbs-table">
      <thead>
        <tr><th rowspan="2" class="sbs-label">項　目</th>${colHead}</tr>
        <tr>${data.map(()=>`<th class="num">金額(千円)</th><th class="num sbs-pct">構成比</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${row('売 上 高', 'sales', {total:true})}
        ${ratioRow('（前年比）', (d, p) => (p && p.sales) ? (d.sales / p.sales * 100) : null)}
        <tr class="sbs-group"><td colspan="${1+data.length*2}">【変動費】</td></tr>
        ${row('仕入高', 'purchase', {indent:true})}
        ${row('外注加工費', 'outsource', {indent:true})}
        ${row('他の変動費', 'otherVar', {indent:true})}
        ${row('変動費合計', 'varTotal', {subtotal:true})}
        ${row('限 界 利 益', 'marginal', {total:true})}
        <tr class="sbs-group"><td colspan="${1+data.length*2}">【人件費】</td></tr>
        ${row('役員報酬', 'execComp', {indent:true})}
        ${row('給料・賞与', 'wages', {indent:true})}
        ${row('福利厚生費', 'welfare', {indent:true})}
        ${row('他の人件費', 'otherLabor', {indent:true})}
        ${row('人件費計', 'labor', {subtotal:true})}
        ${ratioRow('（労働分配率）', d => d.marginal ? (d.labor / d.marginal * 100) : null)}
        <tr class="sbs-group"><td colspan="${1+data.length*2}">【設備費】</td></tr>
        ${row('減価償却費', 'depr', {indent:true})}
        ${row('地代家賃・賃借料', 'rent', {indent:true})}
        ${row('保険料・修繕費', 'insRep', {indent:true})}
        ${row('設備費計', 'equip', {subtotal:true})}
        <tr class="sbs-group"><td colspan="${1+data.length*2}">【その他固定費】</td></tr>
        ${row('他の販売管理費', 'otherFixedSga', {indent:true})}
        ${row('支払利息・割引料等', 'nonOpExp', {indent:true})}
        ${row('営業外収益(△)', 'nonOpInc', {indent:true})}
        ${row('固定費合計', 'fixedTotal', {total:true})}
        ${row('経 常 利 益', 'ord', {total:true})}
        ${row('特別損益', 'special', {indent:true})}
        ${row('税引前当期純利益', 'pretax', {subtotal:true})}
        ${row('法人税等', 'tax', {indent:true})}
        ${row('当期純利益', 'net', {total:true})}
      </tbody>
    </table>`;

  container.innerHTML = `
    <div class="bizanalysis-wrap">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px">
        <div>
          <div style="font-size:20px;font-weight:800;color:var(--text)">📈 要約損益計算書（3期比較）</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${escHtml(company.name)} ／ 変動損益方式・構成比は売上高に対する割合</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm btn-solid" onclick="window.print()">🖨 印刷 / PDF</button>
          <button class="btn btn-sm btn-outline" onclick="showPage('home')">← ホームに戻る</button>
        </div>
      </div>
      ${typeof shVerdictTrend === 'function' ? verdictBarHTML(shVerdictTrend(data)) : ''}
      ${typeof shBoxPLForSummary === 'function' ? shBoxPLForSummary(data[2]) : ''}
      <div class="card" style="padding:0;overflow-x:auto">${tbl}</div>
      <div class="wf-note">単位：千円。変動費＝売上原価、固定費＝販管費＋営業外費用−営業外収益。「他の〜」は残差です（限界利益・固定費合計・経常利益は必ず整合）。</div>
    </div>

    <style>
      .sbs-table { font-size:12px; border-collapse:collapse; width:100%; min-width:680px }
      .sbs-table th, .sbs-table td { border:1px solid var(--border, #e2e8f0); padding:5px 8px; color:var(--text) }
      .sbs-table .sbs-label { text-align:left; white-space:nowrap }
      .sbs-table .num { text-align:right; font-variant-numeric:tabular-nums }
      .sbs-pct { color:var(--text-muted); width:54px }
      .sbs-yhead { text-align:center; background:var(--blue-100); color:var(--primary) }
      .sbs-group td { background:var(--primary-light); font-weight:700; color:var(--primary) }
      .sbs-indent .sbs-label { padding-left:20px }
      .sbs-subtotal { background:var(--surface-3); font-weight:700 }
      .sbs-total { background:var(--blue-100); font-weight:800 }
      .sbs-ratiorow td { background:var(--surface-3) }
      .sbs-ratio { color:var(--primary); font-size:11px; font-weight:600; text-align:right }
    </style>`;
}

// ===== 表示: 要約BS =====
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

  const colHead = years.map((y, i) => {
    const endYear = y + 1;
    const tag = i === 0 ? '前々期実績' : i === 1 ? '前期実績' : '当期予算';
    return `<th colspan="2" class="sbs-yhead">${tag}<br><span style="font-weight:400">（${endYear}年${fiscalMonth}月期）</span></th>`;
  }).join('');

  const K = v => (v == null ? null : Math.round(v / 1000));
  const fmtK = v => (v == null || isNaN(v)) ? '—' : K(v).toLocaleString('ja-JP');
  const fmtPct = (v, base) => (v == null || isNaN(v) || !base) ? '—' : (v / base * 100).toFixed(1);

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
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm btn-solid" onclick="window.print()">🖨 印刷 / PDF</button>
          <button class="btn btn-sm btn-outline" onclick="showPage('home')">← ホームに戻る</button>
        </div>
      </div>
      <div class="card" style="padding:0;overflow-x:auto">${tbl}</div>
      <div class="wf-note">単位：千円。「他の〜」は各小計から名前判別できた科目を差し引いた残差です（合計は必ず一致します）。</div>
    </div>

    <style>
      .sbs-table { font-size:12px; border-collapse:collapse; width:100%; min-width:680px }
      .sbs-table th, .sbs-table td { border:1px solid var(--border, #e2e8f0); padding:5px 8px; color:var(--text) }
      .sbs-table .sbs-label { text-align:left; white-space:nowrap }
      .sbs-table .num { text-align:right; font-variant-numeric:tabular-nums }
      .sbs-pct { color:var(--text-muted); width:54px }
      .sbs-yhead { text-align:center; background:var(--blue-100); color:var(--primary) }
      .sbs-group td { background:var(--primary-light); font-weight:700; color:var(--primary) }
      .sbs-indent .sbs-label { padding-left:20px }
      .sbs-subtotal { background:var(--surface-3); font-weight:700 }
      .sbs-total { background:var(--blue-100); font-weight:800 }
    </style>`;
}
