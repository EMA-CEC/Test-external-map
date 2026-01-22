document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("panel-toggle");
  if (!toggleBtn) return;

  const KEY = "toolpanel-collapsed";

  function setCollapsed(isCollapsed) {
    document.body.classList.toggle("toolpanel-collapsed", isCollapsed);

    toggleBtn.setAttribute("aria-expanded", String(!isCollapsed));
    toggleBtn.textContent = isCollapsed ? "▶" : "◀";

    localStorage.setItem(KEY, isCollapsed ? "1" : "0");

    if (typeof map !== "undefined" && map && map.invalidateSize) {
      requestAnimationFrame(() => map.invalidateSize(true));
      setTimeout(() => map.invalidateSize(true), 350);
    }
  }

  const saved = localStorage.getItem(KEY);
  setCollapsed(saved === "1");

  toggleBtn.addEventListener("click", () => {
    const currentlyCollapsed = document.body.classList.contains("toolpanel-collapsed");
    setCollapsed(!currentlyCollapsed);
  });

  window.openToolPanel = function () {
    setCollapsed(false);
  };
});
