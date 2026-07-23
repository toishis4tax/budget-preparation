// ===== 役員報酬最適化シミュレーター =====

function renderExecOpt(container) {
  const budget  = window.App?.currentBudget;
  const company = window.App?.currentCompany;

  // 予算から経常利益を自動取得
  let autoPretax = 0;
  if (budget) {
    const av = budget.dynamicAccounts?.length
      ? calcAllValuesDynamic(budget)
      : calcAllValues(budget.rows || {});
    const arr = av['calc_pretax'] || av['sec_pretax'] || [];
    autoPretax = Math.round(arr.reduce((s, v) => s + (v || 0), 0) / 10000) * 10000;
  }

  container.innerHTML = `
    <div class="sim-panel" style="max-width:960px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.5rem">
        <h2 class="section-title" style="margin-bottom:0">役員報酬 最適化シミュレーター</h2>
        <button class="btn btn-sm btn-outline" onclick="showPage('home')" style="margin-left:auto">← ホームに戻る</button>
      </div>

      <!-- 入力パネル -->
      <div style="background:var(--surface-2);border:0.5px solid var(--border);border-radius:12px;padding:1.25rem;margin-bottom:1.25rem">
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:14px">シミュレーション条件</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;align-items:end">

          <div>
            <label style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:5px;font-weight:600">月額役員報酬</label>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="number" id="eo_monthly" value="100" min="0" max="5000" step="10" oninput="_eoSyncSlider();_eoUpdate()" style="flex:1;text-align:right">
              <span style="font-size:12px;color:var(--text-muted);white-space:nowrap">万円/月</span>
            </div>
            <input type="range" id="eo_slider" min="0" max="300" step="5" value="100" oninput="_eoSyncInput();_eoUpdate()"
              style="width:100%;margin-top:8px;accent-color:var(--text-accent)">
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-top:2px">
              <span>0万円</span><span>300万円</span>
            </div>
          </div>

          <div>
            <label style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:5px;font-weight:600">会社の年間利益（役員報酬支払前）</label>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="number" id="eo_pretax" value="${Math.round(autoPretax/10000)}" min="0" step="100" oninput="_eoUpdate()" style="flex:1;text-align:right">
              <span style="font-size:12px;color:var(--text-muted);white-space:nowrap">万円/年</span>
            </div>
            ${autoPretax ? `<div style="font-size:10px;color:var(--text-accent);margin-top:3px">予算の経常利益から自動取得</div>` : ''}
          </div>

          <div>
            <label style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:5px;font-weight:600">年齢</label>
            <select id="eo_age" oninput="_eoUpdate()" style="width:100%">
              <option value="0">40歳未満（介護保険なし）</option>
              <option value="1" selected>40歳以上（介護保険あり）</option>
            </select>
          </div>

        </div>
      </div>

      <!-- 最適解ヒーロー -->
      <div id="eo_hero" style="margin-bottom:1.25rem"></div>

      <!-- グラフ＋明細 -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:1.25rem">
        <div style="background:var(--surface-2);border:0.5px solid var(--border);border-radius:12px;padding:1.25rem">
          <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:12px">税負担の内訳（現在の報酬）</div>
          <canvas id="eo_bar" height="180" style="width:100%"></canvas>
        </div>
        <div style="background:var(--surface-2);border:0.5px solid var(--border);border-radius:12px;padding:1.25rem">
          <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:12px">報酬別・総税負担曲線</div>
          <canvas id="eo_curve" height="180" style="width:100%"></canvas>
        </div>
      </div>

      <!-- 現在vs最適 比較カード -->
      <div id="eo_compare" style="margin-bottom:1.25rem"></div>

      <!-- 最適化の根拠 -->
      <div id="eo_reason" style="margin-bottom:1.25rem"></div>

      <!-- 詳細テーブル -->
      <div style="background:var(--surface-2);border:0.5px solid var(--border);border-radius:12px;padding:1.25rem">
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:12px;letter-spacing:.05em">報酬別シミュレーション一覧（万円）</div>
        <div style="overflow-x:auto">
          <table id="eo_table" style="width:100%;min-width:600px;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums"></table>
        </div>
      </div>
    </div>`;

  _eoUpdate();
}

function _eoSyncSlider() {
  const v = parseFloat(document.getElementById('eo_monthly')?.value || 0);
  const sl = document.getElementById('eo_slider');
  if (sl) sl.value = Math.min(300, Math.max(0, v));
}
function _eoSyncInput() {
  const v = parseFloat(document.getElementById('eo_slider')?.value || 0);
  const inp = document.getElementById('eo_monthly');
  if (inp) inp.value = v;
}

function _eoVal(id) {
  return parseFloat(document.getElementById(id)?.value || 0) || 0;
}

// 給与所得控除
function _eoSalaryDeduction(annual) {
  if (annual <= 1_625_000)  return 550_000;
  if (annual <= 1_800_000)  return annual * 0.40 - 100_000;
  if (annual <= 3_600_000)  return annual * 0.30 + 80_000;
  if (annual <= 6_600_000)  return annual * 0.20 + 440_000;
  if (annual <= 8_500_000)  return annual * 0.10 + 1_100_000;
  return 1_950_000;
}

// 所得税（復興税込み）
function _eoIncomeTax(taxable) {
  if (taxable <= 0) return 0;
  const brackets = [
    [1_950_000, 0.05, 0],
    [3_300_000, 0.10, 97_500],
    [6_950_000, 0.20, 427_500],
    [9_000_000, 0.23, 636_000],
    [18_000_000, 0.33, 1_536_000],
    [40_000_000, 0.40, 2_796_000],
    [Infinity,   0.45, 4_796_000],
  ];
  for (const [lim, rate, deduct] of brackets) {
    if (taxable <= lim) return Math.round((taxable * rate - deduct) * 1.021);
  }
  return 0;
}

// 社会保険（協会けんぽ東京・2024年度概算）― 個人負担・会社負担ともに同率
function _eoSocialInsOne(monthly, age40plus) {
  const kenpo = Math.min(monthly, 1_390_000) * (age40plus ? 0.04985 + 0.009 : 0.04985);
  const kosei = Math.min(monthly, 650_000)   * 0.09150;
  return Math.round((kenpo + kosei) * 12);
}
// 個人負担分
function _eoSocialIns(monthly, age40plus) { return _eoSocialInsOne(monthly, age40plus); }
// 会社負担分（個人と同額）
function _eoSocialInsCompany(monthly, age40plus) { return _eoSocialInsOne(monthly, age40plus); }

// 法人実効税率（中小法人）
function _eoCorporateTax(pretax) {
  if (pretax <= 0) return 0;
  const low = Math.min(pretax, 8_000_000) * 0.214;
  const hi  = Math.max(0, pretax - 8_000_000) * 0.344;
  return Math.round(low + hi);
}

function _eoCalc(monthly, companyPretaxBefore, age40plus) {
  const annualSalary     = monthly * 12;
  const salaryDeduction  = _eoSalaryDeduction(annualSalary);
  const socialIns        = _eoSocialIns(monthly, age40plus);
  // 課税所得＝給与収入−給与所得控除−社会保険料控除（全額控除）−基礎控除
  const personalIncome   = Math.max(0, annualSalary - salaryDeduction - socialIns - 480_000);
  const incomeTax        = _eoIncomeTax(personalIncome);
  const residTax         = Math.round(personalIncome * 0.10) + 5_000;
  const companySocialIns = _eoSocialInsCompany(monthly, age40plus);
  // 法人の課税所得 = 利益 − 役員報酬 − 会社負担の社会保険料
  const companyPretax    = companyPretaxBefore - annualSalary - companySocialIns;
  const corpTax          = _eoCorporateTax(companyPretax);
  const totalTax         = incomeTax + residTax + socialIns + companySocialIns + corpTax;
  return { annualSalary, incomeTax, residTax, socialIns, companySocialIns, corpTax, totalTax, personalIncome, companyPretax };
}

function _eoFmt(v) { return Math.round(v / 10000).toLocaleString('ja-JP'); }

function _eoUpdate() {
  const monthly   = _eoVal('eo_monthly') * 10_000;
  const pretaxMan = _eoVal('eo_pretax');
  const pretax    = pretaxMan * 10_000;
  const age40plus = document.getElementById('eo_age')?.value === '1';

  const cur = _eoCalc(monthly, pretax, age40plus);

  // 最適解探索（0〜500万×5万刻み）
  let optMonthly = 0, optResult = null;
  for (let m = 0; m <= 500 * 10_000; m += 5 * 10_000) {
    const r = _eoCalc(m, pretax, age40plus);
    if (!optResult || r.totalTax < optResult.totalTax) {
      optResult = r; optMonthly = m;
    }
  }

  // ヒーロー表示
  const heroEl = document.getElementById('eo_hero');
  if (heroEl) {
    const saving = cur.totalTax - optResult.totalTax;
    const isCurrent = Math.abs(monthly - optMonthly) < 25_000;
    heroEl.innerHTML = isCurrent
      ? `<div style="background:linear-gradient(135deg,#d1fae5,#a7f3d0);border:1px solid #6ee7b7;border-radius:14px;padding:1.25rem 1.5rem;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div style="font-size:2.2rem">✅</div>
          <div>
            <div style="font-size:14px;font-weight:700;color:#065f46">現在の報酬が最適です</div>
            <div style="font-size:12px;color:#047857;margin-top:4px">月額 ${_eoFmt(monthly)}万円 の設定が、税負担を最小化します</div>
          </div>
          <div style="margin-left:auto;text-align:right">
            <div style="font-size:11px;color:#065f46">年間総税負担</div>
            <div style="font-size:22px;font-weight:700;color:#065f46">${_eoFmt(cur.totalTax)}万円</div>
          </div>
        </div>`
      : `<div style="background:linear-gradient(135deg,#fef3c7,#fde68a);border:1px solid #fcd34d;border-radius:14px;padding:1.25rem 1.5rem;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div style="font-size:2.2rem">💡</div>
          <div>
            <div style="font-size:14px;font-weight:700;color:#78350f">最適月額は <span style="font-size:20px;color:#92400e">${_eoFmt(optMonthly)}万円/月</span></div>
            <div style="font-size:12px;color:#92400e;margin-top:4px">現在（${_eoFmt(monthly)}万円）から変更すると、年間 <strong>${_eoFmt(saving)}万円</strong> の節税効果</div>
          </div>
          <div style="margin-left:auto;text-align:right;min-width:130px">
            <div style="font-size:11px;color:#78350f">節税額/年</div>
            <div style="font-size:28px;font-weight:700;color:#78350f">▼ ${_eoFmt(saving)}万円</div>
          </div>
        </div>`;
  }

  // 棒グラフ（現在の内訳）
  const barCanvas = document.getElementById('eo_bar');
  if (barCanvas) _eoDrawBar(barCanvas, cur);

  // 曲線グラフ
  const curveCanvas = document.getElementById('eo_curve');
  if (curveCanvas) _eoDrawCurve(curveCanvas, pretax, age40plus, monthly, optMonthly);

  // 現在vs最適比較
  const compareEl = document.getElementById('eo_compare');
  if (compareEl) {
    const _card = (title, r, highlight) => `
      <div style="background:var(--surface-2);border:${highlight?'2px solid var(--primary)':'0.5px solid var(--border)'};border-radius:12px;padding:1rem 1.25rem">
        <div style="font-size:12px;font-weight:700;color:${highlight?'var(--text-accent)':'var(--text-muted)'};margin-bottom:10px">${title}</div>
        <div style="display:grid;grid-template-columns:1fr auto;gap:5px 12px;font-size:12px">
          ${[
            ['所得税（復興税込）', r.incomeTax],
            ['住民税', r.residTax],
            ['社会保険料（本人負担）', r.socialIns],
            ['社会保険料（会社負担）', r.companySocialIns],
            ['法人税等', r.corpTax],
          ].map(([lbl, val]) => `
            <span style="color:var(--text-muted)">${lbl}</span>
            <span style="text-align:right;font-weight:600">${_eoFmt(val)}万円</span>
          `).join('')}
        </div>
        <div style="border-top:1px solid var(--border);margin-top:10px;padding-top:10px;display:flex;justify-content:space-between;font-weight:700;font-size:14px">
          <span>合計税負担</span>
          <span style="color:var(--text-accent)">${_eoFmt(r.totalTax)}万円</span>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px">
          会社手取後利益: ${_eoFmt(Math.max(0, r.companyPretax) - r.corpTax)}万円
        </div>
      </div>`;
    compareEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${_card(`現在の設定（${_eoFmt(monthly)}万円/月）`, cur, false)}
        ${_card(`★ 最適設定（${_eoFmt(optMonthly)}万円/月）`, optResult, true)}
      </div>`;
  }

  // 最適化の根拠
  const reasonEl = document.getElementById('eo_reason');
  if (reasonEl) {
    const reasons = _eoReasons(optMonthly, optResult, cur, monthly, pretax);
    reasonEl.innerHTML = `
      <div style="background:var(--surface-2);border:0.5px solid var(--border);border-radius:12px;padding:1.25rem">
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:12px;letter-spacing:.05em">なぜこの金額が最適か</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${reasons.map(r => `
            <div style="display:flex;gap:10px;align-items:flex-start">
              <span style="font-size:14px;flex-shrink:0">${r.icon}</span>
              <div>
                <div style="font-size:12px;font-weight:600;color:var(--text)">${r.title}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${r.body}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // 詳細テーブル
  const tableEl = document.getElementById('eo_table');
  if (tableEl) {
    const steps = [];
    for (let m = 0; m <= 500 * 10_000; m += 25 * 10_000) steps.push(m);
    const thS  = 'style="padding:6px 10px;text-align:right;font-size:11px;font-weight:600;color:var(--text-muted);border-bottom:2px solid var(--border);white-space:nowrap"';
    const th1S = 'style="padding:6px 10px;text-align:left;font-size:11px;font-weight:600;color:var(--text-muted);border-bottom:2px solid var(--border)"';
    tableEl.innerHTML = `
      <thead>
        <tr>
          <th ${th1S}>月額報酬</th>
          <th ${thS}>所得税</th>
          <th ${thS}>住民税</th>
          <th ${thS}>社保（本人）</th>
          <th ${thS}>社保（会社）</th>
          <th ${thS}>法人税等</th>
          <th ${thS}>総税負担</th>
          <th ${thS}>節税額</th>
        </tr>
      </thead>
      <tbody>
        ${steps.map(m => {
          const r = _eoCalc(m, pretax, age40plus);
          const saving = cur.totalTax - r.totalTax;
          const isCur  = Math.abs(m - monthly) < 12_500;
          const isOpt  = Math.abs(m - optMonthly) < 12_500;
          const rowBg  = isOpt ? 'background:#fefce8;' : isCur ? 'background:#eff6ff;' : '';
          const label  = isOpt ? `★ ${_eoFmt(m)}万円` : isCur ? `▶ ${_eoFmt(m)}万円` : `${_eoFmt(m)}万円`;
          const lColor = isOpt ? '#92400e' : isCur ? '#1e40af' : 'var(--text)';
          return `<tr style="${rowBg}border-bottom:0.5px solid var(--border)">
            <td style="padding:5px 10px;font-weight:${isOpt||isCur?'700':'400'};color:${lColor}">${label}</td>
            ${[r.incomeTax, r.residTax, r.socialIns, r.companySocialIns, r.corpTax, r.totalTax].map(v =>
              `<td style="padding:5px 10px;text-align:right;font-variant-numeric:tabular-nums;font-weight:${isOpt||isCur?'700':'400'};color:${lColor}">${_eoFmt(v)}</td>`
            ).join('')}
            <td style="padding:5px 10px;text-align:right;font-variant-numeric:tabular-nums;font-weight:${isOpt||isCur?'700':'400'};color:${saving>0?'#166534':saving<0?'#991b1b':lColor}">${saving>0?'▼ '+_eoFmt(saving):saving<0?'▲ '+_eoFmt(-saving):'-'}</td>
          </tr>`;
        }).join('')}
      </tbody>`;
  }
}

// 最適化の根拠を生成
function _eoReasons(optM, optR, curR, curM, pretax) {
  const reasons = [];
  const annualOpt = optM * 12;

  if (optM >= 1_390_000) {
    reasons.push({ icon: '🏥', title: '社会保険料が上限に達しています',
      body: `健康保険料は月額139万円（標準報酬月額の上限）で頭打ちになります。それ以上報酬を増やしても社会保険負担は増えません。` });
  } else {
    reasons.push({ icon: '🏥', title: `社会保険料は月額${Math.round(optM/10000)}万円が最適バランス`,
      body: `報酬が高くなると社会保険料も増加しますが、給与所得控除による節税効果とのバランスでこの水準が最小点です。` });
  }

  const pretaxAfter = pretax - annualOpt;
  if (pretaxAfter <= 8_000_000 && pretaxAfter > 0) {
    reasons.push({ icon: '🏢', title: '法人所得が800万円以下の軽減税率内に収まっています',
      body: `中小法人は課税所得800万円以下に対し約21.4%の軽減税率が適用されます。役員報酬でうまく調整することで税率が低い枠内に収められています。` });
  } else if (pretaxAfter > 8_000_000) {
    reasons.push({ icon: '🏢', title: '役員報酬をさらに増やすと法人税節税効果あり',
      body: `現在の法人所得は${_eoFmt(pretaxAfter)}万円で、800万円を超える部分には約34.4%が課税されます。役員報酬を増やして法人所得を圧縮すると法人税を減らせますが、個人の社会保険・所得税との兼ね合いでこの水準が最適点です。` });
  } else if (pretaxAfter <= 0) {
    reasons.push({ icon: '🏢', title: '役員報酬が会社利益を上回っています',
      body: `役員報酬が利益を超えると会社は赤字となり、繰越欠損金として将来の節税に使えますが、継続的な赤字は財務健全性を損ないます。` });
  }

  reasons.push({ icon: '📋', title: `給与所得控除 ${_eoFmt(_eoSalaryDeduction(annualOpt))}万円が実質的な個人の経費に`,
    body: `役員報酬には給与所得控除が適用されます。この控除額が実質的な個人の「経費」となり、所得税・住民税の課税対象を減らします。` });

  const saving = curR.totalTax - optR.totalTax;
  if (Math.abs(saving) > 10_000) {
    reasons.push({ icon: saving > 0 ? '💰' : '⚠️',
      title: saving > 0 ? `最適化で年間 ${_eoFmt(saving)}万円の節税` : `現在の設定の方が ${_eoFmt(-saving)}万円 有利`,
      body: saving > 0
        ? `個人・法人合計の税負担を比較すると、最適な報酬設定に変更することで年間${_eoFmt(saving)}万円の節税が見込まれます。`
        : `入力した報酬額は既に税負担最小値に近い水準です。` });
  }

  return reasons;
}

// canvas実幅を安全に取得（パディング考慮でフィードバックループ防止）
function _eoCanvasW(canvas) {
  const p = canvas.parentElement;
  if (!p) return 300;
  const cs = window.getComputedStyle(p);
  const w = Math.floor(p.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0));
  return Math.max(160, w);
}

// 棒グラフ描画
function _eoDrawBar(canvas, r) {
  const dpr = window.devicePixelRatio || 1;
  const W = _eoCanvasW(canvas);
  const H = 180;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const items = [
    { label: '所得税',     value: r.incomeTax,       color: '#6366f1' },
    { label: '住民税',     value: r.residTax,        color: '#8b5cf6' },
    { label: '社保(本人)', value: r.socialIns,        color: '#06b6d4' },
    { label: '社保(会社)', value: r.companySocialIns, color: '#0e7490' },
    { label: '法人税等',   value: r.corpTax,          color: '#f59e0b' },
  ];

  const maxV = Math.max(...items.map(i => i.value), 1);
  const pad  = { left: 60, right: 16, top: 20, bottom: 30 };
  const bW   = (W - pad.left - pad.right) / items.length * 0.65;
  const gapW = (W - pad.left - pad.right) / items.length;
  const chartH = H - pad.top - pad.bottom;

  items.forEach((item, i) => {
    const x  = pad.left + i * gapW + (gapW - bW) / 2;
    const bH = Math.max(2, (item.value / maxV) * chartH);
    const y  = pad.top + chartH - bH;

    ctx.fillStyle = item.color;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, bW, bH, [4, 4, 0, 0]);
    else ctx.rect(x, y, bW, bH);
    ctx.fill();

    ctx.fillStyle = '#64748b';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(_eoFmt(item.value) + '万', x + bW / 2, y - 3);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px system-ui';
    ctx.fillText(item.label, x + bW / 2, H - pad.bottom + 14);
  });

  ctx.fillStyle = '#475569';
  ctx.font = 'bold 11px system-ui';
  ctx.textAlign = 'right';
  ctx.fillText('合計 ' + _eoFmt(r.totalTax) + '万円', W - pad.right, pad.top - 4);
}

// 税負担曲線グラフ描画
function _eoDrawCurve(canvas, pretax, age40plus, curMonthly, optMonthly) {
  const dpr = window.devicePixelRatio || 1;
  const W = _eoCanvasW(canvas);
  const H = 180;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const MAX_M = 500 * 10_000;
  const STEPS = 100;
  const pad = { left: 52, right: 16, top: 20, bottom: 30 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  const pts = [];
  for (let i = 0; i <= STEPS; i++) {
    const m = (i / STEPS) * MAX_M;
    pts.push({ m, y: _eoCalc(m, pretax, age40plus).totalTax });
  }

  const minY = Math.min(...pts.map(p => p.y));
  const maxY = Math.max(...pts.map(p => p.y), minY + 1);
  const toX = m => pad.left + (m / MAX_M) * chartW;
  const toY = v => pad.top + chartH - ((v - minY) / (maxY - minY)) * chartH;

  // グリッド線
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 0.5;
  for (let g = 0; g <= 4; g++) {
    const gy = pad.top + (g / 4) * chartH;
    ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(pad.left + chartW, gy); ctx.stroke();
    const val = minY + ((4 - g) / 4) * (maxY - minY);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(_eoFmt(val), pad.left - 3, gy + 3);
  }

  // 曲線
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = toX(p.m), y = toY(p.y);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 2;
  ctx.stroke();

  // エリア塗りつぶし
  ctx.lineTo(toX(MAX_M), toY(minY));
  ctx.lineTo(toX(0), toY(minY));
  ctx.closePath();
  ctx.fillStyle = 'rgba(99,102,241,0.08)';
  ctx.fill();

  // 現在位置
  const curR = _eoCalc(curMonthly, pretax, age40plus);
  const cx = toX(curMonthly), cy = toY(curR.totalTax);
  ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#3b82f6'; ctx.fill();
  ctx.fillStyle = '#1e40af';
  ctx.font = '9px system-ui';
  ctx.textAlign = cx < pad.left + chartW * 0.7 ? 'left' : 'right';
  ctx.fillText('現在', cx + (cx < pad.left + chartW * 0.7 ? 7 : -7), cy - 6);

  // 最適位置
  const optR = _eoCalc(optMonthly, pretax, age40plus);
  const ox = toX(optMonthly), oy = toY(optR.totalTax);
  ctx.beginPath(); ctx.arc(ox, oy, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#f59e0b'; ctx.fill();
  ctx.fillStyle = '#92400e';
  ctx.font = 'bold 9px system-ui';
  ctx.textAlign = ox < pad.left + chartW * 0.7 ? 'left' : 'right';
  ctx.fillText('★最適', ox + (ox < pad.left + chartW * 0.7 ? 9 : -9), oy - 6);

  // X軸ラベル
  ctx.fillStyle = '#94a3b8';
  ctx.font = '9px system-ui';
  ctx.textAlign = 'center';
  [0, 100, 200, 300, 400, 500].forEach(v => {
    ctx.fillText(v + '万', toX(v * 10_000), H - pad.bottom + 12);
  });

  ctx.fillStyle = '#64748b';
  ctx.font = '9px system-ui';
  ctx.textAlign = 'right';
  ctx.fillText('総税負担（万円）', pad.left - 2, pad.top - 4);
}
