// ===== ミーティングモード =====
// お客様との面談を「型」として提供する機能。既存画面には一切手を入れず、
// ナビゲーションの層を上に被せるだけ。この機能が壊れても既存機能は無傷。

// --- 面談プリセット定義 ---
// 将来: localStorage 'meeting_presets_custom' があればそちらを優先する構造にする
const MEETING_PRESETS = [
  {
    id: 'kichu',
    icon: '📊',
    name: '期中面談（月次報告）',
    desc: '毎月・隔月の定例訪問。業績報告と着地見込みの共有',
    steps: [
      { page: 'home', phase: 1, title: '全体サマリーの共有',
        talk: ['まず結論から：「今期は今のところ順調です／遅れています」', '資金ショートアラートが出ていれば最優先で伝える'] },
      { page: 'monthlyreport', phase: 1, title: '月次実績の報告',
        talk: ['予算と実績の差が大きい科目から説明する', '売上↑費用↑なら「成長のための投資」、売上↓費用↑なら要注意として伝える'] },
      { page: 'forecastreport', phase: 1, title: '着地見込みの説明',
        talk: ['このままいくと利益がいくらになるか、を数字で示す', '前年との比較で良し悪しを伝える'] },
      { page: 'tax', phase: 1, title: '納税額の見込み',
        talk: ['納税額を早めに伝えて資金準備を促す', '中間納付がある場合は時期も伝える'] },
      { page: 'cashflow', phase: 1, title: 'CF予測の確認',
        talk: ['利益と現金の動きは別物であることを図で見せる', '大きな投資・返済の予定を確認する'] },
      { page: 'cashplan', phase: 1, title: '資金繰りの確認',
        talk: ['今後6か月の資金の山谷を見せる', '残高がマイナスになる月があれば、借入・支出削減の対策の話へ'] },
      { page: 'execcomp', phase: 1, title: '役員賞与の検討', optional: true,
        talk: ['利益が出そうなら節税オプションとして提示', '事前確定届出給与の届出期限に注意'] },
    ],
  },
  {
    id: 'kessan_mae',
    icon: '🧮',
    name: '決算前検討会',
    desc: '決算2〜3か月前。着地予測・納税額・対策の検討',
    steps: [
      { page: 'forecastreport', phase: 2, title: '決算着地予測の共有',
        talk: ['残り数か月の見込みを含めた着地予測を説明', '大きな変動要因（臨時収入・特別損失）を確認する'] },
      { page: 'tax', phase: 2, title: '法人税概算の説明',
        talk: ['このままの利益だと法人税等がいくらになるか', '対策前・対策後の比較で話すと伝わりやすい'] },
      { page: 'ctax', phase: 2, title: '消費税概算の説明',
        talk: ['消費税は利益と関係なく発生することを強調', '納税資金の準備を促す'] },
      { page: 'execcomp', phase: 2, title: '決算対策：役員賞与',
        talk: ['役員賞与による利益圧縮の効果を試算で見せる', '社会保険料の増加もセットで説明する'] },
      { page: 'welfare', phase: 2, title: '決算対策：従業員賞与', optional: true,
        talk: ['決算賞与の損金算入要件（通知・支給時期）を説明'] },
      { page: 'cashplan', phase: 2, title: '納税資金の資金繰り確認',
        talk: ['納税月に資金が足りるかを確認', '足りなければ納税資金融資の検討へ'] },
    ],
  },
  {
    id: 'kessan_hokoku',
    icon: '📑',
    name: '決算報告会',
    desc: '申告後の報告。決算内容の説明と翌期方針',
    steps: [
      { page: 'health', phase: 3, title: '財務健康診断',
        talk: ['まず点数で全体像をつかんでもらう', '前年より良くなった項目から伝える'] },
      { page: 'simulation', phase: 3, title: '単年度PL/BSの説明',
        talk: ['当期の月次推移を俯瞰して山谷の理由を説明', '季節変動か一時要因かを区別して伝える'] },
      { page: 'summarypl', phase: 3, title: '3期比較PL（業績の推移)',
        talk: ['3期並べて「良くなっているのか悪くなっているのか」の傾向を示す', '粗利率の変化に注目してもらう'] },
      { page: 'summarybs', phase: 3, title: '3期比較BS（財政状態）',
        talk: ['現預金と借入金のバランスを説明', '自己資本が積み上がっているかを確認'] },
      { page: 'bizanalysis', phase: 3, title: '経営分析（強み・弱み）',
        talk: ['1人あたり売上・労働分配率など、社長が実感しやすい指標から', '弱い指標は「来期の改善テーマ」として前向きに伝える'] },
      { page: 'bepanalysis', phase: 3, title: '損益分岐点分析',
        talk: ['「あといくら売上が落ちても赤字にならないか」（経営安全率）を伝える', '固定費を下げると分岐点が下がることを図で見せる'] },
      { page: 'taxsummary', phase: 3, title: '税金一覧表（納付スケジュール）',
        talk: ['年間の税金を一覧で見せて資金計画に組み込んでもらう', '中間納付の時期と金額を必ず伝える'] },
      { page: 'fiveyear', phase: 3, title: '翌期以降の計画', optional: true,
        talk: ['5か年の方向性を共有して次回面談につなげる'] },
    ],
  },
  {
    id: 'bank',
    icon: '🏦',
    name: '銀行対応・融資相談',
    desc: '金融機関提出資料の準備と融資シミュレーション',
    steps: [
      { page: 'bankrating', phase: 4, title: '銀行格付けの自己診断',
        talk: ['銀行がどこを見ているかを説明', '格付けを上げるために効く項目（自己資本・債務償還年数）を伝える'] },
      { page: 'bankdoc', phase: 4, title: '銀行提出資料の作成',
        talk: ['提出前に数字の整合性を必ず確認', '5か年計画は保守的な数字で作る方が信頼される'] },
      { page: 'loansim', phase: 4, title: '借入シミュレーション',
        talk: ['月々の返済額と金利負担を具体的に見せる', '据置期間の有無で資金繰りがどう変わるかを比較'] },
      { page: 'cashplan', phase: 4, title: '返済を織り込んだ資金繰り',
        talk: ['借入後の返済を含めて資金が回るかを確認'] },
    ],
  },
];

// --- サイドバー自動生成 ---
// メニューの並び＝説明する順。MEETING_PRESETS のステップ順から生成するため、
// プリセットを変えればメニューとミーティングモードの両方に反映される。
const PAGE_META = {
  home:           { icon: '🏠', label: 'ホーム' },
  budget:         { icon: '📝', label: '月次予算入力' },
  nextyear_pl:    { icon: '📅', label: '翌期月次予算入力' },
  revenue:        { icon: '🏢', label: '顧問先売上管理' },
  import:         { icon: '📤', label: '推移表アップロード' },
  monthlyreport:  { icon: '📄', label: '月次レポート' },
  forecastreport: { icon: '📋', label: '当期決算予測報告' },
  tax:            { icon: '🧮', label: '法人税概算' },
  ctax:           { icon: '🧾', label: '消費税概算' },
  cashflow:       { icon: '💰', label: 'CF予測' },
  cashplan:       { icon: '📅', label: '資金繰り予定表' },
  welfare:        { icon: '🏥', label: '従業員賞与' },
  execcomp:       { icon: '👔', label: '役員賞与' },
  health:         { icon: '🩺', label: '財務健康診断' },
  simulation:     { icon: '📐', label: '単年度 PL/BS' },
  summarypl:      { icon: '📈', label: '要約PL（3期比較）' },
  summarybs:      { icon: '🏦', label: '要約BS（3期比較）' },
  bizanalysis:    { icon: '📊', label: '経営分析表' },
  bepanalysis:    { icon: '📉', label: '損益分岐点分析' },
  taxsummary:     { icon: '📑', label: '税金一覧表' },
  fiveyear:       { icon: '📅', label: '5か年計画' },
  bankrating:     { icon: '🏦', label: '銀行格付け' },
  bankdoc:        { icon: '🏦', label: '銀行提出資料' },
  loansim:        { icon: '🏦', label: '借入シミュレーター' },
  cccanalysis:    { icon: '🔄', label: 'CCC分析' },
  subsidy:        { icon: '🎁', label: '補助金チェッカー' },
  execopt:        { icon: '💡', label: '役員報酬最適化' },
};

// 説明に使わない入力系（事前準備）と、面談フローに属さないツール（その他）
const MT_PREP_PAGES  = ['import', 'budget', 'nextyear_pl', 'revenue'];
const MT_OTHER_PAGES = ['cccanalysis', 'subsidy', 'execopt'];

function _mtBuildSidebar() {
  const host = document.getElementById('sidebar_sections');
  if (!host) return;

  const navItem = (page, phase) => {
    const m = PAGE_META[page] || { icon: '📄', label: page };
    const extra = page === 'revenue' ? ' id="nav_revenue" style="display:none"' : '';
    return `<div class="nav-item nav-sub-item"${extra} data-page="${page}" data-phase="${phase}"
      tabindex="0" role="button" onkeydown="if(event.key==='Enter'||event.key===' ')this.click()">
      <span class="icon">${m.icon}</span>${m.label}</div>`;
  };

  const section = (phase, dotClass, title, pages, open) => `
    <div class="sidebar-phase" id="phase-section-${phase}">
      <div class="sidebar-phase-label" onclick="togglePhase(${phase})" tabindex="0" role="button"
           onkeydown="if(event.key==='Enter'||event.key===' ')togglePhase(${phase})">
        <span class="phase-dot ${dotClass}"></span>
        <span>${title}</span>
        <span class="phase-toggle-icon" id="phase-toggle-${phase}">${open ? '▾' : '▸'}</span>
      </div>
      <div class="phase-nav-items" id="phase-nav-${phase}"${open ? '' : ' style="display:none"'}>
        ${pages.map(pg => navItem(pg, phase)).join('')}
      </div>
    </div>`;

  // 面談プリセットのステップから重複を除いてページ順を得る
  const presetPages = p => [...new Set(p.steps.map(s => s.page))];
  const NUM = ['①', '②', '③', '④', '⑤'];
  const shortName = { kichu: '期中面談', kessan_mae: '決算前検討会', kessan_hokoku: '決算報告会', bank: '銀行対応' };

  let html = section(6, 'dot-6', '📥 事前準備・入力', MT_PREP_PAGES, false);
  MEETING_PRESETS.forEach((p, i) => {
    html += section(i + 1, `dot-${i + 1}`, `${NUM[i]} ${shortName[p.id] || p.name}`, presetPages(p), i === 0);
  });
  html += section(5, 'dot-5', `${NUM[4]} その他ツール`, MT_OTHER_PAGES, false);

  host.innerHTML = html;
}

// サイドバーはスクリプト読込時に生成（app.js の setupNav より前に DOM が必要）
_mtBuildSidebar();

// --- 状態（メモリのみ。面談は1回きりのセッションなので永続化しない） ---
window.MeetingMode = { active: false, presetId: null, stepIndex: 0, hintOpen: false, companyId: null };

function _mtPreset() {
  return MEETING_PRESETS.find(p => p.id === window.MeetingMode.presetId) || null;
}

// --- データ鮮度チェック ---
// 実績が入っている最終月を検出し、今日との差で ✅/⚠️/❌ を返す
function _mtDataStatus(budget) {
  if (!budget) return { level: 'none', label: '予算データがありません', detail: '推移表をアップロードしてください' };
  // 旧形式(actualThrough)の予算にも対応するため grid.js の getActualCols を優先使用
  const cols = (typeof getActualCols === 'function' ? getActualCols(budget) : budget.actualCols) || [];
  let lastIdx = -1;
  cols.forEach((v, i) => { if (v) lastIdx = i; });
  if (lastIdx < 0) return { level: 'none', label: '実績データがまだありません', detail: '推移表をアップロードしてください' };

  const startMonth = budget.startMonth || 4;
  const calMonth = ((startMonth - 1 + lastIdx) % 12) + 1;
  // 実績最終月の暦年を推定
  const yearBase = budget.year || new Date().getFullYear();
  const calYear = startMonth + lastIdx <= 12 ? yearBase : yearBase + 1;
  const lastDate = new Date(calYear, calMonth - 1, 1);
  const now = new Date();
  const monthsAgo = (now.getFullYear() - lastDate.getFullYear()) * 12 + (now.getMonth() - lastDate.getMonth());

  const label = `推移表: ${calYear}年${calMonth}月分までインポート済み`;
  if (monthsAgo <= 1) return { level: 'ok', label, detail: '' };
  return { level: 'warn', label, detail: `最新月が${monthsAgo}か月前です。新しい推移表のアップロードをおすすめします` };
}

// --- ミーティング準備画面（独立ページ） ---
function renderMeetingPrep(container) {
  const company = window.App?.currentCompany;
  const budget  = window.App?.currentBudget;

  if (!company) {
    container.innerHTML = `
      <div class="home-empty">
        <div style="font-size:56px;margin-bottom:20px">🤝</div>
        <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:10px">顧問先を選択してください</div>
        <button class="btn-solid" onclick="showPage('client_list')">顧問先一覧へ</button>
      </div>`;
    return;
  }

  const status = _mtDataStatus(budget);
  const statusIcon = { ok: '✅', warn: '⚠️', none: '❌' }[status.level];
  const statusColor = { ok: '#059669', warn: '#d97706', none: '#dc2626' }[status.level];

  // 前回使った面談タイプ
  let last = null;
  try { last = JSON.parse(localStorage.getItem(`meeting_last_used_${company.id}`) || 'null'); } catch {}
  const lastPreset = last ? MEETING_PRESETS.find(p => p.id === last.presetId) : null;

  const cards = MEETING_PRESETS.map(p => `
    <div class="mt-preset-card" data-mt-preset="${p.id}" onclick="_mtSelectPreset('${p.id}')"
         tabindex="0" role="button" onkeydown="if(event.key==='Enter'||event.key===' ')this.click()">
      <div style="font-size:30px">${p.icon}</div>
      <div style="font-weight:800;font-size:13px;margin-top:4px">${p.name}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px;line-height:1.5">${p.desc}</div>
    </div>`).join('');

  container.innerHTML = `
  <div class="mt-prep-page">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px">
      <div>
        <div style="font-size:20px;font-weight:800;color:var(--text)">🤝 ミーティング準備</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${escHtml(company.name)} ／ 面談の種類を選んで、流れに沿って説明できます</div>
      </div>
      ${lastPreset ? `<div style="font-size:12px;color:var(--text-muted)">前回: ${lastPreset.icon} ${lastPreset.name}（${new Date(last.date).toLocaleDateString('ja-JP')}）</div>` : ''}
    </div>

    <div class="card" style="padding:16px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:800;margin-bottom:8px">① データ確認</div>
      <div style="font-size:13px;color:${statusColor}">${statusIcon} ${escHtml(status.label)}</div>
      ${status.detail ? `<div style="margin-top:6px;font-size:12px;color:${statusColor}">${escHtml(status.detail)}
        <button class="btn btn-sm btn-outline" style="margin-left:8px" onclick="showPage('import')">📤 アップロードへ</button></div>` : ''}
    </div>

    <div class="card" style="padding:16px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:800;margin-bottom:10px">② 面談の種類を選択</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:12px">${cards}</div>
      <div id="mt_preset_preview"></div>
    </div>

    <div class="card" style="padding:16px">
      <div style="display:flex;gap:12px;align-items:center">
        <div style="font-size:13px;font-weight:800">③ 開始</div>
        <button class="btn-solid" id="mt_start_btn" disabled onclick="_mtStart()">▶ ミーティングを開始</button>
        <div style="font-size:11px;color:var(--text-muted)">開始すると画面上部にナビが表示され、「次へ→」で順番に画面が切り替わります（←/→キーでも操作可）</div>
      </div>
    </div>
  </div>`;

  // 前回のタイプを事前選択しておく
  if (lastPreset) _mtSelectPreset(lastPreset.id, true);
}

let _mtSelectedPreset = null;

function _mtSelectPreset(id, silent) {
  _mtSelectedPreset = id;
  document.querySelectorAll('.mt-preset-card').forEach(el =>
    el.classList.toggle('mt-selected', el.dataset.mtPreset === id));
  const btn = document.getElementById('mt_start_btn');
  if (btn) btn.disabled = false;

  const p = MEETING_PRESETS.find(x => x.id === id);
  const preview = document.getElementById('mt_preset_preview');
  if (p && preview) {
    const rows = p.steps.map((s, i) => `
      <div style="display:flex;gap:8px;align-items:baseline;padding:3px 0;font-size:12px">
        <span style="font-weight:700;color:var(--primary);min-width:18px">${i + 1}</span>
        <span>${escHtml(s.title)}</span>
        ${s.optional ? '<span style="font-size:10px;color:var(--text-muted);background:var(--surface-2);border-radius:8px;padding:1px 8px">任意</span>' : ''}
      </div>`).join('');
    preview.innerHTML = `
      <div style="background:var(--surface-2);border-radius:10px;padding:10px 14px;margin-bottom:10px">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:4px">${p.icon} ${p.name} — この面談で見る画面（${p.steps.length}ステップ）</div>
        ${rows}
      </div>`;
  }
}

// --- 面談の開始・終了・移動 ---
function _mtStart() {
  const company = window.App?.currentCompany;
  if (!company || !_mtSelectedPreset) return;
  window.MeetingMode = { active: true, presetId: _mtSelectedPreset, stepIndex: 0, hintOpen: false, companyId: company.id };
  try { localStorage.setItem(`meeting_last_used_${company.id}`, JSON.stringify({ presetId: _mtSelectedPreset, date: Date.now() })); } catch {}
  _mtGoStep(0);
}

function _mtEnd() {
  window.MeetingMode.active = false;
  const bar = document.getElementById('meeting_bar');
  if (bar) bar.remove();
  document.body.classList.remove('meeting-active');
  const mw = document.querySelector('.main-wrapper');
  if (mw) mw.style.paddingTop = '';
  // 準備画面に戻る
  showPage('meeting');
}

function _mtGoStep(i) {
  const p = _mtPreset();
  if (!p) return;
  window.MeetingMode.stepIndex = Math.max(0, Math.min(p.steps.length - 1, i));
  const step = p.steps[window.MeetingMode.stepIndex];
  if (typeof setPhase === 'function' && step.phase) setPhase(step.phase);
  showPage(step.page); // showPage 末尾の _meetingSync でバーが更新される
}

// --- 上部固定バー ---
function _mtRenderBar() {
  const mm = window.MeetingMode;
  const p = _mtPreset();
  if (!mm.active || !p) return;

  const step = p.steps[mm.stepIndex];
  const offFlow = window.App?.currentPage !== step.page;

  const dots = p.steps.map((s, i) => {
    const cls = i < mm.stepIndex ? 'mt-dot-done' : i === mm.stepIndex ? 'mt-dot-cur' : 'mt-dot-todo';
    return `<span class="mt-dot ${cls}" title="${i + 1}. ${escHtml(s.title)}" onclick="_mtGoStep(${i})"></span>`;
  }).join('<span class="mt-dot-line"></span>');

  const hints = (step.talk || []).map(t => `<li>${escHtml(t)}</li>`).join('');

  let bar = document.getElementById('meeting_bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'meeting_bar';
    bar.className = 'meeting-bar';
    document.body.appendChild(bar);
    document.body.classList.add('meeting-active');
  }
  // バーの実高さに合わせてコンテンツを下げる（ヒント展開・折返しで高さが変わるため実測）
  requestAnimationFrame(() => {
    const mw = document.querySelector('.main-wrapper');
    if (mw && bar.isConnected) mw.style.paddingTop = bar.offsetHeight + 'px';
  });

  bar.innerHTML = `
    <div class="mt-bar-row">
      <span class="mt-bar-title">${p.icon} ${p.name}</span>
      <span class="mt-dots">${dots}</span>
      <span class="mt-step-label">${mm.stepIndex + 1}/${p.steps.length}　${escHtml(step.title)}${step.optional ? '（任意）' : ''}</span>
      <span style="flex:1"></span>
      ${offFlow ? `<button class="btn btn-sm mt-btn-return" onclick="_mtGoStep(${mm.stepIndex})">↩ フローに戻る</button>` : ''}
      <button class="btn btn-sm btn-outline" onclick="_mtGoStep(${mm.stepIndex - 1})" ${mm.stepIndex === 0 ? 'disabled' : ''}>← 前へ</button>
      <button class="btn btn-sm btn-solid" onclick="_mtGoStep(${mm.stepIndex + 1})" ${mm.stepIndex >= p.steps.length - 1 ? 'disabled' : ''}>次へ →</button>
      <button class="btn btn-sm btn-outline" onclick="_mtToggleHint()">💬 ヒント</button>
      <button class="btn btn-sm btn-outline" onclick="_mtEnd()" title="ミーティングを終了">✕ 終了</button>
    </div>
    <div class="mt-hint" id="mt_hint" style="display:${mm.hintOpen ? 'block' : 'none'}">
      <div style="font-weight:700;font-size:11px;margin-bottom:4px">💬 この画面で話すこと</div>
      <ul style="margin:0;padding-left:18px">${hints || '<li>—</li>'}</ul>
    </div>`;
}

function _mtToggleHint() {
  window.MeetingMode.hintOpen = !window.MeetingMode.hintOpen;
  const el = document.getElementById('mt_hint');
  if (el) el.style.display = window.MeetingMode.hintOpen ? 'block' : 'none';
  // ヒント開閉でバーの高さが変わるためpaddingを再計算
  const bar = document.getElementById('meeting_bar');
  const mw = document.querySelector('.main-wrapper');
  if (bar && mw) mw.style.paddingTop = bar.offsetHeight + 'px';
}

// showPage() の末尾から呼ばれる同期フック
function _meetingSync() {
  const mm = window.MeetingMode;
  if (!mm.active) return;
  // 会社を切り替えたら自動終了（別会社のデータで話し続ける事故を防止）
  if (window.App?.currentCompany?.id !== mm.companyId) { _mtEnd(); return; }
  _mtRenderBar();
}

// キーボード操作（←/→）。入力中は無効
document.addEventListener('keydown', e => {
  if (!window.MeetingMode.active) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.key === 'ArrowRight') { e.preventDefault(); _mtGoStep(window.MeetingMode.stepIndex + 1); }
  if (e.key === 'ArrowLeft')  { e.preventDefault(); _mtGoStep(window.MeetingMode.stepIndex - 1); }
});

// --- スタイル（このファイルで完結させる） ---
(() => {
  const css = `
  .dot-4 { background:#f472b6 } .dot-5 { background:#a78bfa } .dot-6 { background:#94a3b8 }
  .mt-preset-card { border:2px solid var(--border,#e2e8f0); border-radius:12px; padding:10px; text-align:center;
    cursor:pointer; transition:border-color .15s, background .15s; user-select:none }
  .mt-preset-card:hover { border-color:var(--primary,#2563eb) }
  .mt-preset-card.mt-selected { border-color:var(--primary,#2563eb); background:var(--blue-50,#eff6ff) }

  /* z-index: モーダル(1000)・ハンバーガー(1100)・サイドバー(1060)より下に置く */
  .meeting-bar { position:fixed; top:0; left:var(--sidebar-w,224px); right:0; z-index:950;
    background:var(--surface,#fff); border-bottom:2px solid var(--primary,#2563eb);
    box-shadow:0 2px 8px rgba(0,0,0,.08); padding:6px 14px; font-size:12px }
  body.meeting-active .main-wrapper { padding-top:46px } /* フォールバック（実測値がJSで上書き） */
  .mt-bar-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap }
  .mt-bar-title { font-weight:800; white-space:nowrap }
  .mt-step-label { font-weight:700; color:var(--primary,#2563eb); white-space:nowrap }
  .mt-dots { display:flex; align-items:center }
  .mt-dot { width:10px; height:10px; border-radius:50%; cursor:pointer; flex-shrink:0 }
  .mt-dot-done { background:var(--primary,#2563eb); opacity:.45 }
  .mt-dot-cur  { background:var(--primary,#2563eb); outline:2px solid var(--blue-100,#dbeafe); outline-offset:1px }
  .mt-dot-todo { background:var(--border,#cbd5e1) }
  .mt-dot-line { width:10px; height:2px; background:var(--border,#cbd5e1); flex-shrink:0 }
  .mt-btn-return { background:#fef3c7; border:1px solid #f59e0b; color:#92400e }
  .mt-hint { background:var(--blue-50,#eff6ff); border-radius:8px; padding:8px 12px; margin-top:6px; font-size:12px }

  @media (max-width:900px) {
    .mt-dots { display:none }
    /* モバイルはサイドバーが隠れるので左端から。ハンバーガー(左上)と重ならないよう左に余白 */
    .meeting-bar { left:0; padding-left:52px }
  }
  @media print { .meeting-bar, .mt-prep-card { display:none !important } body.meeting-active .main-wrapper { padding-top:0 } }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
})();
