// userUploads.js
// ------------------------------------------------------------
// User upload manager (CSV / GeoJSON / Shapefile ZIP)
// - Creates a layer card in Additional Data panel
// - Each card includes: toggle, opacity slider, delete
// - Clicking name opens style controls (field-based + colors)
// ------------------------------------------------------------

console.log("✅ userUploads.js loaded");

(function () {
  // -----------------------------
  // Global Store
  // -----------------------------
  window.UserUploadManager = window.UserUploadManager || {
    layers: {},   // id -> object
    order: [],    // keep UI order
    _uiInitialized: false
  };

  function getMap() {
    return window.map || null;
  }

  function emitUploadsChanged(type, payload = {}) {
    try {
      window.dispatchEvent(new CustomEvent("userUploadLayersChanged", {
        detail: { type, ...payload }
      }));
    } catch (e) {
      // non-blocking
      console.warn("userUploadLayersChanged event failed:", e);
    }
  }

  // expose helper for other modules (Spatial Analysis will use this)
  window.UserUploadManager.getAllLayerObjects = function () {
    return window.UserUploadManager.order
      .map(id => window.UserUploadManager.layers[id])
      .filter(Boolean);
  };

  function uid(prefix = "upload") {
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }

  function safeText(x) {
    return String(x ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }

  // -----------------------------
  // Geometry helpers
  // -----------------------------
  function detectGeometryType(geojson) {
    const f = geojson?.features?.[0];
    const t = f?.geometry?.type || "";
    if (t.includes("Polygon")) return "polygon";
    if (t.includes("LineString")) return "line";
    if (t.includes("Point")) return "point";
    return "unknown";
  }

  function listFields(geojson) {
    const f = geojson?.features?.[0];
    const props = f?.properties || {};
    return Object.keys(props).filter(k => !k.startsWith("__"));
  }

  // -----------------------------
  // Category color map
  // -----------------------------
  function makeColorFromValue(val) {
    // stable hash → HSL
    const s = String(val ?? "NA");
    let hash = 0;
    for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 60%, 75%)`;
  }

  function buildCategoryMap(geojson, field) {
    const values = new Set();
    (geojson?.features || []).forEach(f => {
      const v = f?.properties?.[field];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        values.add(String(v).trim());
      }
    });

    const map = {};
    Array.from(values).forEach(v => {
      map[v] = makeColorFromValue(v);
    });

    return map;
  }

  // -----------------------------
  // Leaflet layer builder
  // -----------------------------
  function buildLeafletLayer(layerObj) {
    const { geojson, style } = layerObj;
    const geomType = layerObj.geomType;

    // Style functions
    const stylePolygon = (feature) => {
      const opacity = layerObj.opacity;

      let fill = style.fillColor;
      let stroke = style.strokeColor;

      // category mode?
      if (style.mode === "category" && style.field) {
        const v = feature?.properties?.[style.field];
        const key = String(v ?? "");
        fill = style.categoryMap?.[key] || fill;
      }

      return {
        color: stroke,
        weight: 2,
        opacity: opacity,
        fillColor: fill,
        fillOpacity: opacity
      };
    };

    const styleLine = (feature) => {
      const opacity = layerObj.opacity;

      let stroke = style.strokeColor;

      // category mode? (use stroke color per category)
      if (style.mode === "category" && style.field) {
        const v = feature?.properties?.[style.field];
        const key = String(v ?? "");
        stroke = style.categoryMap?.[key] || stroke;
      }

      return {
        color: stroke,
        weight: 3,
        opacity: opacity
      };
    };

    const pointToLayer = (feature, latlng) => {
      const opacity = layerObj.opacity;

      let fill = style.pointColor;
      let stroke = style.strokeColor;

      if (style.mode === "category" && style.field) {
        const v = feature?.properties?.[style.field];
        const key = String(v ?? "");
        fill = style.categoryMap?.[key] || fill;
      }

      return L.circleMarker(latlng, {
        radius: 6,
        color: stroke,
        weight: 2,
        opacity: opacity,
        fillColor: fill,
        fillOpacity: opacity
      });
    };

    // Popup with all props
    const onEachFeature = (feature, lyr) => {
      const props = feature?.properties || {};
      const keys = Object.keys(props);

      const html = `
        <div class="ema-popup">
          <div class="popup-title">${safeText(layerObj.name)}</div>
          <table>
            ${keys.map(k => `
              <tr>
                <td class="key"><strong>${safeText(k)}</strong></td>
                <td class="val">${safeText(props[k])}</td>
              </tr>
            `).join("")}
          </table>
        </div>
      `;

      lyr.bindPopup(html, { maxWidth: 380 });
    };

    // Build correct geometry layer
    let leafletLayer;

    if (geomType === "polygon") {
      leafletLayer = L.geoJSON(geojson, {
        style: stylePolygon,
        onEachFeature
      });
    }
    else if (geomType === "line") {
      leafletLayer = L.geoJSON(geojson, {
        style: styleLine,
        onEachFeature
      });
    }
    else if (geomType === "point") {
      leafletLayer = L.geoJSON(geojson, {
        pointToLayer,
        onEachFeature
      });
    }
    else {
      leafletLayer = L.geoJSON(geojson, { onEachFeature });
    }

    return leafletLayer;
  }

  function applyStyle(layerObj) {
    const mapRef = getMap();
    if (!mapRef || !layerObj.layer) return;

    // rebuild category map if needed
    if (layerObj.style.mode === "category" && layerObj.style.field) {
      layerObj.style.categoryMap = buildCategoryMap(layerObj.geojson, layerObj.style.field);
    } else {
      layerObj.style.categoryMap = null;
    }

    // remove and rebuild (best for points too)
    const wasOn = layerObj.active;

    if (wasOn && mapRef.hasLayer(layerObj.layer)) {
      mapRef.removeLayer(layerObj.layer);
    }

    layerObj.layer = buildLeafletLayer(layerObj);

    if (wasOn) {
      layerObj.layer.addTo(mapRef);
    }

    emitUploadsChanged("styleUpdated", { layerId: layerObj.id });
  }

  // -----------------------------
  // UI: Create layer card
  // -----------------------------
  function createLayerCard(layerObj) {
    const mapRef = getMap();
    const list = document.getElementById("userUploadLayerList");
    if (!list || !mapRef) return;

    // remove default hint if present
    const hint = list.querySelector(".muted.small");
    if (hint) hint.remove();

    const card = document.createElement("div");
    card.className = "layer-item-card upload-layer-card";

    // TOP ROW: name button + eye + delete
    const topRow = document.createElement("div");
    topRow.className = "layer-card-toprow";

    const nameBtn = document.createElement("button");
    nameBtn.type = "button";
    nameBtn.className = "layer-name-btn";
    nameBtn.textContent = layerObj.name;

    const eyeBtn = document.createElement("button");
    eyeBtn.type = "button";
    eyeBtn.className = "layer-eye-btn";
    eyeBtn.title = "Toggle layer";
    eyeBtn.textContent = "👁";

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "layer-remove-btn";
    delBtn.title = "Remove uploaded layer";
    delBtn.textContent = "✕";

    topRow.appendChild(nameBtn);
    topRow.appendChild(eyeBtn);
    topRow.appendChild(delBtn);

    // Opacity row
    const opacityRow = document.createElement("div");
    opacityRow.className = "layer-opacity-row";
    opacityRow.innerHTML = `
      <div class="layer-opacity-label">Opacity</div>
      <input class="opacity-slider" type="range" min="0" max="1" step="0.05" value="${layerObj.opacity}">
    `;
    const slider = opacityRow.querySelector(".opacity-slider");

    // Style panel (hidden until name clicked)
    const stylePanel = document.createElement("div");
    stylePanel.className = "upload-style-panel hidden";

    const fields = listFields(layerObj.geojson);

    stylePanel.innerHTML = `
      <div class="upload-style-grid">

        <label class="small muted">Style by field</label>
        <select class="upload-field-select">
          <option value="">(single colour)</option>
          ${fields.map(f => `<option value="${safeText(f)}">${safeText(f)}</option>`).join("")}
        </select>

        <div class="upload-color-row">
          <div class="upload-color-block">
            <label class="small muted">Stroke</label>
            <input type="color" class="stroke-color" value="${layerObj.style.strokeColor}">
          </div>

          <div class="upload-color-block fill-block">
            <label class="small muted">Fill</label>
            <input type="color" class="fill-color" value="${layerObj.style.fillColor}">
          </div>

          <div class="upload-color-block point-block">
            <label class="small muted">Point</label>
            <input type="color" class="point-color" value="${layerObj.style.pointColor}">
          </div>
        </div>

        <div class="small muted">
          Tip: choosing a field will auto-generate colours per category.
        </div>
      </div>
    `;

    card.appendChild(topRow);
    card.appendChild(opacityRow);
    card.appendChild(stylePanel);
    list.appendChild(card);

    // Hide fill/point pickers depending on geometry
    const fillBlock = stylePanel.querySelector(".fill-block");
    const pointBlock = stylePanel.querySelector(".point-block");

    if (layerObj.geomType === "polygon") {
      if (pointBlock) pointBlock.style.display = "none";
    } else if (layerObj.geomType === "line") {
      if (fillBlock) fillBlock.style.display = "none";
      if (pointBlock) pointBlock.style.display = "none";
    } else if (layerObj.geomType === "point") {
      if (fillBlock) fillBlock.style.display = "none";
    }

    // -----------------------------
    // Events
    // -----------------------------
    // Toggle style panel
    nameBtn.addEventListener("click", () => {
      stylePanel.classList.toggle("hidden");
    });

    // Toggle on/off
    eyeBtn.addEventListener("click", () => {
      layerObj.active = !layerObj.active;

      if (layerObj.active) {
        layerObj.layer.addTo(mapRef);
        eyeBtn.classList.add("on");
      } else {
        if (mapRef.hasLayer(layerObj.layer)) mapRef.removeLayer(layerObj.layer);
        eyeBtn.classList.remove("on");
      }

      emitUploadsChanged("toggle", { layerId: layerObj.id, active: layerObj.active });
    });

    // Delete
    delBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (layerObj.layer && mapRef.hasLayer(layerObj.layer)) {
        mapRef.removeLayer(layerObj.layer);
      }

      // remove store
      delete window.UserUploadManager.layers[layerObj.id];
      window.UserUploadManager.order = window.UserUploadManager.order.filter(x => x !== layerObj.id);

      // remove card
      card.remove();

      // if list is empty show hint again
      if (!window.UserUploadManager.order.length) {
        list.innerHTML = `<div class="muted small">Uploaded layers will appear here.</div>`;
      }

      emitUploadsChanged("deleted", { layerId: layerObj.id });
    });

    // Opacity slider
    slider.addEventListener("input", () => {
      const val = parseFloat(slider.value);
      layerObj.opacity = val;
      applyStyle(layerObj);
    });

    // Style controls
    const fieldSelect = stylePanel.querySelector(".upload-field-select");
    const strokePicker = stylePanel.querySelector(".stroke-color");
    const fillPicker = stylePanel.querySelector(".fill-color");
    const pointPicker = stylePanel.querySelector(".point-color");

    fieldSelect.addEventListener("change", () => {
      const field = fieldSelect.value;

      if (field) {
        layerObj.style.mode = "category";
        layerObj.style.field = field;
      } else {
        layerObj.style.mode = "single";
        layerObj.style.field = null;
      }

      applyStyle(layerObj);
    });

    strokePicker.addEventListener("input", () => {
      layerObj.style.strokeColor = strokePicker.value;
      applyStyle(layerObj);
    });

    if (fillPicker) {
      fillPicker.addEventListener("input", () => {
        layerObj.style.fillColor = fillPicker.value;
        applyStyle(layerObj);
      });
    }

    if (pointPicker) {
      pointPicker.addEventListener("input", () => {
        layerObj.style.pointColor = pointPicker.value;
        applyStyle(layerObj);
      });
    }
  }

  // -----------------------------
  // File upload handlers
  // -----------------------------
  async function uploadCSV(file) {
    if (typeof Papa === "undefined") {
      alert("CSV upload requires PapaParse.");
      return null;
    }

    const text = await file.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });

    const rows = parsed.data || [];
    if (!rows.length) {
      alert("CSV looks empty.");
      return null;
    }

    // Expect Easting/Northing; use your UTM conversion function
    const converter = window.convertUTMToLatLonSmart || window.convertUTMToLatLon;
    if (typeof converter !== "function") {
      alert("Missing UTM converter (convertUTMToLatLonSmart / convertUTMToLatLon).");
      return null;
    }

    const features = [];

    rows.forEach(r => {
      // accept multiple header styles
      const e = parseFloat(r.Easting ?? r.easting ?? r.EASTING);
      const n = parseFloat(r.Northing ?? r.northing ?? r.NORTHING);
      if (!Number.isFinite(e) || !Number.isFinite(n)) return;

      const [lat, lon] = converter(e, n);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: { ...r, __sourceFile: file.name }
      });
    });

    if (!features.length) {
      alert("No valid Easting/Northing points found in CSV.");
      return null;
    }

    return {
      type: "FeatureCollection",
      features
    };
  }

  async function uploadGeoJSON(file) {
    const text = await file.text();
    const geojson = JSON.parse(text);

    if (!geojson || !geojson.features) {
      alert("Invalid GeoJSON.");
      return null;
    }

    return geojson;
  }

  async function uploadShapefileZIP(file) {
    if (typeof shp === "undefined") {
      alert("Shapefile upload requires shpjs library.");
      return null;
    }

    const buf = await file.arrayBuffer();
    const geojson = await shp(buf);

    if (!geojson || !geojson.features) {
      alert("Could not read shapefile ZIP.");
      return null;
    }

    return geojson;
  }

  // -----------------------------
  // Init Upload UI
  // -----------------------------
  function initUserUploads() {
    // guard: avoid duplicate listeners if init happens more than once
    if (window.UserUploadManager._uiInitialized) return;
    window.UserUploadManager._uiInitialized = true;

    const btnCSV = document.getElementById("btnAddCSV");
    const btnGJ = document.getElementById("btnAddGeoJSON");
    const btnSHP = document.getElementById("btnAddShapefile");
    const fileInput = document.getElementById("userUploadInput");

    if (!btnCSV || !btnGJ || !btnSHP || !fileInput) {
      console.warn("❌ Upload UI missing in index.html (buttons or input).");
      return;
    }

    function openPicker(accept, mode) {
      fileInput.value = "";
      fileInput.accept = accept;
      fileInput.dataset.mode = mode;
      fileInput.click();
    }

    btnCSV.addEventListener("click", () => openPicker(".csv", "csv"));
    btnGJ.addEventListener("click", () => openPicker(".geojson,.json", "geojson"));
    btnSHP.addEventListener("click", () => openPicker(".zip", "shp"));

    fileInput.addEventListener("change", async () => {
      const mapRef = getMap();
      if (!mapRef) {
        alert("Map is not ready yet. Try again in a moment.");
        return;
      }

      const file = fileInput.files?.[0];
      if (!file) return;

      const mode = fileInput.dataset.mode;
      let geojson = null;

      try {
        if (mode === "csv") geojson = await uploadCSV(file);
        else if (mode === "geojson") geojson = await uploadGeoJSON(file);
        else if (mode === "shp") geojson = await uploadShapefileZIP(file);
      } catch (err) {
        console.error("❌ Upload failed:", err);
        alert("Upload failed. Check console for details.");
        return;
      }

      if (!geojson) return;

      const id = uid("user");
      const geomType = detectGeometryType(geojson);

      const layerObj = {
        id,
        name: file.name,
        geojson,
        geomType,
        opacity: 0.7,
        active: true,
        style: {
          mode: "single",
          field: null,
          categoryMap: null,
          strokeColor: "#14532d",  // dark green
          fillColor: "#a7f3d0",    // light green
          pointColor: "#22c55e"    // bright green
        },
        layer: null
      };

      layerObj.layer = buildLeafletLayer(layerObj);
      layerObj.layer.addTo(mapRef);

      // store it
      window.UserUploadManager.layers[id] = layerObj;
      window.UserUploadManager.order.push(id);

      // create UI card
      createLayerCard(layerObj);

      // notify others (Spatial Analysis selector will update later)
      emitUploadsChanged("added", { layerId: id });

      // clear input
      fileInput.value = "";
    });

    console.log("✅ User upload system ready");
  }

  // -----------------------------
  // Boot (wait for window.map)
  // -----------------------------
  function waitForMapReadyAndInit(retries = 80) {
    const mapRef = getMap();

    if (mapRef && typeof mapRef.addLayer === "function") {
      initUserUploads();
      return;
    }

    if (retries <= 0) {
      console.warn("❌ userUploads.js: map still not ready after waiting.");
      return;
    }

    setTimeout(() => waitForMapReadyAndInit(retries - 1), 250);
  }

  document.addEventListener("DOMContentLoaded", () => {
    waitForMapReadyAndInit();
  });

})();
