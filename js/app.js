// ===== トースト通知 =====
function showToast(msg, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) { return; }
  const icons = { success: '✓', error: '✕', info: 'ℹ', warn: '⚠' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = document.createElement('span');
  icon.textContent = icons[type] || 'ℹ';
  const text = document.createElement('span');
  text.style.flex = '1';
  text.textContent = String(msg);
  const close = document.createElement('button');
  close.textContent = '×';
  close.style.cssText = 'background:none;border:none;cursor:pointer;font-size:14px;padding:0 0 0 8px;opacity:.7;line-height:1;color:inherit';
  const dismiss = () => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); };
  close.onclick = dismiss;
  el.append(icon, text, close);
  container.appendChild(el);
  if (duration > 0) setTimeout(dismiss, duration);
}

// ===== カスタム確認ダイアログ =====
function showConfirm(msg, opts = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:14px;padding:28px 28px 20px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:inherit';
    const title = opts.title ? `<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:10px">${escHtml(opts.title)}</div>` : '';
    const msgEl = document.createElement('div');
    msgEl.innerHTML = title + `<div style="font-size:13px;color:var(--text-muted);white-space:pre-wrap;line-height:1.7">${escHtml(msg)}</div>`;
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:20px';
    const cancel = document.createElement('button');
    cancel.className = 'btn-ghost btn-sm';
    cancel.textContent = opts.cancelText || 'キャンセル';
    const ok = document.createElement('button');
    ok.className = opts.danger ? 'btn-danger btn-sm' : 'btn-solid btn-sm';
    ok.textContent = opts.okText || 'OK';
    const done = v => { overlay.remove(); resolve(v); };
    cancel.onclick = () => done(false);
    ok.onclick = () => done(true);
    overlay.onclick = e => { if (e.target === overlay) done(false); };
    btns.append(cancel, ok);
    box.append(msgEl, btns);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    ok.focus();
  });
}

function showAlert(msg, type = 'info') {
  showToast(msg, type, type === 'error' ? 0 : 4000);
}

// メインアプリケーション

window.App = {
  companies: [],
  currentCompany: null,
  currentYear: new Date().getFullYear(),
  currentBudget: null,
  currentPage: 'home',
  currentPhase: 1,
  charts: {},
};

// 共通フォーマット関数（全モジュールから参照）
const _safeN = v => { const n = Number(v); return (isNaN(n) || !isFinite(n)) ? 0 : n; };
window.fmt  = v => Math.round(_safeN(v)).toLocaleString('ja-JP') + '円';
window.fmtK = v => Math.round(_safeN(v) / 1000).toLocaleString('ja-JP');
function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Firebase認証後に呼ばれる（firebase-auth.js から _fbInit → _onLoggedIn → initApp）
window.initApp = function() {
  loadApp();
};

document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  // Firebase が有効な場合は _fbInit が認証後に initApp() を呼ぶ
  if (typeof _fbInit === 'function') {
    _fbInit();
  } else {
    loadApp(); // Firebase未導入時はそのまま起動
  }

  document.getElementById('year_select')?.addEventListener('change', e => {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
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

const _getLastCompanyKey = () => `budget_app_last_company_${window._currentFbUser?.uid || 'local'}`;

function loadApp() {
  App.companies = getCompanies();
  renderCompanyList();
  setPhase(1);
  // ページ更新時は常に顧問先一覧から開始
  showPage('client_list');
  // nav-itemのキーボードアクセシビリティを一括付与
  document.querySelectorAll('.nav-item:not([tabindex])').forEach(el => {
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
  });
}

// ===== 会社管理 =====
function renderCompanyList() {
  _updateHeaderCompanyName();
  _updateHeaderButtons();
}

function _updateHeaderCompanyName() {
  const el = document.getElementById('header-company-name');
  if (!el) return;
  el.textContent = App.currentCompany?.name || '';
}

function _updateHeaderButtons() {
  const hasCo = !!App.currentCompany;
  const el = document.getElementById('btn-next-year');
  if (el) { el.disabled = !hasCo; el.style.opacity = hasCo ? '' : '.4'; }
}

function selectCompany(id) {
  const company = App.companies.find(c => c.id === id);
  if (!company) {
    App.currentCompany = null;
    App.currentBudget  = null;
    _updateHeaderCompanyName();
    showPage(App.currentPage);
    return;
  }
  App.currentCompany = company;
  localStorage.setItem(_getLastCompanyKey(), company.id);
  _updateHeaderCompanyName();
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
async function createNextYear() {
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  const company = App.currentCompany;
  if (!company) { showAlert('先に会社を選択してください', 'warn'); return; }
  const fromYear = App.currentYear;
  const toYear   = fromYear + 1;

  if (!hasBudgetData(company.id, fromYear)) {
    showAlert(`${fromYear}年度にデータがありません。先に当年度の予算・実績を入力してから次年度を作成してください。`, 'warn');
    return;
  }
  if (hasBudgetData(company.id, toYear)) {
    const ok = await showConfirm(`${toYear}年度には既にデータがあります。\n${fromYear}年度の実績で上書きして作り直しますか？`, { title: '上書き確認', okText: '上書きする', cancelText: '中止', danger: true });
    if (!ok) return;
  } else {
    const ok = await showConfirm(
      `勘定科目の構成を引き継ぎます\nBSの期末残高を${toYear}年度の期首残高として引き継ぎます\nPL予算は${fromYear}年度の実績で初期化します`,
      { title: `${fromYear}年度の実績をベースに ${toYear}年度 を作成します`, okText: '作成する' }
    );
    if (!ok) return;
  }

  const nb = createNextYearBudget(company.id, fromYear);
  if (!nb) { showAlert('作成に失敗しました', 'error'); return; }

  // 税理士法人：顧問先売上・課税設定も翌年度へ引き継ぐ
  let revMsg = '';
  if (company.industry === 'tax_accountant' && typeof carryRevenueToNextYear === 'function') {
    const n = carryRevenueToNextYear(company.id, fromYear);
    revMsg = `\n顧問先売上：${n}件を引き継ぎました`;
  }

  App.currentYear   = toYear;
  App.currentBudget = nb;
  renderYearSelect(getYearsForCompany(company.id));
  updateCarryBadge();
  showPage(App.currentPage);
  showToast(`${toYear}年度を作成しました`, 'success', 4000);
}

function loadBudget(companyId, year) {
  let budget = getBudget(companyId, year);
  if (!budget) {
    budget = createDefaultBudget(companyId, year);
    try { saveBudget(budget); } catch(e) { showToast('データ保存に失敗しました（ストレージ容量不足の可能性）', 'warn'); }
  }
  App.currentBudget = budget;
  updateCarryBadge();
}

// 引き継ぎ元バッジ（例：2025年度実績から作成）
function updateCarryBadge() {
  const el = document.getElementById('carry_badge');
  if (!el) return;
  const from = App.currentBudget?.carriedFrom;
  if (from) {
    el.textContent = `${from}年度実績から作成`;
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}

function openCompanyModal(editId) {
  const modal   = document.getElementById('company_modal');
  const company = editId ? App.companies.find(c => c.id === editId) : null;
  const _mset = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  _mset('modal_company_id',    company?.id || '');
  _mset('modal_company_name',  company?.name || '');
  _mset('modal_capital',       company?.capital || 10000000);
  _mset('modal_pref',          company?.prefecture || '東京都');
  _mset('modal_fiscal',        company?.fiscalMonth || 3);
  _mset('modal_invoice',       company?.invoiceRegistered ? '1' : '0');
  _mset('modal_kani',          company?.kanijukazei ? '1' : '0');
  _mset('modal_kijun',         company?.kijunUriage || 0);
  _mset('modal_industry',      company?.industry || 'other');
  _mset('modal_business_type', company?.businessType || 5);
  _mset('modal_prepaid1',      company?.prepaid1 || 0);
  _mset('modal_prepaid2',      company?.prepaid2 || 0);
  _mset('modal_ctax_prepaid',  company?.ctaxPrepaid || 0);
  _mset('modal_employees',     company?.employees || 1);
  modal.classList.add('open');
}

function closeCompanyModal() {
  document.getElementById('company_modal').classList.remove('open');
}

function saveCompanyForm() {
  const id      = document.getElementById('modal_company_id')?.value || '';
  const name    = (document.getElementById('modal_company_name')?.value || '').trim();
  const capital = parseFloat(document.getElementById('modal_capital')?.value) || 10000000;
  const pref    = document.getElementById('modal_pref')?.value || '東京都';
  const fiscal  = parseInt(document.getElementById('modal_fiscal')?.value) || 3;
  if (!name) { showAlert('会社名を入力してください', 'warn'); return; }

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

async function deleteCurrentCompany() {
  if (!App.currentCompany) return;
  await _deleteCompanyFromCard(App.currentCompany.id);
}

async function _deleteCompanyFromCard(id) {
  const company = App.companies.find(c => c.id === id);
  if (!company) return;
  if (!await showConfirm(`「${company.name}」のすべてのデータが削除されます。この操作は取り消せません。`, { title: '顧問先を削除しますか?', okText: '削除する', danger: true })) return;
  deleteCompany(id);
  App.companies = getCompanies();
  if (App.currentCompany?.id === id) {
    App.currentCompany = null;
    App.currentBudget  = null;
    _updateHeaderCompanyName();
  }
  renderCompanyList();
  showPage(App.currentPage);
}

// ===== ページ管理 =====
function togglePhase(phase) {
  const nav = document.getElementById(`phase-nav-${phase}`);
  const isOpen = App.currentPhase === phase;
  [1, 2, 3, 4, 5, 6].forEach(p => {
    const n = document.getElementById(`phase-nav-${p}`);
    const icon = document.getElementById(`phase-toggle-${p}`);
    const label = document.querySelector(`#phase-section-${p} .sidebar-phase-label`);
    if (!n) return;
    if (p === phase && !isOpen) {
      n.style.display = 'block';
      if (icon) icon.textContent = '▾';
      label?.classList.add('active-phase');
    } else {
      n.style.display = 'none';
      if (icon) icon.textContent = '▸';
      label?.classList.remove('active-phase');
    }
  });
  App.currentPhase = isOpen ? 0 : phase;
  // 開閉に合わせてハイライトも更新（閉じた側のactiveが残らないように）
  document.querySelectorAll('[data-page]').forEach(el =>
    el.classList.toggle('active', el.dataset.page === App.currentPage && (!el.dataset.phase || parseInt(el.dataset.phase) === App.currentPhase))
  );
}

function setPhase(phase) {
  App.currentPhase = phase;
  [1, 2, 3, 4, 5, 6].forEach(p => {
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

const PAGE_RENDERERS = {
  home:           c      => renderHome(c),
  budget:         (c, b) => renderGrid(c, b),
  revenue:        c      => renderRevenue(c),
  import:         c      => renderImport(c),
  simulation:     (c, b) => renderSimulation(c, b),
  nextyear:       (c, b) => renderNextYearSim(c, b),
  nextyear_pl:    c      => renderNextYearPL(c),
  fiveyear:       (c, b) => renderFiveYearSim(c, b),
  cashflow:       (c, b) => renderCashFlow(c, b),
  cashplan:       c      => renderCashPlan(c),
  loansim:        c      => renderLoanSim(c),

  execopt:        c      => renderExecOpt(c),
  execcomp:       (c, b) => renderExecComp(c, b),
  welfare:        c      => renderWelfare(c),
  tax:            c      => renderTaxSimulator(c),
  ctax:           c      => renderCtaxJudge(c),
  health:         (c, b) => renderHealthDiag(c, b),
  taxsummary:     c      => renderTaxSummary(c),
  forecastreport: c      => renderForecastReport(c),
  monthlyreport:  c      => renderMonthlyReport(c),
  bizanalysis:    c      => renderBizAnalysis(c),
  summarypl:      c      => renderSummaryPL(c),
  summarybs:      c      => renderSummaryBS(c),
  bepanalysis:    c      => renderBEPAnalysis(c),
  bankrating:     c      => renderBankRating(c),
  subsidy:        c      => renderSubsidy(c),
  cccanalysis:    c      => renderCCCAnalysis(c),
  bankdoc:        c      => renderBankDoc(c),
  client_list:    c      => renderClientDashboard(c),
  meeting:        c      => renderMeetingPrep(c),
};

function showPage(page) {
  // 編集中のセルがあればコミットしてから遷移
  if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
  App.currentPage = page;
  document.querySelectorAll('[data-page]').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page && (!el.dataset.phase || parseInt(el.dataset.phase) === App.currentPhase))
  );

  const container = document.getElementById('main_content');
  if (!container) return;

  const renderer = PAGE_RENDERERS[page];
  if (renderer) {
    renderer(container, App.currentBudget);
  } else {
    container.innerHTML = '<div class="no-data">ページが見つかりません</div>';
  }
  if (typeof _meetingSync === 'function') _meetingSync();
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
      { label: '営業外収益',           vals: g('sec_non_op_inc'),bold: false },
      { label: '営業外費用',           vals: g('sec_non_op_exp'),bold: false },
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
    const last = id => { const arr = allVals[id]; return Array.isArray(arr) && arr.length > 11 ? arr[11] : 0; };
    const curAsset  = last('sec_cur_asset');
    const fixAsset  = last('sec_fix_asset');
    const otherAsset= last('sec_other_asset');
    const _assetSum = curAsset + fixAsset + otherAsset;
    const totalAsset= _assetSum !== 0 ? _assetSum : last('sec_total_asset');
    const curLiab   = last('sec_cur_liab');
    const fixLiab   = last('sec_fix_liab');
    const _liabSum  = curLiab + fixLiab;
    const totalLiab = _liabSum !== 0 ? _liabSum : last('sec_total_liab');
    const equity    = last('sec_equity');

    // 現預金を動的科目から探す（leaf科目のみ合算して二重計上を防ぐ）
    const cashAccs = budget.dynamicAccounts.filter(a =>
      a.section === 'bs_asset' && a.type !== 'section' && !a.cashGroup &&
      CASH_ACCOUNT_RE.test((a.name || '').replace(/\s/g,''))
    );
    const cashIds = new Set(cashAccs.map(a => a.id));
    const cashLeaf = cashAccs.filter(a => !cashIds.has(a.parentId));
    const cash = cashLeaf.reduce((s, a) => s + last(a.id), 0);

    bsAssetsRows = [
      cashLeaf.length > 0 ? ['現金預金', cash, false] : null,
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
    const bsCash = bs.cash?.[11] ?? bs.current_assets[11];
    bsAssetsRows = [
      ['現金預金',       bsCash,                false],
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
    if (ctx) {
      if (App.charts.sim) App.charts.sim.destroy();
      App.charts.sim = new Chart(ctx, {
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
}


let _memoSaveTimer = null;
function _memoSaveDebounce() {
  clearTimeout(_memoSaveTimer);
  const el = document.getElementById('company_memo_area');
  const cid = el?.dataset?.companyId;
  _memoSaveTimer = setTimeout(() => {
    if (!el) return;
    const c = (cid && window.App?.companies?.find(x => x.id === cid)) || window.App?.currentCompany;
    if (!c) return;
    c.memo = el.value;
    saveCompany(c);
  }, 800);
}
