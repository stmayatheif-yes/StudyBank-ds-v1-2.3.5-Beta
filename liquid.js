/* ==========================================
   液態玻璃：偵測瀏覽器能不能做折射，能做才加上 SVG 濾鏡
   使用方式：在 index.html 的 </body> 前加上：<script src="liquid.js"></script>
   ========================================== */
(function () {
  // 1. 建立 SVG 濾鏡（扭曲背景，模擬玻璃的折射）
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  svg.innerHTML = `
    <filter id="liquid-glass" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="7" result="noise"/>
      <feGaussianBlur in="noise" stdDeviation="2" result="softNoise"/>
      <feDisplacementMap in="SourceGraphic" in2="softNoise" scale="14" xChannelSelector="R" yChannelSelector="G"/>
    </filter>`;
  document.body.appendChild(svg);

  // 2. 偵測：這個瀏覽器能不能用 url() 濾鏡做 backdrop-filter
  function supportsLiquid() {
    if (!window.CSS || !CSS.supports) return false;
    if (!CSS.supports("backdrop-filter", "blur(2px)") && !CSS.supports("-webkit-backdrop-filter", "blur(2px)")) return false;
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;width:1px;height:1px;backdrop-filter:url(#liquid-glass);-webkit-backdrop-filter:url(#liquid-glass)";
    document.body.appendChild(probe);
    const ok = getComputedStyle(probe).backdropFilter !== "none" || getComputedStyle(probe).webkitBackdropFilter !== "none";
    probe.remove();
    return ok;
  }

  // 3. 只在「液態玻璃」風格時開啟折射；柔光玻璃與純色不受影響
  function apply() {
    const liquid = document.documentElement.getAttribute("data-style") === "liquid";
    const on = liquid && supportsLiquid();
    if (on) document.documentElement.setAttribute("data-liquid", "on");
    else document.documentElement.removeAttribute("data-liquid");
  }
  apply();
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ["data-style"] });
})();
