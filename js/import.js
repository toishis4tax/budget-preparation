// CSV/Excelインポート（ミロク・MoneyForward対応）

// 勘定科目名 → 内部ID マッピング
const ACCOUNT_NAME_MAP = {
  // ===== 売上（ヘッダー型のsalesではなく入力型に振り分ける） =====
  // EC・ネット系
  'EC売上': 'sales_ec', 'ネット売上': 'sales_ec', 'オンライン売上': 'sales_ec',
  // 店舗系
  '店舗売上': 'sales_store', '小売売上': 'sales_store',
  // サービス業・士業系（顧問・コンサル・報酬 → その他売上）
  '顧問報酬': 'sales_advisory', '顧問料': 'sales_advisory', '顧問契約料': 'sales_advisory', '月次顧問料': 'sales_advisory',
  'コンプライアンス報酬': 'sales_compliance', 'コンプライアンス費': 'sales_compliance', 'コンプライアンス料': 'sales_compliance',
  'コンサルティング報酬': 'sales_consulting', 'コンサルティング費': 'sales_consulting', 'コンサルティング料': 'sales_consulting',
  '税務顧問料': 'sales_advisory', '会計顧問料': 'sales_advisory', '税務報酬': 'sales_advisory', '会計報酬': 'sales_advisory',
  '記帳代行料': 'sales_other', '記帳代行報酬': 'sales_other', '巡回監査料': 'sales_other',
  '決算報酬': 'sales_other', '申告報酬': 'sales_other', '税務申告報酬': 'sales_other',
  // 汎用売上合計行 → その他売上（単一科目で売上を管理している場合）
  '売上高': 'sales_other', '売上': 'sales_other', '総売上': 'sales_other',
  '売上高合計': 'sales_other', '売上合計': 'sales_other', '経常売上高': 'sales_other', '経常売上高合計': 'sales_other',
  'その他売上': 'sales_other', '雑収益': 'sales_other',

  // ===== 売上原価 =====
  '売上原価': 'cogs', '商品原価': 'cogs',
  '期首商品棚卸高': 'cogs_open', '期首棚卸高': 'cogs_open',
  '当期仕入高': 'cogs_purchase', '商品仕入高': 'cogs_purchase', '仕入高': 'cogs_purchase', '仕入': 'cogs_purchase',
  '期末商品棚卸高': 'cogs_close', '期末棚卸高': 'cogs_close',

  // ===== 販管費 - 人件費 =====
  '役員報酬': 'sga_exec', '役員給与': 'sga_exec', '役員賞与': 'sga_exec', '取締役報酬': 'sga_exec',
  '給与手当': 'sga_emp', '給与': 'sga_emp', '給料手当': 'sga_emp', '給料': 'sga_emp',
  '給料賃金': 'sga_emp', '従業員給与': 'sga_emp', '雑給': 'sga_emp',
  '管理職手当': 'sga_emp', '残業手当': 'sga_emp',
  '賞与': 'sga_bonus', '従業員賞与': 'sga_bonus', '決算賞与': 'sga_bonus',
  '退職給付費用': 'sga_bonus', '退職金': 'sga_bonus',
  '法定福利費': 'sga_welfare', '社会保険料': 'sga_welfare',
  '健康保険料': 'sga_welfare', '厚生年金保険料': 'sga_welfare',
  '雇用保険料': 'sga_welfare', '労働保険料': 'sga_welfare',
  '福利厚生費': 'sga_fringe', '厚生費': 'sga_fringe',
  '慶弔費': 'sga_fringe', '採用費': 'sga_fringe', '研修費': 'sga_fringe',

  // ===== 販管費 - その他 =====
  '旅費交通費': 'sga_travel', '旅費': 'sga_travel', '交通費': 'sga_travel', '出張旅費': 'sga_travel',
  '通信費': 'sga_comm', '電話代': 'sga_comm', '電話通信費': 'sga_comm',
  '広告宣伝費': 'sga_ad', '広告費': 'sga_ad', '宣伝費': 'sga_ad', '販売促進費': 'sga_ad',
  '荷造運賃': 'sga_ad', '荷造発送費': 'sga_ad', '発送費': 'sga_ad',
  '接待交際費': 'sga_entertain', '交際費': 'sga_entertain', '接待費': 'sga_entertain',
  '地代家賃': 'sga_rent', '家賃': 'sga_rent', '賃借料': 'sga_rent',
  'リース料': 'sga_rent', '駐車場代': 'sga_rent',
  '減価償却費': 'sga_depr', '償却費': 'sga_depr',
  'ソフトウェア償却': 'sga_depr', '無形固定資産償却': 'sga_depr',
  'その他経費': 'sga_other', '雑費': 'sga_other',
  '消耗品費': 'sga_other', '事務用品費': 'sga_other',
  '水道光熱費': 'sga_other', '光熱費': 'sga_other',
  '外注費': 'sga_other', '外注工賃': 'sga_other',
  '業務委託費': 'sga_other', '業務委託料': 'sga_other',
  '会議費': 'sga_other', '新聞図書費': 'sga_other', '図書費': 'sga_other',
  '支払手数料': 'sga_other', '手数料': 'sga_other',
  '租税公課': 'sga_other', '税金': 'sga_other',
  '損害保険料': 'sga_other', '保険料': 'sga_other',
  '修繕費': 'sga_other', '諸会費': 'sga_other',

  // ===== 営業外 =====
  '受取利息': 'int_income', '受取利息配当金': 'int_income', '受取配当金': 'int_income',
  '雑収入': 'misc_income', '営業外収益その他': 'misc_income',
  '支払報酬': 'sga_other', '支払報酬料': 'sga_other', '外部報酬': 'sga_other',
  '支払利息': 'int_expense', '借入金利息': 'int_expense', '社債利息': 'int_expense',
  '雑損失': 'misc_expense', '営業外費用その他': 'misc_expense',

  // ===== 特別 =====
  '特別利益': 'extra_income', '固定資産売却益': 'extra_income',
  '特別損失': 'extra_expense', '固定資産除却損': 'extra_expense',

  // ===== 法人税 =====
  '法人税等': 'corp_tax', '法人税、住民税及び事業税': 'corp_tax',

  // ===== BS 資産（流動）　Journal-Checker PL_BS_ACCTS ベース =====
  '現金及び預金': 'cash', '現金預金': 'cash', '現金': 'cash',
  '小口現金': 'cash', '普通預金': 'cash', '当座預金': 'cash',
  '定期預金': 'cash', '外貨預金': 'cash', '預金': 'cash',
  '現金及び預金合計': 'cash',
  '売掛金': 'ar', '売掛': 'ar', '受取手形': 'ar',
  '未収入金': 'ar', '未収金': 'ar', '電子記録債権': 'ar',
  '棚卸資産': 'inventory', '商品': 'inventory', '製品': 'inventory',
  '原材料': 'inventory', '仕掛品': 'inventory',
  '前払費用': 'other_ca', '前払金': 'other_ca', '長期前払費用': 'other_ca',
  '仮払金': 'other_ca', '立替金': 'other_ca', '未収収益': 'other_ca',
  '短期貸付金': 'other_ca', 'その他流動資産': 'other_ca',

  // ===== BS 資産（固定）=====
  '建物': 'building', '建物附属設備': 'building', '附属設備': 'building', '構築物': 'building',
  '機械装置': 'machinery', '機械及び装置': 'machinery',
  '工具器具備品': 'equipment', '器具備品': 'equipment', '備品': 'equipment',
  '車両運搬具': 'equipment', 'ソフトウェア': 'equipment',
  '一括償却資産': 'equipment', '少額減価償却資産': 'equipment',
  '土地': 'land',
  '投資有価証券': 'invest', '有価証券': 'invest', '出資金': 'invest', '保険積立金': 'invest',
  '差入保証金': 'deposit', '敷金': 'deposit', '保証金': 'deposit', '預け金': 'deposit',
  '長期貸付金': 'deposit',

  // ===== BS 負債 =====
  '買掛金': 'ap', '買掛': 'ap', '支払手形': 'ap', '電子記録債務': 'ap',
  '短期借入金': 'short_loan', '銀行短期借入': 'short_loan', '役員借入金': 'short_loan',
  '未払金': 'unpaid', '未払費用': 'unpaid',
  '預り金': 'unpaid', '仮受金': 'unpaid', '前受金': 'unpaid', '前受収益': 'unpaid',
  '未払法人税等': 'unpaid_tax', '未払法人税': 'unpaid_tax',
  '未払消費税': 'unpaid_ct', '仮受消費税': 'unpaid_ct', '未払消費税等': 'unpaid_ct',
  '長期借入金': 'long_loan', '銀行長期借入': 'long_loan',

  // ===== BS 純資産 =====
  '資本金': 'capital', '資本準備金': 'capital',
  '利益剰余金': 'retained', '繰越利益剰余金': 'retained', '利益準備金': 'retained',
};

// ===== 動的インポート用定数 =====

// col0 セクションヘッダー → セクション情報
const DYN_SECTION_MAP = {
  '売上高':           { id: 'sec_revenue',    section: 'pl',       sign:  1 },
  '売上原価':         { id: 'sec_cogs',        section: 'pl',       sign: -1 },
  '販売費及び一般管理費': { id: 'sec_sga',     section: 'pl',       sign: -1 },
  '営業外収益':       { id: 'sec_non_op_inc',  section: 'pl',       sign:  1 },
  '営業外費用':       { id: 'sec_non_op_exp',  section: 'pl',       sign: -1 },
  '特別利益':         { id: 'sec_extra_inc',   section: 'pl',       sign:  1 },
  '特別損失':         { id: 'sec_extra_exp',   section: 'pl',       sign: -1 },
  '当期純損益':       { id: 'sec_tax_etc',     section: 'pl',       sign: -1 },
  '流動資産':         { id: 'sec_cur_asset',   section: 'bs_asset', sign:  1 },
  '固定資産':         { id: 'sec_fix_asset',   section: 'bs_asset', sign:  1 },
  '投資その他の資産': { id: 'sec_fix_asset',   section: 'bs_asset', sign:  1 },
  '流動負債':         { id: 'sec_cur_liab',    section: 'bs_liab',  sign:  1 },
  '固定負債':         { id: 'sec_fix_liab',    section: 'bs_liab',  sign:  1 },
  '純資産':           { id: 'sec_equity',      section: 'bs_equity',sign:  1 },
  '株主資本':         { id: 'sec_equity',      section: 'bs_equity',sign:  1 },
};

// スキップする行名（合計行・計算利益行）
const DYN_SKIP_ROWS = new Set([
  '売上総利益','売上総損失','営業利益','営業損失',
  '経常利益','経常損失','税引前当期純利益','税引前当期純損失',
  '当期純利益','当期純損失','当期純利益（損失）',
  '売上高合計','経常売上高合計','売上原価合計',
  '販売費及び一般管理費合計',
  '営業外収益合計','営業外費用合計',
  '特別利益合計','特別損失合計','当期純損益合計',
  '流動資産合計','固定資産合計','投資その他の資産合計','資産合計',
  '流動負債合計','固定負債合計','負債合計',
  '株主資本合計','評価換算差額等合計','純資産合計',
  '負債純資産合計','負債及び純資産合計',
]);

// PL計算行の定義
const PL_CALC_ROWS = [
  { id:'calc_gross',  name:'売上総利益',       after:'sec_cogs',       formula:'sec_revenue - sec_cogs',                    bold:true },
  { id:'calc_op',     name:'営業利益',         after:'sec_sga',        formula:'calc_gross - sec_sga',                      bold:true },
  { id:'calc_ord',    name:'経常利益',         after:'sec_non_op_exp', formula:'calc_op + sec_non_op_inc - sec_non_op_exp', bold:true },
  { id:'calc_pretax', name:'税引前当期純利益', after:'sec_extra_exp',  formula:'calc_ord + sec_extra_inc - sec_extra_exp',  bold:true },
];

// 月名 → インデックス
const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const MONTH_PATS  = [/^1月|jan/i,/^2月|feb/i,/^3月|mar/i,/^4月|apr/i,/^5月|may/i,/^6月|jun/i,
                     /^7月|jul/i,/^8月|aug/i,/^9月|sep/i,/^10月|oct/i,/^11月|nov/i,/^12月|dec/i];

function detectMonthCol(header) {
  const monthCols = [];
  header.forEach((cell, i) => {
    const s = String(cell || '').trim();
    MONTH_PATS.forEach((pat, mi) => {
      if (pat.test(s)) monthCols.push({ col: i, month: mi });
    });
  });
  return monthCols;
}

function matchAccount(name) {
  const s = String(name || '').trim()
    .replace(/\s+/g, '')
    .replace(/（.*?）/g, '')
    .replace(/\(.*?\)/g, '');
  if (ACCOUNT_NAME_MAP[s]) return ACCOUNT_NAME_MAP[s];
  // 部分一致
  for (const [key, val] of Object.entries(ACCOUNT_NAME_MAP)) {
    if (s.includes(key) || key.includes(s)) return val;
  }
  return null;
}

function parseNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  const s = String(v).replace(/,/g,'').replace(/[^\d.\-]/g,'');
  return parseFloat(s) || 0;
}

// ===== 仕訳帳パーサー =====
function isJournalFormat(data) {
  for (let ri = 0; ri < Math.min(5, data.length); ri++) {
    const row = data[ri];
    const joined = row.join(',');
    if (joined.includes('借方') && joined.includes('貸方') && joined.includes('金額')) return true;
    if (joined.includes('日付') && joined.includes('科目')) return true;
  }
  return false;
}

function parseJournalData(data, startMonth) {
  let headerRow = null, headerIdx = -1;
  for (let ri = 0; ri < Math.min(5, data.length); ri++) {
    const joined = data[ri].join('');
    if (joined.includes('借方') && joined.includes('貸方')) {
      headerRow = data[ri];
      headerIdx = ri;
      break;
    }
  }
  if (!headerRow) return { rows: {}, unmapped: [], error: '仕訳帳のヘッダーを検出できませんでした。' };

  let dateCol=-1, drAccCol=-1, drAmtCol=-1, crAccCol=-1, crAmtCol=-1;
  headerRow.forEach((h, i) => {
    const s = String(h).replace(/\s/g,'');
    if (dateCol < 0 && (s.includes('日付') || s.includes('伝票日付') || s === '日')) dateCol = i;
    if (drAccCol < 0 && (s.includes('借方科目名') || s === '借方科目')) drAccCol = i;
    if (drAmtCol < 0 && (s.includes('借方金額') || s === '借方')) drAmtCol = i;
    if (crAccCol < 0 && (s.includes('貸方科目名') || s === '貸方科目')) crAccCol = i;
    if (crAmtCol < 0 && (s.includes('貸方金額') || s === '貸方')) crAmtCol = i;
  });

  if (dateCol < 0) dateCol = 1;
  if (drAccCol < 0) drAccCol = 2;
  if (drAmtCol < 0) drAmtCol = 8;
  if (crAccCol < 0) crAccCol = 9;
  if (crAmtCol < 0) crAmtCol = 15;

  const accMonthMap = {};
  for (let ri = headerIdx + 1; ri < data.length; ri++) {
    const row = data[ri];
    const dateStr = String(row[dateCol] || '').trim();
    if (!dateStr) continue;

    let month = -1;
    const m1 = dateStr.match(/\d{4}[\/\-](\d{1,2})[\/\-]\d{1,2}/);
    const m2 = dateStr.match(/^(\d{1,2})[\/\-]\d{1,2}$/);
    if (m1) month = parseInt(m1[1]) - 1;
    else if (m2) month = parseInt(m2[1]) - 1;
    if (month < 0 || month > 11) continue;

    const budgetIdx = (month - (startMonth - 1) + 12) % 12;
    const drAcc = String(row[drAccCol] || '').trim().replace(/\s+/g,'');
    const crAcc = String(row[crAccCol] || '').trim().replace(/\s+/g,'');
    const drAmt = parseNum(row[drAmtCol]);
    const crAmt = parseNum(row[crAmtCol]);

    if (drAcc && drAmt) {
      if (!accMonthMap[drAcc]) accMonthMap[drAcc] = Array.from({length:12}, ()=>({dr:0,cr:0}));
      accMonthMap[drAcc][budgetIdx].dr += drAmt;
    }
    if (crAcc && crAmt) {
      if (!accMonthMap[crAcc]) accMonthMap[crAcc] = Array.from({length:12}, ()=>({dr:0,cr:0}));
      accMonthMap[crAcc][budgetIdx].cr += crAmt;
    }
  }

  const CREDIT_NATURE = new Set(['sales','sales_ec','sales_store','sales_other','int_income','misc_income','extra_income']);
  const result = {};
  const unmapped = [];

  for (const [accName, months] of Object.entries(accMonthMap)) {
    const accId = matchAccount(accName);
    const values = months.map(({dr, cr}) => {
      if (!accId) return Math.abs(dr - cr);
      return CREDIT_NATURE.has(accId) ? (cr - dr) : (dr - cr);
    });
    const hasData = values.some(v => v !== 0);
    if (!hasData) continue;
    if (accId) {
      if (!result[accId]) result[accId] = new Array(12).fill(0);
      result[accId] = result[accId].map((v, i) => v + values[i]);
    } else {
      unmapped.push({ name: accName, values });
    }
  }

  return { rows: result, unmapped, error: null };
}

// ===== ミロク・MoneyForward 月次推移表パーサー（動的科目構造） =====
// 構造: col0=大区分ヘッダー/合計行, col1=勘定科目, col2=補助科目, col3+=月次残高
function parseMjsMonthlySmart(data, startMonth) {
  // ヘッダー行を探す
  let headerRowIdx = -1, monthCols = [];
  for (let ri = 0; ri < Math.min(5, data.length); ri++) {
    const mc = detectMonthCol(data[ri]);
    if (mc.length >= 6) { headerRowIdx = ri; monthCols = mc; break; }
  }
  if (headerRowIdx < 0 || monthCols.length === 0) {
    return { dynamicAccounts: [], rows: {}, unmapped: [], error: '月次データの列を検出できませんでした。' };
  }

  // 月→予算インデックスのマッピング
  const budgetMonthMap = new Array(12).fill(-1);
  monthCols.forEach(({ col, month }) => {
    const bi = (month - (startMonth - 1) + 12) % 12;
    if (bi < 12) budgetMonthMap[bi] = col;
  });

  // 決算整理列を検出（月次が全0でも年度合計を取れる）
  let adjustCol = -1;
  const hdrRow = data[headerRowIdx];
  for (let i = 0; i < hdrRow.length; i++) {
    const s = String(hdrRow[i]||'').trim();
    if (s === '決算整理' || s === '決算') { adjustCol = i; break; }
  }

  // 月次値取得（決算整理列フォールバック付き）
  const getVals = row => {
    const vals = budgetMonthMap.map(col => col >= 0 ? parseNum(row[col]) : 0);
    if (adjustCol >= 0 && !vals.some(v => v !== 0)) {
      const adj = parseNum(row[adjustCol]);
      if (adj !== 0) { const v2 = [...vals]; v2[11] = adj; return v2; }
    }
    return vals;
  };

  // パス1: 補助科目を持つ勘定科目を把握
  const hasSubs = new Set();
  let lastC1 = null;
  for (let ri = headerRowIdx + 1; ri < data.length; ri++) {
    const c1 = String(data[ri][1]||'').trim();
    const c2 = String(data[ri][2]||'').trim();
    if (c1 && !c2) lastC1 = c1;
    else if (!c1 && c2 && lastC1) hasSubs.add(lastC1);
  }

  // セクションマップをスペース除去済みキーで再構築
  const secMapClean = {};
  for (const [k, v] of Object.entries(DYN_SECTION_MAP)) {
    secMapClean[k.replace(/\s+/g,'')] = v;
  }

  // パス2: 動的科目リスト構築
  const accts = [], rows = {};
  let secInfo = null, curParent = null, ctr = 0;
  const seenSecs = new Set();
  const mkId = prefix => `${prefix}${++ctr}`;

  for (let ri = headerRowIdx + 1; ri < data.length; ri++) {
    const row = data[ri];
    const c0r = String(row[0]||'').trim();
    const c1r = String(row[1]||'').trim();
    const c2r = String(row[2]||'').trim();
    const c0 = c0r.replace(/\s+/g,'');
    const c1 = c1r.replace(/\s+/g,'');

    // col0のみ（セクションヘッダー or 合計/利益行）
    if (c0 && !c1r) {
      if (DYN_SKIP_ROWS.has(c0)) continue;
      const si = secMapClean[c0];
      if (si) {
        if (!seenSecs.has(si.id)) {
          seenSecs.add(si.id);
          accts.push({ id: si.id, name: c0r, type: 'section', indent: 0, section: si.section, sign: si.sign });
        }
        secInfo = si; curParent = null;
      }
      continue;
    }

    // col1のみ（勘定科目行）
    if (c1r && !c2r) {
      if (DYN_SKIP_ROWS.has(c1)) continue;
      const vals = getVals(row);
      if (!vals.some(v => v !== 0)) { curParent = null; continue; }
      const pfx = secInfo?.section?.startsWith('bs') ? 'b' : 'p';
      const aid = mkId(pfx);
      const isParent = hasSubs.has(c1r);
      accts.push({
        id: aid, name: c1r,
        type: isParent ? 'parent' : 'input',
        indent: 1, parentId: secInfo?.id || null,
        section: secInfo?.section || 'pl', sign: secInfo?.sign ?? 1,
      });
      rows[aid] = vals; // parentも格納（補助科目sum計算のフォールバック）
      curParent = { id: aid };
      continue;
    }

    // col2（補助科目行）
    if (c2r && curParent) {
      const vals = getVals(row);
      if (!vals.some(v => v !== 0)) continue;
      const pfx = secInfo?.section?.startsWith('bs') ? 'b' : 'p';
      const sid = mkId(pfx);
      accts.push({
        id: sid, name: c2r.trim(), type: 'input',
        indent: 2, parentId: curParent.id,
        section: secInfo?.section || 'pl', sign: secInfo?.sign ?? 1,
      });
      rows[sid] = vals;
    }
  }

  // ===== PL計算行を挿入 =====
  for (const calc of PL_CALC_ROWS) {
    if (!seenSecs.has(calc.after)) continue;
    let ins = accts.findIndex(a => a.id === calc.after);
    if (ins < 0) continue;
    for (let i = ins + 1; i < accts.length; i++) {
      if (accts[i].type === 'section' || accts[i].type === 'calculated') break;
      ins = i;
    }
    if (!accts.find(a => a.id === calc.id)) {
      accts.splice(ins + 1, 0, { id: calc.id, name: calc.name, type: 'calculated', indent: 0, section: 'pl', bold: calc.bold, formula: calc.formula });
    }
  }

  // 当期純利益（法人税等の動的IDを参照）
  if (!accts.find(a => a.id === 'calc_net')) {
    const corpTax = accts.find(a => a.type === 'input' && a.name.replace(/\s+/g,'').includes('法人税'));
    const pretaxIdx = accts.findIndex(a => a.id === 'calc_pretax');
    if (pretaxIdx >= 0) {
      const insAfter = corpTax ? accts.findIndex(a => a.id === corpTax.id) : pretaxIdx;
      const formula = corpTax ? `calc_pretax - ${corpTax.id}` : 'calc_pretax';
      accts.splice(insAfter + 1, 0, { id: 'calc_net', name: '当期純利益', type: 'calculated', indent: 0, section: 'pl', bold: true, formula });
    }
  }

  // ===== BS計算行を挿入 =====
  const insertBsCalc = (afterSec, calcDef) => {
    if (!seenSecs.has(afterSec) || accts.find(a => a.id === calcDef.id)) return;
    let ins = accts.findIndex(a => a.id === afterSec);
    for (let i = ins + 1; i < accts.length; i++) {
      if (accts[i].type === 'section' || accts[i].type === 'calculated') break;
      ins = i;
    }
    accts.splice(ins + 1, 0, { ...calcDef, type: 'calculated', indent: 0, bold: true });
  };
  insertBsCalc('sec_fix_asset', { id:'calc_total_assets', name:'資産合計',       section:'bs_asset',  formula:'sec_cur_asset + sec_fix_asset' });
  insertBsCalc('sec_fix_liab',  { id:'calc_total_liab',   name:'負債合計',       section:'bs_liab',   formula:'sec_cur_liab + sec_fix_liab' });
  insertBsCalc('sec_equity',    { id:'calc_liab_eq',      name:'負債純資産合計', section:'bs_equity', formula:'calc_total_liab + sec_equity' });

  return { dynamicAccounts: accts, rows, unmapped: [], error: null };
}

// ===== ミロク 月次推移財務報告書パーサー =====
// 形式: col0=帳票種別, col1=コード, col2=科目名, col5-16=累計推移/4月〜3月
// 累計値を月次に変換: monthly[0]=cum[0], monthly[i]=cum[i]-cum[i-1]
function parseMirokuMonthlySmart(data, startMonth) {
  const hdrRow = data[0] || [];

  // 累計推移列を検出 (累計推移/4月 等)
  const cumCols = {};
  for (let i = 0; i < hdrRow.length; i++) {
    const s = String(hdrRow[i] || '').trim();
    const m = s.match(/累計推移[\/\/](\d+)月/);
    if (m) cumCols[parseInt(m[1])] = i;
  }
  if (Object.keys(cumCols).length < 6) {
    return { dynamicAccounts: [], rows: {}, unmapped: [], error: '累計推移列を検出できませんでした。' };
  }

  // 予算月順に列インデックス配列を作成
  const budgetCumCols = [];
  for (let i = 0; i < 12; i++) {
    const m = ((startMonth - 1 + i) % 12) + 1;
    budgetCumCols.push(cumCols[m] ?? -1);
  }

  // PL: 累計→月次変換（trailing zeros で負にならないよう保護）
  const deCumulateSafe = cumVals => {
    let lastNz = -1;
    for (let i = cumVals.length - 1; i >= 0; i--) { if (cumVals[i] !== 0) { lastNz = i; break; } }
    return cumVals.map((v, i) => i > lastNz ? 0 : (i === 0 ? v : v - cumVals[i - 1]));
  };
  // BS: 月末残高はそのまま使う（累計ではなく残高）
  const getPlVals = row => deCumulateSafe(budgetCumCols.map(col => col >= 0 ? parseNum(row[col]) : 0));
  const getBsVals = row => budgetCumCols.map(col => col >= 0 ? parseNum(row[col]) : 0);

  // PL セクション情報
  const PL_SECTIONS = {
    sec_revenue:    { name: '売上高',               section: 'pl', sign:  1 },
    sec_cogs:       { name: '売上原価',             section: 'pl', sign: -1 },
    sec_sga:        { name: '販売費及び一般管理費', section: 'pl', sign: -1 },
    sec_non_op_inc: { name: '営業外収益',           section: 'pl', sign:  1 },
    sec_non_op_exp: { name: '営業外費用',           section: 'pl', sign: -1 },
    sec_extra_inc:  { name: '特別利益',             section: 'pl', sign:  1 },
    sec_extra_exp:  { name: '特別損失',             section: 'pl', sign: -1 },
    sec_tax_etc:    { name: '法人税等',             section: 'pl', sign: -1 },
  };

  // PL 【】〔〕マーカー → アクション定義
  const PL_BRACKET_ACTIONS = {
    '【純売上高】':              { nextSection: 'sec_cogs' },
    '【売上原価】':              {},
    '〔売上総利益〕':            { nextSection: 'sec_sga',         calc: { id:'calc_gross',  name:'売上総利益',       formula:'sec_revenue - sec_cogs',                    bold:true } },
    '【販売費及び一般管理費】':  {},
    '〔営業利益〕':              { nextSection: 'sec_non_op_inc',  calc: { id:'calc_op',     name:'営業利益',         formula:'calc_gross - sec_sga',                      bold:true } },
    '【営業外収益】':            { nextSection: 'sec_non_op_exp' },
    '【営業外費用】':            {},
    '〔経常利益〕':              { nextSection: 'sec_extra_inc',   calc: { id:'calc_ord',    name:'経常利益',         formula:'calc_op + sec_non_op_inc - sec_non_op_exp', bold:true } },
    '【特別利益】':              {},
    '【特別損失】':              {},
    '〔税引前当期純利益〕':      { nextSection: 'sec_tax_etc',     calc: { id:'calc_pretax', name:'税引前当期純利益', formula:'calc_ord + sec_extra_inc - sec_extra_exp',  bold:true } },
    '〔当期純利益〕':            {},
    '〔期首繰越利益剰余金〕':    {},
    '〔期末繰越利益剰余金〕':    {},
  };

  // BS メインセクション 【】 → セクションID
  const BS_MAIN_BRACKETS = {
    '【流動資産】':           'sec_cur_asset',
    '【固定資産】':           'sec_fix_asset',
    '【流動負債】':           'sec_cur_liab',
    '【固定負債】':           'sec_fix_liab',
    '【純資産の部】':         'sec_equity',
    '【株主資本】':           'sec_equity',
  };
  const BS_SECTIONS = {
    sec_cur_asset: { name: '流動資産', section: 'bs_asset', sign: 1 },
    sec_fix_asset: { name: '固定資産', section: 'bs_asset', sign: 1 },
    sec_cur_liab:  { name: '流動負債', section: 'bs_liab',  sign: 1 },
    sec_fix_liab:  { name: '固定負債', section: 'bs_liab',  sign: 1 },
    sec_equity:    { name: '純資産',   section: 'bs_equity', sign: 1 },
  };

  const accts = [], rows = {};
  let ctr = 0;
  const mkId = prefix => `${prefix}${++ctr}`;
  const seenSecs = new Set();

  const ensureSection = (secId, sections) => {
    if (seenSecs.has(secId)) return;
    seenSecs.add(secId);
    const info = sections[secId];
    if (info) accts.push({ id: secId, name: info.name, type: 'section', indent: 0, section: info.section, sign: info.sign });
  };

  // PL状態
  let plSection = null;   // 現在のPLセクションID (最初はnull→sec_revenue)
  let plLastParent = null;

  // BS: バッファ方式（セクション確定まで保留）
  let bsPending = [];     // { id, name, indent, parentId, sign, vals }
  let bsLastParent = null;

  for (let ri = 1; ri < data.length; ri++) {
    const row = data[ri];
    if (!row || !row.length) continue;

    const colType = String(row[0] || '').trim();
    const colName = String(row[2] || '').trim().replace(/^"+|"+$/g, '');
    if (!colType || !colName) continue;

    const isIndented = colName.startsWith('　');
    const nameTrim = colName.trim();
    const hasBracket = /^【|^〔/.test(nameTrim);

    if (colType === '損益計算書') {
      if (hasBracket) {
        const action = PL_BRACKET_ACTIONS[nameTrim] || PL_BRACKET_ACTIONS[nameTrim.replace(/\s/g, '')];
        if (action) {
          if (action.calc && !accts.find(a => a.id === action.calc.id)) {
            accts.push({ ...action.calc, type: 'calculated', indent: 0, section: 'pl' });
          }
          if (action.nextSection) {
            plSection = action.nextSection;
            ensureSection(plSection, PL_SECTIONS);
            plLastParent = null;
          }
        }
        continue;
      }

      // 最初のPL行でsec_revenueを作成
      if (plSection === null) {
        plSection = 'sec_revenue';
        ensureSection(plSection, PL_SECTIONS);
      }

      const vals = getPlVals(row);
      if (!vals.some(v => v !== 0)) {
        if (!isIndented) plLastParent = null;
        continue;
      }

      const sInfo = PL_SECTIONS[plSection];
      const aid = mkId('p');
      if (isIndented && plLastParent) {
        accts.push({ id: aid, name: nameTrim, type: 'input', indent: 2, parentId: plLastParent.id, section: sInfo?.section || 'pl', sign: sInfo?.sign ?? 1 });
      } else {
        const a = { id: aid, name: nameTrim, type: 'input', indent: 1, parentId: plSection, section: sInfo?.section || 'pl', sign: sInfo?.sign ?? 1 };
        accts.push(a);
        plLastParent = a;
      }
      rows[aid] = vals;

    } else if (colType === '貸借対照表') {
      if (hasBracket) {
        const bsSecId = BS_MAIN_BRACKETS[nameTrim] || BS_MAIN_BRACKETS[nameTrim.replace(/\s/g, '')];
        if (bsSecId) {
          // バッファをこのセクションに確定
          ensureSection(bsSecId, BS_SECTIONS);
          const sInfo = BS_SECTIONS[bsSecId];
          bsPending.forEach(pa => {
            pa.parentId = pa.parentId || bsSecId;
            pa.section = sInfo?.section;
            accts.push(pa);
          });
          bsPending = [];
          bsLastParent = null;
        }
        // 現金及び預金合計を cashGroup として保存（期首現金自動取得に使用）
        if (nameTrim === '【現金及び預金】' || nameTrim === '【現金・預金】') {
          const cVals = getBsVals(row);
          if (cVals.some(v => v !== 0)) {
            bsPending.push({ id: 'bs_cash_group', name: '現金及び預金', type: 'parent', indent: 1, parentId: null, section: null, sign: 1, cashGroup: true });
            rows['bs_cash_group'] = cVals;
          }
        }
        // すべての【】行をスキップ
        continue;
      }

      const vals = getBsVals(row);
      if (!vals.some(v => v !== 0)) {
        if (!isIndented) bsLastParent = null;
        continue;
      }

      const aid = mkId('b');
      if (isIndented && bsLastParent) {
        const pa = { id: aid, name: nameTrim, type: 'input', indent: 2, parentId: bsLastParent.id, section: null, sign: 1 };
        bsPending.push(pa);
      } else {
        const pa = { id: aid, name: nameTrim, type: 'input', indent: 1, parentId: null, section: null, sign: 1 };
        bsPending.push(pa);
        bsLastParent = pa;
      }
      rows[aid] = vals;
    }
  }

  // post-process: 補助科目を持つ親をtypeをparentに
  const childParents = new Set();
  accts.forEach(a => { if (a.indent === 2) childParents.add(a.parentId); });
  accts.forEach(a => { if (childParents.has(a.id)) a.type = 'parent'; });

  // 当期純利益の計算行を追加
  if (!accts.find(a => a.id === 'calc_net')) {
    const corpTax = accts.find(a => a.type !== 'calculated' && a.name.replace(/\s+/g,'').includes('法人税'));
    const pretaxIdx = accts.findIndex(a => a.id === 'calc_pretax');
    if (pretaxIdx >= 0) {
      const insAfter = corpTax ? accts.findIndex(a => a.id === corpTax.id) : pretaxIdx;
      const formula = corpTax ? `calc_pretax - ${corpTax.id}` : 'calc_pretax';
      accts.splice(insAfter + 1, 0, { id: 'calc_net', name: '当期純利益', type: 'calculated', indent: 0, section: 'pl', bold: true, formula });
    }
  }

  // BS計算行
  const insertBsCalc = (afterSec, calcDef) => {
    if (!seenSecs.has(afterSec) || accts.find(a => a.id === calcDef.id)) return;
    let ins = accts.findIndex(a => a.id === afterSec);
    for (let i = ins + 1; i < accts.length; i++) {
      if (accts[i].type === 'section' || accts[i].type === 'calculated') break;
      ins = i;
    }
    accts.splice(ins + 1, 0, { ...calcDef, type: 'calculated', indent: 0, bold: true });
  };
  insertBsCalc('sec_fix_asset', { id:'calc_total_assets', name:'資産合計',       section:'bs_asset',  formula:'sec_cur_asset + sec_fix_asset' });
  insertBsCalc('sec_fix_liab',  { id:'calc_total_liab',   name:'負債合計',       section:'bs_liab',   formula:'sec_cur_liab + sec_fix_liab' });
  insertBsCalc('sec_equity',    { id:'calc_liab_eq',      name:'負債純資産合計', section:'bs_equity', formula:'calc_total_liab + sec_equity' });

  return { dynamicAccounts: accts, rows, unmapped: [], error: null };
}

// ===== 汎用CSV/Excelパーサー =====
function parseImportData(data, source, startMonth) {
  const result = {};
  const unmapped = [];

  if (source === 'mjs' || source === 'mf') {
    // ミロク 月次推移財務報告書 (帳票種別形式) を自動検出
    const firstCell = String(data[0]?.[0] || '').trim();
    if (firstCell === '帳票種別') {
      return parseMirokuMonthlySmart(data, startMonth);
    }
    return parseMjsMonthlySmart(data, startMonth);
  }

  // 汎用: ヘッダー行を探す
  let headerRowIdx = -1;
  let monthCols = [];
  for (let ri = 0; ri < Math.min(10, data.length); ri++) {
    const mc = detectMonthCol(data[ri]);
    if (mc.length >= 6) {
      headerRowIdx = ri;
      monthCols = mc;
      break;
    }
  }
  if (headerRowIdx < 0 || monthCols.length === 0) {
    return { rows: result, unmapped, error: '月次データの列を検出できませんでした。' };
  }

  // 月→予算インデックスのマッピング
  const budgetMonthMap = new Array(12).fill(-1);
  monthCols.forEach(({ col, month }) => {
    const budgetIdx = (month - (startMonth - 1) + 12) % 12;
    if (budgetIdx < 12) budgetMonthMap[budgetIdx] = col;
  });

  // MF: 科目名はcol0
  const nameCol = 0;

  for (let ri = headerRowIdx + 1; ri < data.length; ri++) {
    const row = data[ri];
    const name = String(row[nameCol] || '').trim().replace(/\s+/g,'');
    if (!name || name === '合計' || name === '計' || name === '小計') continue;

    const accId = matchAccount(name);
    const values = budgetMonthMap.map(col => col >= 0 ? parseNum(row[col]) : 0);
    if (!values.some(v => v !== 0)) continue;

    if (accId) {
      if (!result[accId]) result[accId] = new Array(12).fill(0);
      result[accId] = result[accId].map((v, i) => v + values[i]);
    } else {
      unmapped.push({ name: String(row[nameCol] || '').trim(), values });
    }
  }

  return { rows: result, unmapped, error: null };
}

// ====== レンダリング ======

let _importState = {
  source: 'mjs',
  parsedData: null,
  importResult: null,
  fileName: '',
};

function renderImport(container) {
  const prefs = Object.keys(KENPO_RATES || {});
  container.innerHTML = `
    <div class="sim-panel">
      <div class="flex-between">
        <div>
          <h2 class="section-title">試算表・月次推移表インポート</h2>
          <p class="section-sub">ミロク(MJS)・MoneyForward のCSV/Excelをアップロードして予算データを自動作成します</p>
        </div>
      </div>

      <div class="card-h">
        <div class="source-tabs">
          <div class="source-tab active" data-src="mjs" onclick="setImportSource('mjs',this)">
            ミロク(MJS)財務大将
          </div>
          <div class="source-tab" data-src="mf" onclick="setImportSource('mf',this)">
            MoneyForward
          </div>
          <div class="source-tab" data-src="generic" onclick="setImportSource('generic',this)">
            汎用CSV/Excel
          </div>
        </div>

        <div id="import_source_note" class="text-sm text-muted mt-1" style="margin-bottom:12px">
          財務大将の「月次推移表」→「CSV出力」でエクスポートしたファイルを選択してください。BS（貸借対照表）とPL（損益計算書）の両方をインポートできます。
        </div>

        <div style="display:flex;gap:16px;flex-wrap:wrap">
          <div class="form-group" style="margin:0">
            <label>期首月（決算年度の開始月）</label>
            <select id="import_start_month" class="form-input">
              ${MONTH_NAMES.map((m,i)=>`<option value="${i+1}"${i===3?' selected':''}>${m}始まり</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label>実績確定は何月まで<br><span style="font-size:10px;font-weight:400;color:var(--text-muted)">（それ以降の月の予算データを保持します）</span></label>
            <select id="import_actual_through" class="form-input">
              <option value="-1">実績なし（全月を予算として取込）</option>
              ${MONTH_NAMES.map((m,i)=>`<option value="${i}">${m}まで</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- アップロードゾーン -->
        <div class="upload-zone" id="import_drop_zone"
             onclick="document.getElementById('import_file_input').click()"
             ondragover="event.preventDefault();this.classList.add('drag-over')"
             ondragleave="this.classList.remove('drag-over')"
             ondrop="handleImportDrop(event)">
          <div class="upload-zone-icon">📂</div>
          <h2>ファイルをドロップまたはクリックして選択</h2>
          <p>CSV・Excel(.xlsx/.xls)対応　複数ファイル連続インポート可</p>
          <button class="upload-btn-pill" onclick="event.stopPropagation();document.getElementById('import_file_input').click()">
            ファイルを選択
          </button>
        </div>
        <input type="file" id="import_file_input" accept=".csv,.xlsx,.xls" style="display:none" onchange="handleImportFile(this.files[0])">
      </div>


      <div id="import_preview"></div>

      <div class="card">
        <div class="flex-between" style="margin-bottom:12px">
          <h3 style="margin:0">📁 インポート履歴</h3>
        </div>
        <div id="import_history"></div>
      </div>
    </div>`;
  setTimeout(renderImportHistory, 0);
}

function setImportSource(src, el) {
  _importState.source = src;
  document.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const notes = {
    mjs:     '財務大将の「月次推移表」→「CSV出力」でエクスポートしたファイルを選択してください。BS（貸借対照表）とPL（損益計算書）の両方をインポートできます。',
    mf:      'MoneyForwardの「帳票・数字」→「試算表」→「月次推移」→「CSV」でエクスポートしたファイル。',
    generic: 'CSV/Excelの1行目またはそれ以降に月名（4月、5月…）が含まれていれば自動認識します。',
  };
  document.getElementById('import_source_note').textContent = notes[src] || '';
}

function handleImportDrop(e) {
  e.preventDefault();
  document.getElementById('import_drop_zone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleImportFile(file);
}

// Journal-Checkerと同じ堅牢なエンコーディング自動判定
function decodeBuffer(buf) {
  const head = new Uint8Array(buf, 0, 3);
  // BOM付きUTF-8
  if (head[0] === 0xEF && head[1] === 0xBB && head[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(buf);
  }
  // UTF-8として厳密にデコード試行、失敗したらShift-JIS（ミロクはShift-JIS）
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch (_) {
    return new TextDecoder('shift_jis').decode(buf);
  }
  // 文字化けチェック（置換文字が混じっていたらShift-JISで読み直す）
  if (text.includes('�')) {
    try { return new TextDecoder('shift_jis').decode(buf); } catch (_) {}
  }
  return text;
}

function handleImportFile(file) {
  if (!file) return;
  _importState.fileName = file.name;
  const ext = file.name.split('.').pop().toLowerCase();

  const reader = new FileReader();
  if (ext === 'csv') {
    reader.onload = e => {
      const text = decodeBuffer(e.target.result);
      const data = parseCSV(text);
      _importState.parsedData = data;
      runImportPreview();
    };
    reader.readAsArrayBuffer(file); // ArrayBufferで読んでから自前デコード
  } else {
    reader.onload = e => {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      _importState.parsedData = data;
      runImportPreview();
    };
    reader.readAsArrayBuffer(file);
  }
}

function parseCSV(text) {
  // BOMを除去
  const cleaned = text.startsWith('﻿') ? text.slice(1) : text;
  const lines = cleaned.split(/\r?\n/);
  return lines.map(line => {
    const cells = [];
    let inQuote = false, cur = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQuote = !inQuote; }
      else if (c === ',' && !inQuote) { cells.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
    cells.push(cur.trim());
    return cells;
  });
}

function runImportPreview() {
  if (!_importState.parsedData) return;
  const startMonth = parseInt(document.getElementById('import_start_month')?.value || 4);

  let result;
  if (isJournalFormat(_importState.parsedData)) {
    result = parseJournalData(_importState.parsedData, startMonth);
    _importState.detectedFormat = '仕訳帳';
  } else {
    result = parseImportData(_importState.parsedData, _importState.source, startMonth);
    _importState.detectedFormat = '月次推移表';
  }
  _importState.importResult = { ...result, startMonth };

  const el = document.getElementById('import_preview');
  if (!el) return;

  const mappedCount  = result.dynamicAccounts
    ? result.dynamicAccounts.filter(a => a.type === 'input').length
    : Object.keys(result.rows).length;
  const unmappedCount = result.unmapped.length;

  if (result.error) {
    el.innerHTML = `<div class="card" style="color:var(--danger);padding:16px">${result.error}</div>`;
    return;
  }

  // 動的科目プレビュー（動的インポートの場合）
  let mappedRows = '', unmappedRows = '';
  if (result.dynamicAccounts && result.dynamicAccounts.length > 0) {
    const allVals = calcAllValuesDynamic({ dynamicAccounts: result.dynamicAccounts, rows: result.rows });
    mappedRows = result.dynamicAccounts.map(acc => {
      const vals = allVals[acc.id] || new Array(12).fill(0);
      const total = vals.reduce((s,v)=>s+v,0);
      const indent = '　'.repeat(acc.indent || 0);
      if (acc.type === 'section') {
        return `<tr class="preview-section-row"><td colspan="14" style="padding:6px 8px;font-weight:700;background:var(--gray-100);border-top:2px solid var(--gray-300)">${escHtml(acc.name)}</td></tr>`;
      }
      const isInput = acc.type === 'input';
      const isCalc  = acc.type === 'calculated';
      const isParent = acc.type === 'parent';
      const style = isCalc  ? 'background:var(--blue-50,#eff6ff);font-weight:600' :
                    isParent? 'background:var(--gray-50);font-weight:600' : '';
      return `<tr${style ? ` style="${style}"` : ''}>
        <td style="padding-left:${(acc.indent||0)*16+4}px">${escHtml(acc.name)}</td>
        <td class="num">${vals.map(v=>v?fmtK(v):'-').join('</td><td class="num">')}</td>
        <td class="num" style="text-align:right">${total?fmtK(total):'-'}</td>
      </tr>`;
    }).join('');
  } else {
    // 旧来のマッピングベースプレビュー（汎用・仕訳帳）
    mappedRows = ACCOUNTS
      .filter(a => a.type === 'input' && result.rows[a.id])
      .map(a => {
        const vals = result.rows[a.id];
        const total = vals.reduce((s,v)=>s+v,0);
        return `<tr>
          <td>${escHtml(a.name)}</td>
          <td class="num">${vals.map(v=>v?fmtK(v):'-').join('</td><td class="num">')}</td>
          <td class="num">${fmtK(total)}</td>
        </tr>`;
      }).join('');
    unmappedRows = result.unmapped.slice(0, 20).map(u => `
      <tr>
        <td class="text-muted">${escHtml(u.name)}</td>
        <td colspan="13" class="text-muted text-sm">← マッピング不可</td>
      </tr>`).join('');
  }

  const months = getMonthLabels(startMonth);

  el.innerHTML = `
    <div class="card-h">
      <div class="flex-between" style="margin-bottom:14px">
        <h3>📋 インポートプレビュー：${_importState.fileName} <span class="tag tag-indigo" style="font-size:10px;margin-left:6px">${_importState.detectedFormat || ''}</span></h3>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="tag tag-green">認識済み ${mappedCount}科目</span>
          ${unmappedCount ? `<span class="tag tag-orange">未マッピング ${unmappedCount}科目</span>` : ''}
        </div>
      </div>

      <div class="table-scroll">
        <table class="result-table">
          <thead>
            <tr>
              <th style="min-width:150px">科目名</th>
              ${months.map(m=>`<th style="min-width:60px">${m}</th>`).join('')}
              <th>合計</th>
            </tr>
          </thead>
          <tbody>${mappedRows}${unmappedRows}</tbody>
        </table>
      </div>
      <div class="wf-note">単位：千円</div>

      <div class="import-actions">
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--gray-600)">インポート先年度：</label>
          <select id="import_target_year" class="form-input" style="width:120px;display:inline-block">
            ${getImportYearOptions()}
          </select>
        </div>
        <button class="btn-solid" onclick="executeImport()">この内容でインポート</button>
        <button class="btn-outline" onclick="document.getElementById('import_file_input').click()">別のファイル</button>
      </div>

      ${unmappedCount ? `
        <div class="mt-3">
          <details>
            <summary style="cursor:pointer;font-size:12px;color:var(--gray-500);font-weight:600">
              未マッピング科目（${unmappedCount}件）の詳細
            </summary>
            <ul style="margin-top:8px;padding-left:20px;font-size:11px;color:var(--gray-400);line-height:2">
              ${result.unmapped.map(u=>`<li>${u.name}（合計：${fmtK(u.values.reduce((a,b)=>a+b,0))}千円）</li>`).join('')}
            </ul>
          </details>
        </div>` : ''}
    </div>`;
}

function getImportYearOptions() {
  const cur = new Date().getFullYear();
  return [cur, cur-1, cur-2, cur-3].map(y =>
    `<option value="${y}">${y}年度</option>`
  ).join('');
}

function executeImport() {
  const result = _importState.importResult;
  if (!result || result.error) return;

  const company = window.App?.currentCompany;
  if (!company) { alert('会社を選択してください'); return; }

  const year      = parseInt(document.getElementById('import_target_year')?.value || new Date().getFullYear());
  const startMonth = result.startMonth || 4;

  // 実績確定月（暦月インデックス 0-11、-1=なし）
  const throughCalIdx = parseInt(document.getElementById('import_actual_through')?.value ?? -1);
  // 会計年度インデックスに変換（4月始まりなら4月=0, 5月=1, ...）
  const throughFiscalIdx = throughCalIdx < 0 ? -1
    : ((throughCalIdx - (startMonth - 1) + 12) % 12);

  let budget = getBudget(company.id, year);
  if (!budget) budget = createDefaultBudget(company.id, year);
  if (!budget.rows)       budget.rows = {};
  if (!budget.actualRows) budget.actualRows = {};

  // actualCols を設定（実績確定月まで true）
  if (throughFiscalIdx >= 0) {
    budget.actualCols = Array.from({length: 12}, function(_, i) { return i <= throughFiscalIdx; });
    budget.actualThrough = throughFiscalIdx;
  }
  // throughFiscalIdx == -1 のとき: 全月予算として取込（actualCols・actualThrough はそのまま）

  // 科目データをマージ
  Object.entries(result.rows).forEach(function([id, vals]) {
    if (!Array.isArray(vals)) return;
    if (throughFiscalIdx >= 0) {
      // 実績月 → actualRows に上書き、budget.rows は更新しない（既存予算を保持）
      if (!budget.actualRows[id]) budget.actualRows[id] = new Array(13).fill(0);
      vals.forEach(function(v, i) {
        if (i < 12 && i <= throughFiscalIdx) budget.actualRows[id][i] = v;
      });
    } else {
      // 実績なし → 全月を budget.rows に上書き（初回インポートや予算取込）
      if (!budget.rows[id]) budget.rows[id] = new Array(13).fill(0);
      vals.forEach(function(v, i) {
        if (i < 12) budget.rows[id][i] = v;
      });
    }
  });

  budget.startMonth = startMonth;

  // 動的科目リストをマージ保存
  if (result.dynamicAccounts && result.dynamicAccounts.length > 0) {
    const isPL = result.dynamicAccounts.some(function(a) { return a.section === 'pl'; });
    const isBS = result.dynamicAccounts.some(function(a) { return a.section?.startsWith('bs'); });
    if (!budget.dynamicAccounts) {
      budget.dynamicAccounts = result.dynamicAccounts;
    } else {
      if (isPL) budget.dynamicAccounts = budget.dynamicAccounts.filter(function(a) { return a.section !== 'pl'; });
      if (isBS) budget.dynamicAccounts = budget.dynamicAccounts.filter(function(a) { return !a.section?.startsWith('bs'); });
      budget.dynamicAccounts = [...budget.dynamicAccounts, ...result.dynamicAccounts];
    }
    budget.dynamicAccountsFromImport = true;
  }

  saveBudget(budget);

  if (year === window.App.currentYear) {
    window.App.currentBudget = budget;
    renderYearSelect(getYearsForCompany(company.id));
  }

  const mapped = Object.keys(result.rows).length;
  saveImportHistory({
    id: generateId(),
    companyId: company.id,
    fileName: _importState.fileName,
    format: _importState.detectedFormat || '月次推移表',
    source: _importState.source,
    year,
    startMonth,
    mappedCount: mapped,
    unmappedCount: result.unmapped.length,
    importedAt: Date.now(),
  });

  const actLabel = throughFiscalIdx >= 0
    ? MONTH_NAMES[throughCalIdx] + 'まで実績確定（' + (throughFiscalIdx + 1) + 'か月）'
    : '全月予算として取込';

  const el = document.getElementById('import_preview');
  if (el) {
    el.insertAdjacentHTML('afterbegin', `
      <div class="card" style="background:#f0fdf4;border-color:#6ee7b7;margin-bottom:12px;padding:14px 18px">
        <strong style="color:#065f46">✅ インポート完了</strong>
        <span style="font-size:12px;color:#065f46;margin-left:10px">
          ${year}年度 ${mapped}科目 をインポートしました。${actLabel}
        </span>
        <button class="btn-outline" style="margin-left:16px;font-size:12px"
          onclick="window.App.currentYear=${year};loadBudget('${company.id}',${year});showPage('budget')">
          月次予算を確認する →
        </button>
      </div>`);
  }

  renderImportHistory();
}

function renderImportHistory() {
  const el = document.getElementById('import_history');
  if (!el) return;
  const company = window.App?.currentCompany;
  if (!company) { el.innerHTML = ''; return; }

  const history = getImportHistory(company.id);
  if (!history.length) {
    el.innerHTML = `<p class="text-muted text-sm" style="padding:8px 0">まだインポート履歴がありません</p>`;
    return;
  }

  const sourceLabel = { mjs: 'MJS', mf: 'MoneyForward', generic: '汎用' };
  const rows = history.map(h => {
    const dt = new Date(h.importedAt);
    const dateStr = `${dt.getFullYear()}/${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    return `
    <tr>
      <td>${dateStr}</td>
      <td><span class="tag tag-indigo">${escHtml(h.format)}</span></td>
      <td><span class="tag tag-green">${sourceLabel[h.source] || h.source}</span></td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(h.fileName)}">${escHtml(h.fileName)}</td>
      <td>${h.year}年度</td>
      <td>${h.mappedCount}科目</td>
      <td style="color:var(--text-muted)">${h.unmappedCount ? h.unmappedCount + '科目未対応' : '−'}</td>
      <td>
        <button class="btn-xs btn-danger btn-ghost" onclick="deleteImportHistory('${h.id}');renderImportHistory()">削除</button>
      </td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <table class="result-table" style="font-size:11.5px">
      <thead>
        <tr>
          <th>日時</th><th>種別</th><th>ソース</th><th>ファイル名</th><th>対象年度</th><th>取込科目</th><th>未対応</th><th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}
