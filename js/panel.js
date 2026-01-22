document.addEventListener("DOMContentLoaded", () => {
  const panelButtons = document.querySelectorAll("#icon-bar .icon-btn");
  const panels = document.querySelectorAll("#tool-panel .tool-panel-section");

  if (!panelButtons.length || !panels.length) {
    console.warn("Panel switcher: No buttons or panels found.");
    return;
  }

  function showPanel(panelIdToShow) {
    panels.forEach((panel) => {
      panel.hidden = panel.id !== panelIdToShow;
    });

    panelButtons.forEach((btn) => {
      const btnPanelId = btn.getAttribute("data-panel");
      const isActive = btnPanelId === panelIdToShow;
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  let defaultPanelId = "panel-overview";
  panelButtons.forEach((btn) => {
    if (btn.getAttribute("aria-pressed") === "true") {
      defaultPanelId = btn.getAttribute("data-panel");
    }
  });

  showPanel(defaultPanelId);

  panelButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const panelId = btn.getAttribute("data-panel");
      if (!panelId) return;

      if (typeof window.openToolPanel === "function") {
        window.openToolPanel();
      }

      showPanel(panelId);
    });
  });
});
