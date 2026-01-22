window.addEventListener("DOMContentLoaded", () => {
  initBaseMap();

  loadCECData();
  setupGeoJSONLayers();

  // Preload analysis layers
  window.analysisLayersReadyPromise = preloadAnalysisLayers();

  // New drawn shapes manager (creates "My Shapes" list)
  initDrawnShapesManager();

  // New spatial analysis v2 UI
  initSpatialAnalysisV2();

  // Roads toggle from Settings panel
  const roadsToggle = document.getElementById("roadsToggle");
  if (roadsToggle && window.setRoadsEnabled) {
    roadsToggle.addEventListener("change", () => {
      window.setRoadsEnabled(roadsToggle.checked);
    });
  }
});
