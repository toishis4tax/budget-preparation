// LocalStorage管理
const STORAGE_KEY = 'budget_app_v1';

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initData();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      console.warn('[storage] データ形式が不正です。初期化します。');
      return initData();
    }
    return parsed;
  } catch (e) {
    console.warn('[storage] データ読み込みエラー。初期化します。', e);
    return initData();
  }
}

function initData() {
  return { companies: [], budgets: [] };
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      if (typeof showToast === 'function') {
        showToast('ストレージ容量が不足しています。古いデータを削除してください。', 'error', 6000);
      } else {
        alert('ストレージ容量が不足しています。古いデータを削除してください。');
      }
    } else {
      console.error('[storage] 保存エラー:', e);
    }
  }
}

// 会社
function getCompanies() { return loadData().companies; }

function saveCompany(company) {
  const data = loadData();
  const idx = data.companies.findIndex(c => c.id === company.id);
  // 上書き前の版（＝この編集の起点）を控えておき、競合検知に使う
  const baseUpdatedAt = idx >= 0 ? (data.companies[idx].updatedAt || 0) : 0;
  company.updatedAt = Date.now();
  if (idx >= 0) data.companies[idx] = company;
  else data.companies.push(company);
  saveData(data);
  if (typeof fbSaveCompany === 'function') fbSaveCompany(company, baseUpdatedAt);
}

function deleteCompany(id) {
  const data = loadData();
  data.companies = data.companies.filter(c => c.id !== id);
  data.budgets = data.budgets.filter(b => b.companyId !== id);
  saveData(data);
  if (typeof fbDeleteCompany === 'function') fbDeleteCompany(id);
}

// 予算
function getBudget(companyId, year) {
  const data = loadData();
  const b = data.budgets.find(b => b.companyId === companyId && b.year === year) || null;
  if (b && migrateBudgetIds(b)) saveData(data); // 旧IDを安定IDへ移行して永続化
  return b;
}

function saveBudget(budget) {
  const data = loadData();
  const idx = data.budgets.findIndex(b => b.companyId === budget.companyId && b.year === budget.year);
  // 上書き前の版（＝この編集の起点）を控えておき、競合検知に使う
  const baseUpdatedAt = idx >= 0 ? (data.budgets[idx].updatedAt || 0) : 0;
  budget.updatedAt = Date.now();
  if (idx >= 0) data.budgets[idx] = budget;
  else data.budgets.push(budget);
  saveData(data);
  if (typeof fbSaveBudget === 'function') fbSaveBudget(budget, baseUpdatedAt);
}

function getYearsForCompany(companyId) {
  const data = loadData();
  return data.budgets
    .filter(b => b.companyId === companyId)
    .map(b => b.year)
    .sort((a, b) => b - a);
}

// 科目名＋プレフィックス由来の安定ID（連番ではなく内容で決まる）
//  used: 同一パース内の衝突回避用 Set（任意）
function stableAcctId(prefix, name, used) {
  const s = String(name || '').replace(/\s+/g, '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  let id = `${prefix}_${h.toString(36)}`;
  if (used) { while (used.has(id)) id += 'x'; used.add(id); }
  return id;
}

// 旧来の連番ID（p1,b2…）を安定IDへ移行する（1度きり・冪等）
function migrateBudgetIds(budget) {
  if (!budget || budget.idsV === 2) return false;
  const accts = budget.dynamicAccounts;
  if (!accts || !accts.length) { budget.idsV = 2; return true; }
  const OLD = /^[pb]\d+$/;
  if (!accts.some(a => OLD.test(a.id))) { budget.idsV = 2; return true; }

  // 固定ID（sec_*/calc_*/wf_*など）は使用済みとして衝突回避
  const used = new Set(accts.filter(a => !OLD.test(a.id)).map(a => a.id));
  const map = {};
  accts.forEach(a => { if (OLD.test(a.id)) map[a.id] = stableAcctId(a.id[0], a.name, used); });

  accts.forEach(a => {
    if (map[a.id]) a.id = map[a.id];
    if (a.parentId && map[a.parentId]) a.parentId = map[a.parentId];
    if (a.formula) a.formula = a.formula.replace(/\b[pb]\d+\b/g, m => map[m] || m);
  });
  const remap = obj => {
    if (!obj) return obj;
    const out = {};
    Object.keys(obj).forEach(k => { out[map[k] || k] = obj[k]; });
    return out;
  };
  budget.rows = remap(budget.rows);
  budget.actualRows = remap(budget.actualRows);
  // 消費税課税区分も勘定科目IDがキー → 付け替える（rev_* 等の非科目キーはそのまま）
  if (budget.ctaxClassification) budget.ctaxClassification = remap(budget.ctaxClassification);
  budget.idsV = 2;
  return true;
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
      const closing = confirmed[id] ? (confirmed[id][closeIdx] ?? 0) : 0;
      newRows[id] = new Array(12).fill(closing);
    } else {
      newRows[id] = confirmed[id].slice();
    }
  });

  // 繰越利益剰余金の期首残高 = 期末残高 + 当期純利益
  //  （推移表では当期純利益が剰余金に未振替のため、翌期首に足し込む）
  try {
    // 子を持つ親科目に足しても calcAllValuesDynamic が子合計で上書きするため、
    // leaf（子を持たない）の繰越利益剰余金を優先して選ぶ。無ければ利益剰余金leafにフォールバック
    const bsRetained = (src.dynamicAccounts || []).filter(a =>
      a.section?.startsWith('bs') && /繰越利益剰余金|利益剰余金/.test(a.name || ''));
    const parentIds = new Set(bsRetained.map(a => a.parentId).filter(Boolean));
    const isLeaf = a => !(src.dynamicAccounts || []).some(x => x.parentId === a.id);
    const retained =
      bsRetained.find(a => /繰越利益剰余金/.test(a.name || '') && isLeaf(a)) ||
      bsRetained.find(a => isLeaf(a)) ||
      bsRetained.find(a => /繰越利益剰余金/.test(a.name || '')) ||
      bsRetained[0];
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
  // 消費税課税区分・顧問先売上科目を引き継ぐ（同一IDなので付け替え不要）
  if (src.ctaxClassification) newBudget.ctaxClassification = clone(src.ctaxClassification);
  if (src.revenueAccounts)    newBudget.revenueAccounts    = clone(src.revenueAccounts);
  saveBudget(newBudget);
  return newBudget;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
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
