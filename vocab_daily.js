/* ==========================================
   英文單字（梯次二之一）：簽到、每日一批、測驗中間隔重複
   使用方式：在 index.html 的 vocab.js 之後加上：
   <script src="vocab_daily.js"></script>
   ========================================== */
(function () {
  const SIGN_KEY = "vocab_signin";          // 已簽到的日期，例如 ["2026-11-23"]
  const DAILY_KEY = "vocab_daily";          // 今天的每日一批 { date, ids }
  const NEXT_KEY = "vocab_daily_next";      // 下一批從第幾個開始（依級別、字母排序）
  const BATCH = 20;
  const GAP = 3;                             // 答錯後，隔 3 題再出現一次

  const rd = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch (e) { return fb; } };
  const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // ---------- 每日一批：依級別、字母排序，每天接著往下取 20 個 ----------
  function sortedAll() {
    return (VOCAB || []).slice().sort((a, b) => (a.level - b.level) || (a.en.toLowerCase() < b.en.toLowerCase() ? -1 : 1));
  }
  function dailyBatch() {
    const t = todayStr();
    const saved = rd(DAILY_KEY, null);
    if (saved && saved.date === t) return saved.ids;
    const all = sortedAll();
    let next = rd(NEXT_KEY, 0);
    const ids = all.slice(next, next + BATCH).map(w => w.id);
    next = Math.min(next + BATCH, all.length);
    wr(NEXT_KEY, next);
    wr(DAILY_KEY, { date: t, ids });
    return ids;
  }
  const isSigned = () => rd(SIGN_KEY, []).includes(todayStr());

  // ---------- 簽到彈窗（含月曆） ----------
  function signinModal() {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    const signed = new Set(rd(SIGN_KEY, []));
    let cells = "";
    for (let i = 0; i < first; i++) cells += `<div></div>`;
    for (let d = 1; d <= days; d++) {
      const key = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      const isToday = d === now.getDate();
      cells += `<div class="vd-day ${signed.has(key) ? "on" : ""} ${isToday ? "today" : ""}">${signed.has(key) ? "✓" : d}</div>`;
    }
    const signedNow = isSigned();
    const msg = signedNow
      ? `<p style="margin:10px 0 0;font-weight:bold;color:var(--ok)">今天已簽到！</p>`
      : `<p style="margin:10px 0 0">今天還沒簽到。</p>`;
    const m2 = vModal("vocabSignin");
    m2.innerHTML = `<div class="modal-content" onclick="event.stopPropagation()" style="width:min(380px,92vw)">
      <h3 style="display:flex;align-items:center;justify-content:space-between">📅 簽到<button class="go" style="width:auto;margin:0;padding:6px 10px;font-size:.85rem" onclick="VocabDaily.daily()">每日單字</button></h3>
      <p class="vd-month">${y} 年 ${m + 1} 月</p>
      <div class="vd-week"><div>日</div><div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div></div>
      <div class="vd-grid">${cells}</div>
      ${msg}
      <div class="modal-actions">
        ${signedNow ? "" : `<button class="go" onclick="VocabDaily.signin()">簽到</button>`}
        <button class="go" style="background:var(--bd);color:var(--text-color);box-shadow:none" onclick="document.getElementById('vocabSignin').classList.remove('active')">關閉</button>
      </div>
    </div>`;
    m2.classList.add("active");
  }
  function signinSuccess() {
    const m2 = vModal("vocabSignin");
    m2.innerHTML = `<div class="modal-content" onclick="event.stopPropagation()" style="width:min(380px,92vw);text-align:center">
      <h3 style="justify-content:center">✅ 簽到成功！</h3>
      <p style="text-align:left;line-height:1.7">為你整理了 ${BATCH} 個每日單字，要現在試試看嗎？</p>
      <div class="modal-actions">
        <button class="go" onclick="VocabDaily.daily()">每日單字</button>
        <button class="go" style="background:var(--bd);color:var(--text-color);box-shadow:none" onclick="document.getElementById('vocabSignin').classList.remove('active')">稍後再說</button>
      </div>
      <button class="vd-corner" onclick="VocabDaily.daily()">每日單字</button>
    </div>`;
    m2.classList.add("active");
  }

  // ---------- 每日單字彈窗 ----------
  function dailyModal() {
    const ids = dailyBatch();
    const byId = new Map((VOCAB || []).map(w => [w.id, w]));
    const words = ids.map(id => byId.get(id)).filter(Boolean);
    const rows = words.map((w, i) => `<div class="vd-row"><span class="vd-no">${i + 1}</span><div><strong>${esc(w.en)}</strong> <span style="opacity:.6;font-size:.8rem">${esc(w.pos)}</span><div style="opacity:.8;font-size:.9rem">${esc(w.zh)}</div></div></div>`).join("");
    const m2 = vModal("vocabDaily");
    m2.innerHTML = `<div class="modal-content" onclick="event.stopPropagation()" style="width:min(420px,92vw);max-height:86vh;overflow-y:auto">
      <h3>📚 每日單字</h3>
      <p class="helper-text" style="margin:0 0 8px">今天的 ${words.length} 個單字，點下方方式直接測驗。</p>
      <div class="vd-list">${rows}</div>
      <p class="vd-label">用這 ${words.length} 個單字測驗</p>
      <div class="vd-types">
        <button class="vt-chip" onclick="VocabDaily.test('en2zh')">英選中</button>
        <button class="vt-chip" onclick="VocabDaily.test('zh2en')">中選英</button>
        <button class="vt-chip" onclick="VocabDaily.test('typing')">中文拼英文</button>
        <button class="vt-chip" onclick="VocabDaily.test('match')">10 個配對</button>
      </div>
      <div class="modal-actions"><button class="go" style="background:var(--bd);color:var(--text-color);box-shadow:none" onclick="document.getElementById('vocabDaily').classList.remove('active')">關閉</button></div>
    </div>`;
    m2.classList.add("active");
  }

  // ---------- 每日單字測驗：把 pool 限制在今天的 20 個 ----------
  const _poolFor = poolFor;
  poolFor = function (all, by, vals) {
    if (by === "ids") { const set = new Set(vals); return all.filter(w => set.has(w.id)); }
    return _poolFor(all, by, vals);
  };
  function startDailyTest(type) {
    const ids = dailyBatch();
    VTEST.type = type;
    VTEST.by = "ids";
    VTEST.val = ids;
    const n = type === "match" ? 2 : ids.length;
    document.getElementById("vocabDaily").classList.remove("active");
    document.getElementById("vocabSignin").classList.remove("active");
    startTest(n);
  }

  // ---------- 答錯後間隔重複：隔 GAP 題再出現一次（與一般題目相同，不加記號） ----------
  const _advance = VTestAct.advance;
  VTestAct.advance = function () {
    const q = VTEST.qs[VTEST.idx], a = VTEST.answers[VTEST.idx];
    if (q && !q.retry && (q.kind === "choice" || q.kind === "type")) {
      const ok = q.kind === "choice" ? a === q.answerIdx : isAnswerOk(q.en, a);
      if (!ok) {
        const clone = Object.assign({}, q, { retry: true, state: undefined });
        const pos = Math.min(VTEST.idx + 1 + GAP, VTEST.qs.length);
        VTEST.qs.splice(pos, 0, clone);
      }
    }
    return _advance.apply(this, arguments);
  };

  // ---------- 單字頁「簽到」按鈕（放在底部橢圓，與全部／收藏／不熟並列） ----------
  const _renderVocab = renderVocab;
  renderVocab = function () {
    _renderVocab();
    const bar = document.getElementById("vocabTabs");
    if (!bar || bar.querySelector(".v-signin")) return;
    const b = document.createElement("button");
    b.className = "v-tab v-signin";
    b.textContent = isSigned() ? "簽到 ✓" : "簽到";
    b.onclick = () => VocabDaily.signinOpen();
    bar.insertBefore(b, bar.children[1] || null);
  };

  // ---------- 樣式 ----------
  const css = document.createElement("style");
  css.textContent = `
    .vd-month{font-weight:bold;margin:0 0 6px}
    .vd-week,.vd-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center}
    .vd-week{font-size:.8rem;opacity:.6;margin-bottom:4px}
    .vd-day{padding:6px 0;border-radius:8px;font-size:.9rem}
    .vd-day.on{background:color-mix(in srgb,var(--ok) 25%,var(--card));color:var(--ok);font-weight:bold}
    .vd-day.today{outline:2px solid #3b82f6;outline-offset:-2px}
    .vd-corner{position:absolute;right:12px;bottom:12px;padding:6px 10px;font-size:.8rem;margin:0;border-radius:999px}
    .vd-list{display:flex;flex-direction:column;gap:6px}
    .vd-row{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px dashed var(--bd)}
    .vd-no{min-width:22px;opacity:.5;font-size:.85rem;padding-top:2px}
    .vd-label{font-weight:bold;margin:14px 0 6px}
    .vd-types{display:flex;flex-wrap:wrap;gap:8px}
    .v-tabs .v-signin{}
  `;
  document.head.appendChild(css);

  // ---------- 對外介面 ----------
  window.VocabDaily = {
    signinOpen() { signinModal(); },
    signin() { const l = rd(SIGN_KEY, []); if (!l.includes(todayStr())) l.push(todayStr()); wr(SIGN_KEY, l); dailyBatch(); signinSuccess(); },
    daily() { dailyModal(); },
    test(type) { startDailyTest(type); }
  };
})();
