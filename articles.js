/* ==========================================
   古文文章總覽（古文15 / 古文30）
   使用方式：把本檔與 articles.json 放在 GitHub 專案根目錄，
   並在 index.html 的 </body> 前加上：<script src="articles.js"></script>
   ========================================== */
(function () {
  const DYNASTIES = ["先秦", "漢", "魏晉南北朝", "隋唐", "宋", "元", "明", "清", "民國", "現代"];
  const GENRES = ["散文", "駢文", "辭賦", "詩", "詞", "曲", "新詩"];

  let ART_LIST = null;          // 全部文章（載入後才有值）
  let artGroup = null;          // "15" 或 "30"
  let artView = "list";         // "list" 或 "detail"
  let artOpenId = null;         // 目前閱讀的文章 id
  const artSel = { dyn: new Set(), gen: new Set() };

  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fmt = s => esc(s).replace(/\n/g, "<br>");
  // 注釋：每一行變成一個條列項目，沒有注釋則顯示「暫無」
  const notesHTML = s => {
    const items = String(s || "").split("\n").map(x => x.trim()).filter(Boolean);
    if (!items.length) return "暫無";
    return `<ul class="art-notes">${items.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
  };

  // 樣式
  const css = `
    .art-chips{display:flex;gap:8px;overflow-x:auto;padding:4px 0 10px;-webkit-overflow-scrolling:touch;scrollbar-width:none}
    .art-chips::-webkit-scrollbar{display:none}
    .art-chip{flex:0 0 auto;padding:6px 12px;border-radius:999px;border:1px solid var(--bd);background:var(--card);color:var(--text-color);font-size:0.9rem;cursor:pointer;white-space:nowrap}
    .art-chip.on{background:#3b82f6;color:#fff;border-color:transparent}
    .art-chip .art-n{margin-left:6px;opacity:.6;font-size:.8rem}
    .art-row-label{font-size:.85rem;opacity:.7;margin-top:6px}
    .art-clear{margin-top:6px;font-size:.85rem;color:var(--no);background:transparent;border:none;cursor:pointer;padding:4px 0}
    .art-item{cursor:pointer}
    .art-item:hover{border-color:var(--ac)}
    .art-title{font-size:1.1rem;font-weight:bold;margin-bottom:4px}
    .art-meta{font-size:.85rem;opacity:.7}
    .art-original{margin-top:16px;font-size:1.05rem;line-height:2;white-space:normal}
    .art-entry .go{margin-top:12px}
    .art-notes{margin:0;padding-left:0;list-style:none;line-height:1.8;font-size:.95rem}
    .art-notes li{margin-bottom:6px}
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // 選擇視窗
  const modal = document.createElement("div");
  modal.id = "artChooser";
  modal.className = "modal-overlay";
  modal.setAttribute("onclick", "ArtUI.closeChooser(event)");
  modal.innerHTML = `
    <div class="modal-content" onclick="event.stopPropagation()" style="width:340px;text-align:center">
      <h3>想看哪一份古文？</h3>
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:16px">
        <button class="go" onclick="ArtUI.openGroup('15')">古文15</button>
        <button class="go" onclick="ArtUI.openGroup('30')">古文30</button>
        <button class="go" style="background:var(--bd);color:var(--text-color);box-shadow:none" onclick="ArtUI.closeChooser()">取消</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  function baseList() {
    return (ART_LIST || []).filter(a => String(a.group) === String(artGroup));
  }
  function filtered() {
    return baseList().filter(a =>
      (artSel.dyn.size === 0 || artSel.dyn.has(a.dynasty)) &&
      (artSel.gen.size === 0 || artSel.gen.has(a.genre)));
  }
  function chips(type, values) {
    const field = type === "dyn" ? "dynasty" : "genre";
    const set = type === "dyn" ? artSel.dyn : artSel.gen;
    return values.map(v => {
      const n = baseList().filter(a => a[field] === v).length;
      return `<button class="art-chip${set.has(v) ? " on" : ""}" onclick="ArtUI.toggle('${type}','${v}')">${v}<span class="art-n">${n}</span></button>`;
    }).join("");
  }

  function renderList() {
    const A = document.getElementById("app");
    const total = baseList().length;
    const items = filtered();
    let body;
    if (!total) body = `<div class="card"><p class="meta"><span>文章準備中，之後會開放。</span></p></div>`;
    else if (!items.length) body = `<div class="card"><p class="meta"><span>沒有符合條件的文章。</span></p></div>`;
    else body = items.map(a => `
      <div class="card art-item" onclick="ArtUI.open('${esc(a.id)}')">
        <div class="art-title">${esc(a.title)}</div>
        <div class="art-meta">${esc(a.author || "")}｜${esc(a.dynasty || "")}｜${esc(a.genre || "")}</div>
      </div>`).join("");
    const hasFilter = artSel.dyn.size || artSel.gen.size;
    A.innerHTML = `
      <div class="card">
        <div class="header-row"><h2>古文${artGroup} 文章總覽</h2></div>
        <div class="art-row-label">朝代</div>
        <div class="art-chips">${chips("dyn", DYNASTIES)}</div>
        <div class="art-row-label">類型</div>
        <div class="art-chips">${chips("gen", GENRES)}</div>
        ${hasFilter ? `<button class="art-clear" onclick="ArtUI.clear()">清除篩選</button>` : ""}
      </div>
      ${body}
      <button class="go" style="margin-bottom:20px" onclick="ArtUI.backHome()">← 返回刷題首頁</button>`;
  }

  function renderDetail() {
    const A = document.getElementById("app");
    const a = (ART_LIST || []).find(x => x.id === artOpenId);
    if (!a) { artView = "list"; renderList(); return; }
    A.innerHTML = `
      <div class="card">
        <button class="btn-icon" onclick="ArtUI.back()">← 返回文章總覽</button>
        <div class="header-row" style="margin-top:12px"><h2>${esc(a.title)}</h2></div>
        <div class="art-meta">${esc(a.author || "")}｜${esc(a.dynasty || "")}｜${esc(a.genre || "")}</div>
        <div class="art-original">${fmt(a.original || "")}</div>
        <details class="analysis"><summary>查看翻譯</summary>
          <div class="analysis-body">${a.translation ? fmt(a.translation) : "翻譯準備中"}</div>
        </details>
        <details class="analysis"><summary>注釋</summary><div class="analysis-body">${notesHTML(a.notes)}</div></details>
      </div>
      <button class="go" style="margin-bottom:20px" onclick="ArtUI.back()">← 返回文章總覽</button>`;
    window.scrollTo(0, 0);
  }

  function render() { artView === "detail" ? renderDetail() : renderList(); }

  async function loadArt() {
    if (ART_LIST) return ART_LIST;
    try {
      const r = await fetch("./articles.json");
      ART_LIST = r.ok ? await r.json() : [];
    } catch (e) { ART_LIST = []; }
    return ART_LIST;
  }

  function setArtHash(g) {
    if (location.hash !== "#articles-" + g) history.replaceState(null, "", "#articles-" + g);
  }

  async function openGroup(g, fromHash) {
    ArtUI.closeChooser();
    artGroup = String(g);
    artView = "list";
    artOpenId = null;
    window.__artActive = true;
    cur = "chinese";
    currentPage = "articles";
    if (!fromHash) setArtHash(artGroup);
    // 側邊欄與頂端切換列保持在「首頁」狀態
    document.getElementById("navHome").classList.add("active");
    document.getElementById("navSettings").classList.remove("active");
    document.getElementById("subjectNav").style.display = "";
    updateNav();
    document.getElementById("app").innerHTML = `<div class="card"><p class="meta"><span>載入中…</span></p></div>`;
    await loadArt();
    if (String(artGroup) === String(g) && window.__artActive) render();
  }

  // 在國文刷題首頁，刷題卡片下方加上入口卡片
  function addEntryCard() {
    if (cur !== "chinese") return;
    const first = document.querySelector("#app .card");
    if (!first || document.querySelector(".art-entry")) return;
    first.insertAdjacentHTML("afterend", `
      <div class="card art-entry">
        <div class="header-row"><h2>📚 古文文章總覽</h2></div>
        <p class="meta"><span>古文15、古文30｜含原文與翻譯</span></p>
        <button class="go" onclick="ArtUI.chooser()">進入</button>
      </div>`);
  }

  // 包住既有函式：文章頁時不讓刷題首頁覆蓋畫面；離開文章頁時清除旗標
  const _home = home;
  home = function () {
    if (window.__artActive) return;
    _home();
    addEntryCard();
  };
  const _go = go;
  go = function (k, f) { window.__artActive = false; return _go(k, f); };
  const _switchPage = switchPage;
  switchPage = function (p) { window.__artActive = false; return _switchPage(p); };

  window.ArtUI = {
    chooser() { document.getElementById("artChooser").classList.add("active"); },
    closeChooser(e) {
      if (!e || e.target.classList.contains("modal-overlay") || e.target.tagName === "BUTTON")
        document.getElementById("artChooser").classList.remove("active");
    },
    openGroup,
    open(id) { artOpenId = id; artView = "detail"; renderDetail(); },
    back() { artView = "list"; artOpenId = null; setArtHash(artGroup); renderList(); },
    toggle(type, v) {
      const set = type === "dyn" ? artSel.dyn : artSel.gen;
      set.has(v) ? set.delete(v) : set.add(v);
      renderList();
    },
    clear() { artSel.dyn.clear(); artSel.gen.clear(); renderList(); },
    backHome() { window.__artActive = false; go("chinese"); }
  };

  // 網址 #articles-15 / #articles-30
  const ARTHASH = /^#articles-(15|30)$/;
  window.addEventListener("hashchange", () => {
    const m = location.hash.match(ARTHASH);
    if (m && !(window.__artActive && artGroup === m[1])) openGroup(m[1], true);
  });
  // 首次載入：main 的 initRoute 之後執行，這裡覆蓋它的結果
  window.addEventListener("DOMContentLoaded", () => {
    const m = location.hash.match(ARTHASH);
    if (m) {
      const sm = document.getElementById("subjectModal");
      if (sm) sm.classList.remove("active");
      openGroup(m[1], true);
    }
  });
})();
