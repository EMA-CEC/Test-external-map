// Manages drawing tools and spatial analysis logic

const analysisLayersToPreload = [
  "Caroni Swamp",
  "Aripo Savannas",
  "Forest Reserve",
  "Matura National Park",
  "Nariva Swamp",
  "Municipality",
  "Trinidad Watersheds",
  "Tobago Watersheds",
  "Ecological Susceptibility",
  "Geological Susceptibility",
  "Social Susceptibility",
  "Hydrogeology",
  "Trinidad TCPD Policy",
  "Tobago TCPD Policy"
];

/* ---------------------------------------------------------
   Helper Functions
--------------------------------------------------------- */

function $(id) {
  return document.getElementById(id);
}

function getUTMConverter() {
  // Prefer smart zone converter if available, fallback to old one
  return window.convertUTMToLatLonSmart || window.convertUTMToLatLon;
}

function safeSetHTML(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html;
}

function safeClear(id) {
  const el = $(id);
  if (el) el.innerHTML = "";
}

function safeShow(id) {
  const el = $(id);
  if (el) el.classList.remove("hidden");
}

function safeHide(id) {
  const el = $(id);
  if (el) el.classList.add("hidden");
}

/* ---------------------------------------------------------
   Preload layers AND prepare Leaflet layer for spatial checks
--------------------------------------------------------- */

async function preloadAnalysisLayers() {
  if (!window.geojsonLayers || !Array.isArray(geojsonLayers)) {
    console.warn("geojsonLayers not ready yet. Skipping preload.");
    return;
  }

  // Build lookup map first (so it exists immediately)
  geojsonLayers.byName = {};
  geojsonLayers.forEach(l => geojsonLayers.byName[l.name] = l);

  const tasks = analysisLayersToPreload.map(async (name) => {
    const item = geojsonLayers.byName[name];
    if (!item) return;

    try {
      const response = await fetch(item.url);
      if (!response.ok) throw new Error(`Failed to fetch ${name} (HTTP ${response.status})`);

      const geojson = await response.json();
      item.preloadedData = geojson;
      item.loadedLayer = L.geoJSON(geojson); // For analysis

      console.log(`✅ Preloaded analysis layer: ${name}`);
    } catch (err) {
      console.warn(`❌ Could not preload layer: ${name}`, err);
    }
  });

  await Promise.all(tasks);
  console.log("✅ All analysis layers finished preloading.");
}

/* ---------------------------------------------------------
   UI Setup
--------------------------------------------------------- */

function setupSpatialAnalysisUI() {
  const btn = $("startSpatialAnalysisBtn");
  if (!btn) {
    console.warn("startSpatialAnalysisBtn not found in DOM.");
    return;
  }

  btn.addEventListener("click", async () => {
    // If you still have a modal/panel you want to show, keep this
    // If it doesn't exist, it won’t crash.
    safeShow("spatialAnalysisPanel");

    // Wait for all analysis layers to finish loading before running analysis
    if (window.analysisLayersReadyPromise) {
      await window.analysisLayersReadyPromise;
    }

    performSpatialAnalysis();
  });
}

function closeSpatialAnalysis() {
  safeHide("spatialAnalysisPanel");

  safeClear("cecResultsBody");
  safeClear("receptorResultsBody");
  safeClear("otherInfoTableBody");
  safeSetHTML("shapePropertiesOutput", "Select a shape to analyze.");
}

/* ---------------------------------------------------------
   Main Analysis Entry
--------------------------------------------------------- */

function performSpatialAnalysis() {
  if (!window.turf) {
    console.error("❌ Turf.js not loaded. Spatial Analysis cannot run.");
    alert("Turf.js library is missing. Spatial Analysis cannot run.");
    return;
  }

  if (!window.lastDrawnShape) {
    alert("Please draw a shape on the map before starting the spatial analysis.");
    return;
  }

  const userShape = lastDrawnShape;
  const geomType = userShape.geometry?.type;
  const coords = userShape.geometry?.coordinates;

  console.log("🟡 Raw lastDrawnShape:", lastDrawnShape);
  console.log("🧪 Geometry type:", geomType);
  console.log("🧪 Raw coordinates:", coords);

  if (
    !geomType ||
    !coords ||
    coords.length === 0 ||
    (Array.isArray(coords[0]) && coords[0].length === 0)
  ) {
    alert("Drawn shape is invalid or incomplete.");
    return;
  }

  try {
    // Buffers
    const buffer500 = turf.buffer(userShape, 0.5, { units: "kilometers" });
    const buffer1000 = turf.buffer(userShape, 1, { units: "kilometers" });

    analyzeNearbyCECs(buffer500);
    analyzeSensitiveReceptors(buffer1000, userShape);
    analyzeOtherInfo(userShape);
    displayShapeProperties(userShape);
  } catch (err) {
    console.error("❌ Buffering failed:", err);
    alert("An error occurred while buffering the shape.");
  }
}

/* ---------------------------------------------------------
   500m: Nearby CEC Applications
--------------------------------------------------------- */

function analyzeNearbyCECs(buffer) {
  const container = $("cecResultsBody");
  const warning = $("cecWarning");

  if (!container) {
    console.warn("cecResultsBody not found (table body missing).");
    return;
  }

  const dataset = (window.filteredCECData && window.filteredCECData.length)
    ? window.filteredCECData
    : window.allCECData;

  container.innerHTML = "";
  if (warning) warning.style.display = "none";

  if (!dataset || dataset.length === 0) {
    if (warning) warning.style.display = "block";
    return;
  }

  const converter = getUTMConverter();
  if (!converter) {
    console.error("❌ No UTM converter found. Ensure convertUTMToLatLonSmart or convertUTMToLatLon exists.");
    container.innerHTML = `<tr><td colspan="4">UTM conversion function missing.</td></tr>`;
    return;
  }

  let count = 0;

  dataset.forEach(item => {
    const easting = parseFloat(item["Easting"]);
    const northing = parseFloat(item["Northing"]);
    if (isNaN(easting) || isNaN(northing)) return;

    const [lat, lon] = converter(easting, northing);
    if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return;

    // FIX: define point feature for Turf
    const point = turf.point([lon, lat]);

    // We check within the 500m buffer polygon
    if (turf.booleanPointInPolygon(point, buffer)) {
      count++;
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${item["CEC Reference"] || "N/A"}</td>
        <td>${item["Year"] || "N/A"}</td>
        <td>${item["Application Determination"] || "Pending"}</td>
        <td>${item["Activity Description"] || "N/A"}</td>
      `;
      container.appendChild(row);
    }
  });

  if (count === 0) {
    container.innerHTML = `<tr><td colspan="4">No CEC Applications found within 500m.</td></tr>`;
  }
}

/* ---------------------------------------------------------
   1km: Sensitive Receptors
--------------------------------------------------------- */

function analyzeSensitiveReceptors(buffer, shape) {
  const container = $("receptorResultsBody");
  if (!container) {
    console.warn("receptorResultsBody not found.");
    return;
  }

  container.innerHTML = "";

  const receptors = [
    "Aripo Savannas",
    "Caroni Swamp",
    "Forest Reserve",
    "Matura National Park",
    "Nariva Swamp"
  ];

  let found = 0;

  receptors.forEach(name => {
    const layer = geojsonLayers.byName?.[name]?.loadedLayer;
    if (!layer) return;

    layer.eachLayer(l => {
      const feature = l.toGeoJSON();
      if (!feature.geometry) return;

      const intersects = turf.booleanIntersects(shape, feature);
      let distance = "within boundaries";

      const withinBuffer = turf.booleanIntersects(buffer, feature);

      if (!intersects && withinBuffer) {
        try {
          const shapeGeom = shape.geometry;
          const featureGeom = feature.geometry;

          const shapeLine = (shapeGeom.type === "Polygon" || shapeGeom.type === "MultiPolygon")
            ? turf.polygonToLine(shape)
            : (shapeGeom.type === "LineString" || shapeGeom.type === "MultiLineString")
              ? shape
              : null;

          const featureLine = (featureGeom.type === "Polygon" || featureGeom.type === "MultiPolygon")
            ? turf.polygonToLine(feature)
            : (featureGeom.type === "LineString" || featureGeom.type === "MultiLineString")
              ? feature
              : null;

          let d;

          if (shapeGeom.type === "Point" && featureLine) {
            const ptOnReceptor = turf.nearestPointOnLine(featureLine, turf.getCoord(shape));
            d = turf.distance(shape, ptOnReceptor, { units: "kilometers" });

          } else if (featureGeom.type === "Point" && shapeLine) {
            const pt = turf.point(feature.geometry.coordinates);
            const ptOnShape = turf.nearestPointOnLine(shapeLine, turf.getCoord(pt));
            d = turf.distance(ptOnShape, pt, { units: "kilometers" });

          } else if (shapeLine && featureLine) {
            const ptOnShape = turf.nearestPointOnLine(shapeLine, turf.centerOfMass(feature).geometry.coordinates);
            const ptOnReceptor = turf.nearestPointOnLine(featureLine, turf.centerOfMass(shape).geometry.coordinates);
            d = turf.distance(ptOnShape, ptOnReceptor, { units: "kilometers" });

          } else {
            d = null;
          }

          distance = (d != null) ? (Math.round(d * 1000) + " m") : "distance unavailable";
        } catch (err) {
          console.warn("Distance calculation failed:", err);
          distance = "distance unavailable";
        }
      }

      if (intersects || withinBuffer) {
        let label = name;

        if (name === "Forest Reserve") {
          const subname = feature.properties?.NAME;
          if (subname && subname !== "null") label = `Forest Reserve - ${subname}`;
        }

        const row = document.createElement("tr");
        row.innerHTML = `<td>${label}</td><td>${distance}</td>`;
        container.appendChild(row);
        found++;
      }
    });
  });

  if (found === 0) {
    container.innerHTML = `<tr><td colspan="2">No sensitive receptors found within 1 km.</td></tr>`;
  }
}

/* ---------------------------------------------------------
   Other Info Table: Municipality, Watershed, Susceptibility, etc.
--------------------------------------------------------- */

const intersectLayers = [
  { name: "Municipality", layers: ["Municipality"], labelField: "NAME_1" },
  { name: "Watershed", layers: ["Trinidad Watersheds", "Tobago Watersheds"], labelField: { "Trinidad Watersheds": "NAME", "Tobago Watersheds": "WATERSHED" } },
  { name: "Ecological Susceptibility", layers: ["Ecological Susceptibility"], labelField: "Class" },
  { name: "Geological Susceptibility", layers: ["Geological Susceptibility"], labelField: "Class" },
  { name: "Hydrogeology", layers: ["Hydrogeology"], labelField: "ATTRIB" },
  { name: "Social Susceptibility", layers: ["Social Susceptibility"], labelField: "Class" },
  { name: "TCPD Policy", layers: ["Trinidad TCPD Policy", "Tobago TCPD Policy"], labelField: "Class_Name" }
];

function analyzeOtherInfo(shape) {
  const tbody = $("otherInfoTableBody");
  if (!tbody) {
    console.warn("otherInfoTableBody not found.");
    return;
  }

  tbody.innerHTML = "";

  intersectLayers.forEach(group => {
    const results = new Set();

    group.layers.forEach(layerName => {
      const layer = geojsonLayers.byName?.[layerName]?.loadedLayer;
      if (!layer) return;

      const labelField = typeof group.labelField === "string"
        ? group.labelField
        : group.labelField[layerName];

      layer.eachLayer(l => {
        const feature = l.toGeoJSON();
        if (turf.booleanIntersects(shape, feature)) {
          const val = feature.properties?.[labelField];
          if (val && val !== "null") results.add(val);
        }
      });
    });

    const row = document.createElement("tr");
    row.innerHTML = `<td><strong>${group.name}</strong></td><td>${Array.from(results).join(", ") || "None"}</td>`;
    tbody.appendChild(row);
  });
}

/* ---------------------------------------------------------
   Shape Properties Output
--------------------------------------------------------- */

function displayShapeProperties(shape) {
  const output = $("shapePropertiesOutput");
  if (!output) return;

  let html = "";
  const geom = shape?.geometry;

  if (!geom || !geom.coordinates) {
    output.innerHTML = "Invalid shape.";
    return;
  }

  const type = geom.type;
  const turfGeom = turf.feature(geom);

  try {
    if (type === "Point") {
      const [lon, lat] = geom.coordinates;

      // Convert lat/lon to UTM using your existing function
      if (typeof convertLatLonToUTM === "function") {
        const { easting, northing } = convertLatLonToUTM(lat, lon);
        html = `<strong>Easting:</strong> ${easting.toFixed(2)}<br><strong>Northing:</strong> ${northing.toFixed(2)}`;
      } else {
        html = `<strong>Lat:</strong> ${lat.toFixed(6)}<br><strong>Lon:</strong> ${lon.toFixed(6)}<br><em>(convertLatLonToUTM not found)</em>`;
      }

    } else if (type === "LineString") {
      const length = turf.length(turfGeom, { units: "meters" });
      html = `<strong>Length:</strong> ${length.toFixed(2)} m`;

    } else if (type === "Polygon") {
      const area = turf.area(turfGeom); // m²
      const perimeter = turf.length(turf.polygonToLine(turfGeom), { units: "meters" });
      html = `
        <strong>Area:</strong> ${area.toFixed(2)} m² (${(area / 10000).toFixed(2)} ha)<br>
        <strong>Perimeter:</strong> ${perimeter.toFixed(2)} m
      `;

    } else {
      html = "Unsupported geometry type.";
    }

  } catch (err) {
    console.error("❌ Shape property calculation failed:", err);
    html = "Failed to calculate shape properties.";
  }

  output.innerHTML = html;
}
