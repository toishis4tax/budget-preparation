// ===== 銀行提出資料 =====
// 構成: 表紙＋財務指標 / 要約PL・BS 3期比較 / 資金繰り予測 / 5か年計画（成長率可変）

// --- 成長率の状態（ページ内で保持） ---
const _bdRates = { sales: 10, cogs: 5, salary: 3, rent: 0, other: 2 };

// --- メモ保存キー ---
const _bdMemoKey = id => `bankdoc_memo_${id}`;
function _bdLoadMemo(companyId) {
  try { return JSON.parse(localStorage.getItem(_bdMemoKey(companyId))) || {}; } catch { return {}; }
}
function _bdSaveMemo(companyId, memo) {
  localStorage.setItem(_bdMemoKey(companyId), JSON.stringify(memo));
}

let _bdAutoSaveTimer = null;
function _bdAutoSave() {
  clearTimeout(_bdAutoSaveTimer);
  _bdAutoSaveTimer = setTimeout(() => {
    const company = window.App?.currentCompany;
    if (!company) return;
    const memo = {
      business: document.getElementById('bd_business')?.value || '',
      purpose:  document.getElementById('bd_purpose')?.value  || '',
    };
    _bdSaveMemo(company.id, memo);
    const msg = document.getElementById('bd_autosave_msg');
    if (msg) { msg.textContent = '自動保存済み'; setTimeout(() => { msg.textContent = ''; }, 2000); }
  }, 600);
}

// --- 財務指標計算 ---
function _bdCalcRatios(plData, bsData, cfSeries) {
  if (!bsData) return null;
  const equity      = bsData.equity ?? 0;
  const totalAssets = bsData.totalAssets ?? 1;
  const curAsset    = bsData.curAsset ?? 0;
  const curLiab     = bsData.curLiab ?? 1;

  const equityRatio  = totalAssets > 0 ? (equity / totalAssets * 100) : null;
  const currentRatio = curLiab > 0 ? (curAsset / curLiab * 100) : null;

  // DSCR = (経常利益 + 減価償却費) / 年間返済額
  let dscr = null;
  if (cfSeries && plData) {
    const annualRepay = (cfSeries.loanRepay || 0) * 12;
    const depr = plData.depr || 0;
    const ord  = plData.ord  || 0;
    if (annualRepay > 0) dscr = (ord + depr) / annualRepay;
  }

  // インタレストカバレッジ = 営業利益 / 支払利息
  let icr = null;
  if (plData && bsData) {
    const intExp = plData.nonOpExp || 0;
    const op = (plData.ord || 0) + intExp - (plData.nonOpInc || 0);
    if (intExp > 0) icr = op / intExp;
  }

  return { equityRatio, currentRatio, dscr, icr };
}

// --- 5か年計画計算 ---
function _bdFiveYear(budget, rates) {
  if (!budget) return null;
  const annSum = arr => (arr ? arr.slice(0, 13).reduce((a, b) => a + (b || 0), 0) : 0);
  let curSales, curCogs, curSalary, curRent, curOther, curDepr;

  if (budget.dynamicAccounts?.length) {
    const av = calcAllValuesDynamic(budget);
    const accts = budget.dynamicAccounts;
    const dynSum = id => annSum(av[id] || []);
    const matchSum = re => accts
      .filter(a => a.type !== 'section' && (a.indent ?? 1) <= 1 && re.test(a.name || ''))
      .reduce((s, a) => s + dynSum(a.id), 0);
    curSales  = dynSum('sec_revenue');
    curCogs   = dynSum('sec_cogs');
    curSalary = matchSum(/給与|給料|賃金|役員報酬|役員賞与|賞与|法定福利|福利厚生|厚生費|福利費|人件費|雑給|退職|手当/);
    curRent   = matchSum(/家賃|地代|賃借料|リース/);
    curDepr   = matchSum(/減価償却/);
    curOther  = dynSum('sec_sga') - curSalary - curRent - curDepr;
  } else if (typeof calcPL === 'function') {
    const pl = calcPL(budget.rows || {});
    curSales  = annSum(pl.sales);
    curCogs   = annSum(pl.cogs);
    curSalary = annSum(pl.sga_salary || []);
    curRent   = annSum((budget.rows || {}).sga_rent || []);
    curDepr   = annSum((budget.rows || {}).sga_depr || []);
    curOther  = annSum(pl.sga) - curSalary - curRent - curDepr;
  } else return null;

  const R = {
    sales: 1 + rates.sales / 100, cogs: 1 + rates.cogs / 100,
    salary: 1 + rates.salary / 100, rent: 1 + rates.rent / 100,
    other: 1 + rates.other / 100,
  };
  const years = [];
  let s = curSales, c = curCogs, sal = curSalary, rent = curRent, depr = curDepr, oth = curOther;
  for (let y = 1; y <= 5; y++) {
    s *= R.sales; c *= R.cogs; sal *= R.salary; rent *= R.rent; oth *= R.other;
    const sga = sal + rent + depr + oth;
    const gross = s - c;
    const op = gross - sga;
    years.push({ y, sales: s, cogs: c, gross, salary: sal, rent, depr, other: oth, sga, op });
  }
  return {
    base: { sales: curSales, cogs: curCogs, gross: curSales - curCogs, salary: curSalary, rent: curRent, depr: curDepr, other: curOther, sga: curSalary + curRent + curDepr + curOther, op: (curSales - curCogs) - (curSalary + curRent + curDepr + curOther) },
    years,
  };
}

// --- メインレンダラー ---
function renderBankDoc(container) {
  const company = window.App?.currentCompany;
  const budget  = window.App?.currentBudget;
  const curYear = window.App?.currentYear || new Date().getFullYear();
  if (!company || !budget) { container.innerHTML = '<div class="no-data">会社と年度を選択してください</div>'; return; }

  const fiscalMonth = company.fiscalMonth || 3;
  const memo = _bdLoadMemo(company.id);
  const cs   = (typeof computeCashSeries === 'function') ? computeCashSeries(company, budget) : null;
  if (cs) cs.loanRepay = (() => { try { return JSON.parse(localStorage.getItem(`cf_inputs_${company.id}_${curYear}`))?.loanRepay || 0; } catch { return 0; } })();

  _renderBankDocFull(container, company, budget, curYear, fiscalMonth, memo, cs);
}

function _renderBankDocFull(container, company, budget, curYear, fiscalMonth, memo, cs) {
  const years3   = [curYear - 2, curYear - 1, curYear];
  const budgets3 = years3.map(y => y === curYear ? budget : (typeof getBudget === 'function' ? getBudget(company.id, y) : null));
  const plData3  = budgets3.map(b => (typeof summarizePL === 'function') ? summarizePL(b) : null);
  const bsData3  = budgets3.map(b => (typeof summarizeBS === 'function') ? summarizeBS(b) : null);
  const plCur    = plData3[2];
  const bsCur    = bsData3[2];
  const ratios   = _bdCalcRatios(plCur, bsCur, cs);
  const fy       = _bdFiveYear(budget, _bdRates);

  const K    = v => v == null ? '—' : Math.round(v / 1000).toLocaleString('ja-JP');
  const today = new Date();
  const dstr  = `${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日`;

  const yHead = years3.map((y, i) =>
    `<th>${i===0?'前々期':i===1?'前期':'当期'}<br><span style="font-weight:400;font-size:10px">（${y+1}年${fiscalMonth}月期）</span></th>`
  ).join('');

  const plRow = (label, key, bold, indent) => `<tr${bold?' style="font-weight:700;background:#f8fafc"':''}>
    <td style="text-align:left;padding-left:${indent?'20px':'8px'}">${label}</td>
    ${plData3.map(d => `<td class="num">${d ? K(d[key]) : '—'}</td>`).join('')}
  </tr>`;
  const bsRow = (label, key, bold, indent) => `<tr${bold?' style="font-weight:700;background:#f8fafc"':''}>
    <td style="text-align:left;padding-left:${indent?'20px':'8px'}">${label}</td>
    ${bsData3.map(d => `<td class="num">${d ? K(d[key]) : '—'}</td>`).join('')}
  </tr>`;

  // 財務指標カード
  const ratioCard = (label, val, unit, good, warn, bad) => {
    let color = 'var(--text)';
    if (val != null && good != null) {
      if (unit === '%') { color = val >= good ? '#059669' : val >= warn ? '#d97706' : '#dc2626'; }
      else              { color = val >= good ? '#059669' : val >= warn ? '#d97706' : '#dc2626'; }
    }
    const display = val == null ? '算定不能' : (unit === '倍' ? val.toFixed(2) + unit : val.toFixed(1) + unit);
    const guide   = good != null ? `目安：${unit==='%'?good+'%以上':good+'倍以上'}` : '';
    return `<div class="bdoc-kpi">
      <div class="bdoc-kpi-label">${label}</div>
      <div class="bdoc-kpi-val" style="color:${color}">${display}</div>
      ${guide ? `<div class="bdoc-kpi-guide">${guide}</div>` : ''}
    </div>`;
  };

  // 資金繰りテーブル
  let cfSection = '';
  if (cs?.rows?.length) {
    const months = cs.rows.map(r => `<th>${r.calMonth}月</th>`).join('');
    const rowLine = (label, pick, bold) =>
      `<tr${bold?' style="font-weight:700"':''}>
        <td style="text-align:left">${label}</td>
        ${cs.rows.map(r => `<td class="num" ${pick(r)<0?' style="color:#dc2626"':''}>${K(pick(r))}</td>`).join('')}
      </tr>`;
    cfSection = `
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">
        期首現預金：${K(cs.openCash)}千円 ／ 単位：千円
        ${cs.hasShortage?'<span style="color:#b91c1c;font-weight:700;margin-left:6px">⚠ 資金不足月あり</span>':''}
      </div>
      <div style="overflow-x:auto"><table class="bdoc-table bdoc-cf">
        <thead><tr><th style="text-align:left">資金繰り</th>${months}</tr></thead>
        <tbody>
          ${rowLine('営業CF（利益＋償却）', r => r.opCF)}
          ${rowLine('財務CF（借入±返済）', r => r.finCF)}
          ${rowLine('法人税等の支払', r => r.taxCF)}
          ${rowLine('月末現預金残高', r => r.cash, true)}
        </tbody>
      </table></div>`;
  } else {
    cfSection = '<div class="no-data-small">資金繰りページで期首現預金・借入情報を入力してください。</div>';
  }

  // 5か年計画テーブル
  let fySection = '';
  if (fy) {
    const heads = ['当期','1年目','2年目','3年目','4年目','5年目'].map(h=>`<th>${h}</th>`).join('');
    const series = [fy.base, ...fy.years];
    const fyRow = (label, key, bold) => `<tr${bold?' style="font-weight:700;background:#f8fafc"':''}>
      <td style="text-align:left">${label}</td>${series.map(x=>`<td class="num">${K(x[key])}</td>`).join('')}</tr>`;
    fySection = `
      <table class="bdoc-table">
        <thead><tr><th style="text-align:left">5か年計画（千円）</th>${heads}</tr></thead>
        <tbody>
          ${fyRow('売上高','sales',true)}
          ${fyRow('売上原価','cogs')}
          ${fyRow('売上総利益','gross',true)}
          ${fyRow('人件費','salary')}
          ${fyRow('減価償却費','depr')}
          ${fyRow('その他固定費','other')}
          ${fyRow('販管費計','sga')}
          ${fyRow('営業利益','op',true)}
        </tbody>
      </table>`;
  } else {
    fySection = '<div class="no-data-small">予算データが必要です。</div>';
  }

  // スライダーHTML
  const slider = (id, label, val, min, max) =>
    `<div class="bdoc-slider-row">
      <span class="bdoc-slider-label">${label}</span>
      <input type="range" id="bds_${id}" min="${min}" max="${max}" step="1" value="${val}"
        oninput="document.getElementById('bds_${id}_v').textContent=this.value+'%';_bdUpdateFY()">
      <span class="bdoc-slider-val" id="bds_${id}_v">${val}%</span>
    </div>`;

  container.innerHTML = `
    <!-- 画面ツールバー -->
    <div class="bdoc-toolbar no-print">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <strong style="font-size:14px">🏦 銀行提出資料</strong>
        <span style="font-size:12px;color:var(--text-muted)">要約財務諸表・財務指標・資金繰り・5か年計画</span>
      </div>
      <button class="btn-solid" onclick="window.print()" style="display:flex;align-items:center;gap:6px">🖨️ 印刷 / PDF出力</button>
    </div>

    <!-- 事業概要入力フォーム（no-print） -->
    <div class="home-card no-print" style="margin-bottom:14px">
      <div class="home-card-title">📝 事業概要・資金使途（印刷資料に反映されます）</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label style="font-size:11px;font-weight:600;color:var(--text-muted)">事業内容・強み</label>
          <textarea id="bd_business" rows="3" class="form-input" style="width:100%;margin-top:4px;font-size:12px"
            placeholder="例：飲食店の経営。都内3店舗。コアな固定客が多く安定収益。"
            oninput="_bdAutoSave()">${escHtml(memo.business||'')}</textarea>
        </div>
        <div>
          <label style="font-size:11px;font-weight:600;color:var(--text-muted)">資金使途・返済財源</label>
          <textarea id="bd_purpose" rows="3" class="form-input" style="width:100%;margin-top:4px;font-size:12px"
            placeholder="例：設備投資（厨房機器更新）に充当。返済財源は営業利益＋減価償却費にて充当予定。"
            oninput="_bdAutoSave()">${escHtml(memo.purpose||'')}</textarea>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
        <span id="bd_autosave_msg" style="font-size:11px;color:var(--text-muted)"></span>
        <button class="btn btn-sm btn-solid" onclick="_bdSaveAndRender()">印刷資料に反映</button>
      </div>
    </div>

    <!-- 5か年計画 成長率スライダー（no-print） -->
    <div class="home-card no-print" style="margin-bottom:14px">
      <div class="home-card-title">📐 5か年計画　成長率の前提を調整</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 20px">
        ${slider('sales',  '売上成長率',    _bdRates.sales,   -20, 30)}
        ${slider('cogs',   '原価上昇率',    _bdRates.cogs,    -10, 20)}
        ${slider('salary', '人件費上昇率',  _bdRates.salary,  -5,  15)}
        ${slider('rent',   '家賃変動率',    _bdRates.rent,    -5,  10)}
        ${slider('other',  'その他費用増加率', _bdRates.other, -5, 15)}
      </div>
    </div>

    <!-- ========== 印刷本体 ========== -->
    <div class="bdoc-sheet">

      <!-- 表紙 -->
      <div class="bdoc-page bdoc-cover">
        <div style="text-align:center;border-bottom:2px solid #1e3a8a;padding-bottom:12px;margin-bottom:18px">
          <div class="bdoc-doc-title">事業計画・財務資料</div>
          <div class="bdoc-doc-company">${escHtml(company.name)}</div>
          <div class="bdoc-doc-meta">作成日：${dstr}　／　${curYear+1}年${fiscalMonth}月期　（${curYear}年${budget.startMonth||4}月〜${curYear+1}年${fiscalMonth}月）</div>
        </div>

        <!-- 財務指標 -->
        <div class="bdoc-section">
          <div class="bdoc-h">財務指標サマリー</div>
          <div class="bdoc-kpi-grid">
            ${ratioCard('自己資本比率', ratios?.equityRatio, '%', 30, 15, 0)}
            ${ratioCard('流動比率',     ratios?.currentRatio,'%', 150, 100, 0)}
            ${ratioCard('DSCR（返済余力）', ratios?.dscr,   '倍', 1.5, 1.0, 0)}
            ${ratioCard('インタレスト\nカバレッジ', ratios?.icr, '倍', 3, 1.5, 0)}
          </div>
          ${!cs?.loanRepay ? '<div style="font-size:11px;color:#888;margin-top:6px">※ DSCR：資金繰りページで借入返済額を入力すると算定されます</div>' : ''}
        </div>

        <!-- 事業概要 -->
        ${(memo.business || memo.purpose) ? `
        <div class="bdoc-section">
          <div class="bdoc-h">事業概要・資金計画</div>
          <table class="bdoc-table" style="margin-top:0">
            ${memo.business ? `<tr><td style="text-align:left;font-weight:700;width:120px;white-space:nowrap">事業内容・強み</td><td style="text-align:left;white-space:pre-wrap">${escHtml(memo.business)}</td></tr>` : ''}
            ${memo.purpose  ? `<tr><td style="text-align:left;font-weight:700;white-space:nowrap">資金使途・返済財源</td><td style="text-align:left;white-space:pre-wrap">${escHtml(memo.purpose)}</td></tr>` : ''}
          </table>
        </div>` : ''}

        <!-- 会社基本情報 -->
        <div class="bdoc-section">
          <div class="bdoc-h">会社概要</div>
          <table class="bdoc-table" style="margin-top:0">
            <tr><td style="text-align:left;font-weight:700;width:120px">会社名</td><td style="text-align:left">${escHtml(company.name)}</td><td style="text-align:left;font-weight:700;width:100px">資本金</td><td style="text-align:left">${((company.capital||10000000)/10000).toLocaleString()}万円</td></tr>
            <tr><td style="text-align:left;font-weight:700">決算月</td><td style="text-align:left">${fiscalMonth}月</td><td style="text-align:left;font-weight:700">業種</td><td style="text-align:left">${escHtml(company.industry||'—')}</td></tr>
          </table>
        </div>
      </div>

      <!-- 2ページ目：PL・BS -->
      <div class="bdoc-page">
        <div class="bdoc-section">
          <div class="bdoc-h">１．要約損益計算書（3期比較・千円）</div>
          <table class="bdoc-table">
            <thead><tr><th style="text-align:left">科目</th>${yHead}</tr></thead>
            <tbody>
              ${plRow('売上高', 'sales', true)}
              ${plRow('変動費（売上原価）', 'varTotal', false, true)}
              ${plRow('限界利益', 'marginal', true)}
              ${plRow('人件費', 'labor', false, true)}
              ${plRow('その他固定費', 'otherFixedSga', false, true)}
              ${plRow('固定費合計', 'fixedTotal', true)}
              ${plRow('経常利益', 'ord', true)}
              ${plRow('税引前当期純利益', 'pretax')}
              ${plRow('当期純利益', 'net', true)}
            </tbody>
          </table>
        </div>
        <div class="bdoc-section">
          <div class="bdoc-h">２．要約貸借対照表（3期比較・千円）</div>
          <table class="bdoc-table">
            <thead><tr><th style="text-align:left">科目</th>${yHead}</tr></thead>
            <tbody>
              ${bsRow('流動資産', 'curAsset')}
              ${bsRow('固定・繰延資産', 'fixAsset')}
              ${bsRow('総資産', 'totalAssets', true)}
              ${bsRow('流動負債', 'curLiab')}
              ${bsRow('固定負債', 'fixLiab')}
              ${bsRow('負債合計', 'totalLiab', true)}
              ${bsRow('純資産', 'equity', true)}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 3ページ目：資金繰り・5か年 -->
      <div class="bdoc-page">
        <div class="bdoc-section">
          <div class="bdoc-h">３．資金繰り予測（12か月・千円）</div>
          ${cfSection}
        </div>
        <div class="bdoc-section" id="bdoc-fy-wrap">
          <div class="bdoc-h">４．中期経営計画（5か年・千円）</div>
          <div id="bdoc-fy-table">${fySection}</div>
          <div class="bdoc-fy-footnote print-only" id="bdoc-fy-note" style="font-size:10px;color:#888;margin-top:6px">
            前提：売上+${_bdRates.sales}% / 原価+${_bdRates.cogs}% / 人件費+${_bdRates.salary}% / 家賃+${_bdRates.rent}% / その他+${_bdRates.other}%（毎年）
          </div>
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:16px;border-top:1px solid var(--border);padding-top:8px">
          ※ 本資料は月次予算・実績データに基づく概算です。5か年計画は一定の成長率前提による試算値です。
        </div>
      </div>

    </div>

    <style>
      .bdoc-toolbar { display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 16px;background:var(--white);border-bottom:1px solid var(--border);margin-bottom:16px; }
      .bdoc-sheet { background:#fff; }
      .bdoc-page { padding:0 0 20px; }
      .bdoc-page + .bdoc-page { border-top:2px dashed var(--border);padding-top:20px; }
      .bdoc-section { margin-bottom:18px;page-break-inside:avoid; }
      .bdoc-h { font-size:14px;font-weight:700;color:#1e40af;border-left:4px solid #1e40af;padding-left:8px;margin-bottom:10px; }
      .bdoc-doc-title { font-size:22px;font-weight:800;margin-bottom:6px; }
      .bdoc-doc-company { font-size:16px;font-weight:700;margin-bottom:4px; }
      .bdoc-doc-meta { font-size:11px;color:var(--text-muted); }
      .bdoc-kpi-grid { display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:6px; }
      .bdoc-kpi { background:var(--gray-50);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px; }
      .bdoc-kpi-label { font-size:11px;color:var(--text-muted);margin-bottom:4px;white-space:pre-line; }
      .bdoc-kpi-val { font-size:18px;font-weight:700;font-variant-numeric:tabular-nums; }
      .bdoc-kpi-guide { font-size:10px;color:var(--text-muted);margin-top:3px; }
      .bdoc-table { width:100%;border-collapse:collapse;font-size:12px;margin-top:4px; }
      .bdoc-table th,.bdoc-table td { border:1px solid #cfcfcf;padding:5px 8px;text-align:right; }
      .bdoc-table thead th { background:#f1f5f9;text-align:center; }
      .bdoc-table .num { text-align:right;font-variant-numeric:tabular-nums; }
      .bdoc-cf { font-size:11px; }
      .bdoc-cf th,.bdoc-cf td { padding:4px 5px; }
      .bdoc-slider-row { display:flex;align-items:center;gap:8px; }
      .bdoc-slider-label { font-size:12px;color:var(--text);min-width:100px; }
      .bdoc-slider-val { font-size:12px;font-weight:600;min-width:36px;text-align:right; }
      @media print {
        .bdoc-toolbar,.bdoc-cover .no-print { display:none!important; }
        .bdoc-sheet { display:block; }
        .bdoc-page + .bdoc-page { border-top:none;page-break-before:always; }
        .bdoc-kpi-grid { grid-template-columns:repeat(4,1fr)!important; }
        .bdoc-fy-footnote { display:block!important; }
      }
    </style>
  `;
}

// --- スライダー連動：5か年テーブルだけ再描画 ---
function _bdUpdateFY() {
  ['sales','cogs','salary','rent','other'].forEach(k => {
    const el = document.getElementById(`bds_${k}`);
    if (el) _bdRates[k] = parseInt(el.value);
  });
  const budget = window.App?.currentBudget;
  const fy = _bdFiveYear(budget, _bdRates);
  if (!fy) return;
  const K = v => v == null ? '—' : Math.round(v / 1000).toLocaleString('ja-JP');
  const heads = ['当期','1年目','2年目','3年目','4年目','5年目'].map(h=>`<th>${h}</th>`).join('');
  const series = [fy.base, ...fy.years];
  const fyRow = (label, key, bold) => `<tr${bold?' style="font-weight:700;background:#f8fafc"':''}>
    <td style="text-align:left">${label}</td>${series.map(x=>`<td class="num">${K(x[key])}</td>`).join('')}</tr>`;
  const html = `<table class="bdoc-table">
    <thead><tr><th style="text-align:left">5か年計画（千円）</th>${heads}</tr></thead>
    <tbody>
      ${fyRow('売上高','sales',true)}${fyRow('売上原価','cogs')}${fyRow('売上総利益','gross',true)}
      ${fyRow('人件費','salary')}${fyRow('減価償却費','depr')}${fyRow('その他固定費','other')}
      ${fyRow('販管費計','sga')}${fyRow('営業利益','op',true)}
    </tbody></table>`;
  const wrap = document.getElementById('bdoc-fy-table');
  if (wrap) wrap.innerHTML = html;
  const note = document.getElementById('bdoc-fy-note');
  if (note) note.textContent = `前提：売上+${_bdRates.sales}% / 原価+${_bdRates.cogs}% / 人件費+${_bdRates.salary}% / 家賃+${_bdRates.rent}% / その他+${_bdRates.other}%（毎年）`;
}

// --- 事業概要を保存して再描画 ---
function _bdSaveAndRender() {
  const company = window.App?.currentCompany;
  if (!company) return;
  const memo = {
    business: document.getElementById('bd_business')?.value || '',
    purpose:  document.getElementById('bd_purpose')?.value  || '',
  };
  _bdSaveMemo(company.id, memo);
  showToast('事業概要を保存しました', 'success', 2500);
  // 印刷本体の事業概要部分のみ更新
  const container = document.getElementById('main_content');
  if (container) renderBankDoc(container);
}
