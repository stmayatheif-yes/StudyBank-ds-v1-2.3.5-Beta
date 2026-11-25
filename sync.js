/* ==========================================
   雲端同步（Google 登入 + Firestore）
   使用方式：把本檔放在 GitHub 專案根目錄，並在 index.html 的 </body> 前加上：
   <script type="module" src="sync.js"></script>
   （舊的 Firebase 測試程式請刪掉，本檔會自己初始化）
   ========================================== */

/*PURE-START*/
const STORE_KEYS = { chinese: "qb_study", english: "qb_study_english" };
const SETTING_KEYS = ["style", "bg_type", "bg_color_1", "bg_color_2", "text_color", "current_preset"];
const CUSTOM_KEYS = ["custom_gradients", "custom_solids"];
const MIN_MANUAL_QUESTIONS = 5;
const COOLDOWN_MS = 60 * 1000;

// 物件依 key 排序後轉字串，用來比較兩份資料是否相同
function canonical(v) {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
  }
  return JSON.stringify(v === undefined ? null : v);
}

function parseOr(raw, fallback) {
  try { const v = JSON.parse(raw); return v == null ? fallback : v; } catch (e) { return fallback; }
}

// 讀取本機目前狀態（records = 各科刷題紀錄；settings = 外觀設定與自定義顏色）
const TOOL_SYNC_KEYS = ["tools_attempts", "tools_tests", "tools_first_ts", "tools_first_en", "tools_baseline", "tools_baseline_en", "music_playlists"];

function readLocal(st) {
  const records = {};
  for (const k in STORE_KEYS) records[k] = parseOr(st.getItem(STORE_KEYS[k]), null);
  const settings = {};
  SETTING_KEYS.forEach(k => { settings[k] = st.getItem(k); });
  CUSTOM_KEYS.forEach(k => { settings[k] = parseOr(st.getItem(k), []); });
  const tools = {};
  TOOL_SYNC_KEYS.forEach(k => { const raw = st.getItem(k); if (raw != null) tools[k] = parseOr(raw, null); });
  return { records, settings, tools };
}

// 作答題數 = 各科 t 的總和
function answeredCount(snap) {
  let n = 0;
  for (const k in snap.records) n += (snap.records[k] && snap.records[k].t) || 0;
  return n;
}

// 把一份資料寫回本機（覆蓋本機時使用）
function writeLocal(snap, st) {
  for (const k in STORE_KEYS) {
    const v = snap.records[k];
    if (v == null) st.removeItem(STORE_KEYS[k]);
    else st.setItem(STORE_KEYS[k], JSON.stringify(v));
  }
  SETTING_KEYS.forEach(k => {
    const v = snap.settings[k];
    if (v == null) st.removeItem(k); else st.setItem(k, v);
  });
  CUSTOM_KEYS.forEach(k => st.setItem(k, JSON.stringify(snap.settings[k] || [])));
  TOOL_SYNC_KEYS.forEach(k => {
    const v = (snap.tools || {})[k];
    if (v == null) st.removeItem(k); else st.setItem(k, JSON.stringify(v));
  });
}

function canManualSync(snap, lastAt, now) {
  return answeredCount(snap) >= MIN_MANUAL_QUESTIONS && now - lastAt >= COOLDOWN_MS;
}

// 離開時自動同步：本機有變動，且不在冷卻中
function shouldAutoSync(snap, lastJson, lastAt, now) {
  return canonical(snap) !== lastJson && now - lastAt >= COOLDOWN_MS;
}
/*PURE-END*/
// ---------- Firebase ----------
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc }
  from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBv77zKJ-18WXYdv533TUoiBAyHNda24zk",
  authDomain: "github-studybank-v1.firebaseapp.com",
  projectId: "github-studybank-v1",
  storageBucket: "github-studybank-v1.firebasestorage.app",
  messagingSenderId: "583900786899",
  appId: "1:583900786899:web:a67cad692505871cf06426"
};
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- 狀態 ----------
const LAST_AT_KEY = "sync_last_at";
const LAST_JSON_KEY = "sync_last_json";
let user = null;
let pending = false;     // 登入後有出入，等待使用者選擇覆蓋方向
let cloudSnap = null;
let msgText = "";

const getLastAt = () => Number(localStorage.getItem(LAST_AT_KEY) || 0);
const getLastJson = () => localStorage.getItem(LAST_JSON_KEY) || "";
function markSynced(snap) {
  localStorage.setItem(LAST_AT_KEY, String(Date.now()));
  localStorage.setItem(LAST_JSON_KEY, canonical(snap));
}

// ---------- 雲端讀寫 ----------
function cloudAsSnap() {
  return { records: cloudSnap.records, settings: cloudSnap.settings, tools: cloudSnap.tools || {} };
}
const cloudRef = () => doc(db, "users", user.uid, "data", "sync");
async function fetchCloud() {
  const snap = await getDoc(cloudRef());
  return snap.exists() ? snap.data() : null;
}
async function uploadLocal(snap) {
  await setDoc(cloudRef(), { records: snap.records, settings: snap.settings, tools: snap.tools || {}, updatedAt: Date.now() });
}

// ---------- 確認彈窗（網站樣式，放在最上層） ----------
const confirmEl = document.createElement("div");
confirmEl.id = "syncConfirm";
confirmEl.className = "modal-overlay";
confirmEl.style.zIndex = "2000";
confirmEl.innerHTML = `
  <div class="modal-content" onclick="event.stopPropagation()" style="width:min(380px,90vw);text-align:center">
    <h3 id="scTitle" style="justify-content:center"></h3>
    <p id="scText" style="text-align:left;line-height:1.7;margin:8px 0 18px"></p>
    <div class="modal-actions" style="margin-top:0">
      <button class="go" id="scOk"></button>
      <button class="go" id="scCancel" style="background:var(--bd);color:var(--text-color);box-shadow:none">取消</button>
    </div>
  </div>`;
document.body.appendChild(confirmEl);

function askConfirm(title, text, okText) {
  return new Promise(resolve => {
    document.getElementById("scTitle").textContent = title;
    document.getElementById("scText").textContent = text;
    const ok = document.getElementById("scOk");
    const cancel = document.getElementById("scCancel");
    ok.textContent = okText;
    const done = v => {
      confirmEl.classList.remove("active");
      ok.onclick = cancel.onclick = confirmEl.onclick = null;
      resolve(v);
    };
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
    confirmEl.onclick = e => { if (e.target === confirmEl) done(false); };
    confirmEl.classList.add("active");
  });
}

// ---------- 同步頁（與設定頁相同方式，渲染在主畫面） ----------
function setMsg(t) { msgText = t || ""; const m = document.getElementById("syncMsg"); if (m) m.textContent = msgText; }
function cooldownLeft() {
  return Math.max(0, Math.ceil((COOLDOWN_MS - (Date.now() - getLastAt())) / 1000));
}
function syncBtn(label, onClick, extra) {
  const b = document.createElement("button");
  b.className = "go";
  b.textContent = label;
  b.style.cssText = "width:100%;margin-top:8px" + (extra || "");
  b.onclick = onClick;
  return b;
}
function helper(text) {
  const s = document.createElement("span");
  s.className = "helper-text";
  s.textContent = text;
  return s;
}
function sectionTitle(text) {
  const p = document.createElement("p");
  p.style.cssText = "font-weight:bold;font-size:1.1rem;margin:20px 0 0";
  p.textContent = text;
  return p;
}

function renderSyncPage() {
  const root = document.getElementById("app");
  root.innerHTML = "";
  const card = document.createElement("div");
  card.className = "card";
  const h = document.createElement("div");
  h.className = "header-row";
  h.innerHTML = "<h2>☁️ 雲端同步</h2>";
  card.appendChild(h);

  // 帳號
  card.appendChild(sectionTitle("🔐 帳號"));
  if (!user) {
    card.appendChild(helper("登入 Google 後，刷題紀錄與外觀設定可同步到雲端，換裝置也能繼續使用。未登入時仍可正常刷題，紀錄只存在本機。"));
    card.appendChild(syncBtn("登入／註冊（Google）", login));
  } else {
    const p = document.createElement("p");
    p.style.cssText = "margin:8px 0 0;line-height:1.7";
    p.textContent = "目前帳號：" + (user.email || "");
    card.appendChild(p);
    card.appendChild(syncBtn("登出", logout, ";background:var(--bd);color:var(--text-color);box-shadow:none"));
  }

  // 同步（只顯示目前可以用的按鈕）
  if (user) {
    card.appendChild(sectionTitle("🔄 同步"));
    if (pending) {
      card.appendChild(helper("雲端與本機的紀錄或設定不同，請選擇以哪一邊為準。按下後此操作無法復原。"));
      card.appendChild(syncBtn("覆蓋本機（拿雲端資料覆蓋本機）", overwriteLocal));
      card.appendChild(syncBtn("覆蓋雲端（拿本機資料覆蓋雲端）", overwriteCloud));
    } else {
      const n = answeredCount(readLocal(localStorage));
      const wait = cooldownLeft();
      if (n < MIN_MANUAL_QUESTIONS) {
        card.appendChild(helper("目前作答 " + n + " 題，作答滿 " + MIN_MANUAL_QUESTIONS + " 題才能手動同步。離開網站時仍會自動同步。"));
      } else if (wait > 0) {
        card.appendChild(helper("剛剛才同步過，" + wait + " 秒後可再次同步。"));
      } else {
        card.appendChild(helper("把目前本機的刷題紀錄與外觀設定同步到雲端（會覆蓋雲端的內容）。"));
        card.appendChild(syncBtn("同步刷題記錄", manualSync));
      }
    }
  }

  // 說明
  card.appendChild(sectionTitle("ℹ️ 說明"));
  card.appendChild(helper("同步內容：國文與英文的作答紀錄、錯題本、自定義顏色與目前的外觀設定。不包含深色／淺色模式。"));
  card.appendChild(helper("離開網站時會自動同步（有變動才同步，不受 5 題限制）。手動同步與離開同步共用 1 分鐘冷卻，避免重複進出造成濫用。"));

  const m = document.createElement("p");
  m.id = "syncMsg";
  m.style.cssText = "min-height:1.4em;margin:14px 0 0;font-size:.9rem;opacity:.85";
  m.textContent = msgText;
  card.appendChild(m);

  root.appendChild(card);
  window.scrollTo(0, 0);
}

// 開啟同步頁（仿照設定頁：隱藏科目切換列、側邊欄高亮「雲端同步」）
function openSyncPage() {
  // 離開學習工具頁：清掉工具頁的狀態與側邊欄高亮
  window.__extraPage = null;
  ["answers", "mock", "stats"].forEach(k => { const el = document.getElementById("nav_" + k); if (el) el.classList.remove("active"); });
  // 進入同步頁時，一併關掉仍開著的「選擇科目」彈窗（與設定頁相同）
  const sm = document.getElementById("subjectModal");
  if (sm) sm.classList.remove("active");
  const sb = document.getElementById("sidebar");
  if (sb && sb.classList.contains("active") && typeof toggleSidebar === "function") toggleSidebar();
  window.__syncActive = true;
  currentPage = "sync";
  document.getElementById("navHome").classList.remove("active");
  document.getElementById("navSettings").classList.remove("active");
  navSync.classList.add("active");
  document.getElementById("subjectNav").style.display = "none";
  setHash("sync");
  renderSyncPage();
}

// 側邊欄加入「雲端同步」（放在「設定」下面）
const navSettings = document.getElementById("navSettings");
const navSync = document.createElement("div");
navSync.className = "sidebar-item";
navSync.id = "navSync";
navSync.textContent = "☁️ 雲端同步";
navSync.onclick = () => switchPage("sync");
navSettings.insertAdjacentElement("afterend", navSync);

// 包住既有的 switchPage / go / home，讓同步頁與其他頁面可以互相切換
const _switchPage = switchPage;
switchPage = function (p) {
  if (p === "sync") { openSyncPage(); return; }
  window.__syncActive = false;
  navSync.classList.remove("active");
  return _switchPage(p);
};
const _go = go;
go = function (k, f) { window.__syncActive = false; navSync.classList.remove("active"); return _go(k, f); };
const _home = home;
home = function () {
  if (window.__syncActive) { renderSyncPage(); return; }   // 同步頁開啟中，任何回到首頁的呼叫都改為保持同步頁
  return _home();
};
// 同步頁開啟中，不讓「選擇科目」彈窗出現
const _openSubjectModal = openSubjectModal;
openSubjectModal = function () {
  if (location.hash === "#sync") { const sm = document.getElementById("subjectModal"); if (sm) sm.classList.remove("active"); return; }
  return _openSubjectModal();
};

// 保險：只要同步頁開啟中，「選擇科目」彈窗一出現就立刻關掉（不管是哪一段程式把它打開）
(function guardSubjectModal() {
  const sm = document.getElementById("subjectModal");
  if (!sm) return;
  new MutationObserver(() => {
    const syncOpen = window.__syncActive || location.hash === "#sync";
    if (syncOpen && sm.classList.contains("active")) sm.classList.remove("active");
  }).observe(sm, { attributes: true, attributeFilter: ["class"] });
})();

// 網址是 #sync 時直接開啟同步頁。主程式的初始化可能在之後才完成，所以在多個時間點都確認一次
function ensureSyncShown() {
  if (location.hash !== "#sync") return;
  const sm = document.getElementById("subjectModal");
  if (sm) sm.classList.remove("active");
  openSyncPage();
}
setTimeout(ensureSyncShown, 0);
setTimeout(ensureSyncShown, 300);
window.addEventListener("load", ensureSyncShown);

// ---------- 功能 ----------
async function login() {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { setMsg("登入失敗：" + e.code); renderSyncPage(); }
}
async function logout() {
  const ok = await askConfirm("登出", "確定要登出雲端帳號嗎？登出後仍可在本機刷題，但不會同步。", "登出");
  if (ok) await signOut(auth);
}

// 登入後：比對本機與雲端
async function checkAfterLogin() {
  cloudSnap = await fetchCloud();
  if (!cloudSnap) { pending = false; return; }
  const local = readLocal(localStorage);
  pending = canonical(local) !== canonical(cloudAsSnap());
  if (!pending) markSynced(local);
  else openSyncPage();
}

async function overwriteLocal() {
  const ok = await askConfirm("覆蓋本機", "確定要用雲端資料覆蓋本機嗎？本機目前的紀錄與設定會被取代，此操作無法復原。", "覆蓋本機");
  if (!ok) return;
  writeLocal(cloudAsSnap(), localStorage);
  markSynced(cloudAsSnap());
  location.reload();
}

async function overwriteCloud() {
  const ok = await askConfirm("覆蓋雲端", "確定要用本機資料覆蓋雲端嗎？雲端的紀錄會被取代，此操作無法復原。", "覆蓋雲端");
  if (!ok) return;
  const local = readLocal(localStorage);
  try {
    await uploadLocal(local);
    markSynced(local);
    pending = false;
    setMsg("已用本機資料覆蓋雲端");
  } catch (e) { setMsg("覆蓋失敗，請稍後再試"); }
  renderSyncPage();
}

async function manualSync() {
  const now = Date.now();
  const local = readLocal(localStorage);
  if (answeredCount(local) < MIN_MANUAL_QUESTIONS) {
    setMsg("刷題紀錄少於 " + MIN_MANUAL_QUESTIONS + " 題，暫時不能同步");
    renderSyncPage(); return;
  }
  if (now - getLastAt() < COOLDOWN_MS) {
    setMsg("操作太頻繁，請稍後再試");
    renderSyncPage(); return;
  }
  try {
    localStorage.setItem(LAST_AT_KEY, String(now));   // 先記下時間，防止連按
    await uploadLocal(local);
    markSynced(local);
    setMsg("已同步：" + new Date().toLocaleTimeString());
  } catch (e) {
    setMsg("同步失敗，資料仍保留在本機，請稍後再試");
  }
  renderSyncPage();
}

// 離開網站：有變動就自動同步（不受 5 題限制）；首次有出入還沒選擇時不動雲端
function autoSyncOnLeave() {
  if (!user || pending) return;
  const local = readLocal(localStorage);
  if (!shouldAutoSync(local, getLastJson(), getLastAt(), Date.now())) return;
  localStorage.setItem(LAST_AT_KEY, String(Date.now()));
  uploadLocal(local).then(() => markSynced(local)).catch(() => {});
}
window.addEventListener("pagehide", autoSyncOnLeave);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") autoSyncOnLeave(); });

// ---------- 啟動 ----------
onAuthStateChanged(auth, async (u) => {
  user = u;
  if (u) await checkAfterLogin();
  else { pending = false; cloudSnap = null; }
  if (window.__syncActive) renderSyncPage();
});
