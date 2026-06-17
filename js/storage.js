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

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
