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

  const sales         = sum('sales_ec', 'sales_store', 'sales_other');
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

  const ebitda = ordProfit + total('sga_depr') + total('int_expense');

  const metrics = {
    equity_ratio:      totalAssets  ? (totalEquity / totalAssets * 100) : 0,
    current_ratio:     currentLiab  ? (currentAssets / currentLiab * 100) : 0,
    quick_ratio:       currentLiab  ? ((cash + ar) / currentLiab * 100) : 0,
    op_margin:         sales        ? (ordProfit / sales * 100) : 0,
    labor_ratio:       sales        ? (sga_salary / sales * 100) : 0,
    ebitda,
    loan_month_ratio:  sales / 12   ? ((longLoan + shortLoan) / (sales / 12)) : 0,
  };

  return metrics;
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
    A: '自己資本比率が高く、財務基盤は安定しています。',
    B: '自己資本比率は良好です。引き続き利益留保を推奨します。',
    C: '自己資本比率がやや低めです。利益の内部留保に努めましょう。',
    D: '自己資本比率が低いため、利益留保を強く推奨します。',
    E: '自己資本が著しく不足しています。資本増強の検討が必要です。',
  },
  current_ratio: {
    A: '流動比率が高く、短期支払能力は十分です。',
    B: '流動比率は良好で、短期の支払能力に問題はありません。',
    C: '流動比率がやや低めです。流動資産の確保を意識しましょう。',
    D: '流動比率が低く、短期支払能力に注意が必要です。',
    E: '流動比率が非常に低く、資金繰りに問題が生じるリスクがあります。',
  },
  op_margin: {
    A: '売上高経常利益率が高く、収益性は優秀です。',
    B: '売上高経常利益率は良好です。',
    C: '収益性はやや低めです。コスト削減や売上向上を検討してください。',
    D: '収益性が低い状態です。収益改善策の実施を推奨します。',
    E: '経常赤字または収益性が著しく低い状態です。早急な改善が必要です。',
  },
  loan_month_ratio: {
    A: '借入金月商倍率が低く、借入負担は軽微です。',
    B: '借入金の水準は適正です。',
    C: '借入金月商倍率がやや高めです。返済計画を確認しましょう。',
    D: '借入金負担が重い状態です。借入金の圧縮を検討してください。',
    E: '借入金負担が極めて重い状態です。金融機関との協議を推奨します。',
  },
};
