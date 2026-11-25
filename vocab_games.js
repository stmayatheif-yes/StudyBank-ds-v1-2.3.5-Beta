/* ==========================================
   英文小遊戲（梯次二之二）：翻牌配對、字母重組、限時猜字、限時接龍
   使用方式：在 index.html 的 vocab_daily.js 之後加上：
   <script src="vocab_games.js"></script>
   ========================================== */
(function () {
  let timers = [];                       // 離開遊戲時要清掉的計時器
  const clearTimers = () => { timers.forEach(t => { clearInterval(t); clearTimeout(t); }); timers = []; };
  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (arr, n) => shuffle(arr).slice(0, n);
  // 可用於拼字類遊戲的單字：只含英文字母的單一字
  const singles = (minLen, maxLen) => (VOCAB || []).filter(w => /^[a-z]+$/i.test(w.en) && w.en.length >= minLen && w.en.length <= maxLen);

  // ---------- 遊戲選單（彈窗） ----------
  const GAMES = [
    { k: "match", name: "翻牌配對", desc: "英文與中文翻牌配對" },
    { k: "scramble", name: "字母重組", desc: "依中文，把打亂的字母排成單字" },
    { k: "wordle", name: "限時猜字", desc: "依顏色提示猜出單字，有次數與時間限制" },
    { k: "chain", name: "限時接龍", desc: "依上一個字的最後字母，接出下一個單字" }
  ];
  function openMenu() {
    const m = vModal("vgameMenu");
    m.innerHTML = `<div class="modal-content" onclick="event.stopPropagation()" style="width:min(380px,92vw)">
      <h3>🎮 小遊戲</h3>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${GAMES.map(g => `<button class="vg-pick" onclick="VGame.start('${g.k}')"><strong>${g.name}</strong><span>${g.desc}</span></button>`).join("")}
      </div>
      <div class="modal-actions"><button class="go" style="background:var(--bd);color:var(--text-color);box-shadow:none" onclick="document.getElementById('vgameMenu').classList.remove('active')">取消</button></div>
    </div>`;
    m.classList.add("active");
  }

  // ---------- 遊戲頁共用外框 ----------
  function frame(title, body) {
    removeVocabTabs();
    window.__vgameActive = true;
    A.innerHTML = `<div class="card vg-card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px dashed var(--bd)">
        <strong>${title}</strong><button onclick="VGame.quit()" style="padding:6px 12px;margin:0">返回單字</button></div>
      ${body}</div>`;
    window.scrollTo(0, 0);
  }

  // ---------- 1. 翻牌配對 ----------
  let M = null;
  function startMatch() {
    const words = pick(singles(1, 99), 6);
    const cards = shuffle(words.flatMap(w => [{ id: w.id, t: w.en }, { id: w.id, t: w.zh }]).map((c, i) => ({ ...c, i })));
    M = { cards, open: [], done: {}, moves: 0, lock: false };
    drawMatch();
  }
  function drawMatch() {
    const total = M.cards.length / 2, found = Object.keys(M.done).length;
    const grid = M.cards.map((c, k) => {
      const show = M.done[c.id] || M.open.includes(k);
      return `<button class="vg-card-tile ${M.done[c.id] ? "done" : ""}" onclick="VGame.flip(${k})">${show ? esc(c.t) : "？"}</button>`;
    }).join("");
    const end = found === total ? `<div class="vg-result"><p>完成！共 ${M.moves} 步</p><button class="go" onclick="VGame.again('match')">再玩一次</button></div>` : "";
    frame("🃏 翻牌配對", `<p class="meta"><span>配對 ${found} / ${total}　步數 ${M.moves}</span></p><div class="vg-grid-match">${grid}</div>${end}`);
  }
  function flipMatch(k) {
    if (M.lock || M.open.includes(k) || M.done[M.cards[k].id]) return;
    M.open.push(k);
    if (M.open.length === 2) {
      M.moves++;
      const [a, b] = M.open.map(x => M.cards[x]);
      if (a.id === b.id && a.i !== b.i) {
        M.done[a.id] = true; M.open = []; drawMatch();
      } else {
        M.lock = true; drawMatch();
        timers.push(setTimeout(() => { M.open = []; M.lock = false; drawMatch(); }, 800));
      }
    } else drawMatch();
  }

  // ---------- 2. 字母重組 ----------
  let S = null;
  function startScramble() {
    const words = pick(singles(3, 9), 8);
    S = { rounds: words, r: 0, ans: [], bank: [], score: 0, msg: "" };
    setupScrambleRound();
    drawScramble();
  }
  function setupScrambleRound() {
    const w = S.rounds[S.r];
    let letters = shuffle(w.en.toLowerCase().split(""));
    if (letters.join("") === w.en.toLowerCase()) letters = letters.reverse();
    S.bank = letters; S.ans = []; S.msg = "";
  }
  function drawScramble() {
    if (S.r >= S.rounds.length) {
      frame("🔤 字母重組", `<div class="vg-result"><p>完成！答對 ${S.score} / ${S.rounds.length} 題</p><button class="go" onclick="VGame.again('scramble')">再玩一次</button></div>`);
      return;
    }
    const w = S.rounds[S.r];
    const used = new Set(S.ans.map(x => x.idx));
    frame("🔤 字母重組", `<p class="meta"><span>第 ${S.r + 1} / ${S.rounds.length} 題　答對 ${S.score}</span></p>
      <p style="font-size:1.2rem;text-align:center;margin:10px 0">${esc(w.zh)}</p>
      <div class="vg-answer">${S.ans.map((x, k) => `<button class="vg-letter" onclick="VGame.unpick(${k})">${esc(x.ch)}</button>`).join("") || `<span class="meta" style="margin:0"><span>點下方字母排出單字</span></span>`}</div>
      <div class="vg-bank">${S.bank.map((ch, i) => `<button class="vg-letter ${used.has(i) ? "off" : ""}" ${used.has(i) ? "disabled" : ""} onclick="VGame.pick(${i})">${esc(ch)}</button>`).join("")}</div>
      <p style="color:var(--no);min-height:1.2em;text-align:center">${esc(S.msg)}</p>
      <div style="display:flex;gap:8px"><button style="flex:1;margin:0" onclick="VGame.clearScramble()">清除</button><button style="flex:1;margin:0" onclick="VGame.skipScramble()">跳過</button></div>`);
  }
  function pickScramble(i) {
    const w = S.rounds[S.r];
    S.ans.push({ idx: i, ch: S.bank[i] });
    if (S.ans.length === w.en.length) {
      if (S.ans.map(x => x.ch).join("") === w.en.toLowerCase()) { S.score++; S.r++; if (S.r < S.rounds.length) setupScrambleRound(); S.msg = "答對了！"; }
      else { S.msg = "不對，再試一次"; S.ans = []; }
    }
    drawScramble();
  }

  // ---------- 3. 限時猜字（Wordle 式） ----------
  let W = null;
  const WORDLE_TIME = 90, WORDLE_TRIES = 6;
  function startWordle() {
    const pool = singles(4, 6);
    const w = pick(pool, 1)[0];
    W = { word: w.en.toLowerCase(), zh: w.zh, rows: [], left: WORDLE_TIME, over: false, won: false };
    timers.push(setInterval(tickWordle, 1000));
    drawWordle();
  }
  function updateTimer(sec) {
    const el = document.getElementById("vgTimer");
    if (el) el.textContent = String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
  }
  function tickWordle() {
    if (!W || W.over) return;
    W.left--;
    if (W.left <= 0) { W.over = true; W.left = 0; drawWordle(); return; }
    updateTimer(W.left);
  }
  // 顏色：g 位置正確，y 字母有但位置不對，n 沒有
  function score(guess, target) {
    const res = Array(guess.length).fill("n"), cnt = {};
    for (let i = 0; i < guess.length; i++) {
      if (guess[i] === target[i]) res[i] = "g"; else cnt[target[i]] = (cnt[target[i]] || 0) + 1;
    }
    for (let i = 0; i < guess.length; i++) {
      if (res[i] === "g") continue;
      if (cnt[guess[i]] > 0) { res[i] = "y"; cnt[guess[i]]--; }
    }
    return res;
  }
  function submitWordle(val) {
    if (W.over) return;
    const g = (val || "").trim().toLowerCase();
    if (g.length !== W.word.length || !/^[a-z]+$/.test(g)) { W.msg = `請輸入 ${W.word.length} 個英文字母`; drawWordle(); return; }
    W.msg = "";
    W.rows.push({ g, res: score(g, W.word) });
    if (g === W.word) { W.over = true; W.won = true; }
    else if (W.rows.length >= WORDLE_TRIES) { W.over = true; }
    drawWordle();
  }
  function drawWordle() {
    const rows = W.rows.map(r => `<div class="vg-wrow">${r.g.split("").map((ch, i) => `<span class="vg-wc ${r.res[i]}">${esc(ch.toUpperCase())}</span>`).join("")}</div>`).join("");
    const blanks = Array(WORDLE_TRIES - W.rows.length - (W.over ? 0 : 0)).fill(0).map(() => `<div class="vg-wrow">${Array(W.word.length).fill(0).map(() => `<span class="vg-wc">·</span>`).join("")}</div>`).join("");
    const mm = String(Math.floor(W.left / 60)).padStart(2, "0"), ss = String(W.left % 60).padStart(2, "0");
    const end = W.over ? `<div class="vg-result"><p>${W.won ? "猜對了！" : "時間到或次數用完"}　答案：<strong>${esc(W.word)}</strong></p><p class="meta"><span>${esc(W.zh)}</span></p><button class="go" onclick="VGame.again('wordle')">再玩一次</button></div>` : "";
    frame("🔠 限時猜字", `<p class="meta"><span>剩餘 <span id="vgTimer">${mm}:${ss}</span>　次數 ${W.rows.length} / ${WORDLE_TRIES}</span></p>
      <p style="text-align:center;margin:6px 0 10px">提示：${esc(W.zh)}（${W.word.length} 個字母）</p>
      <div class="vg-wordle">${rows}${W.over ? "" : blanks}</div>
      ${W.over ? end : `<input type="text" id="vgWordleIn" maxlength="${W.word.length}" autocomplete="off" autocapitalize="off" spellcheck="false" style="width:100%;box-sizing:border-box;text-align:center;font-size:1.2rem;text-transform:lowercase" onkeypress="if(event.key==='Enter')VGame.wordleSubmit()">
      <button class="go" onclick="VGame.wordleSubmit()">猜</button>
      <p class="meta" style="margin:8px 0 0"><span><span class="vg-wc g">綠</span> 位置正確　<span class="vg-wc y">黃</span> 字母有但位置不對　<span class="vg-wc n">灰</span> 沒有</span></p>`}
      <p style="color:var(--no);min-height:1.2em;text-align:center">${esc(W.msg || "")}</p>`);
    if (!W.over) setTimeout(() => { const i = document.getElementById("vgWordleIn"); if (i) i.focus(); }, 30);
  }

  // ---------- 4. 限時接龍 ----------
  let C = null;
  const CHAIN_TIME = 60;
  function startChain() {
    const pool = (VOCAB || []).filter(w => /^[a-z]+$/i.test(w.en.split("/")[0].trim()));
    const first = pick(pool, 1)[0];
    C = { used: new Set(), chain: [], need: first.en.toLowerCase()[0], left: CHAIN_TIME, over: false, pool, msg: "" };
    timers.push(setInterval(tickChain, 1000));
    drawChain();
  }
  function tickChain() {
    if (!C || C.over) return;
    C.left--;
    if (C.left <= 0) { C.over = true; C.left = 0; drawChain(); return; }
    updateTimer(C.left);
  }
  function submitChain(val) {
    if (C.over) return;
    const t = (val || "").trim().toLowerCase();
    if (!t) return;
    if (t[0] !== C.need) { C.msg = `要以「${C.need.toUpperCase()}」開頭`; drawChain(); return; }
    if (C.used.has(t)) { C.msg = "這個字已經用過了"; drawChain(); return; }
    const hit = C.pool.find(w => acceptSet(w.en).has(t));
    if (!hit) { C.msg = "單字表中找不到這個字"; drawChain(); return; }
    C.used.add(t); C.chain.push(t); C.need = t[t.length - 1];
    C.msg = "";
    if (!C.pool.some(w => w.en.toLowerCase()[0] === C.need && !C.used.has(w.en.toLowerCase()))) { C.over = true; }
    drawChain();
  }
  function drawChain() {
    const mm = String(Math.floor(C.left / 60)).padStart(2, "0"), ss = String(C.left % 60).padStart(2, "0");
    const list = C.chain.map(w => `<span class="vg-tag">${esc(w)}</span>`).join("");
    const end = C.over ? `<div class="vg-result"><p>結束！接龍 ${C.chain.length} 個字</p><button class="go" onclick="VGame.again('chain')">再玩一次</button></div>` : "";
    frame("🔗 限時接龍", `<p class="meta"><span>剩餘 <span id="vgTimer">${mm}:${ss}</span>　已接 ${C.chain.length} 個</span></p>
      <p style="text-align:center;font-size:1.3rem;margin:10px 0">請輸入以 <strong style="color:var(--ac)">${esc(C.need.toUpperCase())}</strong> 開頭的英文單字</p>
      <div class="vg-tags">${list || `<span class="meta" style="margin:0"><span>還沒有接到字</span></span>`}</div>
      ${C.over ? end : `<input type="text" id="vgChainIn" autocomplete="off" autocapitalize="off" spellcheck="false" style="width:100%;box-sizing:border-box;text-align:center;font-size:1.2rem" onkeypress="if(event.key==='Enter')VGame.chainSubmit()">
      <button class="go" onclick="VGame.chainSubmit()">送出</button>`}
      <p style="color:var(--no);min-height:1.2em;text-align:center">${esc(C.msg || "")}</p>`);
    if (!C.over) setTimeout(() => { const i = document.getElementById("vgChainIn"); if (i) i.focus(); }, 30);
  }

  // ---------- 介面 ----------
  const VGame = {
    start(k) {
      document.getElementById("vgameMenu").classList.remove("active");
      clearTimers();
      if (k === "match") startMatch();
      if (k === "scramble") startScramble();
      if (k === "wordle") startWordle();
      if (k === "chain") startChain();
    },
    again(k) { VGame.start(k); },
    flip(k) { flipMatch(k); },
    pick(i) { pickScramble(i); },
    unpick(k) { S.ans.splice(k, 1); drawScramble(); },
    clearScramble() { S.ans = []; S.msg = ""; drawScramble(); },
    skipScramble() { S.r++; if (S.r < S.rounds.length) setupScrambleRound(); drawScramble(); },
    wordleSubmit() { submitWordle(document.getElementById("vgWordleIn").value); },
    chainSubmit() { const i = document.getElementById("vgChainIn"); submitChain(i.value); if (i) i.value = ""; },
    quit() { clearTimers(); window.__vgameActive = false; renderVocab(); },
    menu() { openMenu(); }
  };
  window.VGame = VGame;

  // ---------- 樣式 ----------
  const css = document.createElement("style");
  css.textContent = `
    .vg-pick{display:flex;flex-direction:column;align-items:flex-start;text-align:left;padding:12px 14px;margin:0}
    .vg-pick span{font-size:.8rem;opacity:.7;font-weight:normal}
    .vg-grid-match{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .vg-card-tile{min-height:72px;padding:6px;font-size:.85rem;margin:0;word-break:break-word}
    .vg-card-tile.done{opacity:.35;background:var(--ok);color:#fff}
    .vg-answer{min-height:52px;display:flex;flex-wrap:wrap;gap:6px;justify-content:center;padding:8px;border:1px dashed var(--bd);border-radius:10px;margin-bottom:12px}
    .vg-bank{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:12px}
    .vg-letter{padding:8px 12px;margin:0;font-size:1.1rem;font-weight:bold}
    .vg-letter.off{opacity:.25}
    .vg-wordle{display:flex;flex-direction:column;gap:6px;align-items:center;margin:8px 0 12px}
    .vg-wrow{display:flex;gap:6px}
    .vg-wc{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:8px;border:1px solid var(--bd);font-weight:bold;background:var(--card)}
    .vg-wc.g{background:var(--ok);color:#fff;border-color:transparent}
    .vg-wc.y{background:#facc15;color:#111;border-color:transparent}
    .vg-wc.n{background:var(--bd);color:var(--text-color)}
    .vg-tags{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;min-height:40px;margin-bottom:12px}
    .vg-tag{padding:4px 10px;border-radius:999px;background:var(--bg);border:1px solid var(--bd)}
    .vg-result{text-align:center;margin-top:14px}
    .vg-half{flex:1;margin:0 0 12px;padding:10px;font-size:.95rem}
    .vg-row2{display:flex;gap:8px;align-items:stretch}
  `;
  document.head.appendChild(css);

  // ---------- 單字頁：測驗按鈕縮小到左半，右半放小遊戲 ----------
  const _renderVocab = renderVocab;
  renderVocab = function () {
    _renderVocab();
    const testBtn = [...document.querySelectorAll("#app .go")].find(b => b.textContent.includes("測驗"));
    if (!testBtn || testBtn.parentElement.classList.contains("vg-row2")) return;
    const row = document.createElement("div");
    row.className = "vg-row2";
    testBtn.parentElement.insertBefore(row, testBtn);
    row.appendChild(testBtn);
    testBtn.classList.add("vg-half");
    const gameBtn = document.createElement("button");
    gameBtn.className = "go vg-half";
    gameBtn.textContent = "🎮 小遊戲";
    gameBtn.onclick = () => VGame.menu();
    row.appendChild(gameBtn);
    [testBtn, gameBtn].forEach(b => { b.style.margin = "0"; b.style.height = "48px"; b.style.padding = "0 10px"; b.style.width = "auto"; b.style.flex = "1"; });
  };
})();
