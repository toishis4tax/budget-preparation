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
  const fmtInp = (key) => {
    const val = saved[key] || '';
    return `<input type="number" class="taxsum-input" id="tsi_${key}" value="${val}" placeholder="ミロクより"
      oninput="updateTaxSum('${key}', this.value)">`;
  };

  // 行生成（法人税系 1回）
  const row1 = (label, key, interimVal, interimMonthLabel, indent) => {
    const annual = parseFloat(saved[key]) || 0;
    const diff   = annual > 0 ? annual - interimVal : null;
    const next   = annual >= 100_000 ? Math.floor(annual / 2 / 100) * 100 : 0;
    const diffCls = diff !== null ? (diff < 0 ? 'taxsum-refund' : 'taxsum-pay') : '';
    const cls = indent ? 'taxsum-indent' : '';
    return `<tr class="${cls}">
      <td class="taxsum-label">${label}</td>
      <td>${fmtInp(key)}</td>
      <td class="taxsum-num">${interimVal ? fmtN(interimVal) + '<br><span class="taxsum-schedule">1回 ･ ' + interimMonthLabel + '</span>' : '—'}</td>
      <td class="taxsum-num ${diffCls}">${diff !== null ? (diff < 0 ? '△' : '') + Math.abs(diff).toLocaleString('ja-JP') : '—'}</td>
      <td class="taxsum-num">${next > 0 ? fmtN(next) : '—'}</td>
    </tr>`;
  };

  // 消費税行（N回）
  const rowCtax = (label, key, perPayment, times, monthLabels, indent) => {
    const annual  = parseFloat(saved[key]) || 0;
    const totalInterim = perPayment * times;
    const diff    = annual > 0 ? annual - totalInterim : null;
    const diffCls = diff !== null ? (diff < 0 ? 'taxsum-refund' : 'taxsum-pay') : '';
    const cls = indent ? 'taxsum-indent' : '';
    const schedHtml = times > 0
      ? `<br><span class="taxsum-schedule">${times}回 ･ ${fmtN(perPayment)}/回<br>${monthLabels}</span>`
      : '<br><span class="taxsum-schedule">中間納付なし</span>';
    return `<tr class="${cls}">
      <td class="taxsum-label">${label}</td>
      <td>${fmtInp(key)}</td>
      <td class="taxsum-num">${times > 0 ? fmtN(totalInterim) + schedHtml : '—'}</td>
      <td class="taxsum-num ${diffCls}">${diff !== null ? (diff < 0 ? '△' : '') + Math.abs(diff).toLocaleString('ja-JP') : '—'}</td>
      <td class="taxsum-num">${annual >= 100_000 ? fmtN(Math.floor(annual / (times > 0 ? (times === 1 ? 2 : times === 3 ? 4 : 12) : 2) / 100) * 100) : '—'}</td>
    </tr>`;
  };

  const sepRow = label => `<tr class="taxsum-sep"><td colspan="5">${label}</td></tr>`;

  // 消費税の納付月ラベル
  const ctaxMonthLabel = sched.ctaxInterimMonths.map(m => m + '月').join('･');

  // 合計
  const keys = ['corp','localCorp','prefKatsu','prefKintou','business','special','cityKatsu','cityKintou','ctax','localCtax'];
  const totalAnnual   = keys.reduce((a, k) => a + (parseFloat(saved[k]) || 0), 0);
  const totalInterim  = interim
    ? interim.corp + interim.localCorp + interim.prefKatsu + interim.prefKintou +
      interim.business + interim.special + interim.cityKatsu + interim.cityKintou +
      interim.ctaxTotal + interim.localCtaxTotal
    : 0;
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
        <span>前期データ：${prevBudget ? '✅ あり（中間を自動計算）' : '⚠️ なし（要手入力）'}</span>
        ${interim?.ctaxTimes > 0 ? `<span style="color:#2563eb;font-weight:700">消費税中間：年${interim.ctaxTimes}回（${ctaxMonthLabel}）</span>` : ''}
      </div>

      <div class="taxsum-section">
        <div class="taxsum-section-title">年間税額を入力（ミロク確定値） ／ 中間納付は前期データから自動計算</div>
        <table class="taxsum-table">
          <thead>
            <tr>
              <th class="taxsum-label-col">税　目</th>
              <th>年間税額<br><span style="font-weight:400;font-size:10px">ミロクより入力</span></th>
              <th>予定・中間納付<br><span style="font-weight:400;font-size:10px">回数・納付月・自動計算</span></th>
              <th>差引納付額<br><span style="font-weight:400;font-size:10px">自動計算</span></th>
              <th>翌期予定<br><span style="font-weight:400;font-size:10px">参考</span></th>
            </tr>
          </thead>
          <tbody>
            ${sepRow(`■ 法人税・地方法人税　　中間申告：${sched.corpInterimMonth}月（年1回）`)}
            ${row1('法人税',     'corp',     interim?.corp      || 0, sched.corpInterimMonth + '月', false)}
            ${row1('地方法人税', 'localCorp',interim?.localCorp || 0, sched.corpInterimMonth + '月', true)}
            ${sepRow(`■ 都道府県民税・事業税　中間申告：${sched.corpInterimMonth}月（年1回）`)}
            ${row1('都道府県民税 法人税割', 'prefKatsu',  interim?.prefKatsu  || 0, sched.corpInterimMonth + '月', false)}
            ${row1('都道府県民税 均等割',   'prefKintou', interim?.prefKintou || 0, sched.corpInterimMonth + '月', true)}
            ${row1('事業税（所得割）',       'business',   interim?.business   || 0, sched.corpInterimMonth + '月', false)}
            ${row1('特別法人事業税',         'special',    interim?.special    || 0, sched.corpInterimMonth + '月', true)}
            ${sepRow(`■ 市町村民税　　中間申告：${sched.corpInterimMonth}月（年1回）`)}
            ${row1('市町村民税 法人税割', 'cityKatsu',  interim?.cityKatsu  || 0, sched.corpInterimMonth + '月', false)}
            ${row1('市町村民税 均等割',   'cityKintou', interim?.cityKintou || 0, sched.corpInterimMonth + '月', true)}
            ${sepRow(`■ 消費税　　中間申告：${interim?.ctaxTimes > 0 ? `年${interim.ctaxTimes}回（${ctaxMonthLabel}）` : '中間なし（前期48万以下）'}`)}
            ${rowCtax('消費税',     'ctax',     interim?.ctaxPerPayment      || 0, interim?.ctaxTimes || 0, ctaxMonthLabel, false)}
            ${rowCtax('地方消費税', 'localCtax', interim?.localCtaxPerPayment || 0, interim?.ctaxTimes || 0, ctaxMonthLabel, true)}
            <tr class="taxsum-total">
              <td class="taxsum-label">合　計</td>
              <td class="taxsum-num">${fmtN(totalAnnual)}</td>
              <td class="taxsum-num">${fmtN(totalInterim)}</td>
              <td class="taxsum-num ${totalDiff !== null ? (totalDiff < 0 ? 'taxsum-refund' : 'taxsum-pay') : ''}">
                ${totalDiff !== null ? (totalDiff < 0 ? '△' : '') + Math.abs(totalDiff).toLocaleString('ja-JP') : '—'}
              </td>
              <td class="taxsum-num">—</td>
            </tr>
          </tbody>
        </table>
      </div>

      ${!prevBudget ? `<div class="taxsum-warn">⚠️ 前期データがないため中間納税額を自動計算できません。前期の推移表をインポートしてください。</div>` : ''}
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
  const company    = window.App?.currentCompany;
  const curYear    = window.App?.currentYear;
  const prevBudget = getBudget(company?.id, curYear - 1);
  const interim    = calcInterimTax(prevBudget, company);

  const entries = {
    corp:      interim?.corp      || 0,
    localCorp: interim?.localCorp || 0,
    prefKatsu: interim?.prefKatsu || 0,
    prefKintou:interim?.prefKintou|| 0,
    business:  interim?.business  || 0,
    special:   interim?.special   || 0,
    cityKatsu: interim?.cityKatsu || 0,
    cityKintou:interim?.cityKintou|| 0,
    ctax:      interim?.ctaxTotal || 0,
    localCtax: interim?.localCtaxTotal || 0,
  };

  let totalAnnual = 0, totalInterim = 0;
  Object.keys(entries).forEach(k => {
    const annual      = parseFloat(saved[k]) || 0;
    const interimVal  = entries[k];
    totalAnnual  += annual;
    totalInterim += interimVal;

    const inp = document.getElementById(`tsi_${k}`);
    if (!inp) return;
    const tr  = inp.closest('tr');
    if (!tr) return;
    const tds = tr.querySelectorAll('td');
    if (tds.length < 4) return;

    const diff = annual > 0 ? annual - interimVal : null;
    tds[3].textContent = diff !== null
      ? (diff < 0 ? '△' : '') + Math.abs(diff).toLocaleString('ja-JP') : '—';
    tds[3].className = 'taxsum-num ' + (diff !== null ? (diff < 0 ? 'taxsum-refund' : 'taxsum-pay') : '');

    const times = (k === 'ctax' || k === 'localCtax') ? (interim?.ctaxTimes || 0) : 1;
    const divN  = times === 1 ? 2 : times === 3 ? 4 : times === 11 ? 12 : 2;
    const next  = annual >= 100_000 ? Math.floor(annual / divN / 100) * 100 : 0;
    tds[4].textContent = next > 0 ? next.toLocaleString('ja-JP') : '—';
  });

  const totalRow = document.querySelector('.taxsum-table .taxsum-total');
  if (totalRow) {
    const tds = totalRow.querySelectorAll('td');
    const totalDiff = totalAnnual > 0 ? totalAnnual - totalInterim : null;
    if (tds[1]) tds[1].textContent = totalAnnual ? totalAnnual.toLocaleString('ja-JP') : '—';
    if (tds[2]) tds[2].textContent = totalInterim ? totalInterim.toLocaleString('ja-JP') : '—';
    if (tds[3]) {
      tds[3].textContent = totalDiff !== null
        ? (totalDiff < 0 ? '△' : '') + Math.abs(totalDiff).toLocaleString('ja-JP') : '—';
      tds[3].className = 'taxsum-num ' + (totalDiff !== null ? (totalDiff < 0 ? 'taxsum-refund' : 'taxsum-pay') : '');
    }
  }
}

function exportTaxSummaryPDF() {
  alert('PDF出力は準備中です');
}
