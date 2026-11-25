/* ==========================================
   英文單字卡：左滑＝不熟（自動加入❗不熟）、右滑＝熟（不計入）、點一下翻面
   使用方式：在 index.html 的 vocab_games.js 之後加上：
   <script src="vocab_cards.js"></script>
   ========================================== */
(function () {
  const HARD_KEY = "vocab_hard";
  const rdArr = k => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; } };
  const wrArr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---------- 範圍選擇 ----------
  const CS = { by: "all", vals: [], list: [], idx: 0, hard: 0, easy: 0, flipped: false };
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  function poolOf() {
    const all = VOCAB || [];
    if (CS.by === "all" || CS.vals.length === 0) return all.slice();
    if (CS.by === "alpha") {
      const set = new Set(CS.vals.map(x => x.toLowerCase()));
      return all.filter(w => set.has((w.en.replace(/^[^a-zA-Z]+/, "")[0] || "").toLowerCase()));
    }
    const set = new Set(CS.vals.map(String));
    return all.filter(w => set.has(String(w.level)));
  }

  function openSetup() {
    const m = document.getElementById("vcardSetup") || (() => {
      const d = document.createElement("div"); d.id = "vcardSetup"; d.className = "modal-overlay"; d.style.zIndex = "1400";
      d.onclick = e => { if (e.target === d) d.classList.remove("active"); };
      document.body.appendChild(d); return d;
    })();
    const chips = (arr, isOn, onc) => arr.map(v => `<button class="vt-chip ${isOn(v) ? "on" : ""}" onclick="${onc}('${v}')">${v === "ALL" ? "全部" : v}</button>`).join("");
    const alphaRow = CS.by === "alpha" ? `<div class="vt-grid">${chips(["ALL", ...LETTERS], v => v === "ALL" ? CS.vals.length === 0 : CS.vals.includes(v), "VCards.setVal")}</div>` : "";
    const levelRow = CS.by === "level" ? `<div class="vt-grid">${chips(["ALL", "1", "2", "3", "4", "5", "6"], v => v === "ALL" ? CS.vals.length === 0 : CS.vals.map(String).includes(v), "VCards.setVal")}</div>` : "";
    m.innerHTML = `<div class="modal-content" onclick="event.stopPropagation()" style="width:min(440px,92vw);max-height:86vh;overflow-y:auto">
      <h3>🃏 單字卡</h3>
      <p class="vt-label">範圍</p>
      <div class="vt-grid">
        <button class="vt-chip ${CS.by === "all" ? "on" : ""}" onclick="VCards.setBy('all')">全部</button>
        <button class="vt-chip ${CS.by === "alpha" ? "on" : ""}" onclick="VCards.setBy('alpha')">字母 A~Z</button>
        <button class="vt-chip ${CS.by === "level" ? "on" : ""}" onclick="VCards.setBy('level')">等級 1~6</button>
      </div>
      ${alphaRow}${levelRow}
      <p class="meta" style="margin:10px 0 0"><span>範圍內單字：${poolOf().length}</span></p>
      <p class="helper-text" style="margin:8px 0 0">點卡片翻面。左滑＝不熟（自動加入❗不熟）；右滑＝熟（不計入）。</p>
      <div class="modal-actions">
        <button class="go" onclick="VCards.start()">開始</button>
        <button class="go" style="background:var(--bd);color:var(--text-color);box-shadow:none" onclick="document.getElementById('vcardSetup').classList.remove('active')">取消</button>
      </div></div>`;
    m.classList.add("active");
  }

  // ---------- 單字卡頁 ----------
  function drawCard() {
    removeVocabTabs();
    window.__cardsActive = true;
    const total = CS.list.length;
    if (CS.idx >= total) {
      A.innerHTML = `<div class="card v-test"><div class="header-row"><h2>🃏 單字卡完成</h2></div>
        <p style="margin:8px 0">共 ${total} 張　❗ 不熟 <strong>${CS.hard}</strong>　熟 <strong>${CS.easy}</strong></p>
        <button class="go" onclick="VCards.again()">再來一次</button>
        <button class="go" style="background:var(--bd);color:var(--text-color);box-shadow:none" onclick="VCards.back()">回到單字頁</button></div>`;
      window.scrollTo(0, 0);
      return;
    }
    const w = CS.list[CS.idx];
    A.innerHTML = `<div class="card v-test">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px dashed var(--bd)">
        <span>第 ${CS.idx + 1} / ${total} 張　❗ ${CS.hard}　熟 ${CS.easy}</span>
        <button onclick="VCards.back()" style="padding:6px 12px;margin:0">結束</button></div>
      <div class="vc-stage" id="vcStage">
        <div class="vc-card ${CS.flipped ? "flip" : ""}" id="vcCard">
          <div class="vc-face vc-front"><div class="vc-word">${esc(w.en)}</div><div class="vc-pos">${esc(w.pos)}</div><div class="vc-hint">點一下翻面</div></div>
          <div class="vc-face vc-back"><div class="vc-zh">${esc(w.zh)}</div><div class="vc-pos">${esc(w.pos)}</div><div class="vc-hint">Level ${w.level}</div></div>
        </div>
      </div>
      <div class="vc-hintbar"><span>← 不熟</span><span>熟 →</span></div>
      <div style="display:flex;gap:8px"><button style="flex:1;margin:0" onclick="VCards.mark('hard')">❗ 不熟</button><button style="flex:1;margin:0" onclick="VCards.mark('easy')">熟</button></div>
    </div>`;
    bindSwipe();
    window.scrollTo(0, 0);
  }

  // 滑動與點擊：拖曳超過門檻就送出，沒超過則回彈；移動很少視為點擊翻面
  function bindSwipe() {
    const card = document.getElementById("vcCard");
    if (!card) return;
    let sx = 0, dx = 0, down = false, moved = false;
    card.addEventListener("pointerdown", e => { down = true; moved = false; sx = e.clientX; dx = 0; card.setPointerCapture(e.pointerId); card.style.transition = "none"; });
    card.addEventListener("pointermove", e => {
      if (!down) return;
      dx = e.clientX - sx;
      if (Math.abs(dx) > 6) moved = true;
      card.style.transform = `translateX(${dx}px) rotate(${dx / 20}deg)`;
    });
    const end = () => {
      if (!down) return;
      down = false;
      card.style.transition = "transform .25s ease";
      if (dx < -90) { card.style.transform = "translateX(-160%) rotate(-18deg)"; setTimeout(() => VCards.mark("hard"), 180); }
      else if (dx > 90) { card.style.transform = "translateX(160%) rotate(18deg)"; setTimeout(() => VCards.mark("easy"), 180); }
      else { card.style.transform = ""; if (!moved) VCards.flip(); }
    };
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
  }

  // ---------- 介面 ----------
  const VCards = {
    setup() { openSetup(); },
    setBy(b) { CS.by = b; CS.vals = []; openSetup(); },
    setVal(v) {
      if (v === "ALL") { CS.vals = []; openSetup(); return; }
      const key = CS.by === "level" ? Number(v) : v;
      const i = CS.vals.findIndex(x => String(x) === String(key));
      if (i >= 0) CS.vals.splice(i, 1); else CS.vals.push(key);
      openSetup();
    },
    start() {
      const list = shuffle(poolOf());
      if (!list.length) { alert("這個範圍沒有單字"); return; }
      document.getElementById("vcardSetup").classList.remove("active");
      Object.assign(CS, { list, idx: 0, hard: 0, easy: 0, flipped: false });
      drawCard();
    },
    again() { VCards.start(); },
    flip() { CS.flipped = !CS.flipped; const c = document.getElementById("vcCard"); if (c) c.classList.toggle("flip", CS.flipped); },
    mark(kind) {
      if (CS.idx >= CS.list.length) return;
      const w = CS.list[CS.idx];
      if (kind === "hard") {
        const a = rdArr(HARD_KEY);
        if (!a.includes(w.id)) { a.push(w.id); wrArr(HARD_KEY, a); }
        CS.hard++;
      } else CS.easy++;
      CS.idx++; CS.flipped = false;
      drawCard();
    },
    back() { window.__cardsActive = false; renderVocab(); }
  };
  window.VCards = VCards;

  // ---------- 樣式 ----------
  const css = document.createElement("style");
  css.textContent = `
    .vc-stage{perspective:1000px;margin:8px 0 6px}
    .vc-card{position:relative;width:100%;min-height:240px;transform-style:preserve-3d;transition:transform .5s ease;touch-action:pan-y;cursor:pointer;user-select:none}
    .vc-card.flip{transform:rotateY(180deg)}
    .vc-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border:1px solid var(--bd);border-radius:16px;background:var(--card);box-shadow:var(--shadow);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;text-align:center}
    .vc-back{transform:rotateY(180deg)}
    .vc-word{font-size:2rem;font-weight:bold;word-break:break-word}
    .vc-zh{font-size:1.5rem;font-weight:bold;word-break:break-word}
    .vc-pos{font-size:.85rem;opacity:.6;margin-top:6px}
    .vc-hint{font-size:.75rem;opacity:.45;margin-top:14px}
    .vc-hintbar{display:flex;justify-content:space-between;font-size:.8rem;opacity:.6;margin:6px 4px 10px}
    .vt-label{font-weight:bold;margin:14px 0 6px;font-size:.95rem}
  `;
  document.head.appendChild(css);

  // ---------- 單字頁：第三顆按鈕「單字卡」，三顆等寬 ----------
  const _renderVocab = renderVocab;
  renderVocab = function () {
    _renderVocab();
    const row = document.querySelector("#app .vg-row2");
    if (!row || row.querySelector(".vc-btn")) return;
    const b = document.createElement("button");
    b.className = "go vc-btn";
    b.textContent = "🃏 單字卡";
    b.onclick = () => VCards.setup();
    row.appendChild(b);
    [...row.children].forEach(x => { x.style.flex = "1"; x.style.width = "auto"; x.style.margin = "0"; x.style.height = "48px"; x.style.padding = "0 8px"; x.style.fontSize = ".9rem"; });
  };
})();
