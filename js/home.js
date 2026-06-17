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

  // ===== 3期分の業績データ取得 =====
  const curYear  = window.App?.currentYear || new Date().getFullYear();
  const budgetPrev1 = getBudget(company.id, curYear - 1);
  const budgetPrev2 = getBudget(company.id, curYear - 2);

  const extractMetrics = b => {
    if (!b) return null;
    const allVals = b.dynamicAccounts ? calcAllValuesDynamic(b) : calcAllValues(b.rows);
    const sum12 = id => (allVals[id] || []).reduce((a,v)=>a+v,0);
    const last  = id => (allVals[id] || new Array(12).fill(0))[11];
    if (b.dynamicAccounts) {
      const cashAcc = b.dynamicAccounts.find(a =>
        a.section?.startsWith('bs') && a.name.replace(/\s/g,'').match(/現金|預金|現預金/)
      );
      return {
        sales:      sum12('sec_revenue'),
        gross:      sum12('calc_gross'),
        op:         sum12('calc_op'),
        ord:        sum12('calc_ord'),
        pretax:     sum12('calc_pretax'),
        net:        sum12('calc_net'),
        cashEnd:    cashAcc ? last(cashAcc.id) : 0,
      };
    }
    const pl = calcPL(b.rows);
    return {
      sales:   pl.sales.reduce((a,v)=>a+v,0),
      gross:   pl.gross_profit.reduce((a,v)=>a+v,0),
      op:      pl.op_profit.reduce((a,v)=>a+v,0),
      ord:     pl.ord_profit.reduce((a,v)=>a+v,0),
      pretax:  pl.pretax_profit.reduce((a,v)=>a+v,0),
      net:     pl.net_profit.reduce((a,v)=>a+v,0),
      cashEnd: (allVals['cash'] || new Array(12).fill(0))[11],
    };
  };

  const mCur   = extractMetrics(budget);
  const mPrev1 = extractMetrics(budgetPrev1);
  const mPrev2 = extractMetrics(budgetPrev2);

  // 税額は当期のみ
  const pretaxTotal = mCur?.pretax || 0;

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
  if (invoice && kijun <= 10000000) {
    ctaxJudge = 'インボイス登録→課税事業者';
    ctaxColor = '#e11d48';
  }

  // ===== 消費税概算 =====
  const ctaxEst = calcCtaxEstimate(budget, company);

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

      <!-- 業績＋税務サマリー -->
      <div class="home-summary-grid">

        <!-- 業績サマリー（3期比較） -->
        <div class="home-card home-card-wide">
          <div class="home-card-title">📈 業績サマリー（3期比較）</div>
          <table class="yr3-table">
            <thead>
              <tr>
                <th class="yr3-label-col">科目</th>
                <th class="yr3-num-col">${curYear-2}年度</th>
                <th class="yr3-num-col">${curYear-1}年度</th>
                <th class="yr3-num-col yr3-cur">${curYear}年度<br><span class="yr3-badge">当期予算</span></th>
                <th class="yr3-num-col yr3-diff">前期比</th>
              </tr>
            </thead>
            <tbody>
              ${[
                { label:'売上高',      key:'sales',  profit:false },
                { label:'売上総利益',  key:'gross',  profit:true  },
                { label:'営業利益',    key:'op',     profit:true  },
                { label:'経常利益',    key:'ord',    profit:true  },
                { label:'税引前利益',  key:'pretax', profit:true  },
                { label:'当期純利益',  key:'net',    profit:true  },
              ].map(row => {
                const v2 = mPrev2?.[row.key] ?? null;
                const v1 = mPrev1?.[row.key] ?? null;
                const v0 = mCur?.[row.key] ?? null;
                const diffPct = (v1 && v0 !== null) ? Math.round((v0 - v1) / Math.abs(v1) * 100) : null;
                const diffStr = diffPct !== null
                  ? `<span style="color:${diffPct>=0?'#059669':'#dc2626'}">${diffPct>=0?'+':''}${diffPct}%</span>`
                  : '—';
                const fmtCell = (v, profit) => {
                  if (v === null) return '<span class="yr3-nodata">—</span>';
                  const c = profit ? (v>=0?'#059669':'#dc2626') : 'inherit';
                  return `<span style="color:${c}">${fmtHome(v)}</span>`;
                };
                return `<tr class="yr3-row${row.profit?' yr3-profit':''}">
                  <td class="yr3-label">${row.label}</td>
                  <td class="yr3-num">${fmtCell(v2, row.profit)}</td>
                  <td class="yr3-num">${fmtCell(v1, row.profit)}</td>
                  <td class="yr3-num yr3-cur">${fmtCell(v0, row.profit)}</td>
                  <td class="yr3-num yr3-diff">${diffStr}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          <div style="margin-top:6px;font-size:10px;color:var(--text-muted)">単位：万円　前期比は前期→当期予算の変化率</div>
        </div>

        <!-- 税額概算（法人税＋消費税） -->
        <div class="home-card">
          <div class="home-card-title">🧾 税額概算</div>

          <!-- 法人税ブロック -->
          <div class="tax-block-label">法人税等</div>
          ${taxBreak ? `
            ${[
              { label:'法人税',     val: taxBreak.corp },
              { label:'地方法人税', val: taxBreak.localCorp },
              { label:'法人住民税', val: taxBreak.inhabitant },
              { label:'法人事業税', val: taxBreak.business + taxBreak.special },
            ].map(t=>`
              <div class="tax-kpi-row">
                <span>${t.label}</span>
                <span>${Math.round(t.val/1000).toLocaleString()}千円</span>
              </div>`).join('')}
            <div class="tax-kpi-total">
              <span>法人税合計</span>
              <span>${Math.round(taxTotal/1000).toLocaleString()}千円</span>
            </div>
            <div class="tax-kpi-row">
              <span style="color:var(--text-muted)">予定納税①②</span>
              <span style="color:var(--text-muted)">▲${Math.round((prepaid1+prepaid2)/1000).toLocaleString()}千円</span>
            </div>
            <div class="tax-kpi-row ${taxBalance>=0?'tax-pay':'tax-refund'}">
              <span>${taxBalance>=0?'法人税　納付見込':'法人税　還付見込'}</span>
              <span><strong>${Math.round(Math.abs(taxBalance)/1000).toLocaleString()}千円</strong></span>
            </div>
          ` : '<div class="no-data-small">予算データがありません</div>'}

          <!-- 消費税ブロック -->
          <div class="tax-block-label" style="margin-top:14px">消費税等</div>
          ${ctaxEst?.exempt ? `
            <div class="no-data-small">免税事業者（概算不要）</div>
          ` : ctaxEst?.noData ? `
            <div class="no-data-small">仮払・仮受消費税のデータがありません<br><span style="font-size:10px">Mirokuからインポートすると自動計算</span></div>
          ` : ctaxEst ? `
            ${ctaxEst.method === 'kani' ? `
              <div class="tax-kpi-row">
                <span>計算方法</span><span>簡易課税（第${ctaxEst.businessType}種・${Math.round(ctaxEst.minasRate*100)}%）</span>
              </div>
              <div class="tax-kpi-row">
                <span>売上高（年換算）</span><span>${Math.round(ctaxEst.salesTotal/1000).toLocaleString()}千円</span>
              </div>
              <div class="tax-kpi-row">
                <span>仮受消費税相当</span><span>${Math.round(ctaxEst.outputTax/1000).toLocaleString()}千円</span>
              </div>
              <div class="tax-kpi-row">
                <span>みなし仕入控除</span><span>▲${Math.round(ctaxEst.outputTax*ctaxEst.minasRate/1000).toLocaleString()}千円</span>
              </div>
            ` : `
              <div class="tax-kpi-row">
                <span>計算方法</span><span>本則課税</span>
              </div>
              <div class="tax-kpi-row">
                <span>仮受消費税（年換算）</span><span>${Math.round(ctaxEst.kariUke/1000).toLocaleString()}千円</span>
              </div>
              <div class="tax-kpi-row">
                <span>仮払消費税（年換算）</span><span>▲${Math.round(ctaxEst.kariHarai/1000).toLocaleString()}千円</span>
              </div>
            `}
            ${ctaxEst.filledMonths < 12 ? `
              <div class="tax-kpi-row" style="font-size:10px;color:var(--text-muted)">
                <span>※${ctaxEst.filledMonths}か月→12か月換算</span><span></span>
              </div>` : ''}
            <div class="tax-kpi-total">
              <span>消費税合計</span>
              <span>${Math.round(ctaxEst.ctax/1000).toLocaleString()}千円</span>
            </div>
            <div class="tax-kpi-row">
              <span style="color:var(--text-muted)">消費税中間納付</span>
              <span style="color:var(--text-muted)">▲${Math.round((ctaxEst.ctaxPrepaid||0)/1000).toLocaleString()}千円</span>
            </div>
            <div class="tax-kpi-row ${(ctaxEst.ctax-(ctaxEst.ctaxPrepaid||0))>=0?'tax-pay':'tax-refund'}">
              <span>${(ctaxEst.ctax-(ctaxEst.ctaxPrepaid||0))>=0?'消費税　納付見込':'消費税　還付見込'}</span>
              <span><strong>${Math.round(Math.abs(ctaxEst.ctax-(ctaxEst.ctaxPrepaid||0))/1000).toLocaleString()}千円</strong></span>
            </div>
          ` : '<div class="no-data-small">会社情報を設定してください</div>'}

          <div style="margin-top:10px;font-size:10px;color:var(--text-muted)">※概算値。実際の申告額とは異なる場合があります</div>
        </div>

        <!-- 消費税ステータス -->
        <div class="home-card">
          <div class="home-card-title">📋 消費税ステータス</div>
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
          <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-xs btn-outline" onclick="showPage('ctax')">消費税関連 →</button>
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

// ===== 消費税概算計算 =====
function calcCtaxEstimate(budget, company) {
  if (!budget || !company) return null;

  const kijun   = company.kijunUriage || 0;
  const invoice  = company.invoiceRegistered ?? false;
  const kani     = company.kanijukazei ?? false;

  // 免税事業者かどうか判定
  const isTaxable = invoice || kijun > 10000000;
  if (!isTaxable) return { exempt: true };

  const allVals   = budget.dynamicAccounts ? calcAllValuesDynamic(budget) : calcAllValues(budget.rows);
  const rows      = budget.rows || {};

  // 入力済み月数（按分用）: actualThrough が設定されていればそれ+1、なければ売上の非ゼロ月数
  let filledMonths = 12;
  if (budget.actualThrough != null) {
    filledMonths = budget.actualThrough + 1;
  } else {
    const salesArr = allVals['sec_revenue'] || allVals['sales'] || [];
    const nonZero  = salesArr.filter(v => v !== 0).length;
    if (nonZero > 0 && nonZero < 12) filledMonths = nonZero;
  }
  const annualFactor = filledMonths > 0 && filledMonths < 12 ? 12 / filledMonths : 1;
  const ctaxPrepaid  = company.ctaxPrepaid || 0;

  // 簡易課税（kani届出かつ基準期間売上5000万以下）
  if (kani && kijun <= 50000000) {
    const MINAS = { 1: 0.90, 2: 0.80, 3: 0.70, 4: 0.60, 5: 0.50, 6: 0.40 };
    const businessType = company.businessType || 5;
    const minasRate    = MINAS[businessType] || 0.50;

    const salesArr   = allVals['sec_revenue'] || allVals['sales'] || [];
    const salesTotal = salesArr.reduce((a, v) => a + v, 0) * annualFactor;
    // 売上高は税抜想定: 消費税 = 税抜売上 × 10%
    const outputTax  = salesTotal * 0.10;
    const ctax       = outputTax * (1 - minasRate);
    return { method: 'kani', businessType, minasRate, salesTotal, outputTax, ctax, filledMonths, annualFactor, ctaxPrepaid };
  }

  // 本則課税: 仮払消費税・仮受消費税をBS動的科目から探す
  if (budget.dynamicAccounts) {
    let kariHarai = 0, kariUke = 0, foundH = false, foundU = false;
    for (const acc of budget.dynamicAccounts) {
      const name = acc.name.replace(/\s/g, '');
      const vals = allVals[acc.id] || rows[acc.id] || new Array(12).fill(0);
      const total = vals.reduce((a, v) => a + v, 0);
      if (name.includes('仮払消費税')) { kariHarai += Math.abs(total); foundH = true; }
      if (name.includes('仮受消費税')) { kariUke   += Math.abs(total); foundU = true; }
    }
    if (!foundH && !foundU) return { method: 'honzoku', noData: true };
    const k = annualFactor;
    const ctax = (kariUke * k) - (kariHarai * k);
    return { method: 'honzoku', kariHarai: kariHarai * k, kariUke: kariUke * k, ctax, filledMonths, annualFactor, ctaxPrepaid };
  }

  // 静的科目の場合: 仮払/仮受がないのでデータ不足
  return { method: 'honzoku', noData: true };
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
