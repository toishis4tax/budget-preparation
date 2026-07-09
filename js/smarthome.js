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
      let avMerged = calcAllValuesDynamic(budget);
      // 予算のみ: 実績マージを完全に無効化（actualRowsの調整欄(index12)も除外するため空にする）
      const avBudget = calcAllValuesDynamic({ ...budget, actualRows: {}, actualCols: new Array(12).fill(false), actualThrough: -1 });

      // 実績列がONなのに実績値が空（手入力予算で実の取込がまだ等）だと
      // 実績月が0円扱いになり着地が過小になる → その場合は予算のみで判定
      const actCols = (typeof getActualCols === 'function' ? getActualCols(budget) : budget.actualCols) || [];
      const actMonths = actCols.map((v, i) => v ? i : -1).filter(i => i >= 0);
      if (actMonths.length > 0) {
        const actSum = actMonths.reduce((s, i) =>
          s + Math.abs(avMerged['sec_revenue']?.[i] || 0) + Math.abs(avMerged['sec_cogs']?.[i] || 0) + Math.abs(avMerged['sec_sga']?.[i] || 0), 0);
        if (actSum === 0) avMerged = avBudget;
      }

      const landingOrd = shSum13(avMerged['calc_ord']);
      const budgetOrd  = shSum13(avBudget['calc_ord']);
      landingSales     = shSum13(avMerged['sec_revenue']);

      // 前年比（前年に実績がある場合のみ。予算しかない年との比較は「前年比」として誤解を招くため出さない）
      let salesYoY = null;
      try {
        const prev = getBudget(company.id, curYear - 1);
        const prevActCols = prev ? ((typeof getActualCols === 'function' ? getActualCols(prev) : prev.actualCols) || []) : [];
        if (prev?.dynamicAccounts?.length && prevActCols.some(Boolean)) {
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
        d.perf = { level: 'yellow',
          headline: (achieveRate != null && achieveRate < 90) ? '予算未達ペース' : '前年割れペース',
          landingOrd, budgetOrd, achieveRate, salesYoY,
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
      // 期首残高: 資金繰り画面と同じロジック（前期末BS優先→当期首BS）で自動取得
      const autoOpen = (typeof cpAutoOpeningCash === 'function'
        ? cpAutoOpeningCash(company, budget, curYear).value : 0) || 0;
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

        // 「次の納付」までの残月数：直近の決算月＋2か月の納付月を過去→未来で探す
        // （従来の「次の決算まで」基準だと、決算直後＝納付直前なのに green になる逆転が起きる）
        const now = new Date();
        let monthsToPay = null, payDate = null;
        for (const y of [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]) {
          const pd = new Date(y, fiscalMonth - 1 + 2, 1); // 決算月の2か月後（年跨ぎはDateが自動処理）
          const diff = (pd.getFullYear() - now.getFullYear()) * 12 + (pd.getMonth() - now.getMonth());
          if (diff >= 0 && (monthsToPay == null || diff < monthsToPay)) { monthsToPay = diff; payDate = pd; }
        }
        const payLabel2 = payDate ? `${payDate.getFullYear()}年${payDate.getMonth() + 1}月` : payMonthLabel;

        // 納付月の資金残高との比較は「資金繰り設定に税金支払が含まれていない」場合のみ行う
        // （含まれている場合は残高から既に税額が引かれており、二重カウントで誤ってredになる）
        const cpKey = `cashplan_${company.id}_${budget.year ?? curYear}`;
        let cpSaved = null;
        try { cpSaved = JSON.parse(localStorage.getItem(cpKey) || 'null'); } catch {}
        const taxInSeries = (cpSaved?.tax || 0) > 0;
        // 消費税（ctax/localCtax）は資金繰り表がパススルー前提のため、残高比較は法人税等のみで行う
        const corpOnly = source === 'taxsim'
          ? ANNUAL_KEYS.filter(k => k !== 'ctax' && k !== 'localCtax')
              .reduce((a, k) => { try { return a + (parseFloat(loadTaxSummaryData(company.id, curYear)[k]) || 0); } catch { return a; } }, 0)
          : estimated;
        const payIdx = d.cash.series ? ((payMonth - (budget.startMonth || 4) + 12) % 12) : null;
        const payMonthBal = (!taxInSeries && payIdx != null && d.cash.series?.rows?.[payIdx])
          ? d.cash.series.rows[payIdx].closeBal : null;

        if (payMonthBal != null && corpOnly > payMonthBal) {
          d.tax = { level: 'red', headline: '納税資金が不足', estimated, source, payMonthLabel,
            lines: [`概算 ${_shMan(estimated)}万円${srcNote}`, `${payMonthLabel}の資金が不足見込み`] };
        } else if (monthsToPay != null && monthsToPay <= 2) {
          d.tax = { level: 'yellow', headline: 'もうすぐ納税', estimated, source, payMonthLabel,
            lines: [`概算 ${_shMan(estimated)}万円${srcNote}`, `納付は ${payLabel2}`] };
        } else {
          d.tax = { level: 'green', headline: '準備OK', estimated, source, payMonthLabel,
            lines: [`概算 ${_shMan(estimated)}万円${srcNote}`, `納付は ${payLabel2}`] };
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

// ---- 結論バー（v2）: 分析画面の冒頭に「🟢🟡🔴＋一言」を統一フォーマットで出す ----
function verdictBarHTML(v) {
  if (!v || v.level === 'none') return '';
  const color = { green: '#059669', yellow: '#d97706', red: '#dc2626' }[v.level] || '#94a3b8';
  const bg    = { green: '#ecfdf5', yellow: '#fffbeb', red: '#fef2f2' }[v.level] || 'var(--surface-2)';
  const bd    = { green: '#a7f3d0', yellow: '#fde68a', red: '#fecaca' }[v.level] || 'var(--border)';
  const label = { green: '良好', yellow: '注意', red: '要対応' }[v.level] || '';
  return `
  <div class="sh-verdict" style="display:flex;gap:12px;align-items:flex-start;border-radius:12px;
       padding:12px 16px;border:1.5px solid ${bd};background:${bg};margin-bottom:14px">
    <span style="width:15px;height:15px;border-radius:50%;background:${color};flex-shrink:0;margin-top:3px"></span>
    <div>
      <div style="font-size:14px;font-weight:800;color:var(--text)">${escHtml(v.title)}
        <span style="font-weight:700;font-size:10.5px;color:${color};margin-left:6px">${label}</span>
        ${v.benchmark ? `<span style="font-weight:600;color:var(--text-muted);font-size:11.5px;margin-left:8px">${escHtml(v.benchmark)}</span>` : ''}
      </div>
      ${v.comment ? `<div style="font-size:12.5px;color:var(--text);margin-top:2px">${escHtml(v.comment)}</div>` : ''}
    </div>
  </div>`;
}

// 損益分岐点: 経営安全率で判定（bepanalysis の _bepCalc 結果を受け取る）
function shVerdictBEP(cur) {
  if (!cur || cur.safety == null || isNaN(cur.safety)) return { level: 'none' };
  const s = cur.safety;
  const title = `経営安全率 ${s.toFixed(1)}%`;
  if (s < 5)  return { level: 'red', title, benchmark: '目安 15%以上',
    comment: s < 0 ? '損益分岐点を下回っています。固定費の見直しか売上増加が必要です。'
                   : `売上が ${Math.max(0, s).toFixed(0)}% 落ちると赤字です。余裕がほとんどありません。` };
  if (s < 15) return { level: 'yellow', title, benchmark: '目安 15%以上',
    comment: `売上が ${s.toFixed(0)}% 落ちると赤字になります。もう少し余裕が欲しい水準です。` };
  return { level: 'green', title, benchmark: '目安 15%以上',
    comment: `売上が ${s.toFixed(0)}% 落ちても黒字を保てます。良好な水準です。` };
}

// 月次レポート: 業績診断（達成率）を流用
function shVerdictPerf(company, budget) {
  try {
    const d = calcCompanyDiagnosis(company, budget);
    const p = d.perf;
    if (p.level === 'gray') return { level: 'none' };
    const rateTxt = p.achieveRate != null ? `予算達成率 ${p.achieveRate.toFixed(0)}%` : p.headline;
    return {
      level: p.level, title: rateTxt,
      benchmark: p.landingOrd != null ? `着地予測 経常${p.landingOrd >= 0 ? '+' : '▲'}${_shMan(Math.abs(p.landingOrd))}万円` : '',
      comment: d.summary.text.replace(/<\/?b>/g, ''),
    };
  } catch (e) { console.error('verdict perf failed:', e); return { level: 'none' }; }
}

// 要約PL: 経常利益の3期トレンドで判定（data = [前々期, 前期, 当期] の summarizePL 結果）
function shVerdictTrend(data) {
  const ords = (data || []).map(d => d?.ord);
  const [o0, o1, o2] = ords;
  if (o2 == null || isNaN(o2)) return { level: 'none' };
  const title = `経常利益 ${o2 >= 0 ? '+' : '▲'}${_shMan(Math.abs(o2))}万円（当期）`;
  if (o0 != null && o1 != null) {
    if (o2 > o1 && o1 > o0) return { level: 'green', title, benchmark: '2期連続改善',
      comment: '経常利益が2期連続で改善しています。良い流れです。' };
    if (o2 < o1 && o1 < o0) return { level: 'red', title, benchmark: '2期連続悪化',
      comment: '経常利益が2期連続で悪化しています。要因の確認が必要です。' };
  }
  if (o1 != null && !isNaN(o1)) {
    if (o2 >= o1) return { level: 'green', title, benchmark: '前期比 改善',
      comment: `前期（${o1 >= 0 ? '+' : '▲'}${_shMan(Math.abs(o1))}万円）から改善しています。` };
    return { level: 'yellow', title, benchmark: '前期比 悪化',
      comment: `前期（${o1 >= 0 ? '+' : '▲'}${_shMan(Math.abs(o1))}万円）から減益です。` };
  }
  return { level: o2 >= 0 ? 'green' : 'red', title, benchmark: '',
    comment: o2 >= 0 ? '' : '当期は赤字見込みです。' };
}

// ---- ボックス図PL（v3）: 売上と費用・利益を箱の大きさで見せる ----
// sales: 売上高（円）, parts: [{label, value, color}]（費用の内訳）
// 利益 = sales - Σparts。黒字は緑、赤字は赤の箱で表現。
function shBoxPLHTML(sales, parts, opts = {}) {
  if (!(sales > 0)) return '';
  const extraIncome = Math.max(0, opts.extraIncome?.value || 0); // 営業外収益等（左列に積む収入）
  const cost   = parts.reduce((a, p) => a + Math.max(0, p.value || 0), 0);
  const income = sales + extraIncome;
  const profit = income - cost;
  // 赤字時は費用合計、黒字時は収入合計を全体高さの基準にする（どちらの列もはみ出さない）
  const base = Math.max(income, cost);
  const H = 220;
  const px  = v => Math.max(20, Math.round(v / base * H)); // 最小20pxでラベル1行を確保
  const fmt = v => _shMan(v) + '万円';
  const pct = v => (v / sales * 100).toFixed(0) + '%';

  // 高さが小さい箱は金額を横並び1行にして潰れを防ぐ
  const blk = (label, value, color, h, pctTxt) => {
    const oneLine = h < 40;
    const body = oneLine
      ? `<span style="white-space:nowrap">${escHtml(label)} ${fmt(value)}${pctTxt ? `（${pctTxt}）` : ''}</span>`
      : `${escHtml(label)}<span style="font-weight:600;opacity:.9;font-variant-numeric:tabular-nums">${fmt(value)}${pctTxt ? `（${pctTxt}）` : ''}</span>`;
    return `<div style="background:${color};border-radius:8px;padding:4px 10px;color:#fff;font-size:11.5px;
         font-weight:700;line-height:1.35;height:${h}px;display:flex;flex-direction:column;justify-content:center;overflow:hidden">${body}</div>`;
  };

  const partBlocks = parts.filter(p => (p.value || 0) > 0)
    .map(p => blk(p.label, p.value, p.color, px(p.value), pct(p.value))).join('<div style="height:4px"></div>');

  // 黒字: 左=売上（全高）、右=費用+利益（緑）
  // 赤字: 左=売上+損失（赤）で費用と同じ高さに、右=費用のみ
  const salesBlk = `
    <div style="background:var(--primary,#2563eb);border-radius:8px;padding:6px 10px;color:#fff;font-size:12px;
         font-weight:700;height:${px(sales)}px;display:flex;flex-direction:column;justify-content:flex-end">
      売上高<span style="font-weight:600;opacity:.9;font-variant-numeric:tabular-nums">${fmt(sales)}</span>
    </div>`;
  const extraBlk = extraIncome > 0
    ? '<div style="height:4px"></div>' + blk(opts.extraIncome.label || '営業外収益', extraIncome, '#0891b2', px(extraIncome), null)
    : '';
  const leftCol = profit >= 0
    ? salesBlk + extraBlk
    : salesBlk + extraBlk + '<div style="height:4px"></div>' +
      blk('損失（不足分）', -profit, '#dc2626', px(-profit), null);
  const rightCol = profit >= 0
    ? partBlocks + '<div style="height:4px"></div>' + blk('利益', profit, '#059669', px(profit), pct(profit))
    : partBlocks;

  const lossNote = profit < 0
    ? `<div style="font-size:11px;font-weight:700;color:#dc2626;margin-top:8px">⚠️ 費用が売上を ${fmt(-profit)} 上回っています（赤字）。</div>`
    : '';

  return `
  <div class="card sh-boxpl" style="padding:16px;margin-bottom:14px">
    <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:10px">${escHtml(opts.title || '損益の構造（' + (opts.periodLabel || '年間') + '）')}</div>
    <div style="display:flex;gap:14px;align-items:flex-start;max-width:560px">
      <div style="flex:1;max-width:44%;display:flex;flex-direction:column">${leftCol}</div>
      <div style="flex:1;display:flex;flex-direction:column">${rightCol}</div>
    </div>
    ${lossNote}
    <div style="font-size:10.5px;color:var(--text-muted);margin-top:6px">左＝売上、右＝費用の内訳${profit >= 0 ? 'と利益' : ''}。箱の大きさは金額に比例します。</div>
  </div>`;
}

// 月次レポート用: 着地予測ベースの年間損益ボックス
function shBoxPLForBudget(budget) {
  try {
    if (!budget?.dynamicAccounts?.length) return '';
    const av = calcAllValuesDynamic(budget);
    const sales = shSum13(av['sec_revenue']);
    const cogs  = Math.max(0, shSum13(av['sec_cogs']));
    const sga   = Math.max(0, shSum13(av['sec_sga']));
    const nonOpExp = Math.max(0, shSum13(av['sec_non_op_exp']));
    const nonOpInc = Math.max(0, shSum13(av['sec_non_op_inc']));
    const parts = [
      { label: '売上原価', value: cogs, color: '#64748b' },
      { label: '販管費',   value: sga,  color: '#94a3b8' },
      { label: '営業外費用', value: nonOpExp, color: '#cbd5e1' },
    ];
    // 営業外収益は左（収入側）に積む → 利益の箱が経常利益と一致する
    return shBoxPLHTML(sales, parts, { periodLabel: '年間・着地予測',
      extraIncome: nonOpInc > 0 ? { label: '営業外収益', value: nonOpInc } : null });
  } catch (e) { console.error('boxpl failed:', e); return ''; }
}

// 要約PL用: summarizePL の当期データから
function shBoxPLForSummary(d) {
  try {
    if (!d || !(d.sales > 0)) return '';
    const parts = [
      { label: '変動費',   value: Math.max(0, d.varTotal || 0),  color: '#64748b' },
      { label: '固定費',   value: Math.max(0, d.fixedTotal || 0), color: '#94a3b8' },
    ];
    return shBoxPLHTML(d.sales, parts, { periodLabel: '当期' });
  } catch (e) { console.error('boxpl summary failed:', e); return ''; }
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
         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}">
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

  @media print {
    .sh-actions, .sh-detail summary { display:none !important }
    .sh-detail:not([open]) { display:none }
    /* 結論バー（🟢🟡🔴）は所内向け。お客様に渡す印刷物には出さない */
    .sh-verdict { display:none !important }
    /* ボックス図はページ境界で分割しない */
    .sh-boxpl { page-break-inside:avoid; break-inside:avoid }
  }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
})();
