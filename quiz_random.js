/* ==========================================
   隨機刷題：題數設定彈窗 + 抽題（題組整組、不足才補）+ 測驗結果
   使用方式：放在 GitHub 專案根目錄，並在 index.html 的 </body> 前加上：
   <script src="quiz_random.js"></script>
   ========================================== */
(function () {
  const PRESETS = [10, 20, 30, 40, 50, 100];
  let rdMode = null;        // "all" 或 "w"
  let rdSel = null;         // 目前選到的預設題數

  // 抽題核心（與測試通過的版本相同）
  function shuffleArr(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function pickUnits(units, N) {
    const order = shuffleArr(units);
    const chosen = [];
    let count = 0;
    const deferred = [];
    for (const u of order) {
      if (count >= N) break;
      if (count + u.length <= N) { chosen.push(u); count += u.length; }
      else deferred.push(u);
    }
    for (const u of deferred) {           // 單題不夠時，才加入被跳過的整組
      if (count >= N) break;
      chosen.push(u); count += u.length;
    }
    return shuffleArr(chosen);
  }

  // 依模式取得題庫範圍（隨機：全部；錯題本：只取答錯的）
  function poolFor(m) {
    const s = S();
    return Q.filter(q => m === "all" || (m === "w" && s.w[id(q)]));
  }
  // 把題庫切成單位：單題一個單位，題組整組一個單位（只含池內的題目）
  function buildUnits(pool) {
    const poolIds = new Set(pool.map(id));
    const seen = new Set();
    const units = [];
    pool.forEach(q => {
      if (seen.has(id(q))) return;
      const g = findGroup(q);
      if (g) {
        const members = groupMembers(g).filter(x => poolIds.has(id(x)));
        members.forEach(x => seen.add(id(x)));
        units.push(members);
      } else {
        seen.add(id(q));
        units.push([q]);
      }
    });
    return units;
  }

  // ---------- 彈窗 ----------
  const modal = document.createElement("div");
  modal.id = "rdModal";
  modal.className = "modal-overlay";
  modal.setAttribute("onclick", "RandomQuiz.closeDialog(event)");
  modal.innerHTML = `
    <div class="modal-content" onclick="event.stopPropagation()" style="width:340px;text-align:center">
      <h3>隨機刷題題數</h3>
      <div id="rdPresets" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:12px">
        ${PRESETS.map(n => `<button class="rd-preset" data-n="${n}" onclick="RandomQuiz.pick(${n})">${n}</button>`).join("")}
      </div>
      <input type="number" id="rdInput" min="1" placeholder="可輸入自訂題目數"
        style="width:100%;box-sizing:border-box;margin-top:14px;text-align:center"
        oninput="RandomQuiz.typed()">
      <div id="rdMsg" style="font-size:.85rem;opacity:.7;min-height:1.2em;margin-top:6px"></div>
      <div class="modal-actions" style="margin-top:12px">
        <button class="go" onclick="RandomQuiz.confirm()">確認</button>
        <button class="go" style="background:var(--bd);color:var(--text-color);box-shadow:none" onclick="RandomQuiz.closeDialog()">取消</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const css = document.createElement("style");
  css.textContent = `
    .rd-preset{min-width:52px;padding:8px 12px}
    .rd-preset.on{background:#3b82f6;color:#fff;border-color:transparent}
    #rdInput::placeholder{color:var(--text-color);opacity:.4}`;
  document.head.appendChild(css);

  function setPresetHighlight() {
    document.querySelectorAll(".rd-preset").forEach(b => b.classList.toggle("on", Number(b.dataset.n) === rdSel));
  }
  function totalFor(m) { return poolFor(m).length; }

  function openDialog(m) {
    rdMode = m;
    rdSel = null;
    const inp = document.getElementById("rdInput");
    inp.value = "";
    document.getElementById("rdMsg").textContent = "題庫共 " + totalFor(m) + " 題";
    setPresetHighlight();
    modal.classList.add("active");
  }

  // ---------- 抽題與開始 ----------
  function startRandom(m, N) {
    const pool = poolFor(m);
    if (!pool.length) { alert(m === "w" ? "錯題本是空的！" : "沒有題目"); return; }
    const units = buildUnits(pool);
    list = pickUnits(units, N).flat();
    i = 0;
    userAnswers = {};
    sessionStats = { total: list.length, correct: 0 };
    isReviewingWrong = (m === "w");
    currentPage = "quiz";
    show();
  }

  // ---------- 測驗結果：依作答結果計算（不依賴 submit 的計數） ----------
  function recomputeStats() {
    let answered = 0, correct = 0;
    list.forEach(q => {
      const ans = userAnswers[id(q)];
      if (ans === undefined) return;
      answered++;
      const p = [...ans].sort().map(k => L[k]).join("");
      if (p === q.a) correct++;
    });
    sessionStats = { total: answered, correct: correct };
    return answered;
  }
  const _showReport = showReport;
  showReport = function () { recomputeStats(); return _showReport(); };

  // 「結束」按鈕：作答超過一題就顯示測驗結果，否則回首頁
  function endQuiz() {
    const answered = recomputeStats();
    if (answered > 1) showReport();
    else home();
  }

  // ---------- 覆寫 start：隨機刷題與錯題本改為先開彈窗 ----------
  const _start = start;
  start = function (m, v) {
    if (m === "all" || m === "w") { openDialog(m); return; }
    return _start(m, v);
  };

  // ---------- 防止題組引文重複顯示 ----------
  // 若資料裡某題的題幹已含引文，接上引文後同一段會出現兩次；這裡把重複的段落只留第一次
  const _getQuestionText = getQuestionText;
  getQuestionText = function (q) {
    const parts = _getQuestionText(q).split("\n\n");
    const seen = new Set();
    const out = [];
    for (const p of parts) {
      const k = p.trim();
      if (k.length > 20 && seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
    return out.join("\n\n");
  };

  window.RandomQuiz = {
    pick(n) { rdSel = n; document.getElementById("rdInput").value = ""; document.getElementById("rdMsg").textContent = ""; setPresetHighlight(); },
    typed() { rdSel = null; setPresetHighlight(); const v = document.getElementById("rdInput").value; if (v !== "") document.getElementById("rdMsg").textContent = ""; },
    confirm() {
      const total = totalFor(rdMode);
      const raw = document.getElementById("rdInput").value.trim();
      let n = raw !== "" ? parseInt(raw, 10) : rdSel;
      const msg = document.getElementById("rdMsg");
      if (!n || n < 1) { msg.textContent = "請選擇或輸入題數"; return; }
      if (n > total) {                       // 超過題庫總數：留在彈窗，數字改成總數
        document.getElementById("rdInput").value = total;
        rdSel = null; setPresetHighlight();
        msg.textContent = "超過題庫總數，已改為 " + total;
        return;
      }
      modal.classList.remove("active");
      startRandom(rdMode, n);
    },
    closeDialog(e) {
      if (!e || e.target.classList.contains("modal-overlay")) modal.classList.remove("active");
    },
    endQuiz
  };
  window.endQuiz = endQuiz;
})();
