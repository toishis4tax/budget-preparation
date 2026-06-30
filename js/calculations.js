// 財務計算エンジン

// 月ラベル生成（startMonth=4なら「4月,5月...3月」）
function getMonthLabels(startMonth) {
  const labels = [];
  for (let i = 0; i < 12; i++) {
    const m = ((startMonth - 1 + i) % 12) + 1;
    labels.push(`${m}月`);
  }
  return labels;
}

// 月次PL計算: rowsから各科目の月次値を算出
function calcPL(rows) {
  const get = (id) => rows[id] || new Array(12).fill(0);
  const sum = (...ids) => ids.reduce((acc, id) => {
    const vals = get(id);
    return acc.map((v, i) => v + (vals[i] || 0));
  }, new Array(12).fill(0));
  const sub = (a, b) => get(a).map((v, i) => v - (get(b)[i] || 0));

  const sales         = sum('sales_advisory','sales_compliance','sales_consulting','sales_ec','sales_store','sales_other');
  const cogs          = get('cogs_open').map((v,i) => v + (get('cogs_purchase')[i]||0) - (get('cogs_close')[i]||0));
  const gross_profit  = sales.map((v,i) => v - cogs[i]);

  const sga_salary    = sum('sga_exec', 'sga_emp');
  const sga           = sum('sga_exec','sga_emp','sga_bonus','sga_welfare','sga_fringe',
                            'sga_travel','sga_comm','sga_ad','sga_entertain',
                            'sga_rent','sga_depr','sga_other');
  const op_profit     = gross_profit.map((v,i) => v - sga[i]);

  const non_op_income  = sum('int_income', 'misc_income');
  const non_op_expense = sum('int_expense', 'misc_expense');
  const ord_profit    = op_profit.map((v,i) => v + non_op_income[i] - non_op_expense[i]);

  const extra_income  = get('extra_income');
  const extra_expense = get('extra_expense');
  const pretax_profit = ord_profit.map((v,i) => v + extra_income[i] - extra_expense[i]);
  const corp_tax      = get('corp_tax');
  const net_profit    = pretax_profit.map((v,i) => v - corp_tax[i]);

  return {
    sales, cogs, gross_profit,
    sga_salary, sga,
    op_profit, non_op_income, non_op_expense,
    ord_profit, extra_income, extra_expense,
    pretax_profit, corp_tax, net_profit
  };
}

// BS計算
function calcBS(rows) {
  const get = (id) => rows[id] || new Array(12).fill(0);
  const sum = (...ids) => ids.reduce((acc, id) => {
    const vals = get(id);
    return acc.map((v, i) => v + (vals[i] || 0));
  }, new Array(12).fill(0));

  const current_assets = sum('cash','ar','inventory','other_ca');
  const fixed_assets   = sum('building','machinery','equipment','land','invest','deposit');
  const total_assets   = current_assets.map((v,i) => v + fixed_assets[i]);

  const current_liab   = sum('ap','short_loan','unpaid','unpaid_tax','unpaid_ct');
  const fixed_liab     = get('long_loan');
  const total_liab     = current_liab.map((v,i) => v + fixed_liab[i]);

  const total_equity   = sum('capital','retained');
  const total_liab_eq  = total_liab.map((v,i) => v + total_equity[i]);

  return {
    current_assets, fixed_assets, total_assets,
    current_liab, fixed_liab, total_liab,
    total_equity, total_liab_eq
  };
}

// 全科目の月次値マップを返す(calculated含む)
function calcAllValues(rows) {
  const pl = calcPL(rows);
  const bs = calcBS(rows);
  const vals = { ...rows, ...pl, ...bs };

  // header(親)科目の合計
  const headerSums = {
    sales:          pl.sales,
    cogs:           pl.cogs,
    sga_salary:     pl.sga_salary,
    sga:            pl.sga,
    non_op_income:  pl.non_op_income,
    non_op_expense: pl.non_op_expense,
    current_assets: bs.current_assets,
    fixed_assets:   bs.fixed_assets,
    current_liab:   bs.current_liab,
    fixed_liab:     bs.fixed_liab,
  };
  return { ...vals, ...headerSums };
}

// ===== 動的科目用計算エンジン =====

// 動的インポートされた科目の全月次値を計算
function calcAllValuesDynamic(budget) {
  if (!budget.dynamicAccounts || !budget.dynamicAccounts.length) {
    return calcAllValues(budget.rows || {});
  }
  const accts = budget.dynamicAccounts;
  // getMergedRows で actualRows(実績) と rows(予算) をブレンドしてから集計開始
  const result = { ...(typeof getMergedRows === 'function' ? getMergedRows(budget) : budget.rows || {}) };

  // 親子マップ構築
  const kids = {};
  accts.forEach(a => {
    if (a.parentId) (kids[a.parentId] = kids[a.parentId] || []).push(a.id);
  });

  // 下から上へ: 子の合計を親に集計（逆順で処理）
  // type:'input'でも子が追加された場合（自動生成科目など）は子の合計を使う
  [...accts].reverse().forEach(a => {
    const cids = kids[a.id] || [];
    if ((a.type === 'parent' || a.type === 'section' || cids.length > 0) && cids.length > 0) {
      const hasCData = cids.some(cid => result[cid]?.some(v => v !== 0));
      if (hasCData) {
        // index 0-11 = 月次、index 12 = 調整欄（含めて集計）
        result[a.id] = new Array(13).fill(0).map((_,i) =>
          cids.reduce((s,cid) => s + (result[cid]?.[i] || 0), 0)
        );
      }
      // else: rows[a.id] にある親の直接値をそのまま使用
    }
  });

  // 計算行（利益等）を式で算出
  accts.filter(a => a.type === 'calculated').forEach(a => {
    if (a.formula) result[a.id] = evalDynFormula(a.formula, result);
  });

  return result;
}

function evalDynFormula(formula, vals) {
  const tokens = formula.trim().split(/\s+/);
  const get = id => {
    const arr = vals[id];
    if (!arr) return new Array(13).fill(0);
    if (arr.length >= 13) return arr;
    return [...arr, ...new Array(13 - arr.length).fill(0)]; // インポート値は12要素→13にパディング
  };
  let res = [...get(tokens[0])];
  for (let i = 1; i + 1 < tokens.length; i += 2) {
    const b = get(tokens[i + 1]);
    if (tokens[i] === '+') res = res.map((v,j) => v + b[j]);
    else if (tokens[i] === '-') res = res.map((v,j) => v - b[j]);
  }
  return res;
}

// 年度合計(配列→数値)
function annualTotal(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

// 財務健康診断
function calcHealthMetrics(rows, capital) {
  const allVals = calcAllValues(rows);
  const get12 = (id) => allVals[id] || new Array(12).fill(0);
  const last = (id) => { const a = get12(id); return a[11] || 0; };
  const total = (id) => annualTotal(get12(id));

  const totalAssets   = last('total_assets');
  const totalEquity   = last('total_equity');
  const currentAssets = last('current_assets');
  const currentLiab   = last('current_liab');
  const cash          = last('cash');
  const ar            = last('ar');
  const sales         = total('sales');
  const ordProfit     = total('ord_profit');
  const sga           = total('sga');
  const sga_salary    = total('sga_salary');
  const sga_depr      = total('sga_depr');
  const longLoan      = last('long_loan');
  const shortLoan     = last('short_loan');

  const opProfit = total('op_profit');
  const ebitda = opProfit + total('sga_depr');

  const metrics = {
    equity_ratio:      totalAssets  ? (totalEquity / totalAssets * 100) : 0,
    current_ratio:     currentLiab  ? (currentAssets / currentLiab * 100) : 0,
    quick_ratio:       currentLiab  ? ((cash + ar) / currentLiab * 100) : 0,
    op_margin:         sales        ? (ordProfit / sales * 100) : 0,
    labor_ratio:       sales        ? (sga_salary / sales * 100) : 0,
    ebitda,
    loan_month_ratio:  sales > 0    ? ((longLoan + shortLoan) / (sales / 12)) : 0,
  };

  return metrics;
}

// 財務健康診断（動的科目＋実績対応版）
//  BS: 最終実績月（無ければ期末=11月）の残高、PL: 12か月合計（調整列除く）
function calcHealthMetricsDynamic(budget, capital) {
  const av    = calcAllValuesDynamic(budget);
  const accts = budget.dynamicAccounts || [];
  const cols  = budget.actualCols || [];
  let closeIdx = -1;
  for (let i = 0; i < 12; i++) if (cols[i]) closeIdx = i;
  if (closeIdx < 0) closeIdx = 11;

  const arr   = id => av[id] || new Array(13).fill(0);
  const last  = id => arr(id)[closeIdx] || 0;
  // PL: 月次12か月＋調整欄(index 12)を含む年間合計
  const total = id => arr(id).slice(0, 13).reduce((a, b) => a + b, 0);

  // 名前で科目を合算：inputのみ、または親が同じ正規表現にマッチしない最深レベルを優先
  // BSは残高(last)、PLは年計(total)
  const leafSum = (re, mode) => {
    const matching = accts.filter(a => a.type !== 'section' && re.test(a.name || ''));
    const matchingIds = new Set(matching.map(a => a.id));
    // 親も同じ正規表現にマッチする場合は子を優先し親を除外（二重計上防止）
    const deduped = matching.filter(a => !matchingIds.has(a.parentId));
    return deduped.reduce((s, a) => s + (mode === 'last' ? last(a.id) : total(a.id)), 0);
  };
  // 親科目（indent<=1）を名前で合算（人件費の二重計上回避）
  const parentTotal = (re) => accts
    .filter(a => a.section?.startsWith('pl') && a.type !== 'section' && (a.indent ?? 1) <= 1 && re.test(a.name || ''))
    .reduce((s, a) => s + total(a.id), 0);

  const totalAssets   = last('calc_total_assets') || last('sec_cur_asset') + last('sec_fix_asset');
  const totalEquity   = last('sec_equity');
  const currentAssets = last('sec_cur_asset');
  const currentLiab   = last('sec_cur_liab');
  const cash          = leafSum(/現金|預金/, 'last');
  const ar            = leafSum(/売掛|受取手形/, 'last');
  const sales         = total('sec_revenue');
  const ordProfit     = total('calc_ord');
  const salary        = parentTotal(/給与|給料|賃金|役員報酬|役員賞与|賞与|法定福利|福利厚生|厚生費|福利費|雑給|人件費|退職|手当/);
  const depr          = leafSum(/減価償却/, 'total');
  const interest      = leafSum(/支払利息|支払利息割引料/, 'total');
  const loans         = leafSum(/借入金/, 'last');

  const opProfit2 = total('calc_op') || ordProfit;
  const ebitda = opProfit2 + depr;
  return {
    equity_ratio:     totalAssets ? (totalEquity / totalAssets * 100) : 0,
    current_ratio:    currentLiab ? (currentAssets / currentLiab * 100) : 0,
    quick_ratio:      currentLiab ? ((cash + ar) / currentLiab * 100) : 0,
    op_margin:        sales ? (ordProfit / sales * 100) : 0,
    labor_ratio:      sales ? (salary / sales * 100) : 0,
    ebitda,
    loan_month_ratio: sales > 0 ? (loans / (sales / 12)) : 0,
  };
}

function gradeMetric(key, value) {
  const grades = {
    equity_ratio:     [40, 30, 20, 10],
    current_ratio:    [200, 150, 100, 50],
    quick_ratio:      [100, 75, 50, 25],
    op_margin:        [10, 5, 2, 0],
    labor_ratio:      [30, 40, 50, 60], // 低いほど良い→反転
    loan_month_ratio: [3, 6, 12, 24],   // 低いほど良い→反転
  };
  const thresholds = grades[key];
  if (!thresholds) return 'C';
  const inverted = ['labor_ratio','loan_month_ratio'].includes(key);
  if (inverted) {
    if (value <= thresholds[0]) return 'A';
    if (value <= thresholds[1]) return 'B';
    if (value <= thresholds[2]) return 'C';
    if (value <= thresholds[3]) return 'D';
    return 'E';
  } else {
    if (value >= thresholds[0]) return 'A';
    if (value >= thresholds[1]) return 'B';
    if (value >= thresholds[2]) return 'C';
    if (value >= thresholds[3]) return 'D';
    return 'E';
  }
}

const METRIC_COMMENTS = {
  equity_ratio: {
    A: '財務基盤は非常に安定しており、外部からの信用力も高い状態です。余剰自己資本を設備投資や積極的な事業拡大に活用できる余地があります。',
    B: '財務の安定性は良好です。引き続き利益を内部留保し、40%超を目指すことで金融機関との交渉力がさらに向上します。',
    C: '自己資本比率は中程度です。借入依存度が高めのため、毎期の当期利益を着実に積み上げて自己資本の充実を図りましょう。',
    D: '自己資本比率が低く、外部負債への依存度が高い状態です。役員報酬の最適化や不要資産の整理により、純資産の増強を優先してください。',
    E: '自己資本が著しく不足し、債務超過のリスクがあります。増資・DES（債務の株式化）・利益改善計画の策定など抜本的な対策が必要です。',
  },
  current_ratio: {
    A: '短期の支払能力は十分で、急な資金需要にも対応できます。余剰流動資産の運用（定期預金・短期投資）も検討してみましょう。',
    B: '流動比率は良好で、直近1年の支払いに問題はありません。売上回収・仕入支払のサイクル管理を引き続き丁寧に行いましょう。',
    C: '短期支払能力はやや余裕が薄い状態です。売掛金の早期回収や在庫の圧縮を意識して、手元流動性を高める取り組みを進めましょう。',
    D: '流動比率が低く、資金繰りが逼迫するリスクがあります。当座貸越枠の設定や短期借入れの活用を金融機関と協議してください。',
    E: '短期の支払不能リスクが高い水準です。緊急の資金調達（信用保証協会付き融資・ファクタリング等）と現金フローの精密管理が急務です。',
  },
  quick_ratio: {
    A: '当座比率が高く、すぐに換金できる資産で短期債務を十分カバーできています。',
    B: '当座比率は良好です。在庫に過度に依存せず支払能力を維持できています。',
    C: '当座比率がやや低めです。受取手形や売掛金の回収サイクルを短縮し、即時換金力を高めましょう。',
    D: '当座資産が流動負債を大きく下回っています。在庫依存が高い場合は売れ筋への絞り込みと在庫削減を検討してください。',
    E: '即時の支払能力が極めて低い状態です。売掛金の早期回収・在庫の現金化を最優先で進めてください。',
  },
  op_margin: {
    A: '売上高経常利益率が高く、高収益体質が確立されています。利益の一部を将来投資（人材・設備・DX）に振り向ける余力があります。',
    B: '収益性は良好な水準です。現在の利益率を維持しながら、価格改定や付加価値向上によってさらなる改善を目指しましょう。',
    C: '収益性がやや低い状態です。売上総利益率（粗利）の改善か、販管費のスリム化どちらかに集中して取り組む優先度を決めましょう。',
    D: '収益性が低く、事業の持続性に注意が必要です。主要コスト（人件費・外注費）の見直しと、主力商品・サービスへの集中戦略を検討してください。',
    E: '経常赤字または収益性が著しく低い状態です。抜本的な収益構造の見直し（不採算事業の整理・値上げ・コスト構造改革）が急務です。',
  },
  labor_ratio: {
    A: '労働分配率が低く、生産性の高い経営ができています。従業員への還元（賞与・福利厚生）や人材投資の余地を検討しましょう。',
    B: '労働分配率は適正な水準です。人件費と粗利益のバランスが良好に保たれています。',
    C: '労働分配率がやや高めです。売上・粗利益の向上、または業務効率化（自動化・外注見直し）によって改善を図りましょう。',
    D: '労働分配率が高く、人件費負担が収益を圧迫しています。生産性向上策（ITツール導入・業務集約）と採用計画の見直しを進めてください。',
    E: '労働分配率が非常に高く、経営を圧迫している状態です。人員配置の最適化と、売上構造の抜本的な見直しが必要です。',
  },
  loan_month_ratio: {
    A: '借入金負担は軽微で、財務の自由度が高い状態です。新規投資や設備拡充を安心して検討できます。',
    B: '借入金の水準は適正です。現在の返済ペースを維持しながら、計画的な借入削減を継続しましょう。',
    C: '借入金月商倍率がやや高めです。返済スケジュールを金融機関と確認し、繰上返済の検討や借換えによる金利負担軽減を図りましょう。',
    D: '借入金負担が重く、キャッシュフローへの影響が大きい状態です。返済リスケジュール（期間延長）の交渉や、遊休資産売却による返済原資の確保を検討してください。',
    E: '借入金負担が極めて重く、資金繰りが危機的な状態です。経営改善計画の策定・金融機関との緊急協議・専門家（中小企業診断士・弁護士）への相談を強く推奨します。',
  },
};
