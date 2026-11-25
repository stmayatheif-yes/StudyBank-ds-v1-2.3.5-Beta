/* 放在 StudyBank 的 index.html 最後面，在側邊欄加入「山河築夢」入口 */
(function () {
  const nav = document.getElementById("navSettings");
  if (!nav) return;
  const item = document.createElement("div");
  item.className = "sidebar-item";
  item.id = "navTown";
  item.textContent = "🏘️ 山河築夢";
  item.onclick = () => { location.href = "town.html"; };
  nav.insertAdjacentElement("afterend", item);
})();
