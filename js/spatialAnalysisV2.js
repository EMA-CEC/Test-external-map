// ---------------------------------------------------------
// Spatial Analysis V2
// - Select shape (drawn or geojson feature)
// - Input buffers (m) for CEC + sensitive receptors
// - Optional filters: Status + Date range for CEC results
// - Filter map to show matching CEC points
// - Show results modal + export PDF (true PDF via jsPDF + AutoTable)
// ---------------------------------------------------------

(function () {

  const SENSITIVE_RECEPTORS = [
    "Aripo Savannas",
    "Caroni Swamp",
    "Forest Reserve",
    "Matura National Park",
    "Nariva Swamp"
  ];

  const OTHER_INFO_GROUPS = [
    { name: "Municipality", layers: ["Municipality"], labelField: "NAME_1" },
    { name: "Watershed", layers: ["Trinidad Watersheds", "Tobago Watersheds"], labelField: { "Trinidad Watersheds": "NAME", "Tobago Watersheds": "WATERSHED" } },
    { name: "Ecological Susceptibility", layers: ["Ecological Susceptibility"], labelField: "Class" },
    { name: "Geological Susceptibility", layers: ["Geological Susceptibility"], labelField: "Class" },
    { name: "Hydrogeology", layers: ["Hydrogeology"], labelField: "ATTRIB" },
    { name: "Social Susceptibility", layers: ["Social Susceptibility"], labelField: "Class" },
    { name: "TCPD Policy", layers: ["Trinidad TCPD Policy", "Tobago TCPD Policy"], labelField: "Class_Name" }
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function getUTMConverter() {
    return window.convertUTMToLatLonSmart || window.convertUTMToLatLon;
  }

  function toMeters(val) {
    const n = parseFloat(val);
    if (isNaN(n) || n < 0) return 0;
    return n;
  }

  // ---------------------------------------------------------
  // ✅ NEW: Optional parameters filters for spatial CEC results
  // Matches Filter Panel behavior conceptually
  // ---------------------------------------------------------
  function applySpatialOptionalCECFilters(cecRows) {
    const startDate = document.getElementById("saStartDate")?.value || "";
    const endDate = document.getElementById("saEndDate")?.value || "";
    const status = document.getElementById("saStatusFilter")?.value || "";

    let output = [...cecRows];

    // ✅ Status filter (optional)
    if (status) {
      output = output.filter(r => {
        const s = (r["Application Determination"] || "").trim();
        return s.toLowerCase() === status.toLowerCase();
      });
    }

    // ✅ Date range filter (optional)
    // IMPORTANT: Ensure this field name matches your Google Sheet column.
    const DATE_FIELD = "Determination Date";

    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      output = output.filter(r => {
        const raw = r[DATE_FIELD];
        if (!raw) return false;

        const d = new Date(raw);
        if (isNaN(d.getTime())) return false;

        if (start && d < start) return false;
        if (end && d > end) return false;

        return true;
      });
    }

    return output;
  }

  // ---------------------------------------------------------
  // Feature labeling helpers (match map labeling)
  // ---------------------------------------------------------
  function getLabelFieldForLayer(layerName) {
    const cfg = geojsonLayers?.byName?.[layerName];
    if (cfg && cfg.labelField) return cfg.labelField;

    if (layerName === "Municipality") return "NAME_1";
    if (layerName === "Trinidad Watersheds") return "NAME";
    if (layerName === "Tobago Watersheds") return "WATERSHED";
    if (layerName === "Forest Reserve") return "NAME";
    return "NAME";
  }

  function getFeatureLabel(layerName, feature, index) {
    const props = feature?.properties || {};
    const field = getLabelFieldForLayer(layerName);

    let label = props[field];

    if (layerName === "Forest Reserve" && props.NAME) {
      label = props.NAME;
    }

    if (!label || label === "null") {
      label = `${layerName} Feature ${index + 1}`;
    }

    return String(label);
  }

// ---------------------------------------------------------
// Uploaded layer labeling helpers
// ---------------------------------------------------------
function getUploadedFeatureLabel(layerObj, feature, index) {
  const props = feature?.properties || {};

  // Common name-like fields first
  const candidates = [
    "NAME", "Name", "name",
    "TITLE", "Title", "title",
    "LABEL", "Label", "label",
    "ID", "Id", "id",
    "OBJECTID", "ObjectID", "objectid",
    "FID", "fid"
  ];

  for (const k of candidates) {
    const v = props[k];
    if (v != null && String(v).trim() !== "" && String(v).toLowerCase() !== "null") {
      return String(v);
    }
  }

  // If layer is styled by category field, try that next
  const styledField = layerObj?.style?.field;
  if (styledField && props[styledField] != null) {
    const v = props[styledField];
    if (String(v).trim() !== "" && String(v).toLowerCase() !== "null") {
      return `${styledField}: ${v}`;
    }
  }

  // Fallback: first property value if exists
  const keys = Object.keys(props);
  if (keys.length) {
    const k = keys[0];
    const v = props[k];
    if (v != null && String(v).trim() !== "" && String(v).toLowerCase() !== "null") {
      return `${k}: ${v}`;
    }
  }

  return `${layerObj?.name || "Uploaded Layer"} Feature ${index + 1}`;
}

  // ---------------------------------------------------------
  // Analysis target builder (returns a Turf feature)
  // ---------------------------------------------------------
  function getSelectedAnalysisFeature() {
    const source = $("analysisSourceSelect")?.value || "drawn";

    if (source === "drawn") {
      const shapeId = $("analysisPrimarySelect")?.value;
      const item = window.drawnShapesStore?.find(s => s.id === shapeId);
      if (!item) return null;
      return item.layer.toGeoJSON();
    }

    if (source === "geojson") {
      const layerName = $("analysisPrimarySelect")?.value;
      const idx = parseInt($("analysisFeatureSelect")?.value || "", 10);
      if (!layerName || isNaN(idx)) return null;

      const layer = geojsonLayers?.byName?.[layerName]?.loadedLayer;
      if (!layer) return null;

      const features = [];
      layer.eachLayer(l => features.push(l.toGeoJSON()));

      return features[idx] || null;
    }

    if (source === "uploaded") {
        const layerId = $("analysisPrimarySelect")?.value;
        if (!layerId) return null;

        const layerObj = window.UserUploadManager?.layers?.[layerId];
        if (!layerObj) return null;

        const features = layerObj.geojson?.features || [];
        if (!features.length) return null;

        const rawIdx = $("analysisFeatureSelect")?.value || "";
        const idx = parseInt(rawIdx, 10);

        // If uploaded layer contains only 1 feature, allow analysis without feature selection
        if (isNaN(idx)) {
            return (features.length === 1) ? features[0] : null;
        }

        return features[idx] || null;
    }

    return null;
  }

  // ---------------------------------------------------------
  // UI population functions
  // ---------------------------------------------------------
  function populatePrimarySelect() {
    const source = $("analysisSourceSelect")?.value || "drawn";
    const primary = $("analysisPrimarySelect");
    const featureSelect = $("analysisFeatureSelect");

    if (!primary || !featureSelect) return;

    primary.innerHTML = "";
    featureSelect.innerHTML = `<option value="">-- select feature --</option>`;
    featureSelect.disabled = true;

    if (source === "drawn") {
      const shapes = window.drawnShapesStore || [];
      if (!shapes.length) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "No drawn shapes available";
        primary.appendChild(opt);
        return;
      }

      shapes.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name || s.defaultName;
        primary.appendChild(opt);
      });

      featureSelect.disabled = true;
      return;
    }

    if (source === "uploaded") {
    const mgr = window.UserUploadManager;

    const uploaded = (typeof mgr?.getAllLayerObjects === "function")
        ? mgr.getAllLayerObjects()
        : Object.values(mgr?.layers || {});

    const usable = uploaded.filter(o => o?.geojson?.features?.length && o.active !== false);

    if (!usable.length) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "No uploaded layers available";
        primary.appendChild(opt);
        featureSelect.disabled = true;
        return;
    }

    usable.forEach(o => {
        const opt = document.createElement("option");
        opt.value = o.id;
        opt.textContent = o.name || o.id;
        primary.appendChild(opt);
    });

    featureSelect.disabled = false;
    populateFeatureSelect();
    return;
    }

    if (source === "geojson") {
      const all = geojsonLayers || [];
      if (!all.length) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "No GeoJSON layers available";
        primary.appendChild(opt);
        return;
      }

      all.forEach(l => {
        const opt = document.createElement("option");
        opt.value = l.name;
        opt.textContent = l.name;
        primary.appendChild(opt);
      });

      featureSelect.disabled = false;
      populateFeatureSelect();
    }
  }

function populateFeatureSelect() {
  const source = $("analysisSourceSelect")?.value || "drawn";
  const primaryValue = $("analysisPrimarySelect")?.value;
  const featureSelect = $("analysisFeatureSelect");
  if (!primaryValue || !featureSelect) return;

  featureSelect.innerHTML = "";

  // -------------------------
  // GeoJSON (repo) layers
  // -------------------------
  if (source === "geojson") {
    const layerName = primaryValue;

    const layer = geojsonLayers?.byName?.[layerName]?.loadedLayer;
    if (!layer) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Layer not loaded";
      featureSelect.appendChild(opt);
      featureSelect.disabled = true;
      return;
    }

    const features = [];
    layer.eachLayer(l => features.push(l.toGeoJSON()));

    if (!features.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No features found";
      featureSelect.appendChild(opt);
      featureSelect.disabled = true;
      return;
    }

    features.forEach((f, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = getFeatureLabel(layerName, f, idx);
      featureSelect.appendChild(opt);
    });

    featureSelect.disabled = false;
    return;
  }

  // -------------------------
  // Uploaded layers
  // -------------------------
  if (source === "uploaded") {
    const layerId = primaryValue;
    const layerObj = window.UserUploadManager?.layers?.[layerId];

    if (!layerObj?.geojson?.features?.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No features found";
      featureSelect.appendChild(opt);
      featureSelect.disabled = true;
      return;
    }

    const feats = layerObj.geojson.features;

    // If only 1 feature, pre-select it and disable selector
    if (feats.length === 1) {
      const opt = document.createElement("option");
      opt.value = "0";
      opt.textContent = getUploadedFeatureLabel(layerObj, feats[0], 0);
      featureSelect.appendChild(opt);
      featureSelect.value = "0";
      featureSelect.disabled = true;
      return;
    }

    // Multiple features → allow choosing one
    feats.forEach((f, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = getUploadedFeatureLabel(layerObj, f, idx);
      featureSelect.appendChild(opt);
    });

    featureSelect.disabled = false;
    return;
  }

  // Drawn shapes do not require a feature list
  featureSelect.innerHTML = `<option value="">-- select feature --</option>`;
  featureSelect.disabled = true;
}

  // Expose refresh function for shapes manager
  window.refreshSpatialAnalysisSelectors = function () {
    populatePrimarySelect();
  };

  // ---------------------------------------------------------
  // Core analysis computations
  // ---------------------------------------------------------
  function computeNearbyCECs(targetFeature, bufferMeters) {

    const dataset = window.allCECData;


    const converter = getUTMConverter();
    if (!converter || !dataset) return [];

    const shape = targetFeature;

    // buffer for CEC
    let buffered = null;
    if (bufferMeters > 0) {
      buffered = turf.buffer(shape, bufferMeters / 1000, { units: "kilometers" });
    }

    const results = [];

    dataset.forEach(item => {
      const easting = parseFloat(item["Easting"]);
      const northing = parseFloat(item["Northing"]);
      if (isNaN(easting) || isNaN(northing)) return;

      const [lat, lon] = converter(easting, northing);
      if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return;

      const pt = turf.point([lon, lat]);

      let isMatch = false;

      // Polygon selection
      if (shape.geometry.type === "Polygon" || shape.geometry.type === "MultiPolygon") {
        isMatch =
          turf.booleanPointInPolygon(pt, shape) ||
          (buffered ? turf.booleanPointInPolygon(pt, buffered) : false);
      } else {
        // Point/Line selection -> only meaningful with buffer
        isMatch = buffered ? turf.booleanPointInPolygon(pt, buffered) : false;
      }

      if (isMatch) {
        results.push(item);
      }
    });

    return results;
  }

  function computeSensitiveReceptors(targetFeature, receptorBufferMeters) {
    const shape = targetFeature;

    // buffer for receptors
    const receptorBuffer = receptorBufferMeters > 0
      ? turf.buffer(shape, receptorBufferMeters / 1000, { units: "kilometers" })
      : null;

    const rows = [];

    SENSITIVE_RECEPTORS.forEach(name => {
      const layer = geojsonLayers.byName?.[name]?.loadedLayer;
      if (!layer) return;

      layer.eachLayer(l => {
        const feature = l.toGeoJSON();
        if (!feature?.geometry) return;

        const intersectsShape = turf.booleanIntersects(shape, feature);
        const intersectsBuffer = receptorBuffer ? turf.booleanIntersects(receptorBuffer, feature) : false;

        if (!intersectsShape && !intersectsBuffer) return;

        let label = name;
        if (name === "Forest Reserve") {
          const subname = feature.properties?.NAME;
          if (subname && subname !== "null") label = `Forest Reserve - ${subname}`;
        }

        let distance = "within boundaries";

        if (!intersectsShape && intersectsBuffer) {
          try {
            const shapeLine = (shape.geometry.type === "Polygon" || shape.geometry.type === "MultiPolygon")
              ? turf.polygonToLine(shape)
              : null;

            const featureLine = (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon")
              ? turf.polygonToLine(feature)
              : null;

            if (shapeLine && featureLine) {
              const ptOnShape = turf.nearestPointOnLine(shapeLine, turf.centerOfMass(feature).geometry.coordinates);
              const ptOnReceptor = turf.nearestPointOnLine(featureLine, turf.centerOfMass(shape).geometry.coordinates);
              const d = turf.distance(ptOnShape, ptOnReceptor, { units: "kilometers" });
              distance = Math.round(d * 1000) + " m";
            } else {
              distance = "distance unavailable";
            }
          } catch (e) {
            distance = "distance unavailable";
          }
        }

        rows.push({ receptor: label, distance });
      });
    });

    // remove duplicates
    const unique = [];
    const seen = new Set();

    rows.forEach(r => {
      const key = `${r.receptor}|${r.distance}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(r);
      }
    });

    return unique;
  }

  function computeOtherInformation(targetFeature) {
    const shape = targetFeature;
    const results = [];

    OTHER_INFO_GROUPS.forEach(group => {
      const vals = new Set();

      group.layers.forEach(layerName => {
        const layer = geojsonLayers.byName?.[layerName]?.loadedLayer;
        if (!layer) return;

        const labelField = typeof group.labelField === "string"
          ? group.labelField
          : group.labelField[layerName];

        layer.eachLayer(l => {
          const feature = l.toGeoJSON();
          if (turf.booleanIntersects(shape, feature)) {
            const v = feature.properties?.[labelField];
            if (v && v !== "null") vals.add(v);
          }
        });
      });

      results.push({
        group: group.name,
        values: Array.from(vals).join(", ") || "None"
      });
    });

    return results;
  }

  // ---------------------------------------------------------
  // Apply filtering to map points after analysis
  // ---------------------------------------------------------
  function applyResultsToMap(cecResults) {
    window.filteredCECData = cecResults.slice();

    if (typeof window.renderCECData === "function") {
      renderCECData(window.filteredCECData);
    }

    const stats = document.getElementById("filterStats");
    if (stats) {
      stats.textContent = `Showing ${window.filteredCECData.length} applications (spatial analysis results)`;
    }
  }

  // ---------------------------------------------------------
  // Results Modal UI + PDF Export
  // ---------------------------------------------------------
  let lastSpatialResults = null;

  function openResultsModal(results) {
    lastSpatialResults = results;

    const modal = $("spatialResultsModal");
    const content = $("spatialResultsContent");

    if (!modal || !content) return;

    content.innerHTML = buildResultsHTML(results);
    modal.classList.remove("hidden");
  }

  function closeResultsModal() {
    const modal = $("spatialResultsModal");
    if (modal) modal.classList.add("hidden");
  }

  function buildResultsHTML(results) {
    const cecBuffer = results.meta.cecBufferMeters;
    const receptorBuffer = results.meta.receptorBufferMeters;

    const cecRows = results.cecs.map(r => `
      <tr>
        <td>${r["CEC Reference"] || "N/A"}</td>
        <td>${r["Year"] || "N/A"}</td>
        <td>${r["Application Determination"] || "Pending"}</td>
        <td>${r["Activity Description"] || "N/A"}</td>
      </tr>
    `).join("");

    const receptorRows = results.receptors.map(r => `
      <tr>
        <td>${r.receptor}</td>
        <td>${r.distance}</td>
      </tr>
    `).join("");

    const otherRows = results.otherInfo.map(r => `
      <tr>
        <td><strong>${r.group}</strong></td>
        <td>${r.values}</td>
      </tr>
    `).join("");

    return `
      <h3>Surrounding CECs within ${cecBuffer} m</h3>
      <div class="results-table-wrap">
        <table class="results-table">
          <thead>
            <tr>
              <th>CEC Reference</th>
              <th>Year</th>
              <th>Status</th>
              <th>Activity Description</th>
            </tr>
          </thead>
          <tbody>
            ${cecRows || `<tr><td colspan="4">No CECs found.</td></tr>`}
          </tbody>
        </table>
      </div>

      <hr class="section-divider" />

      <h3>Nearby/Intersecting Sensitive Receptors (within ${receptorBuffer} m)</h3>
      <div class="results-table-wrap">
        <table class="results-table">
          <thead>
            <tr>
              <th>Sensitive Receptor</th>
              <th>Distance</th>
            </tr>
          </thead>
          <tbody>
            ${receptorRows || `<tr><td colspan="2">No sensitive receptors found.</td></tr>`}
          </tbody>
        </table>
      </div>

      <hr class="section-divider" />

      <h3>Other Information</h3>
      <div class="results-table-wrap">
        <table class="results-table">
          <thead>
            <tr>
              <th>Layer</th>
              <th>Intersecting Property</th>
            </tr>
          </thead>
          <tbody>
            ${otherRows}
          </tbody>
        </table>
      </div>
    `;
  }

  function downloadPDF(results) {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
      alert("PDF library not loaded (jsPDF missing).");
      return;
    }

    const doc = new jsPDF("p", "mm", "a4");
    const margin = 14;
    let y = 14;

    const runAutoTable = (opts) => {
      if (typeof doc.autoTable === "function") {
        doc.autoTable(opts);
        return;
      }

      const at = window.jspdf_autotable;
      if (at) {
        const fn = at.default || at.autoTable || at;
        if (typeof fn === "function") {
          fn(doc, opts);
          return;
        }
      }

      throw new Error("AutoTable plugin not available.");
    };

    doc.setFontSize(14);
    doc.text("Spatial Analysis Results", margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.text(`CEC Buffer: ${results.meta.cecBufferMeters} m`, margin, y);
    y += 5;
    doc.text(`Sensitive Receptor Buffer: ${results.meta.receptorBufferMeters} m`, margin, y);
    y += 8;

    doc.setFontSize(12);
    doc.text(`Surrounding CECs within ${results.meta.cecBufferMeters} m`, margin, y);
    y += 4;

    runAutoTable({
      startY: y,
      head: [["CEC Reference", "Year", "Status", "Activity Description"]],
      body: (results.cecs && results.cecs.length)
        ? results.cecs.map(r => [
          r["CEC Reference"] || "N/A",
          r["Year"] || "N/A",
          r["Application Determination"] || "Pending",
          r["Activity Description"] || "N/A"
        ])
        : [["None", "—", "—", "No CECs found"]],
      styles: { fontSize: 8 },
      margin: { left: margin, right: margin }
    });

    y = (doc.lastAutoTable?.finalY ?? (y + 10)) + 8;

    doc.setFontSize(12);
    doc.text(`Nearby/Intersecting Sensitive Receptors (within ${results.meta.receptorBufferMeters} m)`, margin, y);
    y += 4;

    runAutoTable({
      startY: y,
      head: [["Sensitive Receptor", "Distance"]],
      body: (results.receptors && results.receptors.length)
        ? results.receptors.map(r => [r.receptor, r.distance])
        : [["None", "—"]],
      styles: { fontSize: 8 },
      margin: { left: margin, right: margin }
    });

    y = (doc.lastAutoTable?.finalY ?? (y + 10)) + 8;

    doc.setFontSize(12);
    doc.text("Other Information", margin, y);
    y += 4;

    runAutoTable({
      startY: y,
      head: [["Layer", "Intersecting Property"]],
      body: (results.otherInfo && results.otherInfo.length)
        ? results.otherInfo.map(r => [r.group, r.values])
        : [["None", "—"]],
      styles: { fontSize: 8 },
      margin: { left: margin, right: margin }
    });

    doc.save("spatial-analysis-results.pdf");
  }

  // ---------------------------------------------------------
  // Main "Run Analysis" handler
  // ---------------------------------------------------------
  async function runAnalysis() {
    if (!window.turf) {
      alert("Turf.js is missing. Spatial analysis cannot run.");
      return;
    }

    if (window.analysisLayersReadyPromise) {
      await window.analysisLayersReadyPromise;
    }

    const target = getSelectedAnalysisFeature();
    if (!target) {
      alert("Please select a valid shape / feature for analysis.");
      return;
    }

    const cecBufferMeters = toMeters($("cecBufferInput")?.value);
    const receptorBufferMeters = toMeters($("receptorBufferInput")?.value);

    // Raw spatial results
    const rawCECs = computeNearbyCECs(target, cecBufferMeters);

    // ✅ Apply optional filters (date range + status)
    const filteredCECs = applySpatialOptionalCECFilters(rawCECs);

    const receptorResults = computeSensitiveReceptors(target, receptorBufferMeters);
    const otherInfo = computeOtherInformation(target);

    // ✅ Apply final results to map
    applyResultsToMap(filteredCECs);

    const results = {
      meta: {
        cecBufferMeters,
        receptorBufferMeters
      },
      cecs: filteredCECs,
      receptors: receptorResults,
      otherInfo
    };

    lastSpatialResults = results;

    // enable show results
    const showBtn = $("showSpatialResultsBtn");
    if (showBtn) showBtn.disabled = false;

    const status = $("analysisStatusText");
    if (status) status.textContent = `Analysis complete: ${filteredCECs.length} CEC(s) found.`;
  }

  // ---------------------------------------------------------
  // Init UI events
  // ---------------------------------------------------------
  function initSpatialUI() {
    const sourceSel = $("analysisSourceSelect");
    const primarySel = $("analysisPrimarySelect");
    const featureSel = $("analysisFeatureSelect");
    const runBtn = $("runSpatialAnalysisBtn");
    const showBtn = $("showSpatialResultsBtn");

    if (!sourceSel || !primarySel || !featureSel || !runBtn || !showBtn) {
      console.warn("Spatial Analysis UI not fully present.");
      return;
    }

    sourceSel.addEventListener("change", () => {
      populatePrimarySelect();
    });

    // Refresh selector options when user adds/removes uploads
    window.addEventListener("userUploadLayersChanged", () => {
    if ($("analysisSourceSelect")?.value === "uploaded") {
        populatePrimarySelect();
    }
    });

    primarySel.addEventListener("change", () => {
    if (sourceSel.value === "geojson" || sourceSel.value === "uploaded") {
        populateFeatureSelect();
    }
    });

    runBtn.addEventListener("click", runAnalysis);

    showBtn.addEventListener("click", () => {
      if (!lastSpatialResults) return;
      openResultsModal(lastSpatialResults);
    });

    $("closeSpatialResultsBtn")?.addEventListener("click", closeResultsModal);

    const clearBtn = $("clearSpatialAnalysisBtn");
    if (clearBtn) {
    clearBtn.addEventListener("click", () => {

        lastSpatialResults = null;

        window.filteredCECData = [];
        if (typeof window.renderCECData === "function") {
        renderCECData(window.allCECData);
        }

        const showBtn = $("showSpatialResultsBtn");
        if (showBtn) showBtn.disabled = true;

        const status = $("analysisStatusText");
        if (status) status.textContent = "";

        if (typeof window.clearFilters === "function") {
        window.clearFilters();
        }
    });
    }

    const downloadBtn = $("downloadSpatialPDFBtn");
    if (downloadBtn) {
      downloadBtn.addEventListener("click", () => {
        if (!lastSpatialResults) {
          alert("No spatial analysis results available to export yet.");
          return;
        }

        if (!window.jspdf || !window.jspdf.jsPDF) {
          alert("PDF library not loaded. Please ensure jsPDF scripts are included in index.html.");
          console.error("❌ jsPDF missing:", window.jspdf);
          return;
        }

        try {
          downloadPDF(lastSpatialResults);
        } catch (err) {
          console.error("❌ PDF export failed:", err);
          alert("PDF export failed. Check console for details.");
        }
      });
    }

    // Initial population
    populatePrimarySelect();
  }

  window.initSpatialAnalysisV2 = initSpatialUI;

})();
