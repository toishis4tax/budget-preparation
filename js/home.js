// ホーム画面（ダッシュボード）

function renderHome(container) {
  const budget  = window.App?.currentBudget;
  const company = window.App?.currentCompany;

  if (!company) {
    container.innerHTML = `
      <div class="home-empty">
        <div style="font-size:56px;margin-bottom:20px">📊</div>
        <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:10px">予算・資金繰りシミュレーター</div>
        <div style="color:var(--text-muted);margin-bottom:28px;font-size:14px">顧問先を追加して予算入力を始めてください</div>
        <button class="btn-solid" onclick="openCompanyModal('')">＋ 顧問先を追加する</button>
      </div>`;
    return;
  }

  const capital      = company.capital || 10000000;
  const updatedAt    = budget?.updatedAt ? new Date(budget.updatedAt) : null;
  const updatedStr   = updatedAt
    ? `${updatedAt.getFullYear()}/${String(updatedAt.getMonth()+1).padStart(2,'0')}/${String(updatedAt.getDate()).padStart(2,'0')} ${String(updatedAt.getHours()).padStart(2,'0')}:${String(updatedAt.getMinutes()).padStart(2,'0')}`
    : '未保存';

  // ===== 業績サマリー計算 =====
  let sales = 0, ordProfit = 0, netProfit = 0, cashEnd = 0;
  let pretaxTotal = 0;

  if (budget) {
    const allVals = budget.dynamicAccounts
      ? calcAllValuesDynamic(budget)
      : calcAllValues(budget.rows);

    const sum12 = id => (allVals[id] || []).reduce((a,b)=>a+b,0);
    const last12 = id => (allVals[id] || new Array(12).fill(0))[11];

    if (budget.dynamicAccounts) {
      // 動的インポート科目から集計
      const secRevId = budget.dynamicAccounts.find(a => a.id === 'sec_revenue')?.id;
      sales      = secRevId ? sum12(secRevId) : 0;
      ordProfit  = sum12('calc_ord') || sum12('calc_op');
      pretaxTotal= sum12('calc_pretax') || ordProfit;
      netProfit  = sum12('calc_net');
      // BSのキャッシュ残高（最終月）
      const cashAcc = budget.dynamicAccounts.find(a =>
        a.section?.startsWith('bs') && a.name.replace(/\s/g,'').match(/現金|預金|現預金/)
      );
      cashEnd = cashAcc ? last12(cashAcc.id) : 0;
    } else {
      sales       = sum12('sales');
      ordProfit   = sum12('ord_profit');
      pretaxTotal = sum12('pretax_profit');
      netProfit   = sum12('net_profit');
      cashEnd     = last12('cash');
    }
  }

  // ===== 税額計算 =====
  let taxTotal = 0, taxBreak = null;
  if (pretaxTotal > 0) {
    taxBreak = calcAllTax(pretaxTotal, capital);
    taxTotal = taxBreak.total;
  }
  const prepaid1 = company.prepaid1 || 0;
  const prepaid2 = company.prepaid2 || 0;
  const taxBalance = taxTotal - (prepaid1 + prepaid2);

  // ===== 消費税判定 =====
  const kijun = company.kijunUriage || 0;
  const invoice = company.invoiceRegistered ?? false;
  const kani    = company.kanijukazei ?? false;
  let ctaxJudge = '課税判定不明';
  let ctaxColor = 'var(--text-muted)';
  if (kijun > 0) {
    if (kijun <= 10000000) {
      ctaxJudge = '免税事業者の可能性';
      ctaxColor = '#f59e0b';
    } else if (kijun <= 50000000 && kani) {
      ctaxJudge = '簡易課税 適用可能';
      ctaxColor = '#059669';
    } else {
      ctaxJudge = '原則課税';
      ctaxColor = 'var(--emerald)';
    }
  }
  // インボイス登録で強制課税
  if (invoice && kijun <= 10000000) {
    ctaxJudge = 'インボイス登録→課税事業者';
    ctaxColor = '#e11d48';
  }

  // ===== 予算進捗 =====
  const progressItems = calcBudgetProgress(budget);
  const doneCount = progressItems.filter(p=>p.done).length;
  const pct = progressItems.length ? Math.round(doneCount / progressItems.length * 100) : 0;

  // ===== 財務健康診断 =====
  let healthHtml = '';
  if (budget) {
    const rows = budget.rows || {};
    const allV = calcAllValues(rows);
    const metrics = calcHealthMetrics(rows, capital);
    const overall = ['equity_ratio','current_ratio','op_margin'].map(k => gradeMetric(k, metrics[k]));
    const grades  = ['A','B','C','D','E'];
    const gIdx    = overall.map(g => grades.indexOf(g));
    const avgIdx  = Math.round(gIdx.reduce((a,b)=>a+b,0) / gIdx.length);
    const overallGrade = grades[Math.min(avgIdx, 4)];
    const gradeColor = { A:'#059669',B:'#0284c7',C:'#d97706',D:'#dc2626',E:'#7f1d1d' };

    healthHtml = `
      <div class="home-health-row">
        <div class="health-overall" style="color:${gradeColor[overallGrade] || '#374151'}">
          <div class="health-grade-label">総合評価</div>
          <div class="health-grade-value">${overallGrade}</div>
        </div>
        ${[
          { key:'equity_ratio',      label:'自己資本比率', unit:'%', dp:1 },
          { key:'current_ratio',     label:'流動比率',     unit:'%', dp:0 },
          { key:'loan_month_ratio',  label:'借入月商倍率', unit:'ヶ月', dp:1 },
          { key:'op_margin',         label:'経常利益率',   unit:'%', dp:1 },
        ].map(item => {
          const v = metrics[item.key];
          const g = gradeMetric(item.key, v);
          const c = gradeColor[g] || '#374151';
          return `<div class="health-metric-card">
            <div class="hm-label">${item.label}</div>
            <div class="hm-value" style="color:${c}">${v.toFixed(item.dp)}${item.unit}</div>
            <div class="hm-grade" style="color:${c}">${g}</div>
          </div>`;
        }).join('')}
      </div>`;
  }

  container.innerHTML = `
    <div class="home-wrap">

      <!-- ヘッダーバー -->
      <div class="home-topbar">
        <div class="home-company-name">${escHtml(company.name)}</div>
        <div class="home-meta">
          <span class="home-meta-item">📅 ${window.App?.currentYear || ''}年度</span>
          <span class="home-meta-item">🕒 最終更新: ${updatedStr}</span>
          <button class="btn btn-sm" onclick="openCompanyModal('${company.id}')">会社情報を編集</button>
        </div>
      </div>

      <!-- 予算進捗 -->
      <div class="home-card home-progress-card">
        <div class="home-card-title">📋 予算作成状況</div>
        <div class="progress-bar-wrap">
          <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width:${pct}%"></div>
          </div>
          <span class="progress-pct">${pct}%</span>
        </div>
        <div class="progress-items">
          ${progressItems.map(p => `
            <span class="progress-item ${p.done?'done':'pending'}">
              ${p.done?'✅':'⬜'} ${p.label}
            </span>`).join('')}
        </div>
      </div>

      <!-- 3カラム サマリー -->
      <div class="home-summary-grid">

        <!-- 業績サマリー -->
        <div class="home-card">
          <div class="home-card-title">📈 業績サマリー（通期予測）</div>
          ${[
            { label: '売上高',         val: sales,       color: 'var(--emerald)' },
            { label: '経常利益',       val: ordProfit,   color: ordProfit>=0?'#059669':'#dc2626' },
            { label: '税引後利益（予）', val: netProfit || pretaxTotal - taxTotal, color: (netProfit||pretaxTotal-taxTotal)>=0?'#059669':'#dc2626' },
            { label: '期末現預金残高', val: cashEnd,     color: cashEnd>0?'#0284c7':'#dc2626' },
          ].map(item => `
            <div class="summary-kpi">
              <div class="kpi-label">${item.label}</div>
              <div class="kpi-value" style="color:${item.color}">${fmtHome(item.val)}</div>
            </div>`).join('')}
        </div>

        <!-- 税額サマリー -->
        <div class="home-card">
          <div class="home-card-title">🧾 法人税額（概算）</div>
          ${taxBreak ? `
            ${[
              { label:'法人税',         val: taxBreak.corp },
              { label:'地方法人税',     val: taxBreak.localCorp },
              { label:'法人住民税',     val: taxBreak.inhabitant },
              { label:'法人事業税',     val: taxBreak.business + taxBreak.special },
            ].map(t=>`
              <div class="tax-kpi-row">
                <span>${t.label}</span>
                <span>${Math.round(t.val/1000).toLocaleString()}千円</span>
              </div>`).join('')}
            <div class="tax-kpi-total">
              <span>税額合計</span>
              <span>${Math.round(taxTotal/1000).toLocaleString()}千円</span>
            </div>
            <div class="tax-kpi-row ${taxBalance>=0?'tax-pay':'tax-refund'}">
              <span>${taxBalance>=0?'追加納付見込':'還付見込'}</span>
              <span><strong>${Math.round(Math.abs(taxBalance)/1000).toLocaleString()}千円</strong></span>
            </div>
          ` : '<div class="no-data-small">予算データがありません</div>'}
          <div style="margin-top:10px;font-size:10px;color:var(--text-muted)">
            ※概算。予定納税: ${Math.round((prepaid1+prepaid2)/1000).toLocaleString()}千円を控除済
          </div>
        </div>

        <!-- 消費税判定 -->
        <div class="home-card">
          <div class="home-card-title">📋 消費税判定</div>
          <div class="ctax-items">
            <div class="ctax-row">
              <span>インボイス登録</span>
              <span class="ctax-badge ${invoice?'yes':'no'}">${invoice?'登録済':'未登録'}</span>
            </div>
            <div class="ctax-row">
              <span>簡易課税届出</span>
              <span class="ctax-badge ${kani?'yes':'no'}">${kani?'届出済':'未届出'}</span>
            </div>
            <div class="ctax-row">
              <span>基準期間売上高</span>
              <span>${kijun>0 ? Math.round(kijun/1000).toLocaleString()+'千円' : '未設定'}</span>
            </div>
          </div>
          <div class="ctax-judge" style="color:${ctaxColor}">${ctaxJudge}</div>
          <div style="margin-top:8px">
            <button class="btn btn-xs btn-outline" onclick="openCompanyModal('${company.id}')">設定を更新</button>
          </div>
        </div>
      </div>

      <!-- 財務健康診断 -->
      ${budget ? `
      <div class="home-card">
        <div class="home-card-title" style="margin-bottom:12px">🩺 財務健康診断</div>
        ${healthHtml}
        <div style="margin-top:10px;text-align:right">
          <button class="btn btn-sm btn-outline" onclick="showPage('health')">詳細を見る →</button>
        </div>
      </div>` : ''}

    </div>`;
}

// ===== 予算進捗チェック =====
function calcBudgetProgress(budget) {
  if (!budget) return [];
  const rows = budget.rows || {};
  const dynAccts = budget.dynamicAccounts;
  const hasSection = secId => {
    if (!dynAccts) return false;
    const kids = dynAccts.filter(a => a.parentId === secId || a.id === secId);
    return kids.some(a => (rows[a.id] || []).some(v => v !== 0));
  };
  const hasRows = (...ids) => ids.some(id => (rows[id] || []).some(v => v !== 0));

  if (dynAccts) {
    return [
      { label: '売上',     done: hasSection('sec_revenue') },
      { label: '売上原価', done: hasSection('sec_cogs') },
      { label: '販管費',   done: hasSection('sec_sga') },
      { label: '営業外',   done: hasSection('sec_non_op_inc') || hasSection('sec_non_op_exp') },
      { label: 'BS残高',   done: dynAccts.some(a => a.section?.startsWith('bs') && (rows[a.id]||[]).some(v=>v!==0)) },
    ];
  }
  return [
    { label: '売上',     done: hasRows('sales_ec','sales_store','sales_other','sales_advisory','sales_consulting','sales_compliance') },
    { label: '売上原価', done: hasRows('cogs_purchase','cogs_open','cogs_close') },
    { label: '人件費',   done: hasRows('sga_exec','sga_emp','sga_bonus','sga_welfare') },
    { label: '販管費',   done: hasRows('sga_travel','sga_comm','sga_ad','sga_rent','sga_depr','sga_other') },
    { label: 'BS残高',   done: hasRows('cash','ar','ap','long_loan','short_loan') },
  ];
}

// ===== ホーム用フォーマット =====
function fmtHome(v) {
  const abs = Math.abs(v);
  const sign = v < 0 ? '▲' : '';
  if (abs >= 100000000) return sign + (abs / 100000000).toFixed(1) + '億円';
  if (abs >= 10000000)  return sign + Math.round(abs / 10000).toLocaleString() + '万円';
  if (abs >= 1000)      return sign + Math.round(abs / 1000).toLocaleString() + '千円';
  return sign + Math.round(abs).toLocaleString() + '円';
}
