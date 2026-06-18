// ===== 顧問先売上管理 =====
// 税理士法人専用：顧問先ごとの売上を月別展開して補助科目として予算へ反映

const REVENUE_KEY = 'revenue_clients_v1';

function loadRevenueClients(companyId, year) {
  try {
    const raw = localStorage.getItem(REVENUE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    return all[`${companyId}_${year}`] || [];
  } catch { return []; }
}

function saveRevenueClients(companyId, year, clients) {
  try {
    const raw = localStorage.getItem(REVENUE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[`${companyId}_${year}`] = clients;
    localStorage.setItem(REVENUE_KEY, JSON.stringify(all));
  } catch {}
}

// 売上区分の定義
const REV_CATEGORIES = [
  { id: 'sales_advisory',   name: '顧問報酬' },
  { id: 'sales_compliance', name: 'コンプライアンス報酬' },
  { id: 'sales_consulting', name: 'コンサルティング報酬' },
  { id: 'sales_ec',         name: 'EC売上' },
  { id: 'sales_store',      name: '店舗売上' },
  { id: 'sales_other',      name: 'その他売上' },
];

function newClient() {
  const now = new Date();
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2,5),
    name: '',
    confirmed: true,       // 確定/未確定
    indiv: false,          // true=個人（申告月+3）、false=法人（申告月+2）
    category: 'sales_advisory', // 売上区分
    contractStart: { year: now.getFullYear(), month: now.getMonth() + 1 },
    retainer: 0,
    filingCalMonth: -1,
    settlementFee: 0,
    yearEndAdj: 0,
    consulting: {},
  };
}

// 申告月を決算月から自動計算（法人+2、個人+3）
function calcFilingMonth(settlementCalMonth, indiv) {
  if (settlementCalMonth < 1) return -1;
  const offset = indiv ? 3 : 2;
  return ((settlementCalMonth - 1 + offset) % 12) + 1;
}

// 顧問先1件の12ヶ月売上配列（予算月インデックス 0-11）
function calcClientMonthly(client, startMonth, budgetYear) {
  return Array.from({length: 12}, (_, i) => {
    // 予算月インデックスiが対応するカレンダー年月
    const calMonth = ((startMonth - 1 + i) % 12) + 1; // 1-12
    const calYear  = budgetYear + Math.floor((startMonth - 1 + i) / 12);

    // 契約開始年月が両方入力済みの場合のみ開始前を0にする
    const cs = client.contractStart;
    if (cs?.year && cs?.month) {
      const startYM   = cs.year * 100 + cs.month;
      const currentYM = calYear * 100 + calMonth;
      if (currentYM < startYM) return 0;
    }

    let total = client.retainer || 0;

    // 申告月に決算報酬
    if (client.filingCalMonth > 0 && calMonth === client.filingCalMonth) {
      total += client.settlementFee || 0;
    }

    // 1月に年末調整
    if (calMonth === 1) {
      total += client.yearEndAdj || 0;
    }

    // コンサル（予算月インデックス）
    total += client.consulting?.[i] || 0;

    return total;
  });
}

// ===== レンダリング =====
let _revClients = [];
let _revBudgetYear = new Date().getFullYear();

function renderRevenue(container) {
  const budget  = window.App?.currentBudget;
  const company = window.App?.currentCompany;
  if (!budget || !company) {
    container.innerHTML = `<div class="no-data">会社と年度を選択してください</div>`;
    return;
  }

  _revBudgetYear = budget.year || window.App.currentYear;
  _revClients = loadRevenueClients(company.id, _revBudgetYear);
  const startMonth = budget.startMonth || 4;
  const months = getMonthLabels(startMonth);

  const totalByMonth = _calcTotals(startMonth);
  const grandTotal   = totalByMonth.reduce((a,b)=>a+b,0);

  container.innerHTML = `
    <div class="sim-panel">
      <div class="flex-between">
        <div>
          <h2 class="section-title">顧問先売上管理</h2>
          <p class="section-sub">顧問先ごとの報酬設定から月次売上を自動計算 → 予算の補助科目へ反映</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn-solid" onclick="applyRevenueToBudget()">📊 予算へ反映 →</button>
          <button class="btn-outline" onclick="addRevenueClient()">＋ 顧問先追加</button>
          <button class="btn-ghost" onclick="exportRevenueExcel()" title="Excelエクスポート">⬇ Excel出力</button>
          <label class="btn-ghost" style="cursor:pointer" title="Excelインポート">
            ⬆ Excel取込
            <input type="file" accept=".xlsx,.xls" style="display:none"
              onchange="importRevenueExcel(this.files[0]);this.value=''">
          </label>
        </div>
      </div>

      <div class="stat-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="stat-card" id="rev_stat_count">
          <div class="stat-label">顧問先数</div>
          <div class="stat-value">${_revClients.length}<span style="font-size:14px;font-weight:400">社</span></div>
        </div>
        <div class="stat-card" id="rev_stat_annual">
          <div class="stat-label">年間売上合計</div>
          <div class="stat-value">${Math.round(grandTotal/1000).toLocaleString()}<span style="font-size:14px;font-weight:400">千円</span></div>
        </div>
        <div class="stat-card" id="rev_stat_avg">
          <div class="stat-label">月平均売上</div>
          <div class="stat-value">${Math.round(grandTotal/12/1000).toLocaleString()}<span style="font-size:14px;font-weight:400">千円</span></div>
        </div>
        <div class="stat-card" id="rev_stat_retainer">
          <div class="stat-label">顧問料合計（月額）</div>
          <div class="stat-value">${Math.round(_revClients.reduce((s,c)=>s+(c.retainer||0),0)/1000).toLocaleString()}<span style="font-size:14px;font-weight:400">千円</span></div>
        </div>
      </div>

      <div class="card" style="padding:16px">
        <h3 style="margin-bottom:12px">月別売上合計</h3>
        <div style="height:140px"><canvas id="rev_chart"></canvas></div>
      </div>

      <div class="card-h" style="padding:0;overflow:hidden">
        <div style="overflow-x:auto">
          <table class="result-table" style="min-width:1100px;table-layout:fixed">
            <colgroup>
              <col style="width:170px">
              <col style="width:120px"><!-- 区分 -->
              <col style="width:60px"> <!-- 確定 -->
              <col style="width:110px"><!-- 契約開始 -->
              <col style="width:88px"> <!-- 顧問料 -->
              <col style="width:72px"> <!-- 決算月 -->
              <col style="width:72px"> <!-- 申告月 -->
              <col style="width:88px"> <!-- 決算報酬 -->
              <col style="width:78px"> <!-- 年末調整 -->
              ${months.map(()=>'<col style="width:68px">').join('')}
              <col style="width:78px"><!-- 合計 -->
              <col style="width:56px"><!-- 操作 -->
            </colgroup>
            <thead>
              <tr>
                <th style="position:sticky;left:0;background:#f0fdf4;z-index:5">顧問先名</th>
                <th>区分</th>
                <th>確定</th>
                <th>契約開始</th>
                <th>顧問料/月</th>
                <th>決算月</th>
                <th>申告月</th>
                <th>決算報酬</th>
                <th>年末調整</th>
                ${months.map(m=>`<th>${m}</th>`).join('')}
                <th>合計</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="rev_tbody"></tbody>
            <tfoot id="rev_tfoot"></tfoot>
          </table>
        </div>
      </div>

      <div class="card" style="background:#fffbeb;border-color:#fcd34d;padding:12px 16px;font-size:11.5px;color:#78350f">
        💡 <strong>反映について：</strong>
        顧問先ごとに売上の補助科目（例：顧問料、決算報酬）が自動作成されます。
        既存の補助科目があれば上書きします。コンサルは💼ボタンから月別入力できます。
      </div>
    </div>`;

  renderRevTable(startMonth, months);
  renderRevChart(months, totalByMonth, startMonth);
}

const MONTH_LABELS_JP = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

function _calcTotals(startMonth) {
  const totalByMonth = Array(12).fill(0);
  _revClients.forEach(c => {
    calcClientMonthly(c, startMonth, _revBudgetYear).forEach((v, i) => totalByMonth[i] += v);
  });
  return totalByMonth;
}

function renderRevTable(startMonth, months) {
  const tbody = document.getElementById('rev_tbody');
  const tfoot = document.getElementById('rev_tfoot');
  if (!tbody) return;

  const totalByMonth = _calcTotals(startMonth);
  const grandTotal   = totalByMonth.reduce((a,b)=>a+b,0);

  if (!_revClients.length) {
    tbody.innerHTML = `<tr><td colspan="${7+12+2}" class="no-data" style="padding:40px">「顧問先追加」で顧問先を登録してください</td></tr>`;
    tfoot.innerHTML = '';
    return;
  }

  tbody.innerHTML = _revClients.map((c, ci) => {
    const monthly = calcClientMonthly(c, startMonth, _revBudgetYear);
    const total   = monthly.reduce((a,b)=>a+b,0);
    const cs = c.contractStart || {};

    // 申告月（表示用）
    const filingDisp = c.filingCalMonth > 0 ? MONTH_LABELS_JP[c.filingCalMonth-1] : '–';

    const settlOpts = `<option value="-1"${(c.filingCalMonth??-1)<0?' selected':''}>なし</option>` +
      MONTH_LABELS_JP.map((m,i)=>`<option value="${i+1}"${c.filingCalMonth===i+1?' selected':''}>${m}</option>`).join('');

    const monthCells = monthly.map((v, mi) => {
      const isSpecial = v > (c.retainer || 0);
      const style = isSpecial ? 'background:#fffbeb' : '';
      return `<td style="text-align:right;padding:4px 6px;font-size:11.5px;${style}">
        <div style="display:flex;flex-direction:column;align-items:flex-end">
          <span>${v ? Math.round(v/1000).toLocaleString() : '–'}</span>
          ${isSpecial ? `<span style="font-size:9px;color:#d97706">+${Math.round((v-(c.retainer||0))/1000).toLocaleString()}</span>` : ''}
        </div>
      </td>`;
    }).join('');

    const isConfirmed = c.confirmed !== false;
    const rowBg = isConfirmed ? '' : 'background:#fffbeb';
    const catOpts = REV_CATEGORIES.map(cat =>
      `<option value="${cat.id}"${(c.category||'sales_advisory')===cat.id?' selected':''}>${cat.name}</option>`
    ).join('');

    return `<tr data-ci="${ci}" style="${rowBg}">
      <td style="padding:4px 6px;position:sticky;left:0;background:${isConfirmed?'#fff':'#fffbeb'};z-index:2">
        <div style="display:flex;align-items:center;gap:5px">
          <input class="form-input" style="flex:1;font-size:12px;padding:4px 6px"
            value="${escHtml(c.name)}" placeholder="顧問先名"
            oninput="_revClients[${ci}].name=this.value;_revSave()">
          ${!isConfirmed ? '<span style="font-size:9px;background:#fcd34d;color:#78350f;border-radius:3px;padding:1px 4px;white-space:nowrap;font-weight:700">未確定</span>' : ''}
        </div>
      </td>
      <td style="padding:4px 5px">
        <select class="form-input" style="width:115px;font-size:11px;padding:3px 4px"
          onchange="_revClients[${ci}].category=this.value;_revSave()">
          ${catOpts}
        </select>
      </td>
      <td style="padding:4px 5px;text-align:center">
        <label style="cursor:pointer;display:flex;align-items:center;justify-content:center;gap:3px;font-size:11px">
          <input type="checkbox" ${isConfirmed?'checked':''} style="width:14px;height:14px;accent-color:var(--emerald-mid)"
            onchange="_revClients[${ci}].confirmed=this.checked;_revRefresh()">
        </label>
      </td>
      <td style="padding:4px 5px">
        <div style="display:flex;gap:3px">
          <input type="number" class="form-input" style="width:52px;font-size:11px;padding:3px 4px;text-align:right"
            value="${cs.year||''}" placeholder="年" min="2020" max="2040"
            oninput="_revClients[${ci}].contractStart={..._revClients[${ci}].contractStart,year:+this.value};_revRefresh()">
          <select class="form-input" style="width:50px;font-size:11px;padding:3px 3px"
            onchange="_revClients[${ci}].contractStart={..._revClients[${ci}].contractStart,month:+this.value};_revRefresh()">
            ${MONTH_LABELS_JP.map((m,i)=>`<option value="${i+1}"${(cs.month||1)===i+1?' selected':''}>${m}</option>`).join('')}
          </select>
        </div>
      </td>
      <td style="padding:4px 5px">
        <input type="number" class="form-input" style="width:84px;font-size:12px;padding:4px 6px;text-align:right"
          value="${c.retainer||''}" placeholder="0" step="1000"
          oninput="_revClients[${ci}].retainer=+this.value;_revRefresh()">
      </td>
      <td style="padding:4px 5px;text-align:center">
        <select class="form-input" style="width:42px;font-size:11px;padding:2px 2px;margin-bottom:3px"
          onchange="_revClients[${ci}].indiv=this.value==='1';const dm=_revClients[${ci}].filingCalMonth>0?(((c.filingCalMonth-1+(_revClients[${ci}].indiv?9:10))%12)+1):-1;if(dm>0)_revClients[${ci}].filingCalMonth=calcFilingMonth(dm,_revClients[${ci}].indiv);_revRefresh()">
          <option value="0"${!c.indiv?' selected':''}>法人</option>
          <option value="1"${c.indiv?' selected':''}>個人</option>
        </select>
        <select class="form-input" style="width:58px;font-size:11px;padding:2px 3px"
          onchange="
            const dm=+this.value;
            _revClients[${ci}].filingCalMonth = dm>0 ? calcFilingMonth(dm,_revClients[${ci}].indiv) : -1;
            _revRefresh()">
          <option value="-1">–</option>
          ${MONTH_LABELS_JP.map((m,i)=>`<option value="${i+1}"${c.filingCalMonth>0&&(((c.filingCalMonth-1+(c.indiv?9:10))%12)+1)===i+1?' selected':''}>${m}</option>`).join('')}
        </select>
      </td>
      <td style="padding:4px 5px;text-align:center;font-weight:600;color:var(--emerald-dark)">${filingDisp}</td>
      <td style="padding:4px 5px">
        <input type="number" class="form-input" style="width:84px;font-size:12px;padding:4px 6px;text-align:right"
          value="${c.settlementFee||''}" placeholder="0" step="10000"
          oninput="_revClients[${ci}].settlementFee=+this.value;_revRefresh()">
      </td>
      <td style="padding:4px 5px">
        <input type="number" class="form-input" style="width:72px;font-size:12px;padding:4px 6px;text-align:right"
          value="${c.yearEndAdj||''}" placeholder="0" step="10000"
          oninput="_revClients[${ci}].yearEndAdj=+this.value;_revRefresh()">
      </td>
      ${monthCells}
      <td style="text-align:right;padding:4px 8px;font-weight:700;color:var(--emerald-dark);font-size:12px">
        ${Math.round(total/1000).toLocaleString()}
      </td>
      <td style="padding:3px;text-align:center;white-space:nowrap">
        <button class="btn-xs btn-ghost" onclick="openConsulting(${ci})" title="コンサル入力" style="display:block;margin:0 auto 4px">💼</button>
        <button onclick="removeRevenueClient(${ci})" title="削除" style="display:block;margin:0 auto;background:#fee2e2;border:1px solid #fca5a5;color:#dc2626;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;white-space:nowrap">🗑 削除</button>
      </td>
    </tr>`;
  }).join('');

  tfoot.innerHTML = `
    <tr style="background:#f0fdf4;font-weight:700">
      <td colspan="7" style="padding:8px 10px;position:sticky;left:0;background:#f0fdf4">合計（千円）</td>
      ${totalByMonth.map(v=>`<td style="text-align:right;padding:6px 8px">${v?Math.round(v/1000).toLocaleString():'–'}</td>`).join('')}
      <td style="text-align:right;padding:6px 8px;color:var(--emerald-dark)">${Math.round(grandTotal/1000).toLocaleString()}</td>
      <td></td>
    </tr>`;
}

// 区分ごとの色
const CAT_COLORS = {
  sales_advisory:   { bg: 'rgba(37,99,235,.7)',   border: 'rgba(37,99,235,.9)'   }, // blue
  sales_compliance: { bg: 'rgba(16,185,129,.7)',  border: 'rgba(16,185,129,.9)'  }, // green
  sales_consulting: { bg: 'rgba(245,158,11,.7)',  border: 'rgba(245,158,11,.9)'  }, // amber
  sales_ec:         { bg: 'rgba(139,92,246,.7)',  border: 'rgba(139,92,246,.9)'  }, // violet
  sales_store:      { bg: 'rgba(239,68,68,.7)',   border: 'rgba(239,68,68,.9)'   }, // red
  sales_other:      { bg: 'rgba(107,114,128,.7)', border: 'rgba(107,114,128,.9)' }, // gray
};

function renderRevChart(months, totalByMonth, startMonth) {
  const canvas = document.getElementById('rev_chart');
  if (!canvas) return;
  if (window._revChartInstance) window._revChartInstance.destroy();

  // 区分ごとに月次データを集計
  const sm = startMonth || (window.App?.currentBudget?.startMonth) || 4;
  const catDatasets = REV_CATEGORIES.map(cat => {
    const clients = _revClients.filter(c => (c.category || 'sales_advisory') === cat.id);
    if (!clients.length) return null;
    const data = Array(12).fill(0);
    clients.forEach(c => {
      calcClientMonthly(c, sm, _revBudgetYear).forEach((v, i) => { data[i] += v; });
    });
    if (data.every(v => v === 0)) return null;
    const col = CAT_COLORS[cat.id] || CAT_COLORS.sales_other;
    return {
      label: cat.name,
      data: data.map(v => Math.round(v / 1000)),
      backgroundColor: col.bg,
      borderColor: col.border,
      borderWidth: 1,
      borderRadius: 3,
    };
  }).filter(Boolean);

  window._revChartInstance = new Chart(canvas, {
    type: 'bar',
    data: { labels: months, datasets: catDatasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: catDatasets.length > 1, position: 'bottom', labels: { font:{size:11}, boxWidth:12, padding:10 } },
      },
      scales: {
        x: { stacked: true, ticks: { font:{size:10} }, grid: { display:false } },
        y: { stacked: true, ticks: { callback: v => v.toLocaleString()+'千', font:{size:10} }, grid: { color:'#f1f5f9' } },
      }
    }
  });
}

function _revSave() {
  const company = window.App?.currentCompany;
  if (!company) return;
  saveRevenueClients(company.id, _revBudgetYear, _revClients);
}

function _revRefresh() {
  _revSave();
  const budget = window.App?.currentBudget;
  const startMonth = budget?.startMonth || 4;
  const months = getMonthLabels(startMonth);
  const totalByMonth = _calcTotals(startMonth);
  const grandTotal   = totalByMonth.reduce((a,b)=>a+b,0);

  renderRevTable(startMonth, months);
  renderRevChart(months, totalByMonth, startMonth);

  // サマリー更新
  const setS = (id, html) => { const el=document.getElementById(id); if(el) el.querySelector('.stat-value').innerHTML=html; };
  setS('rev_stat_count',   `${_revClients.length}<span style="font-size:14px;font-weight:400">社</span>`);
  setS('rev_stat_annual',  `${Math.round(grandTotal/1000).toLocaleString()}<span style="font-size:14px;font-weight:400">千円</span>`);
  setS('rev_stat_avg',     `${Math.round(grandTotal/12/1000).toLocaleString()}<span style="font-size:14px;font-weight:400">千円</span>`);
  setS('rev_stat_retainer',`${Math.round(_revClients.reduce((s,c)=>s+(c.retainer||0),0)/1000).toLocaleString()}<span style="font-size:14px;font-weight:400">千円</span>`);
}

function addRevenueClient() {
  _revClients.push(newClient());
  _revRefresh();
}

function removeRevenueClient(ci) {
  if (!confirm(`「${_revClients[ci].name || '(未入力)'}」を削除しますか？`)) return;
  _revClients.splice(ci, 1);
  _revRefresh();
}

// コンサル入力モーダル
function openConsulting(ci) {
  const budget = window.App?.currentBudget;
  const startMonth = budget?.startMonth || 4;
  const months = getMonthLabels(startMonth);
  const c = _revClients[ci];

  let modal = document.getElementById('rev_consulting_modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'rev_consulting_modal';
    modal.className = 'modal';
    modal.onclick = e => { if (e.target === modal) modal.classList.remove('open'); };
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-box" style="width:440px">
      <h2>💼 コンサル報酬</h2>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">${escHtml(c.name||'(未入力)')}　月ごとに臨時コンサル報酬を入力</p>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:20px">
        ${months.map((m, i) => `
          <div class="form-group" style="margin:0">
            <label style="font-size:11px">${m}</label>
            <input type="number" class="form-input" style="padding:5px 8px;font-size:12px"
              value="${c.consulting?.[i]||''}" placeholder="0" step="10000"
              oninput="if(!_revClients[${ci}].consulting)_revClients[${ci}].consulting={};_revClients[${ci}].consulting[${i}]=+this.value||0">
          </div>`).join('')}
      </div>
      <div class="modal-footer">
        <button class="btn-ghost" onclick="document.getElementById('rev_consulting_modal').classList.remove('open')">キャンセル</button>
        <button class="btn-solid" onclick="document.getElementById('rev_consulting_modal').classList.remove('open');_revRefresh()">保存</button>
      </div>
    </div>`;
  modal.classList.add('open');
}

// ===== 予算の補助科目へ反映 =====
function applyRevenueToBudget() {
  const budget  = window.App?.currentBudget;
  const company = window.App?.currentCompany;
  if (!budget || !company) { alert('予算データがありません'); return; }

  const startMonth = budget.startMonth || 4;
  if (!budget.rows) budget.rows = {};

  // 既存の rev_ データを全削除（重複防止）
  Object.keys(budget.rows).forEach(k => { if (k.startsWith('rev_')) delete budget.rows[k]; });

  // dynamicAccounts が試算表インポート由来でない場合はクリア
  if (budget.dynamicAccounts && !budget.dynamicAccountsFromImport) {
    budget.dynamicAccounts = null;
  } else if (budget.dynamicAccounts) {
    budget.dynamicAccounts = budget.dynamicAccounts.filter(a => !a.id.startsWith('rev_'));
  }

  // 静的カテゴリの定義（名前照合用）
  const CAT_NAMES = {
    sales_advisory:   '顧問報酬',
    sales_compliance: 'コンプライアンス報酬',
    sales_consulting: 'コンサルティング報酬',
    sales_ec:         'EC売上',
    sales_store:      '店舗売上',
    sales_other:      'その他売上',
  };

  // dynamicAccountsがある場合：名前照合でIDを解決、なければカテゴリ科目自体を追加
  function ensureCategoryInDynamic(catId) {
    if (!budget.dynamicAccounts) return catId;
    const catName = CAT_NAMES[catId];
    // 名前一致で探す
    const found = budget.dynamicAccounts.find(a => a.name === catName);
    if (found) return found.id;
    // IDで探す（静的IDがそのまま残っている場合）
    const byId = budget.dynamicAccounts.find(a => a.id === catId);
    if (byId) return catId;
    // 存在しない → 売上高の下に追加
    const salesIdx = budget.dynamicAccounts.findIndex(
      a => a.name?.includes('売上高') || a.id === 'sales'
    );
    let insertAt = salesIdx >= 0 ? salesIdx + 1 : budget.dynamicAccounts.length;
    // 既存の sales 子をスキップ
    while (insertAt < budget.dynamicAccounts.length &&
           (budget.dynamicAccounts[insertAt].parentId === 'sales' ||
            budget.dynamicAccounts[insertAt].id === catId)) insertAt++;
    budget.dynamicAccounts.splice(insertAt, 0, {
      id: catId, name: catName, type: 'input',
      section: 'pl', indent: 1, sign: 1, bold: false,
      parentId: budget.dynamicAccounts[salesIdx]?.id || 'sales',
    });
    return catId;
  }

  // 区分ごとに月次合計を計算
  const catTotals = {};
  const revAccounts = [];

  _revClients.filter(c => c.name).forEach(c => {
    const cat    = c.category || 'sales_advisory';
    const catId  = ensureCategoryInDynamic(cat);
    const monthly = calcClientMonthly(c, startMonth, _revBudgetYear);

    budget.rows[`rev_${c.id}`] = [...monthly, 0];

    if (!catTotals[catId]) catTotals[catId] = new Array(13).fill(0);
    monthly.forEach((v, i) => { catTotals[catId][i] += v; });

    revAccounts.push({
      id: `rev_${c.id}`, name: c.name, parentId: catId,
      indent: 2, tentative: c.confirmed === false, section: 'pl',
    });
  });

  // カテゴリ行に合計を上書き（実績月は上書きしない）
  const actualCols = budget.actualCols || [];
  Object.entries(catTotals).forEach(([catId, totals]) => {
    const existing = budget.rows[catId] || new Array(13).fill(0);
    budget.rows[catId] = totals.map((v, i) => actualCols[i] ? existing[i] : v);
  });

  budget.revenueAccounts = revAccounts;

  saveBudget(budget);
  window.App.currentBudget = budget;

  const total = _revClients.reduce((s, c) =>
    s + calcClientMonthly(c, startMonth, _revBudgetYear).reduce((a,b)=>a+b,0), 0);

  alert(`${_revClients.filter(c=>c.name).length}社の売上を予算に反映しました。\n年間合計：${Math.round(total/1000).toLocaleString()}千円`);
  showPage('budget');
}

// ===== Excel エクスポート =====
function exportRevenueExcel() {
  const budget = window.App?.currentBudget;
  const startMonth = budget?.startMonth || 4;
  const months = getMonthLabels(startMonth);

  // ヘッダー行
  const headers = [
    '顧問先名', '確定', '法人個人', '売上区分', '契約開始年', '契約開始月',
    '顧問料/月', '決算月', '決算報酬', '年末調整',
    ...months.map(m => `コンサル_${m}`)
  ];

  const rows = _revClients.map(c => {
    const cs = c.contractStart || {};
    const decMonth = c.filingCalMonth > 0
      ? MONTH_LABELS_JP[((c.filingCalMonth - 1 + (c.indiv ? 9 : 10)) % 12)]
      : '';
    const catName = REV_CATEGORIES.find(r => r.id === (c.category || 'sales_advisory'))?.name || '顧問報酬';
    return [
      c.name || '',
      c.confirmed === false ? '未確定' : '確定',
      c.indiv ? '個人' : '法人',
      catName,
      cs.year || '',
      cs.month ? MONTH_LABELS_JP[cs.month - 1] : '',
      c.retainer || 0,
      decMonth,
      c.settlementFee || 0,
      c.yearEndAdj || 0,
      ...Array.from({length: 12}, (_, i) => c.consulting?.[i] || 0),
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // 列幅
  ws['!cols'] = [
    {wch:20},{wch:10},{wch:8},{wch:10},{wch:12},{wch:8},{wch:12},{wch:10},{wch:10},
    ...Array(12).fill({wch:10})
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '顧問先売上管理');
  const company = window.App?.currentCompany?.name || '会社';
  XLSX.writeFile(wb, `顧問先売上管理_${company}_${_revBudgetYear}.xlsx`);
}

// ===== Excel インポート =====
function importRevenueExcel(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (data.length < 2) { alert('データが見つかりません'); return; }

      const header = data[0].map(h => String(h).trim());
      const nameIdx      = header.findIndex(h => h.includes('顧問先名'));
      const confirmedIdx = header.findIndex(h => h.includes('確定') && !h.includes('法人'));
      const indivIdx     = header.findIndex(h => h.includes('法人個人') || h.includes('個人法人'));
      const catIdx       = header.findIndex(h => h.includes('売上区分'));
      const yearIdx      = header.findIndex(h => h.includes('契約開始年'));
      const monthIdx     = header.findIndex(h => h.includes('契約開始月'));
      const retIdx       = header.findIndex(h => h.includes('顧問料'));
      const decIdx       = header.findIndex(h => h.includes('決算月'));
      const feeIdx       = header.findIndex(h => h.includes('決算報酬'));
      const adjIdx       = header.findIndex(h => h.includes('年末調整'));

      // コンサル列（コンサル_○月）
      const consultingCols = header.map((h, i) => h.startsWith('コンサル_') ? i : -1).filter(i => i >= 0);

      const imported = [];
      for (let ri = 1; ri < data.length; ri++) {
        const row = data[ri];
        const name = String(row[nameIdx] ?? '').trim();
        if (!name) continue;

        // 決算月から申告月を計算（法人+2、個人+3）
        const decMonthStr = String(row[decIdx] ?? '').replace('月','');
        const decMonthNum = MONTH_LABELS_JP.findIndex(m => m.replace('月','') === decMonthStr);
        const indivVal = String(row[indivIdx] ?? '').trim();
        const indiv = ['個人','1','true','yes'].includes(indivVal.toLowerCase()) || indivVal === '個人';
        const filingCalMonth = decMonthNum >= 0 ? calcFilingMonth(decMonthNum + 1, indiv) : -1;

        // 契約開始月（文字列 "4月" → 4）
        const startMonthStr = String(row[monthIdx] ?? '').replace('月','');
        const startMonthNum = MONTH_LABELS_JP.findIndex(m => m.replace('月','') === startMonthStr);

        const consulting = {};
        consultingCols.forEach((col, i) => {
          const v = parseFloat(String(row[col]).replace(/,/g,'')) || 0;
          if (v) consulting[i] = v;
        });

        // 確定列：「未確定」「×」「no」「0」以外はすべて確定
        const confirmedVal = String(row[confirmedIdx] ?? '').trim().toLowerCase();
        const confirmed = confirmedIdx < 0
          ? true
          : !['未確定','×','no','false','0'].includes(confirmedVal);

        // 売上区分
        const catName = catIdx >= 0 ? String(row[catIdx] ?? '').trim() : '';
        const category = REV_CATEGORIES.find(r => r.name === catName)?.id || 'sales_advisory';

        imported.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2,5) + ri,
          name,
          confirmed,
          indiv,
          category,
          contractStart: {
            year:  parseInt(row[yearIdx]) || new Date().getFullYear(),
            month: startMonthNum >= 0 ? startMonthNum + 1 : 1,
          },
          retainer:      parseFloat(String(row[retIdx] ?? '').replace(/,/g,'')) || 0,
          filingCalMonth,
          settlementFee: parseFloat(String(row[feeIdx] ?? '').replace(/,/g,'')) || 0,
          yearEndAdj:    parseFloat(String(row[adjIdx] ?? '').replace(/,/g,'')) || 0,
          consulting,
        });
      }

      if (!imported.length) { alert('インポートできる顧問先が見つかりませんでした'); return; }

      if (_revClients.length) {
        const choice = confirm(
          `既存の顧問先が${_revClients.length}社あります。\n\n` +
          `【OK】　　上書き（既存データを全て置き換え）\n` +
          `【キャンセル】　追加（既存データに追記）`
        );
        if (choice) {
          _revClients = imported;
        } else {
          _revClients.push(...imported);
        }
      } else {
        _revClients = imported;
      }

      _revRefresh();
      alert(`${imported.length}社をインポートしました`);
    } catch(err) {
      alert('インポートに失敗しました: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}
