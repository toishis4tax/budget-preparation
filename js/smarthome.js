// ===== スマートホーム =====
// 「3秒で答え、3クリックで根拠」。会社を選んだ直後に 業績/資金/税金 の3信号と
// 自動サマリー文を表示する。診断は calcCompanyDiagnosis（純関数・DOM非依存）に集約し、
// カードの色と文章が必ず一致することを構造的に保証する。

// 13要素合計（(v||0)ガード付き・共通ユーティリティ）
function shSum13(arr) {
  if (!Array.isArray(arr)) return 0;
  return arr.slice(0, 13).reduce((a, b) => a + (b || 0), 0);
}

function _shMan(v) { // 円→万円表示
  return Math.round((v || 0) / 10_000).toLocaleString('ja-JP');
}

// ---- 診断本体（DOMを読まない） ----
function calcCompanyDiagnosis(company, budget) {
  const curYear = window.App?.currentYear || new Date().getFullYear();
  const d = {
    freshness: { level: 'none', label: '', detail: '' },
    perf: { level: 'gray', headline: 'データ不足', lines: ['推移表を取り込んでください'], landingOrd: null, budgetOrd: null, achieveRate: null, salesYoY: null },
    cash: { level: 'gray', headline: '未設定', lines: ['資金繰り表で設定できます'], minBalance: null, minMonthLabel: '', monthlySales: 0, configured: false },
    tax:  { level: 'gray', headline: '未計算', lines: ['法人税概算で計算できます'], estimated: null, source: 'none', payMonthLabel: '' },
    summary: { text: '', tone: 'gray' },
  };
  if (!company) return d;

  try { d.freshness = _mtDataStatus(budget); } catch (e) { console.error('freshness diag failed:', e); }

  const hasData = !!(budget && budget.dynamicAccounts?.length);

  // ===== 業績 =====
  let landingSales = 0;
  try {
    if (hasData) {
      // calcAllValuesDynamic は内部で実績をマージ済み（実績月=実績、未来月=予算 → 着地予測）
      const avMerged = calcAllValuesDynamic(budget);
      // 予算のみ: actualCols を全falseにして実績マージを無効化
      const avBudget = calcAllValuesDynamic({ ...budget, actualCols: new Array(12).fill(false), actualThrough: -1 });
      const landingOrd = shSum13(avMerged['calc_ord']);
      const budgetOrd  = shSum13(avBudget['calc_ord']);
      landingSales     = shSum13(avMerged['sec_revenue']);

      // 前年売上（取れなければ null のまま）
      let salesYoY = null;
      try {
        const prev = getBudget(company.id, curYear - 1);
        if (prev?.dynamicAccounts?.length) {
          const prevSales = shSum13(calcAllValuesDynamic(prev)['sec_revenue']);
          if (prevSales > 0 && landingSales > 0) salesYoY = landingSales / prevSales * 100;
        }
      } catch (e) { console.error('yoy diag failed:', e); }

      const achieveRate = budgetOrd > 0 ? (landingOrd / budgetOrd * 100) : null;
      const allZero = landingSales === 0 && landingOrd === 0;

      if (allZero) {
        // grayのまま
      } else if ([landingOrd, budgetOrd].some(v => isNaN(v))) {
        d.perf = { ...d.perf, headline: '計算エラー', lines: ['データを確認してください'] };
        console.error('perf diag NaN', { landingOrd, budgetOrd });
      } else if (landingOrd <= 0) {
        d.perf = { level: 'red', headline: '赤字ペース', landingOrd, budgetOrd, achieveRate, salesYoY,
          lines: [`経常 ▲${_shMan(-landingOrd)}万円（着地予測）`] };
      } else if ((achieveRate != null && achieveRate < 90) || (salesYoY != null && salesYoY < 85)) {
        d.perf = { level: 'yellow', headline: '予算未達ペース', landingOrd, budgetOrd, achieveRate, salesYoY,
          lines: [`経常 +${_shMan(landingOrd)}万円（着地予測）`,
                  achieveRate != null ? `予算達成率 ${achieveRate.toFixed(0)}%` : `売上前年比 ${salesYoY.toFixed(0)}%`] };
      } else {
        d.perf = { level: 'green', headline: '黒字ペース', landingOrd, budgetOrd, achieveRate, salesYoY,
          lines: [`経常 +${_shMan(landingOrd)}万円（着地予測）`,
                  achieveRate != null ? `予算達成率 ${achieveRate.toFixed(0)}%` : ''].filter(Boolean) };
      }
    }
  } catch (e) { console.error('perf diag failed:', e); d.perf.headline = '計算エラー'; d.perf.lines = ['データを確認してください']; }

  // ===== 資金 =====
  try {
    if (hasData) {
      const key = `cashplan_${company.id}_${budget.year ?? curYear}`;
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
      const configured = !!saved;
      const autoOpen = (typeof _sumCashAt === 'function' ? _sumCashAt(budget, 0) : 0) || 0;
      const settings = {
        open:      saved?.open      ?? autoOpen,
        siteSales: saved?.siteSales ?? 1,
        siteCogs:  saved?.siteCogs  ?? 1,
        repay:     saved?.repay     ?? 0,
        tax:       saved?.tax       ?? 0,
        taxMonth:  saved?.taxMonth  ?? 2,
      };
      const series = calcCashPlanSeries(budget, settings);
      if (series && !isNaN(series.minBal)) {
        const labels = getMonthLabels(budget.startMonth || 4);
        const minMonthLabel = labels[series.minIdx] || '';
        const monthlySales = landingSales > 0 ? landingSales / 12 : 0;
        const threshold = monthlySales > 0 ? monthlySales : 1_000_000;
        const noteLine = configured ? '' : '※初期設定で試算（資金繰り表で調整可）';

        if (series.minBal < 0) {
          d.cash = { level: 'red', headline: `${minMonthLabel}に不足`, minBalance: series.minBal, minMonthLabel, monthlySales, configured, series,
            lines: [`▲${_shMan(-series.minBal)}万円 不足見込み`, noteLine].filter(Boolean) };
        } else if (series.minBal < threshold) {
          d.cash = { level: 'yellow', headline: `${minMonthLabel}に注意`, minBalance: series.minBal, minMonthLabel, monthlySales, configured, series,
            lines: [`最低残高 ${_shMan(series.minBal)}万円（${minMonthLabel}）`, noteLine].filter(Boolean) };
        } else {
          d.cash = { level: 'green', headline: '資金OK', minBalance: series.minBal, minMonthLabel, monthlySales, configured, series,
            lines: [`最低残高 ${_shMan(series.minBal)}万円（${minMonthLabel}）`, noteLine].filter(Boolean) };
        }
      }
    }
  } catch (e) { console.error('cash diag failed:', e); d.cash.headline = '計算エラー'; d.cash.lines = ['資金繰り表を確認してください']; }

  // ===== 税金 =====
  try {
    if (hasData) {
      const fiscalMonth = company.fiscalMonth || 3;
      const payMonth = (fiscalMonth + 2 - 1) % 12 + 1;
      const payMonthLabel = `${payMonth}月`;

      // 1) 納付税額確認書の保存値（人が確認した数字）を最優先
      const ANNUAL_KEYS = ['corp', 'localCorp', 'prefKatsu', 'prefKintou', 'business', 'special', 'cityKatsu', 'cityKintou', 'ctax', 'localCtax'];
      let estimated = null, source = 'none';
      try {
        const saved = (typeof loadTaxSummaryData === 'function') ? loadTaxSummaryData(company.id, curYear) : {};
        const sum = ANNUAL_KEYS.reduce((a, k) => a + (parseFloat(saved[k]) || 0), 0);
        if (sum > 0) { estimated = sum; source = 'taxsim'; }
      } catch {}

      // 2) なければ着地税引前利益から自動概算（forecast-report の純関数を利用）
      if (estimated == null) {
        const avMerged = calcAllValuesDynamic(budget);
        const pretax = shSum13(avMerged['calc_pretax']) || shSum13(avMerged['calc_ord']);
        if (pretax > 0 && typeof _frCalcDetailedTax === 'function') {
          const t = _frCalcDetailedTax(pretax, company.capital || 10_000_000);
          if (t) {
            estimated = t.corp + t.localCorp + t.inhabitant + t.business + t.special;
            source = 'estimate';
          }
        } else if (pretax <= 0) {
          d.tax = { level: 'green', headline: '納税は最小限', estimated: null, source: 'none', payMonthLabel,
            lines: ['赤字見込みのため均等割程度', `納付は ${payMonthLabel}`] };
        }
      }

      if (estimated != null) {
        const srcNote = source === 'estimate' ? '（自動概算）' : '';
        // 納付月の資金残高と比較（資金カードが計算できているときのみred判定）
        const payIdx = d.cash.series ? ((payMonth - (budget.startMonth || 4) + 12) % 12) : null;
        const payMonthBal = (payIdx != null && d.cash.series?.rows?.[payIdx]) ? d.cash.series.rows[payIdx].closeBal : null;

        // 決算まで2か月以内か
        const now = new Date();
        const fyEnd = new Date(now.getFullYear() + (fiscalMonth < now.getMonth() + 1 ? 1 : 0), fiscalMonth - 1, 1);
        const monthsToEnd = (fyEnd.getFullYear() - now.getFullYear()) * 12 + (fyEnd.getMonth() - now.getMonth());

        if (payMonthBal != null && estimated > payMonthBal) {
          d.tax = { level: 'red', headline: '納税資金が不足', estimated, source, payMonthLabel,
            lines: [`概算 ${_shMan(estimated)}万円${srcNote}`, `${payMonthLabel}の資金が不足見込み`] };
        } else if (monthsToEnd >= 0 && monthsToEnd <= 2) {
          d.tax = { level: 'yellow', headline: 'もうすぐ納税', estimated, source, payMonthLabel,
            lines: [`概算 ${_shMan(estimated)}万円${srcNote}`, `納付は ${payMonthLabel}`] };
        } else {
          d.tax = { level: 'green', headline: '準備OK', estimated, source, payMonthLabel,
            lines: [`概算 ${_shMan(estimated)}万円${srcNote}`, `納付は ${payMonthLabel}`] };
        }
      }
    }
  } catch (e) { console.error('tax diag failed:', e); d.tax.headline = '計算エラー'; d.tax.lines = ['法人税概算を確認してください']; }

  // ===== 自動サマリー文（判定オブジェクトのみから生成） =====
  d.summary = _shBuildSummary(d);
  return d;
}

// サマリー文の組み立て：主文1つ＋注意文1つ（優先度順）
function _shBuildSummary(d) {
  const p = d.perf, c = d.cash, t = d.tax;
  let main = '', caution = '', tone = 'green';

  if (p.level === 'gray') {
    return { text: '最新の推移表を取り込むと、業績・資金・税金の診断が表示されます。', tone: 'gray' };
  }
  if (p.level === 'red') {
    main = `今期は経常<b>▲${_shMan(-p.landingOrd)}万円</b>の赤字ペースです。`;
    tone = 'red';
  } else if (p.level === 'yellow') {
    const parts = [];
    if (p.salesYoY != null) parts.push(`売上は前年比<b>${p.salesYoY.toFixed(0)}%</b>`);
    if (p.achieveRate != null) parts.push(`予算達成率<b>${p.achieveRate.toFixed(0)}%</b>`);
    main = `${parts.join('、') || '業績'}とやや遅れています。`;
    tone = 'yellow';
  } else {
    const yoyTxt = p.salesYoY != null ? `売上が前年比<b>${p.salesYoY.toFixed(0)}%</b>と好調で、` : '';
    main = `今期は${yoyTxt}経常<b>+${_shMan(p.landingOrd)}万円</b>の着地見込みです。`;
  }

  if (c.level === 'red') {
    caution = `ただし<b>${c.minMonthLabel}</b>に資金が<b>${_shMan(-c.minBalance)}万円</b>不足する見込みです。早めの対策が必要です。`;
    tone = 'red';
  } else if (t.level === 'red') {
    caution = `ただし納税月の資金が不足見込みです。納税資金の確保を検討してください。`;
    tone = 'red';
  } else if (c.level === 'yellow') {
    caution = `<b>${c.minMonthLabel}</b>に資金残高が最も細くなります（<b>${_shMan(c.minBalance)}万円</b>）。`;
    if (tone === 'green') tone = 'yellow';
  } else if (t.level === 'yellow') {
    caution = `<b>${t.payMonthLabel}</b>に約<b>${_shMan(t.estimated)}万円</b>の納税があります。`;
    if (tone === 'green') tone = 'yellow';
  } else if (p.level === 'green' && c.level === 'green' && t.level !== 'red') {
    caution = '大きな懸念はありません。';
  }

  return { text: `${main}${caution}`, tone };
}

// ---- 画面描画 ----
const SH_LEVEL = {
  green:  { label: '良好',  cls: 'sh-g' },
  yellow: { label: '注意',  cls: 'sh-y' },
  red:    { label: '要対応', cls: 'sh-r' },
  gray:   { label: '—',    cls: 'sh-n' },
};

function renderSmartHome(container, budget, company) {
  const curYear = window.App?.currentYear || new Date().getFullYear();
  const diag = calcCompanyDiagnosis(company, budget);

  const card = (icon, name, c, onclick) => {
    const lv = SH_LEVEL[c.level] || SH_LEVEL.gray;
    return `
    <div class="sh-card ${lv.cls}" onclick="${onclick}" tabindex="0" role="button"
         onkeydown="if(event.key==='Enter'||event.key===' ')this.click()">
      <div class="sh-card-head"><span>${icon} ${name}</span>
        <span class="sh-lamp-wrap"><span class="sh-lamp"></span><span class="sh-lamp-label">${lv.label}</span></span></div>
      <div class="sh-big">${escHtml(c.headline)}</div>
      <div class="sh-small">${c.lines.map(escHtml).join('<br>')}</div>
    </div>`;
  };

  const freshHtml = diag.freshness.level !== 'ok' && diag.freshness.detail
    ? `<div class="sh-fresh">⚠️ ${escHtml(diag.freshness.detail)}
        <button class="btn btn-sm btn-outline" onclick="setPhase(6);showPage('import')">📤 アップロードへ</button></div>`
    : '';

  // ⚪カードは入力画面へ誘導
  const perfClick = diag.perf.level === 'gray' ? "setPhase(6);showPage('import')" : "setPhase(1);showPage('monthlyreport')";
  const cashClick = "setPhase(1);showPage('cashplan')";
  const taxClick  = "setPhase(1);showPage('tax')";

  container.innerHTML = `
  <div class="sh-wrap">
    <div class="sh-head">
      <div>
        <span class="sh-co">${escHtml(company?.name || '')}</span>
        <span class="sh-year">${curYear}年度</span>
      </div>
      <div class="sh-fresh-ok">${diag.freshness.level === 'ok' ? '✅ ' + escHtml(diag.freshness.label) : ''}</div>
    </div>
    ${freshHtml}
    <div class="sh-cards">
      ${card('📈', '業績', diag.perf, perfClick)}
      ${card('💰', '資金', diag.cash, cashClick)}
      ${card('🧾', '税金', diag.tax, taxClick)}
    </div>
    <div class="sh-summary sh-tone-${diag.summary.tone}">💬 ${diag.summary.text}</div>
    <div class="sh-actions">
      <button class="btn-solid" onclick="showPage('meeting')">🤝 ミーティングを始める</button>
      <button class="btn btn-outline" onclick="window.print()">🖨 この画面を印刷</button>
    </div>
    <details class="sh-detail" id="sh_detail">
      <summary>▾ 詳しく見る（3期比較・従来のダッシュボード）</summary>
      <div id="sh_detail_body"></div>
    </details>
  </div>`;

  // 折りたたみの開閉状態を会社別に記憶
  const det = document.getElementById('sh_detail');
  const detKey = `sh_detail_open_${company?.id || ''}`;
  try { if (sessionStorage.getItem(detKey) === '1') det.open = true; } catch {}
  det?.addEventListener('toggle', () => {
    try { sessionStorage.setItem(detKey, det.open ? '1' : '0'); } catch {}
    if (det.open) _shRenderDetail();
  });
  if (det?.open) _shRenderDetail();
}

// 折りたたみ内に従来ダッシュボードを遅延描画
function _shRenderDetail() {
  const body = document.getElementById('sh_detail_body');
  if (!body || body.dataset.rendered) return;
  body.dataset.rendered = '1';
  try {
    renderLegacyDashboard(body);
  } catch (e) {
    console.error('legacy dashboard render failed:', e);
    body.innerHTML = '<div class="no-data">読み込みに失敗しました</div>';
  }
}

// ---- スタイル ----
(() => {
  const css = `
  .sh-wrap { max-width: 980px }
  .sh-head { display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:6px; margin-bottom:14px }
  .sh-co { font-size:18px; font-weight:800; color:var(--text) }
  .sh-year { font-size:12px; color:var(--text-muted); margin-left:8px }
  .sh-fresh-ok { font-size:11.5px; color:var(--text-muted) }
  .sh-fresh { background:#fffbeb; border:1px solid #fcd34d; color:#92400e; border-radius:10px;
    padding:9px 14px; font-size:12.5px; margin-bottom:12px; display:flex; align-items:center; gap:10px; flex-wrap:wrap }

  .sh-cards { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px }
  .sh-card { border-radius:14px; padding:16px 16px 13px; border:1.5px solid var(--border,#e2e8f0);
    background:var(--surface,#fff); cursor:pointer; transition:transform .12s }
  .sh-card:hover { transform:translateY(-2px) }
  .sh-card:focus-visible { outline:2px solid var(--primary,#2563eb); outline-offset:2px }
  .sh-card-head { display:flex; justify-content:space-between; align-items:center;
    font-size:12px; font-weight:700; color:var(--text-muted) }
  .sh-lamp-wrap { display:flex; align-items:center; gap:5px }
  .sh-lamp { width:13px; height:13px; border-radius:50% }
  .sh-lamp-label { font-size:10px; font-weight:700 }
  .sh-big { font-size:19px; font-weight:800; margin-top:8px; color:var(--text) }
  .sh-small { font-size:12px; color:var(--text-muted); margin-top:4px; line-height:1.6; font-variant-numeric:tabular-nums }

  .sh-g { background:#ecfdf5; border-color:#a7f3d0 } .sh-g .sh-big{color:#059669} .sh-g .sh-lamp{background:#059669} .sh-g .sh-lamp-label{color:#059669}
  .sh-y { background:#fffbeb; border-color:#fde68a } .sh-y .sh-big{color:#d97706} .sh-y .sh-lamp{background:#d97706} .sh-y .sh-lamp-label{color:#d97706}
  .sh-r { background:#fef2f2; border-color:#fecaca } .sh-r .sh-big{color:#dc2626} .sh-r .sh-lamp{background:#dc2626} .sh-r .sh-lamp-label{color:#dc2626}
  .sh-n .sh-lamp { background:var(--border,#cbd5e1) }

  .sh-summary { margin-top:14px; background:var(--surface,#fff); border:1.5px solid var(--border,#e2e8f0);
    border-left:4px solid var(--primary,#2563eb); border-radius:12px; padding:13px 16px; font-size:13.5px;
    color:var(--text); line-height:1.8 }
  .sh-tone-red { border-left-color:#dc2626 }
  .sh-tone-yellow { border-left-color:#d97706 }

  .sh-actions { display:flex; gap:10px; margin-top:14px; flex-wrap:wrap }
  .sh-detail { margin-top:16px }
  .sh-detail summary { font-size:12px; color:var(--text-muted); cursor:pointer; padding:8px 0;
    border-top:1px dashed var(--border,#e2e8f0); list-style:none; text-align:center }
  .sh-detail summary::-webkit-details-marker { display:none }
  .sh-detail[open] summary { margin-bottom:10px }

  @media print { .sh-actions, .sh-detail summary { display:none !important } .sh-detail:not([open]) { display:none } }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
})();
