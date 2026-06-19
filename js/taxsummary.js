// 税金一覧表（納付税額確認書）

const TAXSUM_KEY = 'taxsummary_v1';

function loadTaxSummaryData(companyId, year) {
  const all = JSON.parse(localStorage.getItem(TAXSUM_KEY) || '{}');
  return all[`${companyId}_${year}`] || {};
}

function saveTaxSummaryData(companyId, year, data) {
  const all = JSON.parse(localStorage.getItem(TAXSUM_KEY) || '{}');
  all[`${companyId}_${year}`] = data;
  localStorage.setItem(TAXSUM_KEY, JSON.stringify(all));
}

// 月計算ヘルパー（1-12の範囲に正規化）
function addMonth(base, add) {
  return ((base - 1 + add) % 12) + 1;
}

// ===== 納付スケジュール（決算月から自動計算） =====
function calcPaySchedule(fiscal, ctaxTimes) {
  return {
    // 確定申告期限
    finalMonth: addMonth(fiscal, 2),
    // 法人税中間（年1回・決算月から8か月後）
    corpInterimMonth: addMonth(fiscal, 8),
    // 消費税中間
    ctaxInterimMonths:
      ctaxTimes === 1  ? [addMonth(fiscal, 8)] :
      ctaxTimes === 3  ? [addMonth(fiscal, 5), addMonth(fiscal, 8), addMonth(fiscal, 11)] :
      ctaxTimes === 11 ? Array.from({length:11}, (_, i) => addMonth(fiscal, 3 + i)) : [],
  };
}

// ===== 中間納税の自動計算（前期データから） =====
function calcInterimTax(prevBudget, prevCompany) {
  if (!prevBudget) return null;

  const capital = prevCompany?.capital || 10_000_000;

  let prevPretax = 0;
  if (prevBudget.dynamicAccounts) {
    const av = calcAllValuesDynamic(prevBudget);
    prevPretax = (av['calc_pretax'] || []).reduce((a, v) => a + v, 0);
  } else {
    const pl = calcPL(prevBudget.rows);
    prevPretax = (pl.pretax_profit || []).reduce((a, v) => a + v, 0);
  }

  const prevTax = prevPretax > 0 ? calcAllTax(prevPretax, capital) : null;

  // 法人税中間 = 前期÷2（10万超のみ）★1回
  const corpInterim      = prevTax && prevTax.corp >= 100_000 ? Math.floor(prevTax.corp / 2 / 100) * 100 : 0;
  const localCorpInterim = prevTax && prevTax.localCorp >= 10_000 ? Math.floor(prevTax.localCorp / 2 / 100) * 100 : 0;

  const prefKatsuInterim  = corpInterim ? Math.floor(corpInterim * 0.032 / 100) * 100 : 0;
  const prefKintouInterim = prevTax ? Math.floor((prevTax.corp * 0.032 + 20_000) / 2 / 100) * 100 : 0;
  const businessInterim   = prevTax && prevTax.business >= 100_000 ? Math.floor(prevTax.business / 2 / 100) * 100 : 0;
  const specialInterim    = prevTax && prevTax.special >= 100_000  ? Math.floor(prevTax.special  / 2 / 100) * 100 : 0;
  const cityKatsuInterim  = corpInterim ? Math.floor(corpInterim * 0.096 / 100) * 100 : 0;
  const cityKintouInterim = prevTax ? Math.floor((prevTax.corp * 0.096 + 50_000) / 2 / 100) * 100 : 0;

  // 消費税中間（前期消費税額で回数が変わる）★1/3/11回
  let ctaxPerPayment = 0, ctaxTimes = 0, localCtaxPerPayment = 0;
  const prevCtaxEst = (typeof calcCtaxEstimate === 'function') ? calcCtaxEstimate(prevBudget, prevCompany) : null;
  if (prevCtaxEst && !prevCtaxEst.exempt && !prevCtaxEst.noData) {
    const prevCtax      = Math.round(prevCtaxEst.ctax);
    const prevLocalCtax = Math.round(prevCtax * 22 / 78);
    if (prevCtax <= 480_000) {
      ctaxTimes = 0;
    } else if (prevCtax <= 4_000_000) {
      ctaxTimes = 1;
      ctaxPerPayment      = Math.floor(prevCtax / 2 / 100) * 100;
      localCtaxPerPayment = Math.floor(prevLocalCtax / 2 / 100) * 100;
    } else if (prevCtax <= 48_000_000) {
      ctaxTimes = 3;
      ctaxPerPayment      = Math.floor(prevCtax / 4 / 100) * 100;
      localCtaxPerPayment = Math.floor(prevLocalCtax / 4 / 100) * 100;
    } else {
      ctaxTimes = 11;
      ctaxPerPayment      = Math.floor(prevCtax / 12 / 100) * 100;
      localCtaxPerPayment = Math.floor(prevLocalCtax / 12 / 100) * 100;
    }
  }

  return {
    corp: corpInterim, localCorp: localCorpInterim,
    prefKatsu: prefKatsuInterim, prefKintou: prefKintouInterim,
    business: businessInterim, special: specialInterim,
    cityKatsu: cityKatsuInterim, cityKintou: cityKintouInterim,
    // 消費税: 1回あたりの金額 × 回数
    ctaxPerPayment, localCtaxPerPayment, ctaxTimes,
    ctaxTotal:      ctaxPerPayment * ctaxTimes,
    localCtaxTotal: localCtaxPerPayment * ctaxTimes,
  };
}

function renderTaxSummary(container) {
  const company = window.App?.currentCompany;
  const budget  = window.App?.currentBudget;
  const curYear = window.App?.currentYear || new Date().getFullYear();

  if (!company) {
    container.innerHTML = '<div class="no-data">会社を選択してください</div>';
    return;
  }

  const prevBudget = getBudget(company.id, curYear - 1);
  const interim    = calcInterimTax(prevBudget, company);
  const saved      = loadTaxSummaryData(company.id, curYear);
  const fiscal     = company.fiscalMonth || 3;

  const sched = calcPaySchedule(fiscal, interim?.ctaxTimes || 0);

  const fmtN   = v => v ? Math.round(v).toLocaleString('ja-JP') : '—';
  const fmtInp = (key, placeholder) => {
    const val = saved[key] || '';
    return `<input type="number" class="taxsum-input" id="tsi_${key}" value="${val}" placeholder="${placeholder || '入力'}"
      oninput="updateTaxSum('${key}', this.value)">`;
  };
  const calcNext = (annual, divN) =>
    annual >= 100_000 ? Math.floor(annual / divN / 100) * 100 : 0;
  const fmtDiff = (annual, interim) => {
    if (!annual) return '—';
    const d = annual - interim;
    const cls = d < 0 ? 'taxsum-refund' : 'taxsum-pay';
    return `<span class="${cls}">${d < 0 ? '△' : ''}${Math.abs(d).toLocaleString('ja-JP')}</span>`;
  };

  // 行生成（法人税系・消費税共通）
  // divN: 翌期予定の除数（法人税=2, 消費税1回=2, 3回=4, 11回=12）
  const row = (label, annKey, intKey, divN, indent) => {
    const annual  = parseFloat(saved[annKey]) || 0;
    const interim = parseFloat(saved[intKey]) || 0;
    const next    = calcNext(annual, divN);
    const cls = indent ? 'taxsum-indent' : '';
    return `<tr class="${cls}">
      <td class="taxsum-label">${label}</td>
      <td>${fmtInp(annKey, 'ミロクより')}</td>
      <td>${fmtInp(intKey, '0')}</td>
      <td class="taxsum-num" id="tsd_${annKey}">${fmtDiff(annual, interim)}</td>
      <td class="taxsum-num" id="tsn_${annKey}">${next > 0 ? fmtN(next) : '—'}</td>
    </tr>`;
  };

  const sepRow = label => `<tr class="taxsum-sep"><td colspan="5">${label}</td></tr>`;

  // 消費税の納付月ラベル
  const ctaxMonthLabel = sched.ctaxInterimMonths.map(m => m + '月').join('･');
  const ctaxDivN = interim?.ctaxTimes === 11 ? 12 : interim?.ctaxTimes === 3 ? 4 : 2;

  // 合計
  const annKeys = ['corp','localCorp','prefKatsu','prefKintou','business','special','cityKatsu','cityKintou','ctax','localCtax'];
  const intKeys = annKeys.map(k => 'i_' + k);
  const totalAnnual  = annKeys.reduce((a, k) => a + (parseFloat(saved[k]) || 0), 0);
  const totalInterim = intKeys.reduce((a, k) => a + (parseFloat(saved[k]) || 0), 0);
  const totalDiff = totalAnnual > 0 ? totalAnnual - totalInterim : null;

  // 事業年度テキスト
  const fyStart = addMonth(fiscal, 1);
  const reiwaYear = curYear - 2018;

  container.innerHTML = `
    <div class="taxsum-wrap">
      <div class="taxsum-title">📑 納付税額確認書</div>
      <div class="taxsum-sub">
        ${escHtml(company.name)} ／
        令和${reiwaYear - 1}年${fyStart}月〜令和${reiwaYear}年${fiscal}月 ／
        <strong style="color:#dc2626">確定申告期限：${sched.finalMonth}月末</strong>
      </div>

      <div class="taxsum-info-bar">
        <span>資本金：${fmtN(company.capital)}円</span>
        <span>決算月：${fiscal}月</span>
        ${interim?.ctaxTimes > 0 ? `<span style="color:#2563eb;font-weight:700">消費税中間：年${interim.ctaxTimes}回（${ctaxMonthLabel}）</span>` : ''}
      </div>

      <div class="taxsum-section">
        <div class="taxsum-section-title">年間税額・予定中間納付を入力（ミロク確定値） ／ 翌期予定は自動計算</div>
        <table class="taxsum-table">
          <thead>
            <tr>
              <th class="taxsum-label-col">税　目</th>
              <th>年間税額<br><span style="font-weight:400;font-size:10px">ミロクより入力</span></th>
              <th>予定・中間納付<br><span style="font-weight:400;font-size:10px">直接入力</span></th>
              <th>差引納付額<br><span style="font-weight:400;font-size:10px">自動計算</span></th>
              <th>翌期予定<br><span style="font-weight:400;font-size:10px">自動計算</span></th>
            </tr>
          </thead>
          <tbody>
            ${sepRow(`■ 法人税・地方法人税　　中間申告：${sched.corpInterimMonth}月（年1回）`)}
            ${row('法人税',           'corp',      'i_corp',      2, false)}
            ${row('地方法人税',       'localCorp', 'i_localCorp', 2, true)}
            ${sepRow(`■ 都道府県民税・事業税　中間申告：${sched.corpInterimMonth}月（年1回）`)}
            ${row('都道府県民税 法人税割', 'prefKatsu',  'i_prefKatsu',  2, false)}
            ${row('都道府県民税 均等割',   'prefKintou', 'i_prefKintou', 2, true)}
            ${row('事業税（所得割）',       'business',   'i_business',   2, false)}
            ${row('特別法人事業税',         'special',    'i_special',    2, true)}
            ${sepRow(`■ 市町村民税　　中間申告：${sched.corpInterimMonth}月（年1回）`)}
            ${row('市町村民税 法人税割', 'cityKatsu',  'i_cityKatsu',  2, false)}
            ${row('市町村民税 均等割',   'cityKintou', 'i_cityKintou', 2, true)}
            ${sepRow(`■ 消費税　　中間申告：${interim?.ctaxTimes > 0 ? `年${interim.ctaxTimes}回（${ctaxMonthLabel}）` : '中間なし（前期48万以下）'}`)}
            ${row('消費税',     'ctax',     'i_ctax',     ctaxDivN, false)}
            ${row('地方消費税', 'localCtax', 'i_localCtax', ctaxDivN, true)}
            <tr class="taxsum-total">
              <td class="taxsum-label">合　計</td>
              <td class="taxsum-num" id="tst_annual">${fmtN(totalAnnual)}</td>
              <td class="taxsum-num" id="tst_interim">${fmtN(totalInterim)}</td>
              <td class="taxsum-num" id="tst_diff">${totalDiff !== null
                ? `<span class="${totalDiff < 0 ? 'taxsum-refund' : 'taxsum-pay'}">${totalDiff < 0 ? '△' : ''}${Math.abs(totalDiff).toLocaleString('ja-JP')}</span>`
                : '—'}</td>
              <td class="taxsum-num">—</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style="text-align:right;margin-top:8px">
        <button class="btn-solid" onclick="exportTaxSummaryPDF()">📄 PDF出力</button>
      </div>
    </div>`;
}

function updateTaxSum(key, value) {
  const company = window.App?.currentCompany;
  const curYear = window.App?.currentYear;
  if (!company) return;
  const saved = loadTaxSummaryData(company.id, curYear);
  saved[key] = parseFloat(value) || 0;
  saveTaxSummaryData(company.id, curYear, saved);
  rerenderTaxSumCalc(saved);
}

function rerenderTaxSumCalc(saved) {
  const company = window.App?.currentCompany;
  const curYear = window.App?.currentYear;
  const prevBudget = getBudget(company?.id, curYear - 1);
  const interim = calcInterimTax(prevBudget, company);
  const ctaxDivN = interim?.ctaxTimes === 11 ? 12 : interim?.ctaxTimes === 3 ? 4 : 2;

  const annKeys = ['corp','localCorp','prefKatsu','prefKintou','business','special','cityKatsu','cityKintou','ctax','localCtax'];
  const divNMap = { ctax: ctaxDivN, localCtax: ctaxDivN };

  let totalAnnual = 0, totalInterim = 0;

  annKeys.forEach(k => {
    const annual  = parseFloat(saved[k]) || 0;
    const interimV = parseFloat(saved['i_' + k]) || 0;
    totalAnnual  += annual;
    totalInterim += interimV;

    // 差引納付額
    const diffEl = document.getElementById(`tsd_${k}`);
    if (diffEl) {
      if (annual > 0) {
        const d = annual - interimV;
        const cls = d < 0 ? 'taxsum-refund' : 'taxsum-pay';
        diffEl.innerHTML = `<span class="${cls}">${d < 0 ? '△' : ''}${Math.abs(d).toLocaleString('ja-JP')}</span>`;
      } else {
        diffEl.innerHTML = '—';
      }
    }

    // 翌期予定
    const nextEl = document.getElementById(`tsn_${k}`);
    if (nextEl) {
      const divN = divNMap[k] || 2;
      const next = annual >= 100_000 ? Math.floor(annual / divN / 100) * 100 : 0;
      nextEl.textContent = next > 0 ? next.toLocaleString('ja-JP') : '—';
    }
  });

  // 合計行
  const totalDiff = totalAnnual > 0 ? totalAnnual - totalInterim : null;
  const elA = document.getElementById('tst_annual');
  const elI = document.getElementById('tst_interim');
  const elD = document.getElementById('tst_diff');
  if (elA) elA.textContent = totalAnnual ? totalAnnual.toLocaleString('ja-JP') : '—';
  if (elI) elI.textContent = totalInterim ? totalInterim.toLocaleString('ja-JP') : '—';
  if (elD) {
    elD.innerHTML = totalDiff !== null
      ? `<span class="${totalDiff < 0 ? 'taxsum-refund' : 'taxsum-pay'}">${totalDiff < 0 ? '△' : ''}${Math.abs(totalDiff).toLocaleString('ja-JP')}</span>`
      : '—';
  }
}

function exportTaxSummaryPDF() {
  alert('PDF出力は準備中です');
}
