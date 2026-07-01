// ===== テーマシステム =====

const THEMES = [
  {
    id: 'default',
    label: 'クラシック',
    emoji: '🏢',
    colors: { bar: '#1e293b', body: '#f0f4f8', accent: '#2563eb', text: '#0f172a' },
  },
  {
    id: 'latte',
    label: 'ラテ',
    emoji: '☕',
    colors: { bar: '#2c1a0e', body: '#f5efe6', accent: '#92400e', text: '#2c1a0e' },
  },
];

// 現在のテーマキーを返す
function getCurrentTheme() {
  const saved = localStorage.getItem('app_theme') || 'default';
  // 廃止済みテーマが残っていたらデフォルトに戻す
  return THEMES.find(t => t.id === saved) ? saved : 'default';
}

// テーマを適用
function applyTheme(id) {
  const theme = THEMES.find(t => t.id === id) || THEMES[0];
  document.documentElement.setAttribute('data-theme', theme.id === 'default' ? '' : theme.id);
  document.body.setAttribute('data-theme', theme.id === 'default' ? '' : theme.id);
  localStorage.setItem('app_theme', theme.id);

  // ピッカーのアクティブ状態を更新
  document.querySelectorAll('.theme-card').forEach(el => {
    el.classList.toggle('active', el.dataset.themeId === theme.id);
  });

  // ボタンの絵文字更新
  const btn = document.getElementById('theme-picker-btn');
  if (btn) btn.textContent = theme.emoji + ' テーマ';
}

// ========== テーマピッカー UI ==========

function renderThemePicker() {
  // ボタンをヘッダーに挿入
  const spacer = document.querySelector('.header-spacer');
  if (!spacer || document.getElementById('theme-picker-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'theme-picker-btn';
  btn.textContent = '🎨 テーマ';
  spacer.after(btn);

  // パネル
  const panel = document.createElement('div');
  panel.id = 'theme-picker-panel';
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:13px;font-weight:700;color:var(--text)">テーマを選択</div>
      <button onclick="document.getElementById('theme-picker-panel').classList.remove('open')"
        style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--text-muted);line-height:1">×</button>
    </div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:4px">背景や色使いを変更できます</div>
    <div class="theme-grid">
      ${THEMES.map(t => `
        <div class="theme-card${getCurrentTheme() === t.id ? ' active' : ''}" data-theme-id="${t.id}"
          onclick="_onThemeClick('${t.id}')" title="${t.label}">
          <div class="theme-card-preview">
            <div class="theme-card-bar" style="background:${t.colors.bar}"></div>
            <div class="theme-card-body" style="background:${t.colors.body}">
              <div class="theme-card-emoji">${t.emoji}</div>
              <div class="theme-card-label" style="color:${t.colors.text}">${t.label}</div>
              <div style="width:20px;height:3px;border-radius:2px;background:${t.colors.accent};margin-top:2px"></div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  document.body.appendChild(panel);

  // 開閉
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const rect = btn.getBoundingClientRect();
    panel.style.top  = (rect.bottom + 8) + 'px';
    panel.style.right = (window.innerWidth - rect.right) + 'px';
    panel.classList.toggle('open');
  });
  document.addEventListener('click', e => {
    if (!panel.contains(e.target) && e.target !== btn) {
      panel.classList.remove('open');
    }
  });
}

function _onThemeClick(id) {
  applyTheme(id);
  // パネルを少し遅れて閉じる（選択したのが見えるように）
  setTimeout(() => {
    const p = document.getElementById('theme-picker-panel');
    if (p) p.classList.remove('open');
  }, 300);
}

// ========== 初期化 ==========

(function initTheme() {
  const saved = getCurrentTheme();
  if (saved && saved !== 'default') applyTheme(saved);
  // DOMが準備できたらピッカーを挿入
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderThemePicker);
  } else {
    renderThemePicker();
  }
})();
