// ホーム画面（フェーズハブ＋各フェーズダッシュボード）

function renderClientDashboard(container) {
  const companies = window.App?.companies || [];
  const curYear = new Date().getFullYear();
  const isAdmin = window._currentFbUser?.role === 'admin';

  const fmtM = v => {
    const abs = Math.abs(v || 0);
    const sign = (v || 0) < 0 ? '▼' : '';
    if (abs >= 100_000_000) return sign + (abs / 100_000_000).toFixed(1) + '億';
    return sign + Math.round(abs / 10_000).toLocaleString() + '万';
  };

  const cards = companies.map(company => {
    const years = (typeof getYearsForCompany === 'function') ? getYearsForCompany(company.id) : [];
    const latestYear = years[0] || curYear;
    const budget = (typeof getBudget === 'function') ? getBudget(company.id, latestYear) : null;

    let metrics = null;
    if (budget) {
      try {
        const allVals = budget.dynamicAccounts ? calcAllValuesDynamic(budget) : calcAllValues(budget.rows);
        const sum12 = id => (allVals[id] || []).slice(0, 12).reduce((a, v) => a + v, 0);
        // 最新の実績月を使う（実績なければ期末=index11）
        const actIdxs = (budget.actualCols || []).map((v, i) => v ? i : -1).filter(i => i >= 0);
        const cashIdx = actIdxs.length > 0 ? Math.max(...actIdxs) : 11;
        const lastCash = id => (allVals[id] || new Array(12).fill(0))[cashIdx];
        if (budget.dynamicAccounts) {
          const CASH_RE = /現金|預金|現預金/;
          const cashAccs = budget.dynamicAccounts.filter(a =>
            a.section === 'bs_asset' && a.type !== 'section' && CASH_RE.test((a.name || '').replace(/\s/g,''))
          );
          const cashIds = new Set(cashAccs.map(a => a.id));
          const cashLeaf = cashAccs.filter(a => !cashIds.has(a.parentId));
          metrics = {
            sales: sum12('sec_revenue'),
            ord:   sum12('calc_ord'),
            cash:  cashLeaf.reduce((s, a) => s + lastCash(a.id), 0),
          };
        } else {
          const pl = calcPL(budget.rows);
          metrics = {
            sales: pl.sales.reduce((a, v) => a + v, 0),
            ord:   pl.ord_profit.reduce((a, v) => a + v, 0),
            cash:  (calcAllValues(budget.rows)['cash'] || new Array(12).fill(0))[cashIdx],
          };
        }
      } catch(e) {}
    }

    const updatedAt = budget?.updatedAt ? new Date(budget.updatedAt) : null;
    const updatedStr = updatedAt
      ? `${updatedAt.getFullYear()}/${String(updatedAt.getMonth()+1).padStart(2,'0')}/${String(updatedAt.getDate()).padStart(2,'0')}`
      : null;

    const ordColor = (metrics?.ord || 0) >= 0 ? 'var(--emerald,#059669)' : '#e11d48';
    const hasData = !!budget;

    // 資金ショート警告バッジ
    let cashWarn = '';
    try {
      if (budget && typeof computeCashSeries === 'function') {
        const s = computeCashSeries(company, budget);
        if (s && s.hasShortage) {
          cashWarn = `<span class="client-card-badge" style="background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5;font-weight:700">⚠ ${s.shortages[0].calMonth}月 資金不足</span>`;
        }
      }
    } catch (e) {}

    return `
      <div class="client-card" onclick="selectCompany('${escHtml(company.id)}');showPage('home')"
           role="button" tabindex="0"
           onkeydown="if(event.key==='Enter'||event.key===' '){selectCompany('${escHtml(company.id)}');showPage('home')}">
        <div class="client-card-top">
          <div class="client-card-name">${escHtml(company.name)}</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">
            ${cashWarn}
            <div class="client-card-badge">${latestYear}年度&nbsp;${company.fiscalMonth || 3}月決算</div>
          </div>
        </div>
        ${hasData && metrics ? `
          <div class="client-card-metrics">
            <div class="client-metric">
              <div class="client-metric-label">売上高</div>
              <div class="client-metric-value">${fmtM(metrics.sales)}円</div>
            </div>
            <div class="client-metric">
              <div class="client-metric-label">経常利益</div>
              <div class="client-metric-value" style="color:${ordColor}">${fmtM(metrics.ord)}円</div>
            </div>
            <div class="client-metric">
              <div class="client-metric-label">現金残高</div>
              <div class="client-metric-value">${fmtM(metrics.cash)}円</div>
            </div>
          </div>
        ` : `<div class="client-card-nodata">データ未入力</div>`}
        <div class="client-card-footer">
          ${updatedStr ? `<span>更新 ${updatedStr}</span>` : '<span style="color:var(--text-muted)">未保存</span>'}
          <span class="client-card-arrow">→</span>
        </div>
      </div>`;
  }).join('');

  const addBtn = isAdmin
    ? `<button class="btn-solid btn-sm" onclick="openCompanyModal('')">＋ 顧問先を追加</button>`
    : '';

  container.innerHTML = `
    <div class="client-dashboard">
      <div class="client-dashboard-header">
        <h2 class="client-dashboard-title">顧問先一覧</h2>
        ${addBtn}
      </div>
      ${companies.length === 0
        ? `<div class="home-empty">
             <div style="font-size:48px;margin-bottom:16px">📋</div>
             <div style="font-size:16px;margin-bottom:8px;font-weight:600">顧問先がまだ登録されていません</div>
             ${isAdmin ? `<button class="btn-solid" onclick="openCompanyModal('')" style="margin-top:16px">＋ 顧問先を追加する</button>` : ''}
           </div>`
        : `<div class="client-card-grid">${cards}</div>`}
    </div>`;
}

// 資金ショートアラート用バナー（資金繰り予測から12か月の現預金残高を判定）
function _cashAlertHTML(company, budget) {
  if (!company || !budget || typeof computeCashSeries !== 'function') return '';
  let s;
  try { s = computeCashSeries(company, budget); } catch (e) { return ''; }
  if (!s || !s.rows || !s.rows.length) return '';
  const k = v => Math.round(v / 1000).toLocaleString('ja-JP');
  const base = 'display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:10px;margin-bottom:14px;cursor:pointer;font-size:13px';
  if (s.hasShortage) {
    const first = s.shortages[0];
    return `<div class="cash-alert" style="${base};background:#fef2f2;border:1px solid #fca5a5;color:#991b1b" onclick="showPage('cashflow')" title="資金繰り予測を開く">
      <span style="font-size:20px">⚠️</span>
      <div><strong>${first.calMonth}月に資金が不足する見込みです</strong>
        <span style="opacity:.85;margin-left:8px">最低残高 ${k(s.minRow.cash)}千円（${s.minRow.calMonth}月）／ 期首 ${k(s.openCash)}千円</span></div>
      <span style="margin-left:auto;font-weight:600;white-space:nowrap">資金繰りを確認 →</span>
    </div>`;
  }
  if (s.minRow && s.minRow.cash < Math.max(1_000_000, s.openCash * 0.2)) {
    return `<div class="cash-alert" style="${base};background:#fffbeb;border:1px solid #fcd34d;color:#92400e" onclick="showPage('cashflow')">
      <span style="font-size:18px">🟡</span>
      <div><strong>資金残高が薄くなる月があります</strong>
        <span style="opacity:.85;margin-left:8px">最低残高 ${k(s.minRow.cash)}千円（${s.minRow.calMonth}月）</span></div>
      <span style="margin-left:auto;font-weight:600;white-space:nowrap">資金繰りを確認 →</span>
    </div>`;
  }
  return '';
}
function _insertCashAlert(container, company, budget) {
  const html = _cashAlertHTML(company, budget);
  if (html) container.insertAdjacentHTML('afterbegin', html);
}

// 引き継ぎメモ・申し送り（会社単位・Firestore同期）
function _handoverMemoHTML(company) {
  if (!company) return '';
  const note = company.handoverNote || '';
  const meta = company.handoverNoteMeta || null;
  const metaStr = meta && meta.at
    ? `最終更新: ${escHtml(meta.by || '')} ／ ${new Date(meta.at).toLocaleString('ja-JP')}`
    : '未記入';
  return `<div class="home-card no-print" style="margin-bottom:14px">
    <div class="home-card-title">📝 引き継ぎメモ・申し送り</div>
    <textarea id="handover_note" rows="4"
      style="width:100%;box-sizing:border-box;font-size:13px;padding:10px;border:1px solid var(--border);border-radius:8px;resize:vertical;font-family:inherit"
      placeholder="担当者間の申し送り、顧問先の状況、次回対応事項など">${escHtml(note)}</textarea>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
      <span style="font-size:11px;color:var(--text-muted)">${metaStr}</span>
      <button class="btn btn-sm btn-solid" onclick="saveHandoverNote('${company.id}')">💾 保存</button>
    </div>
  </div>`;
}
function _insertHandoverMemo(container, company) {
  const html = _handoverMemoHTML(company);
  if (html) container.insertAdjacentHTML('afterbegin', html);
}
function saveHandoverNote(companyId) {
  const el = document.getElementById('handover_note');
  if (!el) return;
  const data = loadData();
  const c = data.companies.find(x => x.id === companyId);
  if (!c) return;
  c.handoverNote = el.value;
  const who = (window._currentFbUser && (window._currentFbUser.name || window._currentFbUser.email)) || '担当者';
  c.handoverNoteMeta = { by: who, at: Date.now() };
  saveCompany(c);
  if (window.App && window.App.currentCompany && window.App.currentCompany.id === companyId) {
    window.App.currentCompany = c;
  }
  if (typeof showToast === 'function') showToast('引き継ぎメモを保存しました', 'success');
}

function renderHome(container) {
  const phase   = window.App?.currentPhase || 0;
  const budget  = window.App?.currentBudget;
  const company = window.App?.currentCompany;

  if (!company) {
    container.innerHTML = `
      <div class="home-empty">
        <div style="font-size:56px;margin-bottom:20px">📊</div>
        <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:10px">顧問先を選択してください</div>
        <button class="btn-solid" onclick="showPage('client_list')">顧問先一覧へ</button>
      </div>`;
    return;
  }

  // フェーズ別ダッシュボードに振り分け（各ダッシュボード先頭に資金ショートアラートを差し込む）
  if (phase === 1) { renderPhase1Home(container, budget, company); _insertHandoverMemo(container, company); _insertCashAlert(container, company, budget); return; }
  if (phase === 2) { renderPhase2Home(container, budget, company); _insertHandoverMemo(container, company); _insertCashAlert(container, company, budget); return; }
  if (phase === 3) { renderPhase3Home(container, budget, company); _insertHandoverMemo(container, company); _insertCashAlert(container, company, budget); return; }

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
      const CASH_RE = /現金|預金|現預金/;
      const cashAccs = b.dynamicAccounts.filter(a =>
        a.section?.startsWith('bs') && a.type !== 'section' && CASH_RE.test((a.name || '').replace(/\s/g,''))
      );
      const cashIds  = new Set(cashAccs.map(a => a.id));
      const cashLeaf = cashAccs.filter(a => !cashIds.has(a.parentId));
      return {
        sales: sum12('sec_revenue'), gross: sum12('calc_gross'),
        op: sum12('calc_op'), ord: sum12('calc_ord'),
        pretax: sum12('calc_pretax'), net: sum12('calc_net'),
        cashEnd: cashLeaf.reduce((s, a) => s + last(a.id), 0),
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
  if (invoice) {
    ctaxJudge = 'インボイス登録→課税事業者'; ctaxColor = '#e11d48';
  } else if (kijun > 0) {
    if (kijun <= 10000000) { ctaxJudge = '免税事業者'; ctaxColor = '#22c55e'; }
    else if (kijun <= 50000000 && kani) { ctaxJudge = '簡易課税'; ctaxColor = '#059669'; }
    else { ctaxJudge = '本則課税'; ctaxColor = 'var(--emerald)'; }
  }

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
    if (phase === 'kessan') {
      return `<button class="phase-output-btn" onclick="setPhase(${phaseNum});showKichuOutput('taxplanning')">📄 成果物を出力</button>`;
    }
    return `<button class="phase-output-btn" onclick="setPhase(${phaseNum});showOutputModal('${phase}')">📄 成果物を出力</button>`;
  };

  const INDUSTRY_LABELS = { tax_accountant:'税理士・会計事務所', medical:'医療・福祉', real_estate:'不動産業', construction:'建設業', retail:'小売・EC', beauty:'美容業', wholesale:'物販・卸売業', restaurant:'飲食業', it:'IT・ソフトウェア', transport:'運輸・物流', education:'教育・学習支援', manufacturing:'製造業', agriculture:'農業・林業', hotel:'宿泊・旅行', finance:'金融・保険', other:'一般業種' };

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
            oninput="_memoSaveDebounce()"
            onblur="(function(){ var c=App.currentCompany; if(!c)return; c.memo=document.getElementById('company_memo_area').value; saveCompany(c); })()"
          >${escHtml(company.memo || '')}</textarea>
        </div>
        <div style="margin-top:8px;text-align:right">
          <button class="btn btn-sm" onclick="openCompanyModal('${company.id}')">会社情報を編集</button>
        </div>
      </div>

      <!-- ===== インポート状況 ===== -->
      ${(() => {
        const importHistory = typeof getImportHistory === 'function' ? getImportHistory(company.id) : [];
        const getLatestImport = yr => {
          const h = importHistory.filter(x => x.year === yr);
          return h.length ? h.reduce((a, b) => a.importedAt > b.importedAt ? a : b) : null;
        };
        const fmtDate = ts => {
          const d = new Date(ts);
          return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        };
        const rows = [curYear, curYear-1, curYear-2].map(yr => {
          const imp = getLatestImport(yr);
          const m   = yr === curYear ? mCur : yr === curYear-1 ? mPrev1 : mPrev2;
          const plHtml = m ? `
            <span style="margin-left:8px">売上: <b>${fmtHome(m.sales)}</b></span>
            <span style="margin-left:8px">営業利益: <b style="color:${m.op>=0?'#059669':'#dc2626'}">${fmtHome(m.op)}</b></span>
            <span style="margin-left:8px">純利益: <b style="color:${m.net>=0?'#059669':'#dc2626'}">${fmtHome(m.net)}</b></span>
            <span style="margin-left:8px">現預金: <b>${fmtHome(m.cashEnd)}</b></span>
          ` : `<span style="color:var(--text-muted);margin-left:8px">データなし</span>`;
          return `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;padding:8px 0;border-bottom:1px solid var(--border)">
            <span style="font-weight:700;min-width:68px">${yr}年度</span>
            <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${imp?'#dcfce7':'#f1f5f9'};color:${imp?'#15803d':'#64748b'}">
              ${imp ? `インポート済み（${fmtDate(imp.importedAt)}）` : '未インポート'}
            </span>
            <span style="font-size:12px;color:var(--text-muted);flex:1">${plHtml}</span>
          </div>`;
        }).join('');
        return `<div class="home-card">
          <div class="home-card-title">📥 インポート状況</div>
          ${rows}
          <div style="margin-top:10px">
            <button class="btn-solid" onclick="showPage('import')">📤 推移表アップロード</button>
          </div>
        </div>`;
      })()}

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

        <!-- ② 申告・報告 -->
        <div class="phase-card phase-green">
          <div class="phase-card-head">
            <div class="phase-card-head-row">
              <div class="phase-num">②</div>
              <div class="phase-title-wrap">
                <div class="phase-title">申告・報告</div>
              </div>
              ${phaseStatus(hasPrev, hasPrev ? '過去データあり' : '過去データなし')}
            </div>
            <div class="phase-desc">経営分析・報告書作成</div>
          </div>

          <div class="phase-tools">
            ${toolLink('bizanalysis', 2, '📊 3期比較PL',           hasPrev ? `${curYear-2}〜${curYear}年度` : '過去データ必要')}
            ${toolLink('health',     2, '🩺 財務健康診断')}
            ${toolLink('simulation', 2, '📐 単年度PL/BS')}
            ${toolLink('fiveyear',   2, '🔮 5か年シミュレーション')}
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
        { label: '月次予算表（Excel）',   icon:'📊', fn: "showToast('月次予算表 Excel出力は準備中です','info',3000)" },
        { label: '月次予算表（PDF）',     icon:'📄', fn: "showToast('月次予算表 PDF出力は準備中です','info',3000)" },
        { label: '資金繰り予測表（PDF）', icon:'💰', fn: "showToast('資金繰り PDF出力は準備中です','info',3000)" },
        { label: '5か年計画書（Excel）',  icon:'🔮', fn: "showToast('5か年計画 Excel出力は準備中です','info',3000)" },
      ]
    },
    kessan: {
      label: '② 決算 — 成果物',
      outputs: [
        { label: '税額概算書（PDF）',       icon:'🧮', fn: "showToast('税額概算書 PDF出力は準備中です','info',3000)" },
        { label: '役員報酬設計書（PDF）',   icon:'👤', fn: "showToast('役員報酬設計書 PDF出力は準備中です','info',3000)" },
      ]
    },
    申告: {
      label: '② 申告・報告 — 成果物',
      outputs: [
        { label: '決算報告書パック（PDF）',  icon:'📋', fn: "showToast('決算報告書 PDF出力は準備中です','info',3000)" },
        { label: '3期比較表（Excel）',       icon:'📊', fn: "showToast('3期比較 Excel出力は準備中です','info',3000)" },
        { label: '5か年計画書（Excel）',     icon:'🔮', fn: "showToast('5か年計画 Excel出力は準備中です','info',3000)" },
        { label: '5か年計画書（PDF）',       icon:'📄', fn: "showToast('5か年計画 PDF出力は準備中です','info',3000)" },
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
  const _ac = getActualCols(budget);
  const _actMon = _ac.filter(Boolean).length;
  let filledMonths = _actMon > 0 ? _actMon : 12;
  if (filledMonths === 12) {
    const salesArr = (allVals['sec_revenue'] || allVals['sales'] || []).slice(0, 12);
    const nonZero  = salesArr.filter(v => v !== 0).length;
    if (nonZero > 0 && nonZero < 12) filledMonths = nonZero;
  }
  const annualFactor = filledMonths > 0 && filledMonths < 12 ? 12 / filledMonths : 1;
  const ctaxPrepaid  = company.ctaxPrepaid || 0;

  if (kani && kijun <= 50000000) {
    const MINAS = { 1: 0.90, 2: 0.80, 3: 0.70, 4: 0.60, 5: 0.50, 6: 0.40 };
    const businessType = company.businessType || 5;
    const minasRate    = MINAS[businessType] || 0.50;
    const salesArr     = (allVals['sec_revenue'] || allVals['sales'] || []).slice(0, 12);
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
        <button class="btn btn-sm btn-outline" onclick="App.currentPhase=0;showPage('home')">📋 ダッシュボード</button>
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
    a.section?.startsWith('bs') && (a.name || '').replace(/\s/g,'').match(/現金|預金|現預金/)
  );
  const cashEnd = cashAcc ? (allVals[cashAcc.id] || [])[actualThrough >= 0 ? Math.min(actualThrough, 11) : 11] || 0 : 0;

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

      <!-- クイックアクション -->
      <div class="home-card">
        <div class="home-card-title">🚀 クイックアクション</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button class="btn-solid" onclick="showPage('import')">📤 推移表アップロード</button>
          <button class="btn-outline" onclick="showPage('budget')">📝 月次予算入力</button>
          <button class="btn-outline" onclick="showPage('cashflow')">💰 CF予測</button>
          <button class="btn-outline" onclick="setPhase(2);showPage('home')">② 申告・報告へ →</button>
        </div>
      </div>

      <!-- 成果物 -->
      <div class="home-card">
        <div class="home-card-title">📄 成果物を出力</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="phase-output-btn" style="width:auto;padding:10px 24px;background:#1e40af;font-size:14px;font-weight:700;box-shadow:0 2px 8px rgba(30,64,175,0.3)" onclick="setPhase(1);showPage('forecastreport')">📋 当期決算予測報告</button>
          <button class="phase-output-btn phase-blue" style="width:auto;padding:8px 20px" onclick="showKichuOutput('monthly')">月次業績報告書</button>
          <button class="phase-output-btn phase-blue" style="width:auto;padding:8px 20px" onclick="showKichuOutput('prevcomp')">前期比較表</button>
          <button class="phase-output-btn phase-blue" style="width:auto;padding:8px 20px" onclick="showKichuOutput('cashflow')">資金繰り予測表</button>
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
          <button class="phase-output-btn" style="width:auto;padding:8px 20px;background:#f59e0b" onclick="showKichuOutput('monthly')">月次業績報告書</button>
          <button class="phase-output-btn" style="width:auto;padding:8px 20px;background:#f59e0b" onclick="showKichuOutput('prevcomp')">前期比較表</button>
          <button class="phase-output-btn" style="width:auto;padding:8px 20px;background:#f59e0b" onclick="showKichuOutput('cashflow')">資金繰り予測表</button>
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
    if (cur === null || cur === undefined || prev === null || prev === undefined) return '<span class="yr3-nodata">—</span>';
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
        ${readyCount < 3 ? `<div style="font-size:12px;color:#f59e0b">⚠️ 不足データは「推移表アップロード（確定値）」から取込んでください</div>` : ''}
      </div>

      <!-- クイックアクション -->
      <div class="home-card">
        <div class="home-card-title">🚀 クイックアクション</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button class="btn-solid" style="background:#10b981" onclick="showPage('import')">📤 確定値を取込む</button>
          <button class="btn-outline" onclick="showPage('simulation')">📐 単年度PL/BS</button>
          <button class="btn-outline" onclick="showPage('bizanalysis')">📊 3期比較経営分析</button>
          <button class="btn-outline" onclick="showPage('summarypl')">📈 要約PL（3期比較）</button>
          <button class="btn-outline" onclick="showPage('summarybs')">🏦 要約BS（3期比較）</button>
          <button class="btn-outline" onclick="showPage('fiveyear')">📅 5か年計画</button>
        </div>
      </div>
    </div>`;
}
