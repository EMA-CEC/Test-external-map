// ---------------------------------------------------------
// Drawn Shapes Manager
// ---------------------------------------------------------

(function () {
  let counter = 1;

  // Global store
  window.drawnShapesStore = window.drawnShapesStore || [];

  function getDefaultName() {
    return `Untitled ${counter++}`;
  }

  function resetUntitledCounterIfEmpty() {
    if (!window.drawnShapesStore.length) {
      counter = 1;
    }
  }

  function ensureDrawLayerGroup() {
    if (!window.drawnItems) {
      window.drawnItems = new L.FeatureGroup();
      map.addLayer(window.drawnItems);
    }
  }

  function applyOpacity(layer, opacity01) {
    const opacity = Math.max(0, Math.min(1, opacity01));

    // Polygons / polylines
    if (layer.setStyle) {
      layer.setStyle({
        opacity: Math.max(0.15, opacity),
        fillOpacity: opacity
      });
      return;
    }

    // Markers
    if (layer.setOpacity) {
      layer.setOpacity(opacity);
      return;
    }
  }

  function bindOrUpdateTooltip(layer, text) {
    // show the name on the map (like Noise Map)
    try {
      if (!layer.getTooltip || !layer.getTooltip()) {
        layer.bindTooltip(text, {
          permanent: false,
          direction: "top",
          sticky: true,
          opacity: 0.9
        });
      } else {
        layer.setTooltipContent(text);
      }
    } catch (e) {
      // Some layer types may not support tooltips; ignore safely
    }
  }

  function showLayer(storeItem, show) {
    storeItem.visible = show;

    if (show) {
      if (!drawnItems.hasLayer(storeItem.layer)) {
        drawnItems.addLayer(storeItem.layer);
      }
    } else {
      if (drawnItems.hasLayer(storeItem.layer)) {
        drawnItems.removeLayer(storeItem.layer);
      }
    }
  }

  function deleteShape(storeItem) {
    // remove from map group
    try {
      if (window.drawnItems && drawnItems.hasLayer(storeItem.layer)) {
        drawnItems.removeLayer(storeItem.layer);
      }
    } catch (e) {}

    // remove from store
    window.drawnShapesStore = window.drawnShapesStore.filter(s => s.id !== storeItem.id);

    // reset numbering if list is now empty
    resetUntitledCounterIfEmpty();

    // update UI
    renderShapesList();

    // refresh spatial analysis dropdowns
    if (typeof window.refreshSpatialAnalysisSelectors === "function") {
      window.refreshSpatialAnalysisSelectors();
    }
  }

  // Clear all shapes everywhere (map + store + UI)
  window.clearAllDrawnShapes = function clearAllDrawnShapes() {
    try {
      if (window.drawnItems) {
        drawnItems.clearLayers();
      }
    } catch (e) {}

    window.drawnShapesStore = [];
    counter = 1;

    renderShapesList();

    if (typeof window.refreshSpatialAnalysisSelectors === "function") {
      window.refreshSpatialAnalysisSelectors();
    }
  };

  function renderShapesList() {
    const list = document.getElementById("myShapesList");
    if (!list) return;

    list.innerHTML = "";

    if (!window.drawnShapesStore.length) {
      list.innerHTML = `<div class="muted">No shapes drawn yet.</div>`;
      return;
    }

    window.drawnShapesStore.forEach((s) => {
      const wrap = document.createElement("div");
      wrap.className = "shape-item";

      // Row 1: name + visibility + delete
      const row = document.createElement("div");
      row.className = "shape-row";

      const nameInput = document.createElement("input");
      nameInput.className = "shape-name";
      nameInput.value = s.name;
      nameInput.title = "Rename shape";

      // Rename updates store + tooltip + spatial dropdowns
      nameInput.addEventListener("input", () => {
        const newName = nameInput.value.trim();

        if (!newName) {
          // if blank, revert to default but do not re-number
          s.name = s.defaultName;
          nameInput.value = s.defaultName;
        } else {
          s.name = newName;
        }

        // Update label on map
        bindOrUpdateTooltip(s.layer, s.name);

        // Update spatial selectors
        if (typeof window.refreshSpatialAnalysisSelectors === "function") {
          window.refreshSpatialAnalysisSelectors();
        }
      });

      const toggleBtn = document.createElement("button");
      toggleBtn.className = "shape-btn";
      toggleBtn.textContent = s.visible ? "👁" : "🚫";
      toggleBtn.title = s.visible ? "Hide shape" : "Show shape";

      toggleBtn.addEventListener("click", () => {
        showLayer(s, !s.visible);
        toggleBtn.textContent = s.visible ? "👁" : "🚫";
        toggleBtn.title = s.visible ? "Hide shape" : "Show shape";
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "shape-delete-btn";
      deleteBtn.textContent = "✖";
      deleteBtn.title = "Delete shape";
      deleteBtn.addEventListener("click", () => deleteShape(s));

      row.appendChild(nameInput);
      row.appendChild(toggleBtn);
      row.appendChild(deleteBtn);

      // Row 2: opacity slider
      const controls = document.createElement("div");
      controls.className = "shape-controls";

      const label = document.createElement("label");
      label.textContent = "Opacity";

      const slider = document.createElement("input");
      slider.className = "shape-opacity";
      slider.type = "range";
      slider.min = "0";
      slider.max = "1";
      slider.step = "0.05";
      slider.value = String(s.opacity);

      slider.addEventListener("input", () => {
        s.opacity = parseFloat(slider.value);
        applyOpacity(s.layer, s.opacity);
      });

      controls.appendChild(label);
      controls.appendChild(slider);

      wrap.appendChild(row);
      wrap.appendChild(controls);

      list.appendChild(wrap);
    });
  }

  // Expose
  window.renderShapesList = renderShapesList;

  // Add shape to store, respecting user name if provided
  window.addDrawnShape = function addDrawnShape(layer, userName = "") {
    ensureDrawLayerGroup();

    const trimmed = String(userName || "").trim();
    const defaultName = getDefaultName();
    const finalName = trimmed ? trimmed : defaultName;

    const storeItem = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      name: finalName,
      defaultName,
      layer,
      visible: true,
      opacity: 0.8
    };

    // Add to map group
    drawnItems.addLayer(layer);

    // Apply default opacity
    applyOpacity(layer, storeItem.opacity);

    // Bind label on map
    bindOrUpdateTooltip(layer, storeItem.name);

    // Save
    window.drawnShapesStore.push(storeItem);

    // Update UI
    renderShapesList();

    // Refresh spatial analysis dropdowns
    if (typeof window.refreshSpatialAnalysisSelectors === "function") {
      window.refreshSpatialAnalysisSelectors();
    }
  };

  // Hook into Leaflet Draw created event
  window.initDrawnShapesManager = function initDrawnShapesManager() {
    ensureDrawLayerGroup();

    map.on(L.Draw.Event.CREATED, function (event) {
      const layer = event.layer;

      const name = prompt("Name this shape (optional):") || "";
      window.addDrawnShape(layer, name);
    });

    const clearBtn = document.getElementById("clearDrawBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        window.clearAllDrawnShapes();
      });
    }

    // Initial render
    renderShapesList();
  };
})();
