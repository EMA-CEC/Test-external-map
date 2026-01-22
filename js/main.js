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

  // NSL Read Me
  const nslReadMeBtn = document.getElementById("nslReadMeBtn");
  if (nslReadMeBtn) {
    nslReadMeBtn.addEventListener("click", () => {
      window.open(
        "https://drive.google.com/file/d/1a61Tte8xPK8YM4FgRKFaeqsfwEoMgs3N/view",
        "_blank"
      );
    });
  }

  // DA Selection
  const daBtn = document.getElementById("nslDASelectionBtn");
  if (daBtn) daBtn.addEventListener("click", openDAPanel);

  // Risk Assessment
  const riskBtn = document.getElementById("nslRiskAssessmentBtn");
  if (riskBtn) riskBtn.addEventListener("click", openRiskPanel);

  // Model Output
  const outputBtn = document.getElementById("nslModelOutputBtn");
  if (outputBtn) {
    outputBtn.addEventListener("click", () => {
      if (window.nslData?.riskRatings?.length) {
        openModelOutputPanel();
      } else {
        alert("Please complete the Risk Assessment and click Confirm & Continue before accessing the Model Output.");
      }
    });
  }

  // Download output button (if exists)
  const downloadBtn = document.getElementById("downloadModelOutputBtn");
  if (downloadBtn) downloadBtn.addEventListener("click", downloadModelOutput);
});
