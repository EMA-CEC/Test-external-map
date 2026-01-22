// Sets up the Leaflet map and base layers

let map;
let drawnItems = new L.FeatureGroup();
let lastDrawnShape = null;

let editHandler = null;
let editModeEnabled = false;

let majorRoadsLayer = null;
let majorRoadsLabels = null;
let majorRoadsData = null;

let activeDrawer = null;

let roadsEnabled = true;

/* ---------------------------------------------------------
   Roads Toggle (called from Settings panel)
--------------------------------------------------------- */
window.setRoadsEnabled = function (enabled) {
  roadsEnabled = enabled;

  if (!roadsEnabled) {
    if (majorRoadsLayer) map.removeLayer(majorRoadsLayer);
    if (majorRoadsLabels) map.removeLayer(majorRoadsLabels);
  } else {
    updateMajorRoadsVisibility();
  }
};

/* ---------------------------------------------------------
   Init Base Map
--------------------------------------------------------- */
function initBaseMap() {
  map = L.map("map", {
    center: [10.6918, -61.2225],
    zoom: 9,
    zoomControl: true,
    maxZoom: 20
  });

  // expose map + drawnItems globally for other scripts (shapes manager, etc.)
  window.map = map;
  window.drawnItems = drawnItems;

  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 20
  }).addTo(map);

  const google = L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    attribution: "Google",
    maxZoom: 20
  });

  L.control.layers(
    {
      OpenStreetMap: osm,
      "Google Map": google
    },
    null,
    { collapsed: true }
  ).addTo(map);

  // Scale bar (we can reposition later to follow sidebar edge)
  L.control.scale({ position: "bottomleft" }).addTo(map);

  // ✅ Initialize Draw Tools
  initDrawTools();

  // ✅ Fetch roads GeoJSON once
  fetch(
    "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Major%20Roads.geojson"
  )
    .then((res) => res.json())
    .then((data) => {
      majorRoadsData = data;
      updateMajorRoadsVisibility();
    })
    .catch((err) => console.warn("Failed to fetch major roads:", err));

  map.on("zoomend moveend", updateMajorRoadsVisibility);
  map.whenReady(updateMajorRoadsVisibility);
}

/* ---------------------------------------------------------
   Draw Tools
   NOTE:
   - We DO NOT open a label modal anymore.
   - We DO NOT use deleteSelectedBtn anymore.
   - Drawn shape naming + storing is handled in drawnShapesManager.js
--------------------------------------------------------- */
function initDrawTools() {
  drawnItems.addTo(map);

  // ✅ helper to prevent null addEventListener crashes
  const bindClick = (id, handler) => {
    const el = document.getElementById(id);
    if (!el) {
      console.warn(`⚠️ Button not found: #${id} (skipping listener)`);
      return null;
    }
    el.addEventListener("click", handler);
    return el;
  };

  // Draw config
  const drawControl = new L.Control.Draw({
    draw: {
      polyline: false, // defined manually
      circle: false,
      marker: true,
      polygon: {
        shapeOptions: {
          color: "#d62828",
          weight: 2,
          fillColor: "#fca5a5",
          fillOpacity: 0.5
        }
      },
      rectangle: {
        shapeOptions: {
          color: "#d62828",
          weight: 2,
          fillColor: "#fca5a5",
          fillOpacity: 0.5
        }
      }
    },
    edit: {
      featureGroup: drawnItems,
      edit: true,

      // ✅ IMPORTANT:
      // We disable Leaflet's built-in remove tool
      // because deletion is now handled via the shape list (red X) and Clear All.
      remove: false
    }
  });

  // Draw handlers
  const pointDrawer = new L.Draw.Marker(map, drawControl.options.draw.marker);
  const polygonDrawer = new L.Draw.Polygon(map, drawControl.options.draw.polygon);
  const rectangleDrawer = new L.Draw.Rectangle(map, drawControl.options.draw.rectangle);

  const polylineDrawer = new L.Draw.Polyline(map, {
    shapeOptions: {
      color: "#0f172a",
      weight: 3
    }
  });

  // Button behaviors
  bindClick("drawPointBtn", () => toggleDrawer(pointDrawer));
  bindClick("drawPolygonBtn", () => toggleDrawer(polygonDrawer));
  bindClick("drawRectangleBtn", () => toggleDrawer(rectangleDrawer));
  bindClick("drawPolylineBtn", () => toggleDrawer(polylineDrawer));

  function toggleDrawer(drawer) {
    if (activeDrawer === drawer) {
      drawer.disable();
      activeDrawer = null;
    } else {
      if (activeDrawer) activeDrawer.disable();
      drawer.enable();
      activeDrawer = drawer;
    }
  }

  /* ----------------------------
     Edit mode toggle
  ---------------------------- */
  bindClick("editDrawBtn", () => {
    if (!editModeEnabled) {
      if (drawnItems.getLayers().length > 0) {
        editHandler = new L.EditToolbar.Edit(map, {
          featureGroup: drawnItems,
          selectedPathOptions: { maintainColor: true }
        });
        editHandler.enable();
        editModeEnabled = true;

        const btn = document.getElementById("editDrawBtn");
        if (btn) btn.textContent = "🚫 Exit Edit Mode";
      } else {
        alert("No shape to edit.");
      }
    } else {
      if (editHandler) editHandler.disable();
      editModeEnabled = false;

      const btn = document.getElementById("editDrawBtn");
      if (btn) btn.textContent = "✏️ Edit Drawing";
    }
  });

  /* ----------------------------
     Clear All (NEW SYSTEM)
  ---------------------------- */
  bindClick("clearDrawBtn", () => {
    // Preferred: clears map + store + UI + dropdowns
    if (typeof window.clearAllDrawnShapes === "function") {
      window.clearAllDrawnShapes();
    } else {
      // fallback
      drawnItems.clearLayers();
      console.log("🗑️ Drawing cleared (fallback)");
    }

    lastDrawnShape = null;
  });

  /* ---------------------------------------------------------
     Draw Created event
     ✅ We only do styling here (marker icon)
     ✅ Naming/storing handled in drawnShapesManager.js
  --------------------------------------------------------- */
  map.on(L.Draw.Event.CREATED, function (e) {
    const layer = e.layer;
    activeDrawer = null;

    // Give markers your yellow icon
    if (layer instanceof L.Marker) {
      const yellowIcon = new L.Icon({
        iconUrl:
          "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
        shadowSize: [41, 41]
      });
      layer.setIcon(yellowIcon);
      layer.options.interactive = true;
    }

    // For compatibility with older logic that expects "lastDrawnShape"
    try {
      lastDrawnShape = layer.toGeoJSON();
    } catch (err) {
      lastDrawnShape = null;
    }
  });

  /* ---------------------------------------------------------
     Draw Edited event
     ✅ update lastDrawnShape to the latest edited feature
  --------------------------------------------------------- */
  map.on("draw:edited", function (evt) {
    let updated = null;

    try {
      if (evt.layers && evt.layers.eachLayer) {
        evt.layers.eachLayer((layer) => {
          updated = layer.toGeoJSON();
        });
      }
    } catch (err) {
      updated = null;
    }

    lastDrawnShape = updated;
    console.log("✏️ Shape edited:", lastDrawnShape);
  });
}

/* ---------------------------------------------------------
   Major Roads Visibility (Zoom dependent)
--------------------------------------------------------- */
function updateMajorRoadsVisibility() {
  if (!roadsEnabled) {
    if (majorRoadsLayer) map.removeLayer(majorRoadsLayer);
    if (majorRoadsLabels) map.removeLayer(majorRoadsLabels);
    return;
  }

  if (!map || !majorRoadsData) return;

  const currentZoom = map.getZoom();

  if (majorRoadsLayer) map.removeLayer(majorRoadsLayer);
  if (majorRoadsLabels) map.removeLayer(majorRoadsLabels);

  if (currentZoom >= 16) {
    const visibleBounds = map.getBounds();

    majorRoadsLayer = L.geoJSON(majorRoadsData, {
      filter: (feature) => visibleBounds.intersects(L.geoJSON(feature).getBounds()),
      style: () => ({
        color: "#ffffff",
        weight: currentZoom >= 18 ? 8 : currentZoom >= 16 ? 6 : 4,
        opacity: 0.5
      })
    }).addTo(map);

    // Labels only at zoom 17+
    if (currentZoom >= 17) {
      majorRoadsLabels = L.layerGroup();

      L.geoJSON(majorRoadsData, {
        filter: (feature) => visibleBounds.intersects(L.geoJSON(feature).getBounds()),
        onEachFeature: (feature, layer) => {
          if (feature.properties?.name) {
            const center = layer.getBounds().getCenter();
            const label = L.marker(center, {
              icon: L.divIcon({
                className: "road-label",
                html: `<span>${feature.properties.name}</span>`,
                iconSize: null
              }),
              interactive: false
            });
            majorRoadsLabels.addLayer(label);
          }
        }
      });

      majorRoadsLabels.addTo(map);
    }
  }
}
