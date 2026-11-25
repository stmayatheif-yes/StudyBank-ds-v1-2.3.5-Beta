/* ==========================================
   英文單字（梯次一：瀏覽、排序、搜尋、收藏、不熟）
   使用方式：
   1. 把 vocab.json 放到 GitHub 專案根目錄（與 index.html 同層）
   2. 在 index.html 的 tools.js 之後加上：<script src="vocab.js"></script>
   ========================================== */

/*PURE-START*/
const VOCAB_STAR_KEY = "vocab_star";
const VOCAB_HARD_KEY = "vocab_hard";

// 排序：by = "alpha" 字母 ｜ "level" 等級；dir = "asc" 正序 ｜ "desc" 倒序
function sortVocab(list, by, dir) {
  const arr = list.slice().sort((a, b) => {
    const ea = a.en.toLowerCase(), eb = b.en.toLowerCase();
    if (by === "level") return (a.level - b.level) || (ea < eb ? -1 : ea > eb ? 1 : 0);
    return ea < eb ? -1 : ea > eb ? 1 : 0;
  });
  return dir === "desc" ? arr.reverse() : arr;
}

// 篩選：mode = "all" ｜ "star" 收藏 ｜ "hard" 不熟；query 搜尋英文或中文
function filterVocab(list, mode, stars, hards, query) {
  const q = (query || "").trim().toLowerCase();
  const sSet = new Set(stars), hSet = new Set(hards);
  return list.filter(w => {
    if (mode === "star" && !sSet.has(w.id)) return false;
    if (mode === "hard" && !hSet.has(w.id)) return false;
    if (q && !(w.en.toLowerCase().includes(q) || w.zh.includes(q))) return false;
    return true;
  });
}
/*PURE-END*/

// ---------- 狀態與資料 ----------
let VOCAB = null;                  // 單字全部資料（第一次進入單字頁才載入）
let vocabLoading = null;
const vocabUI = { by: "alpha", dir: "asc", mode: "all", query: "" };
const vocabRead = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; } };
const vocabWrite = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const vEsc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function loadVocab() {
  if (VOCAB) return Promise.resolve(VOCAB);
  if (!vocabLoading) vocabLoading = fetch("./vocab.json").then(r => { if (!r.ok) throw new Error("找不到 vocab.json"); return r.json(); })
    .then(d => { VOCAB = d; return d; })
    .catch(e => { vocabLoading = null; throw e; });
  return vocabLoading;
}

// ---------- 導覽 ----------
function setVocabNav(on) {
  const el = document.getElementById("navVocab");
  if (el) el.classList.toggle("active", on);
  ["navHome", "navSettings", "navSync", "nav_answers", "nav_mock", "nav_stats"].forEach(x => {
    const e = document.getElementById(x); if (e) e.classList.remove("active");
  });
}
async function openVocab() {
  const sm = document.getElementById("subjectModal"); if (sm) sm.classList.remove("active");
  const sb = document.getElementById("sidebar");
  if (sb && sb.classList.contains("active") && typeof toggleSidebar === "function") toggleSidebar();
  window.__syncActive = false;
  window.__extraPage = null;
  window.__vocabActive = true;
  cur = "english";
  currentPage = "vocab";
  document.getElementById("subjectNav").style.display = "none";
  setVocabNav(true);
  history.replaceState(null, "", "#vocab");
  removeVocabTabs();
  A.innerHTML = `<div class="card"><p class="meta"><span>載入單字中…</span></p></div>`;
  try {
    await loadVocab();
    if (window.__vocabActive) renderVocab();
  } catch (e) {
    A.innerHTML = `<div class="card"><h2>📚 英文單字</h2><p>無法載入單字資料：${vEsc(e.message)}</p><p class="meta"><span>請確認 vocab.json 已上傳到專案根目錄。</span></p></div>`;
  }
}
function closeVocabFlag() { window.__vocabActive = false; setVocabNav(false); removeVocabTabs(); }

// 底部橢圓：直接掛在 body 下，固定於視窗底部（不放在卡片裡，避免卡片的毛玻璃效果影響定位）
function vocabTabsEl() {
  let el = document.getElementById("vocabTabs");
  if (!el) { el = document.createElement("div"); el.id = "vocabTabs"; el.className = "v-tabs"; document.body.appendChild(el); }
  return el;
}
function removeVocabTabs() { const el = document.getElementById("vocabTabs"); if (el) el.remove(); }

// ---------- 單字頁 ----------
// 排序圖示：A~Z（字母）或 Level（等級），箭頭向上為正序、向下為倒序；字母倒序為 Z~A
function vocabSortIcon() {
  const alpha = vocabUI.by === "alpha", desc = vocabUI.dir === "desc";
  const label = alpha ? (desc ? "Z~A" : "A~Z") : "Level";
  const fs = alpha ? 11 : 9;
  return `<svg viewBox="0 0 56 44" width="46" height="36" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="4" y1="6" x2="30" y2="6"/><line x1="4" y1="14" x2="26" y2="14"/><line x1="12" y1="22" x2="24" y2="22"/>
    <text x="3" y="40" stroke="none" fill="currentColor" font-size="${fs}" font-family="inherit">${label}</text>
    <g transform="${desc ? "translate(0,44) scale(1,-1)" : ""}"><line x1="44" y1="6" x2="44" y2="40"/><polyline points="38,12 44,6 50,12"/></g>
  </svg>`;
}
function renderVocab() {
  const stars = vocabRead(VOCAB_STAR_KEY), hards = vocabRead(VOCAB_HARD_KEY);
  const starSet = new Set(stars), hardSet = new Set(hards);
  const list = sortVocab(filterVocab(VOCAB, vocabUI.mode, stars, hards, vocabUI.query), vocabUI.by, vocabUI.dir);
  const rows = list.map(w => `
    <div class="v-row">
      <div class="v-main">
        <div class="v-en"><span class="v-hard-mark">${hardSet.has(w.id) ? "❗" : ""}</span>${vEsc(w.en)} <span class="v-pos">${vEsc(w.pos)}</span></div>
        <div class="v-zh">${vEsc(w.zh)}</div>
      </div>
      <div class="v-level">L${w.level}</div>
      <button class="v-btn ${starSet.has(w.id) ? "on" : ""}" title="加入收藏" onclick="VocabUI.star(${w.id})">⭐</button>
      <button class="v-btn ${hardSet.has(w.id) ? "on-hard" : ""}" title="標註為不熟" onclick="VocabUI.hard(${w.id})">❗</button>
    </div>`).join("");
  const more = "";
  const sortIcon = vocabSortIcon();
  const tab = (k, label, n) => `<button class="v-tab ${vocabUI.mode === k ? "on" : ""}" onclick="VocabUI.mode('${k}')">${label}<span class="v-n">${n}</span></button>`;
  vocabTabsEl().innerHTML = `${tab("all", "全部", VOCAB.length)}${tab("star", "收藏", stars.length)}${tab("hard", "不熟", hards.length)}`;

  A.innerHTML = `
    <div class="card v-page">
      <div class="v-top">
        <div class="v-pill">
          <button class="v-seg ${vocabUI.by === "alpha" ? "on" : ""}" onclick="VocabUI.by('alpha')">字母</button>
          <button class="v-seg ${vocabUI.by === "level" ? "on" : ""}" onclick="VocabUI.by('level')">等級</button>
        </div>
        <button class="v-sort" title="切換正序／倒序" onclick="VocabUI.dir()">${sortIcon}</button>
        <button class="v-search" title="搜尋單字" onclick="VocabUI.search()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </button>
      </div>
      ${vocabUI.query ? `<div class="v-chip">搜尋：${vEsc(vocabUI.query)} <button onclick="VocabUI.clearQuery()">✕</button></div>` : ""}
      <button class="go" style="margin:0 0 12px" onclick="VTest.setup()">📝 測驗</button>
      <div class="v-legend"><span>⭐ 加入收藏</span><span>❗ 標註為不熟</span></div>
      <div class="v-list">${rows || `<p class="meta"><span>沒有符合條件的單字。</span></p>`}</div>
      ${more}
      <button class="go" style="margin-top:12px" onclick="VocabUI.back()">← 返回英文刷題</button>
    </div>`;
  window.scrollTo(0, 0);
  bindShrink();
}

// 底部橢圓：滑動時縮小，停止後恢復
let shrinkTimer = null;
function bindShrink() {
  if (window.__vocabShrinkBound) return;
  window.__vocabShrinkBound = true;
  window.addEventListener("scroll", () => {
    if (!window.__vocabActive) return;
    const el = document.getElementById("vocabTabs"); if (!el) return;
    el.classList.add("shrink");
    clearTimeout(shrinkTimer);
    shrinkTimer = setTimeout(() => el.classList.remove("shrink"), 180);
  }, { passive: true });
}

// ---------- 彈窗 ----------
function vModal(id) {
  let m = document.getElementById(id);
  if (!m) {
    m = document.createElement("div");
    m.id = id; m.className = "modal-overlay"; m.style.zIndex = "1400";
    m.onclick = e => { if (e.target === m) m.classList.remove("active"); };
    document.body.appendChild(m);
  }
  return m;
}
function openVocabPrompt() {
  const m = vModal("vocabPrompt");
  m.innerHTML = `<div class="modal-content" onclick="event.stopPropagation()" style="width:min(360px,90vw);text-align:center">
    <h3 style="justify-content:center">進入英文單字？</h3>
    <p style="text-align:left;line-height:1.7">也可以從側邊欄的「單字」進入。</p>
    <div class="modal-actions" style="margin-top:8px">
      <button class="go" onclick="document.getElementById('vocabPrompt').classList.remove('active');VocabUI.open()">進入</button>
      <button class="go" style="background:var(--bd);color:var(--text-color);box-shadow:none" onclick="document.getElementById('vocabPrompt').classList.remove('active')">取消</button>
    </div></div>`;
  m.classList.add("active");
}
function openSearch() {
  const m = vModal("vocabSearch");
  m.innerHTML = `<div class="modal-content" onclick="event.stopPropagation()" style="width:min(420px,92vw)">
    <h3>搜尋單字</h3>
    <div style="display:flex;gap:8px;margin-top:8px">
      <input type="text" id="vSearchInput" placeholder="輸入英文或中文" value="${vEsc(vocabUI.query)}" style="flex:1;margin:0"
        onkeypress="if(event.key==='Enter')VocabUI.doSearch()">
      <button onclick="VocabUI.doSearch()" style="margin:0;background:var(--ac);color:#fff;border:none;flex-shrink:0">搜尋</button>
    </div>
    <div class="modal-actions"><button class="go" style="background:var(--bd);color:var(--text-color);box-shadow:none" onclick="document.getElementById('vocabSearch').classList.remove('active')">關閉</button></div>
  </div>`;
  m.classList.add("active");
  setTimeout(() => { const i = document.getElementById("vSearchInput"); if (i) i.focus(); }, 100);
}

// ---------- 介面操作 ----------
const VocabUI = {
  open() { openVocab(); },
  prompt() { openVocabPrompt(); },
  back() { closeVocabFlag(); cur = "english"; go("english"); },
  by(k) { vocabUI.by = k; renderVocab(); },
  dir() { vocabUI.dir = vocabUI.dir === "asc" ? "desc" : "asc"; renderVocab(); },
  mode(k) { vocabUI.mode = k; renderVocab(); },
  search() { openSearch(); },
  doSearch() {
    const v = (document.getElementById("vSearchInput").value || "").trim();
    vocabUI.query = v;
    document.getElementById("vocabSearch").classList.remove("active");
    renderVocab();
  },
  clearQuery() { vocabUI.query = ""; renderVocab(); },
  star(id) {
    const a = vocabRead(VOCAB_STAR_KEY), i = a.indexOf(id);
    if (i >= 0) a.splice(i, 1); else a.push(id);
    vocabWrite(VOCAB_STAR_KEY, a); renderVocab();
  },
  hard(id) {
    const a = vocabRead(VOCAB_HARD_KEY), i = a.indexOf(id);
    if (i >= 0) a.splice(i, 1); else a.push(id);
    vocabWrite(VOCAB_HARD_KEY, a); renderVocab();
  }
};
window.VocabUI = VocabUI;

// ---------- 樣式 ----------
const vocabCss = document.createElement("style");
vocabCss.textContent = `
  .v-top{display:flex;gap:10px;align-items:center;margin-bottom:12px}
  .v-pill{display:flex;flex:1;align-items:center;border:1px solid var(--bd);border-radius:999px;background:var(--card);overflow:hidden;padding:3px}
  .v-seg{flex:1;padding:8px 10px;border:none;border-radius:999px;background:transparent;box-shadow:none;margin:0;font-size:.9rem;color:var(--text-color)}
  .v-seg.on{background:#3b82f6;color:#fff}
  .v-dir{flex:1.6;font-weight:bold}
  .v-search{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;padding:0;margin:0;flex-shrink:0}
  .v-search svg{width:20px;height:20px}
  .v-chip{display:inline-flex;gap:6px;align-items:center;padding:4px 10px;border-radius:999px;background:var(--bg);border:1px solid var(--bd);font-size:.85rem;margin-bottom:8px}
  .v-chip button{padding:0 4px;border:none;background:transparent;box-shadow:none;margin:0}
  .v-legend{display:flex;justify-content:flex-end;gap:12px;font-size:.8rem;opacity:.7;margin-bottom:8px}
  .v-row{display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px dashed var(--bd)}
  .v-main{flex:1;min-width:0}
  .v-en{font-weight:bold;font-size:1.05rem}
  .v-pos{font-weight:normal;font-size:.8rem;opacity:.6;margin-left:4px}
  .v-zh{font-size:.9rem;opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .v-hard-mark{margin-right:4px}
  .v-level{font-size:.75rem;opacity:.6;min-width:26px;text-align:center}
  .v-btn{width:38px;height:38px;border-radius:50%;padding:0;margin:0;box-shadow:none;font-size:1rem;opacity:.35;flex-shrink:0}
  .v-btn.on{opacity:1;background:color-mix(in srgb,#facc15 30%,var(--card))}
  .v-btn.on-hard{opacity:1;background:color-mix(in srgb,var(--no) 25%,var(--card))}
  .v-tabs{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);transform-origin:center bottom;z-index:50;display:flex;justify-content:center;gap:6px;padding:6px;width:max-content;max-width:calc(100% - 24px);border-radius:999px;border:1px solid var(--bd);background:var(--card);box-shadow:var(--shadow);transition:transform .25s ease,opacity .25s ease}
  .v-tabs.shrink{transform:translateX(-50%) scale(.82);opacity:.9}
  /* 底部橢圓跟著風格：柔光玻璃 / 液態玻璃 */
  html[data-style="glass"] .v-tabs,
  html[data-style="liquid"] .v-tabs {
    background: rgba(255,255,255,.4) !important;
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(255,255,255,.6) !important;
    box-shadow: 0 8px 32px rgba(0,0,0,.08), inset 0 1px 0 rgba(255,255,255,.6) !important;
  }
  html[data-theme="dark"][data-style="glass"] .v-tabs,
  html[data-theme="dark"][data-style="liquid"] .v-tabs {
    background: rgba(31,41,55,.4) !important;
    border: 1px solid rgba(255,255,255,.15) !important;
    box-shadow: 0 8px 32px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.14) !important;
  }
  html[data-style="liquid"][data-liquid="on"] .v-tabs {
    backdrop-filter: url(#liquid-glass) blur(10px) saturate(180%);
    -webkit-backdrop-filter: url(#liquid-glass) blur(10px) saturate(180%);
  }
  .v-page{padding-bottom:110px}
  .v-row{content-visibility:auto;contain-intrinsic-size:auto 64px}
  .v-sort{width:56px;height:48px;border-radius:12px;padding:0;margin:0;box-shadow:none;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .v-sort svg{width:46px;height:36px}
  .v-tab{padding:8px 16px;border-radius:999px;border:none;background:transparent;box-shadow:none;margin:0;font-size:.95rem}
  .v-tab.on{background:#3b82f6;color:#fff}
  .v-n{margin-left:6px;font-size:.75rem;opacity:.75}
  .v-entry .go{margin-top:12px}
  .vt-label{font-weight:bold;margin:14px 0 6px;font-size:.95rem}
  .vt-grid{display:flex;flex-wrap:wrap;gap:8px}
  .vt-chip{padding:8px 14px;border-radius:999px;margin:0;font-size:.9rem}
  .vt-chip.on{background:#3b82f6;color:#fff;border-color:transparent}
  .vt-matchgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
  .vt-match{width:100%;margin:0;padding:8px 6px;font-size:.85rem;border-radius:10px;text-align:center}
  .vt-match.sel{background:#3b82f6;color:#fff}
  .vt-match.done{opacity:.35;background:var(--ok);color:#fff}
  .v-wrong{padding:8px 0;border-bottom:1px dashed var(--bd);font-size:.9rem}
`;
document.head.appendChild(vocabCss);

// ---------- 英文刷題首頁：入口卡片 ----------
function addVocabEntry() {
  if (cur !== "english" || window.__vocabActive) return;
  const first = document.querySelector("#app .card");
  if (!first || document.querySelector(".v-entry")) return;
  first.insertAdjacentHTML("afterend", `
    <div class="card v-entry">
      <div class="header-row"><h2>📚 英文單字</h2></div>
      <p class="meta"><span>學測 6012 個單字｜依字母或等級瀏覽｜收藏與不熟標記</span></p>
      <button class="go" onclick="VocabUI.prompt()">進入</button>
    </div>`);
}

// ---------- 側邊欄「單字」 ----------
const _vStatsNav = document.getElementById("nav_stats") || document.getElementById("navSettings");
const navVocab = document.createElement("div");
navVocab.className = "sidebar-item";
navVocab.id = "navVocab";
navVocab.textContent = "📚 單字";
navVocab.onclick = () => switchPage("vocab");
_vStatsNav.insertAdjacentElement("afterend", navVocab);


// ==========================================
// 梯次一／二：測驗（英選中、中選英、中文拼英文、10 個配對）
// ==========================================
/*TEST-PURE-START*/
// 可接受的英文答案：完整寫法、斜線分隔的各個寫法、括號內的同義寫法
function acceptSet(en) {
  const set = new Set();
  const full = String(en).trim().toLowerCase().replace(/\s+/g, " ");
  set.add(full);
  const outer = full.replace(/\([^)]*\)/g, "").trim();
  outer.split("/").map(x => x.trim()).filter(Boolean).forEach(x => set.add(x));
  (full.match(/\(([^)]*)\)/g) || []).forEach(g => g.slice(1, -1).split(",").map(x => x.trim()).filter(Boolean).forEach(x => set.add(x)));
  return set;
}
function isAnswerOk(en, input) {
  const t = String(input || "").trim().toLowerCase().replace(/\s+/g, " ");
  return t !== "" && acceptSet(en).has(t);
}
// 字母模式：依字首（忽略開頭的非英文字母）；等級模式：依 level
function poolFor(all, by, vals) {
  const list = Array.isArray(vals) ? vals : (vals == null || vals === "all" ? [] : [vals]);
  if (by === "all" || list.length === 0) return all.slice();
  if (by === "alpha") {
    const set = new Set(list.map(x => String(x).toLowerCase()));
    return all.filter(w => set.has((w.en.replace(/^[^a-zA-Z]+/, "")[0] || "").toLowerCase()));
  }
  const set = new Set(list.map(String));
  return all.filter(w => set.has(String(w.level)));
}
// 隨機取不重複的 n 個
function pickN(arr, n, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}
// 干擾選項：從 pool（不夠則用全部）取不同的答案，不包含正確答案
function distractors(correctW, pool, all, key, n, rnd) {
  let src = pool.filter(w => w.id !== correctW.id && w[key] !== correctW[key]);
  if (src.length < n) src = all.filter(w => w.id !== correctW.id && w[key] !== correctW[key]);
  const seen = new Set([correctW[key]]);
  const out = [];
  for (const w of pickN(src, src.length, rnd)) {
    if (seen.has(w[key])) continue;
    seen.add(w[key]); out.push(w[key]);
    if (out.length === n) break;
  }
  return out;
}
// 計分：一個選項題或拼字題答對與否；配對題需全部配對且沒有錯誤
function gradeTest(qs, answers) {
  let correct = 0; const wrong = [];
  qs.forEach((q, i) => {
    const a = answers[i];
    let ok = false;
    if (q.kind === "choice") ok = a === q.answerIdx;
    else if (q.kind === "type") ok = isAnswerOk(q.en, a);
    else if (q.kind === "match") ok = a && a.mistakes === 0;
    if (ok) correct++; else wrong.push({ i, q, a });
  });
  return { correct, total: qs.length, wrong };
}
/*TEST-PURE-END*/

// ---------- 測驗：題目產生 ----------
const VTEST = { type: "en2zh", by: "all", val: [], n: 3, qs: [], answers: [], idx: 0 };
function buildTestQuestions(all, type, by, val, n, rnd) {
  const pool = poolFor(all, by, val);
  if (type === "match") {
    const qs = [];
    for (let r = 0; r < n; r++) {
      const words = pickN(pool, 10, rnd);
      qs.push({ kind: "match", words });
    }
    return qs;
  }
  const picked = pickN(pool, n, rnd);
  return picked.map(w => {
    if (type === "typing") return { kind: "type", zh: w.zh, en: w.en, id: w.id };
    const isEn2Zh = type === "en2zh";
    const key = isEn2Zh ? "zh" : "en";
    const wrongs = distractors(w, pool, all, key, 3, rnd);
    const opts = pickN([w[key], ...wrongs], 4, rnd);
    return { kind: "choice", prompt: isEn2Zh ? w.en : w.zh, options: opts, answerIdx: opts.indexOf(w[key]), en: w.en, zh: w.zh, id: w.id };
  });
}
const TEST_NAME = { en2zh: "英選中", zh2en: "中選英", typing: "中文拼英文", match: "10 個配對" };
const TEST_LIMIT_KEY = "vocab_tests";

// ---------- 測驗設定彈窗（與隨機刷題相同的數量選擇方式） ----------
const TEST_PRESETS = [3, 10, 20, 30, 40, 50, 100];
function testLimit() {
  const pool = poolFor(VOCAB, VTEST.by, VTEST.val).length;
  return VTEST.type === "match" ? Math.floor(pool / 10) : pool;
}
function openTestSetup() {
  const m = vModal("vTestSetup");
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const rangeBtns = VTEST.by === "alpha"
  ? `<div class="vt-grid">${["ALL", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map(l => {
      const on = l === "ALL" ? VTEST.val.length === 0 : VTEST.val.includes(l);
      return `<button class="vt-chip ${on ? "on" : ""}" onclick="VTest.setVal('${l}')">${l === "ALL" ? "全部" : l}</button>`;
    }).join("")}</div>`
  : VTEST.by === "level"
    ? `<div class="vt-grid">${["ALL", 1, 2, 3, 4, 5, 6].map(l => {
        const on = l === "ALL" ? VTEST.val.length === 0 : VTEST.val.includes(l);
        return `<button class="vt-chip ${on ? "on" : ""}" onclick="VTest.setVal('${l}')">${l === "ALL" ? "全部" : "Level " + l}</button>`;
      }).join("")}</div>`
    : "";
  m.innerHTML = `<div class="modal-content" onclick="event.stopPropagation()" style="width:min(460px,92vw);max-height:86vh;overflow-y:auto">
    <h3>📝 測驗設定</h3>
    <p class="vt-label">測驗方式</p>
    <div class="vt-grid">${Object.keys(TEST_NAME).map(k => `<button class="vt-chip ${VTEST.type === k ? "on" : ""}" onclick="VTest.setType('${k}')">${TEST_NAME[k]}</button>`).join("")}</div>
    <p class="vt-label">範圍</p>
    <div class="vt-grid">
      <button class="vt-chip ${VTEST.by === "all" ? "on" : ""}" onclick="VTest.setBy('all')">全部</button>
      <button class="vt-chip ${VTEST.by === "alpha" ? "on" : ""}" onclick="VTest.setBy('alpha')">字母 A~Z</button>
      <button class="vt-chip ${VTEST.by === "level" ? "on" : ""}" onclick="VTest.setBy('level')">等級 1~6</button>
    </div>
    ${rangeBtns}
    <p class="vt-label">題數（配對為回合數，每回合 10 個單字）</p>
    <div class="vt-grid">${TEST_PRESETS.map(n => `<button class="vt-chip ${VTEST.n === n ? "on" : ""}" onclick="VTest.setN(${n})">${n}</button>`).join("")}</div>
    <input type="number" id="vtInput" min="1" placeholder="可輸入自訂題目數" style="width:100%;box-sizing:border-box;margin-top:10px;text-align:center" oninput="VTest.typedN()">
    <p id="vtMsg" style="color:var(--no);min-height:1.2em;margin:8px 0 0;font-size:.9rem"></p>
    <p class="meta" style="margin:4px 0 0"><span>可選範圍內單字：${testLimit()} ${VTEST.type === "match" ? "（可出 " + testLimit() + " 回合）" : ""}</span></p>
    <div class="modal-actions">
      <button class="go" onclick="VTest.confirm()">確認</button>
      <button class="go" style="background:var(--bd);color:var(--text-color);box-shadow:none" onclick="document.getElementById('vTestSetup').classList.remove('active')">取消</button>
    </div></div>`;
  m.classList.add("active");
}
function refreshSetup() { if (document.getElementById("vTestSetup")?.classList.contains("active")) openTestSetup(); }

// ---------- 測驗頁 ----------
function startTest(n) {
  const rnd = Math.random;
  VTEST.qs = buildTestQuestions(VOCAB, VTEST.type, VTEST.by, VTEST.val, n, rnd);
  VTEST.answers = []; VTEST.idx = 0;
  window.__vtestActive = true;
  removeVocabTabs();
  renderTestQ();
}
function testHeader(extra) {
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px dashed var(--bd)">
    <span>${TEST_NAME[VTEST.type]}　第 ${VTEST.idx + 1} / ${VTEST.qs.length} 題</span>
    <button onclick="VTest.quit()" style="padding:6px 12px;margin:0">結束</button></div>${extra || ""}`;
}
function renderTestQ() {
  const q = VTEST.qs[VTEST.idx];
  let body = "";
  if (q.kind === "choice") {
    body = `<p style="font-size:1.4rem;font-weight:bold;text-align:center;margin:18px 0 14px">${vEsc(q.prompt)}</p>
      ${q.options.map((o, k) => `<button class="opt" onclick="VTestAct.pickChoice(${k})">${vEsc(o)}</button>`).join("")}`;
  } else if (q.kind === "type") {
    body = `<p style="font-size:1.3rem;font-weight:bold;text-align:center;margin:18px 0">${vEsc(q.zh)}</p>
      <input type="text" id="vtType" placeholder="輸入英文（忽略大小寫）" autocomplete="off" autocapitalize="off" spellcheck="false"
        style="width:100%;box-sizing:border-box;text-align:center;font-size:1.1rem" onkeypress="if(event.key==='Enter')VTestAct.submitType()">
      <button class="go" onclick="VTestAct.submitType()">送出</button>`;
  } else {
    body = matchBody(q);
  }
  A.innerHTML = `<div class="card v-test">${testHeader(body)}${q.kind === "match" ? "" : ""}</div>`;
  window.scrollTo(0, 0);
  if (q.kind === "type") setTimeout(() => { const i = document.getElementById("vtType"); if (i) i.focus(); }, 50);
}
function matchBody(q) {
  q.state = q.state || { left: null, right: null, done: {}, mistakes: 0, leftOrder: q.words.map(w => w.id), rightOrder: pickN(q.words.map(w => w.id), 10, Math.random) };
  const st = q.state;
  const L = st.leftOrder.map(id => q.words.find(w => w.id === id));
  const R = st.rightOrder.map(id => q.words.find(w => w.id === id));
  const cell = (w, side) => {
    const isDone = !!st.done[w.id];
    const sel = side === "L" ? st.left === w.id : st.right === w.id;
    return `<button class="vt-match ${isDone ? "done" : ""} ${sel ? "sel" : ""}" ${isDone ? "disabled" : ""} onclick="VTestAct.matchPick('${side}',${w.id})">${side === "L" ? vEsc(w.en) : vEsc(w.zh)}</button>`;
  };
  return `<p class="meta" style="margin:0 0 8px"><span>先點左邊英文，再點右邊中文配對。錯誤：${st.mistakes}</span></p>
    <div class="vt-matchgrid"><div>${L.map(w => cell(w, "L")).join("")}</div><div>${R.map(w => cell(w, "R")).join("")}</div></div>
    <button class="go" onclick="VTestAct.nextFromMatch()" ${Object.keys(st.done).length === 10 ? "" : "disabled"}>下一題</button>`;
}

// 配對完成後才可按下一題；每一題需要全部配對
const VTestAct = {
  pickChoice(k) {
    VTEST.answers[VTEST.idx] = k;
    const q = VTEST.qs[VTEST.idx];
    const btns = [...document.querySelectorAll("#app .opt")];
    btns.forEach((b, i) => {
      b.disabled = true;
      if (i === q.answerIdx) b.classList.add("ok");
      else if (i === k) b.classList.add("no");
    });
    showNextBtn();
  },
  submitType() {
    const v = document.getElementById("vtType").value;
    const q = VTEST.qs[VTEST.idx];
    VTEST.answers[VTEST.idx] = v;
    const ok = isAnswerOk(q.en, v);
    document.getElementById("vtType").disabled = true;
    const tip = document.createElement("div");
    tip.className = "feedback";
    tip.style.borderLeftColor = ok ? "var(--ok)" : "var(--no)";
    tip.innerHTML = `<p style="margin:0 0 6px;font-weight:bold;color:${ok ? "var(--ok)" : "var(--no)"}">${ok ? "答對了！" : "答錯了"}</p><p style="margin:0">正確答案：<strong>${vEsc(q.en)}</strong></p>`;
    document.querySelector("#app .v-test").appendChild(tip);
    showNextBtn();
  },
  matchPick(side, id) {
    const q = VTEST.qs[VTEST.idx], st = q.state;
    if (side === "L") { st.left = id; }
    else {
      if (st.left == null) { st.right = id; }
      else {
        if (st.left === id) { st.done[id] = true; }
        else { st.mistakes++; }
        st.left = null;
      }
    }
    if (side === "R" && st.left != null) {}
    renderTestQ();
  },
  nextFromMatch() {
    const q = VTEST.qs[VTEST.idx];
    VTEST.answers[VTEST.idx] = { mistakes: q.state.mistakes };
    VTestAct.advance();
  },
  advance() {
    if (VTEST.idx < VTEST.qs.length - 1) { VTEST.idx++; renderTestQ(); }
    else renderTestResult();
  }
};
function showNextBtn() {
  const card = document.querySelector("#app .v-test");
  if (card && !document.getElementById("vtNext")) {
    const b = document.createElement("button");
    b.id = "vtNext"; b.className = "btn-next"; b.style.marginTop = "12px";
    b.textContent = VTEST.idx === VTEST.qs.length - 1 ? "看測驗結果" : "下一題";
    b.onclick = () => VTestAct.advance();
    card.appendChild(b);
  }
}
// ---------- 測驗結果 ----------
function renderTestResult() {
  const res = gradeTest(VTEST.qs, VTEST.answers);
  const pct = res.total ? Math.round(res.correct / res.total * 100) : 0;
  const hist = toolHistory();
  hist.push({ type: VTEST.type, by: VTEST.by, val: VTEST.val, correct: res.correct, total: res.total, ts: Date.now() });
  vocabWrite(TEST_LIMIT_KEY, hist.slice(-200));
  const wrongRows = res.wrong.map(x => {
    const q = x.q;
    if (q.kind === "match") return `<div class="v-wrong"><strong>第 ${x.i + 1} 題（配對）</strong>　錯誤 ${x.a ? x.a.mistakes : "—"} 次</div>`;
    if (q.kind === "choice") return `<div class="v-wrong"><strong>${vEsc(q.prompt)}</strong>　正確：${vEsc(q.options[q.answerIdx])}</div>`;
    return `<div class="v-wrong"><strong>${vEsc(q.zh)}</strong>　你的答案：${vEsc(x.a || "（未作答）")}　正確：${vEsc(q.en)}</div>`;
  }).join("");
  A.innerHTML = `<div class="card v-test">
    <div class="header-row"><h2>📝 測驗結果</h2></div>
    <div style="text-align:center;margin:10px 0 16px"><div style="font-size:3rem;font-weight:bold;color:var(--ac)">${pct}%</div>
      <p style="margin:4px 0">${TEST_NAME[VTEST.type]}　答對 <strong>${res.correct}</strong> / ${res.total}</p></div>
    ${wrongRows || `<p class="meta"><span>全部答對！</span></p>`}
    <button class="go" onclick="VTest.back()">回到單字頁</button>
    <button class="go" style="background:var(--bd);color:var(--text-color);box-shadow:none" onclick="VTest.setup()">再測一次</button>
  </div>`;
  window.scrollTo(0, 0);
}
function toolHistory() { try { return JSON.parse(localStorage.getItem(TEST_LIMIT_KEY)) || []; } catch (e) { return []; } }

// ---------- 介面操作 ----------
const VTest = {
  setup() { window.__vtestActive = false; openTestSetup(); },
  setType(k) { VTEST.type = k; refreshSetup(); },
    setBy(b) { VTEST.by = b; VTEST.val = []; refreshSetup(); },
  setVal(v) {
    if (v === "ALL") { VTEST.val = []; refreshSetup(); return; }
    const key = VTEST.by === "level" ? Number(v) : v;
    const i = VTEST.val.findIndex(x => String(x) === String(key));
    if (i >= 0) VTEST.val.splice(i, 1); else VTEST.val.push(key);
    refreshSetup();
  },
  setN(n) { VTEST.n = n; document.getElementById("vtInput").value = ""; refreshSetup(); },
  typedN() { const v = document.getElementById("vtInput").value; if (v !== "") VTEST.n = parseInt(v, 10) || 0; },
  confirm() {
    const raw = document.getElementById("vtInput").value.trim();
    let n = raw !== "" ? parseInt(raw, 10) : VTEST.n;
    const msg = document.getElementById("vtMsg");
    if (!n || n < 1) { msg.textContent = "請選擇或輸入題數"; return; }
    const lim = testLimit();
    if (n > lim) {                                 // 超過範圍：留在設定，數字改成上限
      document.getElementById("vtInput").value = lim;
      VTEST.n = lim;
      msg.textContent = "超過範圍可出的題數，已改為 " + lim;
      return;
    }
    VTEST.n = n;
    document.getElementById("vTestSetup").classList.remove("active");
    startTest(n);
  },
  quit() {
    if (!confirm("確定結束測驗？本次作答不會保存。")) return;
    VTest.back();
  },
  back() { window.__vtestActive = false; renderVocab(); }
};
window.VTest = VTest;
window.VTestAct = VTestAct;

// ---------- 包住既有函式 ----------
const _vSwitchPage = switchPage;
switchPage = function (p) {
  if (p === "vocab") { openVocab(); return; }
  closeVocabFlag();
  return _vSwitchPage(p);
};
const _vGo = go;
go = function (k, f) { closeVocabFlag(); return _vGo(k, f); };
const _vHome = home;
home = function () {
  if (window.__vocabActive) { renderVocab(); return; }
  _vHome();
  addVocabEntry();
};

// 網址是 #vocab 時直接開啟（等主程式初始化完成）
function ensureVocabShown() {
  if (location.hash !== "#vocab") return;
  const sm = document.getElementById("subjectModal"); if (sm) sm.classList.remove("active");
  openVocab();
}
setTimeout(ensureVocabShown, 0);
setTimeout(ensureVocabShown, 300);
window.addEventListener("load", ensureVocabShown);

setTimeout(ensureVocabShown, 1500);
setTimeout(ensureVocabShown, 3000);
