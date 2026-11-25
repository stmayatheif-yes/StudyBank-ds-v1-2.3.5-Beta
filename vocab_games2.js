/* ==========================================
   英文小遊戲（第三批）：九宮格遮蔽猜謎、單字打怪、射擊闖關（單字泡泡）
   使用方式：在 index.html 的 vocab_cards.js 之後加上：
   <script src="vocab_games2.js"></script>
   ========================================== */
(function () {
  /*PURE-START*/
  // 九宮格：把字串平均切成 n 份（n = 格數）
  function chunkEven(chars, n) {
    const out = []; let p = 0;
    for (let i = 0; i < n; i++) {
      const size = Math.floor(chars.length / n) + (i < chars.length % n ? 1 : 0);
      out.push(chars.slice(p, p + size).join("")); p += size;
    }
    return out;
  }
  // 怪物血量：第 1 關 10，第 50 關 10000，等比成長
  const monsterHp = lv => Math.round(10 * Math.pow(1000, (lv - 1) / 49));
  // 每關的單字等級分布：前 25 關 80% 1~4、20% 5~6；後 25 關 80% 4~6、20% 1~3
  function levelPick(lv, rnd) {
    const hi = rnd() < 0.8;
    if (lv <= 25) return hi ? [1, 2, 3, 4] : [5, 6];
    return hi ? [4, 5, 6] : [1, 2, 3];
  }
  // 怪物攻擊範圍（失敗扣血）
  function monsterDmgRange(lv) {
    if (lv <= 5) return [1, 5];
    if (lv <= 15) return [6, 15];
    if (lv <= 30) return [16, 30];
    if (lv <= 40) return [20, 45];
    return [45, 70];
  }
  // 保底掉落：攻擊 每5關、血量上限 每13關、盾 每20關、攻擊道數 每10關
  const PITY = {
    dmg: lv => lv % 5 === 0 && lv <= 45,
    hp: lv => lv % 13 === 0 && lv <= 39,
    sh: lv => lv % 20 === 0 && lv <= 40,
    ln: lv => lv % 10 === 0 && lv <= 40
  };
  const CAP = { dmg: 10, hp: 4, sh: 2, ln: 4 };
  const DROP_WEIGHT = { heal: 0.30, dmg: 0.25, hp: 0.12, sh: 0.10, ln: 0.23 };
  // 每隻怪掉落的裝備（回傳 ["dmg", ...]），counts 為目前已取得數量
  function dropFor(lv, counts, rnd) {
    const got = [];
    const c = Object.assign({}, counts);
    for (const k of ["dmg", "hp", "sh", "ln"]) if (PITY[k](lv) && c[k] < CAP[k]) { got.push(k); c[k]++; }
    if (rnd() < 0.7) {
      let r = rnd(), acc = 0, pick = "heal";
      for (const k of ["heal", "dmg", "hp", "sh", "ln"]) { acc += DROP_WEIGHT[k]; if (r < acc) { pick = k; break; } }
      if (pick !== "heal" && c[pick] < CAP[pick]) got.push(pick);
      else got.push("heal");
    }
    return got;
  }
  // 射擊闖關：依經過秒數取得泡泡的下落時間與生成間隔
  function bubbleRules(sec) {
    if (sec < 60) return { durMin: 10, durMax: 15, every: 8 };
    if (sec < 90) return { durMin: 12, durMax: 13, every: 5 };
    return { durMin: 10, durMax: 11, every: 2 };
  }
  /*PURE-END*/

  const timers = [];
  const clearAll = () => { timers.forEach(t => { clearInterval(t); clearTimeout(t); }); timers.length = 0; };
  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rnd = Math.random;
  const pickOne = arr => arr[Math.floor(rnd() * arr.length)];
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const letterWords = () => (VOCAB || []).filter(w => /^[a-z]+$/i.test(w.en));

  function frame(title, body) {
    removeVocabTabs();
    window.__vgameActive = true;
    A.innerHTML = `<div class="card vg2-card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px dashed var(--bd)">
        <strong>${title}</strong><button onclick="VGame.quit()" style="padding:6px 12px;margin:0">返回單字</button></div>${body}</div>`;
    window.scrollTo(0, 0);
  }

  // ==========================================
  // 1. 九宮格遮蔽猜謎
  // ==========================================
  const GRID = { mode: "letter", r: 0, rounds: [], score: 0, fail: 0, cells: [], revealed: new Set(), reveals: 0, tries: 0, msg: "", over: false };
  const GRID_ROUNDS = 10, GRID_MAX_REVEAL = 6, GRID_MAX_TRY = 10;

  function gridSetup() {
    frame("🧩 九宮格遮蔽猜謎", `<p style="text-align:center">選擇玩法</p>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button class="vg-pick" onclick="VG2.gridStart('letter')"><strong>字母版</strong><span>格子裡是英文字母，猜英文單字</span></button>
        <button class="vg-pick" onclick="VG2.gridStart('zh')"><strong>中文提示版</strong><span>格子裡是中文意思，猜英文單字</span></button>
      </div>`);
  }
  function gridStartGame(mode) {
    Object.assign(GRID, { mode, r: 0, score: 0, fail: 0, over: false, rounds: shuffle(letterWords()).slice(0, GRID_ROUNDS) });
    gridNewRound();
  }
  function gridNewRound() {
    const w = GRID.rounds[GRID.r];
    const chars = GRID.mode === "letter" ? w.en.toLowerCase().split("") : w.zh.replace(/[\s\/；;，,、。.（）()]/g, "").split("");
    const n = Math.min(9, chars.length);
    GRID.cells = chunkEven(chars, n);
    GRID.revealed = new Set(); GRID.reveals = 0; GRID.tries = 0; GRID.msg = "";
    gridDraw();
  }
  function gridDraw() {
    if (GRID.r >= GRID.rounds.length) {
      frame("🧩 九宮格遮蔽猜謎", `<div class="vg2-result"><p>完成！成功 ${GRID.score} / ${GRID.rounds.length}，失敗 ${GRID.fail}</p><button class="go" onclick="VG2.gridSetup()">再玩一次</button></div>`);
      return;
    }
    const w = GRID.rounds[GRID.r];
    const cellsHtml = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => {
      if (i >= GRID.cells.length) return `<div class="vg2-cell off"></div>`;
      const open = GRID.revealed.has(i);
      const canOpen = !open && GRID.reveals < GRID_MAX_REVEAL;
      return `<button class="vg2-cell ${open ? "open" : ""}" ${canOpen ? "" : (open ? "disabled" : "disabled")} onclick="VG2.gridReveal(${i})">${open ? esc(GRID.cells[i]) : "？"}</button>`;
    }).join("");
    const left = GRID_MAX_REVEAL - GRID.reveals;
    const tip = GRID.mode === "letter" ? "格子是字母，點格子翻開" : "格子是中文意思，點格子翻開";
    frame("🧩 九宮格遮蔽猜謎", `<p class="meta"><span>第 ${GRID.r + 1} / ${GRID.rounds.length} 題　可翻 ${left} 次　錯 ${GRID.tries} / ${GRID_MAX_TRY}</span></p>
      <p style="text-align:center;font-size:.9rem;opacity:.7;margin:4px 0 8px">${tip}</p>
      <div class="vg2-grid">${cellsHtml}</div>
      <p style="text-align:center;margin:10px 0 4px">${GRID.mode === "zh" ? `中文：<strong>${esc(w.zh)}</strong>` : ""}</p>
      <input type="text" id="vg2GridIn" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="輸入英文單字" style="width:100%;box-sizing:border-box;text-align:center;font-size:1.2rem" onkeypress="if(event.key==='Enter')VG2.gridGuess()">
      <button class="go" onclick="VG2.gridGuess()">猜</button>
      <p style="color:var(--no);min-height:1.2em;text-align:center">${esc(GRID.msg)}</p>
      ${GRID.reveals >= GRID_MAX_REVEAL ? "" : ""}`);
  }
  function gridReveal(i) {
    if (GRID.revealed.has(i) || GRID.reveals >= GRID_MAX_REVEAL) return;
    GRID.revealed.add(i); GRID.reveals++;
    gridDraw();
  }
  function gridGuess() {
    const w = GRID.rounds[GRID.r];
    const v = (document.getElementById("vg2GridIn").value || "").trim();
    if (!v) return;
    if (acceptSet(w.en).has(v.toLowerCase())) { GRID.score++; GRID.r++; gridNewRound(); return; }
    GRID.tries++;
    GRID.msg = `不對（${GRID.tries} / ${GRID_MAX_TRY}）`;
    if (GRID.tries >= GRID_MAX_TRY) { GRID.fail++; GRID.msg = `失敗！答案是 ${w.en}`; GRID.r++; setTimeout(gridNewRound, 900); return; }
    gridDraw();
  }

  // ==========================================
  // 2. 單字打怪（回合制）
  // ==========================================
  const MON = { lv: 1, hp: 100, maxHp: 100, shield: 0, dmg: 10, lines: 1, mhp: 0, mhpMax: 0, counts: { dmg: 0, hp: 0, sh: 0, ln: 0 }, q: null, log: "", over: false, won: false, started: false, sel: null};
    function monStart() {
    Object.assign(MON, { lv: 1, hp: 100, maxHp: 100, shield: 0, dmg: 10, lines: 1, counts: { dmg: 0, hp: 0, sh: 0, ln: 0 }, log: "", over: false, won: false, started: true, sel: null, q: null });
    monNewLevel();
  }
  // 退出再進入：沿用目前的進度；若停在關卡切換中，就直接進入下一關
  function monResume() {
    if (!MON.q) monNewLevel(); else monDraw();
  }

  function monNewLevel() {
    MON.mhpMax = monsterHp(MON.lv); MON.mhp = MON.mhpMax;
    monNewQuestion();
  }
  function monNewQuestion() {
    const lvls = levelPick(MON.lv, rnd);
    const pool = letterWords().filter(w => lvls.includes(w.level));
    const w = pickOne(pool.length ? pool : letterWords());
    const type = rnd() < 0.5 ? "choice" : "type";
    if (type === "choice") {
      const others = shuffle(letterWords().filter(x => x.id !== w.id)).slice(0, 3).map(x => x.zh);
      MON.q = { type, w, options: shuffle([w.zh, ...others]) };
    } else MON.q = { type, w };
    monDraw();
  }
  function bossLabel(lv) { return lv === 50 ? "👑 魔王" : lv % 10 === 0 ? "🐉 大BOSS" : lv % 5 === 0 ? "👹 小BOSS" : "👾 怪物"; }
      // ---------- 單字打怪：畫面 ----------
  const SVG_SLASH = `<svg viewBox="0 0 64 64" width="64" height="64" fill="currentColor" aria-hidden="true"><path d="M54 8C38 14 22 28 10 48c6-4 14-8 22-10C42 35 50 22 54 8z"/><path d="M58 24C44 29 30 41 20 56c5-3 12-6 19-8 8-3 15-13 19-24z" opacity="0.75"/><polygon points="14,16 16,22 22,24 16,26 14,32 12,26 6,24 12,22"/></svg>`;
  const ICON = {
    heal: `<svg viewBox="0 0 64 64" width="26" height="26" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"><path d="M32 56C10 40 6 30 6 22a12 12 0 0 1 26-4 12 12 0 0 1 26 4c0 8-4 18-26 34z"/></svg>`,
    hp: `<svg viewBox="0 0 64 64" width="26" height="26" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="12,28 32,14 52,28"/><polyline points="12,40 32,26 52,40"/><polyline points="12,52 32,38 52,52"/></svg>`,
    sh: `<svg viewBox="0 0 64 64" width="26" height="26" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"><path d="M32 6L54 14V30C54 44 44 54 32 58C20 54 10 44 10 30V14Z"/></svg>`,
    dmg: `<svg viewBox="0 0 64 64" width="26" height="26" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M10 54L46 18"/><path d="M40 12L52 12L52 24"/><path d="M14 40L24 50"/></svg>`,
    ln: SVG_SLASH.replace('width="64" height="64"', 'width="26" height="26"')
  };
  const monEmoji = lv => lv === 50 ? "👑" : lv % 10 === 0 ? "🐉" : lv % 5 === 0 ? "👹" : "👾";
  const monSize = lv => lv === 50 ? "vg2-king" : lv % 10 === 0 ? "vg2-big" : lv % 5 === 0 ? "vg2-mid" : "";
  const SKILL_INFO = {
    heal: ["已回血次數", "每次獲得回血道具，將恢復 20 生命值。"],
    hp: ["已提升血量上限次數", "每次獲得血量上限道具，上限 +50，並恢復 50 生命值（上限 300）。"],
    sh: ["盾剩餘數量", "抵擋一次血量歸零的致命傷害，用完就沒有了（上限 2 個）。"],
    dmg: ["已提升傷害次數", "每次獲得傷害道具，單次傷害 +10（最多 10 次）。"],
    ln: ["已增加連擊道數", "每次獲得連擊道具，攻擊道數 +3（上限 15 道）。"]
  };
  function itemsHtml() {
    const c = MON.counts;
    const count = { heal: c.heal || 0, hp: c.hp, sh: MON.shield, dmg: c.dmg, ln: c.ln };
    const tiles = ["heal", "hp", "sh", "dmg", "ln"].map(k =>
      `<button class="vg2-tile ${MON.sel === k ? "on" : ""}" onclick="VG2.monSkill('${k}')">${ICON[k].replace(/width="\d+" height="\d+"/, 'width="34" height="34"')}<b>${count[k]}</b></button>`).join("");
    const info = MON.sel ? `<div class="vg2-detail"><strong>${SKILL_INFO[MON.sel][0]}：${count[MON.sel]}${MON.sel === "sh" ? "個" : "次"}</strong><p>${SKILL_INFO[MON.sel][1]}</p></div>` : "";
    return `<div class="vg2-skills">${tiles}</div>${info}`;
  }
  function monDraw() {
    if (!MON.over && !MON.q) {
      frame("⚔️ 單字打怪", `<p class="meta"><span>第 ${MON.lv} / 50 關　${bossLabel(MON.lv)}</span></p><p style="text-align:center;margin:24px 0;font-size:1.1rem">${esc(MON.log)}</p>`);
      return;
    }
    if (MON.over) {
      frame("⚔️ 單字打怪", `<div class="vg2-result"><p>${MON.won ? "🏆 魔王已擊敗！通關" : "💀 戰敗"}　到第 ${MON.lv} 關</p>
        <p class="meta"><span>裝備：傷害 ${MON.dmg}　道數 ${MON.lines}　盾 ${MON.shield}　上限 ${MON.maxHp}</span></p>
        <button class="go" onclick="VG2.monStart()">從第 1 關重新開始</button>
        <button class="go" style="background:var(--bd);color:var(--text-color);box-shadow:none" onclick="VGame.quit()">返回單字</button></div>`);
      return;
    }
    const fx = MON.fx || {}; MON.fx = null;
    const q = MON.q;
    const hpPct = Math.max(0, Math.round(MON.mhp / MON.mhpMax * 100));
    const playerPct = Math.max(0, Math.round(MON.hp / MON.maxHp * 100));
    const slashes = Array.from({ length: Math.min(15, fx.lines || 0) }, (_, i) => `<span class="vg2-slash" style="animation-delay:${i * 70}ms;left:${20 + (i % 5) * 12}%;top:${20 + Math.floor(i / 5) * 18}%">${SVG_SLASH}</span>`).join("");
    const pop = fx.dmg != null ? `<div class="vg2-pop ${fx.kind}">${fx.kind === "hurt" ? "-" : "-"}${fx.dmg}</div>` : "";
    const qHtml = q.type === "choice"
      ? `<p style="font-size:1.3rem;text-align:center;margin:8px 0">${esc(q.w.en)}</p>${q.options.map((o, k) => `<button class="opt" onclick="VG2.monChoice(${k})">${esc(o)}</button>`).join("")}`
      : `<p style="font-size:1.3rem;text-align:center;margin:8px 0">${esc(q.w.zh)}</p><input type="text" id="vg2MonIn" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="輸入英文" style="width:100%;box-sizing:border-box;text-align:center;font-size:1.1rem" onkeypress="if(event.key==='Enter')VG2.monType()"><button class="go" onclick="VG2.monType()">攻擊</button>`;
    frame("⚔️ 單字打怪", `<p class="meta"><span>第 ${MON.lv} / 50 關　${bossLabel(MON.lv)}</span></p>
      <div class="vg2-stage">
        <div class="vg2-mon ${monSize(MON.lv)} ${fx.hit ? "fx-hit" : ""}">${monEmoji(MON.lv)}</div>
        ${slashes}${pop}
        <div class="vg2-player ${fx.kind === "hurt" ? "fx-hurt" : ""}">🧙</div>
      </div>
      <div class="vg2-label">怪物 ${Math.max(0, MON.mhp)} / ${MON.mhpMax}</div>
      <div class="vg2-bar"><div class="vg2-bar-in" style="width:${hpPct}%"></div></div>
      <div class="vg2-label">❤️ ${MON.hp} / ${MON.maxHp}</div>
      <div class="vg2-bar vg2-bar-p"><div class="vg2-bar-in" style="width:${playerPct}%"></div></div>
      ${itemsHtml()}
      <p class="meta" style="margin:6px 0"><span>⚔️ 單次 ${MON.dmg}　連擊 ${MON.lines} 道　🛡️ ${MON.shield}</span></p>
      ${qHtml}
      <p style="color:var(--text-color);min-height:1.2em;text-align:center;font-size:.9rem">${esc(MON.log)}</p>
      <button style="width:100%;margin:6px 0 0;background:var(--bd);color:var(--text-color);box-shadow:none" onclick="VG2.monGiveUp()">放棄本次挑戰（從第 1 關重來）</button>`);
    if (q.type === "type") setTimeout(() => { const i = document.getElementById("vg2MonIn"); if (i) i.focus(); }, 30);
  }
  function monPlayerHit() {
    const [a, b] = monsterDmgRange(MON.lv);
    const d = a + Math.floor(rnd() * (b - a + 1));
    if (MON.hp - d <= 0 && MON.shield > 0) { MON.shield--; MON.hp = 1; MON.log = `怪物攻擊 ${d}！盾抵擋了致命傷害`; MON.fx = { kind: "shield", dmg: d }; }
    else { MON.hp = Math.max(0, MON.hp - d); MON.log = `怪物攻擊，受到 ${d} 點傷害`; MON.fx = { kind: "hurt", dmg: d }; }
    if (MON.hp <= 0) { MON.over = true; MON.won = false; }
  }
  function monAttack() {
    const total = MON.dmg * MON.lines;
    MON.mhp -= total;
    MON.log = `攻擊 ${MON.lines} 道，共 ${total} 傷害`;
    MON.fx = { kind: "enemy", dmg: total, lines: MON.lines, hit: true };
    if (MON.mhp <= 0) {
      const lv = MON.lv;
      const got = dropFor(lv, MON.counts, rnd);
      got.forEach(applyItem);
      MON.log = got.length ? `擊敗怪物！獲得：${got.map(itemName).join("、")}` : "擊敗怪物！這次沒有掉落裝備";
      if (lv >= 50) { MON.over = true; MON.won = true; monDraw(); return; }
      MON.lv++; MON.q = null;
      monDraw();
      timers.push(setTimeout(() => { if (!MON.over) monNewLevel(); }, 1200));
      return;
    }
    monNewQuestion();
  }
  function applyItem(k) {
    if (k === "heal") { MON.counts.heal = (MON.counts.heal || 0) + 1; MON.hp = Math.min(MON.maxHp, MON.hp + 20); return; }
    if (k === "dmg") { MON.counts.dmg++; MON.dmg += 10; }
    if (k === "hp") { MON.counts.hp++; MON.maxHp = Math.min(300, MON.maxHp + 50); MON.hp = Math.min(MON.maxHp, MON.hp + 50); }
    if (k === "sh") { MON.counts.sh++; MON.shield = Math.min(2, MON.shield + 1); }
    if (k === "ln") { MON.counts.ln++; MON.lines = Math.min(15, MON.lines + 3); }
  }
  const CSS_MON = `
    .vg2-stage{position:relative;height:200px;border-radius:14px;border:1px solid var(--bd);background:linear-gradient(180deg,color-mix(in srgb,#60a5fa 18%,var(--card)),var(--card));overflow:hidden;margin-bottom:8px}
    .vg2-mon{position:absolute;left:50%;top:14px;transform:translateX(-50%);font-size:76px;line-height:1}
    .vg2-mid{font-size:96px}.vg2-big{font-size:118px}.vg2-king{font-size:130px;filter:drop-shadow(0 0 10px #facc15)}
    .vg2-player{position:absolute;left:16px;bottom:8px;font-size:48px;line-height:1}
    .fx-hit{animation:vg2hit .45s ease}
    @keyframes vg2hit{0%{filter:brightness(2.2);transform:translate(-50%,0)}25%{transform:translate(-56%,0)}50%{transform:translate(-44%,0)}75%{transform:translate(-52%,0)}100%{transform:translate(-50%,0)}}
    .fx-hurt{animation:vg2hurt .5s ease}
    @keyframes vg2hurt{0%,100%{filter:none}25%,75%{filter:sepia(1) hue-rotate(-50deg) saturate(6)}}
    .vg2-slash{position:absolute;color:#f43f5e;width:64px;height:64px;animation:vg2slash .5s ease forwards;opacity:0}
    .vg2-slash svg{width:64px;height:64px}
    @keyframes vg2slash{0%{opacity:0;transform:scale(.6) rotate(-20deg)}30%{opacity:1}100%{opacity:0;transform:scale(1.1) rotate(10deg)}}
    .vg2-pop{position:absolute;right:20px;top:30px;font-weight:bold;font-size:1.6rem;color:#f43f5e;animation:vg2pop 1s ease forwards;pointer-events:none}
    .vg2-pop.enemy{color:#facc15}
    @keyframes vg2pop{0%{opacity:0;transform:translateY(10px)}20%{opacity:1}100%{opacity:0;transform:translateY(-40px)}}
    .vg2-label{font-size:.85rem;text-align:center;margin:6px 0 2px;opacity:.8}
    .vg2-bar-p .vg2-bar-in{background:#10b981}
    .vg2-skills{display:flex;gap:10px;justify-content:center;margin:10px 0;padding:10px;border-radius:18px;background:color-mix(in srgb,#f9a8d4 45%,var(--card))}
    .vg2-tile{width:58px;height:70px;margin:0;padding:6px 0;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:var(--card);color:var(--text-color);border:1px solid var(--bd);box-shadow:inset 0 1px 0 rgba(255,255,255,.4)}
    .vg2-tile svg{color:var(--text-color)}
    .vg2-tile b{font-size:.85rem}
    .vg2-tile.on{outline:2px solid #ec4899;outline-offset:-2px}
    .vg2-detail{border:1px dashed var(--bd);border-radius:12px;padding:10px 12px;margin:6px 0 10px;background:var(--bg);font-size:.9rem}
    .vg2-detail p{margin:4px 0 0;opacity:.8}
  `;
  const cssMon = document.createElement("style");
  cssMon.textContent = CSS_MON;
  document.head.appendChild(cssMon);

  const itemName = k => ({ heal: "❤️回血", dmg: "⚔️傷害", hp: "⌃血量上限", sh: "🛡️盾", ln: "連擊" })[k];
  function monAnswer(correct) {
    if (correct) monAttack();
    else { monPlayerHit(); if (MON.over) { monDraw(); return; } MON.log += `　正確答案：${MON.q.w.en}`; monNewQuestion(); }
  }

  // ==========================================
  // 3. 射擊闖關（單字泡泡）
  // ==========================================
  const BUB = { mode: "zh", t0: 0, lives: 3, pop: 0, list: [], nextAt: 0, over: false, msg: "", tick: null, nextId: 1 };
  function bubStart(mode) {
    clearAll();
    Object.assign(BUB, { mode, t0: Date.now(), lives: 3, pop: 0, list: [], nextAt: 0, over: false, msg: "", nextId: 1 });
    BUB.words = letterWords();
    bubDrawShell();
    BUB.tick = setInterval(bubStep, 50);
    timers.push(BUB.tick);
  }
  function bubDrawShell() {
    frame("🫧 射擊闖關", `<div class="vg2-rule">${BUB.mode === "zh" ? "中文打英文：泡泡顯示中文，輸入對應的英文擊破" : "英文打英文：泡泡顯示英文，輸入相同的英文擊破"}</div>
      <p class="meta"><span>❤️ <span id="vg2Lives"></span>　擊破 <span id="vg2Pop">0</span>　時間 <span id="vg2Time">0</span> 秒</span></p>
      <div class="vg2-field" id="vg2Field"></div>
      <input type="text" id="vg2BubIn" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="輸入英文後按 Enter" style="width:100%;box-sizing:border-box;text-align:center;font-size:1.1rem" onkeypress="if(event.key==='Enter')VG2.bubShoot()">
      <div style="display:flex;gap:8px;margin-top:8px"><button class="go" style="flex:1;margin:0" onclick="VG2.bubShoot()">射擊</button><button id="vg2Settle" style="flex:1;margin:0;display:none" onclick="VG2.bubSettle()">結算</button></div>
      <p id="vg2BubMsg" style="color:var(--no);min-height:1.2em;text-align:center"></p>`);
    bubHud();
  }
  function bubHud() {
    const el = id => document.getElementById(id);
    if (!el("vg2Lives")) return;
    el("vg2Lives").textContent = "●".repeat(BUB.lives) + "○".repeat(3 - BUB.lives);
    el("vg2Pop").textContent = BUB.pop;
    el("vg2Time").textContent = Math.floor((Date.now() - BUB.t0) / 1000);
    el("vg2Settle").style.display = Math.floor((Date.now() - BUB.t0) / 1000) >= 120 ? "" : "none";
  }
  function bubStep() {
    if (BUB.over || !document.getElementById("vg2Field")) return;
    const sec = (Date.now() - BUB.t0) / 1000;
    const rule = bubbleRules(sec);
    if (sec * 1000 >= BUB.nextAt) {
      const w = pickOne(BUB.words.filter(x => x.en.length <= 12));
      BUB.list.push({ id: BUB.nextId++, w, born: Date.now(), dur: (rule.durMin + rnd() * (rule.durMax - rule.durMin)) * 1000, el: null });
      BUB.nextAt = sec * 1000 + rule.every * 1000;
    }
    const field = document.getElementById("vg2Field");
    const keep = [];
    for (const b of BUB.list) {
      const y = (Date.now() - b.born) / b.dur;
      if (y >= 1) { BUB.lives--; if (b.el) b.el.remove(); BUB.msg = "泡泡碰到人物！"; if (BUB.lives <= 0) { BUB.over = true; } continue; }
      if (!b.el) { b.el = document.createElement("div"); b.el.className = "vg2-bubble"; b.el.textContent = BUB.mode === "zh" ? b.w.zh : b.w.en; field.appendChild(b.el); }
      b.el.style.top = (y * 100) + "%";
      b.el.style.left = (10 + (b.id * 37) % 70) + "%";
      keep.push(b);
    }
    BUB.list = keep;
    const m = document.getElementById("vg2BubMsg"); if (m && BUB.msg) { m.textContent = BUB.msg; }
    bubHud();
    if (BUB.over) { bubEnd(); }
  }
  function bubShoot() {
    if (BUB.over) return;
    const i = document.getElementById("vg2BubIn"); const v = (i.value || "").trim();
    if (!v) return;
    const idx = BUB.list.findIndex(b => acceptSet(b.w.en).has(v.toLowerCase()));
    if (idx >= 0) {
      const b = BUB.list[idx]; if (b.el) b.el.remove(); BUB.list.splice(idx, 1); BUB.pop++;
      BUB.msg = `擊破：${b.w.en}`;
    } else BUB.msg = "沒有對應的泡泡";
    i.value = "";
    const m = document.getElementById("vg2BubMsg"); if (m) m.textContent = BUB.msg;
    bubHud();
  }
  function bubEnd() {
    clearAll();
    frame("🫧 射擊闖關", `<div class="vg2-result"><p>遊戲結束！擊破 <strong>${BUB.pop}</strong> 個泡泡，共 ${Math.floor((Date.now() - BUB.t0) / 1000)} 秒</p>
      <button class="go" onclick="VG2.bubStart('${BUB.mode}')">再玩一次</button>
      <button class="go" style="background:var(--bd);color:var(--text-color);box-shadow:none" onclick="VGame.quit()">返回單字</button></div>`);
  }
  function bubSettle() { BUB.over = true; clearAll(); bubEnd(); }

  // ==========================================
  // 選單與介面
  // ==========================================
  const NEW_GAMES = [
    { k: "grid", name: "九宮格遮蔽猜謎", desc: "翻格子猜單字，字母版或中文提示版" },
    { k: "monster", name: "單字打怪", desc: "回合制答題，50 關，打怪掉裝備" },
    { k: "bubble", name: "射擊闖關", desc: "擊破單字泡泡，3 條命，越來越快" }
  ];
  const BASE_GAMES = [
    { k: "match", name: "翻牌配對", desc: "英文與中文翻牌配對" },
    { k: "scramble", name: "字母重組", desc: "依中文，把打亂的字母排成單字" },
    { k: "wordle", name: "限時猜字", desc: "依顏色提示猜出單字，有次數與時間限制" },
    { k: "chain", name: "限時接龍", desc: "依上一個字的最後字母，接出下一個單字" }
  ];
  function menu() {
    const m = vModal("vgameMenu");
    const all = [...BASE_GAMES, ...NEW_GAMES];
    m.innerHTML = `<div class="modal-content" onclick="event.stopPropagation()" style="width:min(400px,92vw);max-height:86vh;overflow-y:auto">
      <h3>🎮 小遊戲</h3>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${all.map(g => `<button class="vg-pick" onclick="VGame.start('${g.k}')"><strong>${g.name}</strong><span>${g.desc}</span></button>`).join("")}
      </div>
      <div class="modal-actions"><button class="go" onclick="VG2.backVocab()">返回單字</button><button class="go" style="background:var(--bd);color:var(--text-color);box-shadow:none" onclick="document.getElementById('vgameMenu').classList.remove('active')">取消</button></div>
    </div>`;
    m.classList.add("active");
  }
  VGame.menu = menu;

  const _start = VGame.start;
  VGame.start = function (k) {
    document.getElementById("vgameMenu") && document.getElementById("vgameMenu").classList.remove("active");
    if (k === "grid") { clearAll(); return gridSetup(); }
    if (k === "monster") { clearAll(); window.__monActive = true; if (MON.started && !MON.over) return monResume(); return monStart(); }
    if (k === "bubble") { return bubSetup(); }
    return _start(k);
  };
  const _quit = VGame.quit;
  VGame.quit = function () { clearAll(); window.__monActive = false; window.__vgameActive = false; menu(); };

  function bubSetup() {
    frame("🫧 射擊闖關", `<p style="text-align:center">選擇玩法</p>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button class="vg-pick" onclick="VG2.bubStart('zh')"><strong>中文打英文</strong><span>泡泡顯示中文，輸入英文擊破</span></button>
        <button class="vg-pick" onclick="VG2.bubStart('en')"><strong>英文打英文</strong><span>泡泡顯示英文，輸入相同英文擊破</span></button>
      </div>`);
  }

  const VG2 = {
    backVocab() { document.getElementById("vgameMenu").classList.remove("active"); window.__vgameActive = false; renderVocab(); },
    monSkill(k) { MON.sel = MON.sel === k ? null : k; monDraw(); },
    monGiveUp() { if (!confirm("確定放棄本次挑戰？將從第 1 關重新開始。")) return; MON.over = true; MON.won = false; MON.started = false; monDraw(); },
    gridSetup, gridStart: gridStartGame, gridReveal, gridGuess,
    monStart, monChoice(k) { monAnswer(MON.q.options[k] === MON.q.w.zh); },
    monType() { const v = (document.getElementById("vg2MonIn").value || "").trim().toLowerCase(); monAnswer(acceptSet(MON.q.w.en).has(v)); },
    bubStart, bubShoot, bubSettle
  };
  window.VG2 = VG2;

  const css = document.createElement("style");
  css.textContent = `
    .vg2-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0 12px}
    .vg2-cell{min-height:70px;font-size:1.2rem;font-weight:bold;word-break:break-all;margin:0;padding:6px}
    .vg2-cell.open{background:var(--ok);color:#fff}
    .vg2-cell.off{visibility:hidden}
    .vg2-bar{height:12px;border-radius:999px;background:var(--bd);overflow:hidden}
    .vg2-bar-in{height:100%;background:var(--no);transition:width .3s}
    .vg2-rule{font-size:.9rem;padding:8px 10px;border-radius:10px;background:var(--bg);border:1px dashed var(--bd);margin-bottom:10px}
    .vg2-field{position:relative;height:300px;border:1px solid var(--bd);border-radius:12px;overflow:hidden;margin:8px 0 10px;background:var(--bg)}
    .vg2-bubble{position:absolute;transform:translateY(-50%);padding:6px 10px;border-radius:999px;background:color-mix(in srgb,#60a5fa 35%,var(--card));border:1px solid #60a5fa;font-size:.9rem;white-space:nowrap}
    .vg2-result{text-align:center;margin-top:14px}
    .vg2-result .go{margin-top:8px}
  `;
  document.head.appendChild(css);
})();
