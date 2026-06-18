// ホーム画面（フェーズハブ）

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

  const capital   = company.capital || 10000000;
  const curYear   = window.App?.currentYear || new Date().getFullYear();
  const updatedAt = budget?.updatedAt ? new Date(budget.updatedAt) : null;
  const updatedStr = updatedAt
    ? `${updatedAt.getFullYear()}/${String(updatedAt.getMonth()+1).padStart(2,'0')}/${String(updatedAt.getDate()).padStart(2,'0')} ${String(updatedAt.getHours()).padStart(2,'0')}:${String(updatedAt.getMinutes()).padStart(2,'0')}`
    : '未保存';

  // ===== 3期分の業績データ =====
  const budgetPrev1 = getBudget(company.id, curYear - 1);
  const budgetPrev2 = getBudget(company.id, curYear - 2);

  const extractMetrics = b => {
    if (!b) return null;
    const allVals = b.dynamicAccounts ? calcAllValuesDynamic(b) : calcAllValues(b.rows);
    const sum12 = id => (allVals[id] || []).reduce((a, v) => a + v, 0);
    const last  = id => (allVals[id] || new Array(12).fill(0))[11];
    if (b.dynamicAccounts) {
      const cashAcc = b.dynamicAccounts.find(a =>
        a.section?.startsWith('bs') && a.name.replace(/\s/g,'').match(/現金|預金|現預金/)
      );
      return {
        sales: sum12('sec_revenue'), gross: sum12('calc_gross'),
        op: sum12('calc_op'), ord: sum12('calc_ord'),
        pretax: sum12('calc_pretax'), net: sum12('calc_net'),
        cashEnd: cashAcc ? last(cashAcc.id) : 0,
      };
    }
    const pl = calcPL(b.rows);
    return {
      sales: pl.sales.reduce((a,v)=>a+v,0),
      gross: pl.gross_profit.reduce((a,v)=>a+v,0),
      op: pl.op_profit.reduce((a,v)=>a+v,0),
      ord: pl.ord_profit.reduce((a,v)=>a+v,0),
      pretax: pl.pretax_profit.reduce((a,v)=>a+v,0),
      net: pl.net_profit.reduce((a,v)=>a+v,0),
      cashEnd: (calcAllValues(b.rows)['cash'] || new Array(12).fill(0))[11],
    };
  };

  const mCur   = extractMetrics(budget);
  const mPrev1 = extractMetrics(budgetPrev1);
  const mPrev2 = extractMetrics(budgetPrev2);

  // ===== 税額計算 =====
  const pretaxTotal = mCur?.pretax || 0;
  let taxBreak = null, taxTotal = 0;
  if (pretaxTotal > 0) {
    taxBreak = calcAllTax(pretaxTotal, capital);
    taxTotal = taxBreak.total;
  }
  const prepaid1   = company.prepaid1 || 0;
  const prepaid2   = company.prepaid2 || 0;
  const taxBalance = taxTotal - (prepaid1 + prepaid2);

  // ===== 消費税 =====
  const ctaxEst = calcCtaxEstimate(budget, company);
  const kijun   = company.kijunUriage || 0;
  const invoice  = company.invoiceRegistered ?? false;
  const kani     = company.kanijukazei ?? false;
  let ctaxJudge = '課税判定不明', ctaxColor = 'var(--text-muted)';
  if (kijun > 0) {
    if (kijun <= 10000000) { ctaxJudge = '免税事業者の可能性'; ctaxColor = '#f59e0b'; }
    else if (kijun <= 50000000 && kani) { ctaxJudge = '簡易課税 適用可能'; ctaxColor = '#059669'; }
    else { ctaxJudge = '原則課税'; ctaxColor = 'var(--emerald)'; }
  }
  if (invoice && kijun <= 10000000) { ctaxJudge = 'インボイス登録→課税事業者'; ctaxColor = '#e11d48'; }

  // ===== 予算進捗 =====
  const progressItems = calcBudgetProgress(budget);
  const doneCount = progressItems.filter(p => p.done).length;
  const pct = progressItems.length ? Math.round(doneCount / progressItems.length * 100) : 0;

  // ===== フェーズ状態判定 =====
  const hasData   = !!budget;
  const hasImport = !!(budget?.dynamicAccounts?.length);
  const hasTax    = taxTotal > 0 || !!(ctaxEst && !ctaxEst.exempt && !ctaxEst.noData);
  const hasPrev   = !!(mPrev1 || mPrev2);

  const phaseStatus = (ok, label) =>
    ok ? `<span class="phase-badge ready">${label}</span>`
       : `<span class="phase-badge pending">${label}</span>`;

  // ===== フェーズカード用ツールリンク =====
  const toolLink = (page, phase, label, sub='') => `
    <div class="phase-tool" onclick="setPhase(${phase});showPage('${page}')">
      <span class="phase-tool-label">${label}</span>
      ${sub ? `<span class="phase-tool-sub">${sub}</span>` : ''}
      <span class="phase-tool-arrow">›</span>
    </div>`;

  // ===== 成果物モーダル =====
  const outputBtn = (phase, phaseNum) => `
    <button class="phase-output-btn" onclick="setPhase(${phaseNum});showOutputModal('${phase}')">
      📄 成果物を出力
    </button>`;

  container.innerHTML = `
    <div class="home-wrap">

      <!-- ヘッダーバー -->
      <div class="home-topbar">
        <div class="home-company-name">${escHtml(company.name)}</div>
        <div class="home-meta">
          <span class="home-meta-item">📅 ${curYear}年度</span>
          <span class="home-meta-item">🕒 ${updatedStr}</span>
          <button class="btn btn-sm" onclick="openCompanyModal('${company.id}')">会社情報を編集</button>
        </div>
      </div>

      <!-- ===== フェーズハブ ===== -->
      <div class="phase-hub">

        <!-- ① 期中 -->
        <div class="phase-card phase-blue">
          <div class="phase-card-head">
            <div class="phase-card-head-row">
              <div class="phase-num">①</div>
              <div class="phase-title-wrap">
                <div class="phase-title">期中</div>
              </div>
              ${phaseStatus(hasData && pct >= 60, pct >= 60 ? `入力済 ${pct}%` : `入力中 ${pct}%`)}
            </div>
            <div class="phase-desc">予算を立てて進捗を管理</div>
          </div>

          <div class="phase-tools">
            ${toolLink('import',   1, '📤 推移表アップロード', hasImport ? 'データあり' : '未インポート')}
            ${toolLink('budget',   1, '📝 月次予算入力',       hasData ? `${pct}%完了` : '未入力')}
            ${toolLink('revenue',  1, '💹 売上予算設定')}
            ${toolLink('cashflow', 1, '💰 CF予測')}
          </div>

          <div class="phase-kpi-mini">
            <div class="phase-kpi-item">
              <span class="phase-kpi-label">売上高</span>
              <span class="phase-kpi-val">${mCur ? fmtHome(mCur.sales) : '—'}</span>
            </div>
            <div class="phase-kpi-item">
              <span class="phase-kpi-label">営業利益</span>
              <span class="phase-kpi-val ${mCur?.op >= 0 ? 'pos' : 'neg'}">${mCur ? fmtHome(mCur.op) : '—'}</span>
            </div>
          </div>

          ${outputBtn('kichu', 1)}
        </div>

        <!-- ② 決算 -->
        <div class="phase-card phase-amber">
          <div class="phase-card-head">
            <div class="phase-card-head-row">
              <div class="phase-num">②</div>
              <div class="phase-title-wrap">
                <div class="phase-title">決算</div>
              </div>
              ${phaseStatus(hasTax, hasTax ? '概算計算済' : '未計算')}
            </div>
            <div class="phase-desc">税金・調整を概算で詰める</div>
          </div>

          <div class="phase-tools">
            ${toolLink('tax',      2, '🧮 税額概算',           hasTax ? `法人税 ${Math.round(taxTotal/10000)}万円` : '要データ')}
            ${toolLink('ctax',     2, '🧾 消費税関連',          ctaxJudge)}
            ${toolLink('execcomp', 2, '👤 役員報酬・賞与最適化')}
          </div>

          <div class="phase-kpi-mini">
            <div class="phase-kpi-item">
              <span class="phase-kpi-label">法人税等</span>
              <span class="phase-kpi-val">${taxTotal > 0 ? fmtHome(taxTotal) : '—'}</span>
            </div>
            <div class="phase-kpi-item">
              <span class="phase-kpi-label">消費税</span>
              <span class="phase-kpi-val">${ctaxEst && !ctaxEst.exempt && !ctaxEst.noData ? fmtHome(ctaxEst.ctax) : ctaxEst?.exempt ? '免税' : '—'}</span>
            </div>
          </div>

          ${outputBtn('kessan', 2)}
        </div>

        <!-- ③ 申告・報告 -->
        <div class="phase-card phase-green">
          <div class="phase-card-head">
            <div class="phase-card-head-row">
              <div class="phase-num">③</div>
              <div class="phase-title-wrap">
                <div class="phase-title">申告・報告</div>
              </div>
              ${phaseStatus(hasPrev, hasPrev ? '過去データあり' : '過去データなし')}
            </div>
            <div class="phase-desc">経営分析・報告書作成</div>
          </div>

          <div class="phase-tools">
            ${toolLink('simulation', 3, '📊 3期比較PL',           hasPrev ? `${curYear-2}〜${curYear}年度` : '過去データ必要')}
            ${toolLink('health',     3, '🩺 財務健康診断')}
            ${toolLink('simulation', 3, '📐 損益分岐点')}
            ${toolLink('fiveyear',   3, '🔮 5か年シミュレーション')}
          </div>

          <div class="phase-kpi-mini">
            <div class="phase-kpi-item">
              <span class="phase-kpi-label">前期比（売上）</span>
              <span class="phase-kpi-val">
                ${(mCur && mPrev1 && mPrev1.sales) ? (() => {
                  const d = Math.round((mCur.sales - mPrev1.sales) / Math.abs(mPrev1.sales) * 100);
                  return `<span style="color:${d>=0?'#059669':'#dc2626'}">${d>=0?'+':''}${d}%</span>`;
                })() : '—'}
              </span>
            </div>
            <div class="phase-kpi-item">
              <span class="phase-kpi-label">前期比（利益）</span>
              <span class="phase-kpi-val">
                ${(mCur && mPrev1 && mPrev1.net) ? (() => {
                  const d = Math.round((mCur.net - mPrev1.net) / Math.abs(mPrev1.net) * 100);
                  return `<span style="color:${d>=0?'#059669':'#dc2626'}">${d>=0?'+':''}${d}%</span>`;
                })() : '—'}
              </span>
            </div>
          </div>

          ${outputBtn('申告', 3)}
        </div>

      </div>

      <!-- ===== 業績サマリー（3期比較・折りたたみ） ===== -->
      <details class="home-details" ${hasData ? 'open' : ''}>
        <summary class="home-details-summary">📈 業績サマリー（3期比較）</summary>
        <div class="home-card" style="margin-top:0;border-radius:0 0 10px 10px;border-top:none">
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
                { label:'売上高',     key:'sales',  profit:false },
                { label:'売上総利益', key:'gross',  profit:true  },
                { label:'営業利益',   key:'op',     profit:true  },
                { label:'経常利益',   key:'ord',    profit:true  },
                { label:'税引前利益', key:'pretax', profit:true  },
                { label:'当期純利益', key:'net',    profit:true  },
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
      </details>

    </div>

    <!-- ===== 成果物モーダル ===== -->
    <div id="output-modal" class="modal-overlay" style="display:none" onclick="if(event.target===this)closeOutputModal()">
      <div class="modal-box" style="max-width:460px">
        <div class="modal-title" id="output-modal-title">成果物を出力</div>
        <div id="output-modal-body" style="margin:16px 0"></div>
        <div style="display:flex;justify-content:flex-end">
          <button class="btn btn-sm" onclick="closeOutputModal()">閉じる</button>
        </div>
      </div>
    </div>
  `;
}

// ===== 成果物モーダル =====
function showOutputModal(phase) {
  const modal = document.getElementById('output-modal');
  const title = document.getElementById('output-modal-title');
  const body  = document.getElementById('output-modal-body');
  if (!modal) return;

  const items = {
    kichu: {
      label: '① 期中 — 成果物',
      outputs: [
        { label: '月次予算表（Excel）',   icon:'📊', fn: "alert('月次予算表 Excel出力（準備中）')" },
        { label: '月次予算表（PDF）',     icon:'📄', fn: "alert('月次予算表 PDF出力（準備中）')" },
        { label: '資金繰り予測表（PDF）', icon:'💰', fn: "alert('資金繰り PDF出力（準備中）')" },
        { label: '5か年計画書（Excel）',  icon:'🔮', fn: "alert('5か年計画 Excel出力（準備中）')" },
      ]
    },
    kessan: {
      label: '② 決算 — 成果物',
      outputs: [
        { label: '税額概算書（PDF）',       icon:'🧮', fn: "alert('税額概算書 PDF出力（準備中）')" },
        { label: '役員報酬設計書（PDF）',   icon:'👤', fn: "alert('役員報酬設計書 PDF出力（準備中）')" },
      ]
    },
    申告: {
      label: '③ 申告・報告 — 成果物',
      outputs: [
        { label: '決算報告書パック（PDF）',  icon:'📋', fn: "alert('決算報告書 PDF出力（準備中）')" },
        { label: '3期比較表（Excel）',       icon:'📊', fn: "alert('3期比較 Excel出力（準備中）')" },
        { label: '5か年計画書（Excel）',     icon:'🔮', fn: "alert('5か年計画 Excel出力（準備中）')" },
        { label: '5か年計画書（PDF）',       icon:'📄', fn: "alert('5か年計画 PDF出力（準備中）')" },
      ]
    }
  };

  const cfg = items[phase];
  if (!cfg) return;

  title.textContent = cfg.label;
  body.innerHTML = cfg.outputs.map(o => `
    <div class="output-item" onclick="${o.fn}">
      <span class="output-icon">${o.icon}</span>
      <span class="output-label">${o.label}</span>
      <span class="output-badge">準備中</span>
    </div>`).join('');

  modal.style.display = 'flex';
}
function closeOutputModal() {
  const m = document.getElementById('output-modal');
  if (m) m.style.display = 'none';
}

// ===== 予算進捗チェック =====
function calcBudgetProgress(budget) {
  if (!budget) return [];
  const rows = budget.rows || {};
  const dynAccts = budget.dynamicAccounts;
  const hasSection = secId => {
    if (!dynAccts) return false;
    return dynAccts.some(a => (a.parentId === secId || a.id === secId) && (rows[a.id]||[]).some(v=>v!==0));
  };
  const hasRows = (...ids) => ids.some(id => (rows[id]||[]).some(v=>v!==0));

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

  const kijun  = company.kijunUriage || 0;
  const invoice = company.invoiceRegistered ?? false;
  const kani    = company.kanijukazei ?? false;
  const isTaxable = invoice || kijun > 10000000;
  if (!isTaxable) return { exempt: true };

  const allVals    = budget.dynamicAccounts ? calcAllValuesDynamic(budget) : calcAllValues(budget.rows);
  const rows       = budget.rows || {};
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

  if (kani && kijun <= 50000000) {
    const MINAS = { 1: 0.90, 2: 0.80, 3: 0.70, 4: 0.60, 5: 0.50, 6: 0.40 };
    const businessType = company.businessType || 5;
    const minasRate    = MINAS[businessType] || 0.50;
    const salesArr     = allVals['sec_revenue'] || allVals['sales'] || [];
    const salesTotal   = salesArr.reduce((a, v) => a + v, 0) * annualFactor;
    const outputTax    = salesTotal * 0.10;
    const ctax         = outputTax * (1 - minasRate);
    return { method: 'kani', businessType, minasRate, salesTotal, outputTax, ctax, filledMonths, annualFactor, ctaxPrepaid };
  }

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
    const k    = annualFactor;
    const ctax = (kariUke * k) - (kariHarai * k);
    return { method: 'honzoku', kariHarai: kariHarai * k, kariUke: kariUke * k, ctax, filledMonths, annualFactor, ctaxPrepaid };
  }

  return { method: 'honzoku', noData: true };
}

// ===== ホーム用フォーマット =====
function fmtHome(v) {
  const abs  = Math.abs(v);
  const sign = v < 0 ? '▲' : '';
  if (abs >= 100000000) return sign + (abs / 100000000).toFixed(1) + '億円';
  if (abs >= 10000000)  return sign + Math.round(abs / 10000).toLocaleString() + '万円';
  if (abs >= 1000)      return sign + Math.round(abs / 1000).toLocaleString() + '千円';
  return sign + Math.round(abs).toLocaleString() + '円';
}
