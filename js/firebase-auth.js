// ===== Firebase 認証・同期 =====
// Firebase 10 compat API を使用

const _FB_VER = '10.14.1';
const _FB_BASE = `https://www.gstatic.com/firebasejs/${_FB_VER}`;

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAEhd_ZnY3ILg-uOvNBEsZBClXjlwjU2FY",
  authDomain: "budget-preparation-a9082.firebaseapp.com",
  projectId: "budget-preparation-a9082",
  storageBucket: "budget-preparation-a9082.firebasestorage.app",
  messagingSenderId: "309401787565",
  appId: "1:309401787565:web:76135bfca726487facba24",
};

// グローバル変数
window._fbAuth = null;
window._fbDb   = null;
window._currentFbUser = null; // { uid, email, name, role, allowedCompanyIds }

// ===== Firebase 初期化（スクリプトロード後） =====
function _fbInit() {
  if (firebase.apps.length === 0) firebase.initializeApp(FIREBASE_CONFIG);
  window._fbAuth = firebase.auth();
  window._fbDb   = firebase.firestore();

  // Googleプロバイダー
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ hd: '' }); // 任意ドメイン

  // ログインボタン
  const _loginBtn = document.getElementById('fb-login-btn');
  if (_loginBtn) _loginBtn.onclick = () => {
    window._fbAuth.signInWithPopup(provider).catch(e => {
      document.getElementById('fb-login-err').textContent = 'ログインに失敗しました: ' + e.message;
    });
  };

  // 認証状態の監視
  window._fbAuth.onAuthStateChanged(async user => {
    if (!user) {
      _showLoginOverlay();
      return;
    }
    try {
      await _onLoggedIn(user);
    } catch(e) {
      console.error('ログイン処理エラー:', e);
      document.getElementById('fb-login-err').textContent = 'データ読込エラー: ' + e.message;
      _showLoginOverlay();
    }
  });
}

// ===== ログイン後処理 =====
async function _onLoggedIn(fbUser) {
  const db = window._fbDb;

  // ユーザープロファイル取得 or 初回作成
  const userRef = db.collection('users').doc(fbUser.uid);
  const userSnap = await userRef.get();

  let profile;
  if (!userSnap.exists) {
    // 初回ログイン: setup/initialized が存在しない場合のみadmin（書き込み前にチェックして競合を最小化）
    const initSnap = await db.collection('setup').doc('initialized').get();
    const isFirst  = !initSnap.exists;
    if (isFirst) {
      await db.collection('setup').doc('initialized').set({ at: Date.now(), adminUid: fbUser.uid });
    }
    profile = {
      uid:   fbUser.uid,
      email: fbUser.email,
      name:  fbUser.displayName || fbUser.email,
      role:  isFirst ? 'admin' : 'pending',
      allowedCompanyIds: [],
      createdAt: Date.now(),
    };
    await userRef.set(profile);
  } else {
    profile = userSnap.data();
  }

  if (profile.role === 'pending') {
    _showLoginOverlay('アカウントは管理者の承認待ちです。管理者にご連絡ください。');
    return;
  }

  window._currentFbUser = profile;

  // データをFirestoreからlocalStorageへ同期
  await _pullFromFirestore(profile);

  // 会社フィルタを適用
  _applyCompanyFilter(profile);

  // UI: ユーザー名表示・ログアウトボタン
  _showUserBadge(profile);

  // ログインオーバーレイを非表示
  _hideLoginOverlay();

  // アプリ初期化（既存のinitApp関数を呼ぶ）
  if (typeof initApp === 'function') initApp();
}

// ===== Firestoreからデータ取得 → localStorage =====
async function _pullFromFirestore(profile) {
  const db = window._fbDb;
  try { await _pullFromFirestoreInner(profile, db); }
  catch(e) { console.warn('[firebase] Firestore pull失敗、ローカルデータを維持します:', e); }
}
async function _pullFromFirestoreInner(profile, db) {

  // 会社一覧
  // admin → 全件
  // staff で allowedCompanyIds あり → その会社のみ
  // staff で allowedCompanyIds 空 → 0件（明示的に許可されていない = アクセス不可）
  const companies = [];
  const budgetPromises = [];

  if (profile.role === 'admin') {
    const snap = await db.collection('companies').get();
    snap.forEach(doc => {
      companies.push(doc.data());
      budgetPromises.push(db.collection('budgets').where('companyId', '==', doc.id).get());
    });
  } else if (profile.allowedCompanyIds?.length > 0) {
    // Firestoreの`in`演算子は最大30件のため、30件ずつチャンクに分割して並列取得
    const ids = profile.allowedCompanyIds;
    const chunks = [];
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
    const snaps = await Promise.all(chunks.map(chunk =>
      db.collection('companies').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get()
    ));
    snaps.forEach(snap => snap.forEach(doc => {
      companies.push(doc.data());
      budgetPromises.push(db.collection('budgets').where('companyId', '==', doc.id).get());
    }));
  } else {
    // 許可会社ゼロ → Firestoreから何も取得しない（pending はここに到達しない）
    localStorage.setItem('budget_app_v1', JSON.stringify({ companies: [], budgets: [] }));
    localStorage.removeItem('revenue_clients_v1');
    return;
  }

  const budgetResults = await Promise.all(budgetPromises);
  const budgets = [];
  budgetResults.forEach(snap => {
    snap.forEach(doc => budgets.push(doc.data()));
  });

  // 非adminはlocalStorageを許可会社のデータだけで上書き（他ユーザーの残留データを排除）
  const existing = JSON.parse(localStorage.getItem('budget_app_v1') || '{"companies":[],"budgets":[]}');

  if (profile.role !== 'admin') {
    // 許可会社IDのセット
    const allowedIds = new Set(profile.allowedCompanyIds || []);
    // 既存ローカルデータから許可会社以外を除去してからマージ
    existing.companies = (existing.companies || []).filter(c => allowedIds.has(c.id));
    existing.budgets   = (existing.budgets   || []).filter(b => allowedIds.has(b.companyId));
  }

  if (companies.length > 0 || budgets.length > 0) {
    // Firestoreのデータとローカルをマージ（Firestoreが新しければ上書き）
    const mergedCompanies = [...existing.companies];
    companies.forEach(fc => {
      const idx = mergedCompanies.findIndex(c => c.id === fc.id);
      if (idx >= 0) {
        if ((fc.updatedAt || 0) > (mergedCompanies[idx].updatedAt || 0)) mergedCompanies[idx] = fc;
      } else {
        mergedCompanies.push(fc);
      }
    });
    const mergedBudgets = [...existing.budgets];
    budgets.forEach(fb => {
      const idx = mergedBudgets.findIndex(b => b.companyId === fb.companyId && b.year === fb.year);
      if (idx >= 0) {
        if ((fb.updatedAt || 0) > (mergedBudgets[idx].updatedAt || 0)) mergedBudgets[idx] = fb;
      } else {
        mergedBudgets.push(fb);
      }
    });
    localStorage.setItem('budget_app_v1', JSON.stringify({
      ...existing, companies: mergedCompanies, budgets: mergedBudgets
    }));
  }

  // ローカルにあってFirestoreにないデータをアップロード（初回移行）
  await _pushLocalToFirestore(existing, profile);

  // 顧問先売上データをFirestoreから同期
  await _pullRevenueFromFirestore(companies.map(c => c.id));
}

// ===== 顧問先売上データをFirestoreから取得 → localStorage =====
async function _pullRevenueFromFirestore(companyIds) {
  if (!companyIds.length) return;
  const db = window._fbDb;
  try {
    const chunks = [];
    for (let i = 0; i < companyIds.length; i += 30) chunks.push(companyIds.slice(i, i + 30));
    const snaps = await Promise.all(chunks.map(chunk =>
      db.collection('revenues').where('companyId', 'in', chunk).get()
    ));
    const allDocs = [];
    snaps.forEach(snap => snap.forEach(doc => allDocs.push(doc)));
    if (!allDocs.length) return;
    const raw = localStorage.getItem('revenue_clients_v1');
    const local = raw ? JSON.parse(raw) : {};
    allDocs.forEach(doc => {
      const d = doc.data();
      const key = `${d.companyId}_${d.year}`;
      const localMeta = local[`_meta_${key}`] || {};
      const localUpdatedAt = localMeta.updatedAt || 0;
      // リモートが厳密に新しい場合のみ上書き（>= だと同値のローカル編集を消しうる）
      if ((d.updatedAt || 0) > localUpdatedAt) {
        local[`_meta_${key}`] = { updatedAt: d.updatedAt };
        local[key] = d.clients || [];
      }
    });
    localStorage.setItem('revenue_clients_v1', JSON.stringify(local));
  } catch(e) {
    console.warn('Firestore revenue pull error:', e);
  }
}

// ===== ローカルデータをFirestoreへ初回移行 =====
async function _pushLocalToFirestore(existing, profile) {
  if (profile.role !== 'admin') return;
  const db = window._fbDb;
  const batch = db.batch();
  let count = 0;

  for (const c of (existing.companies || [])) {
    const ref = db.collection('companies').doc(c.id);
    const snap = await ref.get();
    if (!snap.exists) { batch.set(ref, c); count++; }
  }
  for (const b of (existing.budgets || [])) {
    const key = `${b.companyId}_${b.year}`;
    const ref = db.collection('budgets').doc(key);
    const snap = await ref.get();
    if (!snap.exists) { batch.set(ref, b); count++; }
  }
  if (count > 0) await batch.commit();
}

// ===== 顧問先売上データをFirestoreへ保存 =====
function fbSaveRevenue(companyId, year, clients, updatedAt) {
  if (!window._fbDb) return;
  const key = `${companyId}_${year}`;
  const ts = updatedAt || Date.now(); // ローカルmetaと同一のタイムスタンプを使う
  window._fbDb.collection('revenues').doc(key).set({
    companyId, year, clients, updatedAt: ts,
  }).catch(e => console.warn('Firestore revenue save error:', e));
}

// ===== Firestoreへ保存（非同期・非ブロッキング） =====
function fbSaveCompany(company) {
  if (!window._fbDb) return;
  window._fbDb.collection('companies').doc(company.id).set(company)
    .catch(e => console.warn('Firestore company save error:', e));
}

function fbSaveBudget(budget) {
  if (!window._fbDb) return;
  const key = `${budget.companyId}_${budget.year}`;
  window._fbDb.collection('budgets').doc(key).set(budget)
    .catch(e => console.warn('Firestore budget save error:', e));
}

function fbDeleteCompany(companyId) {
  if (!window._fbDb) return;
  const db = window._fbDb;
  db.collection('companies').doc(companyId).delete()
    .catch(e => console.warn('Firestore delete error:', e));
  // 関連予算を削除
  db.collection('budgets').where('companyId', '==', companyId).get()
    .then(snap => {
      const batch = db.batch();
      snap.forEach(doc => batch.delete(doc.ref));
      return batch.commit();
    }).catch(e => console.warn('Firestore budget delete error:', e));
  // 顧問先売上データを削除
  db.collection('revenues').where('companyId', '==', companyId).get()
    .then(snap => {
      const batch = db.batch();
      snap.forEach(doc => batch.delete(doc.ref));
      return batch.commit();
    }).catch(e => console.warn('Firestore revenues delete error:', e));
}

// ===== 会社フィルタ =====
function _applyCompanyFilter(profile) {
  if (profile.role === 'admin') return;
  // 非admin は allowedCompanyIds に含まれる会社のみ（空配列 = 0件）
  const allowed = new Set(profile.allowedCompanyIds || []);
  const _orig = window.getCompanies;
  window.getCompanies = function() {
    return _orig().filter(c => allowed.has(c.id));
  };
}

// ===== ログアウト =====
function fbLogout() {
  window._fbAuth.signOut().then(() => {
    window._currentFbUser = null;
    location.reload();
  });
}

// ===== 管理者パネル =====
async function showAdminPanel() {
  if (window._currentFbUser?.role !== 'admin') return;
  const db = window._fbDb;

  const usersSnap     = await db.collection('users').get();
  const companiesSnap = await db.collection('companies').get();

  const users     = [];
  const companies = [];
  usersSnap.forEach(d => users.push(d.data()));
  companiesSnap.forEach(d => companies.push(d.data()));

  const overlay = document.createElement('div');
  overlay.id = 'admin-panel-overlay';
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center`;

  overlay.innerHTML = `
  <div style="background:#fff;border-radius:12px;width:780px;max-width:96vw;max-height:90vh;overflow-y:auto;padding:24px;font-family:system-ui,sans-serif">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="margin:0;font-size:18px">👥 ユーザー管理</h2>
      <button onclick="document.getElementById('admin-panel-overlay').remove()" style="border:none;background:#f1f5f9;padding:6px 12px;border-radius:6px;cursor:pointer">閉じる</button>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#f8fafc">
          <th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0">名前</th>
          <th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0">メール</th>
          <th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0">役割</th>
          <th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0">アクセス可能クライアント</th>
          <th style="padding:8px;border-bottom:2px solid #e2e8f0"></th>
        </tr>
      </thead>
      <tbody>
        ${users.map(u => `
        <tr id="admin-row-${u.uid}" style="border-bottom:1px solid #f1f5f9">
          <td style="padding:8px">${escHtml(u.name || u.email)}</td>
          <td style="padding:8px;color:#64748b;font-size:12px">${escHtml(u.email)}</td>
          <td style="padding:8px">
            <select onchange="_adminSetRole('${escHtml(u.uid)}',this.value)" style="font-size:12px;padding:3px 6px;border:1px solid #e2e8f0;border-radius:4px">
              <option value="admin"   ${u.role==='admin'  ?'selected':''}>管理者</option>
              <option value="staff"   ${u.role==='staff'  ?'selected':''}>スタッフ</option>
              <option value="pending" ${u.role==='pending'?'selected':''}>承認待ち</option>
            </select>
          </td>
          <td style="padding:8px">
            ${u.role === 'admin'
              ? `<span style="font-size:11px;color:#0369a1;background:#e0f2fe;padding:3px 8px;border-radius:10px">全クライアント自動アクセス</span>`
              : `<div style="display:flex;flex-wrap:wrap;gap:4px;max-width:280px">
              ${companies.map(c => `
                <label style="display:flex;align-items:center;gap:3px;font-size:11px;white-space:nowrap">
                  <input type="checkbox" value="${c.id}"
                    ${(u.allowedCompanyIds||[]).includes(c.id)?'checked':''}
                    onchange="_adminToggleCompany('${escHtml(u.uid)}','${escHtml(c.id)}',this.checked)">
                  ${escHtml(c.name)}
                </label>`).join('')}
            </div>`}
          </td>
          <td style="padding:8px">
            <button onclick="_adminDeleteUser('${escHtml(u.uid)}')" style="background:#fee2e2;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;color:#dc2626">削除</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div style="margin-top:12px;font-size:11px;color:#94a3b8">変更は即時反映されます。ユーザーは次回ログイン時に適用されます。</div>
  </div>`;

  document.body.appendChild(overlay);
}

async function _adminSetRole(uid, role) {
  await window._fbDb.collection('users').doc(uid).update({ role });
}

async function _adminToggleCompany(uid, companyId, checked) {
  const ref  = window._fbDb.collection('users').doc(uid);
  const snap = await ref.get();
  const ids  = snap.data().allowedCompanyIds || [];
  const next = checked ? [...new Set([...ids, companyId])] : ids.filter(id => id !== companyId);
  await ref.update({ allowedCompanyIds: next });
}

async function _adminDeleteUser(uid) {
  if (!confirm('このユーザーを削除しますか？')) return;
  await window._fbDb.collection('users').doc(uid).delete();
  document.getElementById('admin-panel-overlay')?.remove();
  showAdminPanel();
}

// ===== UI ヘルパー =====
function _showLoginOverlay(msg) {
  document.getElementById('fb-login-overlay').style.display = 'flex';
  if (msg) document.getElementById('fb-login-err').textContent = msg;
}

function _hideLoginOverlay() {
  document.getElementById('fb-login-overlay').style.display = 'none';
}

function _showUserBadge(profile) {
  const el = document.getElementById('fb-user-badge');
  if (!el) return;
  const adminBtn = profile.role === 'admin'
    ? `<button onclick="showAdminPanel()" style="font-size:11px;background:var(--blue-100);border:1px solid var(--border);color:var(--primary);padding:3px 8px;border-radius:4px;cursor:pointer">👥 ユーザー管理</button>`
    : '';
  el.innerHTML = `
    <span style="font-size:12px;color:var(--text-muted)">${escHtml(profile.name)}</span>
    ${adminBtn}
    <button onclick="fbLogout()" style="font-size:11px;background:var(--surface-2);border:1px solid var(--border);color:var(--text);padding:3px 8px;border-radius:4px;cursor:pointer">ログアウト</button>`;
  el.style.display = 'flex';
}
