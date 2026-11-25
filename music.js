/* ==========================================
   底部音樂播放器（本地音源 / YouTube / 播放清單）
   使用方式：把本檔放在 GitHub 專案根目錄，並在 index.html 的 </body> 前加上：
   <script src="music.js"></script>
   本地音樂：把 mp3 放進 music/ 資料夾，然後在下面的 LOCAL_TRACKS 加一行。
   播放清單存在 localStorage 的 music_playlists，已加入 sync.js 的雲端同步。
   ========================================== */
(function () {
  "use strict";

  // ===== ① 本地音樂清單（自己編輯）=====
  // 範例：{ id: "focus1", title: "專注鋼琴", artist: "自己", album: "讀書專輯", genre: "輕音樂", src: "music/focus1.mp3", cover: "music/focus1.jpg" }
  // id 不可重複；artist、album、genre、cover 可省略（沒填的會歸到「未分類」）
  const LOCAL_TRACKS = [
     { id: "thunder1", title: "Thunder and Lightning", artist: "Luminewave", src: "music/luminewave-thunder-and-lightning-commercial-version-637008.mp3", cover: "music/thunder1.jpg" },
     { id: "thunder2", title: "Dominator", artist: "AudioAtlant", src: "music/audioatlant-dominator-action-countdown-trailer-main-554635.mp3", cover: "music/thunder2.png" },
     { id: "thunder3", title: "golden hour [mqms2]", artist: "阿扣叩叩", src: "music/阿扣叩叩 - golden hour [mqms2].ogg", cover: "PlayerAlbumCover_18644029501795455861749.jpg" },
     { id: "thunder4", title: "aLIEz [mqms2]", artist: "阿扣叩叩", src: "music/阿扣叩叩 - aLIEz [mqms2].ogg", cover: "aLIEz.jpg" },
     
  ];

  const PL_KEY = "music_playlists", PREF_KEY = "music_prefs";
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const fmt = s => { s = Math.max(0, s | 0); return (s / 60 | 0) + ":" + String(s % 60).padStart(2, "0"); };

  // ===== 資料 =====
  const store = load(PL_KEY, {});
  if (!Array.isArray(store.lists)) store.lists = [];
  if (!store.lists.some(l => l.id === "liked")) store.lists.unshift({ id: "liked", name: "已按讚的歌曲", items: [] });
  if (!Array.isArray(store.yt)) store.yt = [];
  const prefs = Object.assign({ src: "local" }, load(PREF_KEY, {}));
  const persist = () => save(PL_KEY, store);
  let recent = load("music_recent", []); if (!Array.isArray(recent)) recent = [];
  const pushRecent = t => { recent = [snap(t)].concat(recent.filter(x => x.key !== t.key)).slice(0, 20); save("music_recent", recent); };

  const localLib = () => LOCAL_TRACKS.map(t => ({ key: "l:" + t.id, src: "local", url: t.src, title: t.title, artist: t.artist || "", album: t.album || "", genre: t.genre || "", cover: t.cover || "" }));
  const lib = s => s === "yt" ? store.yt.slice() : localLib();
  const snap = t => ({ key: t.key, src: t.src, url: t.url, vid: t.vid, title: t.title, artist: t.artist, album: t.album, genre: t.genre, cover: t.cover });
  const libLabel = s => s === "yt" ? "YouTube" : "本地音源";

  // ===== 播放狀態 =====
  let queue = lib(prefs.src), idx = 0, cur = queue[0] || null, qLabel = libLabel(prefs.src);
  let playing = false, loadedKey = null, drag = false, plays = 1, sleepEnd = 0;
  let mode = [0, 1, 2, 3, 4].indexOf(prefs.pm) >= 0 ? prefs.pm : 2;          // 預設：列表循環
  let loopMax = Math.max(0, Math.min(99, prefs.loop | 0));                    // 0 = 無限
  let rate = Math.min(2, Math.max(0.1, Math.round((+prefs.rate || 1) * 10) / 10));
  let vol = prefs.vol == null ? 100 : Math.max(0, Math.min(100, +prefs.vol | 0));
  const MODES = ["隨機", "順序", "列表循環", "單曲循環", "單曲播畢結束"];
  const audio = new Audio(); audio.preload = "none";

  // ===== 圖示 =====
  const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const ICON = {
    play: '<path d="M8 5v14l11-7z"/>', pause: '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>',
    prev: '<path d="M6 6h2v12H6zM20 6v12L9.5 12z"/>', next: '<path d="M16 6h2v12h-2zM4 6v12l10.5-6z"/>',
    up: `<path ${S} stroke-width="2.5" d="M6 15l6-6 6 6"/>`, down: `<path ${S} stroke-width="2.5" d="M6 9l6 6 6-6"/>`,
    plus: `<circle ${S} cx="12" cy="12" r="9"/><path ${S} d="M12 8v8M8 12h8"/>`,
    chk: '<circle cx="12" cy="12" r="10" style="fill:var(--ac)"/><path fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M7.5 12.5l3 3 6-6.5"/>',
    shuf: `<path ${S} d="M16 4h4v4M4 20L20 4M20 16v4h-4M4 4l5 5M15 15l5 5"/>`,
    rep: `<path ${S} d="M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3"/>`,
    list: `<path ${S} d="M4 6h16M4 12h16M4 18h10"/>`, x: `<path ${S} d="M6 6l12 12M18 6L6 18"/>`,
    rep1: `<path ${S} d="M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3"/><text x="12" y="15.5" font-size="9" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">1</text>`,
    stop: `<path ${S} d="M4 12h11M11 7l5 5-5 5M20 5v14"/>`,
    pen: `<path ${S} d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>`,
    seq: `<path ${S} d="M4 7h11M4 12h11M4 17h6M18 8v8M15 13l3 3 3-3"/>`,
    eq: `<path ${S} d="M5 9v6M9 5v14M13 8v8M17 4v16M21 10v4"/>`,
    clock: `<circle ${S} cx="12" cy="13" r="8"/><path ${S} d="M12 9v4l2.5 2M9 2h6"/>`,
    speed: '<path d="M3 5v14l9-7zM12 5v14l9-7z"/>',
    vol: `<path d="M4 9v6h4l5 4V5L8 9z"/><path ${S} d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/>`,
    heart: `<path ${S} d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>`,
    heartOn: `<path ${S} style="fill:var(--ac);stroke:var(--ac)" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>`
  };
  const ic = (n, s) => `<svg viewBox="0 0 24 24" width="${s || 24}" height="${s || 24}" fill="currentColor">${ICON[n]}</svg>`;

  // ===== 樣式 =====
  const css = `
^{--mp-r:14px}
^button{font:inherit;color:inherit;background:none;border:0;border-radius:0;padding:0;margin:0;box-shadow:none;cursor:pointer;transition:none;-webkit-tap-highlight-color:transparent;line-height:1.3}
^button:hover:not(:disabled),^button:active:not(:disabled){transform:none;border-color:transparent}
^#mpBar{position:fixed;left:50%;bottom:calc(8px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);width:min(640px,calc(100% - 16px));z-index:900;background:var(--card);border:1px solid var(--bd);border-radius:var(--mp-r);box-shadow:var(--shadow);overflow:hidden;cursor:pointer;color:var(--text-color)}
^.mp-row{display:flex;align-items:center;gap:12px;padding:8px 8px 8px 10px}
^.mp-cv{width:44px;height:44px;border-radius:8px;background:var(--ac) center/cover no-repeat;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;flex:none}
^.mp-meta{flex:1;min-width:0}
^.mp-t,^.mp-s{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
^.mp-t{font-weight:700}^.mp-s{font-size:.8rem;opacity:.65}
^.mp-ib{width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:50%;flex:none}
^.mp-prog{height:3px;background:var(--bd)}^.mp-prog i{display:block;height:100%;width:0;background:var(--ac)}
^#mpFull{position:fixed;inset:0;z-index:1100;display:flex;justify-content:center;padding:calc(12px + env(safe-area-inset-top,0px)) 20px calc(20px + env(safe-area-inset-bottom,0px));box-sizing:border-box;background:linear-gradient(var(--bg-angle),var(--bg-color-1),var(--bg-color-2));overflow-y:auto;transform:translateY(100%);visibility:hidden;transition:transform .3s,visibility .3s;color:var(--text-color)}
^#mpFull.open{transform:none;visibility:visible}
^.mp-col{width:min(420px,100%);display:flex;flex-direction:column;gap:14px;margin:auto 0}
^.mp-top{display:flex;align-items:center;justify-content:space-between;text-align:center}
^.mp-top b{font-size:.95rem}^.mp-top small{display:block;opacity:.65;font-size:.78rem}
^.mp-seg{display:flex;background:var(--card);border:1px solid var(--bd);border-radius:999px;padding:3px}
^.mp-seg button{flex:1;text-align:center;padding:8px;border-radius:999px;font-size:.95rem}
^.mp-seg button.on{background:var(--ac);color:#fff}
^.mp-art{width:min(100%,44vh);aspect-ratio:1;height:auto;margin:0 auto;border-radius:14px;font-size:64px;box-shadow:var(--shadow)}
^.mp-plbtn{display:flex;align-items:center;gap:8px;align-self:flex-start;padding:8px 14px;border:1px solid var(--bd)!important;border-radius:8px;background:var(--card)!important;font-size:.9rem}
^.mp-info{display:flex;align-items:center;gap:12px}
^.mp-info>div{flex:1;min-width:0}
^.mp-info .mp-t{font-size:1.35rem}^.mp-info .mp-s{font-size:1rem}
^input[type=range]{width:100%;margin:0;padding:0;border:0;background:transparent;box-shadow:none;height:24px;accent-color:var(--ac);cursor:pointer}
^.mp-time{display:flex;justify-content:space-between;font-size:.8rem;opacity:.65;margin-top:-6px}
^.mp-ctrl{display:flex;align-items:center;justify-content:space-between}
^.mp-ctrl .mp-ib{width:48px;height:48px}
^.mp-ctrl .big{width:68px;height:68px;background:var(--text-color);color:var(--bg-color-1)}
^.mp-ctrl .on{color:var(--ac)}
^.mp-wrap{position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.5);opacity:0;visibility:hidden;transition:.2s;display:flex;align-items:flex-end;justify-content:center;color:var(--text-color)}
^.mp-wrap.open{opacity:1;visibility:visible}
^.mp-sheet{width:min(640px,100%);height:min(78vh,640px);background:var(--card);border:1px solid var(--bd);border-radius:18px 18px 0 0;display:flex;flex-direction:column;transform:translateY(30px);transition:.2s;padding:12px 16px calc(16px + env(safe-area-inset-bottom,0px));box-sizing:border-box}
^.mp-wrap.open .mp-sheet{transform:none}
^.mp-sh-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
^.mp-sh-head button{color:var(--ac);padding:6px 4px}
^.mp-tabs{display:flex;gap:8px;margin-bottom:8px}
^.mp-tabs button{padding:6px 14px;border-radius:999px;border:1px solid var(--bd)!important;font-size:.9rem}
^.mp-tabs button.on{background:var(--ac);color:#fff;border-color:var(--ac)!important}
^#mpShBody{overflow-y:auto;flex:1}
^.mp-li{display:flex;align-items:center;gap:12px;padding:10px 4px;border-bottom:1px solid var(--bd);cursor:pointer}
^.mp-li .mp-meta{display:block}^.mp-li i{display:flex;font-style:normal;opacity:.85}
^.mp-li.now .mp-t{color:var(--ac)}
^.mp-hint{opacity:.65;font-size:.9rem;line-height:1.7;margin:10px 0}
^.mp-new{display:flex;gap:8px;margin:6px 0 10px}
^.mp-new input{flex:1;margin:0;min-width:0}
^.mp-btn{background:var(--ac)!important;color:#fff!important;padding:8px 14px!important;border-radius:8px!important;white-space:nowrap}
^#mpYTwrap{position:fixed;left:-400px;bottom:0;width:200px;height:200px;pointer-events:none}
^#mpToast{position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:1300;background:rgba(0,0,0,.8);color:#fff;padding:8px 16px;border-radius:999px;font-size:.9rem;opacity:0;pointer-events:none;transition:opacity .2s;max-width:90%;text-align:center}
^#mpToast.show{opacity:1}
html[data-style="glass"] #mpRoot #mpBar,html[data-style="glass"] #mpRoot .mp-sheet{background:color-mix(in srgb,var(--card) 55%,transparent);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%)}
^.mp-sp{width:48px}
^.mp-mw{position:relative;display:flex;flex-direction:column;align-items:center;width:48px}
^.mp-mw small{position:absolute;top:100%;margin-top:-8px;font-size:.68rem;opacity:.75;white-space:nowrap}
^.mp-stack{position:relative;width:min(640px,100%)}
^.mp-stack .mp-sheet{width:100%;height:auto;max-height:82vh;overflow-y:auto}
^.mp-stack .mp-fn{position:absolute;left:0;right:0;bottom:0;max-height:72vh;box-shadow:0 -6px 24px rgba(0,0,0,.35)}
^.mp-rw-head{display:flex;align-items:center;gap:14px;padding:6px 4px 12px;border-bottom:1px solid var(--bd)}
^.mp-rw{display:flex;align-items:center;gap:18px;padding:14px 6px;cursor:pointer}
^.mp-rw i{width:28px;display:flex;justify-content:center;font-style:normal}
^.mp-rw span{flex:1}^.mp-rw em{font-style:normal;opacity:.6;font-size:.9rem}
^.mp-val{font-size:2rem;font-weight:700;text-align:center;margin:10px 0}
^.mp-step{display:flex;align-items:center;justify-content:center;gap:24px;margin:14px 0}
^.mp-step b{font-size:1.5rem;min-width:90px;text-align:center}
^.mp-sb{width:48px;height:48px;border-radius:50%;border:1px solid var(--bd)!important;font-size:1.5rem;display:flex;align-items:center;justify-content:center}
^.mp-chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
^.mp-chips button{padding:8px 14px;border:1px solid var(--bd)!important;border-radius:999px}
^#mpFnBody .mp-btn{display:block;margin:12px auto 0}
^.mp-wrap .mp-fn:not(.open){transform:translateY(100%);visibility:hidden}
^.mp-top{display:grid;grid-template-columns:1fr auto 1fr}
^.mp-top .mp-ib{justify-self:start}
^.mp-ovbtn{justify-self:end;padding:6px 12px;border:1px solid var(--bd)!important;border-radius:999px;background:var(--card)!important;font-size:.85rem}
^#mpOv{position:fixed;inset:0;z-index:1150;display:flex;justify-content:center;background:linear-gradient(var(--bg-angle),var(--bg-color-1),var(--bg-color-2));transform:translateY(100%);visibility:hidden;transition:transform .3s,visibility .3s;color:var(--text-color)}
^#mpOv.open{transform:none;visibility:visible}
^.mp-ovbox{width:min(640px,100%);height:100%;display:flex;flex-direction:column;gap:10px;padding:calc(12px + env(safe-area-inset-top,0px)) 16px 0;box-sizing:border-box}
^.mp-ovhead{display:flex;justify-content:space-between;align-items:center;font-size:1.25rem}
^#ovScroll{flex:1;min-height:0;overflow-y:auto;padding-bottom:12px}
^#ovQ{width:100%;box-sizing:border-box;margin:14px 0 0}
^.mp-ovnow{display:flex;align-items:center;gap:12px;padding:8px 4px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--bd);cursor:pointer}
^.mp-h{margin:18px 0 8px;font-size:1rem}
^.mp-hs{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;scroll-snap-type:x proximity}
^.mp-card{flex:none;width:92px;scroll-snap-align:start;cursor:pointer}
^.mp-card .mp-cv{width:92px;height:92px;border-radius:10px;font-size:32px}
^.mp-card .mp-s{margin-top:4px;opacity:.85}
^.mp-card.now .mp-cv{outline:2px solid var(--ac)}
^.mp-gc{flex:none;width:130px;height:78px;border-radius:12px;color:#fff;padding:10px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-end;cursor:pointer;scroll-snap-align:start}
^.mp-gc.on{outline:3px solid var(--text-color)}
^.mp-gc small{opacity:.85}
^.mp-grp summary{display:flex;justify-content:space-between;padding:12px 4px;border-bottom:1px solid var(--bd);cursor:pointer;list-style:none}
^.mp-grp summary::-webkit-details-marker{display:none}
^.mp-grp em{font-style:normal;opacity:.6}
^.mp-grp>.mp-li{padding-left:14px}
^.mp-li.now .mp-t::before{content:"♪ ";color:var(--ac)}
^.mp-ed{height:auto;max-height:80vh;overflow-y:auto}
^.mp-ed label{display:block;font-size:.85rem;opacity:.7;margin:10px 0 4px}
^.mp-ed input{width:100%;box-sizing:border-box;margin:0}
main{padding-bottom:100px!important}`.replace(/\^/g, "#mpRoot ").replace(/#mpRoot #(mp\w+)/g, "#$1");
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  // ===== DOM =====
  const root = document.createElement("div"); root.id = "mpRoot";
  root.innerHTML = `
<div id="mpBar"><div class="mp-row">
  <div class="mp-cv" id="bCv"></div>
  <div class="mp-meta"><div class="mp-t" id="bT"></div><div class="mp-s" id="bS"></div></div>
  <button class="mp-ib" id="bPlay" aria-label="播放／暫停"></button>
  <button class="mp-ib" id="bUp" aria-label="展開播放器">${ic("up")}</button>
</div><div class="mp-prog"><i id="bProg"></i></div></div>

<div id="mpFull"><div class="mp-col">
  <div class="mp-top"><button class="mp-ib" id="fDown" aria-label="收合">${ic("down")}</button>
    <div><small>播放自</small><b id="fQ"></b></div><button class="mp-ovbtn" id="fOv">音樂總覽</button></div>
  <div class="mp-seg"><button data-s="local">本地音源</button><button data-s="yt">YouTube</button></div>
  <div class="mp-cv mp-art" id="fCv"></div>
  <button class="mp-plbtn" id="fList">${ic("list", 18)}<span>查看／建立播放清單</span></button>
  <div class="mp-info"><div><div class="mp-t" id="fT"></div><div class="mp-s" id="fS"></div></div>
    <button class="mp-ib" id="fAdd" aria-label="加入播放清單">${ic("plus", 32)}</button></div>
  <div><input type="range" id="fSeek" min="0" max="1000" value="0"><div class="mp-time"><span id="fCur">0:00</span><span id="fDur">0:00</span></div></div>
  <div class="mp-ctrl">
    <div class="mp-mw"><button class="mp-ib" id="fSet" aria-label="播放設定">${ic("eq")}</button><small>播放設定</small></div>
    <button class="mp-ib" id="fPrev" aria-label="上一首">${ic("prev", 32)}</button>
    <button class="mp-ib big" id="fPlay" aria-label="播放／暫停"></button>
    <button class="mp-ib" id="fNext" aria-label="下一首">${ic("next", 32)}</button>
    <div class="mp-mw"><button class="mp-ib on" id="fMode" aria-label="切換播放模式"></button><small id="fModeL"></small></div>
  </div>
</div></div>

<div id="mpOv"><div class="mp-ovbox">
  <div class="mp-ovhead"><b>音樂總覽</b><button class="mp-ib" id="ovClose" aria-label="關閉總覽">${ic("x")}</button></div>
  <div class="mp-seg" id="ovSeg"><button data-s="local">本地音樂</button><button data-s="yt">YouTube 音樂</button></div>
  <div class="mp-new" id="ovYtAdd" style="display:none"><input id="ovYtUrl" placeholder="貼上 YouTube 影片連結" inputmode="url"><button class="mp-btn" id="ovYtBtn">新增</button></div>
  <div id="ovScroll"><div id="ovRecent"></div><input id="ovQ" placeholder="搜尋歌名、歌手、專輯"><div id="ovSections"></div></div>
  <div class="mp-ovnow" id="ovNow"><div class="mp-cv" id="oCv"></div><div class="mp-meta"><div class="mp-t" id="oT"></div></div><button class="mp-ib" id="oPlay" aria-label="播放／暫停"></button></div>
</div></div>

<div class="mp-wrap" id="mpWrap"><div class="mp-sheet">
  <div class="mp-sh-head"><button id="shClose">關閉</button><b id="shTitle"></b><button id="shNew">新增清單</button></div>
  <div class="mp-tabs" id="shTabs"><button data-t="add">加入這首</button><button data-t="lists">我的清單</button><button data-t="yt">YouTube 連結</button></div>
  <div id="mpShBody"></div>
</div></div>
<div class="mp-wrap" id="mpSetWrap"><div class="mp-stack">
  <div class="mp-sheet" id="mpSetMenu">
    <div class="mp-sh-head"><span style="width:48px"></span><b>播放設定</b><button id="setClose">關閉</button></div>
    <div id="mpSetList"></div>
  </div>
  <div class="mp-sheet mp-fn" id="mpSetFn">
    <div class="mp-sh-head"><span style="width:48px"></span><b id="fnTitle"></b><button id="fnClose">關閉</button></div>
    <div id="mpFnBody"></div>
  </div>
</div></div>
<div class="mp-wrap" id="mpEdit"><div class="mp-sheet mp-ed">
  <div class="mp-sh-head"><button id="edCancel">取消</button><b>編輯歌曲資訊</b><button id="edSave">儲存</button></div>
  <label>歌名</label><input id="edT"><label>歌手</label><input id="edA"><label>專輯</label><input id="edB">
  <label>類型</label><input id="edG" list="mpGenres" placeholder="例如：搖滾、抒情"><datalist id="mpGenres"></datalist>
</div></div>
<div id="mpYTwrap"><div id="mpYTbox"></div></div>
<div id="mpToast"></div>`;
  document.body.appendChild(root);
  const $$ = s => $(s, root);

  let toastTimer;
  function toast(m) { const t = $$("#mpToast"); t.textContent = m; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2400); }
  function cover(el, url, empty) { el.style.backgroundImage = url ? `url("${url}")` : ""; el.textContent = url ? "" : "♪"; }

  // ===== YouTube =====
  let ytp = null, ytReady = false, ytLoading = false, pendingVid = null, errN = 0;
  function needYT() {
    if (ytLoading) return; ytLoading = true;
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prev) prev();
      ytp = new YT.Player("mpYTbox", {
        width: 200, height: 200, playerVars: { playsinline: 1, controls: 0, disablekb: 1, rel: 0 },
        events: {
          onReady: () => { ytReady = true; if (pendingVid) { ytp.loadVideoById(pendingVid); pendingVid = null; } applyYT(); },
          onStateChange: e => {
            if (!cur || cur.src !== "yt") return;
            if (e.data === 1) { playing = true; errN = 0; applyYT(); fixYTInfo(); ui(); }
            else if (e.data === 2) { playing = false; ui(); }
            else if (e.data === 0) next(true);
          },
          onError: () => { toast("這支 YouTube 影片無法嵌入播放，已跳過"); playing = false; ui(); if (++errN < queue.length) setTimeout(() => next(), 800); }
        }
      });
    };
    const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s);
  }
  function fixYTInfo() {   // 抓不到標題時，播放後用播放器資訊補上
    try {
      const d = ytp.getVideoData();
      if (d && d.title && cur.title.indexOf("YouTube ") === 0) {
        cur.title = d.title; cur.artist = d.author || cur.artist;
        [store.yt].concat(store.lists.map(l => l.items)).forEach(a => a.forEach(x => { if (x.key === cur.key) { x.title = cur.title; x.artist = cur.artist; } }));
        persist();
      }
    } catch (e) {}
  }
  const ytId = s => { s = String(s || "").trim(); const m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/) || s.match(/^([\w-]{11})$/); return m ? m[1] : null; };

  // ===== 播放引擎 =====
  function stopAll() { audio.pause(); if (ytReady) try { ytp.pauseVideo(); } catch (e) {} }
  function playIdx(i, again) {
    if (!queue.length) return;
    idx = (i + queue.length) % queue.length; cur = queue[idx]; plays = again ? plays + 1 : 1; if (!again) pushRecent(cur);
    stopAll(); loadedKey = cur.key; playing = cur.src !== "yt";
    if (cur.src === "yt") { needYT(); if (ytReady) { ytp.loadVideoById(cur.vid); applyYT(); } else pendingVid = cur.vid; }
    else { audio.src = cur.url; applyAudio(); audio.play().catch(() => { playing = false; ui(); toast("無法播放這個音檔，請確認檔案路徑"); }); }
    ui();
  }
  function toggle() {
    if (!cur) { toast(prefs.src === "yt" ? "先到「YouTube 連結」貼上網址吧" : "還沒有本地音樂，可先改用 YouTube"); return; }
    if (loadedKey !== cur.key) { playIdx(idx); return; }
    if (cur.src === "yt") { if (ytReady) (playing ? ytp.pauseVideo() : ytp.playVideo()); }
    else (audio.paused ? audio.play().catch(() => {}) : audio.pause());
  }
  function applyAudio() { audio.volume = vol / 100; audio.defaultPlaybackRate = audio.playbackRate = rate; }
  function applyYT() { if (!ytReady) return; try { ytp.setVolume(vol); ytp.setPlaybackRate(rate); } catch (e) {} }
  function haltAt(i) { stopAll(); playing = false; loadedKey = null; idx = i; cur = queue[i]; ui(); }
  function next(auto) {
    if (!queue.length) return;
    if (auto) {
      if (mode === 4) return haltAt(idx);                                        // 單曲播畢結束
      if (mode === 3 && (!loopMax || plays < loopMax)) return playIdx(idx, true); // 單曲循環（可限次數）
      if (mode === 1 && idx === queue.length - 1) return haltAt(0);              // 順序：最後一首播完就停
    }
    if (mode === 0 && queue.length > 1) { let j; do { j = Math.random() * queue.length | 0; } while (j === idx); return playIdx(j); }
    playIdx(idx + 1);
  }
  const pos = () => {
    if (!cur) return [0, 0];
    if (cur.src === "yt") { try { return [ytp.getCurrentTime() || 0, ytp.getDuration() || 0]; } catch (e) { return [0, 0]; } }
    return [audio.currentTime || 0, isFinite(audio.duration) ? audio.duration : 0];
  };
  function seekTo(t) { if (!cur || loadedKey !== cur.key) return; if (cur.src === "yt") { try { ytp.seekTo(t, true); } catch (e) {} } else audio.currentTime = t; }
  function prev() { if (pos()[0] > 3) seekTo(0); else playIdx(idx - 1); }
  function setSource(s) {
    if (prefs.src === s && qLabel === libLabel(s)) return;
    prefs.src = s; save(PREF_KEY, prefs); stopAll(); playing = false; loadedKey = null;
    queue = lib(s); idx = 0; cur = queue[0] || null; qLabel = libLabel(s); ui();
  }
  function playList(items, i, label) { queue = items.map(x => Object.assign({}, x)); qLabel = label; playIdx(i || 0); }

  audio.addEventListener("play", () => { if (cur && cur.src === "local") { playing = true; ui(); } });
  audio.addEventListener("pause", () => { if (cur && cur.src === "local") { playing = false; ui(); } });
  audio.addEventListener("ended", () => { if (cur && cur.src === "local") next(true); });
  audio.addEventListener("error", () => { if (cur && cur.src === "local" && audio.src) { playing = false; ui(); toast("找不到音檔：" + cur.url); } });

  // ===== 畫面更新 =====
  const remain = () => fmt(Math.max(0, (sleepEnd - Date.now()) / 1000));
  function modeUI() {
    $$("#fMode").innerHTML = ic(["shuf", "seq", "rep", "rep1", "stop"][mode]);
    $$("#fModeL").textContent = MODES[mode] + (mode === 3 && loopMax ? " ×" + loopMax : "");
  }
  function endSleep() { sleepEnd = 0; if (playing) toggle(); toast("定時關閉：已暫停播放"); ui(); }
  function ui() {
    const t = cur ? cur.title : (prefs.src === "yt" ? "尚未加入 YouTube 歌曲" : "尚未加入本地音樂");
    const a = cur ? (cur.artist || (cur.src === "yt" ? "YouTube" : "")) : "點 ∧ 展開，加入音樂";
    const pi = ic(playing ? "pause" : "play", 26);
    $$("#bT").textContent = $$("#fT").textContent = t; $$("#bS").textContent = $$("#fS").textContent = a;
    cover($$("#bCv"), cur && cur.cover); cover($$("#fCv"), cur && cur.cover);
    $$("#bPlay").innerHTML = $$("#fPlay").innerHTML = $$("#oPlay").innerHTML = pi;
    $$("#oT").textContent = t; cover($$("#oCv"), cur && cur.cover); markNow();
    $$("#fQ").textContent = qLabel;
    const act = cur ? cur.src : prefs.src;
    root.querySelectorAll("#mpFull .mp-seg button").forEach(b => b.classList.toggle("on", b.dataset.s === act));
    modeUI();
    if ($$("#mpSetWrap").classList.contains("open")) renderMenu();
    if ("mediaSession" in navigator && cur) {
      try { navigator.mediaSession.metadata = new MediaMetadata({ title: cur.title, artist: cur.artist || "", artwork: cur.cover ? [{ src: new URL(cur.cover, location.href).href }] : [] }); } catch (e) {}
    }
    if ($$("#mpWrap").classList.contains("open")) renderSheet();
  }
  setInterval(() => {
    if (sleepEnd) { if (Date.now() >= sleepEnd) endSleep(); else { const a = $$("#mvTimer"), b = $$("#fnRemain"); if (a) a.textContent = remain(); if (b) b.textContent = remain(); } }
    if (drag) return;
    const p = pos(), r = p[1] ? p[0] / p[1] : 0;
    $$("#bProg").style.width = r * 100 + "%"; $$("#fSeek").value = r * 1000;
    $$("#fCur").textContent = fmt(p[0]); $$("#fDur").textContent = fmt(p[1]);
  }, 500);

  // ===== 主要按鈕 =====
  const openFull = o => { $$("#mpFull").classList.toggle("open", o); document.body.style.overflow = o ? "hidden" : ""; if (!o) { closeSet(); closeOv(); } };
  $$("#mpBar").onclick = e => { if (!e.target.closest("button") || e.target.closest("#bUp")) openFull(true); };
  $$("#bPlay").onclick = toggle; $$("#fPlay").onclick = toggle;
  $$("#fDown").onclick = () => openFull(false);
  $$("#fNext").onclick = () => next(); $$("#fPrev").onclick = prev;
  $$("#fMode").onclick = () => {
    mode = (mode + 1) % 5; prefs.pm = mode; save(PREF_KEY, prefs);
    toast(MODES[mode] + ["", "：播到清單最後一首後停止", "：重複播放整份清單", loopMax ? "：每首重複播放 " + loopMax + " 次" : "：重複播放目前歌曲", "：播完目前這首就停止"][mode]);
    ui();
  };
  document.addEventListener("visibilitychange", () => { if (sleepEnd && Date.now() >= sleepEnd) endSleep(); });
  root.querySelectorAll("#mpFull .mp-seg button").forEach(b => b.onclick = () => setSource(b.dataset.s));
  const sk = $$("#fSeek");
  sk.addEventListener("input", () => { drag = true; $$("#fCur").textContent = fmt(sk.value / 1000 * pos()[1]); });
  sk.addEventListener("change", () => { seekTo(sk.value / 1000 * pos()[1]); drag = false; });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { if ($$("#mpSetWrap").classList.contains("open")) closeSet(); else if ($$("#mpEdit").classList.contains("open")) $$("#mpEdit").classList.remove("open"); else if ($$("#mpWrap").classList.contains("open")) openSheet(false); else if (ovIsOpen()) closeOv(); else openFull(false); } });
  if ("mediaSession" in navigator) { try {
    navigator.mediaSession.setActionHandler("play", toggle); navigator.mediaSession.setActionHandler("pause", toggle);
    navigator.mediaSession.setActionHandler("nexttrack", () => next()); navigator.mediaSession.setActionHandler("previoustrack", prev);
  } catch (e) {} }

  // ===== 播放清單面板 =====
  const view = { tab: "add", open: null, creating: false };
  function openSheet(o, tab) {
    if (tab) { view.tab = tab; view.open = null; }
    view.creating = false; $$("#mpWrap").classList.toggle("open", o); if (o) renderSheet();
  }
  $$("#fList").onclick = () => openSheet(true, "lists");
  $$("#fAdd").onclick = () => openSheet(true, "add");
  $$("#shClose").onclick = () => openSheet(false);
  $$("#mpWrap").onclick = e => { if (e.target.id === "mpWrap") openSheet(false); };
  $$("#shNew").onclick = () => { view.creating = true; renderSheet(); const i = $$("#mpNewName"); if (i) i.focus(); };
  $$("#shTabs").onclick = e => { const b = e.target.closest("button"); if (b) { view.tab = b.dataset.t; view.open = null; view.creating = false; renderSheet(); } };

  const row = (t, extra, attrs) => `<div class="mp-li${cur && cur.key === t.key ? " now" : ""}" ${attrs}>
    <div class="mp-cv" style="${t.cover ? `background-image:url('${esc(t.cover)}')` : ""}">${t.cover ? "" : "♪"}</div>
    <div class="mp-meta"><div class="mp-t">${esc(t.title)}</div><div class="mp-s">${esc(t.artist || (t.src === "yt" ? "YouTube" : ""))}</div></div>${extra}</div>`;

  function renderSheet() {
    const tabs = { add: "儲存到", lists: "我的清單", yt: "YouTube 連結" };
    const openList = view.open && store.lists.find(l => l.id === view.open);
    $$("#shTitle").textContent = openList ? openList.name : tabs[view.tab];
    root.querySelectorAll("#shTabs button").forEach(b => b.classList.toggle("on", b.dataset.t === view.tab));
    let h = "";
    if (view.creating) h += `<div class="mp-new"><input id="mpNewName" placeholder="清單名稱" maxlength="30"><button class="mp-btn" data-a="newok">建立</button></div>`;
    if (view.tab === "add") {
      if (!cur) h += `<p class="mp-hint">目前沒有選擇歌曲。先播放一首，再來加入清單。</p>`;
      else h += `<p class="mp-hint">${esc(cur.title)}</p>` + store.lists.map(l => {
        const on = l.items.some(x => x.key === cur.key);
        return `<div class="mp-li" data-a="tog" data-id="${l.id}"><div class="mp-meta"><div class="mp-t">${esc(l.name)}</div><div class="mp-s">${l.items.length} 首</div></div><i>${ic(on ? "chk" : "plus", 28)}</i></div>`;
      }).join("");
    } else if (view.tab === "lists") {
      if (openList) {
        h += `<div style="display:flex;justify-content:space-between;margin:4px 0 6px"><button data-a="back" style="color:var(--ac)">‹ 返回</button><button class="mp-btn" data-a="playall" data-id="${openList.id}">播放全部</button></div>`;
        h += openList.items.length ? openList.items.map((t, i) => row(t, `<i data-a="rm" data-id="${openList.id}" data-i="${i}">${ic("x", 20)}</i>`, `data-a="playin" data-id="${openList.id}" data-i="${i}"`)).join("") : `<p class="mp-hint">這個清單還沒有歌曲。</p>`;
      } else h += store.lists.map(l => `<div class="mp-li" data-a="open" data-id="${l.id}"><div class="mp-meta"><div class="mp-t">${esc(l.name)}</div><div class="mp-s">${l.items.length} 首</div></div>${l.id === "liked" ? "" : `<i data-a="dellist" data-id="${l.id}">${ic("x", 20)}</i>`}</div>`).join("");
    } else {
      h += `<div class="mp-new"><input id="mpYtUrl" placeholder="貼上 YouTube 影片連結" inputmode="url"><button class="mp-btn" data-a="ytadd">新增</button></div>`;
      h += store.yt.length ? store.yt.map((t, i) => row(t, `<i data-a="ytrm" data-i="${i}">${ic("x", 20)}</i>`, `data-a="ytplay" data-i="${i}"`)).join("") : `<p class="mp-hint">支援一般影片連結與 youtu.be 短網址（單支影片，不含整份播放清單）。部分影片作者不允許嵌入播放。</p>`;
    }
    const scroll = $$("#mpShBody").scrollTop; $$("#mpShBody").innerHTML = h; $$("#mpShBody").scrollTop = scroll;
  }

  async function addYT(sel) {
    const inp = $$(sel || "#mpYtUrl"), id = ytId(inp.value);
    if (!id) return toast("看不懂這個連結，請貼完整的 YouTube 影片網址");
    if (store.yt.some(t => t.vid === id)) return toast("這支影片已經在清單裡了");
    const t = { key: "y:" + id, src: "yt", vid: id, title: "YouTube " + id, artist: "", cover: "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg" };
    try {
      const r = await fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + id));
      if (r.ok) { const d = await r.json(); t.title = d.title || t.title; t.artist = d.author_name || ""; }
    } catch (e) {}
    store.yt.push(t); persist();
    if (qLabel === libLabel("yt")) { queue = lib("yt"); if (!cur) { idx = 0; cur = queue[0]; } }
    inp.value = ""; toast("已新增"); ui(); renderSheet(); if (ovIsOpen()) renderOv();
  }

  $$("#mpShBody").onclick = e => {
    const el = e.target.closest("[data-a]"); if (!el) return;
    const a = el.dataset.a, id = el.dataset.id, i = +el.dataset.i;
    const list = store.lists.find(l => l.id === id);
    if (a === "tog" && cur && list) {
      const k = list.items.findIndex(x => x.key === cur.key);
      if (k >= 0) list.items.splice(k, 1); else list.items.push(snap(cur));
      persist(); renderSheet();
    } else if (a === "newok") {
      const n = $$("#mpNewName").value.trim(); if (!n) return toast("請輸入清單名稱");
      const l = { id: "l" + Date.now().toString(36), name: n, items: [] };
      if (view.tab === "add" && cur) l.items.push(snap(cur));
      store.lists.push(l); persist(); view.creating = false; renderSheet();
    } else if (a === "open") { view.open = id; renderSheet(); }
    else if (a === "back") { view.open = null; renderSheet(); }
    else if (a === "dellist") { if (confirm("確定要刪除這個播放清單嗎？")) { store.lists = store.lists.filter(l => l.id !== id); persist(); renderSheet(); } }
    else if (a === "rm" && list) { list.items.splice(i, 1); persist(); renderSheet(); }
    else if (a === "playall" && list) { if (list.items.length) { playList(list.items, 0, list.name); openSheet(false); } else toast("清單是空的"); }
    else if (a === "playin" && list) { playList(list.items, i, list.name); openSheet(false); }
    else if (a === "ytadd") addYT();
    else if (a === "ytrm") ytRemoveAt(i);
    else if (a === "ytplay") { prefs.src = "yt"; save(PREF_KEY, prefs); playList(store.yt, i, libLabel("yt")); openSheet(false); }
  };
  $$("#mpShBody").addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    if (e.target.id === "mpYtUrl") addYT(); else if (e.target.id === "mpNewName") $$("#mpShBody").querySelector('[data-a="newok"]').click();
  });


  // ===== 播放設定（只在展開頁） =====
  const setWrap = $$("#mpSetWrap"), fnSheet = $$("#mpSetFn");
  let fn = null;
  const likedList = () => store.lists.find(l => l.id === "liked");
  const isLiked = () => !!(cur && likedList().items.some(x => x.key === cur.key));
  function openSet() { renderMenu(); setWrap.classList.add("open"); }
  function closeSet() { setWrap.classList.remove("open"); fnSheet.classList.remove("open"); fn = null; }
  function renderMenu() {
    const L = isLiked();
    const rows = [["loop", "rep1", "設置循環次數", loopMax ? loopMax + " 次" : "無限"], ["timer", "clock", "定時關閉", sleepEnd ? remain() : "未開啟"],
      ["speed", "speed", "倍速", rate.toFixed(1) + "x"], ["vol", "vol", "調節音量", vol], ["like", L ? "heartOn" : "heart", "收藏", L ? "已收藏" : ""]];
    $$("#mpSetList").innerHTML = `<div class="mp-rw-head"><div class="mp-cv" style="${cur && cur.cover ? `background-image:url('${esc(cur.cover)}')` : ""}">${cur && cur.cover ? "" : "♪"}</div>
      <div class="mp-meta"><div class="mp-t">${esc(cur ? cur.title : "尚未播放")}</div><div class="mp-s">${esc(cur ? cur.artist || "" : "")}</div></div></div>` +
      rows.map(r => `<div class="mp-rw" data-m="${r[0]}"><i>${ic(r[1], 26)}</i><span>${r[2]}</span><em${r[0] === "timer" ? ' id="mvTimer"' : ""}>${r[3]}</em></div>`).join("");
  }
  function toggleLike() {
    if (!cur) return toast("尚未播放歌曲");
    const l = likedList(), k = l.items.findIndex(x => x.key === cur.key);
    if (k >= 0) { l.items.splice(k, 1); toast("已取消收藏"); } else { l.items.push(snap(cur)); toast("已加入「已按讚的歌曲」"); }
    persist(); renderMenu(); if ($$("#mpWrap").classList.contains("open")) renderSheet();
  }
  function renderFn() {
    const T = { loop: "設置循環次數", timer: "定時關閉", speed: "倍速", vol: "調節音量" };
    $$("#fnTitle").textContent = T[fn]; let h = "";
    if (fn === "loop") {
      h = `<p class="mp-hint">在「單曲循環」模式下，每首歌重複播放的次數；播完指定次數後會接著播下一首。</p>
        <div class="mp-step"><button class="mp-sb" data-f="lm-">−</button><b>${loopMax ? loopMax + " 次" : "無限"}</b><button class="mp-sb" data-f="lm+">＋</button></div>`;
      if (mode !== 3) h += `<p class="mp-hint">目前不是單曲循環模式，切換後才會生效。</p><button class="mp-btn" data-f="tomode">切換為單曲循環</button>`;
    } else if (fn === "timer") {
      h = `<p class="mp-hint">${sleepEnd ? `剩餘 <b id="fnRemain">${remain()}</b>，時間到會自動暫停。` : "選擇播放多久後自動暫停。"}</p>
        <div class="mp-chips">${[15, 30, 45, 60, 90].map(m => `<button data-f="sl" data-m="${m}">${m} 分鐘</button>`).join("")}</div>
        <div class="mp-new"><input id="slCustom" type="number" min="1" max="720" inputmode="numeric" placeholder="自訂分鐘數（1–720）"><button class="mp-btn" data-f="slc">開始</button></div>` +
        (sleepEnd ? `<button class="mp-btn" data-f="slx">取消定時</button>` : "");
    } else if (fn === "speed") {
      h = `<div class="mp-val" id="fnVal">${rate.toFixed(1)}x</div><input type="range" id="rngRate" min="1" max="20" step="1" value="${Math.round(rate * 10)}">
        <div class="mp-time"><span>0.1x</span><span>2.0x</span></div><button class="mp-btn" data-f="rate1">重設為 1.0x</button>
        <p class="mp-hint">YouTube 音源只有固定檔位（0.25～2 倍），會自動套用最接近的倍速。</p>`;
    } else {
      h = `<div class="mp-val" id="fnVal">${vol}</div><input type="range" id="rngVol" min="0" max="100" step="1" value="${vol}">
        <div class="mp-time"><span>0</span><span>100</span></div><p class="mp-hint">iPhone／iPad 的瀏覽器無法調整網頁音量，請改用手機音量鍵。</p>`;
    }
    $$("#mpFnBody").innerHTML = h;
  }
  function setRate(r) {
    rate = Math.min(2, Math.max(0.1, Math.round(r * 10) / 10)); applyAudio(); applyYT(); prefs.rate = rate; save(PREF_KEY, prefs);
    const v = $$("#fnVal"); if (v) v.textContent = rate.toFixed(1) + "x"; const g = $$("#rngRate"); if (g) g.value = Math.round(rate * 10); renderMenu();
  }
  function setVol(v) {
    vol = Math.max(0, Math.min(100, v | 0)); applyAudio(); applyYT(); prefs.vol = vol; save(PREF_KEY, prefs);
    const e = $$("#fnVal"); if (e) e.textContent = vol; renderMenu();
  }
  function startSleep(m) { sleepEnd = Date.now() + m * 60000; toast("將於 " + m + " 分鐘後暫停播放"); }

  $$("#fSet").onclick = openSet;
  $$("#setClose").onclick = closeSet; $$("#fnClose").onclick = closeSet;
  setWrap.onclick = e => { if (e.target.id === "mpSetWrap") closeSet(); };
  $$("#mpSetList").onclick = e => {
    const r = e.target.closest("[data-m]"); if (!r) return;
    if (r.dataset.m === "like") toggleLike(); else { fn = r.dataset.m; renderFn(); fnSheet.classList.add("open"); }
  };
  $$("#mpFnBody").onclick = e => {
    const b = e.target.closest("[data-f]"); if (!b) return; const f = b.dataset.f;
    if (f === "lm+" || f === "lm-") {
      loopMax = f === "lm+" ? (loopMax === 0 ? 2 : Math.min(99, loopMax + 1)) : (loopMax <= 2 ? 0 : loopMax - 1);
      prefs.loop = loopMax; save(PREF_KEY, prefs); modeUI(); renderFn(); renderMenu();
    } else if (f === "tomode") { mode = 3; prefs.pm = 3; save(PREF_KEY, prefs); ui(); renderFn(); toast("單曲循環"); }
    else if (f === "sl") { startSleep(+b.dataset.m); renderFn(); renderMenu(); }
    else if (f === "slc") { const m = Math.round(+$$("#slCustom").value); if (!(m >= 1 && m <= 720)) return toast("請輸入 1 到 720 的分鐘數"); startSleep(m); renderFn(); renderMenu(); }
    else if (f === "slx") { sleepEnd = 0; toast("已取消定時"); renderFn(); renderMenu(); }
    else if (f === "rate1") setRate(1);
  };
  $$("#mpFnBody").addEventListener("input", e => {
    if (e.target.id === "rngRate") setRate(e.target.value / 10); else if (e.target.id === "rngVol") setVol(+e.target.value);
  });


  // ===== 音樂總覽 =====
  let ovSrc = "local", ovGenre = null, editKey = null;
  const ovIsOpen = () => $$("#mpOv").classList.contains("open");
  const ovList = () => lib(ovSrc);
  const bgOf = t => t.cover ? `background-image:url('${esc(t.cover)}')` : "";
  const groupBy = (arr, f, none) => {
    const m = new Map(); arr.forEach(t => { const k = f(t) || none; if (!m.has(k)) m.set(k, []); m.get(k).push(t); });
    return Array.from(m).sort((a, b) => a[0] === none ? 1 : b[0] === none ? -1 : a[0].localeCompare(b[0], "zh-Hant"));
  };
  const mg = t => ovSrc === "yt" ? `<i data-ovx="edit" data-key="${esc(t.key)}">${ic("pen", 20)}</i><i data-ovx="del" data-key="${esc(t.key)}">${ic("x", 20)}</i>` : "";
  const ovRow = (t, sec, g, i, extra) => row(t, extra || "", `data-key="${esc(t.key)}" data-ov="1" data-sec="${sec}" data-g="${esc(g || "")}" data-i="${i}"`);
  const grp = (L, f, none) => groupBy(L, t => t[f], none).map(g => `<details class="mp-grp"><summary><span>${esc(g[0])}</span><em>${g[1].length} 首</em></summary>${g[1].map((t, i) => ovRow(t, f, g[0], i)).join("")}</details>`).join("");
  function genreList(L) {
    if (!ovGenre) return `<p class="mp-hint">點選上方卡片，查看該類型的歌曲。</p>`;
    const ts = L.filter(t => (t.genre || "未分類") === ovGenre);
    return ts.map((t, i) => ovRow(t, "genre", ovGenre, i)).join("") || `<p class="mp-hint">沒有歌曲。</p>`;
  }
  function genreCards(L) {
    return `<div class="mp-hs">${groupBy(L, t => t.genre, "未分類").map((g, i) => `<div class="mp-gc${ovGenre === g[0] ? " on" : ""}" data-gc="${esc(g[0])}" style="background:hsl(${(i * 57 + 200) % 360} 55% 42%)"><b>${esc(g[0])}</b><small>${g[1].length} 首</small></div>`).join("")}</div><div id="ovGenreList">${genreList(L)}</div>`;
  }
  function scopeList(sec, g) {
    const L = ovList();
    if (sec === "recent") return recent.filter(x => x.src === ovSrc);
    if (sec === "search") { const q = $$("#ovQ").value.trim().toLowerCase(); return L.filter(t => [t.title, t.artist, t.album].some(v => String(v || "").toLowerCase().indexOf(q) >= 0)); }
    if (sec === "artist") return L.filter(t => (t.artist || "未知歌手") === g);
    if (sec === "album") return L.filter(t => (t.album || "未分類") === g);
    if (sec === "genre") return L.filter(t => (t.genre || "未分類") === g);
    return L;
  }
  function renderOv() {
    const L = ovList(), q = $$("#ovQ").value.trim().toLowerCase();
    $$("#ovSeg").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.s === ovSrc));
    $$("#ovYtAdd").style.display = ovSrc === "yt" ? "flex" : "none";
    const rc = recent.filter(x => x.src === ovSrc);
    $$("#ovRecent").innerHTML = q ? "" : `<h4 class="mp-h">最近播放</h4>` + (rc.length ? `<div class="mp-hs">${rc.map((t, i) => `<div class="mp-card" data-ov="1" data-sec="recent" data-i="${i}" data-key="${esc(t.key)}"><div class="mp-cv" style="${bgOf(t)}">${t.cover ? "" : "♪"}</div><div class="mp-s">${esc(t.title)}</div></div>`).join("")}</div>` : `<p class="mp-hint">還沒有播放紀錄。</p>`);
    let h = "";
    if (q) { const R = scopeList("search"); h = `<h4 class="mp-h">搜尋結果（${R.length}）</h4>` + (R.map((t, i) => ovRow(t, "search", "", i, mg(t))).join("") || `<p class="mp-hint">找不到符合的歌曲。</p>`); }
    else if (!L.length) h = `<p class="mp-hint">${ovSrc === "yt" ? "還沒有 YouTube 歌曲，請先在上方貼連結新增。" : "還沒有本地音樂。請把 mp3 放進 music 資料夾，並在 music.js 的 LOCAL_TRACKS 登記。"}</p>`;
    else {
      h = `<h4 class="mp-h">全部歌曲（${L.length}）</h4>` + L.map((t, i) => ovRow(t, "all", "", i, mg(t))).join("");
      h += `<h4 class="mp-h">依歌手分類</h4>` + grp(L, "artist", "未知歌手");
      h += `<h4 class="mp-h">依專輯分類</h4>` + grp(L, "album", "未分類");
      h += `<h4 class="mp-h">音樂類型</h4>` + genreCards(L);
    }
    $$("#ovSections").innerHTML = h; markNow();
  }
  function markNow() { $$("#mpOv").querySelectorAll("[data-key]").forEach(e => e.classList.toggle("now", !!cur && e.dataset.key === cur.key)); }
  function openOv() { ovSrc = cur ? cur.src : prefs.src; ovGenre = null; $$("#ovQ").value = ""; renderOv(); $$("#mpOv").classList.add("open"); $$("#ovScroll").scrollTop = 0; }
  function closeOv() { $$("#mpOv").classList.remove("open"); }
  function ovPlay(sec, g, i) {
    const items = scopeList(sec, g); if (!items.length) return;
    prefs.src = ovSrc; save(PREF_KEY, prefs);
    playList(items, i, sec === "all" ? libLabel(ovSrc) : sec === "recent" ? "最近播放" : sec === "search" ? "搜尋結果" : g);
  }
  function ytRemoveAt(i) {
    store.yt.splice(i, 1); persist();
    if (qLabel === libLabel("yt")) { queue = lib("yt"); if (cur && !queue.some(x => x.key === cur.key)) { stopAll(); playing = false; loadedKey = null; idx = 0; cur = queue[0] || null; } else if (cur) idx = queue.findIndex(x => x.key === cur.key); }
    ui(); renderSheet(); if (ovIsOpen()) renderOv();
  }
  function patchTrack(key, f) {
    const ap = x => { if (x.key === key) Object.assign(x, f); };
    store.yt.forEach(ap); store.lists.forEach(l => l.items.forEach(ap)); recent.forEach(ap); queue.forEach(ap); if (cur && cur.key === key) Object.assign(cur, f);
    persist(); save("music_recent", recent); ui(); if (ovIsOpen()) renderOv();
  }
  function openEdit(key) {
    const t = store.yt.find(x => x.key === key); if (!t) return; editKey = key;
    $$("#edT").value = t.title || ""; $$("#edA").value = t.artist || ""; $$("#edB").value = t.album || ""; $$("#edG").value = t.genre || "";
    const gs = {}; lib("local").concat(store.yt).forEach(x => { if (x.genre) gs[x.genre] = 1; });
    $$("#mpGenres").innerHTML = Object.keys(gs).map(g => `<option value="${esc(g)}">`).join("");
    $$("#mpEdit").classList.add("open");
  }

  $$("#fOv").onclick = openOv; $$("#ovClose").onclick = closeOv; $$("#ovNow").onclick = e => { if (!e.target.closest("button")) closeOv(); };
  $$("#oPlay").onclick = toggle;
  $$("#ovSeg").onclick = e => { const b = e.target.closest("button"); if (b) { ovSrc = b.dataset.s; ovGenre = null; renderOv(); $$("#ovScroll").scrollTop = 0; } };
  $$("#ovQ").addEventListener("input", renderOv);
  $$("#ovYtBtn").onclick = () => addYT("#ovYtUrl");
  $$("#ovYtUrl").addEventListener("keydown", e => { if (e.key === "Enter") addYT("#ovYtUrl"); });
  $$("#ovScroll").onclick = e => {
    const x = e.target.closest("[data-ovx]");
    if (x) {
      if (x.dataset.ovx === "edit") openEdit(x.dataset.key);
      else { const i = store.yt.findIndex(t => t.key === x.dataset.key); if (i >= 0 && confirm("確定要刪除這首 YouTube 歌曲嗎？")) ytRemoveAt(i); }
      return;
    }
    const gc = e.target.closest("[data-gc]");
    if (gc) {
      ovGenre = ovGenre === gc.dataset.gc ? null : gc.dataset.gc;
      $$("#ovScroll").querySelectorAll(".mp-gc").forEach(c => c.classList.toggle("on", c.dataset.gc === ovGenre));
      $$("#ovGenreList").innerHTML = genreList(ovList()); markNow(); return;
    }
    const r = e.target.closest("[data-ov]"); if (r) ovPlay(r.dataset.sec, r.dataset.g, +r.dataset.i);
  };
  $$("#edCancel").onclick = () => $$("#mpEdit").classList.remove("open");
  $$("#mpEdit").onclick = e => { if (e.target.id === "mpEdit") $$("#mpEdit").classList.remove("open"); };
  $$("#edSave").onclick = () => {
    const t = store.yt.find(x => x.key === editKey); if (!t) return;
    patchTrack(editKey, { title: $$("#edT").value.trim() || t.title, artist: $$("#edA").value.trim(), album: $$("#edB").value.trim(), genre: $$("#edG").value.trim() });
    $$("#mpEdit").classList.remove("open"); toast("已儲存");
  };

     // ===== 收合成懸浮球 =====
  (function () {
    const BALL = 52, M = 4, KEY = "music_ball";
    const bar = $$("#mpBar"), ball = document.createElement("div"), btn = document.createElement("button");
    const sty = document.createElement("style");
    sty.textContent = `
#mpRoot #mpBar{transition:transform .3s,opacity .3s}
#mpRoot #mpBar.mp-hide{transform:translateX(calc(-50% + 100vw));opacity:0;visibility:hidden;pointer-events:none;transition:transform .3s,opacity .3s,visibility 0s .3s}
#mpRoot #mpBall{position:fixed;left:0;top:0;width:${BALL}px;height:${BALL}px;border-radius:50%;z-index:950;display:none;align-items:center;justify-content:center;background:var(--ac);color:#fff;font-size:24px;box-shadow:0 4px 14px rgba(0,0,0,.35);touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;transition:left .25s,top .25s}
#mpRoot #mpBall.show{display:flex}
#mpRoot #mpBall.drag{transition:none;cursor:grabbing}
#mpRoot #mpBall.on{animation:mpPulse 1.6s infinite}
@keyframes mpPulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.6),0 4px 14px rgba(0,0,0,.35)}70%{box-shadow:0 0 0 14px rgba(255,255,255,0),0 4px 14px rgba(0,0,0,.35)}100%{box-shadow:0 0 0 0 rgba(255,255,255,0),0 4px 14px rgba(0,0,0,.35)}}
#mpRoot #mpBar .mp-row{gap:0;padding:0;align-items:stretch}
#mpRoot #mpBar .mp-row>.mp-sg{display:flex;align-items:center;justify-content:center;width:auto;height:auto;border-radius:0;border-left:1px solid var(--bd);cursor:pointer;transition:background .12s}
#mpRoot #mpBar .mp-row>.mp-sg:first-child{border-left:0}
#mpRoot #mpBar .mp-row>.mp-sg:active{background:rgba(128,128,128,.28)}
#mpRoot #mpBar .mp-row>button.mp-sg{min-width:50px}
#mpRoot #mpBar .mp-row>.mp-info2{flex:1;min-width:0;justify-content:flex-start;gap:12px;padding:8px 10px}
html.mp-ballmode main{padding-bottom:24px!important}`;
    document.head.appendChild(sty);
    ball.id = "mpBall"; ball.textContent = "♪"; ball.setAttribute("role", "button"); ball.tabIndex = 0; ball.setAttribute("aria-label", "展開音樂播放列");
    root.appendChild(ball);
    btn.className = "mp-ib mp-sg"; btn.id = "bBall";
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24"><path ${S} stroke-width="2.5" d="M9 6l6 6-6 6"/></svg>`;
    const row = bar.querySelector(".mp-row"), info = document.createElement("div");
info.className = "mp-sg mp-info2";
info.appendChild($$("#bCv")); info.appendChild(row.querySelector(".mp-meta"));
row.insertBefore(info, $$("#bPlay"));
$$("#bPlay").classList.add("mp-sg"); $$("#bUp").classList.add("mp-sg");
row.insertBefore(btn, row.firstChild);

    let side = "r", yf = 0.8, on = false;
    try { const o = JSON.parse(localStorage.getItem(KEY) || "{}"); if (o.side) side = o.side; if (typeof o.y === "number") yf = o.y; on = !!o.on; } catch (e) {}
    const keep = () => { try { localStorage.setItem(KEY, JSON.stringify({ on: on, side: side, y: yf })); } catch (e) {} };
    const vw = () => document.documentElement.clientWidth, vh = () => window.innerHeight;
    function place() {
      ball.style.left = (side === "l" ? M : vw() - BALL - M) + "px";
      ball.style.top = Math.max(M, Math.min(vh() - BALL - M, yf * vh())) + "px";
    }
    function setMode(v) {
      on = v; keep(); document.documentElement.classList.toggle("mp-ballmode", on);
      if (on) { ball.classList.add("drag"); place(); void ball.offsetWidth; ball.classList.remove("drag"); ball.classList.add("show"); bar.classList.add("mp-hide"); }
      else { ball.classList.remove("show"); bar.classList.remove("mp-hide"); }
    }
    btn.onclick = () => { const r = bar.getBoundingClientRect(); yf = (r.top + r.height / 2 - BALL / 2) / vh(); side = "r"; setMode(true); };

    let pid = null, sx = 0, sy = 0, ox = 0, oy = 0, moved = false;
    ball.addEventListener("pointerdown", e => {
      pid = e.pointerId; ball.setPointerCapture(pid); const r = ball.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top; moved = false; ball.classList.add("drag");
    });
    ball.addEventListener("pointermove", e => {
      if (e.pointerId !== pid) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 6) return;
      moved = true;
      ball.style.left = Math.max(0, Math.min(vw() - BALL, ox + dx)) + "px";
      ball.style.top = Math.max(0, Math.min(vh() - BALL, oy + dy)) + "px";
    });
    function release(e, cancel) {
      if (e.pointerId !== pid) return; pid = null; ball.classList.remove("drag");
      if (!moved && !cancel) return setMode(false);
      const r = ball.getBoundingClientRect();
      side = r.left + BALL / 2 < vw() / 2 ? "l" : "r"; yf = r.top / vh(); keep(); place();
    }
    ball.addEventListener("pointerup", e => release(e, false));
    ball.addEventListener("pointercancel", e => release(e, true));
    ball.addEventListener("contextmenu", e => e.preventDefault());
    ball.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") setMode(false); });
    window.addEventListener("resize", () => { if (on) place(); });
    setInterval(() => ball.classList.toggle("on", !!playing), 500);
    if (on) { bar.style.transition = "none"; setMode(true); void bar.offsetWidth; bar.style.transition = ""; }
  })();

  applyAudio();

   if (store.yt.length) needYT();
   
  ui();
})();
