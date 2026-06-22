// メインアプリケーション

window.App = {
  companies: [],
  currentCompany: null,
  currentYear: new Date().getFullYear(),
  currentBudget: null,
  currentPage: 'home',
  currentPhase: 1,
};

// 共通フォーマット関数（全モジュールから参照）
const _safeN = v => (isNaN(v) || !isFinite(v)) ? 0 : v;
window.fmt  = v => Math.round(_safeN(v)).toLocaleString('ja-JP') + '円';
window.fmtK = v => Math.round(_safeN(v) / 1000).toLocaleString('ja-JP');

document.addEventListener('DOMContentLoaded', () => {
  loadApp();
  setupNav();

  document.getElementById('company_select')?.addEventListener('change', e => selectCompany(e.target.value));
  document.getElementById('year_select')?.addEventListener('change', e => {
    App.currentYear = parseInt(e.target.value);
    if (App.currentCompany) {
      loadBudget(App.currentCompany.id, App.currentYear);
      showPage(App.currentPage);
    }
  });
  document.getElementById('company_modal')?.addEventListener('click', e => {
    if (e.target.id === 'company_modal') closeCompanyModal();
  });
});

function loadApp() {
  App.companies = getCompanies();
  renderCompanyList();
  setPhase(1);
  if (App.companies.length > 0) {
    selectCompany(App.companies[0].id);
  } else {
    showPage('budget');
  }
}

// ===== 会社管理 =====
function renderCompanyList() {
  const sel = document.getElementById('company_select');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- 会社を選択 --</option>' +
    App.companies.map(c =>
      `<option value="${c.id}" ${App.currentCompany?.id === c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`
    ).join('');
}

function selectCompany(id) {
  const company = App.companies.find(c => c.id === id);
  if (!company) {
    App.currentCompany = null;
    App.currentBudget  = null;
    document.getElementById('company_select').value = '';
    showPage(App.currentPage);
    return;
  }
  App.currentCompany = company;
  updateNavForIndustry(company);
  const years = getYearsForCompany(id);
  const year  = years.includes(App.currentYear) ? App.currentYear : (years[0] || new Date().getFullYear());
  App.currentYear = year;
  renderYearSelect(years);
  loadBudget(id, year);
  showPage(App.currentPage);
}

function updateNavForIndustry(company) {
  const navRev = document.getElementById('nav_revenue');
  if (!navRev) return;
  const isTaxAccountant = company?.industry === 'tax_accountant';
  navRev.style.display = isTaxAccountant ? '' : 'none';
  // 顧問先売上管理を表示中に業種変更された場合はホームへ
  if (!isTaxAccountant && App.currentPage === 'revenue') {
    showPage('home');
  }
}

function renderYearSelect(years) {
  const sel = document.getElementById('year_select');
  if (!sel) return;
  const cur = new Date().getFullYear();
  const allYears = [...new Set([...years, cur, cur + 1, cur + 2])].sort((a, b) => b - a);
  const cid = App.currentCompany?.id;
  sel.innerHTML = allYears.map(y => {
    const filled = cid && hasBudgetData(cid, y);
    return `<option value="${y}" ${y === App.currentYear ? 'selected' : ''}>${y}年度${filled ? '' : '（未入力）'}</option>`;
  }).join('');
}

// 「次年度を作成」: 当年度実績ベースで翌年度を生成し、その年度へ切替
function createNextYear() {
  const company = App.currentCompany;
  if (!company) { alert('先に会社を選択してください'); return; }
  const fromYear = App.currentYear;
  const toYear   = fromYear + 1;

  if (!hasBudgetData(company.id, fromYear)) {
    alert(`${fromYear}年度にデータがありません。先に当年度の予算・実績を入力してから次年度を作成してください。`);
    return;
  }
  if (hasBudgetData(company.id, toYear)) {
    const ok = confirm(`${toYear}年度には既にデータがあります。\n${fromYear}年度の実績で上書きして作り直しますか？\n（OK=上書き / キャンセル=中止）`);
    if (!ok) return;
  } else {
    const ok = confirm(
      `${fromYear}年度の実績をベースに ${toYear}年度 を作成します。\n\n` +
      `・勘定科目の構成を引き継ぎます\n` +
      `・BSの期末残高を ${toYear}年度の期首残高として引き継ぎます\n` +
      `・PL予算は ${fromYear}年度の実績で初期化します\n\n` +
      `よろしいですか？`
    );
    if (!ok) return;
  }

  const nb = createNextYearBudget(company.id, fromYear);
  if (!nb) { alert('作成に失敗しました'); return; }

  // 税理士法人：顧問先売上・課税設定も翌年度へ引き継ぐ
  let revMsg = '';
  if (company.industry === 'tax_accountant' && typeof carryRevenueToNextYear === 'function') {
    const n = carryRevenueToNextYear(company.id, fromYear);
    revMsg = `\n顧問先売上：${n}件を引き継ぎました`;
  }

  App.currentYear   = toYear;
  App.currentBudget = nb;
  renderYearSelect(getYearsForCompany(company.id));
  showPage(App.currentPage);
  alert(`${toYear}年度を作成しました。\n${fromYear}年度の実績をベースに予算が初期化されています。${revMsg}`);
}

function loadBudget(companyId, year) {
  let budget = getBudget(companyId, year);
  if (!budget) {
    budget = createDefaultBudget(companyId, year);
    saveBudget(budget);
  }
  App.currentBudget = budget;
}

function openCompanyModal(editId) {
  const modal   = document.getElementById('company_modal');
  const company = editId ? App.companies.find(c => c.id === editId) : null;
  document.getElementById('modal_company_id').value   = company?.id || '';
  document.getElementById('modal_company_name').value = company?.name || '';
  document.getElementById('modal_capital').value      = company?.capital || 10000000;
  document.getElementById('modal_pref').value         = company?.prefecture || '東京都';
  document.getElementById('modal_fiscal').value       = company?.fiscalMonth || 3;
  document.getElementById('modal_invoice').value           = company?.invoiceRegistered ? '1' : '0';
  document.getElementById('modal_kani').value               = company?.kanijukazei ? '1' : '0';
  document.getElementById('modal_kijun').value              = company?.kijunUriage || 0;
  document.getElementById('modal_industry').value           = company?.industry || 'other';
  document.getElementById('modal_business_type').value      = company?.businessType || 5;
  document.getElementById('modal_prepaid1').value           = company?.prepaid1 || 0;
  if (document.getElementById('modal_prepaid2')) document.getElementById('modal_prepaid2').value = company?.prepaid2 || 0;
  document.getElementById('modal_ctax_prepaid').value       = company?.ctaxPrepaid || 0;
  document.getElementById('modal_employees').value          = company?.employees || 1;
  modal.classList.add('open');
}

function closeCompanyModal() {
  document.getElementById('company_modal').classList.remove('open');
}

function saveCompanyForm() {
  const id      = document.getElementById('modal_company_id').value;
  const name    = document.getElementById('modal_company_name').value.trim();
  const capital = parseFloat(document.getElementById('modal_capital').value) || 10000000;
  const pref    = document.getElementById('modal_pref').value;
  const fiscal  = parseInt(document.getElementById('modal_fiscal').value) || 3;
  if (!name) { alert('会社名を入力してください'); return; }

  const invoice       = document.getElementById('modal_invoice')?.value === '1';
  const kani          = document.getElementById('modal_kani')?.value === '1';
  const kijun         = parseFloat(document.getElementById('modal_kijun')?.value) || 0;
  const industry      = document.getElementById('modal_industry')?.value || 'other';
  const businessType  = parseInt(document.getElementById('modal_business_type')?.value) || 5;
  const prepaid1      = parseFloat(document.getElementById('modal_prepaid1')?.value) || 0;
  const prepaid2      = parseFloat(document.getElementById('modal_prepaid2')?.value) || 0;
  const ctaxPrepaid   = parseFloat(document.getElementById('modal_ctax_prepaid')?.value) || 0;
  const employees     = parseInt(document.getElementById('modal_employees')?.value) || 1;
  const company = { id: id || generateId(), name, capital, prefecture: pref, fiscalMonth: fiscal,
    invoiceRegistered: invoice, kanijukazei: kani, kijunUriage: kijun, industry, businessType, prepaid1, prepaid2, ctaxPrepaid, employees };
  saveCompany(company);
  App.companies = getCompanies();
  App.currentCompany = company;
  updateNavForIndustry(company);
  renderCompanyList();
  selectCompany(company.id);
  closeCompanyModal();
}

function deleteCurrentCompany() {
  if (!App.currentCompany) return;
  if (!confirm(`「${App.currentCompany.name}」を削除しますか?`)) return;
  deleteCompany(App.currentCompany.id);
  App.companies      = getCompanies();
  App.currentCompany = null;
  App.currentBudget  = null;
  renderCompanyList();
  showPage(App.currentPage);
}

// ===== ページ管理 =====
function togglePhase(phase) {
  const isActive = App.currentPhase === phase;
  [1, 2, 3].forEach(p => {
    const nav = document.getElementById(`phase-nav-${p}`);
    const icon = document.getElementById(`phase-toggle-${p}`);
    const label = document.querySelector(`#phase-section-${p} .sidebar-phase-label`);
    if (!nav) return;
    if (p === phase && !isActive) {
      nav.style.display = 'block';
      if (icon) icon.textContent = '▾';
      label?.classList.add('active-phase');
    } else {
      nav.style.display = 'none';
      if (icon) icon.textContent = '▸';
      label?.classList.remove('active-phase');
    }
  });
  if (!isActive) App.currentPhase = phase;
}

function setPhase(phase) {
  App.currentPhase = phase;
  [1, 2, 3].forEach(p => {
    const nav = document.getElementById(`phase-nav-${p}`);
    const icon = document.getElementById(`phase-toggle-${p}`);
    const label = document.querySelector(`#phase-section-${p} .sidebar-phase-label`);
    if (!nav) return;
    if (p === phase) {
      nav.style.display = 'block';
      if (icon) icon.textContent = '▾';
      label?.classList.add('active-phase');
    } else {
      nav.style.display = 'none';
      if (icon) icon.textContent = '▸';
      label?.classList.remove('active-phase');
    }
  });
}

function setupNav() {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => {
      const phase = el.dataset.phase !== undefined ? parseInt(el.dataset.phase) : App.currentPhase;
      if (phase !== App.currentPhase) setPhase(phase);
      showPage(el.dataset.page);
    });
  });
}

function showPage(page) {
  App.currentPage = page;
  document.querySelectorAll('[data-page]').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page && (!el.dataset.phase || parseInt(el.dataset.phase) === App.currentPhase))
  );

  const container = document.getElementById('main_content');
  if (!container) return;
  const budget  = App.currentBudget;

  switch (page) {
    case 'home':       renderHome(container);                             break;
    case 'budget':     renderGrid(container, budget);                     break;
    case 'revenue':    renderRevenue(container);                          break;
    case 'import':     renderImport(container);                           break;
    case 'simulation': renderSimulation(container, budget);               break;
    case 'nextyear':   renderNextYearSim(container, budget);              break;
    case 'fiveyear':   renderFiveYearSim(container, budget);              break;
    case 'cashflow':   renderCashFlow(container, budget);                 break;
    case 'execcomp':   renderExecComp(container, budget);                 break;
    case 'welfare':    renderWelfare(container);                          break;
    case 'tax':        renderTaxSimulator(container);                     break;
    case 'ctax':       renderCtaxJudge(container);                        break;
    case 'health':     renderHealthDiag(container, budget);               break;
    case 'taxsummary':     renderTaxSummary(container);                   break;
    case 'forecastreport': renderForecastReport(container);               break;
    case 'bizanalysis': renderBizAnalysis(container);                     break;
    default:           container.innerHTML = '<div class="no-data">ページが見つかりません</div>';
  }
}

// ===== 単年度シミュレーション（PL/BS） =====
function renderSimulation(container, budget) {
  if (!budget) {
    container.innerHTML = '<div class="no-data">予算データがありません。まず月次予算を入力してください。</div>';
    return;
  }

  const months     = getMonthLabels(budget.startMonth || 4);
  const hasDynamic = !!(budget.dynamicAccounts?.length);
  const allVals    = hasDynamic ? calcAllValuesDynamic(budget) : calcAllValues(budget.rows);

  // 調整列（index 12）を最終月（3月=index 11）に合算して12列に正規化
  const normalize = arr => {
    const v = Array.from({ length: 12 }, (_, i) => arr[i] || 0);
    if (arr.length > 12) v[11] += arr[12] || 0;
    return v;
  };

  // ===== PL =====
  let plItems, chartSales, chartSga, chartOp;

  if (hasDynamic) {
    const g = id => normalize(allVals[id] || new Array(12).fill(0));
    plItems = [
      { label: '売上高',               vals: g('sec_revenue'),  bold: false },
      { label: '売上原価',             vals: g('sec_cogs'),     bold: false },
      { label: '売上総利益',           vals: g('calc_gross'),   bold: true  },
      { label: '販売費及び一般管理費', vals: g('sec_sga'),      bold: false },
      { label: '営業利益',             vals: g('calc_op'),      bold: true  },
      { label: '営業外収益',           vals: g('sec_other_inc'),bold: false },
      { label: '営業外費用',           vals: g('sec_other_exp'),bold: false },
      { label: '経常利益',             vals: g('calc_ord'),     bold: true  },
      { label: '税引前当期純利益',     vals: g('calc_pretax'),  bold: true  },
      { label: '当期純利益',           vals: g('calc_net'),     bold: true  },
    ].filter(item => item.vals.some(v => v !== 0) || item.bold);
    chartSales = g('sec_revenue');
    chartSga   = g('sec_sga');
    chartOp    = g('calc_op');
  } else {
    const pl = calcPL(budget.rows);
    plItems = [
      { label: '売上高',               vals: normalize(pl.sales),         bold: false },
      { label: '売上原価',             vals: normalize(pl.cogs),          bold: false },
      { label: '売上総利益',           vals: normalize(pl.gross_profit),  bold: true  },
      { label: '販売費及び一般管理費', vals: normalize(pl.sga),           bold: false },
      { label: '営業利益',             vals: normalize(pl.op_profit),     bold: true  },
      { label: '経常利益',             vals: normalize(pl.ord_profit),    bold: true  },
      { label: '税引前当期純利益',     vals: normalize(pl.pretax_profit), bold: true  },
      { label: '当期純利益',           vals: normalize(pl.net_profit),    bold: true  },
    ];
    chartSales = normalize(pl.sales);
    chartSga   = normalize(pl.sga);
    chartOp    = normalize(pl.op_profit);
  }

  // ===== BS =====
  let bsAssetsRows, bsLiabRows;
  const fmtBs = v => Math.round(v || 0).toLocaleString('ja-JP') + '円';

  if (hasDynamic) {
    const last = id => (allVals[id] || new Array(12).fill(0))[11];
    const curAsset  = last('sec_cur_asset');
    const fixAsset  = last('sec_fix_asset');
    const otherAsset= last('sec_other_asset');
    const totalAsset= curAsset + fixAsset + otherAsset || last('sec_total_asset');
    const curLiab   = last('sec_cur_liab');
    const fixLiab   = last('sec_fix_liab');
    const totalLiab = curLiab + fixLiab || last('sec_total_liab');
    const equity    = last('sec_equity');

    // 現預金を動的科目から探す
    const cashAcc = budget.dynamicAccounts.find(a => a.cashGroup && a.section?.startsWith('bs'))
      || budget.dynamicAccounts.find(a =>
        a.name.replace(/\s/g,'').match(/現金|預金|現預金|信金|銀行|信用組合/) && a.section?.startsWith('bs')
      );
    const cash = cashAcc ? last(cashAcc.id) : 0;

    bsAssetsRows = [
      cash > 0 ? ['現金預金', cash, false] : null,
      ['流動資産合計', curAsset,   true ],
      ['固定資産合計', fixAsset,   false],
      otherAsset ? ['その他資産', otherAsset, false] : null,
      ['資産合計',     totalAsset, true ],
    ].filter(Boolean);

    bsLiabRows = [
      ['流動負債合計',   curLiab,   false],
      ['固定負債合計',   fixLiab,   false],
      ['負債合計',       totalLiab, true ],
      ['純資産合計',     equity,    false],
      ['負債純資産合計', totalLiab + equity, true],
    ];
  } else {
    const bs = calcBS(budget.rows);
    bsAssetsRows = [
      ['現金預金',       bs.current_assets[11], false],
      ['流動資産合計',   bs.current_assets[11], true ],
      ['固定資産合計',   bs.fixed_assets[11],   false],
      ['資産合計',       bs.total_assets[11],   true ],
    ];
    bsLiabRows = [
      ['流動負債合計',   bs.current_liab[11],   false],
      ['固定負債合計',   bs.fixed_liab[11],     false],
      ['負債合計',       bs.total_liab[11],     true ],
      ['純資産合計',     bs.total_equity[11],   false],
      ['負債純資産合計', bs.total_liab_eq[11],  true ],
    ];
  }

  const tableRows = items => items.map(item => {
    const total = item.vals.reduce((a, b) => a + b, 0);
    return `<tr class="${item.bold ? 'bold-row' : ''}">
      <td>${item.label}</td>
      ${item.vals.map(v => `<td class="num">${fmtK(v)}</td>`).join('')}
      <td class="num" style="font-weight:700">${fmtK(total)}</td>
    </tr>`;
  }).join('');

  const bsRow = ([l, v, b]) =>
    `<tr class="${b ? 'bold-row' : ''}"><td>${l}</td><td class="num">${fmtBs(v)}</td></tr>`;

  container.innerHTML = `
    <div class="sim-panel">
      <div>
        <h2 class="section-title">単年度 PL / BS</h2>
        <p class="section-sub">月次予算から自動生成した損益計算書・貸借対照表</p>
      </div>

      <div class="card-h">
        <h3>📊 月次損益計算書（PL）</h3>
        <div class="table-scroll">
          <table class="result-table">
            <thead>
              <tr>
                <th style="min-width:170px">科目</th>
                ${months.map(m => `<th style="min-width:72px">${m}</th>`).join('')}
                <th>合計</th>
              </tr>
            </thead>
            <tbody>${tableRows(plItems)}</tbody>
          </table>
        </div>
        <div class="wf-note">単位：千円</div>
      </div>

      <div class="card-h">
        <canvas id="sim_chart" height="90"></canvas>
      </div>

      <div class="sim-grid">
        <div class="card-h">
          <h3>🏦 貸借対照表 — 資産（期末）</h3>
          <table class="result-table">
            <tbody>${bsAssetsRows.map(bsRow).join('')}</tbody>
          </table>
        </div>
        <div class="card-h">
          <h3>📋 貸借対照表 — 負債・純資産（期末）</h3>
          <table class="result-table">
            <tbody>${bsLiabRows.map(bsRow).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>`;

  if (typeof Chart !== 'undefined') {
    const ctx = document.getElementById('sim_chart');
    if (ctx) new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          { label: '売上高',   data: chartSales.map(v => v/1000), backgroundColor: 'rgba(59,130,246,.2)', borderColor: 'rgba(59,130,246,.7)', borderWidth: 1.5 },
          { label: '販管費',   data: chartSga.map(v => v/1000),   backgroundColor: 'rgba(239,68,68,.15)',  borderColor: 'rgba(239,68,68,.6)',   borderWidth: 1.5 },
          { label: '営業利益', data: chartOp.map(v => v/1000),    type: 'line', borderColor: '#f59e0b', borderWidth: 2, pointBackgroundColor: '#f59e0b', fill: false },
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' },
          title: { display: true, text: '月次PL推移（千円）', font: { size: 13, weight: '700' } }
        },
        scales: { y: { beginAtZero: false, grid: { color: 'rgba(59,130,246,.06)' } } }
      }
    });
  }
}

// escHtml（grid.jsより先にapp.jsで定義、両方から使える）
function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
