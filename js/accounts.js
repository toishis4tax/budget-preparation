// 勘定科目マスタ
const ACCOUNTS = [
  // ===== 損益計算書 =====
  { id: 'sales',             name: '売上高',               type: 'header',     indent: 0, section: 'pl', sign: 1 },
  { id: 'sales_advisory',   name: '顧問報酬',             type: 'input',      indent: 1, parentId: 'sales',           section: 'pl', sign: 1 },
  { id: 'sales_compliance', name: 'コンプライアンス報酬', type: 'input',      indent: 1, parentId: 'sales',           section: 'pl', sign: 1 },
  { id: 'sales_consulting', name: 'コンサルティング報酬', type: 'input',      indent: 1, parentId: 'sales',           section: 'pl', sign: 1 },
  { id: 'sales_ec',         name: 'EC売上',              type: 'input',      indent: 1, parentId: 'sales',           section: 'pl', sign: 1 },
  { id: 'sales_store',      name: '店舗売上',            type: 'input',      indent: 1, parentId: 'sales',           section: 'pl', sign: 1 },
  { id: 'sales_other',      name: 'その他売上',          type: 'input',      indent: 1, parentId: 'sales',           section: 'pl', sign: 1 },

  { id: 'cogs',            name: '売上原価',             type: 'header',     indent: 0, section: 'pl', sign: -1 },
  { id: 'cogs_open',       name: '期首商品棚卸高',       type: 'input',      indent: 1, parentId: 'cogs',            section: 'pl', sign: 1 },
  { id: 'cogs_purchase',   name: '当期仕入高',           type: 'input',      indent: 1, parentId: 'cogs',            section: 'pl', sign: 1 },
  { id: 'cogs_close',      name: '期末商品棚卸高',       type: 'input',      indent: 1, parentId: 'cogs',            section: 'pl', sign: -1 },

  { id: 'gross_profit',    name: '売上総利益',           type: 'calculated', indent: 0, section: 'pl', formula: 'sales - cogs', bold: true },

  { id: 'sga',             name: '販売費及び一般管理費', type: 'header',     indent: 0, section: 'pl', sign: -1 },
  { id: 'sga_salary',      name: '給与手当',             type: 'header',     indent: 1, parentId: 'sga',             section: 'pl', sign: -1 },
  { id: 'sga_exec',        name: '役員報酬',             type: 'input',      indent: 2, parentId: 'sga_salary',      section: 'pl', sign: -1 },
  { id: 'sga_emp',         name: '従業員給与',           type: 'input',      indent: 2, parentId: 'sga_salary',      section: 'pl', sign: -1 },
  { id: 'sga_bonus',       name: '賞与',                 type: 'input',      indent: 1, parentId: 'sga',             section: 'pl', sign: -1 },
  { id: 'sga_welfare',     name: '法定福利費',           type: 'input',      indent: 1, parentId: 'sga',             section: 'pl', sign: -1 },
  { id: 'sga_fringe',      name: '福利厚生費',           type: 'input',      indent: 1, parentId: 'sga',             section: 'pl', sign: -1 },
  { id: 'sga_travel',      name: '旅費交通費',           type: 'input',      indent: 1, parentId: 'sga',             section: 'pl', sign: -1 },
  { id: 'sga_comm',        name: '通信費',               type: 'input',      indent: 1, parentId: 'sga',             section: 'pl', sign: -1 },
  { id: 'sga_ad',          name: '広告宣伝費',           type: 'input',      indent: 1, parentId: 'sga',             section: 'pl', sign: -1 },
  { id: 'sga_entertain',   name: '接待交際費',           type: 'input',      indent: 1, parentId: 'sga',             section: 'pl', sign: -1 },
  { id: 'sga_rent',        name: '地代家賃',             type: 'input',      indent: 1, parentId: 'sga',             section: 'pl', sign: -1 },
  { id: 'sga_depr',        name: '減価償却費',           type: 'input',      indent: 1, parentId: 'sga',             section: 'pl', sign: -1 },
  { id: 'sga_other',       name: 'その他経費',           type: 'input',      indent: 1, parentId: 'sga',             section: 'pl', sign: -1 },

  { id: 'op_profit',       name: '営業利益',             type: 'calculated', indent: 0, section: 'pl', formula: 'gross_profit - sga', bold: true },

  { id: 'non_op_income',   name: '営業外収益',           type: 'header',     indent: 0, section: 'pl', sign: 1 },
  { id: 'int_income',      name: '受取利息',             type: 'input',      indent: 1, parentId: 'non_op_income',   section: 'pl', sign: 1 },
  { id: 'misc_income',     name: '雑収入',               type: 'input',      indent: 1, parentId: 'non_op_income',   section: 'pl', sign: 1 },

  { id: 'non_op_expense',  name: '営業外費用',           type: 'header',     indent: 0, section: 'pl', sign: -1 },
  { id: 'int_expense',     name: '支払利息',             type: 'input',      indent: 1, parentId: 'non_op_expense',  section: 'pl', sign: -1 },
  { id: 'misc_expense',    name: '雑損失',               type: 'input',      indent: 1, parentId: 'non_op_expense',  section: 'pl', sign: -1 },

  { id: 'ord_profit',      name: '経常利益',             type: 'calculated', indent: 0, section: 'pl', formula: 'op_profit + non_op_income - non_op_expense', bold: true },

  { id: 'extra_income',    name: '特別利益',             type: 'input',      indent: 0, section: 'pl', sign: 1 },
  { id: 'extra_expense',   name: '特別損失',             type: 'input',      indent: 0, section: 'pl', sign: -1 },

  { id: 'pretax_profit',   name: '税引前当期純利益',     type: 'calculated', indent: 0, section: 'pl', formula: 'ord_profit + extra_income - extra_expense', bold: true },
  { id: 'corp_tax',        name: '法人税等',             type: 'input',      indent: 0, section: 'pl', sign: -1 },
  { id: 'net_profit',      name: '当期純利益',           type: 'calculated', indent: 0, section: 'pl', formula: 'pretax_profit - corp_tax', bold: true },

  // ===== 貸借対照表 - 資産 =====
  { id: 'bs_sep',          name: '',                     type: 'separator',  indent: 0, section: 'sep' },

  { id: 'current_assets',  name: '流動資産',             type: 'header',     indent: 0, section: 'bs_asset' },
  { id: 'cash',            name: '現金預金',             type: 'input',      indent: 1, parentId: 'current_assets',  section: 'bs_asset' },
  { id: 'ar',              name: '売掛金',               type: 'input',      indent: 1, parentId: 'current_assets',  section: 'bs_asset' },
  { id: 'inventory',       name: '棚卸資産',             type: 'input',      indent: 1, parentId: 'current_assets',  section: 'bs_asset' },
  { id: 'other_ca',        name: 'その他流動資産',       type: 'input',      indent: 1, parentId: 'current_assets',  section: 'bs_asset' },

  { id: 'fixed_assets',    name: '固定資産',             type: 'header',     indent: 0, section: 'bs_asset' },
  { id: 'building',        name: '建物',                 type: 'input',      indent: 1, parentId: 'fixed_assets',    section: 'bs_asset' },
  { id: 'machinery',       name: '機械装置',             type: 'input',      indent: 1, parentId: 'fixed_assets',    section: 'bs_asset' },
  { id: 'equipment',       name: '工具器具備品',         type: 'input',      indent: 1, parentId: 'fixed_assets',    section: 'bs_asset' },
  { id: 'land',            name: '土地',                 type: 'input',      indent: 1, parentId: 'fixed_assets',    section: 'bs_asset' },
  { id: 'invest',          name: '投資有価証券',         type: 'input',      indent: 1, parentId: 'fixed_assets',    section: 'bs_asset' },
  { id: 'deposit',         name: '敷金保証金',           type: 'input',      indent: 1, parentId: 'fixed_assets',    section: 'bs_asset' },

  { id: 'total_assets',    name: '資産合計',             type: 'calculated', indent: 0, section: 'bs_asset', formula: 'current_assets + fixed_assets', bold: true },

  // ===== 貸借対照表 - 負債 =====
  { id: 'current_liab',    name: '流動負債',             type: 'header',     indent: 0, section: 'bs_liab' },
  { id: 'ap',              name: '買掛金',               type: 'input',      indent: 1, parentId: 'current_liab',    section: 'bs_liab' },
  { id: 'short_loan',      name: '短期借入金',           type: 'input',      indent: 1, parentId: 'current_liab',    section: 'bs_liab' },
  { id: 'unpaid',          name: '未払金',               type: 'input',      indent: 1, parentId: 'current_liab',    section: 'bs_liab' },
  { id: 'unpaid_tax',      name: '未払法人税等',         type: 'input',      indent: 1, parentId: 'current_liab',    section: 'bs_liab' },
  { id: 'unpaid_ct',       name: '未払消費税',           type: 'input',      indent: 1, parentId: 'current_liab',    section: 'bs_liab' },

  { id: 'fixed_liab',      name: '固定負債',             type: 'header',     indent: 0, section: 'bs_liab' },
  { id: 'long_loan',       name: '長期借入金',           type: 'input',      indent: 1, parentId: 'fixed_liab',      section: 'bs_liab' },

  { id: 'total_liab',      name: '負債合計',             type: 'calculated', indent: 0, section: 'bs_liab', formula: 'current_liab + fixed_liab', bold: true },

  // ===== 貸借対照表 - 純資産 =====
  { id: 'capital',         name: '資本金',               type: 'input',      indent: 0, section: 'bs_equity' },
  { id: 'retained',        name: '利益剰余金',           type: 'input',      indent: 0, section: 'bs_equity' },
  { id: 'total_equity',    name: '純資産合計',           type: 'calculated', indent: 0, section: 'bs_equity', formula: 'capital + retained', bold: true },
  { id: 'total_liab_eq',   name: '負債純資産合計',       type: 'calculated', indent: 0, section: 'bs_equity', formula: 'total_liab + total_equity', bold: true },
];

// 集計用: 親科目の子を合計
function buildAccountTree(accounts) {
  const map = {};
  accounts.forEach(a => { map[a.id] = { ...a, children: [] }; });
  accounts.forEach(a => {
    if (a.parentId && map[a.parentId]) {
      map[a.parentId].children.push(map[a.id]);
    }
  });
  return map;
}

// デフォルト値(12か月分ゼロ)
function defaultValues() {
  return new Array(12).fill(0);
}

// デフォルト予算データ生成
function createDefaultBudget(companyId, year) {
  const rows = {};
  ACCOUNTS.forEach(acc => {
    if (acc.type === 'input') {
      rows[acc.id] = defaultValues();
    }
  });
  return { companyId, year, rows, updatedAt: Date.now() };
}
