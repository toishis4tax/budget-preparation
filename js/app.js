// メインアプリケーション

window.App = {
  companies: [],
  currentCompany: null,
  currentYear: new Date().getFullYear(),
  currentBudget: null,
  currentPage: 'home',
};

// 共通フォーマット関数（全モジュールから参照）
window.fmt  = v => Math.round(v).toLocaleString('ja-JP') + '円';
window.fmtK = v => Math.round(v / 1000).toLocaleString('ja-JP');

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
  const years = getYearsForCompany(id);
  const year  = years.includes(App.currentYear) ? App.currentYear : (years[0] || new Date().getFullYear());
  App.currentYear = year;
  renderYearSelect(years);
  loadBudget(id, year);
  showPage(App.currentPage);
}

function renderYearSelect(years) {
  const sel = document.getElementById('year_select');
  if (!sel) return;
  const cur = new Date().getFullYear();
  const allYears = [...new Set([...years, cur, cur + 1, cur + 2])].sort((a, b) => b - a);
  sel.innerHTML = allYears.map(y =>
    `<option value="${y}" ${y === App.currentYear ? 'selected' : ''}>${y}年度</option>`
  ).join('');
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
  document.getElementById('modal_invoice').value      = company?.invoiceRegistered ? '1' : '0';
  document.getElementById('modal_kani').value         = company?.kanijukazei ? '1' : '0';
  document.getElementById('modal_kijun').value        = company?.kijunUriage || 0;
  document.getElementById('modal_prepaid1').value     = company?.prepaid1 || 0;
  document.getElementById('modal_prepaid2').value     = company?.prepaid2 || 0;
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

  const invoice  = document.getElementById('modal_invoice')?.value === '1';
  const kani     = document.getElementById('modal_kani')?.value === '1';
  const kijun    = parseFloat(document.getElementById('modal_kijun')?.value) || 0;
  const prepaid1 = parseFloat(document.getElementById('modal_prepaid1')?.value) || 0;
  const prepaid2 = parseFloat(document.getElementById('modal_prepaid2')?.value) || 0;
  const company = { id: id || generateId(), name, capital, prefecture: pref, fiscalMonth: fiscal,
    invoiceRegistered: invoice, kanijukazei: kani, kijunUriage: kijun, prepaid1, prepaid2 };
  saveCompany(company);
  App.companies = getCompanies();
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
function setupNav() {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => showPage(el.dataset.page));
  });
}

function showPage(page) {
  App.currentPage = page;
  document.querySelectorAll('[data-page]').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page)
  );

  const container = document.getElementById('main_content');
  if (!container) return;
  const budget  = App.currentBudget;

  switch (page) {
    case 'home':       renderHome(container);                             break;
    case 'budget':     renderGrid(container, budget);                     break;
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
    default:           container.innerHTML = '<div class="no-data">ページが見つかりません</div>';
  }
}

// ===== 単年度シミュレーション（PL/BS） =====
function renderSimulation(container, budget) {
  if (!budget) {
    container.innerHTML = '<div class="no-data">予算データがありません。まず月次予算を入力してください。</div>';
    return;
  }
  const pl     = calcPL(budget.rows);
  const bs     = calcBS(budget.rows);
  const months = getMonthLabels(budget.startMonth || 4);

  const plItems = [
    { label: '売上高',               vals: pl.sales,         bold: false },
    { label: '売上原価',             vals: pl.cogs,          bold: false },
    { label: '売上総利益',           vals: pl.gross_profit,  bold: true  },
    { label: '販売費及び一般管理費', vals: pl.sga,           bold: false },
    { label: '営業利益',             vals: pl.op_profit,     bold: true  },
    { label: '経常利益',             vals: pl.ord_profit,    bold: true  },
    { label: '税引前当期純利益',     vals: pl.pretax_profit, bold: true  },
    { label: '当期純利益',           vals: pl.net_profit,    bold: true  },
  ];

  const tableRows = items => items.map(item => {
    const total = item.vals.reduce((a, b) => a + b, 0);
    return `<tr class="${item.bold ? 'bold-row' : ''}">
      <td>${item.label}</td>
      ${item.vals.map(v => `<td class="num">${fmtK(v)}</td>`).join('')}
      <td class="num" style="font-weight:700">${fmtK(total)}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="sim-panel">
      <div>
        <h2 class="section-title">単年度シミュレーション</h2>
        <p class="section-sub">月次予算から自動生成した PL・BS・グラフ</p>
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
          <h3>🏦 資産（期末）</h3>
          <table class="result-table">
            <tbody>
              ${[
                ['現金預金',   bs.current_assets[11], false],
                ['流動資産合計', bs.current_assets[11], true],
                ['固定資産合計', bs.fixed_assets[11], false],
                ['資産合計',   bs.total_assets[11], true],
              ].map(([l, v, b]) => `<tr class="${b ? 'bold-row' : ''}"><td>${l}</td><td class="num">${fmt(v)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="card-h">
          <h3>📋 負債・純資産（期末）</h3>
          <table class="result-table">
            <tbody>
              ${[
                ['流動負債合計',   bs.current_liab[11], false],
                ['固定負債合計',   bs.fixed_liab[11],   false],
                ['負債合計',       bs.total_liab[11],   true ],
                ['純資産合計',     bs.total_equity[11], false],
                ['負債純資産合計', bs.total_liab_eq[11],true ],
              ].map(([l, v, b]) => `<tr class="${b ? 'bold-row' : ''}"><td>${l}</td><td class="num">${fmt(v)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

  // Chart.js
  if (typeof Chart !== 'undefined') {
    const ctx = document.getElementById('sim_chart');
    if (ctx) new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          { label: '売上高', data: pl.sales.map(v => v / 1000), backgroundColor: 'rgba(29,111,184,.25)', borderColor: 'rgba(29,111,184,.6)', borderWidth: 1.5, yAxisID: 'y' },
          { label: '売上総利益', data: pl.gross_profit.map(v => v / 1000), backgroundColor: 'rgba(31,157,116,.25)', borderColor: 'rgba(31,157,116,.6)', borderWidth: 1.5, yAxisID: 'y' },
          { label: '営業利益', data: pl.op_profit.map(v => v / 1000), type: 'line', borderColor: '#f59e0b', borderWidth: 2, pointBackgroundColor: '#f59e0b', fill: false, yAxisID: 'y' },
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' },
          title: { display: true, text: '月次PL推移（千円）', font: { size: 13, weight: '700' } }
        },
        scales: { y: { beginAtZero: false, grid: { color: 'rgba(29,111,184,.07)' } } }
      }
    });
  }
}

// escHtml（grid.jsより先にapp.jsで定義、両方から使える）
function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
