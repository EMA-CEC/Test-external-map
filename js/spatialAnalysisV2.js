// ---------------------------------------------------------
// Spatial Analysis V2
// - Select shape (drawn or geojson feature)
// - Input buffers (m) for CEC + sensitive receptors
// - Optional filters: Status + Date range for CEC results
// - Filter map to show matching CEC points
// - Show results modal + export PDF (true PDF via jsPDF + AutoTable)
// - Has a lot of html for the elevation analysis as well as this was a quick add in. maybe can be cleaned up later on
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
  // Layer properties (geometry readout)
  // - All coordinates reported as UTM WGS84 Zone 20N
  // ---------------------------------------------------------
  function fmtNum(n, decimals = 2) {
    if (n == null || !isFinite(n)) return "—";
    return Number(n).toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function slopePctToRatio(gradePct) {
    if (gradePct == null || !isFinite(gradePct)) return "—";
    const g = Math.abs(Number(gradePct));
    if (g < 0.0001) return "Flat (≈ 1:∞)";
    const n = 100 / g; // 1 : n
    if (n >= 1000) return `1:${fmtNum(n, 0)} (very gentle)`;
    if (n >= 100) return `1:${fmtNum(n, 0)}`;
    if (n >= 10) return `1:${fmtNum(n, 1)}`;
    return `1:${fmtNum(n, 2)}`;
  }

  function fmtMeters(m) {
    if (m == null || !isFinite(m)) return "—";
    if (m >= 1000) return `${fmtNum(m / 1000, 2)} km (${fmtNum(m, 0)} m)`;
    return `${fmtNum(m, 0)} m`;
  }

  function fmtArea(m2) {
    if (m2 == null || !isFinite(m2)) return "—";
    const ha = m2 / 10000;
    if (ha >= 1) return `${fmtNum(ha, 2)} ha (${fmtNum(m2, 0)} m²)`;
    return `${fmtNum(m2, 0)} m²`;
  }

  function lonLatToUTM(lon, lat) {
    // utils.js defines convertLatLonToUTM (WGS84 -> UTM Zone 20N)
    if (typeof window.convertLatLonToUTM !== "function") return { easting: null, northing: null };
    const { easting, northing } = window.convertLatLonToUTM(lat, lon);
    return { easting, northing };
  }

  function firstAndLastCoordsOfLine(geom) {
    // Supports LineString and MultiLineString
    if (!geom) return null;
    if (geom.type === "LineString") {
      const c = geom.coordinates || [];
      if (c.length < 2) return null;
      return { a: c[0], b: c[c.length - 1] };
    }
    if (geom.type === "MultiLineString") {
      const parts = geom.coordinates || [];
      const flat = parts.flat();
      if (flat.length < 2) return null;
      return { a: flat[0], b: flat[flat.length - 1] };
    }
    return null;
  }

  function computeLayerProperties(targetFeature) {
    const geom = targetFeature?.geometry;
    if (!geom) return { type: "Unknown", rows: [] };

    const type = geom.type;

    // POINT
    if (type === "Point") {
      const [lon, lat] = geom.coordinates;
      const utm = lonLatToUTM(lon, lat);
      return {
        type: "Point",
        rows: [
          { k: "CRS", v: "UTM WGS 1984 Zone 20N" },
          { k: "Easting", v: fmtNum(utm.easting, 2) },
          { k: "Northing", v: fmtNum(utm.northing, 2) }
        ]
      };
    }

    // LINE
    if (type === "LineString" || type === "MultiLineString") {
      const ends = firstAndLastCoordsOfLine(geom);
      const a = ends?.a;
      const b = ends?.b;

      const aU = a ? lonLatToUTM(a[0], a[1]) : { easting: null, northing: null };
      const bU = b ? lonLatToUTM(b[0], b[1]) : { easting: null, northing: null };

      const dE = (bU.easting ?? 0) - (aU.easting ?? 0);
      const dN = (bU.northing ?? 0) - (aU.northing ?? 0);
      const labelBy = Math.abs(dE) >= Math.abs(dN) ? "E" : "N";

      let end1Label = "End 1";
      let end2Label = "End 2";

      if (labelBy === "E") {
        // West/East
        if ((aU.easting ?? 0) <= (bU.easting ?? 0)) {
          end1Label = "Western End";
          end2Label = "Eastern End";
        } else {
          end1Label = "Eastern End";
          end2Label = "Western End";
        }
      } else {
        // South/North
        if ((aU.northing ?? 0) <= (bU.northing ?? 0)) {
          end1Label = "Southern End";
          end2Label = "Northern End";
        } else {
          end1Label = "Northern End";
          end2Label = "Southern End";
        }
      }

      // Compute length
      let lenM = null;
      try {
        // turf.length returns in kilometers by default
        const km = turf.length(targetFeature, { units: "kilometers" });
        lenM = km * 1000;
      } catch (_) {
        lenM = null;
      }

      return {
        type: "Line",
        rows: [
          { k: "CRS", v: "UTM WGS 1984 Zone 20N" },
          { k: `${end1Label} (E,N)`, v: `${fmtNum(aU.easting, 2)}, ${fmtNum(aU.northing, 2)}` },
          { k: `${end2Label} (E,N)`, v: `${fmtNum(bU.easting, 2)}, ${fmtNum(bU.northing, 2)}` },
          { k: "Total Length", v: fmtMeters(lenM) }
        ]
      };
    }

    // POLYGON
    if (type === "Polygon" || type === "MultiPolygon") {
      let bbox = null;
      let perimeterM = null;
      let areaM2 = null;

      try {
        bbox = turf.bbox(targetFeature); // [minX, minY, maxX, maxY] (lon/lat)
      } catch (_) {
        bbox = null;
      }

      try {
        areaM2 = turf.area(targetFeature);
      } catch (_) {
        areaM2 = null;
      }

      try {
        const outline = turf.polygonToLine(targetFeature);
        const km = turf.length(outline, { units: "kilometers" });
        perimeterM = km * 1000;
      } catch (_) {
        perimeterM = null;
      }

      // Convert bbox corners to UTM
      let utmBboxStr = "—";
      if (bbox && bbox.length === 4) {
        const [minLon, minLat, maxLon, maxLat] = bbox;
        const sw = lonLatToUTM(minLon, minLat);
        const ne = lonLatToUTM(maxLon, maxLat);
        // Report as min/max Easting/Northing
        utmBboxStr = `E: ${fmtNum(sw.easting, 2)} to ${fmtNum(ne.easting, 2)}; N: ${fmtNum(sw.northing, 2)} to ${fmtNum(ne.northing, 2)}`;
      }

      return {
        type: "Polygon",
        rows: [
          { k: "CRS", v: "UTM WGS 1984 Zone 20N" },
          { k: "Bounding Box (UTM)", v: utmBboxStr },
          { k: "Perimeter", v: fmtMeters(perimeterM) },
          { k: "Area", v: fmtArea(areaM2) }
        ]
      };
    }

    // Fallback for any other geometry
    return {
      type,
      rows: [{ k: "Geometry Type", v: type }]
    };
  }

  // ---------------------------------------------------------
  // Optional parameters filters for spatial CEC results
  // Matches Filter Panel behavior conceptually
  // ---------------------------------------------------------
  function applySpatialOptionalCECFilters(cecRows) {
    const startDate = document.getElementById("saStartDate")?.value || "";
    const endDate = document.getElementById("saEndDate")?.value || "";
    const status = document.getElementById("saStatusFilter")?.value || "";

    let output = [...cecRows];

    // Status filter
    if (status) {
      output = output.filter(r => {
        const s = (r["Application Determination"] || "").trim();
        return s.toLowerCase() === status.toLowerCase();
      });
    }

    // Date range filter
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

  let _elevChartInstance = null;
  let _elevChartMode = "elev";

  function renderElevationChart(elevation, mode = "elev") {
    const canvas = document.getElementById("elevChart");
    const titleEl = document.getElementById("elevChartTitle");
    if (!canvas) return;

    if (typeof window.Chart !== "function") {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = "12px sans-serif";
      ctx.fillText("Chart.js not loaded (no chart).", 10, 20);
      return;
    }

    if (_elevChartInstance) {
      _elevChartInstance.destroy();
      _elevChartInstance = null;
    }

    const chartObj =
      (mode === "slope") ? elevation?.slopeChart : elevation?.chart;

    if (!chartObj) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = "12px sans-serif";
      ctx.fillText("No chart available for this selection.", 10, 20);
      if (titleEl) titleEl.textContent = "";
      return;
    }

    if (titleEl) titleEl.textContent = chartObj.title || "";

    const ctx = canvas.getContext("2d");

    if (chartObj.kind === "profile") {
      const pts = chartObj.points || [];
      _elevChartInstance = new Chart(ctx, {
        type: "line",
        data: {
          labels: pts.map(p => (p.distM / 1000).toFixed(2)),
          datasets: [{
            label: "Elevation (m)",
            data: pts.map(p => p.z)
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: true } },
          scales: {
            x: { title: { display: true, text: "Distance (km)" } },
            y: { title: { display: true, text: "Elevation (m)" } }
          }
        }
      });
      return;
    }

    if (chartObj.kind === "histogram") {
      _elevChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
          labels: chartObj.labels,
          datasets: [{
            label: chartObj.title || "Distribution",
            data: chartObj.counts
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: true } },
          scales: {
            x: { title: { display: true, text: chartObj.xTitle || "Bins" } },
            y: { title: { display: true, text: chartObj.yTitle || "Count" } }
          }
        }
      });
      return;
    }

    if (chartObj.kind === "bar-single") {
      _elevChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
          labels: [chartObj.label],
          datasets: [{
            label: chartObj.label,
            data: [chartObj.value]
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { title: { display: true, text: "m" } }
          }
        }
      });
      return;
    }
   }

    function initElevationChartToggle(elevation) {
      const wrap = document.getElementById("elevChartToggleWrap");
      const btnElev = document.getElementById("btnElevChart");
      const btnSlope = document.getElementById("btnSlopeChart");

      if (!wrap || !btnElev || !btnSlope) return;

      // Only show toggle if BOTH histograms exist (polygon case)
      const hasElevHist = elevation?.chart?.kind === "histogram";
      const hasSlopeHist = elevation?.slopeChart?.kind === "histogram";

      if (!(hasElevHist && hasSlopeHist)) {
        wrap.style.display = "none";
        _elevChartMode = "elev";
        return;
      }

      wrap.style.display = "flex";

      // default mode
      _elevChartMode = "elev";
      renderElevationChart(elevation, _elevChartMode);

      const setActive = () => {
        // simple active state without CSS dependencies
        btnElev.disabled = (_elevChartMode === "elev");
        btnSlope.disabled = (_elevChartMode === "slope");
      };
      setActive();

      btnElev.onclick = () => {
        _elevChartMode = "elev";
        renderElevationChart(elevation, _elevChartMode);
        setActive();
      };

      btnSlope.onclick = () => {
        _elevChartMode = "slope";
        renderElevationChart(elevation, _elevChartMode);
        setActive();
      };
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

    renderElevationChart(results.elevation, "elev");
    initElevationChartToggle(results.elevation);
  }

  function closeResultsModal() {
    const modal = $("spatialResultsModal");
    if (modal) modal.classList.add("hidden");
  }

  function buildResultsHTML(results) {
    const cecBuffer = results.meta.cecBufferMeters;
    const receptorBuffer = results.meta.receptorBufferMeters;

    const elev = results.elevation;
    const elevRows = (elev?.rows || []).map(r => `
      <tr>
        <td><strong>${r.k}</strong></td>
        <td>${r.v}</td>
      </tr>
    `).join("");

    const lp = results.layerProperties;
    const lpRows = (lp?.rows || []).map(r => `
      <tr>
        <td><strong>${r.k}</strong></td>
        <td>${r.v}</td>
      </tr>
    `).join("");

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

        <h3>Layer Properties (${lp?.type || "—"})</h3>

      <div class="results-table-wrap">
        <table class="results-table">
          <thead>
            <tr>
              <th style="width: 35%">Property</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            ${lpRows || `<tr><td colspan="2">No layer properties available.</td></tr>`}
          </tbody>
        </table>
      </div>

      <hr class="section-divider" />
  
      <h3>Elevation Assessment (${elev?.type || "—"})</h3>

      <div class="results-table-wrap">
        <table class="results-table">
          <thead>
            <tr>
              <th style="width: 35%">Metric</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            ${elevRows || `<tr><td colspan="2">No elevation results available.</td></tr>`}
          </tbody>
        </table>
      </div>

      <div id="elevChartToggleWrap" style="margin-top:10px; display:flex; gap:8px; align-items:center;">
        <button id="btnElevChart" type="button">Elevation histogram</button>
        <button id="btnSlopeChart" type="button">Slope histogram</button>
        <span id="elevChartTitle" style="font-size:12px; opacity:0.8;"></span>
      </div>

      <div style="margin-top:10px;">
        <canvas id="elevChart" height="160"></canvas>
      </div>

      <hr class="section-divider" />
    `;
  }

  async function makeChartImage(chartObj, widthPx = 900, heightPx = 350) {
    if (!chartObj || typeof window.Chart !== "function") return null;

    // offscreen canvas
    const c = document.createElement("canvas");
    c.width = widthPx;
    c.height = heightPx;
    const ctx = c.getContext("2d");

    // build a chart config matching renderElevationChart logic
    let config = null;

    if (chartObj.kind === "profile") {
      const pts = chartObj.points || [];
      config = {
        type: "line",
        data: {
          labels: pts.map(p => (p.distM / 1000).toFixed(2)),
          datasets: [{
            label: "Elevation (m)",
            data: pts.map(p => p.z)
          }]
        },
        options: {
          responsive: false,
          animation: false,
          plugins: { legend: { display: true } },
          scales: {
            x: { title: { display: true, text: "Distance (km)" } },
            y: { title: { display: true, text: "Elevation (m)" } }
          }
        }
      };
    } else if (chartObj.kind === "histogram") {
      config = {
        type: "bar",
        data: {
          labels: chartObj.labels,
          datasets: [{
            label: chartObj.title || "Distribution",
            data: chartObj.counts
          }]
        },
        options: {
          responsive: false,
          animation: false,
          plugins: { legend: { display: true } },
          scales: {
            x: { title: { display: true, text: chartObj.xTitle || "Bins" } },
            y: { title: { display: true, text: chartObj.yTitle || "Count" } }
          }
        }
      };
    } else if (chartObj.kind === "bar-single") {
      config = {
        type: "bar",
        data: {
          labels: [chartObj.label],
          datasets: [{
            label: chartObj.label,
            data: [chartObj.value]
          }]
        },
        options: {
          responsive: false,
          animation: false,
          plugins: { legend: { display: false } },
          scales: { y: { title: { display: true, text: "m" } } }
        }
      };
    }

    if (!config) return null;

    const tmp = new Chart(ctx, config);
    // Allow Chart to draw synchronously (animation disabled)
    tmp.update();
    const dataUrl = c.toDataURL("image/png", 1.0);
    tmp.destroy();

    return dataUrl;
  }

  function ensurePdfPageSpace(doc, y, neededMm, margin = 14) {
    const pageHeight = doc.internal.pageSize.getHeight();
    if (y + neededMm <= pageHeight - margin) return y;
    doc.addPage();
    return margin;
  }

async function downloadPDF(results) {
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

  y = (doc.lastAutoTable?.finalY ?? (y + 10)) + 8;

  if (results.layerProperties && Array.isArray(results.layerProperties.rows)) {
    doc.setFontSize(12);
    doc.text(`Layer Properties (${results.layerProperties.type || "—"})`, margin, y);
    y += 4;

    runAutoTable({
      startY: y,
      head: [["Property", "Value"]],
      body: results.layerProperties.rows.length
        ? results.layerProperties.rows.map(r => [r.k, r.v])
        : [["—", "No layer properties available"]],
      styles: { fontSize: 8 },
      margin: { left: margin, right: margin }
    });

    y = (doc.lastAutoTable?.finalY ?? (y + 10)) + 8;
  }

    // Elevation Assessment section (table + chart snapshot(s))
    if (results.elevation && Array.isArray(results.elevation.rows)) {
      y = ensurePdfPageSpace(doc, y, 20, margin);

      doc.setFontSize(12);
      doc.text(`Elevation Assessment (${results.elevation.type || "—"})`, margin, y);
      y += 4;

      runAutoTable({
        startY: y,
        head: [["Metric", "Value"]],
        body: results.elevation.rows.length
          ? results.elevation.rows.map(r => [r.k, r.v])
          : [["—", "No elevation results available"]],
        styles: { fontSize: 8 },
        margin: { left: margin, right: margin }
      });

      y = (doc.lastAutoTable?.finalY ?? (y + 10)) + 6;

      // Build chart images
      const elevChartObj = results.elevation.chart || null;
      const slopeChartObj = results.elevation.slopeChart || null;

      // If polygon has both histograms -> include both
      // Otherwise include whichever exists
      const images = [];

      try {
        if (elevChartObj) {
          const img = await makeChartImage(elevChartObj);
          if (img) images.push({ title: "Elevation Chart", dataUrl: img });
        }

        if (slopeChartObj) {
          const img2 = await makeChartImage(slopeChartObj);
          if (img2) images.push({ title: "Slope Chart", dataUrl: img2 });
        }
      } catch (e) {
        console.warn("Chart image generation failed:", e);
      }

      // Add images to PDF
      for (const im of images) {
        // Reserve ~70mm height for chart image
        y = ensurePdfPageSpace(doc, y, 80, margin);

        doc.setFontSize(10);
        doc.text(im.title, margin, y);
        y += 3;

        // Fit chart to page width
        const pageWidth = doc.internal.pageSize.getWidth();
        const imgW = pageWidth - margin * 2;
        const imgH = 60; // mm (nice compact chart height)

        doc.addImage(im.dataUrl, "PNG", margin, y, imgW, imgH);
        y += imgH + 8;
      }
    }
  
  doc.save("spatial-analysis-results.pdf");
}

  // ---------------------------------------------------------
  // Elevation Assessment (DEM sampling)
  // ---------------------------------------------------------
  const DEM_URL = "https://cdn.jsdelivr.net/gh/EMA-CEC/Elevation@main/dem_web.tif";

  let _demCachePromise = null;

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function mean(arr) {
    const v = arr.filter(x => x != null && isFinite(x));
    if (!v.length) return null;
    return v.reduce((a, b) => a + b, 0) / v.length;
  }

  function minMax(arr) {
    const v = arr.filter(x => x != null && isFinite(x));
    if (!v.length) return { min: null, max: null };
    return { min: Math.min(...v), max: Math.max(...v) };
  }

  function isProjectedUTM32620(geoKeys) {
    // Most robust quick check for DEM CRS
    return geoKeys && geoKeys.ProjectedCSTypeGeoKey === 32620;
  }

  async function getDem() {
    if (_demCachePromise) return _demCachePromise;

    _demCachePromise = (async () => {
      const GT = window.GeoTIFF;
      if (!GT || typeof GT.fromUrl !== "function") {
        throw new Error("GeoTIFF library not loaded. Check index.html includes geotiff.min.js.");
      }

      const tiff = await GT.fromUrl(DEM_URL);
      const image = await tiff.getImage();

      const bbox = image.getBoundingBox(); 
      const width = image.getWidth();
      const height = image.getHeight();
      const geoKeys = image.getGeoKeys?.() || {};
      const noData = (typeof image.getGDALNoData === "function") ? image.getGDALNoData() : null;


      const pixelSizeX = (bbox[2] - bbox[0]) / width;
      const pixelSizeY = (bbox[3] - bbox[1]) / height;

      return {
        tiff,
        image,
        bbox,
        width,
        height,
        geoKeys,
        noData,
        pixelSizeX,
        pixelSizeY,
        isUTM32620: isProjectedUTM32620(geoKeys)
      };
    })();

    return _demCachePromise;
  }

  function coordToPixel(dem, x, y) {
    const [minX, minY, maxX, maxY] = dem.bbox;

    const col = Math.floor(((x - minX) / (maxX - minX)) * dem.width);
    const row = Math.floor(((maxY - y) / (maxY - minY)) * dem.height);

    return {
      col: clamp(col, 0, dem.width - 1),
      row: clamp(row, 0, dem.height - 1)
    };
  }

  async function readPixel(dem, col, row) {
    const c = clamp(col, 0, dem.width - 1);
    const r = clamp(row, 0, dem.height - 1);

    const rasters = await dem.image.readRasters({
      window: [c, r, c + 1, r + 1]
    });

    const z = rasters?.[0]?.[0];

    if (z == null || !isFinite(z)) return null;
    if (dem.noData != null && Number(z) === Number(dem.noData)) return null;

    return Number(z);
  }

  function lonLatToDemXY(dem, lon, lat) {

    if (dem.isUTM32620 && typeof window.convertLatLonToUTM === "function") {
      const { easting, northing } = window.convertLatLonToUTM(lat, lon);
      return { x: easting, y: northing };
    }

    return { x: lon, y: lat };
  }

  function minSamplingStepFromDemMeters(demMeters) {
    // Rule of thumb: don’t sample finer than ~2 pixels
    const px = Math.max(demMeters.dx || 0, demMeters.dy || 0);
    if (!px || !isFinite(px)) return 25;
    return Math.max(25, 2 * px); // at least 25m, or 2 pixels
  }

  function metersPerDemPixel(dem, lon, lat) {

    if (dem.isUTM32620) {
      return { dx: Math.abs(dem.pixelSizeX), dy: Math.abs(dem.pixelSizeY) };
    }

    const latRad = (lat * Math.PI) / 180;
    const mPerDegX = 111320 * Math.cos(latRad);
    const mPerDegY = 110574;

    return {
      dx: Math.abs(dem.pixelSizeX) * mPerDegX,
      dy: Math.abs(dem.pixelSizeY) * mPerDegY
    };
  }

  async function sampleElevationAndSlopeAtLonLat(lon, lat) {
    const dem = await getDem();
    const { x, y } = lonLatToDemXY(dem, lon, lat);

    const { col, row } = coordToPixel(dem, x, y);

    const z = await readPixel(dem, col, row);
    if (z == null) return { z: null, slopeDeg: null, slopePct: null };

    // Slope estimate using forward differences: east and south neighbor
    const zE = await readPixel(dem, col + 1, row);
    const zS = await readPixel(dem, col, row + 1);

    // If neighbors missing, slope can't be computed reliably
    if (zE == null || zS == null) return { z, slopeDeg: null, slopePct: null };

    const { dx, dy } = metersPerDemPixel(dem, lon, lat);

    const dzdx = (zE - z) / (dx || 1);
    const dzdy = (zS - z) / (dy || 1);

    const slope = Math.sqrt(dzdx * dzdx + dzdy * dzdy);
    const slopeRad = Math.atan(slope);

    const slopeDeg = (slopeRad * 180) / Math.PI;
    const slopePct = slope * 100;

    return { z, slopeDeg, slopePct };
  }

  function pickSamplingStepMetersForLine(lengthM) {
    // Keep it fast but meaningful.
    // ~100–300 samples typically.
    const targetSamples = 200;
    const step = Math.max(25, lengthM / targetSamples);
    return clamp(step, 25, 200); // 25m..200m
  }

  function pickSamplingStepMetersForPolygon(areaM2) {
    // Very rough adaptive step so we don’t create thousands of samples.
    // Small polygons -> finer grid; large -> coarser
    if (!areaM2 || !isFinite(areaM2)) return 75;

    if (areaM2 < 50_000) return 25;        // < 5 ha
    if (areaM2 < 300_000) return 50;       // < 30 ha
    if (areaM2 < 2_000_000) return 100;    // < 200 ha
    return 200;                             // big polygons
  }

  function buildHistogram(values, bins = 10) {
    const v = values.filter(x => x != null && isFinite(x));
    if (!v.length) return null;

    const { min, max } = minMax(v);
    if (min == null || max == null) return null;

    // Edge case: flat values
    if (min === max) {
      return {
        labels: [`${min.toFixed(1)} m`],
        counts: [v.length],
        min, max
      };
    }

    const step = (max - min) / bins;
    const counts = new Array(bins).fill(0);

    for (const x of v) {
      const idx = clamp(Math.floor((x - min) / step), 0, bins - 1);
      counts[idx]++;
    }

    const labels = counts.map((_, i) => {
      const a = min + i * step;
      const b = a + step;
      return `${a.toFixed(0)}–${b.toFixed(0)} m`;
    });

    return { labels, counts, min, max };
  }

function buildHistogramGeneric(values, bins = 10, labelFormatter = (a, b) => `${a.toFixed(0)}–${b.toFixed(0)}`) {
  const v = values.filter(x => x != null && isFinite(x));
  if (!v.length) return null;

  const { min, max } = minMax(v);
  if (min == null || max == null) return null;

  if (min === max) {
    return {
      labels: [labelFormatter(min, min)],
      counts: [v.length],
      min, max
    };
  }

  const step = (max - min) / bins;
  const counts = new Array(bins).fill(0);

  for (const x of v) {
    const idx = clamp(Math.floor((x - min) / step), 0, bins - 1);
    counts[idx]++;
  }

  const labels = counts.map((_, i) => {
    const a = min + i * step;
    const b = a + step;
    return labelFormatter(a, b);
  });

  return { labels, counts, min, max };
}

  async function computeElevationAssessment(targetFeature) {
    const geom = targetFeature?.geometry;
    if (!geom) return { type: "Unknown", rows: [], chart: null };

    const type = geom.type;

    // ---------- POINT ----------
    if (type === "Point") {
      const [lon, lat] = geom.coordinates;
      const s = await sampleElevationAndSlopeAtLonLat(lon, lat);

      return {
        type: "Point",
        rows: [
          { k: "Elevation", v: (s.z == null) ? "—" : `${s.z.toFixed(1)} m` },
          { k: "Slope (degrees)", v: (s.slopeDeg == null) ? "—" : `${s.slopeDeg.toFixed(1)}°` },
          { k: "Slope (%)", v: (s.slopePct == null) ? "—" : `${s.slopePct.toFixed(1)} %` }
        ],
        chart: (s.z == null) ? null : {
          kind: "bar-single",
          label: "Elevation (m)",
          value: s.z
        }
      };
    }

    // ---------- LINE ----------
    if (type === "LineString" || type === "MultiLineString") {
      const lengthM = turf.length(targetFeature, { units: "kilometers" }) * 1000;

      // DEM resolution (meters per pixel) at a representative location (midpoint)
      const mid = turf.along(targetFeature, (lengthM / 2) / 1000, { units: "kilometers" });
      const [midLon, midLat] = mid.geometry.coordinates;
      const dem = await getDem();
      const demMeters = metersPerDemPixel(dem, midLon, midLat);
      const demMinStep = minSamplingStepFromDemMeters(demMeters);

      // Choose sampling step, but never finer than ~2 DEM pixels
      let stepM = pickSamplingStepMetersForLine(lengthM);
      stepM = Math.max(stepM, demMinStep);

      const n = clamp(Math.ceil(lengthM / stepM) + 1, 2, 350);

      // Sample elevation profile
      const profile = [];
      for (let i = 0; i < n; i++) {
        const distM = (i / (n - 1)) * lengthM;
        const pt = turf.along(targetFeature, distM / 1000, { units: "kilometers" });
        const [lon, lat] = pt.geometry.coordinates;
        const s = await sampleElevationAndSlopeAtLonLat(lon, lat);
        profile.push({ distM, z: s.z });
      }

      const validProfile = profile.filter(p => p.z != null && isFinite(p.z));
      const zs = validProfile.map(p => p.z);

      const { min, max } = minMax(zs);
      const avg = mean(zs);

      // Start/End elevations (first/last valid)
      const zStart = validProfile.length ? validProfile[0].z : null;
      const zEnd = validProfile.length ? validProfile[validProfile.length - 1].z : null;

      // End-to-end grade (start vs end)
      const endToEndGradePct = (zStart == null || zEnd == null || !isFinite(lengthM) || lengthM <= 0)
        ? null
        : ((zEnd - zStart) / lengthM) * 100;

      // Segment grades, ascent/descent, steepest uphill/downhill
      let ascent = 0;
      let descent = 0;
      const segGrades = [];

      let maxGradePct = null; // steepest uphill
      let minGradePct = null; // steepest downhill (most negative)

      for (let i = 1; i < profile.length; i++) {
        const a = profile[i - 1], b = profile[i];
        if (a.z == null || b.z == null) continue;

        const run = (b.distM - a.distM) || 1;
        const rise = (b.z - a.z);

        const gradePct = (rise / run) * 100;
        segGrades.push(gradePct);

        if (maxGradePct == null || gradePct > maxGradePct) maxGradePct = gradePct;
        if (minGradePct == null || gradePct < minGradePct) minGradePct = gradePct;

        if (rise > 0) ascent += rise;
        if (rise < 0) descent += Math.abs(rise);
      }

      // Mean segment grade:
      const meanSegGradeAbsPct = segGrades.length
        ? mean(segGrades.map(g => Math.abs(g)))
        : null;

      return {
        type: "Line",
        rows: [
          { k: "DEM Resolution (approx.)", v: `${fmtNum(demMeters.dx, 2)} m × ${fmtNum(demMeters.dy, 2)} m per pixel` },
          { k: "Sample Spacing", v: `~${fmtNum(stepM, 0)} m (${profile.length} samples)` },

          { k: "Min Elevation", v: (min == null) ? "—" : `${min.toFixed(1)} m` },
          { k: "Max Elevation", v: (max == null) ? "—" : `${max.toFixed(1)} m` },
          { k: "Average Elevation", v: (avg == null) ? "—" : `${avg.toFixed(1)} m` },

          { k: "End-to-End Grade (start→end)", v: (endToEndGradePct == null) ? "—" : `${endToEndGradePct.toFixed(2)} %` },
          { k: "End-to-End Slope Ratio (1:N)", v: slopePctToRatio(endToEndGradePct) },

          { k: "Mean Segment Grade (abs.)", v: (meanSegGradeAbsPct == null) ? "—" : `${meanSegGradeAbsPct.toFixed(2)} %` },
          { k: "Mean Segment Slope Ratio (1:N)", v: slopePctToRatio(meanSegGradeAbsPct) },

          { k: "Steepest Uphill Segment", v: (maxGradePct == null) ? "—" : `${maxGradePct.toFixed(2)} %` },
          { k: "Steepest Uphill Ratio (1:N)", v: slopePctToRatio(maxGradePct) },

          { k: "Steepest Downhill Segment", v: (minGradePct == null) ? "—" : `${minGradePct.toFixed(2)} %` },
          { k: "Steepest Downhill Ratio (1:N)", v: slopePctToRatio(minGradePct) },

          { k: "Total Ascent", v: `${ascent.toFixed(1)} m` },
          { k: "Total Descent", v: `${descent.toFixed(1)} m` }
        ],
        chart: {
          kind: "profile",
          points: validProfile
        }
      };
    }

    // ---------- POLYGON ----------
    if (type === "Polygon" || type === "MultiPolygon") {
      const areaM2 = turf.area(targetFeature);
      const bbox = turf.bbox(targetFeature);

      // DEM resolution at polygon centroid
      const center = turf.centroid(targetFeature);
      const [cLon, cLat] = center.geometry.coordinates;

      const dem = await getDem();
      const demMeters = metersPerDemPixel(dem, cLon, cLat);
      const demMinStep = minSamplingStepFromDemMeters(demMeters);

      // Choose grid spacing, but never finer than ~2 DEM pixels
      let stepM = pickSamplingStepMetersForPolygon(areaM2);
      stepM = Math.max(stepM, demMinStep);

      // Build sampling grid inside polygon
      let grid = turf.pointGrid(bbox, stepM / 1000, { units: "kilometers", mask: targetFeature });

      // Cap sample count for performance (random downsample)
      const MAX = 600;
      if (grid.features.length > MAX) {
        const shuffled = grid.features.slice().sort(() => Math.random() - 0.5);
        grid.features = shuffled.slice(0, MAX);
      }

      // Sample elevation and slope
      const samples = [];
      for (const p of grid.features) {
        const [lon, lat] = p.geometry.coordinates;
        const s = await sampleElevationAndSlopeAtLonLat(lon, lat);
        samples.push({ z: s.z, slopeDeg: s.slopeDeg, slopePct: s.slopePct });
      }

      const zs = samples.map(s => s.z).filter(z => z != null && isFinite(z));
      const { min, max } = minMax(zs);
      const avg = mean(zs);

      const slopesDeg = samples.map(s => s.slopeDeg).filter(x => x != null && isFinite(x));
      const slopesPct = samples.map(s => s.slopePct).filter(x => x != null && isFinite(x));

      const sDegAvg = mean(slopesDeg);
      const { min: sDegMin, max: sDegMax } = minMax(slopesDeg);

      const sPctAvg = mean(slopesPct);
      const { min: sPctMin, max: sPctMax } = minMax(slopesPct);

      // % area by slope class (using degrees)
      const slopeBins = [
        { name: "0–5° (Gentle)", min: 0, max: 5 },
        { name: "5–15° (Moderate)", min: 5, max: 15 },
        { name: "15–30° (Steep)", min: 15, max: 30 },
        { name: ">30° (Very steep)", min: 30, max: Infinity }
      ];

      const slopeClassPct = (() => {
        const v = slopesDeg.filter(x => x >= 0);
        if (!v.length) return null;
        const total = v.length;
        const counts = slopeBins.map(b => v.filter(x => x >= b.min && x < b.max).length);
        return slopeBins.map((b, i) => ({
          k: `Slope Class % — ${b.name}`,
          v: `${fmtNum((counts[i] / total) * 100, 1)} %`
        }));
      })();

      const elevHist = buildHistogram(zs, 10);

      // slope histogram in degrees
      const slopeHist = buildHistogramGeneric(slopesDeg, 10, (a, b) => `${a.toFixed(0)}–${b.toFixed(0)}°`);

      const rows = [
        { k: "DEM Resolution (approx.)", v: `${fmtNum(demMeters.dx, 2)} m × ${fmtNum(demMeters.dy, 2)} m per pixel` },
        { k: "Grid Spacing", v: `~${fmtNum(stepM, 0)} m (${zs.length} samples)` },

        { k: "Min Elevation", v: (min == null) ? "—" : `${min.toFixed(1)} m` },
        { k: "Max Elevation", v: (max == null) ? "—" : `${max.toFixed(1)} m` },
        { k: "Mean Elevation", v: (avg == null) ? "—" : `${avg.toFixed(1)} m` },

        { k: "Mean Slope (degrees)", v: (sDegAvg == null) ? "—" : `${sDegAvg.toFixed(1)}°` },
        { k: "Mean Slope (grade %)", v: (sPctAvg == null) ? "—" : `${sPctAvg.toFixed(1)} %` },

        { k: "Slope Range (degrees)", v: (sDegMin == null) ? "—" : `${sDegMin.toFixed(1)}° to ${sDegMax.toFixed(1)}°` },
        { k: "Slope Range (grade %)", v: (sPctMin == null) ? "—" : `${sPctMin.toFixed(1)}% to ${sPctMax.toFixed(1)}%` },

        { k: "Mean Slope Ratio (1:N)", v: slopePctToRatio(sPctAvg) },
        { k: "Slope Ratio Range (1:N)", v: (sPctMin == null) ? "—" : `${slopePctToRatio(sPctMax)} to ${slopePctToRatio(sPctMin)}` }
      ];

      if (slopeClassPct && slopeClassPct.length) {
        rows.push({ k: "Slope Class Breakdown", v: "—" });
        rows.push(...slopeClassPct);
      }

      return {
        type: "Polygon",
        rows,
        chart: elevHist ? {
          kind: "histogram",
          labels: elevHist.labels,
          counts: elevHist.counts,
          title: "Elevation distribution",
          xTitle: "Elevation bins (m)",
          yTitle: "Sample count"
        } : null,
        slopeChart: slopeHist ? {
          kind: "histogram",
          labels: slopeHist.labels,
          counts: slopeHist.counts,
          title: "Slope distribution",
          xTitle: "Slope bins (degrees)",
          yTitle: "Sample count"
        } : null
      };

    }

    return { type, rows: [{ k: "Elevation", v: "Unsupported geometry type" }], chart: null };
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

    const layerProperties = computeLayerProperties(target);

    //Elevation assessment (DEM)
    let elevation = null;
    try {
      elevation = await computeElevationAssessment(target);
    } catch (e) {
      console.warn("Elevation assessment failed:", e);
      elevation = { type: "—", rows: [{ k: "Elevation", v: "Failed to read DEM" }], chart: null };
    }

    const cecBufferMeters = toMeters($("cecBufferInput")?.value);
    const receptorBufferMeters = toMeters($("receptorBufferInput")?.value);

    // Raw spatial results
    const rawCECs = computeNearbyCECs(target, cecBufferMeters);

    // Apply optional filters (date range + status)
    const filteredCECs = applySpatialOptionalCECFilters(rawCECs);

    const receptorResults = computeSensitiveReceptors(target, receptorBufferMeters);
    const otherInfo = computeOtherInformation(target);

    // Apply final results to map
    applyResultsToMap(filteredCECs);

    const results = {
      meta: { cecBufferMeters, receptorBufferMeters },
      cecs: filteredCECs,
      receptors: receptorResults,
      otherInfo,
      layerProperties, 
      elevation 
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

        downloadPDF(lastSpatialResults).catch(err => {
          console.error("❌ PDF export failed:", err);
          alert("PDF export failed. Check console for details.");
        });

      });
    }

    // Initial population
    populatePrimarySelect();
  }

  window.initSpatialAnalysisV2 = initSpatialUI;

})();
