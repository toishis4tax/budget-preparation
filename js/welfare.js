// 法定福利費簡易計算

// 協会けんぽ保険料率（2024年度）標準的な値
const KENPO_RATES = {
  '北海道': { health: 0.1030, care: 0.0182 },
  '青森県': { health: 0.0988, care: 0.0182 },
  '岩手県': { health: 0.0994, care: 0.0182 },
  '宮城県': { health: 0.1009, care: 0.0182 },
  '秋田県': { health: 0.1010, care: 0.0182 },
  '山形県': { health: 0.0999, care: 0.0182 },
  '福島県': { health: 0.0965, care: 0.0182 },
  '茨城県': { health: 0.0975, care: 0.0182 },
  '栃木県': { health: 0.0979, care: 0.0182 },
  '群馬県': { health: 0.0979, care: 0.0182 },
  '埼玉県': { health: 0.0978, care: 0.0182 },
  '千葉県': { health: 0.0974, care: 0.0182 },
  '東京都': { health: 0.0982, care: 0.0182 },
  '神奈川県': { health: 0.0985, care: 0.0182 },
  '新潟県': { health: 0.0957, care: 0.0182 },
  '富山県': { health: 0.0959, care: 0.0182 },
  '石川県': { health: 0.0957, care: 0.0182 },
  '福井県': { health: 0.0951, care: 0.0182 },
  '山梨県': { health: 0.0977, care: 0.0182 },
  '長野県': { health: 0.0956, care: 0.0182 },
  '静岡県': { health: 0.0973, care: 0.0182 },
  '愛知県': { health: 0.0988, care: 0.0182 },
  '三重県': { health: 0.0971, care: 0.0182 },
  '滋賀県': { health: 0.0969, care: 0.0182 },
  '京都府': { health: 0.1008, care: 0.0182 },
  '大阪府': { health: 0.1008, care: 0.0182 },
  '兵庫県': { health: 0.1001, care: 0.0182 },
  '奈良県': { health: 0.0988, care: 0.0182 },
  '和歌山県': { health: 0.0951, care: 0.0182 },
  '鳥取県': { health: 0.0961, care: 0.0182 },
  '島根県': { health: 0.0953, care: 0.0182 },
  '岡山県': { health: 0.1007, care: 0.0182 },
  '広島県': { health: 0.0995, care: 0.0182 },
  '山口県': { health: 0.0997, care: 0.0182 },
  '徳島県': { health: 0.1009, care: 0.0182 },
  '香川県': { health: 0.1019, care: 0.0182 },
  '愛媛県': { health: 0.1006, care: 0.0182 },
  '高知県': { health: 0.1027, care: 0.0182 },
  '福岡県': { health: 0.1029, care: 0.0182 },
  '佐賀県': { health: 0.1033, care: 0.0182 },
  '長崎県': { health: 0.1000, care: 0.0182 },
  '熊本県': { health: 0.1000, care: 0.0182 },
  '大分県': { health: 0.1007, care: 0.0182 },
  '宮崎県': { health: 0.0987, care: 0.0182 },
  '鹿児島県': { health: 0.1000, care: 0.0182 },
  '沖縄県': { health: 0.0956, care: 0.0182 },
};

const KOSEI_RATE     = 0.183;   // 厚生年金保険料率（労使折半なので各9.15%）
const KODOMO_RATE    = 0.0036;  // 子ども・子育て拠出金（会社全額）
const PENSION_MAX_STD = 650000; // 厚生年金標準報酬月額上限
const HEALTH_MAX_STD  = 1390000; // 健康保険標準報酬月額上限

function calcSocialInsurance(salary, bonusAnnual, age, pref) {
  const rates = KENPO_RATES[pref] || KENPO_RATES['東京都'];

  // 標準報酬月額 (簡易: 給与＝標準報酬月額とみなす)
  const stdSalary = salary;
  const stdPension = Math.min(stdSalary, PENSION_MAX_STD);
  const stdHealth  = Math.min(stdSalary, HEALTH_MAX_STD);

  const careFlag = age >= 40 && age < 65;

  // 健康保険（労使折半）
  const healthTotal    = stdHealth * rates.health;
  const healthCompany  = Math.floor(healthTotal / 2);

  // 介護保険（40歳以上65歳未満、労使折半）
  const careTotal   = careFlag ? stdHealth * rates.care : 0;
  const careCompany = Math.floor(careTotal / 2);

  // 厚生年金（労使折半）
  const pensionTotal   = stdPension * KOSEI_RATE;
  const pensionCompany = Math.floor(pensionTotal / 2);

  // 子ども・子育て拠出金（会社全額）
  const kodomo = Math.floor(stdSalary * KODOMO_RATE);

  // 賞与（年1回として月割）
  const bonusMonth = bonusAnnual / 12;
  const stdBonusPension = Math.min(bonusMonth, PENSION_MAX_STD);
  const stdBonusHealth  = Math.min(bonusMonth, HEALTH_MAX_STD);
  const bonusHealthComp  = Math.floor(stdBonusHealth * rates.health / 2);
  const bonusCareComp    = careFlag ? Math.floor(stdBonusHealth * rates.care / 2) : 0;
  const bonusPensionComp = Math.floor(stdBonusPension * KOSEI_RATE / 2);
  const bonusKodomoComp  = Math.floor(stdBonusPension * KODOMO_RATE);

  const monthlyCompany = healthCompany + careCompany + pensionCompany + kodomo;
  const bonusCompany   = bonusHealthComp + bonusCareComp + bonusPensionComp + bonusKodomoComp;
  const annualCompany  = monthlyCompany * 12 + bonusCompany;

  return {
    health:   { rate: rates.health,  monthly: healthCompany  },
    care:     { rate: rates.care,    monthly: careCompany, applicable: careFlag },
    pension:  { rate: KOSEI_RATE,    monthly: pensionCompany },
    kodomo:   { rate: KODOMO_RATE,   monthly: kodomo },
    monthly:  monthlyCompany,
    annual:   annualCompany,
  };
}

function renderWelfare(container) {
  const prefs = Object.keys(KENPO_RATES);
  const prefOptions = prefs.map(p => `<option value="${p}"${p==='東京都'?' selected':''}>${p}</option>`).join('');

  container.innerHTML = `
    <div class="sim-panel">
      <h2 class="section-title">法定福利費簡易計算</h2>
      <div class="sim-grid">
        <div class="sim-inputs card">
          <h3>入力</h3>
          <div class="form-group">
            <label>月額給与（円）</label>
            <input type="number" id="wf_salary" value="300000" class="form-input" step="10000">
          </div>
          <div class="form-group">
            <label>賞与（年間合計額・円）</label>
            <input type="number" id="wf_bonus" value="600000" class="form-input" step="10000">
          </div>
          <div class="form-group">
            <label>年齢</label>
            <input type="number" id="wf_age" value="40" class="form-input" min="15" max="80">
          </div>
          <div class="form-group">
            <label>協会けんぽ（都道府県）</label>
            <select id="wf_pref" class="form-input">${prefOptions}</select>
          </div>
          <button class="btn btn-primary" onclick="runWelfare()">計算</button>
        </div>
        <div class="sim-results card">
          <h3>会社負担額（月額）</h3>
          <div id="wf_result"></div>
        </div>
      </div>
    </div>`;
  runWelfare();
}

function runWelfare() {
  const salary = parseFloat(document.getElementById('wf_salary')?.value || 300000);
  const bonus  = parseFloat(document.getElementById('wf_bonus')?.value  || 0);
  const age    = parseInt(document.getElementById('wf_age')?.value       || 40);
  const pref   = document.getElementById('wf_pref')?.value              || '東京都';

  const r = calcSocialInsurance(salary, bonus, age, pref);
  const el = document.getElementById('wf_result');
  if (!el) return;

  // 月別（賞与は年総額なので毎月ゼロ表示、参考表示）
  el.innerHTML = `
    <table class="result-table">
      <thead>
        <tr><th>保険種別</th><th>保険料率</th><th>月額会社負担</th></tr>
      </thead>
      <tbody>
        <tr><td>健康保険</td><td>${(r.health.rate*100).toFixed(3)}%（折半）</td><td class="num">${fmt(r.health.monthly)}</td></tr>
        <tr>
          <td>介護保険</td>
          <td>${r.care.applicable ? (r.care.rate*100).toFixed(3)+'%（折半）' : '対象外'}</td>
          <td class="num">${r.care.applicable ? fmt(r.care.monthly) : '－'}</td>
        </tr>
        <tr><td>厚生年金</td><td>${(r.pension.rate*100).toFixed(3)}%（折半）</td><td class="num">${fmt(r.pension.monthly)}</td></tr>
        <tr><td>子ども子育て拠出金</td><td>${(r.kodomo.rate*100).toFixed(3)}%（全額）</td><td class="num">${fmt(r.kodomo.monthly)}</td></tr>
        <tr class="total-row"><td colspan="2"><strong>月額合計</strong></td><td class="num"><strong>${fmt(r.monthly)}</strong></td></tr>
        <tr class="total-row"><td colspan="2"><strong>年間合計（賞与分含む）</strong></td><td class="num"><strong>${fmt(r.annual)}</strong></td></tr>
      </tbody>
    </table>
    <div class="wf-note">
      ※ 標準報酬月額は給与額をそのまま使用した概算値です。<br>
      ※ 健康保険の上限: ${fmt(HEALTH_MAX_STD)}、厚生年金の上限: ${fmt(PENSION_MAX_STD)}
    </div>
  `;
}
