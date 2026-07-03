// ===== 銀行提出資料（数値版）：要約財務諸表(3期) ＋ 資金繰り予測 ＋ 5か年計画 =====

// 5か年計画（デフォルト成長率で自動計算・対話フォーム不要）
// 売上110% / 原価105% / 人件費103% / 家賃100% / その他102% を当期実績ベースに適用
function _bankFiveYear(budget) {
  if (!budget) return null;
  const annSum = arr => (arr ? arr.slice(0, 13).reduce((a, b) => a + b, 0) : 0);
  let curSales, curCogs, curSalary, curRent, curOther;
  if (budget.dynamicAccounts && budget.dynamicAccounts.length) {
    const av = calcAllValuesDynamic(budget);
    const accts = budget.dynamicAccounts;
    const dynSum = id => annSum(av[id] || []);
    const matchSum = re => {
      const matching = accts.filter(a => a.type !== 'section' && (a.indent ?? 1) <= 1 && re.test(a.name || ''));
      return matching.reduce((s, a) => s + dynSum(a.id), 0);
    };
    curSales  = dynSum('sec_revenue');
    curCogs   = dynSum('sec_cogs');
    curSalary = matchSum(/給与|給料|賃金|役員報酬|役員賞与|賞与|法定福利|福利厚生|厚生費|福利費|人件費|雑給|退職|手当/);
    curRent   = matchSum(/家賃|地代|賃借料|リース/);
    curOther  = dynSum('sec_sga') - curSalary - curRent;
  } else if (typeof calcPL === 'function') {
    const pl = calcPL(budget.rows || {});
    curSales  = annSum(pl.sales);
    curCogs   = annSum(pl.cogs);
    curSalary = annSum(pl.sga_salary);
    curRent   = annSum((budget.rows || {}).sga_rent || []);
    curOther  = annSum(pl.sga) - curSalary - curRent;
  } else return null;

  const R = { sales: 1.10, cogs: 1.05, salary: 1.03, rent: 1.00, other: 1.02 };
  const years = [];
  let s = curSales, c = curCogs, sal = curSalary, rent = curRent, oth = curOther;
  for (let y = 1; y <= 5; y++) {
    s *= R.sales; c *= R.cogs; sal *= R.salary; rent *= R.rent; oth *= R.other;
    const sga = sal + rent + oth;
    const gross = s - c;
    const op = gross - sga;
    years.push({ y, sales: s, cogs: c, gross, salary: sal, rent, other: oth, sga, op });
  }
  return { base: { sales: curSales, cogs: curCogs, gross: curSales - curCogs, salary: curSalary, rent: curRent, other: curOther, sga: curSalary + curRent + curOther, op: (curSales - curCogs) - (curSalary + curRent + curOther) }, years };
}

function renderBankDoc(container) {
  const company = window.App?.currentCompany;
  const budget  = window.App?.currentBudget;
  const curYear = window.App?.currentYear || new Date().getFullYear();
  if (!company || !budget) { container.innerHTML = '<div class="no-data">会社と年度を選択してください</div>'; return; }
  const fiscalMonth = company.fiscalMonth || 3;
  const startMonth  = budget.startMonth || 4;

  const K = v => (v == null ? '—' : Math.round(v / 1000).toLocaleString('ja-JP'));

  // --- 1. 要約損益計算書（3期比較） ---
  const years3 = [curYear - 2, curYear - 1, curYear];
  const budgets3 = years3.map(y => (y === curYear ? budget : (typeof getBudget === 'function' ? getBudget(company.id, y) : null)));
  const plData = budgets3.map(b => (typeof summarizePL === 'function' ? summarizePL(b) : null));
  const bsData = budgets3.map(b => (typeof summarizeBS === 'function' ? summarizeBS(b) : null));
  const yHead = years3.map((y, i) => `<th>${i === 0 ? '前々期' : i === 1 ? '前期' : '当期'}<br><span style="font-weight:400;font-size:10px">（${y + 1}年${fiscalMonth}月期）</span></th>`).join('');

  const plRow = (label, key, bold) => `<tr${bold ? ' style="font-weight:700;background:#f8fafc"' : ''}>
    <td style="text-align:left">${label}</td>
    ${plData.map(d => `<td class="num">${d ? K(d[key]) : '—'}</td>`).join('')}
  </tr>`;
  const bsRow = (label, key, bold) => `<tr${bold ? ' style="font-weight:700;background:#f8fafc"' : ''}>
    <td style="text-align:left">${label}</td>
    ${bsData.map(d => `<td class="num">${d ? K(d[key]) : '—'}</td>`).join('')}
  </tr>`;

  const plTable = `
    <table class="bankdoc-table">
      <thead><tr><th style="text-align:left">損益（要約・千円）</th>${yHead}</tr></thead>
      <tbody>
        ${plRow('売上高', 'sales', true)}
        ${plRow('変動費（売上原価）', 'varTotal')}
        ${plRow('限界利益', 'marginal', true)}
        ${plRow('人件費', 'labor')}
        ${plRow('その他固定費', 'otherFixedSga')}
        ${plRow('固定費合計', 'fixedTotal', true)}
        ${plRow('経常利益', 'ord', true)}
        ${plRow('税引前当期純利益', 'pretax')}
        ${plRow('当期純利益', 'net', true)}
      </tbody>
    </table>`;

  const bsTable = `
    <table class="bankdoc-table">
      <thead><tr><th style="text-align:left">財政状態（要約・千円）</th>${yHead}</tr></thead>
      <tbody>
        ${bsRow('流動資産', 'curAsset')}
        ${bsRow('固定・繰延資産', 'fixAsset')}
        ${bsRow('総資産', 'totalAssets', true)}
        ${bsRow('流動負債', 'curLiab')}
        ${bsRow('固定負債', 'fixLiab')}
        ${bsRow('負債合計', 'totalLiab', true)}
        ${bsRow('純資産', 'equity', true)}
      </tbody>
    </table>`;

  // --- 2. 資金繰り予測（12か月） ---
  let cfTable = '<div class="no-data-small">資金繰りデータがありません。</div>';
  const cs = (typeof computeCashSeries === 'function') ? computeCashSeries(company, budget) : null;
  if (cs && cs.rows && cs.rows.length) {
    const months = cs.rows.map(r => `<th>${r.calMonth}月</th>`).join('');
    const rowLine = (label, pick, bold) => `<tr${bold ? ' style="font-weight:700"' : ''}>
      <td style="text-align:left">${label}</td>${cs.rows.map(r => `<td class="num">${K(pick(r))}</td>`).join('')}</tr>`;
    cfTable = `
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">期首現預金：${K(cs.openCash)}千円 ／ 単位：千円${cs.hasShortage ? ' ／ <span style="color:#b91c1c;font-weight:700">⚠ 資金不足月あり</span>' : ''}</div>
      <div style="overflow-x:auto"><table class="bankdoc-table bankdoc-cf">
        <thead><tr><th style="text-align:left">資金繰り</th>${months}</tr></thead>
        <tbody>
          ${rowLine('営業CF（利益＋償却）', r => r.opCF)}
          ${rowLine('財務CF（借入±返済）', r => r.finCF)}
          ${rowLine('法人税等の支払', r => r.taxCF)}
          ${rowLine('月末現預金残高', r => r.cash, true)}
        </tbody>
      </table></div>`;
  }

  // --- 3. 5か年計画（デフォルト成長率） ---
  let fyTable = '<div class="no-data-small">5か年データを計算できません。</div>';
  const fy = _bankFiveYear(budget);
  if (fy) {
    const heads = ['当期', '1年目', '2年目', '3年目', '4年目', '5年目'].map(h => `<th>${h}</th>`).join('');
    const series = [fy.base, ...fy.years];
    const fyRow = (label, key, bold) => `<tr${bold ? ' style="font-weight:700;background:#f8fafc"' : ''}>
      <td style="text-align:left">${label}</td>${series.map(x => `<td class="num">${K(x[key])}</td>`).join('')}</tr>`;
    fyTable = `
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">前提：売上+10% / 原価+5% / 人件費+3% / 家賃±0% / その他+2%（毎年）・単位：千円</div>
      <table class="bankdoc-table">
        <thead><tr><th style="text-align:left">5か年計画</th>${heads}</tr></thead>
        <tbody>
          ${fyRow('売上高', 'sales', true)}
          ${fyRow('売上原価', 'cogs')}
          ${fyRow('売上総利益', 'gross', true)}
          ${fyRow('人件費', 'salary')}
          ${fyRow('その他固定費', 'other')}
          ${fyRow('販管費計', 'sga')}
          ${fyRow('営業利益', 'op', true)}
        </tbody>
      </table>`;
  }

  const today = new Date();
  const dstr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

  container.innerHTML = `
    <div class="bizanalysis-wrap bankdoc">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px" class="no-print">
        <div>
          <div style="font-size:20px;font-weight:800;color:var(--text)">🏦 銀行提出資料（数値版）</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">要約財務諸表・資金繰り予測・5か年計画をまとめて印刷できます</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm btn-solid" onclick="window.print()">🖨 印刷 / PDF</button>
          <button class="btn btn-sm btn-outline" onclick="showPage('home')">← 戻る</button>
        </div>
      </div>

      <div class="bankdoc-sheet">
        <div style="text-align:center;margin-bottom:16px;border-bottom:2px solid var(--text);padding-bottom:10px">
          <div style="font-size:20px;font-weight:800">事業計画・財務資料</div>
          <div style="font-size:14px;margin-top:6px">${escHtml(company.name)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">作成日：${dstr}　／　${curYear + 1}年${fiscalMonth}月期</div>
        </div>

        <div class="bankdoc-section"><div class="bankdoc-h">１．要約損益計算書（3期比較）</div>${plTable}</div>
        <div class="bankdoc-section"><div class="bankdoc-h">２．要約貸借対照表（3期比較）</div>${bsTable}</div>
        <div class="bankdoc-section"><div class="bankdoc-h">３．資金繰り予測（12か月）</div>${cfTable}</div>
        <div class="bankdoc-section"><div class="bankdoc-h">４．中期経営計画（5か年）</div>${fyTable}</div>

        <div style="font-size:10px;color:var(--text-muted);margin-top:14px;border-top:1px solid var(--border);padding-top:8px">
          ※ 本資料は月次予算・実績データに基づく概算です。5か年計画は一定の成長率前提による試算値です。
        </div>
      </div>
    </div>

    <style>
      .bankdoc-sheet { background:#fff; }
      .bankdoc-section { margin-bottom:20px; page-break-inside:avoid; }
      .bankdoc-h { font-size:14px;font-weight:700;color:var(--primary,#1d6fb8);border-left:4px solid var(--primary,#1d6fb8);padding-left:8px;margin-bottom:8px; }
      .bankdoc-table { width:100%;border-collapse:collapse;font-size:12px; }
      .bankdoc-table th, .bankdoc-table td { border:1px solid #cfcfcf;padding:5px 8px;text-align:right; }
      .bankdoc-table thead th { background:#f1f5f9;text-align:center; }
      .bankdoc-table .num { text-align:right;font-variant-numeric:tabular-nums; }
      .bankdoc-cf { font-size:11px; }
      .bankdoc-cf th, .bankdoc-cf td { padding:4px 5px; }
    </style>`;
}
