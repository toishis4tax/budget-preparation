// ホーム画面（フェーズハブ＋各フェーズダッシュボード）

function renderHome(container) {
  const phase   = window.App?.currentPhase || 0;
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

  // フェーズ別ダッシュボードに振り分け
  if (phase === 1) return renderPhase1Home(container, budget, company);
  if (phase === 2) return renderPhase2Home(container, budget, company);
  if (phase === 3) return renderPhase3Home(container, budget, company);

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
  const outputBtn = (phase, phaseNum) => {
    if (phase === 'kichu') {
      return `<button class="phase-output-btn" onclick="setPhase(${phaseNum});showKichuOutput('forecast')">📄 成果物を出力</button>`;
    }
    return `<button class="phase-output-btn" onclick="setPhase(${phaseNum});showOutputModal('${phase}')">📄 成果物を出力</button>`;
  };

  const INDUSTRY_LABELS = { tax_accountant:'税理士・会計事務所', real_estate:'不動産業', retail:'小売業', service:'サービス業', construction:'建設業', manufacturing:'製造業', other:'その他' };

  container.innerHTML = `
    <div class="home-wrap">

      <!-- ヘッダーバー -->
      <div class="home-topbar">
        <div class="home-company-name">${escHtml(company.name)}</div>
        <div class="home-meta">
          <span class="home-meta-item">📅 ${curYear}年度</span>
          <span class="home-meta-item">🕒 ${updatedStr}</span>
        </div>
      </div>

      <!-- ===== 会社情報カード ===== -->
      <div class="home-card">
        <div class="home-card-title">🏢 会社情報</div>
        <div class="company-info-chips">
          <div class="info-chip"><span class="info-chip-label">業種</span><span class="info-chip-val">${INDUSTRY_LABELS[company.industry] || 'その他'}</span></div>
          <div class="info-chip"><span class="info-chip-label">資本金</span><span class="info-chip-val">${fmtHome(capital)}</span></div>
          <div class="info-chip"><span class="info-chip-label">決算月</span><span class="info-chip-val">${company.fiscalMonth || 3}月</span></div>
          <div class="info-chip"><span class="info-chip-label">インボイス</span><span class="info-chip-val" style="color:${company.invoiceRegistered?'#059669':'#64748b'}">${company.invoiceRegistered?'登録済':'未登録'}</span></div>
          <div class="info-chip"><span class="info-chip-label">消費税</span><span class="info-chip-val">${company.kanijukazei?'簡易課税':'本則課税'}</span></div>
          <div class="info-chip"><span class="info-chip-label">都道府県</span><span class="info-chip-val">${company.prefecture || '東京都'}</span></div>
        </div>
        <div style="margin-top:12px">
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:6px">📝 メモ・コメント</div>
          <textarea id="company_memo_area" class="company-memo-area" placeholder="顧問先に関するメモ、特記事項、担当者情報など..."
            onblur="(function(){ var c=App.currentCompany; if(!c)return; c.memo=document.getElementById('company_memo_area').value; saveCompany(c); })()"
          >${escHtml(company.memo || '')}</textarea>
        </div>
        <div style="margin-top:8px;text-align:right">
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
    const actualCols   = getActualCols(budget);
    const actualMonths = actualCols.filter(Boolean).length;
    const actualThrough = actualCols.lastIndexOf(true); // -1 if none
    let kariHarai = 0, kariUke = 0;
    let kariHaraiActual = 0, kariUkeActual = 0;
    let foundH = false, foundU = false;
    for (const acc of budget.dynamicAccounts) {
      const name = acc.name.replace(/\s/g, '');
      const vals = allVals[acc.id] || rows[acc.id] || new Array(12).fill(0);
      // BS残高科目：月次値は残高（累計）なので最終実績月の残高を使う
      const balActual = actualThrough >= 0
        ? Math.abs(vals[actualThrough] || 0)                  // 最終実績月の残高
        : 0;
      // 年間試算 = 実績残高 ÷ 実績月数 × 12
      const balAnnual = actualMonths > 0
        ? Math.round(balActual / actualMonths * 12)
        : Math.abs(vals[11] || 0);                            // 実績なければ年度末残高
      if (name.includes('仮払消費税')) {
        kariHarai       += balAnnual;
        kariHaraiActual += balActual;
        foundH = true;
      }
      if (name.includes('仮受消費税')) {
        kariUke       += balAnnual;
        kariUkeActual += balActual;
        foundU = true;
      }
    }
    if (!foundH && !foundU) return { method: 'honzoku', noData: true };
    const ctax = kariUke - kariHarai;
    return {
      method: 'honzoku', kariHarai, kariUke, ctax,
      kariHaraiActual, kariUkeActual, actualMonths, actualThrough,
      filledMonths, annualFactor, ctaxPrepaid,
    };
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

// ===== 共通: フェーズホームのトップバー =====
function phaseHomeTopbar(company, curYear, accentColor, phaseLabel) {
  return `
    <div class="phase-home-topbar" style="border-left:4px solid ${accentColor}">
      <div>
        <div class="home-company-name">${escHtml(company.name)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${curYear}年度　${phaseLabel}</div>
      </div>
      <div class="home-meta">
        <button class="btn btn-sm" onclick="openCompanyModal('${company.id}')">会社情報を編集</button>
        <button class="btn btn-sm btn-outline" onclick="App.currentPhase=0;showPage('home')">⊞ フェーズ選択</button>
      </div>
    </div>`;
}

// ===== ① 期中ホーム =====
function renderPhase1Home(container, budget, company) {
  const curYear = window.App?.currentYear || new Date().getFullYear();
  const capital = company.capital || 10000000;

  const progressItems = calcBudgetProgress(budget);
  const doneCount = progressItems.filter(p => p.done).length;
  const pct = progressItems.length ? Math.round(doneCount / progressItems.length * 100) : 0;

  const hasDynamic    = !!budget?.dynamicAccounts?.length;
  // actualCols: グリッドと同じ判定（新形式 actualCols 優先、旧形式 actualThrough はフォールバック）
  const actualCols    = budget ? getActualCols(budget) : Array(12).fill(false);
  const actualThrough = actualCols.lastIndexOf(true); // 互換用
  const hasActual     = actualCols.some(Boolean);

  // 動的科目がある場合は calcAllValuesDynamic、静的は getMergedRows → calcAllValues
  const allVals = budget
    ? (hasDynamic ? calcAllValuesDynamic(budget) : calcAllValues(getMergedRows(budget)))
    : {};

  const kpiRows = [
    { label:'売上高',     dynId:'sec_revenue', staticId:'sales',       isProfit:false },
    { label:'売上総利益', dynId:'calc_gross',  staticId:'gross_profit', isProfit:true  },
    { label:'営業利益',   dynId:'calc_op',     staticId:'op_profit',    isProfit:true  },
    { label:'経常利益',   dynId:'calc_ord',    staticId:'ord_profit',   isProfit:true  },
    { label:'当期純利益', dynId:'calc_net',    staticId:'net_profit',   isProfit:true  },
  ];

  // 月名ヘルパー（actualCols ベース）
  const startMonth = budget?.startMonth || 4;
  const mLabel = i => `${((startMonth - 1 + i) % 12) + 1}月`;
  const actIdxs = actualCols.map((v,i) => v ? i : -1).filter(i => i >= 0);
  const bdgIdxs = actualCols.map((v,i) => !v ? i : -1).filter(i => i >= 0);
  const actualMonths = actIdxs.length;
  const budgetMonths = bdgIdxs.length;
  const actualLabel = actualMonths > 0
    ? (actualMonths === 1 ? mLabel(actIdxs[0]) : `${mLabel(actIdxs[0])}～${mLabel(actIdxs[actIdxs.length-1])}`)
    : null;
  const budgetLabel = budgetMonths > 0
    ? (budgetMonths === 1 ? mLabel(bdgIdxs[0]) : `${mLabel(bdgIdxs[0])}～${mLabel(bdgIdxs[bdgIdxs.length-1])}`)
    : null;

  // CF現預金
  const cashAcc = budget?.dynamicAccounts?.find(a =>
    a.section?.startsWith('bs') && a.name.replace(/\s/g,'').match(/現金|預金|現預金/)
  );
  const cashEnd = cashAcc ? (allVals[cashAcc.id] || [])[Math.min(actualThrough, 11)] || 0 : 0;

  // サマリーは千円統一（列ごとに単位が変わると加算が合わなくなるため）
  const fmtKpi = (v, isProfit) => {
    if (!v && v !== 0) return '<span class="yr3-nodata">—</span>';
    const c = isProfit ? (v >= 0 ? '#059669' : '#dc2626') : 'inherit';
    const sign = v < 0 ? '▲' : '';
    const txt = sign + Math.round(Math.abs(v) / 1000).toLocaleString() + '千円';
    return `<span style="color:${c}">${txt}</span>`;
  };

  container.innerHTML = `
    <div class="home-wrap">
      ${phaseHomeTopbar(company, curYear, '#3b82f6', '① 期中フェーズ')}

      <!-- 業績サマリー（実績期間 | 予算期間 | 合計） -->
      <div class="home-card" style="grid-column:1/-1">
        <div class="home-card-title">📊 業績サマリー</div>
        <table class="yr3-table">
          <thead>
            <tr>
              <th class="yr3-label-col">科目</th>
              ${actualLabel ? `<th class="yr3-num-col yr3-cur">実績（${actualMonths}か月）<br><span class="yr3-badge">${actualLabel}</span></th>` : ''}
              ${budgetLabel ? `<th class="yr3-num-col">予算（${budgetMonths}か月）<br><span class="yr3-badge">${budgetLabel}</span></th>` : ''}
              <th class="yr3-num-col" style="font-weight:700">年間合計</th>
            </tr>
          </thead>
          <tbody>
            ${kpiRows.map(row => {
              const id  = hasDynamic ? row.dynId : row.staticId;
              const arr = allVals[id] || new Array(13).fill(0);
              const actSum = actIdxs.reduce((s,i) => s + (arr[i]||0), 0);
              const bdgSum = bdgIdxs.reduce((s,i) => s + (arr[i]||0), 0);
              const adjVal = arr[12] || 0;
              // 表示値を千円単位で丸めてから合算 → 年間合計 = 実績 + 予算（表示上必ず一致）
              const actK = Math.round(actSum / 1000);
              const bdgK = Math.round((bdgSum + adjVal) / 1000);
              const totK = actK + bdgK;
              const fmtK2 = (k, isProfit) => {
                const c = isProfit ? (k >= 0 ? '#059669' : '#dc2626') : 'inherit';
                return `<span style="color:${c}">${k < 0 ? '▲' : ''}${Math.abs(k).toLocaleString()}千円</span>`;
              };
              return `<tr>
                <td class="yr3-label">${row.label}</td>
                ${actualLabel ? `<td class="yr3-num yr3-cur">${fmtK2(actK, row.isProfit)}</td>` : ''}
                ${budgetLabel ? `<td class="yr3-num">${fmtK2(bdgK, row.isProfit)}</td>` : ''}
                <td class="yr3-num" style="font-weight:700">${fmtK2(totK, row.isProfit)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        ${actualLabel && budgetLabel ? `<div style="font-size:10px;color:var(--text-muted);margin-top:6px">青背景＝実績確定値　白背景＝予算入力値</div>` : ''}
      </div>

      <!-- CF残高 -->
      ${cashAcc ? `
      <div class="home-card">
        <div class="home-card-title">💰 現預金残高</div>
        <div style="font-size:28px;font-weight:800;color:${cashEnd>=0?'#0369a1':'#dc2626'};padding:8px 0">${fmtHome(cashEnd)}</div>
        <div style="font-size:11px;color:var(--text-muted)">${actualThrough >= 0 ? `${actualThrough+1}か月末時点` : '最終月'} • 詳細は CF予測へ</div>
        <div style="margin-top:10px">
          <button class="btn btn-sm btn-outline" onclick="showPage('cashflow')">CF予測を見る →</button>
        </div>
      </div>` : ''}

      <!-- クイックアクション -->
      <div class="home-card">
        <div class="home-card-title">🚀 クイックアクション</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button class="btn-solid" onclick="showPage('import')">📤 推移表アップロード</button>
          <button class="btn-outline" onclick="showPage('budget')">📝 月次予算入力</button>
          <button class="btn-outline" onclick="showPage('cashflow')">💰 CF予測</button>
          <button class="btn-outline" onclick="setPhase(2);showPage('home')">② 決算フェーズへ →</button>
        </div>
      </div>

      <!-- 成果物 -->
      <div class="home-card">
        <div class="home-card-title">📄 成果物を出力</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="phase-output-btn phase-blue" style="width:auto;padding:8px 20px" onclick="showKichuOutput('monthly')">月次業績報告書</button>
          <button class="phase-output-btn phase-blue" style="width:auto;padding:8px 20px" onclick="showKichuOutput('cashflow')">資金繰り予測表</button>
          <button class="phase-output-btn phase-blue" style="width:auto;padding:8px 20px" onclick="showKichuOutput('forecast')">着地予測・税金概算</button>
          <button class="phase-output-btn phase-blue" style="width:auto;padding:8px 20px" onclick="showKichuOutput('execcomp')">役員報酬提案書</button>
        </div>
      </div>
    </div>`;
}

// ===== ② 決算ホーム =====
function renderPhase2Home(container, budget, company) {
  const curYear = window.App?.currentYear || new Date().getFullYear();
  const capital = company.capital || 10000000;

  const allVals   = budget ? (budget.dynamicAccounts ? calcAllValuesDynamic(budget) : calcAllValues(budget.rows)) : {};
  const sum12     = id => (allVals[id] || []).reduce((a, v) => a + v, 0);
  const pretax    = sum12(budget?.dynamicAccounts ? 'calc_pretax' : 'pretax_profit');

  let taxBreak = null, taxTotal = 0;
  if (pretax > 0) { taxBreak = calcAllTax(pretax, capital); taxTotal = taxBreak.total; }
  const prepaid1 = company.prepaid1 || 0;
  const prepaid2 = company.prepaid2 || 0;
  const taxBalance = taxTotal - (prepaid1 + prepaid2);

  const ctaxEst = calcCtaxEstimate(budget, company);
  const ctaxAmt = ctaxEst && !ctaxEst.exempt && !ctaxEst.noData ? ctaxEst.ctax : null;
  const ctaxBalance = ctaxAmt !== null ? ctaxAmt - (ctaxEst.ctaxPrepaid || 0) : null;

  // 調整列入力状況
  const hasAdj = budget ? Object.values(budget.rows || {}).some(arr => arr[12] && arr[12] !== 0) : false;

  const taxRow = (label, val, isBold, isNeg) => `
    <div class="tax-kpi-row${isBold?' tax-kpi-total':''}">
      <span>${label}</span>
      <span class="${isNeg?'tax-pay':''}">${val}</span>
    </div>`;

  container.innerHTML = `
    <div class="home-wrap">
      ${phaseHomeTopbar(company, curYear, '#f59e0b', '② 決算フェーズ')}

      <!-- 税額概算 -->
      <div class="home-summary-grid">
        <div class="home-card">
          <div class="home-card-title">🧮 法人税等 概算</div>
          ${taxBreak ? `
            ${taxRow('税引前利益', fmtHome(pretax), false, false)}
            ${taxRow('法人税', fmtHome(taxBreak.corp), false, false)}
            ${taxRow('住民税・事業税', fmtHome(taxBreak.inhabitant + taxBreak.business + taxBreak.special), false, false)}
            ${taxRow('法人税等 合計', fmtHome(taxTotal), true, false)}
            ${taxRow('予定納税控除', `▲${fmtHome(prepaid1+prepaid2)}`, false, false)}
            ${taxRow(taxBalance>=0?'納付見込':'還付見込', fmtHome(Math.abs(taxBalance)), true, taxBalance>=0)}
          ` : '<div class="no-data-small">予算データがありません</div>'}
          <div style="margin-top:10px">
            <button class="btn btn-sm btn-outline" onclick="showPage('tax')">詳細計算 →</button>
          </div>
        </div>

        <div class="home-card">
          <div class="home-card-title">🧾 消費税 概算</div>
          ${ctaxEst?.exempt ? '<div class="no-data-small">免税事業者</div>' :
            ctaxAmt !== null ? `
            ${taxRow('計算方法', ctaxEst.method==='kani'?`簡易(第${ctaxEst.businessType}種)`:'本則課税', false, false)}
            ${taxRow('消費税 合計', fmtHome(ctaxAmt), true, false)}
            ${taxRow('中間納付控除', `▲${fmtHome(ctaxEst.ctaxPrepaid||0)}`, false, false)}
            ${taxRow(ctaxBalance>=0?'納付見込':'還付見込', fmtHome(Math.abs(ctaxBalance)), true, ctaxBalance>=0)}
          ` : '<div class="no-data-small">データ不足（インポート推奨）</div>'}
          <div style="margin-top:10px">
            <button class="btn btn-sm btn-outline" onclick="showPage('ctax')">消費税関連 →</button>
          </div>
        </div>

        <div class="home-card">
          <div class="home-card-title">✏️ 決算調整</div>
          <div class="ctax-judge" style="color:${hasAdj?'#059669':'#f59e0b'};margin-bottom:12px">
            ${hasAdj ? '調整入力あり' : '調整未入力'}
          </div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">役員賞与・税引後利益の調整は月次予算入力の「調整」列で行います</div>
          <button class="btn btn-sm btn-outline" onclick="showPage('execcomp')">👔 役員報酬・賞与 →</button>
          <button class="btn btn-sm btn-outline" style="margin-top:6px" onclick="showPage('budget')">✏️ 調整入力 →</button>
        </div>
      </div>

      <!-- クイックアクション -->
      <div class="home-card">
        <div class="home-card-title">🚀 クイックアクション</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button class="btn-solid" style="background:#f59e0b" onclick="showPage('import')">📤 決算前推移表を取込む</button>
          <button class="btn-outline" onclick="showPage('execcomp')">👔 役員報酬・賞与を最適化</button>
          <button class="btn-outline" onclick="setPhase(3);showPage('home')">③ 申告フェーズへ →</button>
        </div>
      </div>

      <!-- 成果物 -->
      <div class="home-card">
        <div class="home-card-title">📄 成果物を出力</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="phase-output-btn" style="width:auto;padding:8px 20px;background:#f59e0b" onclick="showKichuOutput('forecast')">着地予測・税金概算</button>
          <button class="phase-output-btn" style="width:auto;padding:8px 20px;background:#f59e0b" onclick="showKichuOutput('execcomp')">役員報酬提案書</button>
          <button class="phase-output-btn" style="width:auto;padding:8px 20px;background:#f59e0b" onclick="showKichuOutput('socialins')">社会保険試算</button>
        </div>
      </div>
    </div>`;
}

// ===== ③ 申告・報告ホーム =====
function renderPhase3Home(container, budget, company) {
  const curYear = window.App?.currentYear || new Date().getFullYear();
  const capital = company.capital || 10000000;

  // 3期分データ
  const budgetPrev1 = getBudget(company.id, curYear - 1);
  const budgetPrev2 = getBudget(company.id, curYear - 2);

  const extractMetrics = b => {
    if (!b) return null;
    const av = b.dynamicAccounts ? calcAllValuesDynamic(b) : calcAllValues(b.rows);
    const s  = id => (av[id] || []).reduce((a, v) => a + v, 0);
    if (b.dynamicAccounts) return { sales: s('sec_revenue'), op: s('calc_op'), net: s('calc_net') };
    const pl = calcPL(b.rows);
    return { sales: pl.sales.reduce((a,v)=>a+v,0), op: pl.op_profit.reduce((a,v)=>a+v,0), net: pl.net_profit.reduce((a,v)=>a+v,0) };
  };
  const mCur  = extractMetrics(budget);
  const mPrev1 = extractMetrics(budgetPrev1);
  const mPrev2 = extractMetrics(budgetPrev2);

  const diff = (cur, prev) => prev ? Math.round((cur - prev) / Math.abs(prev) * 100) : null;
  const diffBadge = (cur, prev) => {
    const d = diff(cur, prev);
    if (d === null) return '<span class="yr3-nodata">—</span>';
    return `<span style="color:${d>=0?'#059669':'#dc2626'}">${d>=0?'+':''}${d}%</span>`;
  };

  // 財務健康スコア（簡易）
  let healthHtml = '<div class="no-data-small">BSデータがありません（インポートで取込み可）</div>';
  if (budget) {
    try {
      const metrics = calcHealthMetrics(budget.rows || {}, capital);
      const grades  = ['A','B','C','D','E'];
      const gColor  = { A:'#059669',B:'#0284c7',C:'#d97706',D:'#dc2626',E:'#7f1d1d' };
      const keys    = ['equity_ratio','current_ratio','op_margin','loan_month_ratio'];
      const labels  = ['自己資本比率','流動比率','経常利益率','借入月商倍率'];
      const units   = ['%','%','%','ヶ月'];
      const dps     = [1,0,1,1];
      healthHtml = `<div style="display:flex;gap:8px;flex-wrap:wrap">
        ${keys.map((k,i) => {
          const g = gradeMetric(k, metrics[k]);
          return `<div style="flex:1;min-width:100px;background:var(--bg);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:10px;color:var(--text-muted);font-weight:600;margin-bottom:4px">${labels[i]}</div>
            <div style="font-size:16px;font-weight:800;color:${gColor[g]}">${metrics[k].toFixed(dps[i])}${units[i]}</div>
            <div style="font-size:11px;color:${gColor[g]};font-weight:700">${g}</div>
          </div>`;
        }).join('')}
      </div>`;
    } catch(e) {}
  }

  // 成果物準備チェック
  const checks = [
    { label: '当期データ', done: !!budget },
    { label: '前期データ', done: !!budgetPrev1 },
    { label: '前々期データ', done: !!budgetPrev2 },
  ];
  const readyCount = checks.filter(c => c.done).length;

  container.innerHTML = `
    <div class="home-wrap">
      ${phaseHomeTopbar(company, curYear, '#10b981', '③ 申告・報告フェーズ')}

      <!-- 3期比較ハイライト -->
      <div class="home-card home-card-wide">
        <div class="home-card-title">📊 3期比較ハイライト</div>
        <table class="yr3-table">
          <thead>
            <tr>
              <th class="yr3-label-col">科目</th>
              <th class="yr3-num-col">${curYear-2}年度</th>
              <th class="yr3-num-col">${curYear-1}年度</th>
              <th class="yr3-num-col yr3-cur">${curYear}年度<span class="yr3-badge" style="margin-left:4px">予算</span></th>
              <th class="yr3-num-col yr3-diff">前期比</th>
            </tr>
          </thead>
          <tbody>
            ${[
              { label:'売上高',     key:'sales', profit:false },
              { label:'営業利益',   key:'op',    profit:true  },
              { label:'当期純利益', key:'net',   profit:true  },
            ].map(row => {
              const v2 = mPrev2?.[row.key] ?? null;
              const v1 = mPrev1?.[row.key] ?? null;
              const v0 = mCur?.[row.key] ?? null;
              const fmtC = (v, p) => v===null ? '<span class="yr3-nodata">—</span>'
                : `<span style="color:${p?(v>=0?'#059669':'#dc2626'):'inherit'}">${fmtHome(v)}</span>`;
              return `<tr>
                <td class="yr3-label">${row.label}</td>
                <td class="yr3-num">${fmtC(v2, row.profit)}</td>
                <td class="yr3-num">${fmtC(v1, row.profit)}</td>
                <td class="yr3-num yr3-cur">${fmtC(v0, row.profit)}</td>
                <td class="yr3-num yr3-diff">${diffBadge(v0, v1)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        <div style="margin-top:10px;text-align:right">
          <button class="btn btn-sm btn-outline" onclick="showPage('simulation')">詳細比較 →</button>
        </div>
      </div>

      <!-- 財務健康診断 -->
      <div class="home-card">
        <div class="home-card-title">🩺 財務健康スコア</div>
        ${healthHtml}
        <div style="margin-top:10px;text-align:right">
          <button class="btn btn-sm btn-outline" onclick="showPage('health')">詳細診断 →</button>
        </div>
      </div>

      <!-- 成果物準備状況 -->
      <div class="home-card">
        <div class="home-card-title">📋 成果物準備状況 (${readyCount}/3)</div>
        <div class="progress-items" style="margin-bottom:14px">
          ${checks.map(c => `<span class="progress-item ${c.done?'done':'pending'}">${c.done?'✅':'⬜'} ${c.label}</span>`).join('')}
        </div>
        ${readyCount < 3 ? `<div style="font-size:12px;color:#f59e0b;margin-bottom:12px">⚠️ 不足データは「推移表アップロード（確定値）」から取込んでください</div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="phase-output-btn" style="width:auto;padding:8px 20px;background:#10b981" onclick="showOutputModal('申告')">決算報告書パック</button>
          <button class="phase-output-btn" style="width:auto;padding:8px 20px;background:#10b981" onclick="showOutputModal('申告')">5か年計画書</button>
        </div>
      </div>

      <!-- クイックアクション -->
      <div class="home-card">
        <div class="home-card-title">🚀 クイックアクション</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button class="btn-solid" style="background:#10b981" onclick="showPage('import')">📤 確定値を取込む</button>
          <button class="btn-outline" onclick="showPage('simulation')">📊 3期比較PL/BS</button>
          <button class="btn-outline" onclick="showPage('fiveyear')">📅 5か年計画</button>
        </div>
      </div>
    </div>`;
}
