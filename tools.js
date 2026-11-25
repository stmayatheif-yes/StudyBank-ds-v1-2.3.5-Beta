/* ==========================================
   刷題工具：答案表、模擬測驗、學習統計（國文／英文）
   使用方式：放在 GitHub 專案根目錄，並在 index.html 的 </body> 前、
   sync.js 之前加上：<script src="tools.js"></script>
   ========================================== */

/*PURE-START*/
const TOOL_STATS_KEY = "tools_attempts";
const TOOL_EXAM_KEY = "tools_exam";
const TOOL_MAX_ATTEMPTS = 2000;
const TOOL_TESTS_KEY = "tools_tests";
const TOOL_MAX_TESTS = 200;

// 同題組的題目要一起出：回傳 { 題號範圍: [a,b] }，找不到回傳 null
function groupRangeOf(all, q) {
  const n = parseInt(q.n, 10);
  for (const x of all) {
    if (x.y !== q.y) continue;
    const m = x.q.match(/【(\d+)~(\d+)題為題組題】/);
    if (m && n >= +m[1] && n <= +m[2]) return [+m[1], +m[2]];
  }
  return null;
}

// 把題目切成「單位」：單題一個，題組整組一個（只含池內題目）
function buildUnits(all, pool) {
  const inPool = new Set(pool.map(q => q.id));
  const seen = new Set();
  const units = [];
  pool.forEach(q => {
    if (seen.has(q.id)) return;
    const r = groupRangeOf(all, q);
    if (r) {
      const members = all.filter(x => x.y === q.y && +x.n >= r[0] && +x.n <= r[1] && inPool.has(x.id))
                         .sort((a, b) => +a.n - +b.n);
      members.forEach(x => seen.add(x.id));
      units.push(members);
    } else {
      seen.add(q.id);
      units.push([q]);
    }
  });
  return units;
}

// 抽題：與隨機刷題相同規則（單題能放就放，題組放不下先跳過，不足才整組補入）
function pickUnitsN(units, N, rnd) {
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const order = shuffle(units);
  const chosen = [], deferred = [];
  let count = 0;
  for (const u of order) {
    if (count >= N) break;
    if (count + u.length <= N) { chosen.push(u); count += u.length; }
    else deferred.push(u);
  }
  for (const u of deferred) {
    if (count >= N) break;
    chosen.push(u); count += u.length;
  }
  return shuffle(chosen).flat();
}

// 判分（第一階段：多選只有完全答對才算對）
function gradeChoice(q, picks) {
  if (!picks || !picks.length) return "skip";
  const p = [...picks].sort().join("");
  return p === q.a ? "correct" : "wrong";
}

// 統計：依模式過濾後計算
function summarize(attempts, mode) {
  const list = attempts.filter(a => mode === "all" || (a.mode || "practice") === mode);
  const total = list.length;
  const correct = list.filter(a => a.ok).length;
  const byYear = {};
  list.forEach(a => {
    const y = String(a.id || "").split("-")[0] || "?";
    byYear[y] = byYear[y] || { t: 0, c: 0 };
    byYear[y].t++; if (a.ok) byYear[y].c++;
  });
  const wrongCount = {};
  list.forEach(a => { if (!a.ok && a.id) wrongCount[a.id] = (wrongCount[a.id] || 0) + 1; });
  return { total, correct, byYear, wrongCount };
}
// 每日正確率（依日期排序）
function dailySeries(attempts, fmt) {
  const map = {};
  attempts.forEach(a => {
    const k = fmt(a.ts);
    map[k] = map[k] || { t: 0, c: 0, ts: a.ts };
    map[k].t++; if (a.ok) map[k].c++;
    if (a.ts < map[k].ts) map[k].ts = a.ts;
  });
  return Object.keys(map).sort((x, y) => map[x].ts - map[y].ts)
    .map(k => ({ label: k, pct: Math.round(map[k].c / map[k].t * 100), t: map[k].t, c: map[k].c }));
}
// 模擬測驗分數（依時間排序）
function testSeries(tests, fmt) {
  return tests.slice().sort((a, b) => a.ts - b.ts)
    .map(t => ({ label: fmt(t.ts), pct: t.total ? Math.round(t.correct / t.total * 100) : 0, c: t.correct, t: t.total }));
}
/*PURE-END*/
// ---------- 儲存 ----------
const TOOL_PAGES = { answers: "答案表", mock: "模擬測驗", stats: "學習統計" };
// 這些資料會一起同步到雲端（見 sync.js）
window.TOOL_SYNC_KEYS = ["tools_attempts", "tools_tests", "tools_first_ts", "tools_first_en", "tools_baseline", "tools_baseline_en"];
const SUBJ_LABEL = { chinese: "國文", english: "英文" };
const SUBJ_STORE = { chinese: "qb_study", english: "qb_study_english" };
let toolSubj = "chinese";        // 目前工具頁選的科目

const toolRead = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } };
const toolArr = k => { const v = toolRead(k, []); return Array.isArray(v) ? v : []; };
const toolWrite = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const fmtDay = ts => { const d = new Date(ts); return d.getFullYear() + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0"); };
const fmtSecs = n => String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
const escT = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// 題目 id 統一為「年-題號」，並快取（主程式載入的題庫沒有 id 欄位）
const qidOf = q => q.id || (q.y + "-" + q.n);
const _qCache = {};
function subjQ(s) {
  s = s || toolSubj;
  const src = (typeof DATA !== "undefined" && DATA[s]) ? DATA[s] : [];
  if (!_qCache[s] || _qCache[s].src !== src) _qCache[s] = { src, arr: src.map(q => q.id ? q : Object.assign({}, q, { id: qidOf(q) })) };
  return _qCache[s].arr;
}
const subjYears = s => [...new Set(subjQ(s).map(q => String(q.y)))].sort();

// 舊資料基準點（只針對國文）：第一次載入新版時，把當時卡片上的數字存起來
function ensureBaseline() {
  ["chinese", "english"].forEach(subj => {
    if (localStorage.getItem(baseKeyOf(subj))) return;
    const s = toolRead(SUBJ_STORE[subj], { w: {}, c: 0, t: 0 });
    toolWrite(baseKeyOf(subj), { t: s.t || 0, c: s.c || 0, w: Object.keys(s.w || {}) });
  });
}
// 清掉早期版本留下的無效紀錄（沒有題號的）
function purgeInvalid() {
  const arr = toolArr(TOOL_STATS_KEY);
  const clean = arr.filter(a => a && typeof a.id === "string" && /^\d{3}-\d+$/.test(a.id));
  if (clean.length !== arr.length) toolWrite(TOOL_STATS_KEY, clean);
}
// 初始化失敗時不影響後面的功能（側邊欄項目仍會建立）
try { ensureBaseline(); } catch (e) { console.warn("tools: baseline", e); }
try { purgeInvalid(); } catch (e) { console.warn("tools: purge", e); }

function addAttempt(subj, id, ok, mode) {
  if (!localStorage.getItem(firstKeyOf(subj))) toolWrite(firstKeyOf(subj), Date.now());
  const arr = toolArr(TOOL_STATS_KEY);
  arr.push({ subj, id, ok, mode, ts: Date.now() });
  toolWrite(TOOL_STATS_KEY, arr.slice(-TOOL_MAX_ATTEMPTS));
}
// 模擬測驗與練習共用各科的錯題本（卡片上的紀錄）
function bumpStudy(subj, id, ok) {
  const key = SUBJ_STORE[subj];
  const s = toolRead(key, { w: {}, c: 0, t: 0 });
  s.t = (s.t || 0) + 1;
  if (ok) { s.c = (s.c || 0) + 1; delete s.w[id]; } else { s.w[id] = 1; }
  toolWrite(key, s);
}
// 舊資料的 attempts 沒有 subj 欄位，視為國文
const firstKeyOf = subj => subj === "english" ? "tools_first_en" : "tools_first_ts";
const baseKeyOf = subj => subj === "english" ? "tools_baseline_en" : "tools_baseline";
const attemptsOf = subj => toolArr(TOOL_STATS_KEY).filter(a => a && a.id && (a.subj || "chinese") === subj);

// ---------- 導覽 ----------
function setToolNav(name) {
  ["navHome", "navSettings", "navSync"].forEach(x => { const el = document.getElementById(x); if (el) el.classList.remove("active"); });
  Object.keys(TOOL_PAGES).forEach(k => { const el = document.getElementById("nav_" + k); if (el) el.classList.toggle("active", k === name); });
}
async function openTool(name) {
  const sm = document.getElementById("subjectModal"); if (sm) sm.classList.remove("active");
  const sb = document.getElementById("sidebar");
  if (sb && sb.classList.contains("active") && typeof toggleSidebar === "function") toggleSidebar();
  window.__syncActive = false;
  window.__extraPage = name;
  currentPage = "tool";
  document.getElementById("subjectNav").style.display = "none";
  setToolNav(name);
  history.replaceState(null, "", "#tool-" + name);
  document.getElementById("app").innerHTML = `<div class="card"><p class="meta"><span>載入中…</span></p></div>`;
  if (typeof loadSubject === "function") { await loadSubject("chinese"); await loadSubject("english"); }
  if (window.__extraPage === name) renderTool(name);
}
function renderTool(name) {
  if (name === "answers") return renderAnswers();
  if (name === "mock") return renderMockEntry();
  if (name === "stats") return renderStats();
}
// 科目切換列（工具頁共用）
function subjTabs(onclickFn) {
  return ["chinese", "english"].map(s => `<button class="go" style="width:auto;padding:6px 14px;margin:0 6px 8px 0;${toolSubj === s ? "" : "background:var(--bd);color:var(--text-color);box-shadow:none"}" onclick="${onclickFn}('${s}')">${SUBJ_LABEL[s]}</button>`).join("");
}
function pillBtn(active, label, onclick) {
  return `<button class="go" style="width:auto;padding:6px 12px;margin:0 6px 8px 0;${active ? "" : "background:var(--bd);color:var(--text-color);box-shadow:none"}" onclick="${onclick}">${label}</button>`;
}

// ---------- 答案表 ----------
let answerYear = "all";
function renderAnswers() {
  const years = subjYears();
  const data = subjQ().filter(q => answerYear === "all" || String(q.y) === String(answerYear))
                      .sort((a, b) => (a.y - b.y) || (+a.n - +b.n));
  const btns = ["all", ...years].map(y => pillBtn(String(answerYear) === String(y), y === "all" ? "全部" : y + " 年", `AnswerTable.year('${y}')`)).join("");
  const cells = data.map(q => `<div style="display:flex;justify-content:space-between;padding:6px 10px;border:1px solid var(--bd);border-radius:8px"><span>${answerYear === "all" ? q.y + "‧" : ""}${q.n}</span><strong>${q.a}</strong></div>`).join("");
  document.getElementById("app").innerHTML = `
    <div class="card">
      <div class="header-row"><h2>📋 答案表</h2></div>
      <div>${subjTabs("AnswerTable.subj")}</div>
      <div>${btns}</div>
      <span class="helper-text">多選題以字母合併顯示，例如 CD。</span>
      ${data.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-top:12px">${cells}</div>` : `<p class="meta"><span>目前沒有題目資料。</span></p>`}
    </div>`;
  window.scrollTo(0, 0);
}
const AnswerTable = {
  year(y) { answerYear = y; renderAnswers(); },
  subj(s) { toolSubj = s; answerYear = "all"; renderAnswers(); }
};
window.AnswerTable = AnswerTable;

// ---------- 模擬測驗 ----------
let mockForm = { year: "all", count: 25, minutes: 45 };
let mockTimer = null;

function renderMockEntry() {
  const saved = toolRead(TOOL_EXAM_KEY, null);
  const resume = saved && !saved.done
    ? `<div class="card" style="margin-bottom:16px"><p style="margin:0 0 8px">有未完成的${SUBJ_LABEL[saved.subj || "chinese"]}模擬測驗（${saved.ids.length} 題）。</p>
       <button class="go" onclick="MockExam.resume()">繼續作答</button>
       <button class="go" style="background:var(--bd);color:var(--text-color);box-shadow:none" onclick="MockExam.discard()">放棄並重新設定</button></div>`
    : (saved && saved.done && saved.result
      ? `<div class="card" style="margin-bottom:16px"><p style="margin:0 0 8px">上次的${SUBJ_LABEL[saved.subj || "chinese"]}模擬測驗已交卷（答對 ${saved.result.correct}/${saved.result.total}）。</p>
       <button class="go" onclick="MockExam.showResult()">查看結果</button>
       <button class="go" style="background:var(--bd);color:var(--text-color);box-shadow:none" onclick="MockExam.finish()">關閉結果</button></div>`
      : "");
  const years = subjYears();
  const yearOpts = `<option value="all">全部年度（混合）</option>` + years.map(y => `<option value="${y}" ${String(mockForm.year) === String(y) ? "selected" : ""}>${y} 年</option>`).join("");
  document.getElementById("app").innerHTML = `
    ${resume}
    <div class="card">
      <div class="header-row"><h2>📝 模擬測驗</h2></div>
      <div>${subjTabs("MockExam.subj")}</div>
      <p style="margin:0 0 6px;font-weight:bold">範圍</p>
      <select id="mkYear" style="width:100%">${yearOpts}</select>
      <p style="margin:14px 0 6px;font-weight:bold">題數</p>
      <input type="number" id="mkCount" min="1" value="${mockForm.count}" style="width:100%">
      <p style="margin:14px 0 6px;font-weight:bold">時間（分鐘）</p>
      <input type="number" id="mkMin" min="1" value="${mockForm.minutes}" style="width:100%">
      <span class="helper-text">只抽選擇題（單選與多選），題組整組一起出。時間到自動交卷。</span>
      <p id="mkMsg" style="color:var(--no);min-height:1.2em;margin:8px 0 0;font-size:.9rem"></p>
      <button class="go" onclick="MockExam.start()">開始測驗</button>
    </div>`;
  window.scrollTo(0, 0);
}

const MockExam = {
  subj(s) { toolSubj = s; mockForm.year = "all"; renderMockEntry(); },
  start() {
    const pool = subjQ().filter(q => { const y = document.getElementById("mkYear").value; return y === "all" || String(q.y) === String(y); });
    let N = parseInt(document.getElementById("mkCount").value, 10);
    let M = parseInt(document.getElementById("mkMin").value, 10);
    const msg = document.getElementById("mkMsg");
    if (!pool.length) { msg.textContent = "這個範圍沒有題目"; return; }
    if (!N || N < 1) { msg.textContent = "請輸入題數"; return; }
    if (!M || M < 1) { msg.textContent = "請輸入時間"; return; }
    if (N > pool.length) {               // 超過範圍：留在設定畫面，數字改成上限
      document.getElementById("mkCount").value = pool.length;
      msg.textContent = "超過範圍題數，已改為 " + pool.length + " 題";
      return;
    }
    mockForm = { year: document.getElementById("mkYear").value, count: N, minutes: M };
    const ids = pickUnitsN(buildUnits(subjQ(), pool), N, Math.random).map(q => qidOf(q));
    const now = Date.now();
    const st = { subj: toolSubj, ids, idx: 0, ans: {}, scope: mockForm.year, startAt: now, endAt: now + M * 60000, done: false };
    toolWrite(TOOL_EXAM_KEY, st);
    this.run(st);
  },
  resume() { const st = toolRead(TOOL_EXAM_KEY, null); if (st && !st.done) { toolSubj = st.subj || "chinese"; this.run(st); } },
  discard() { localStorage.removeItem(TOOL_EXAM_KEY); renderMockEntry(); },
  run(st) {
    clearInterval(mockTimer);
    mockTimer = setInterval(() => this.tick(), 1000);
    this.st = st;
    this.render();
    this.tick();
  },
  tick() {
    const st = this.st; if (!st || st.done) return;
    const left = Math.max(0, st.endAt - Date.now());
    const el = document.getElementById("mkTimer");
    if (el) el.textContent = fmtSecs(Math.floor(left / 1000));
    if (left <= 0) this.submit(true);
  },
  q() { return subjQ(this.st.subj).find(x => x.id === this.st.ids[this.st.idx]); },
  pick(letter) {
    const q = this.q(), st = this.st;
    if (q.a.length > 1) {
      const arr = st.ans[q.id] || [];
      st.ans[q.id] = arr.includes(letter) ? arr.filter(x => x !== letter) : [...arr, letter].sort();
    } else {
      st.ans[q.id] = [letter];
    }
    toolWrite(TOOL_EXAM_KEY, st);
    this.render();
  },
  go(i) { this.st.idx = Math.max(0, Math.min(this.st.ids.length - 1, i)); toolWrite(TOOL_EXAM_KEY, this.st); this.render(); window.scrollTo(0, 0); },
  render() {
    const st = this.st, q = this.q(), letters = "ABCDEFGHIJ";
    const picks = st.ans[q.id] || [];
    const grid = st.ids.map((id, i) => `<button onclick="MockExam.go(${i})" style="padding:4px 0;margin:0;${i === st.idx ? "border-color:var(--ac);" : ""}${(st.ans[id] || []).length ? "background:color-mix(in srgb,var(--ac) 20%,var(--card));" : ""}">${i + 1}</button>`).join("");
    document.getElementById("app").innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px dashed var(--bd)">
          <span>${SUBJ_LABEL[st.subj || "chinese"]}　第 ${st.idx + 1} / ${st.ids.length} 題</span>
          <span id="mkTimer" style="font-weight:bold;color:var(--ac)"></span>
          <button onclick="MockExam.confirmSubmit()" style="padding:6px 12px;margin:0">交卷</button>
        </div>
        <p style="white-space:pre-wrap;font-size:1.05rem;line-height:1.8">${escT(groupPassageText(q, st.subj))}</p>
        ${q.a.length > 1 ? `<span class="helper-text">多選題，可選多個。</span>` : ""}
        ${q.o.map((o, k) => `<button class="opt ${picks.includes(letters[k]) ? "sel" : ""}" onclick="MockExam.pick('${letters[k]}')">${escT(o)}</button>`).join("")}
        <div style="display:flex;gap:8px;margin-top:12px">
          <button style="flex:1;margin:0" ${st.idx === 0 ? "disabled" : ""} onclick="MockExam.go(${st.idx - 1})">上一題</button>
          <button style="flex:1;margin:0" ${st.idx === st.ids.length - 1 ? "disabled" : ""} onclick="MockExam.go(${st.idx + 1})">下一題</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:6px;margin-top:14px">${grid}</div>
      </div>`;
    const el = document.getElementById("mkTimer");
    if (el) { const left = Math.max(0, st.endAt - Date.now()); el.textContent = fmtSecs(Math.floor(left / 1000)); }
  },
  confirmSubmit() {
    const unanswered = this.st.ids.filter(id => !(this.st.ans[id] || []).length).length;
    const msg = unanswered ? `還有 ${unanswered} 題未作答，確定交卷？交卷後無法修改。` : "確定交卷？交卷後無法修改。";
    if (confirm(msg)) this.submit(false);
  },
  submit(auto) {
    const st = this.st; if (!st || st.done) return;
    clearInterval(mockTimer);
    st.done = true;
    const subj = st.subj || "chinese";
    const all = subjQ(subj);
    let correct = 0;
    st.ids.forEach(id => {
      const q = all.find(x => x.id === id);
      const r = gradeChoice(q, st.ans[id] || []);
      if (r === "correct") correct++;
      if (r !== "skip") { addAttempt(subj, id, r === "correct", "mock"); bumpStudy(subj, id, r === "correct"); }
    });
    st.result = { correct, total: st.ids.length, auto };
    toolWrite(TOOL_EXAM_KEY, st);
    // 寫入一次測驗紀錄（給學習統計的「最近模擬測驗」）
    const tests = toolRead(TOOL_TESTS_KEY, []);
    const start = st.startAt || Date.now();
    const usedMs = Math.min(Date.now() - start, (st.endAt - start) || Infinity);
    tests.push({ subj, scope: st.scope || "all", correct, total: st.ids.length, auto, secs: Math.round(usedMs / 1000), ts: Date.now() });
    toolWrite(TOOL_TESTS_KEY, tests.slice(-TOOL_MAX_TESTS));
    // 只有還停留在模擬測驗頁時才顯示結果；否則下次進入模擬測驗頁時再顯示
    if (window.__extraPage === "mock") this.showResult(st);
  },
  showResult(stArg) {
    const st = stArg || this.st || toolRead(TOOL_EXAM_KEY, null);
    if (!st) return renderMockEntry();
    this.st = st;
    const subj = st.subj || "chinese";
    const all = subjQ(subj);
    const rows = st.ids.map((id, i) => {
      const q = all.find(x => x.id === id);
      const picks = st.ans[id] || [];
      const r = gradeChoice(q, picks);
      const cls = r === "correct" ? "color:var(--ok)" : r === "skip" ? "opacity:.6" : "color:var(--no)";
      const txt = r === "correct" ? "✔ 答對" : r === "skip" ? "未作答" : "✘ 答錯";
      return `<details style="margin-bottom:8px"><summary>${i + 1}. <span style="${cls}">${txt}</span>　${escT(q.q.replace(/【\d+~\d+題為題組題】\n*/g, "").slice(0, 30))}</summary>
        <p style="margin:6px 0">你的答案：${picks.join("") || "—"}　正確答案：<strong>${q.a}</strong></p>
        <div style="font-size:.9rem;line-height:1.7;white-space:pre-wrap">${escT(q.e || "暫無解析")}</div></details>`;
    });
    const res = st.result || { correct: 0, total: st.ids.length, auto: false };
    const pct = res.total ? Math.round(res.correct / res.total * 100) : 0;
    document.getElementById("app").innerHTML = `
      <div class="card">
        <div class="header-row"><h2>📝 測驗結果（${SUBJ_LABEL[subj]}）</h2></div>
        <div style="text-align:center;margin:12px 0 18px">
          <div style="font-size:3rem;font-weight:bold;color:var(--ac)">${pct}%</div>
          <p style="margin:4px 0">答對 <strong>${res.correct}</strong> / ${res.total} 題${res.auto ? "（時間到自動交卷）" : ""}</p>
        </div>
        ${rows.join("")}
        <button class="go" onclick="MockExam.finish()">完成，回到模擬測驗</button>
      </div>`;
    window.scrollTo(0, 0);
  },
  finish() { localStorage.removeItem(TOOL_EXAM_KEY); this.st = null; mockTimer && clearInterval(mockTimer); renderMockEntry(); }
};
window.MockExam = MockExam;

// 題組引文（與刷題頁一樣：附屬題前面接上組首引文；組首題不顯示標籤）
function groupPassageText(q, subj) {
  const all = subjQ(subj || toolSubj);
  const r = groupRangeOf(all, q);
  if (!r) return q.q;
  const clean = t => t.replace(/【\d+~\d+題為題組題】\n*/g, "");
  if (+q.n === r[0]) return clean(q.q);
  const start = all.find(x => x.y === q.y && +x.n === r[0]);
  if (!start) return clean(q.q);
  const raw = clean(start.q);
  const br = raw.lastIndexOf("\n\n");
  return br !== -1 ? raw.substring(0, br) + "\n\n" + clean(q.q) : clean(q.q);
}

// ---------- 學習統計 ----------
let statsMode = "all";
function renderStats() {
  try { renderStatsInner(); }
  catch (e) { document.getElementById("app").innerHTML = `<div class="card"><h2>📊 學習統計</h2><p>統計載入失敗：${escT(e.message)}</p></div>`; }
}
function renderStatsInner() {
  const subj = toolSubj;
  const attempts = attemptsOf(subj);
  const s = summarize(attempts, statsMode);
  const pct = s.total ? Math.round(s.correct / s.total * 100) : 0;
  const firstTs = toolRead(firstKeyOf(subj), null);
  const firstDay = firstTs ? fmtDay(firstTs) : "（尚未開始）";
  const all = subjQ(subj);
  const allTests = toolArr(TOOL_TESTS_KEY).filter(t => t && (t.subj || "chinese") === subj);
  const tests = allTests.slice(-20).reverse();
  const modeAttempts = attempts.filter(a => statsMode === "all" || (a.mode || "practice") === statsMode);
  const fmtMD = ts => { const d = new Date(ts); return (d.getMonth() + 1) + "/" + d.getDate(); };
  const daily = dailySeries(modeAttempts, fmtDay);
  const mockSeries = statsMode === "practice" ? [] : testSeries(allTests.filter(t => t.total), fmtMD);
  const yearKeys = Object.keys(s.byYear).sort();
  CHART_DATA = {
    daily, mockSeries, correct: s.correct, wrong: s.total - s.correct,
    years: yearKeys.map(y => ({ label: y + " 年", pct: Math.round(s.byYear[y].c / s.byYear[y].t * 100), c: s.byYear[y].c, t: s.byYear[y].t }))
  };
  const yearNums = yearKeys.map(y => `${y} 年：${s.byYear[y].c}/${s.byYear[y].t}`).join("　");
  const wrongRank = Object.keys(s.wrongCount).sort((a, b) => s.wrongCount[b] - s.wrongCount[a]).slice(0, 10)
    .map(id => { const q = all.find(x => x.id === id); return `<button onclick="StatsView.q('${id}')" style="display:flex;width:100%;justify-content:space-between;text-align:left;padding:8px 10px;margin:4px 0;background:var(--bg)"><span>${q ? q.y + " 年 第" + q.n + " 題" : escT(id)}</span><strong>錯 ${s.wrongCount[id]} 次</strong></button>`; }).join("") || `<p class="meta"><span>目前沒有錯題。</span></p>`;
  const recent = (statsMode === "practice") ? `<p class="meta"><span>練習沒有測驗紀錄，請切換到「全部」或「模擬」。</span></p>` :
    (tests.map(t => {
      const d = new Date(t.ts).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
      const label = !t.scope || t.scope === "all" ? "全範圍" : t.scope + " 年";
      return `<div style="padding:8px 0;border-bottom:1px dashed var(--bd)"><div style="display:flex;justify-content:space-between"><span>${label}　模擬</span><strong>${t.correct}/${t.total}</strong></div><div class="meta" style="margin:2px 0 0;font-size:.85rem">${d}　用時 ${fmtSecs(t.secs || 0)}${t.auto ? "（時間到自動交卷）" : ""}</div></div>`;
    }).join("") || `<p class="meta"><span>還沒有模擬測驗紀錄。</span></p>`);
  const chartsHTML = `
      <div class="card" style="margin:12px 0;padding:14px"><p style="font-weight:bold;margin:0 0 6px">作答趨勢（每日正確率）</p>${chartBox("chTrend", 200, daily.length ? "" : "還沒有作答紀錄。")}</div>
      <div class="card" style="margin:12px 0;padding:14px"><p style="font-weight:bold;margin:0 0 6px">模擬測驗分數</p>${chartBox("chMock", 200, statsMode === "practice" ? "練習沒有模擬測驗，請切換到「全部」或「模擬」。" : (mockSeries.length ? "" : "還沒有模擬測驗紀錄。"))}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <div class="card" style="flex:1;min-width:200px;margin:12px 0;padding:14px"><p style="font-weight:bold;margin:0 0 6px">答對／答錯</p>${chartBox("chPie", 220, s.total ? "" : "還沒有作答紀錄。")}</div>
        <div class="card" style="flex:2;min-width:240px;margin:12px 0;padding:14px"><p style="font-weight:bold;margin:0 0 6px">各年度正確率</p>${chartBox("chYear", Math.max(120, 36 * yearKeys.length + 40), yearKeys.length ? "" : "還沒有作答紀錄。")}<p class="meta" style="margin:8px 0 0;font-size:.85rem">${yearNums}</p></div>
      </div>`;
  document.getElementById("app").innerHTML = `
    <div class="card">
      <div class="header-row"><h2>📊 學習統計</h2></div>
      <div>${subjTabs("StatsView.subj")}</div>
      <div>${pillBtn(statsMode === "all", "全部", "StatsView.mode('all')")}${pillBtn(statsMode === "practice", "練習", "StatsView.mode('practice')")}${pillBtn(statsMode === "mock", "模擬", "StatsView.mode('mock')")}</div>
      <span class="helper-text">統計從 ${firstDay} 開始記錄，之前的練習請看各科卡片。多選題需完全答對才算答對。</span>
      <button onclick="StatsView.old()" style="margin:4px 0 8px;padding:6px 12px;font-size:.85rem">舊資料</button>
      <div style="display:flex;gap:10px;margin:12px 0">
        <div class="card" style="flex:1;margin:0;text-align:center"><div class="meta" style="margin:0">作答題數</div><strong style="font-size:1.4rem">${s.total}</strong></div>
        <div class="card" style="flex:1;margin:0;text-align:center"><div class="meta" style="margin:0">正確率</div><strong style="font-size:1.4rem">${pct}%</strong></div>
      </div>
      ${chartsHTML}
      <p style="font-weight:bold;margin:20px 0 4px">最常答錯（前 10 題）</p>${wrongRank}
      <p style="font-weight:bold;margin:20px 0 4px">最近模擬測驗（最近 20 次）</p>${recent}
    </div>`;
  drawCharts();
  window.scrollTo(0, 0);
}
const StatsView = {
  mode(k) { statsMode = k; renderStats(); },
  subj(s) { toolSubj = s; renderStats(); },
  old() { openOldModal(toolSubj); },
  q(id) { openQModal(id, toolSubj); }
};
window.StatsView = StatsView;

// ---------- 圖表（Chart.js） ----------
const CHART_JS_URL = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
let CHART_DATA = null;
const charts = {};
function chartBox(id, h, emptyMsg) {
  if (emptyMsg) return `<p class="meta" style="margin:0;font-size:.9rem">${escT(emptyMsg)}</p>`;
  return `<div style="position:relative;height:${h}px"><canvas id="${id}"></canvas></div>`;
}
let chartJsPromise = null;
function ensureChartJs() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (!chartJsPromise) chartJsPromise = new Promise((resolve, reject) => {
    const sc = document.createElement("script");
    sc.src = CHART_JS_URL;
    sc.onload = () => resolve(window.Chart);
    sc.onerror = () => { chartJsPromise = null; reject(new Error("圖表程式載入失敗，請檢查網路")); };
    document.head.appendChild(sc);
  });
  return chartJsPromise;
}
function drawCharts() {
  const d = CHART_DATA; if (!d) return;
  const textColor = getComputedStyle(document.body).color || "#333";
  const grid = { color: "rgba(128,128,128,.2)" };
  const put = (id, cfg) => {
    const el = document.getElementById(id); if (!el) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new window.Chart(el, cfg);
  };
  const common = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };
  const pctScale = { y: { min: 0, max: 100, ticks: { color: textColor, callback: v => v + "%" }, grid }, x: { ticks: { color: textColor, maxRotation: 0, autoSkip: true }, grid: { display: false } } };
  ensureChartJs().then(() => {
    if (d.daily.length) put("chTrend", { type: "line", data: { labels: d.daily.map(x => x.label), datasets: [{ data: d.daily.map(x => x.pct), borderColor: "#3b82f6", backgroundColor: "#3b82f6", tension: .3, pointRadius: 3 }] },
      options: { ...common, scales: pctScale, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => { const x = d.daily[c.dataIndex]; return `${x.pct}%（${x.c}/${x.t}）`; } } } } } });
    if (d.mockSeries.length) put("chMock", { type: "line", data: { labels: d.mockSeries.map(x => x.label), datasets: [{ data: d.mockSeries.map(x => x.pct), borderColor: "#10b981", backgroundColor: "#10b981", tension: .3, pointRadius: 4 }] },
      options: { ...common, scales: pctScale, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => { const x = d.mockSeries[c.dataIndex]; return `${x.pct}%（${x.c}/${x.t}）`; } } } } } });
    if (d.correct + d.wrong > 0) put("chPie", { type: "doughnut", data: { labels: ["答對", "答錯"], datasets: [{ data: [d.correct, d.wrong], backgroundColor: ["#10b981", "#ef4444"] }] },
      options: { ...common, plugins: { legend: { display: true, position: "bottom", labels: { color: textColor } } } } });
    if (d.years.length) put("chYear", { type: "bar", data: { labels: d.years.map(x => x.label), datasets: [{ data: d.years.map(x => x.pct), backgroundColor: "#3b82f6" }] },
      options: { ...common, indexAxis: "y", scales: { x: { min: 0, max: 100, ticks: { color: textColor, callback: v => v + "%" }, grid }, y: { ticks: { color: textColor }, grid: { display: false } } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => { const x = d.years[c.dataIndex]; return `${x.pct}%（${x.c}/${x.t}）`; } } } } } });
  }).catch(err => {
    ["chTrend", "chMock", "chPie", "chYear"].forEach(id => {
      const el = document.getElementById(id); if (el && el.parentNode) el.parentNode.innerHTML = `<p class="meta" style="margin:0;font-size:.85rem">${escT(err.message)}（數字仍可在下方看到）</p>`;
    });
  });
}

// ---------- 彈窗（網站樣式） ----------
function toolModal(id) {
  let m = document.getElementById(id);
  if (!m) {
    m = document.createElement("div");
    m.id = id;
    m.className = "modal-overlay";
    m.style.zIndex = "1500";
    m.onclick = e => { if (e.target === m) m.classList.remove("active"); };
    document.body.appendChild(m);
  }
  return m;
}
function openQModal(id, subj) {
  const q = subjQ(subj).find(x => qidOf(x) === id);
  const m = toolModal("statQModal");
  const body = q ? `
    <p style="white-space:pre-wrap;line-height:1.7;margin:0 0 12px">${escT(groupPassageText(q, subj))}</p>
    ${q.o.map((o, k) => `<p style="margin:4px 0;${q.a.includes("ABCDEFGHIJ"[k]) ? "color:var(--ok);font-weight:bold" : ""}">${escT(o)}</p>`).join("")}
    <p style="margin:12px 0 4px">正確答案：<strong>${q.a}</strong></p>
    <div class="analysis-body" style="white-space:pre-wrap">${escT(q.e || "暫無解析")}</div>` : `<p>找不到這一題。</p>`;
  m.innerHTML = `<div class="modal-content" onclick="event.stopPropagation()" style="max-height:80vh;overflow-y:auto;width:min(520px,92vw)">
    <h3>${q ? SUBJ_LABEL[subj] + "　" + q.y + " 年 第 " + q.n + " 題" : "題目"}</h3>${body}
    <div class="modal-actions"><button class="go" onclick="document.getElementById('statQModal').classList.remove('active')">關閉</button></div></div>`;
  m.classList.add("active");
}
function openOldModal(subj) {
  subj = subj || toolSubj;
  const b = toolRead(baseKeyOf(subj), { t: 0, c: 0, w: [] });
  const cur = toolRead(SUBJ_STORE[subj], { w: {}, c: 0, t: 0 });
  const still = (b.w || []).filter(id => cur.w && cur.w[id]);
  const pct = b.t ? Math.round(b.c / b.t * 100) : 0;
  const rows = ["110", "111", "112", "113", "114", "115"].map(y => {
    const nums = still.filter(id => id.split("-")[0] === y).map(id => id.split("-")[1]).sort((a, b) => a - b);
    return `<tr><td style="padding:6px 10px;border:1px solid var(--bd)">${y} 年</td><td style="padding:6px 10px;border:1px solid var(--bd)">${nums.length ? nums.join("、") : "—"}</td></tr>`;
  }).join("");
  const m = toolModal("oldDataModal");
  m.innerHTML = `<div class="modal-content" onclick="event.stopPropagation()" style="max-height:80vh;overflow-y:auto;width:min(520px,92vw)">
    <h3>舊資料（${SUBJ_LABEL[subj]}）</h3>
    <p style="margin:0 0 6px">新版本之前的作答：<strong>${b.t}</strong> 題，答對 <strong>${b.c}</strong> 題（${pct}%）</p>
    <p style="font-weight:bold;margin:14px 0 6px">舊版錯題（目前仍在錯題本）</p>
    <table style="width:100%;border-collapse:collapse;font-size:.95rem">${rows}</table>
    <span class="helper-text">舊版只記錄目前仍在錯題本的題號，已答對移出錯題本的題目不會顯示在這裡。</span>
    <div class="modal-actions"><button class="go" onclick="document.getElementById('oldDataModal').classList.remove('active')">關閉</button></div></div>`;
  m.classList.add("active");
}

// ---------- 清除紀錄（卡片按鈕呼叫） ----------
function askClearRecords() {
  if (cur !== "chinese" && cur !== "english") return;
  const name = SUBJ_LABEL[cur];
  const extra = cur === "chinese" ? "模擬測驗進度、學習統計資料、" : "模擬測驗進度、學習統計資料、";
  const m = toolModal("clearConfirm");
  m.innerHTML = `<div class="modal-content" onclick="event.stopPropagation()" style="width:min(380px,90vw);text-align:center">
    <h3 style="justify-content:center">是否確認刪除${name}刷題記錄？</h3>
    <p style="text-align:left;line-height:1.7;margin:8px 0 18px;white-space:pre-wrap">包括：${extra}${name}卡片刷題內容\n\n刪除後無法復原。</p>
    <div class="modal-actions" style="margin-top:0">
      <button class="go" style="background:var(--no)" onclick="doClearRecords()">是，確認刪除</button>
      <button class="go" style="background:var(--bd);color:var(--text-color);box-shadow:none" onclick="document.getElementById('clearConfirm').classList.remove('active')">否，我再想想</button>
    </div></div>`;
  m.classList.add("active");
}
function doClearRecords() {
  const c = cur;
  save({ w: {}, c: 0, t: 0 });                       // 主程式的 save 會存到目前科目
  // 只清除這個科目的統計與測驗紀錄
  const keepSubj = a => (a.subj || "chinese") !== c;
  toolWrite(TOOL_STATS_KEY, toolArr(TOOL_STATS_KEY).filter(keepSubj));
  toolWrite(TOOL_TESTS_KEY, toolArr(TOOL_TESTS_KEY).filter(keepSubj));
  const ex = toolRead(TOOL_EXAM_KEY, null);
  if (ex && (ex.subj || "chinese") === c) { localStorage.removeItem(TOOL_EXAM_KEY); mockTimer && clearInterval(mockTimer); }
  localStorage.removeItem(firstKeyOf(c));
  toolWrite(baseKeyOf(c), { t: 0, c: 0, w: [] });
  const cf = document.getElementById("clearConfirm");
  if (cf) cf.classList.remove("active");
  home();
}

// ---------- 側邊欄 ----------
const _navAfter = document.getElementById("navSettings");
Object.keys(TOOL_PAGES).reverse().forEach(k => {
  const el = document.createElement("div");
  el.className = "sidebar-item";
  el.id = "nav_" + k;
  el.textContent = ({ answers: "📋 答案表", mock: "📝 模擬測驗", stats: "📊 學習統計" })[k];
  el.onclick = () => switchPage(k);
  _navAfter.insertAdjacentElement("afterend", el);
});

// ---------- 包住既有函式 ----------
const _tSwitchPage = switchPage;
switchPage = function (p) {
  if (TOOL_PAGES[p]) { openTool(p); return; }
  window.__extraPage = null;
  Object.keys(TOOL_PAGES).forEach(k => { const el = document.getElementById("nav_" + k); if (el) el.classList.remove("active"); });
  return _tSwitchPage(p);
};
const _tGo = go;
go = function (k, f) { window.__extraPage = null; Object.keys(TOOL_PAGES).forEach(x => { const el = document.getElementById("nav_" + x); if (el) el.classList.remove("active"); }); return _tGo(k, f); };
const _tHome = home;
home = function () { if (window.__extraPage) { renderTool(window.__extraPage); return; } return _tHome(); };

// 記錄刷題練習的每一次作答（國文與英文）
const _tSubmit = submit;
submit = function () {
  const q = list[i];
  const ready = !done && picks && picks.size > 0 && q;   // 只在真的送出作答時記錄
  const letters = ready ? [...picks].sort().map(k => L[k]).join("") : "";
  _tSubmit();
  if (ready && (cur === "chinese" || cur === "english")) {
    addAttempt(cur, qidOf(q), letters === q.a, "practice");
  }
};

// 網址是 #tool-xxx 時直接開啟（等主程式初始化完成）
function ensureToolShown() {
  const m = location.hash.match(/^#tool-(answers|mock|stats)$/);
  if (!m) return;
  const sm = document.getElementById("subjectModal"); if (sm) sm.classList.remove("active");
  openTool(m[1]);
}
setTimeout(ensureToolShown, 0);
setTimeout(ensureToolShown, 300);
window.addEventListener("load", ensureToolShown);
