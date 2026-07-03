// ===== CCC（キャッシュコンバージョンサイクル）分析 =====
// 業種別ベンチマーク：日本政策金融公庫・法人企業統計・商工業実態基本調査より

// 業種別ベンチマーク（日数）
const CCC_BENCHMARKS = {
  manufacturing: { label: '製造業',     dso: 75, dio: 67, dpo: 60, ccc: 82,  equityRatio: 51.6, currentRatio: 125.5, opMargin: 3.2 },
  construction:  { label: '建設業',     dso: 75, dio: 22, dpo: 45, ccc: 52,  equityRatio: 24.8, currentRatio: 130.0, opMargin: 3.5 },
  wholesale:     { label: '卸売業',     dso: 60, dio: 37, dpo: 45, ccc: 52,  equityRatio: 18.8, currentRatio: 118.4, opMargin: 1.8 },
  retail:        { label: '小売業',     dso: 10, dio: 45, dpo: 45, ccc: 10,  equityRatio: 35.0, currentRatio: 151.0, opMargin: 2.1 },
  service:       { label: 'サービス業', dso: 45, dio:  0, dpo: 22, ccc: 23,  equityRatio: 40.0, currentRatio: 150.0, opMargin: 5.0 },
  it:            { label: '情報通信業', dso: 60, dio:  0, dpo: 37, ccc: 30,  equityRatio: 49.4, currentRatio: 160.0, opMargin: 8.0 },
  restaurant:    { label: '飲食業',     dso:  3, dio:  6, dpo: 22, ccc: -13, equityRatio: 20.0, currentRatio: 154.9, opMargin: 1.5 },
  realestate:    { label: '不動産業',   dso: 12, dio:  0, dpo: 22, ccc: -10, equityRatio: 45.0, currentRatio: 140.0, opMargin: 6.0 },
  other:         { label: 'その他',     dso: 60, dio: 30, dpo: 40, ccc: 50,  equityRatio: 38.7, currentRatio: 140.0, opMargin: 3.0 },
};

const INDUSTRY_OPTIONS = [
  { value: 'manufacturing', label: '製造業' },
  { value: 'construction',  label: '建設業' },
  { value: 'wholesale',     label: '卸売業' },
  { value: 'retail',        label: '小売業' },
  { value: 'service',       label: 'サービス業' },
  { value: 'it',            label: '情報通信業' },
  { value: 'restaurant',    label: '飲食業' },
  { value: 'realestate',    label: '不動産業' },
  { value: 'other',         label: 'その他' },
];

function renderCCCAnalysis(container) {
  const budget = App.currentBudget;
  const company = App.currentCompany;
  const industryKey = company?.industry || 'other';
  const benchmark = CCC_BENCHMARKS[industryKey] || CCC_BENCHMARKS.other;

  const style = `<style>
.ccc-wrap { max-width: 960px; margin: 0 auto; padding: 24px 16px; }
.ccc-title { font-size: 22px; font-weight: 800; color: var(--text); margin-bottom: 4px; }
.ccc-sub   { font-size: 13px; color: var(--text-muted); margin-bottom: 20px; line-height:1.6 }

.ccc-industry-bar { display:flex; align-items:center; gap:12px; background:var(--surface-2); border:1px solid var(--border); border-radius:12px; padding:14px 20px; margin-bottom:20px; }
.ccc-industry-label { font-size:13px; font-weight:700; color:var(--text); }
.ccc-industry-select { font-size:13px; border:1.5px solid var(--border); border-radius:8px; padding:4px 10px; background:var(--surface-2); color:var(--text); font-family:inherit; cursor:pointer; }

/* メトリクスグリッド */
.ccc-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:20px; }
@media(max-width:600px){ .ccc-grid { grid-template-columns:1fr; } }
.ccc-metric { background:var(--surface-2); border:1px solid var(--border); border-radius:14px; padding:18px; }
.ccc-metric-label { font-size:11px; font-weight:700; color:var(--text-muted); letter-spacing:.05em; margin-bottom:4px; }
.ccc-metric-value { font-size:28px; font-weight:900; color:var(--text); font-variant-numeric:tabular-nums; }
.ccc-metric-unit  { font-size:13px; font-weight:400; }
.ccc-metric-bm    { font-size:11px; color:var(--text-muted); margin-top:4px; }
.ccc-metric-diff  { font-size:12px; font-weight:700; margin-top:2px; }
.diff-good { color:#059669; }
.diff-warn { color:#d97706; }
.diff-bad  { color:#dc2626; }

/* CCC合計バー */
.ccc-total { background:var(--surface-2); border:1px solid var(--border); border-radius:14px; padding:20px; margin-bottom:20px; }
.ccc-total-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
.ccc-total-title { font-size:14px; font-weight:700; color:var(--text); }
.ccc-total-val { font-size:28px; font-weight:900; }
.ccc-bar-row { display:flex; gap:4px; height:28px; border-radius:8px; overflow:hidden; margin-bottom:8px; }
.ccc-bar-seg { display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#fff; min-width:1px; transition:.4s; overflow:hidden; white-space:nowrap; padding:0 4px; }
.ccc-bar-legend { display:flex; gap:16px; flex-wrap:wrap; font-size:11px; color:var(--text-muted); }
.ccc-bar-legend-item { display:flex; align-items:center; gap:4px; }
.ccc-bar-legend-dot { width:10px; height:10px; border-radius:2px; }

/* 信号表示 */
.ccc-signal { display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; }
.ccc-signal-item { flex:1; min-width:200px; border-radius:12px; padding:14px 16px; }
.sig-green { background:#d1fae5; border:1px solid #6ee7b7; }
.sig-yellow { background:#fef9c3; border:1px solid #fcd34d; }
.sig-red    { background:#fee2e2; border:1px solid #fca5a5; }
.ccc-signal-title { font-size:13px; font-weight:700; margin-bottom:4px; }
.sig-green .ccc-signal-title  { color:#065f46; }
.sig-yellow .ccc-signal-title { color:#854d0e; }
.sig-red .ccc-signal-title    { color:#991b1b; }
.ccc-signal-text { font-size:12px; line-height:1.6; }
.sig-green .ccc-signal-text  { color:#065f46; }
.sig-yellow .ccc-signal-text { color:#854d0e; }
.sig-red .ccc-signal-text    { color:#991b1b; }

/* 改善アドバイス */
.ccc-advice { background:var(--surface-2); border:1px solid var(--border); border-radius:14px; padding:20px; margin-bottom:20px; }
.ccc-advice-title { font-size:14px; font-weight:700; color:var(--text); margin-bottom:12px; }
.ccc-advice-item { padding:10px 0; border-top:1px solid var(--border); font-size:13px; color:var(--text-muted); line-height:1.7; }
.ccc-advice-item:first-of-type { border-top:none; padding-top:0; }
.ccc-advice-head { font-weight:700; color:var(--text); margin-bottom:3px; }

/* 業種別比較 */
.ccc-bench { background:var(--surface-2); border:1px solid var(--border); border-radius:14px; overflow:hidden; margin-bottom:20px; }
.ccc-bench-table { width:100%; border-collapse:collapse; font-size:12px; }
.ccc-bench-table th { background:var(--blue-100); color:var(--primary); padding:9px 14px; text-align:left; font-weight:700; }
.ccc-bench-table td { padding:9px 14px; border-top:1px solid var(--border); color:var(--text); font-variant-numeric:tabular-nums; }
.ccc-bench-table tr.current-industry td { background:var(--primary-light); font-weight:700; }

.ccc-nodata { text-align:center; padding:40px; color:var(--text-muted); font-size:13px; }
</style>`;

  // 業種選択バー
  const industrySelectHtml = `
    <div class="ccc-industry-bar">
      <div class="ccc-industry-label">比較業種：</div>
      <select class="ccc-industry-select" onchange="_cccChangeIndustry(this.value)">
        ${INDUSTRY_OPTIONS.map(o => `<option value="${o.value}"${o.value === industryKey ? ' selected' : ''}>${o.label}</option>`).join('')}
      </select>
      <div style="font-size:12px;color:var(--text-muted)">会社設定の業種が自動選択されます</div>
    </div>`;

  if (!budget) {
    container.innerHTML = style + `<div class="ccc-wrap">
      <div class="ccc-title">🔄 CCC分析</div>
      <div class="ccc-sub">キャッシュコンバージョンサイクルで資金効率を診断します。</div>
      ${industrySelectHtml}
      <div class="ccc-nodata">📊 推移表をアップロードすると実績値で分析できます<br><br>
        <div style="text-align:left;max-width:500px;margin:0 auto;background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:20px;">
        ${_cccBenchmarkTable(industryKey)}
        </div>
      </div>
    </div>`;
    return;
  }

  // 財務データから計算
  const av    = calcAllValuesDynamic(budget);
  const accts = budget.dynamicAccounts || [];
  const cols  = budget.actualCols || [];
  let closeIdx = -1;
  for (let i = 0; i < 12; i++) if (cols[i]) closeIdx = i;
  if (closeIdx < 0) closeIdx = 11;

  const arr   = id => av[id] || new Array(13).fill(0);
  const last  = id => arr(id)[closeIdx] || 0;
  const total = id => arr(id).slice(0, 12).reduce((a, b) => a + b, 0);
  const leafSum = (re, mode) => {
    const matching = accts.filter(a => a.type !== 'section' && re.test(a.name || ''));
    const matchingIds = new Set(matching.map(a => a.id));
    const deduped = matching.filter(a => !matchingIds.has(a.parentId));
    return deduped.reduce((s, a) => s + (mode === 'last' ? last(a.id) : total(a.id)), 0);
  };

  const sales    = Math.max(0, total('sec_revenue'));
  const ar       = Math.max(0, leafSum(/売掛|受取手形/, 'last'));
  const inv      = Math.max(0, leafSum(/棚卸|商品|製品|仕掛|原材料/, 'last'));
  const ap       = Math.max(0, leafSum(/買掛|支払手形/, 'last'));

  const dailySales = sales > 0 ? sales / 365 : 0;

  const dso = dailySales > 0 ? ar / dailySales : 0;
  const dio = dailySales > 0 ? inv / dailySales : 0;
  const dpo = dailySales > 0 ? ap / dailySales : 0;
  const ccc = dso + dio - dpo;

  const bm = CCC_BENCHMARKS[industryKey] || CCC_BENCHMARKS.other;

  const diffSign = (actual, bm, inverted) => {
    if (inverted) {
      // DPOは大きい方が良い
      const d = actual - bm;
      return { cls: d >= 0 ? 'diff-good' : 'diff-warn', text: (d >= 0 ? '+' : '') + d.toFixed(0) + '日（業種比）' };
    }
    const d = actual - bm;
    return { cls: d <= 0 ? 'diff-good' : d <= bm * 0.3 ? 'diff-warn' : 'diff-bad',
             text: (d >= 0 ? '+' : '') + d.toFixed(0) + '日（業種比）' };
  };

  const dsoDiff = diffSign(dso, bm.dso, false);
  const dioDiff = diffSign(dio, bm.dio, false);
  const dpoDiff = diffSign(dpo, bm.dpo, true);
  const cccDiff = diffSign(ccc, bm.ccc, false);

  // 必要運転資金の計算
  const requiredNWC = sales * (ccc / 365);
  const bmNWC       = sales * (bm.ccc / 365);
  const nwcSaving   = bmNWC - requiredNWC; // マイナスなら改善余地あり

  // 信号判定
  const signals = [];
  if (ccc > bm.ccc * 1.5) {
    signals.push({ cls: 'sig-red', title: '🔴 CCC 赤信号', text: `業種平均（${bm.ccc.toFixed(0)}日）の1.5倍超。必要運転資本が過大で、資金繰りリスクが高い状態です。` });
  } else if (ccc > bm.ccc * 1.2) {
    signals.push({ cls: 'sig-yellow', title: '🟡 CCC 黄信号', text: `業種平均（${bm.ccc.toFixed(0)}日）を20%超えています。売掛金・在庫の管理強化が必要です。` });
  } else {
    signals.push({ cls: 'sig-green', title: '🟢 CCC 正常', text: `業種平均（${bm.ccc.toFixed(0)}日）の範囲内です。引き続き資金効率の維持に努めてください。` });
  }
  if (dso > bm.dso * 1.3) {
    signals.push({ cls: 'sig-yellow', title: '⚠️ 売掛金回転日数', text: `${dso.toFixed(0)}日は業種平均（${bm.dso}日）を大幅に超えています。顧客の支払遅延・不良債権の可能性があります。` });
  }

  // アドバイス
  const advices = [];
  if (dso > bm.dso) advices.push({
    head: '売掛金の回収サイト短縮',
    text: `現在${dso.toFixed(0)}日（業種平均${bm.dso}日）。早期入金割引（1〜2%）の導入、電子請求書への切替、支払条件の統一化が有効です。ファクタリング（手数料2〜9%）で即時現金化も可能。`,
  });
  if (dio > bm.dio && dio > 0) advices.push({
    head: '在庫回転日数の改善',
    text: `現在${dio.toFixed(0)}日（業種平均${bm.dio}日）。ABC分析で重点品目を絞り、需要予測精度を上げて安全在庫を最適化してください。180日超の滞留在庫は原価以下でも処分を検討。`,
  });
  if (dpo < bm.dpo) advices.push({
    head: '買掛金支払いサイトの延長交渉',
    text: `現在${dpo.toFixed(0)}日（業種平均${bm.dpo}日）。主要仕入先に支払サイト延長を交渉することで資金繰りが改善します。下請法の範囲内（現金60日・手形120日以内）で調整してください。`,
  });
  if (advices.length === 0) advices.push({
    head: '現在の資金効率を維持',
    text: 'すべての指標が業種平均の範囲内です。引き続きモニタリングを継続し、売上増加時の運転資本増加に備えた借入枠の確保を検討してください。',
  });

  // バーの長さ計算（total = dso + dio + dpo が最大値の基準）
  const total365 = Math.max(dso + dio + dpo, 1);
  const dsoW = (dso / total365 * 100).toFixed(1);
  const dioW = (dio / total365 * 100).toFixed(1);
  const dpoW = (dpo / total365 * 100).toFixed(1);

  container.innerHTML = style + `
<div class="ccc-wrap">
  <div class="ccc-title">🔄 CCC分析（キャッシュコンバージョンサイクル）</div>
  <div class="ccc-sub">「売掛→回収」「仕入→販売」「支払いまでの猶予」を組み合わせ、資金が何日間拘束されているかを診断します。</div>

  ${industrySelectHtml}

  <div class="ccc-grid">
    <div class="ccc-metric">
      <div class="ccc-metric-label">売掛金回転日数（DSO）</div>
      <div class="ccc-metric-value">${dso.toFixed(0)}<span class="ccc-metric-unit">日</span></div>
      <div class="ccc-metric-bm">業種平均 ${bm.dso}日</div>
      <div class="ccc-metric-diff ${dsoDiff.cls}">${dsoDiff.text}</div>
    </div>
    <div class="ccc-metric">
      <div class="ccc-metric-label">棚卸資産回転日数（DIO）</div>
      <div class="ccc-metric-value">${dio.toFixed(0)}<span class="ccc-metric-unit">日</span></div>
      <div class="ccc-metric-bm">業種平均 ${bm.dio}日</div>
      <div class="ccc-metric-diff ${dioDiff.cls}">${dioDiff.text}</div>
    </div>
    <div class="ccc-metric">
      <div class="ccc-metric-label">買掛金回転日数（DPO）</div>
      <div class="ccc-metric-value">${dpo.toFixed(0)}<span class="ccc-metric-unit">日</span></div>
      <div class="ccc-metric-bm">業種平均 ${bm.dpo}日</div>
      <div class="ccc-metric-diff ${dpoDiff.cls}">${dpoDiff.text}</div>
    </div>
  </div>

  <div class="ccc-total">
    <div class="ccc-total-head">
      <div class="ccc-total-title">CCC（キャッシュコンバージョンサイクル）= DSO + DIO − DPO</div>
      <div class="ccc-total-val ${cccDiff.cls}">${ccc.toFixed(0)}日</div>
    </div>
    <div class="ccc-bar-row">
      <div class="ccc-bar-seg" style="width:${dsoW}%;background:#2563eb">${dso > 5 ? `DSO ${dso.toFixed(0)}日` : ''}</div>
      <div class="ccc-bar-seg" style="width:${dioW}%;background:#059669">${dio > 5 ? `DIO ${dio.toFixed(0)}日` : ''}</div>
      <div class="ccc-bar-seg" style="width:${dpoW}%;background:#dc2626">${dpo > 5 ? `DPO ${dpo.toFixed(0)}日` : ''}</div>
    </div>
    <div class="ccc-bar-legend">
      <div class="ccc-bar-legend-item"><div class="ccc-bar-legend-dot" style="background:#2563eb"></div>DSO（売掛）</div>
      <div class="ccc-bar-legend-item"><div class="ccc-bar-legend-dot" style="background:#059669"></div>DIO（在庫）</div>
      <div class="ccc-bar-legend-item"><div class="ccc-bar-legend-dot" style="background:#dc2626"></div>DPO（買掛）→ 差し引き</div>
    </div>
    ${Math.abs(nwcSaving) > 100000 ? `<div style="margin-top:12px;font-size:13px;color:var(--text-muted)">
      業種平均水準に改善した場合の運転資金効果：
      <span style="font-weight:700;color:${nwcSaving > 0 ? '#dc2626' : '#059669'}">${nwcSaving > 0 ? '約' + Math.round(Math.abs(nwcSaving)/10000).toLocaleString() + '万円の追加資金が必要' : '約' + Math.round(Math.abs(nwcSaving)/10000).toLocaleString() + '万円の資金を解放できる可能性'}</span>
    </div>` : ''}
  </div>

  <div class="ccc-signal">${signals.map(s => `<div class="ccc-signal-item ${s.cls}"><div class="ccc-signal-title">${s.title}</div><div class="ccc-signal-text">${s.text}</div></div>`).join('')}</div>

  <div class="ccc-advice">
    <div class="ccc-advice-title">💡 改善アドバイス</div>
    ${advices.map(a => `<div class="ccc-advice-item"><div class="ccc-advice-head">${a.head}</div>${a.text}</div>`).join('')}
  </div>

  ${_cccBenchmarkTable(industryKey)}
</div>`;
}

function _cccBenchmarkTable(currentKey) {
  return `
<div class="ccc-bench">
  <table class="ccc-bench-table">
    <thead><tr><th>業種</th><th>DSO（売掛）</th><th>DIO（在庫）</th><th>DPO（買掛）</th><th>CCC目安</th><th>自己資本比率</th></tr></thead>
    <tbody>
    ${Object.entries(CCC_BENCHMARKS).map(([k, b]) => `
      <tr class="${k === currentKey ? 'current-industry' : ''}">
        <td>${k === currentKey ? '▶ ' : ''}${b.label}</td>
        <td>${b.dso}日</td>
        <td>${b.dio > 0 ? b.dio + '日' : '—'}</td>
        <td>${b.dpo}日</td>
        <td style="font-weight:700;color:${b.ccc < 0 ? '#059669' : 'var(--text)'}">${b.ccc}日</td>
        <td>${b.equityRatio}%</td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>`;
}

function _cccChangeIndustry(key) {
  // 会社設定を更新して再描画
  if (App.currentCompany) {
    App.currentCompany.industry = key;
  }
  const c = document.getElementById('main_content');
  if (c) renderCCCAnalysis(c);
}
