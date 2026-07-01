// ===== 銀行格付けシミュレーター =====
// 実際の銀行内部格付けに準拠した設計（債務者区分・金融庁検査マニュアル参考）

// ──────────────────────────────────────────
// 定数定義
// ──────────────────────────────────────────

// 6指標の定義・ウェイト・閾値
// ウェイト合計 = 100
const RATING_METRICS = [
  {
    key:      'debt_repay',
    label:    '債務償還年数',
    weight:   30,
    unit:     '年',
    inverted: true,            // 低いほど良い
    thresholds: [5, 10, 20, 99999],  // A:〜5年, B:〜10年, C:〜20年, D:超過, E:算定不能
    desc:     '(有利子負債 − 現預金) ÷ キャッシュフロー',
    detail:   '銀行が最も重視する指標。「あと何年で借金を返せるか」を示す。10年以内が健全とされる。',
    advice: {
      D: '返済原資（税引後利益＋減価償却）を増やすか、遊休資産の売却による借入金の圧縮が有効です。10年以内を目標に繰上返済計画を策定してください。',
      E: '有利子負債が実質的な返済能力を大幅に超えています。金融機関との早期協議（リスケ・条件変更）を強く推奨します。',
    },
    badge: '最重要',
  },
  {
    key:      'equity_ratio',
    label:    '自己資本比率',
    weight:   25,
    unit:     '%',
    inverted: false,
    thresholds: [30, 20, 10, 5],   // A:30%以上, B:20%以上, C:10%以上, D:5%以上, E:未満
    desc:     '自己資本 ÷ 総資産',
    detail:   '財務の安全性の基礎。30%以上が優良、20%以上が一般的に正常先の目安とされる。',
    advice: {
      D: '内部留保の蓄積が急務です。役員借入金がある場合は資本に振り替える（DES）ことで自己資本比率が改善します。',
      E: '実質的な債務超過リスクがあります。増資・資本注入・不採算事業の整理が必要です。',
    },
    badge: '重要',
  },
  {
    key:      'interest_coverage',
    label:    'インタレスト・カバレッジ',
    weight:   20,
    unit:     '倍',
    inverted: false,
    thresholds: [5, 3, 1.5, 1],   // A:5倍以上, B:3倍以上, C:1.5倍以上, D:1倍以上, E:1倍未満
    desc:     '(営業利益 + 減価償却費) ÷ 支払利息',
    detail:   '利息の支払い余力を示す。1倍を割ると事業利益で利息すら払えない状態。銀行は3倍以上を目安に見る。',
    advice: {
      D: '利益で利息をかろうじて賄えている状態です。金利上昇や売上減少で即座に赤字転落するリスクがあります。収益改善と借入コスト削減を進めてください。',
      E: '事業利益で支払利息を賄えていません。融資審査で最大の懸念点となります。緊急の収益改善が必要です。',
    },
    badge: '重要',
  },
  {
    key:      'op_margin',
    label:    '売上高経常利益率',
    weight:   15,
    unit:     '%',
    inverted: false,
    thresholds: [5, 3, 1, 0],    // A:5%以上, B:3%以上, C:1%以上, D:0%以上, E:赤字
    desc:     '経常利益 ÷ 売上高',
    detail:   '事業の収益力を示す。業種によって水準は異なるが、中小企業平均は2〜3%程度。継続的な黒字が重要。',
    advice: {
      D: '薄利状態です。固定費（特に人件費・家賃）の構造的な見直し、および販売単価・粗利率の改善が必要です。',
      E: '経常赤字です。このまま継続すると自己資本が毀損し、格付けが急速に悪化します。',
    },
    badge: null,
  },
  {
    key:      'current_ratio',
    label:    '流動比率',
    weight:   6,
    unit:     '%',
    inverted: false,
    thresholds: [150, 120, 100, 80],
    desc:     '流動資産 ÷ 流動負債',
    detail:   '短期的な資金繰り能力を示す。100%を割ると短期的な支払いに支障をきたすリスクがある。',
    advice: {
      D: '短期の資金繰りが逼迫しています。売掛金の早期回収（CCC改善）や短期借入の長期転換を検討してください。',
      E: '流動負債が流動資産を超えており、支払い不能のリスクがあります。',
    },
    badge: null,
  },
  {
    key:      'ebitda_leverage',
    label:    'EBITDA有利子負債倍率',
    weight:   4,
    unit:     '倍',
    inverted: true,           // 低いほど良い
    thresholds: [3, 5, 10, 20],  // A:3倍以下, B:5倍以下, C:10倍以下, D:20倍以下, E:超過
    desc:     '有利子負債 ÷ EBITDA',
    detail:   '経産省「ローカルベンチマーク」採用指標。EBITDAで借入金を何年で返せるかを示す。3〜4倍以内が目安とされる。',
    advice: {
      D: 'EBITDAに対して借入規模が大きすぎます。利益の蓄積と遊休資産売却による借入圧縮を同時に進めてください。',
      E: 'EBITDA創出力が著しく低いか借入が過大です。収益力の抜本的な改善が急務です。',
    },
    badge: null,
  },
];

// 格付け区分（実際の銀行格付けに準拠）
const RATING_TABLE = [
  { rating: 1,  min: 90, label: '最優良',   区分: '正常先',    color: '#1e3a8a', bar: '#1e3a8a',
    desc: '財務内容が極めて優良。メガバンク・政府系金融機関から最優遇金利での融資が可能な水準です。上場企業・大手企業と同等の信用力があります。' },
  { rating: 2,  min: 78, label: '優良',     区分: '正常先',    color: '#1d4ed8', bar: '#1d4ed8',
    desc: '財務基盤が非常に安全。銀行からの信頼が厚く、優遇金利・無担保融資・信用保証なし融資も視野に入る水準です。' },
  { rating: 3,  min: 66, label: '良好',     区分: '正常先',    color: '#0284c7', bar: '#0284c7',
    desc: '財務状態は健全で安定しています。通常の条件で融資を受けやすく、設備投資や事業拡大に向けた追加融資も期待できます。' },
  { rating: 4,  min: 54, label: '標準',     区分: '正常先',    color: '#059669', bar: '#059669',
    desc: '財務水準は平均的です。融資は可能ですが、条件面で担保・保証を求められることがあります。一部の指標改善で上位格付けが狙えます。' },
  { rating: 5,  min: 42, label: 'やや注意', 区分: '正常先下位', color: '#65a30d', bar: '#65a30d',
    desc: '複数の指標に改善余地があります。融資は受けられますが、条件が厳しくなりつつあります。経営改善計画の提示を求められる場合があります。' },
  { rating: 6,  min: 30, label: '要注意',   区分: '要注意先',  color: '#d97706', bar: '#d97706',
    desc: '財務上の懸念事項があります。金融機関からの融資条件が厳しくなり、既存融資のモニタリングが強化されます。早急な改善行動が必要です。' },
  { rating: 7,  min: 18, label: '警戒',     区分: '要注意先',  color: '#dc2626', bar: '#dc2626',
    desc: '重大な財務上の問題があります。新規融資が困難になり、既存融資の条件見直し（リスケ）を求められる可能性があります。事業再生計画の策定を強く推奨します。' },
  { rating: 8,  min: 0,  label: '危険',     区分: '破綻懸念先以下', color: '#7f1d1d', bar: '#7f1d1d',
    desc: '財務状態が危機的水準です。金融機関が「破綻懸念先」に区分し、貸出条件の大幅な見直しや保全措置を求めてくる可能性があります。事業再生の専門家への相談を推奨します。' },
];

// グレードスコア
const GRADE_SCORE = { A: 100, B: 75, C: 50, D: 25, E: 0 };

// ──────────────────────────────────────────
// 指標計算
// ──────────────────────────────────────────

function calcBankMetrics(budget) {
  const m = calcHealthMetricsDynamic(budget, 0);
  const d = m._detail || {};

  // 追加値の取得
  const av    = calcAllValuesDynamic(budget);
  const accts = budget.dynamicAccounts || [];
  const cols  = budget.actualCols || [];
  let closeIdx = -1;
  for (let i = 0; i < 12; i++) if (cols[i]) closeIdx = i;
  if (closeIdx < 0) closeIdx = 11;
  const arr  = id => av[id] || new Array(13).fill(0);
  const last = id => arr(id)[closeIdx] || 0;
  const total = id => arr(id).slice(0, 13).reduce((a, b) => a + b, 0);
  const leafSum = (re, mode, sectionFilter) => {
    const matching = accts.filter(a =>
      a.type !== 'section' &&
      re.test(a.name || '') &&
      (!sectionFilter || a.section === sectionFilter)
    );
    const matchingIds = new Set(matching.map(a => a.id));
    const deduped = matching.filter(a => !matchingIds.has(a.parentId));
    return deduped.reduce((s, a) => s + (mode === 'last' ? last(a.id) : total(a.id)), 0);
  };

  // 流動資産セクション限定で現預金を取得（負債科目「預金担保借入金」等を除外）
  const cash      = leafSum(/現金|預金/, 'last', 'bs_cur_asset');
  const loans     = leafSum(/借入金/, 'last');
  const interest  = leafSum(/支払利息|支払利息割引料/, 'total');
  const depr      = leafSum(/減価償却/, 'total');
  const opProfit  = total('calc_op') || total('calc_ord');
  const ordProfit = total('calc_ord');
  const sales     = total('sec_revenue');
  const ebitda    = opProfit + depr;

  // 債務償還年数: (有利子負債 - 現預金) / EBITDA
  const netDebt = Math.max(0, loans - cash);
  const debtRepay = ebitda > 0 ? netDebt / ebitda : (netDebt > 0 ? 99999 : 0);

  // インタレストカバレッジ: EBITDA / 支払利息
  const interestCoverage = interest > 0 ? ebitda / interest : (ebitda > 0 ? 99999 : 0);

  // EBITDA有利子負債倍率（経産省ローカルベンチマーク採用指標）
  const ebitdaLeverage = ebitda > 0 ? loans / ebitda : (loans > 0 ? 99999 : 0);

  return {
    debt_repay:         debtRepay,
    equity_ratio:       m.equity_ratio,
    interest_coverage:  interestCoverage,
    op_margin:          m.op_margin,
    current_ratio:      m.current_ratio,
    ebitda_leverage:    ebitdaLeverage,
    // 表示用の内訳
    _raw: { netDebt, ebitda, ebitdaLeverage, interest, loans, cash, sales, depr, opProfit, ordProfit },
  };
}

// ──────────────────────────────────────────
// スコアリング
// ──────────────────────────────────────────

function gradeMetricBR(metric, value) {
  if (value === 99999) return 'E'; // 算定不能（赤字で返済年数計算不可）
  const t = metric.thresholds;
  if (metric.inverted) {
    if (value <= t[0]) return 'A';
    if (value <= t[1]) return 'B';
    if (value <= t[2]) return 'C';
    if (value <= t[3]) return 'D';
    return 'E';
  } else {
    if (value >= t[0]) return 'A';
    if (value >= t[1]) return 'B';
    if (value >= t[2]) return 'C';
    if (value >= t[3]) return 'D';
    return 'E';
  }
}

function calcWeightedScore(results) {
  // 加重平均スコア (0〜100)
  const totalWeight = results.reduce((s, r) => s + r.weight, 0);
  return results.reduce((s, r) => s + GRADE_SCORE[r.grade] * r.weight, 0) / totalWeight;
}

function scoreToRating(score) {
  for (const r of RATING_TABLE) {
    if (score >= r.min) return r;
  }
  return RATING_TABLE[RATING_TABLE.length - 1];
}

// ──────────────────────────────────────────
// レンダリング
// ──────────────────────────────────────────

function renderBankRating(container) {
  const budget = App.currentBudget;

  const style = `<style>
.br-wrap { max-width: 960px; margin: 0 auto; padding: 24px 16px; }
.br-page-title { font-size: 22px; font-weight: 800; color: var(--text); margin-bottom: 4px; }
.br-page-sub   { font-size: 13px; color: var(--text-muted); margin-bottom: 24px; line-height:1.6 }

/* ── ヒーロー格付けカード ── */
.br-hero { display:flex; gap:20px; background:var(--surface-2); border:1px solid var(--border); border-radius:16px; padding:24px; margin-bottom:20px; align-items:flex-start; }
.br-badge { width:110px; height:110px; border-radius:50%; display:flex; flex-direction:column; align-items:center; justify-content:center; font-weight:900; flex-shrink:0; }
.br-badge-num   { font-size:48px; line-height:1; }
.br-badge-sub   { font-size:10px; font-weight:700; letter-spacing:.08em; opacity:.85; }
.br-hero-right  { flex:1; }
.br-hero-title  { font-size:20px; font-weight:800; color:var(--text); }
.br-hero-kubun  { display:inline-block; font-size:11px; font-weight:700; padding:2px 10px; border-radius:99px; margin:4px 0 8px; }
.br-hero-desc   { font-size:13px; color:var(--text-muted); line-height:1.7; }
.br-score-wrap  { margin-top:14px; }
.br-score-label { font-size:12px; color:var(--text-muted); margin-bottom:5px; display:flex; justify-content:space-between; }
.br-score-track { height:12px; background:var(--border); border-radius:99px; overflow:hidden; }
.br-score-fill  { height:100%; border-radius:99px; transition:width .6s cubic-bezier(.4,0,.2,1); }

/* ── 格付け参照バー ── */
.br-scale { display:flex; gap:2px; margin-bottom:20px; border-radius:10px; overflow:hidden; }
.br-scale-item { flex:1; padding:6px 2px; text-align:center; font-size:10px; font-weight:700; color:#fff; opacity:.5; transition:.2s; }
.br-scale-item.current { opacity:1; transform:scaleY(1.15); }

/* ── 指標テーブル ── */
.br-section-title { font-size:14px; font-weight:700; color:var(--text); margin:20px 0 8px; display:flex; align-items:center; gap:6px; }
.br-table-wrap { background:var(--surface-2); border:1px solid var(--border); border-radius:14px; overflow:hidden; margin-bottom:20px; }
.br-table { width:100%; border-collapse:collapse; font-size:13px; }
.br-table th { background:var(--blue-100); color:var(--primary); padding:10px 14px; text-align:left; font-weight:700; font-size:12px; }
.br-table td { padding:10px 14px; border-top:1px solid var(--border); color:var(--text); vertical-align:top; }
.br-table tr:hover td { background:var(--surface-3); }
.br-metric-name { font-weight:700; }
.br-metric-badge { display:inline-block; font-size:9px; font-weight:700; padding:1px 5px; border-radius:4px; margin-left:4px; background:#fef9c3; color:#854d0e; vertical-align:middle; }
.br-metric-desc { font-size:11px; color:var(--text-muted); margin-top:2px; }
.br-metric-val  { font-variant-numeric:tabular-nums; font-weight:700; font-size:14px; }
.br-weight-bar  { height:4px; background:var(--border); border-radius:99px; margin-top:4px; width:60px; overflow:hidden; }
.br-weight-fill { height:100%; border-radius:99px; background:var(--primary); }

/* グレードピル */
.grade-pill { display:inline-block; width:28px; height:28px; border-radius:50%; text-align:center; line-height:28px; font-size:12px; font-weight:800; }
.g-A { background:#d1fae5; color:#065f46; }
.g-B { background:#dbeafe; color:#1e40af; }
.g-C { background:#fef9c3; color:#854d0e; }
.g-D { background:#ffedd5; color:#9a3412; }
.g-E { background:#fee2e2; color:#991b1b; }

/* ── アドバイスパネル ── */
.br-advice { background:var(--surface-2); border:1px solid var(--border); border-radius:14px; padding:20px; margin-bottom:20px; }
.br-advice-head { font-size:14px; font-weight:700; color:var(--text); margin-bottom:12px; }
.br-advice-item { padding:12px 0; border-top:1px solid var(--border); }
.br-advice-item:first-of-type { padding-top:0; border-top:none; }
.br-advice-metric { font-size:12px; font-weight:700; color:var(--primary); margin-bottom:4px; display:flex; align-items:center; gap:6px; }
.br-advice-text { font-size:13px; color:var(--text-muted); line-height:1.7; }
.br-advice-upgrade { display:inline-block; font-size:11px; background:var(--primary-light); color:var(--primary); padding:1px 7px; border-radius:4px; margin-left:4px; }

/* ── 次のステップ ── */
.br-next { background:var(--primary-light); border:1px solid var(--primary-muted); border-radius:14px; padding:18px 20px; margin-bottom:20px; }
.br-next-title { font-size:13px; font-weight:700; color:var(--primary); margin-bottom:8px; }
.br-next-list  { font-size:13px; color:var(--text); line-height:2; }

/* ── 注記 ── */
.br-note { font-size:11px; color:var(--text-muted); line-height:1.8; padding:12px 0; border-top:1px solid var(--border); }

/* 格付け別カラー */
.rc1  { background:#1e3a8a; color:#fff; } .rb1 { background:#1e3a8a; }
.rc2  { background:#1d4ed8; color:#fff; } .rb2 { background:#1d4ed8; }
.rc3  { background:#0284c7; color:#fff; } .rb3 { background:#0284c7; }
.rc4  { background:#059669; color:#fff; } .rb4 { background:#059669; }
.rc5  { background:#65a30d; color:#fff; } .rb5 { background:#65a30d; }
.rc6  { background:#d97706; color:#fff; } .rb6 { background:#d97706; }
.rc7  { background:#dc2626; color:#fff; } .rb7 { background:#dc2626; }
.rc8  { background:#7f1d1d; color:#fff; } .rb8 { background:#7f1d1d; }
.rk1,.rk2,.rk3,.rk4 { background:#d1fae5; color:#065f46; }
.rk5  { background:#fef9c3; color:#854d0e; }
.rk6  { background:#ffedd5; color:#9a3412; }
.rk7,.rk8  { background:#fee2e2; color:#991b1b; }

.br-nodata { text-align:center; padding:80px 20px; color:var(--text-muted); font-size:14px; }
</style>`;

  if (!budget) {
    container.innerHTML = style + `<div class="br-wrap"><div class="br-nodata">📊 推移表をアップロードしてからご利用ください</div></div>`;
    return;
  }

  const vals = calcBankMetrics(budget);

  // 全指標をスコアリング
  const results = RATING_METRICS.map(metric => {
    const value = vals[metric.key] ?? 0;
    const grade = gradeMetricBR(metric, value);
    return { ...metric, value, grade };
  });

  const weightedScore = calcWeightedScore(results);
  const ratingInfo    = scoreToRating(weightedScore);
  const rn            = ratingInfo.rating;

  // 値フォーマット
  const fmtVal = (v, unit, key) => {
    if (key === 'debt_repay') {
      if (v >= 99999) return '算定不能（赤字）';
      return v.toFixed(1) + ' 年';
    }
    if (unit === '%') return v.toFixed(1) + '%';
    if (unit === '倍') {
      if (v >= 99999) return key === 'interest_coverage' ? '∞（支払利息なし）' : '算定不能（赤字）';
      return v.toFixed(1) + '倍';
    }
    return v.toFixed(1) + unit;
  };

  // 格付けスケールバー
  const scaleBar = RATING_TABLE.map(r =>
    `<div class="br-scale-item rc${r.rating}${r.rating === rn ? ' current' : ''}">${r.rating}</div>`
  ).join('');

  // 指標テーブル行
  const tableRows = results.map(r => {
    const weightPct = r.weight;
    return `<tr>
      <td>
        <div class="br-metric-name">${r.label}${r.badge ? `<span class="br-metric-badge">${r.badge}</span>` : ''}</div>
        <div class="br-metric-desc">${r.desc}</div>
        <div class="br-weight-bar"><div class="br-weight-fill" style="width:${weightPct}%"></div></div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px">ウェイト ${weightPct}%</div>
      </td>
      <td style="font-size:11px;color:var(--text-muted);max-width:200px;line-height:1.5">${r.detail}</td>
      <td class="br-metric-val">${fmtVal(r.value, r.unit, r.key)}</td>
      <td><span class="grade-pill g-${r.grade}">${r.grade}</span></td>
    </tr>`;
  }).join('');

  // アドバイス（D・E評価の指標のみ、ウェイト降順）
  const weakItems = results.filter(r => r.grade === 'D' || r.grade === 'E')
    .sort((a, b) => b.weight - a.weight);

  let adviceHtml;
  if (weakItems.length === 0) {
    adviceHtml = `<div class="br-advice-item"><div class="br-advice-text">すべての指標が良好水準です。現在の財務規律を維持しながら、さらなる成長投資に向けた資金調達を積極的に活用できる状況です。</div></div>`;
  } else {
    adviceHtml = weakItems.map(r => {
      const msg = (r.advice && r.advice[r.grade]) || (r.advice && r.advice.D) || `${r.label}の改善が格付向上に直結します。`;
      // 1段階上げるとどうなるか
      const nextGrade = r.grade === 'E' ? 'D' : 'C';
      const gainPts   = (GRADE_SCORE[nextGrade] - GRADE_SCORE[r.grade]) * r.weight / 100;
      return `<div class="br-advice-item">
        <div class="br-advice-metric">
          <span class="grade-pill g-${r.grade}" style="width:20px;height:20px;line-height:20px;font-size:10px">${r.grade}</span>
          ${r.label}
          <span class="br-advice-upgrade">改善で最大+${gainPts.toFixed(1)}pt</span>
        </div>
        <div class="br-advice-text">${msg}</div>
      </div>`;
    }).join('');
  }

  // 次のステップ（格付けに応じて変える）
  const nextSteps = rn <= 3
    ? ['現在の財務規律を維持し、余剰キャッシュは設備投資・M&A・従業員還元へ活用', '融資条件の再交渉（金利引き下げ・無担保化）を積極的に検討', '政府系金融機関（日本政策金融公庫）の成長支援融資の活用']
    : rn <= 5
    ? ['債務償還年数を10年以内に縮める繰上返済計画の策定', '売上高経常利益率を3%以上に引き上げる収益改善計画の立案', '役員借入金がある場合は資本化（DES）を検討し、自己資本比率を底上げ']
    : ['金融機関への経営改善計画（改善計画書）の提出・共有', '遊休・低採算資産の売却による有利子負債の圧縮', '中小企業再生支援協議会・事業再生ADRの活用検討'];

  const nextHtml = nextSteps.map(s => `<div>✔ ${s}</div>`).join('');

  container.innerHTML = style + `
<div class="br-wrap">
  <div class="br-page-title">🏦 銀行格付けシミュレーター</div>
  <div class="br-page-sub">金融庁「金融検査マニュアル」および銀行実務に基づく6指標・加重スコアリングで、銀行内部格付けを推定します。<br>実際の格付けは個別の定性要因（経営者資質・業界動向・取引関係）も加味されるため、あくまで目安としてご活用ください。</div>

  <div class="br-hero">
    <div class="br-badge rc${rn}">
      <div class="br-badge-num">${rn}</div>
      <div class="br-badge-sub">格付け</div>
    </div>
    <div class="br-hero-right">
      <div class="br-hero-title">格付け ${rn}（${ratingInfo.label}）</div>
      <span class="br-hero-kubun rk${rn}">債務者区分：${ratingInfo.区分}</span>
      <div class="br-hero-desc">${ratingInfo.desc}</div>
      <div class="br-score-wrap">
        <div class="br-score-label">
          <span>総合スコア（加重平均）</span>
          <span style="font-weight:700;color:var(--text)">${weightedScore.toFixed(1)} / 100点</span>
        </div>
        <div class="br-score-track">
          <div class="br-score-fill rc${rn}" style="width:${weightedScore}%"></div>
        </div>
      </div>
    </div>
  </div>

  <div class="br-scale">${scaleBar}</div>

  <div class="br-section-title">📊 財務指標スコアカード</div>
  <div class="br-table-wrap">
    <table class="br-table">
      <thead><tr>
        <th style="width:200px">指標</th>
        <th>銀行の見方</th>
        <th style="width:130px">実績値</th>
        <th style="width:60px">評価</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  <div class="br-section-title">💡 格付改善アドバイス</div>
  <div class="br-advice">
    <div class="br-advice-head">重要度の高い順に改善ポイントを表示しています。</div>
    ${adviceHtml}
  </div>

  <div class="br-next">
    <div class="br-next-title">⚡ 今すぐ取り組むべきアクション（格付け ${rn} ステージ）</div>
    <div class="br-next-list">${nextHtml}</div>
  </div>

  <div class="br-note">
    ※ 本シミュレーターは財務データのみによる定量評価です。実際の銀行格付けには定性評価（経営者の資質・事業計画の合理性・業界の将来性・金融機関との取引関係等）が加味されます。<br>
    ※ 債務者区分の目安：正常先（格付1〜5）、要注意先（格付6〜7）、破綻懸念先以下（格付8）
  </div>
</div>`;
}
