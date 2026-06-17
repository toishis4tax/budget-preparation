// メインアプリケーション

window.App = {
  companies: [],
  currentCompany: null,
  currentYear: new Date().getFullYear(),
  currentBudget: null,
  currentPage: 'budget',
};

// 共通フォーマット関数
window.fmt  = v => Math.round(v).toLocaleString('ja-JP') + '円';
window.fmtK = v => Math.round(v / 1000).toLocaleString('ja-JP');

document.addEventListener('DOMContentLoaded', () => {
  loadApp();
  setupNav();
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
  const currentYear = new Date().getFullYear();
  const allYears = [...new Set([...years, currentYear, currentYear+1, currentYear+2])].sort((a,b)=>b-a);
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
  const modal = document.getElementById('company_modal');
  const company = editId ? App.companies.find(c => c.id === editId) : null;

  document.getElementById('modal_company_id').value   = company?.id || '';
  document.getElementById('modal_company_name').value = company?.name || '';
  document.getElementById('modal_capital').value      = company?.capital || 10000000;
  document.getElementById('modal_pref').value         = company?.prefecture || '東京都';
  document.getElementById('modal_fiscal').value       = company?.fiscalMonth || 3;

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

  const company = {
    id:          id || generateId(),
    name,
    capital,
    prefecture:  pref,
    fiscalMonth: fiscal,
  };

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
  App.companies     = getCompanies();
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

  // nav highlight
  document.querySelectorAll('[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  const container = document.getElementById('main_content');
  if (!container) return;

  const budget  = App.currentBudget;
  const company = App.currentCompany;

  switch (page) {
    case 'budget':
      renderGrid(container, budget);
      break;
    case 'simulation':
      renderSimulation(container, budget);
      break;
    case 'nextyear':
      renderNextYearSim(container, budget);
      break;
    case 'fiveyear':
      renderFiveYearSim(container, budget);
      break;
    case 'welfare':
      renderWelfare(container);
      break;
    case 'tax':
      renderTaxSimulator(container);
      break;
    case 'ctax':
      renderCtaxJudge(container);
      break;
    case 'cashflow':
      renderCashFlow(container, budget);
      break;
    case 'health':
      renderHealthDiag(container, budget);
      break;
    default:
      container.innerHTML = '<div class="no-data">ページが見つかりません</div>';
  }
}

// ===== 単年度シミュレーション =====
function renderSimulation(container, budget) {
  if (!budget) {
    container.innerHTML = '<div class="no-data">予算データがありません。</div>';
    return;
  }
  const pl     = calcPL(budget.rows);
  const bs     = calcBS(budget.rows);
  const months = getMonthLabels(budget.startMonth || 4);

  const plItems = [
    { label: '売上高',             vals: pl.sales,         bold: false },
    { label: '売上原価',           vals: pl.cogs,          bold: false },
    { label: '売上総利益',         vals: pl.gross_profit,  bold: true  },
    { label: '販売費及び一般管理費', vals: pl.sga,         bold: false },
    { label: '営業利益',           vals: pl.op_profit,     bold: true  },
    { label: '経常利益',           vals: pl.ord_profit,    bold: true  },
    { label: '税引前当期純利益',   vals: pl.pretax_profit, bold: true  },
    { label: '当期純利益',         vals: pl.net_profit,    bold: true  },
  ];

  const tableRows = (items) => items.map(item => {
    const total = item.vals.reduce((a,b)=>a+b,0);
    return `<tr class="${item.bold?'bold-row':''}">
      <td>${item.label}</td>
      ${item.vals.map(v=>`<td class="num">${fmtK(v)}</td>`).join('')}
      <td class="num total">${fmtK(total)}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="sim-panel">
      <h2 class="section-title">単年度シミュレーション（PL）</h2>
      <div class="card">
        <div class="table-scroll">
        <table class="result-table sim-table">
          <thead>
            <tr><th class="acc-col">科目</th>${months.map(m=>`<th>${m}</th>`).join('')}<th>合計</th></tr>
          </thead>
          <tbody>${tableRows(plItems)}</tbody>
        </table>
        </div>
        <div class="wf-note">単位：千円</div>
      </div>

      <div class="card" style="margin-top:1rem">
        <canvas id="sim_chart" height="100"></canvas>
      </div>

      <h2 class="section-title" style="margin-top:2rem">貸借対照表（BS）</h2>
      <div class="sim-grid">
        <div class="card">
          <h3>資産</h3>
          <table class="result-table">
            <thead><tr><th>科目</th><th>期末残高</th></tr></thead>
            <tbody>
              ${[
                ['流動資産',   bs.current_assets[11]],
                ['固定資産',   bs.fixed_assets[11]],
                ['資産合計',   bs.total_assets[11]],
              ].map(([l,v])=>`<tr><td>${l}</td><td class="num">${fmt(v)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="card">
          <h3>負債・純資産</h3>
          <table class="result-table">
            <thead><tr><th>科目</th><th>期末残高</th></tr></thead>
            <tbody>
              ${[
                ['流動負債',     bs.current_liab[11]],
                ['固定負債',     bs.fixed_liab[11]],
                ['負債合計',     bs.total_liab[11]],
                ['純資産合計',   bs.total_equity[11]],
                ['負債純資産合計', bs.total_liab_eq[11]],
              ].map(([l,v])=>`<tr><td>${l}</td><td class="num">${fmt(v)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

  // Chart
  if (typeof Chart !== 'undefined') {
    const ctx = document.getElementById('sim_chart');
    if (ctx) new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          { label:'売上高（千円）',   data: pl.sales.map(v=>v/1000),       backgroundColor:'#93c5fd', yAxisID:'y' },
          { label:'売上総利益（千円）', data: pl.gross_profit.map(v=>v/1000), backgroundColor:'#6ee7b7', yAxisID:'y' },
          { label:'営業利益（千円）', data: pl.op_profit.map(v=>v/1000),    type:'line', borderColor:'#f59e0b', fill:false, yAxisID:'y' },
        ]
      },
      options: {
        responsive:true,
        plugins:{ legend:{position:'bottom'}, title:{display:true,text:'月次PL推移'} },
        scales:{ y:{beginAtZero:false} }
      }
    });
  }
}

// ===== イベントハンドラ =====
document.addEventListener('DOMContentLoaded', () => {
  // 会社選択
  document.getElementById('company_select')?.addEventListener('change', e => {
    selectCompany(e.target.value);
  });

  // 年度選択
  document.getElementById('year_select')?.addEventListener('change', e => {
    App.currentYear = parseInt(e.target.value);
    if (App.currentCompany) {
      loadBudget(App.currentCompany.id, App.currentYear);
      showPage(App.currentPage);
    }
  });

  // モーダル外クリックで閉じる
  document.getElementById('company_modal')?.addEventListener('click', e => {
    if (e.target.id === 'company_modal') closeCompanyModal();
  });
});
