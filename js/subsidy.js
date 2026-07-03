// ===== 補助金チェッカー =====
// 2025年度主要補助金データ（中小企業庁・各補助金公式サイトより）

const SUBSIDIES = [
  {
    id: 'monodukuri',
    name: 'ものづくり補助金',
    icon: '🏭',
    fullName: 'ものづくり・商業・サービス生産性向上促進補助金',
    maxAmount: 40000000,
    rate: '1/2（小規模事業者・再生事業者は2/3）',
    adoptionRate: 34,
    purpose: '設備投資・生産性向上',
    url: 'https://portal.monodukuri-hojo.jp/',
    conditions: {
      employees: [0, 99999],   // 制限なし
      capital: [0, 300000000], // 資本金3億円以下（中小企業）
      purposes: ['equipment', 'digital', 'new_product'],
      minInvestment: 1000000,
    },
    requirements: [
      '付加価値額の年率3%以上向上',
      '給与総額の年率1.5%以上向上',
      '経営革新等支援機関の確認書',
    ],
    schedule: '年3〜4回公募（次回2026年1月頃締切予定）',
    tip: '採択率は専門家サポートありで47〜57%に向上。経営革新計画の認定で加点。',
    tags: ['設備投資', '製造業', '生産性向上'],
  },
  {
    id: 'it_hojo',
    name: 'IT導入補助金',
    icon: '💻',
    fullName: 'IT導入補助金（インボイス枠・通常枠）',
    maxAmount: 4500000,
    rate: '1/2〜4/5（インボイス枠は最大3/4）',
    adoptionRate: 70,
    purpose: 'ITツール・業務システム導入',
    url: 'https://www.it-hojo.jp/',
    conditions: {
      employees: [0, 99999],
      capital: [0, 300000000],
      purposes: ['digital', 'invoice'],
      minInvestment: 50000,
    },
    requirements: [
      'IT導入支援事業者を通じた申請',
      'SECURITY ACTION二つ星以上（セキュリティ枠）',
    ],
    schedule: '随時公募（複数回）',
    tip: 'インボイス対応ソフトは採択率が最も高い。freee・弥生などのSaaSも対象。申請書類が少なく通りやすい。',
    tags: ['デジタル化', 'インボイス', 'SaaS'],
  },
  {
    id: 'jizokuka',
    name: '小規模事業者持続化補助金',
    icon: '🏪',
    fullName: '小規模事業者持続化補助金',
    maxAmount: 2500000,
    rate: '2/3',
    adoptionRate: 65,
    purpose: '販路開拓・マーケティング',
    url: 'https://r3.jizokukahojokin.info/',
    conditions: {
      employees: [0, 20],  // 製造業20人以下、商業・サービス業5人以下
      capital: [0, 999999999],
      purposes: ['marketing', 'equipment', 'digital'],
      minInvestment: 0,
    },
    requirements: [
      '小規模事業者（製造業20人以下、商業・サービス業5人以下）',
      '商工会・商工会議所の支援確認書',
      '経営計画書の作成',
    ],
    schedule: '年4〜6回公募',
    tip: '採択率60〜70%と最も通りやすい補助金の一つ。インボイス特例で+50万、賃金引上特例で+150万の上乗せ可能。',
    tags: ['小規模事業者', '販路開拓', '広告'],
  },
  {
    id: 'shosenka',
    name: '省力化投資補助金',
    icon: '🤖',
    fullName: '中小企業省力化投資補助事業',
    maxAmount: 10000000,
    rate: '1/2〜2/3',
    adoptionRate: 55,
    purpose: 'IoT・ロボット・AI導入による省人化',
    url: 'https://shoryokuka.smrj.go.jp/',
    conditions: {
      employees: [0, 99999],
      capital: [0, 300000000],
      purposes: ['equipment', 'digital'],
      minInvestment: 200000,
    },
    requirements: [
      'カタログ掲載製品・サービスが対象',
      '労働生産性の年率3%以上向上',
      '賃金引上げ要件',
    ],
    schedule: '随時（カタログ製品の発注で申請）',
    tip: '事業再構築補助金の後継。カタログ掲載製品に限定されるが採択が比較的容易。従業員数で補助上限が変わる（5人以下200万、21人以上1,000万）。',
    tags: ['省人化', 'ロボット', 'AI', '人手不足対応'],
  },
  {
    id: 'shoene',
    name: '省エネ補助金',
    icon: '♻️',
    fullName: '省エネルギー投資促進・非化石転換推進事業費補助金',
    maxAmount: 150000000,
    rate: '1/3〜2/3',
    adoptionRate: 50,
    purpose: '省エネ設備への更新・電化',
    url: 'https://shoene-hojyokin.sii.or.jp/',
    conditions: {
      employees: [0, 99999],
      capital: [0, 999999999],
      purposes: ['equipment', 'energy'],
      minInvestment: 1000000,
    },
    requirements: [
      '省エネ率15%以上の向上',
      'SIIへの登録事業者を通じた申請',
    ],
    schedule: '年1〜2回公募（例年3〜5月頃）',
    tip: '2025年から中小企業投資促進枠が新設され、省エネ要件が緩和。工場・事業場の空調・照明・コンプレッサー等が対象。',
    tags: ['省エネ', '脱炭素', '設備更新'],
  },
];

// ──────────────────────────────────────────
// レンダリング
// ──────────────────────────────────────────

function renderSubsidy(container) {
  const company = window.App?.currentCompany;

  const style = `<style>
.sub-wrap { max-width: 960px; margin: 0 auto; padding: 24px 16px; }
.sub-title { font-size: 22px; font-weight: 800; color: var(--text); margin-bottom: 4px; }
.sub-sub   { font-size: 13px; color: var(--text-muted); margin-bottom: 20px; line-height:1.6 }

/* フィルター */
.sub-filter { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:20px; }
.sub-filter-btn { padding:6px 14px; border-radius:99px; border:1.5px solid var(--border); background:transparent; color:var(--text-muted); font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; transition:.15s; }
.sub-filter-btn:hover, .sub-filter-btn.active { border-color:var(--primary); background:var(--primary-light); color:var(--primary); }

/* カード */
.sub-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap:16px; }
.sub-card { background:var(--surface-2); border:1px solid var(--border); border-radius:16px; padding:20px; transition:.15s; }
.sub-card:hover { border-color:var(--primary); box-shadow:0 4px 16px rgba(0,0,0,.08); }
.sub-card-head { display:flex; align-items:flex-start; gap:12px; margin-bottom:12px; }
.sub-icon { font-size:28px; flex-shrink:0; line-height:1; }
.sub-name { font-size:16px; font-weight:800; color:var(--text); }
.sub-fullname { font-size:11px; color:var(--text-muted); margin-top:2px; }

.sub-amount { font-size:22px; font-weight:900; color:var(--primary); }
.sub-amount-label { font-size:11px; color:var(--text-muted); }
.sub-rate { font-size:12px; color:var(--text); margin-top:2px; }

.sub-metrics { display:flex; gap:16px; margin:12px 0; padding:12px; background:var(--surface-3); border-radius:10px; }
.sub-metric { text-align:center; flex:1; }
.sub-metric-val { font-size:16px; font-weight:800; color:var(--text); }
.sub-metric-label { font-size:10px; color:var(--text-muted); }

.sub-adoption { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.sub-adoption-track { flex:1; height:6px; background:var(--border); border-radius:99px; overflow:hidden; }
.sub-adoption-fill  { height:100%; border-radius:99px; }
.adopt-hi  { background:#059669; }
.adopt-mid { background:#d97706; }
.adopt-lo  { background:#dc2626; }

.sub-req { font-size:12px; color:var(--text-muted); margin-bottom:8px; }
.sub-req-item { display:flex; gap:6px; align-items:baseline; margin-top:3px; }
.sub-req-item::before { content:'•'; color:var(--primary); flex-shrink:0; }

.sub-tip { font-size:12px; color:var(--text); background:var(--primary-light); border-radius:8px; padding:8px 12px; margin-top:8px; line-height:1.6; }

.sub-tags { display:flex; gap:4px; flex-wrap:wrap; margin-top:10px; }
.sub-tag  { font-size:10px; padding:2px 8px; border-radius:99px; background:var(--surface-3); color:var(--text-muted); }

.sub-footer { display:flex; justify-content:space-between; align-items:center; margin-top:12px; padding-top:12px; border-top:1px solid var(--border); }
.sub-schedule { font-size:11px; color:var(--text-muted); }
.sub-link { font-size:12px; font-weight:700; color:var(--primary); text-decoration:none; padding:5px 12px; border:1.5px solid var(--primary); border-radius:8px; }
.sub-link:hover { background:var(--primary-light); }

.sub-note { font-size:11px; color:var(--text-muted); margin-top:20px; line-height:1.8; padding-top:16px; border-top:1px solid var(--border); }
</style>`;

  const employees = company?.employees || 0;

  const FILTER_OPTIONS = [
    { key: 'all',        label: 'すべて' },
    { key: 'equipment',  label: '設備投資' },
    { key: 'digital',    label: 'デジタル化' },
    { key: 'marketing',  label: '販路開拓' },
    { key: 'energy',     label: '省エネ' },
    { key: 'invoice',    label: 'インボイス対応' },
  ];

  const fmtAmount = v => v >= 100000000
    ? (v / 100000000).toFixed(0) + '億円'
    : (v / 10000).toLocaleString() + '万円';

  const adoptColor = r => r >= 60 ? 'adopt-hi' : r >= 40 ? 'adopt-mid' : 'adopt-lo';

  const cardHtml = (s) => `
    <div class="sub-card">
      <div class="sub-card-head">
        <div class="sub-icon">${s.icon}</div>
        <div>
          <div class="sub-name">${s.name}</div>
          <div class="sub-fullname">${s.fullName}</div>
        </div>
      </div>

      <div style="display:flex;gap:16px;align-items:flex-end;margin-bottom:12px">
        <div>
          <div class="sub-amount-label">補助上限額</div>
          <div class="sub-amount">${fmtAmount(s.maxAmount)}</div>
          <div class="sub-rate">補助率 ${s.rate}</div>
        </div>
      </div>

      <div class="sub-adoption">
        <span style="font-size:11px;color:var(--text-muted);white-space:nowrap">採択率</span>
        <div class="sub-adoption-track">
          <div class="sub-adoption-fill ${adoptColor(s.adoptionRate)}" style="width:${s.adoptionRate}%"></div>
        </div>
        <span style="font-size:12px;font-weight:700;color:var(--text);white-space:nowrap">${s.adoptionRate}%</span>
      </div>

      <div class="sub-req">
        <div style="font-weight:700;color:var(--text);margin-bottom:4px">主な要件</div>
        ${s.requirements.map(r => `<div class="sub-req-item">${r}</div>`).join('')}
      </div>

      <div class="sub-tip">💡 ${s.tip}</div>

      <div class="sub-tags">${s.tags.map(t => `<span class="sub-tag">${t}</span>`).join('')}</div>

      <div class="sub-footer">
        <div class="sub-schedule">📅 ${s.schedule}</div>
        <a class="sub-link" href="${s.url}" target="_blank" rel="noopener">公式サイト →</a>
      </div>
    </div>`;

  const filterHtml = FILTER_OPTIONS.map(f =>
    `<button class="sub-filter-btn${f.key === 'all' ? ' active' : ''}" onclick="_subFilter('${f.key}', this)">${f.label}</button>`
  ).join('');

  const cardsHtml = SUBSIDIES.map(s => `<div class="sub-card-wrap" data-purposes="${s.conditions.purposes.join(',')}">${cardHtml(s)}</div>`).join('');

  container.innerHTML = style + `
<div class="sub-wrap">
  <div class="sub-title">🎁 補助金チェッカー</div>
  <div class="sub-sub">2025年度の主要5補助金を掲載。目的から絞り込んで、顧問先への提案にご活用ください。<br>補助金情報は変更される場合があります。申請前に必ず公式サイトで最新情報をご確認ください。</div>

  <div class="sub-filter">${filterHtml}</div>
  <div class="sub-grid" id="sub-grid">${cardsHtml}</div>

  <div class="sub-note">
    ※ 金額・採択率・スケジュールはすべて目安です（2025年調査時点）。実際の申請は各補助金の公式サイト・公募要領をご確認ください。<br>
    ※ ものづくり補助金採択率は第20〜21次公募実績（2025年）。IT導入補助金はインボイス枠の参考値。<br>
    ※ 補助金ポータル: <a href="https://mirasapo-plus.go.jp/" target="_blank" rel="noopener" style="color:var(--primary)">ミラサポplus</a> /
       <a href="https://j-net21.smrj.go.jp/" target="_blank" rel="noopener" style="color:var(--primary)">J-Net21</a>
  </div>
</div>`;
}

function _subFilter(key, btn) {
  document.querySelectorAll('.sub-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#sub-grid .sub-card-wrap').forEach(el => {
    if (key === 'all') {
      el.style.display = '';
    } else {
      const purposes = el.dataset.purposes.split(',');
      el.style.display = purposes.includes(key) ? '' : 'none';
    }
  });
}
