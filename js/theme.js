// ===== テーマシステム =====

const THEMES = [
  {
    id: 'default',
    label: 'クラシック',
    emoji: '🏢',
    colors: { bar: '#1e293b', body: '#f0f4f8', accent: '#2563eb', text: '#0f172a' },
  },
  {
    id: 'ocean',
    label: '海',
    emoji: '🌊',
    colors: { bar: '#020d1a', body: '#051e38', accent: '#38bdf8', text: '#e0f2fe' },
    particles: 'bubbles',
  },
  {
    id: 'forest',
    label: '山',
    emoji: '🌲',
    colors: { bar: '#040f08', body: '#0e3318', accent: '#34d399', text: '#dcfce7' },
  },
  {
    id: 'poker',
    label: 'ポーカー',
    emoji: '🃏',
    colors: { bar: '#020b06', body: '#0e3320', accent: '#fbbf24', text: '#f0fdf4' },
  },
  {
    id: 'sakura',
    label: '夜桜',
    emoji: '🌸',
    colors: { bar: '#08030f', body: '#1e0935', accent: '#f472b6', text: '#fdf2f8' },
    particles: 'petals',
  },
  {
    id: 'sunset',
    label: '夕焼け',
    emoji: '🌅',
    colors: { bar: '#0f0500', body: '#7c2d12', accent: '#f97316', text: '#fff7ed' },
  },
  {
    id: 'space',
    label: '宇宙',
    emoji: '🌌',
    colors: { bar: '#010206', body: '#070d20', accent: '#a78bfa', text: '#e0e7ff' },
    particles: 'stars',
  },
  {
    id: 'latte',
    label: 'ラテ',
    emoji: '☕',
    colors: { bar: '#2c1a0e', body: '#f5efe6', accent: '#92400e', text: '#2c1a0e' },
  },
  {
    id: 'midnight',
    label: 'ミッドナイト',
    emoji: '🌙',
    colors: { bar: '#050508', body: '#0a0a0f', accent: '#7c7cff', text: '#e2e2f0' },
  },
];

let _particleTimer = null;
let _particleContainer = null;

// 現在のテーマキーを返す
function getCurrentTheme() {
  return localStorage.getItem('app_theme') || 'default';
}

// テーマを適用
function applyTheme(id) {
  const theme = THEMES.find(t => t.id === id) || THEMES[0];
  document.documentElement.setAttribute('data-theme', id === 'default' ? '' : id);
  document.body.setAttribute('data-theme', id === 'default' ? '' : id);
  localStorage.setItem('app_theme', id);

  // パーティクル更新
  _stopParticles();
  if (theme.particles) _startParticles(theme.particles);

  // ピッカーのアクティブ状態を更新
  document.querySelectorAll('.theme-card').forEach(el => {
    el.classList.toggle('active', el.dataset.themeId === id);
  });

  // ボタンの絵文字更新
  const btn = document.getElementById('theme-picker-btn');
  if (btn) btn.textContent = theme.emoji + ' テーマ';
}

// ========== パーティクル ==========

function _stopParticles() {
  clearInterval(_particleTimer);
  if (_particleContainer) {
    _particleContainer.remove();
    _particleContainer = null;
  }
}

function _startParticles(type) {
  _particleContainer = document.createElement('div');
  _particleContainer.id = 'particle-layer';
  _particleContainer.style.cssText = `
    position: fixed;
    left: var(--sidebar-w, 224px); right: 0;
    top: var(--header-h, 54px); bottom: 0;
    pointer-events: none; z-index: 1;
    overflow: hidden;
  `;
  document.body.appendChild(_particleContainer);

  const spawn = type === 'petals' ? _spawnPetal
               : type === 'bubbles' ? _spawnBubble
               : _spawnStar;

  // 初期配置
  for (let i = 0; i < (type === 'stars' ? 60 : 12); i++) {
    spawn(true);
  }

  if (type !== 'stars') {
    const interval = type === 'petals' ? 1200 : 1800;
    _particleTimer = setInterval(spawn, interval);
  }
}

function _spawnPetal(initial = false) {
  const el = document.createElement('div');
  const size = 6 + Math.random() * 8;
  const left = Math.random() * 100;
  const delay = initial ? Math.random() * 8 : 0;
  const dur = 6 + Math.random() * 6;
  const hue = 320 + Math.random() * 30;
  el.style.cssText = `
    position: absolute;
    left: ${left}%;
    top: -20px;
    width: ${size}px; height: ${size * 1.3}px;
    border-radius: 50% 0 50% 0;
    background: hsl(${hue},80%,78%);
    opacity: 0.7;
    animation: petalFall ${dur}s linear ${delay}s forwards;
  `;
  _particleContainer.appendChild(el);
  setTimeout(() => el.remove(), (dur + delay) * 1000 + 200);
}

function _spawnBubble(initial = false) {
  const el = document.createElement('div');
  const size = 4 + Math.random() * 10;
  const left = Math.random() * 100;
  const delay = initial ? Math.random() * 10 : 0;
  const dur = 8 + Math.random() * 8;
  el.style.cssText = `
    position: absolute;
    left: ${left}%;
    bottom: -20px;
    width: ${size}px; height: ${size}px;
    border-radius: 50%;
    border: 1px solid rgba(56,189,248,0.4);
    background: rgba(56,189,248,0.05);
    animation: floatUp ${dur}s ease-in ${delay}s forwards;
  `;
  _particleContainer.appendChild(el);
  setTimeout(() => el.remove(), (dur + delay) * 1000 + 200);
}

function _spawnStar(initial = false) {
  const el = document.createElement('div');
  const size = Math.random() < 0.15 ? 3 : Math.random() < 0.4 ? 2 : 1;
  const left = Math.random() * 100;
  const top  = Math.random() * 100;
  const delay = Math.random() * 5;
  const dur = 2 + Math.random() * 4;
  const bright = Math.random();
  el.style.cssText = `
    position: absolute;
    left: ${left}%; top: ${top}%;
    width: ${size}px; height: ${size}px;
    border-radius: 50%;
    background: ${bright > 0.8 ? '#fff' : bright > 0.5 ? 'rgba(167,139,250,.9)' : 'rgba(199,210,254,.6)'};
    animation: twinkle ${dur}s ease-in-out ${delay}s infinite;
  `;
  _particleContainer.appendChild(el);
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
