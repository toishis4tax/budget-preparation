// LocalStorage管理
const STORAGE_KEY = 'budget_app_v1';

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initData();
    return JSON.parse(raw);
  } catch {
    return initData();
  }
}

function initData() {
  return { companies: [], budgets: [] };
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// 会社
function getCompanies() { return loadData().companies; }

function saveCompany(company) {
  const data = loadData();
  const idx = data.companies.findIndex(c => c.id === company.id);
  if (idx >= 0) data.companies[idx] = company;
  else data.companies.push(company);
  saveData(data);
}

function deleteCompany(id) {
  const data = loadData();
  data.companies = data.companies.filter(c => c.id !== id);
  data.budgets = data.budgets.filter(b => b.companyId !== id);
  saveData(data);
}

// 予算
function getBudget(companyId, year) {
  const data = loadData();
  return data.budgets.find(b => b.companyId === companyId && b.year === year) || null;
}

function saveBudget(budget) {
  const data = loadData();
  const idx = data.budgets.findIndex(b => b.companyId === budget.companyId && b.year === budget.year);
  budget.updatedAt = Date.now();
  if (idx >= 0) data.budgets[idx] = budget;
  else data.budgets.push(budget);
  saveData(data);
}

function getYearsForCompany(companyId) {
  const data = loadData();
  return data.budgets
    .filter(b => b.companyId === companyId)
    .map(b => b.year)
    .sort((a, b) => b - a);
}

// その会社で実際にデータが存在する年度か
function hasBudgetData(companyId, year) {
  const b = getBudget(companyId, year);
  if (!b) return false;
  const rows = b.rows || {};
  const act  = b.actualRows || {};
  const any = obj => Object.values(obj).some(arr => Array.isArray(arr) && arr.some(v => v));
  return any(rows) || any(act);
}

// 翌年度予算を「当年度実績ベース」で作成
//  - 科目構成（dynamicAccounts）を引き継ぐ
//  - BSは期末残高を期首残高として全月にセット
//  - PLは当年度の確定値（実績優先・無ければ予算）を翌年度予算の初期値に
function createNextYearBudget(companyId, fromYear) {
  const src = getBudget(companyId, fromYear);
  if (!src) return null;
  const toYear = fromYear + 1;

  const clone = obj => (obj == null ? obj : JSON.parse(JSON.stringify(obj)));
  const cols  = src.actualCols || [];
  let lastActual = -1;
  for (let i = 0; i < 12; i++) if (cols[i]) lastActual = i;

  const srcRows = src.rows || {};
  const srcAct  = src.actualRows || {};
  const ids = new Set([...Object.keys(srcRows), ...Object.keys(srcAct)]);

  // 当年度の確定12か月（実績月は実績、それ以外は予算）
  const confirmed = {};
  ids.forEach(id => {
    confirmed[id] = Array.from({ length: 12 }, (_, i) =>
      cols[i] ? (srcAct[id]?.[i] ?? srcRows[id]?.[i] ?? 0) : (srcRows[id]?.[i] ?? 0)
    );
  });

  const accById = {};
  (src.dynamicAccounts || []).forEach(a => { accById[a.id] = a; });
  const isBS = id => accById[id]?.section?.startsWith('bs');

  const closeIdx = lastActual >= 0 ? lastActual : 11;
  const newRows = {};
  ids.forEach(id => {
    if (isBS(id)) {
      // 期末残高（最終実績月。無ければ期末=11月）を期首残高として全月へ
      const closing = confirmed[id][closeIdx] || 0;
      newRows[id] = new Array(12).fill(closing);
    } else {
      newRows[id] = confirmed[id].slice();
    }
  });

  // 繰越利益剰余金の期首残高 = 期末残高 + 当期純利益
  //  （推移表では当期純利益が剰余金に未振替のため、翌期首に足し込む）
  try {
    const retained = (src.dynamicAccounts || []).find(a =>
      a.section?.startsWith('bs') && /繰越利益剰余金|利益剰余金/.test(a.name || ''));
    if (retained && newRows[retained.id] && typeof calcAllValuesDynamic === 'function') {
      const av  = calcAllValuesDynamic(src);
      const net = (av['calc_net'] || []).slice(0, 12).reduce((s, v) => s + (v || 0), 0);
      if (net) newRows[retained.id] = newRows[retained.id].map(v => v + net);
    }
  } catch (e) { /* calc不可時はフラット引継ぎのまま */ }

  const newBudget = {
    companyId,
    year: toYear,
    rows: newRows,
    actualRows: {},
    actualCols: new Array(12).fill(false),
    dynamicAccounts: clone(src.dynamicAccounts),
    startMonth: src.startMonth || 4,
    carriedFrom: fromYear,
    updatedAt: Date.now(),
  };
  saveBudget(newBudget);
  return newBudget;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// インポート履歴
function getImportHistory(companyId) {
  const data = loadData();
  return (data.importHistory || []).filter(h => h.companyId === companyId).reverse();
}

function saveImportHistory(entry) {
  const data = loadData();
  if (!data.importHistory) data.importHistory = [];
  data.importHistory.push(entry);
  // 会社ごとに最大50件
  const compId = entry.companyId;
  const filtered = data.importHistory.filter(h => h.companyId === compId);
  if (filtered.length > 50) {
    const oldest = filtered[0];
    data.importHistory = data.importHistory.filter(h => h !== oldest);
  }
  saveData(data);
}

function deleteImportHistory(id) {
  const data = loadData();
  data.importHistory = (data.importHistory || []).filter(h => h.id !== id);
  saveData(data);
}
