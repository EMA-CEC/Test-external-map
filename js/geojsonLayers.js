// Handles the geojson layers and how they are displayed

const layersWithLegend = [
  "Ecological Susceptibility",
  "Geological Susceptibility",
  "Social Susceptibility",
  "Hydrogeology"
];

/**
 * ✅ Group order + titles (Noise Map style)
 * Each layer below gets a `type` that matches one of these IDs.
 */
const GEOJSON_LAYER_GROUPS = [
  { id: "protected", title: "Protected Areas" },
  { id: "administrative", title: "Administrative" },
  { id: "watershed", title: "Watersheds" },
  { id: "susceptibility", title: "Susceptibility" },
  { id: "policy", title: "Policy" },
  { id: "hydrology", title: "Hydrology" },
  { id: "other", title: "Other" },
];

/**
 * ✅ Registry (add `type:` to each layer)
 */
const geojsonLayers = [
  {
    name: "Aripo Savannas",
    url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Aripo%20Savannas.geojson",
    metadata: "https://drive.google.com/file/d/1P3yIDzSHwJcM4Imvm5Am-5oOaHe_Ronu/view",
    type: "protected",
  },
  {
    name: "Caroni Swamp",
    url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Caroni%20Swamp.geojson",
    metadata: "https://drive.google.com/file/d/1z37wlyEeJuXSk1N5sx1G3koweFpujHrs/view",
    type: "protected",
  },
  {
    name: "Forest Reserve",
    url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Forest%20Reserves.geojson",
    metadata: "https://drive.google.com/file/d/1rhdQPFfdhvHpYQl8TN5RgJ16SQelMOP9/view",
    type: "protected",
  },
  {
    name: "Matura National Park",
    url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Matura%20National%20Park.geojson",
    metadata: "https://drive.google.com/file/d/1H0VDAgxH4CLgtIKQ2TD4QJ1a0UxrOMY0/view",
    type: "protected",
  },
  {
    name: "Nariva Swamp",
    url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Nariva%20Swamp.geojson",
    metadata: "https://drive.google.com/file/d/13BDSAFU7Qs15-u2YivDFq1ROSgaJQrYS/view",
    type: "protected",
  },

  {
    name: "Municipality",
    url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Municipality.geojson",
    metadata: "https://drive.google.com/file/d/19--aDF7Q2rsx0jRN7LfnKHNBEiHrx8A-/view",
    type: "administrative",
  },

  {
    name: "Tobago Watersheds",
    url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Tobago%20Watersheds.geojson",
    metadata: "https://drive.google.com/file/d/1i7fmO0UjjJhJ0w5ufhCZVOXMN6NZNrxe/view",
    type: "watershed",
  },
  {
    name: "Trinidad Watersheds",
    url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Trinidad%20Watersheds.geojson",
    metadata: "https://drive.google.com/file/d/1l9dXsmtecxBD_abEpj1sM3wDVN6_O51L/view",
    type: "watershed",
  },

  {
    name: "Ecological Susceptibility",
    url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Ecological%20Susceptibility.geojson",
    metadata: "https://drive.google.com/file/d/1_H6wEto7ht44rur9SIng2W7d6CkRr9aq/view",
    type: "susceptibility",
  },
  {
    name: "Geological Susceptibility",
    url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Geological%20Susceptibility.geojson",
    metadata: "https://drive.google.com/file/d/1RLennVCE2-V34DZdDI_GqoWL0kV2H1eb/view",
    type: "susceptibility",
  },
  {
    name: "Hydrogeology",
    url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Hydrogeology.geojson",
    metadata: "https://drive.google.com/file/d/1njCS4VEy0iaJYln1uh2s3TSa9I_xdlMd/view",
    type: "susceptibility",
  },
  {
    name: "Social Susceptibility",
    url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Social%20Susceptibility.geojson",
    metadata: "https://drive.google.com/file/d/11B-UrWT-_jUHYe3_gDnLmIxLj5CDgSGx/view",
    type: "susceptibility",
  },

  {
    name: "Tobago TCPD Policy",
    url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Tobago%20TCPD%20Policy.geojson",
    metadata: "https://drive.google.com/file/d/1Rr_DDeLBbDdRrlobAysHyw_fLNd5bTFb/view",
    type: "policy",
  },
  {
    name: "Trinidad TCPD Policy",
    url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Trinidad%20TCPD%20Policy.geojson",
    metadata: "https://drive.google.com/file/d/1qXAAZb5-lUhmMo-WAvjQqOMkFlpyWymG/view",
    type: "policy",
  },

  {
    name: "Waterways",
    url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Waterways.geojson",
    metadata: "https://drive.google.com/file/d/1_EV_J2SPb9YGjIL3nJ_iQSrbnsgFDDX2/view",
    type: "hydrology",
  }
];

// ✅ Important: Build lookup so other modules can do geojsonLayers.byName["Layer Name"]
geojsonLayers.byName = {};
geojsonLayers.forEach(l => (geojsonLayers.byName[l.name] = l));

/**
 * Active Leaflet Layers (added to the map)
 */
const activeGeojsonLayers = {};

const specialOrangeLayers = [
  "Aripo Savannas",
  "Aripo Savannas (Buffer)",
  "Caroni Swamp",
  "Matura National Park (Buffer)",
  "Matura National Park",
  "Nariva Swamp",
  "Nariva Swamp (Buffer)"
];

const waterwayLayer = "Waterways";

const categorizedLayers = {
  "Forest Reserve": "NAME",
  "Municipality": "NAME_1",
  "Tobago Watersheds": "WATERSHED",
  "Trinidad Watersheds": "NAME",
  "Ecological Susceptibility": "Class",
  "Geological Susceptibility": "Class",
  "Hydrogeology": "ATTRIB",
  "Social Susceptibility": "Class",
  "Tobago TCPD Policy": "Class_Name",
  "Trinidad TCPD Policy": "Class_Name",
  "Waterways": "name"
};

function getRandomColor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = hash % 360;
  return `hsl(${h}, 70%, 70%)`;
}

function getLayerStyle(layerName, feature, opacity = 1, weight = 2) {
  if (specialOrangeLayers.includes(layerName)) {
    return {
      color: "#d97706",
      fillColor: "#fde68a",
      weight,
      fillOpacity: opacity,
      opacity
    };
  }

  if (layerName === waterwayLayer) {
    return {
      color: "#2563eb",
      weight,
      opacity
    };
  }

  const field = categorizedLayers[layerName];
  if (field && feature.properties && feature.properties[field]) {
    const value = feature.properties[field];
    return {
      color: "#1f2937",
      fillColor: getRandomColor(value),
      weight,
      fillOpacity: opacity,
      opacity
    };
  }

  return {
    color: "#4b5563",
    fillColor: "#d1d5db",
    weight,
    fillOpacity: opacity,
    opacity
  };
}

/**
 * ✅ Helper: group layers by their type (Noise Map style)
 */
function groupRepoLayers(config) {
  const groups = {};
  for (const cfg of config) {
    const t = cfg.type || "other";
    if (!groups[t]) groups[t] = [];
    groups[t].push(cfg);
  }
  return groups;
}

/**
 * ✅ Helper: build one toggle row (same UI you already had)
 */
function addLayerRow(item, container) {
  const wrapper = document.createElement("div");
  wrapper.className = "geojson-toggle";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = `layer-${item.name}`;

  const label = document.createElement("label");
  label.htmlFor = checkbox.id;
  label.textContent = item.name;

  const linkIcon = document.createElement("a");
  if (item.metadata) {
    linkIcon.href = item.metadata;
    linkIcon.target = "_blank";
    linkIcon.innerHTML = '<i class="fas fa-file-alt"></i>';
    linkIcon.title = "View metadata";
    linkIcon.style.marginLeft = "6px";
    linkIcon.style.fontSize = "1.1rem";
  }

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = 0;
  slider.max = 1;
  slider.step = 0.1;
  slider.value = 1;
  slider.title = "Adjust layer transparency";
  slider.style.width = "100px";
  slider.style.marginLeft = "8px";

  wrapper.appendChild(checkbox);
  wrapper.appendChild(label);
  if (item.metadata) wrapper.appendChild(linkIcon);
  wrapper.appendChild(slider);
  container.appendChild(wrapper);

  const separator = document.createElement("hr");
  separator.style.border = "0";
  separator.style.height = "1px";
  separator.style.backgroundColor = "#ccc";
  separator.style.margin = "6px 0";
  container.appendChild(separator);

  // ✅ Toggle behavior
  checkbox.addEventListener("change", async () => {
    if (checkbox.checked) {
      const response = await fetch(item.url);
      const geojson = await response.json();

      // Store the fetched data so Spatial Analysis can use it
      item.preloadedData = geojson;

      const zoom = map.getZoom();
      const weight = zoom >= 14 ? 3 : zoom >= 12 ? 2 : 1;

      const layer = L.geoJSON(geojson, {
        style: feature => getLayerStyle(item.name, feature, parseFloat(slider.value), weight),
        onEachFeature: (feature, layerObj) => {
          const field = categorizedLayers[item.name];
          if (field && feature.properties && feature.properties[field]) {
            layerObj.bindPopup(`<strong>${feature.properties[field]}</strong>`);
          } else if (specialOrangeLayers.includes(item.name)) {
            layerObj.bindPopup(`<strong>${item.name}</strong>`);
          }
        }
      }).addTo(map);

      activeGeojsonLayers[item.name] = layer;

      // Store a reference for analysis logic
      item.loadedLayer = layer;

      if (layersWithLegend.includes(item.name)) {
        const field = categorizedLayers[item.name];
        const legendHTML = buildLegendHTML(geojson, field);
        showLegend(item.name, legendHTML);
      }
    } else {
      if (activeGeojsonLayers[item.name]) {
        map.removeLayer(activeGeojsonLayers[item.name]);
        delete activeGeojsonLayers[item.name];
      }
      if (layersWithLegend.includes(item.name)) {
        hideLegend(item.name);
      }
    }
  });

  // ✅ Slider behavior
  slider.addEventListener("input", () => {
    const layer = activeGeojsonLayers[item.name];
    const zoom = map.getZoom();
    const weight = zoom >= 14 ? 3 : zoom >= 12 ? 2 : 1;
    const opacity = parseFloat(slider.value);

    if (layer && layer.setStyle) {
      layer.setStyle(feature => getLayerStyle(item.name, feature, opacity, weight));
    }
  });
}

/**
 * ✅ Main setup: build grouped UI
 */
function setupGeoJSONLayers() {
  const container = document.getElementById("geojsonLayerList");
  if (!container) return;

  container.innerHTML = "";

  const grouped = groupRepoLayers(geojsonLayers);

  // Build group sections in consistent order
  GEOJSON_LAYER_GROUPS.forEach(group => {
    const items = grouped[group.id];
    if (!items || !items.length) return;

    const groupBlock = document.createElement("div");
    groupBlock.className = "geojson-group-block";

    const groupTitle = document.createElement("h3");
    groupTitle.className = "geojson-group-title";
    groupTitle.textContent = group.title;

    const groupList = document.createElement("div");
    groupList.className = "geojson-group-list";

    groupBlock.appendChild(groupTitle);
    groupBlock.appendChild(groupList);
    container.appendChild(groupBlock);

    items.forEach(item => addLayerRow(item, groupList));
  });

  // Collapse/Expand All Layers
  const toggleAllBtn = document.getElementById("toggleAllLayersBtn");
  if (toggleAllBtn) {
    toggleAllBtn.addEventListener("click", () => {
      const allChecked = Object.keys(activeGeojsonLayers).length > 0;
      const checkboxes = document.querySelectorAll("#geojsonLayerList input[type='checkbox']");
      checkboxes.forEach(cb => {
        if (cb.checked === allChecked) cb.click();
      });
      toggleAllBtn.textContent = allChecked ? "Expand All" : "Collapse All";
    });
  }

  // Zoom-dependent weight update
  map.on("zoomend", () => {
    const zoom = map.getZoom();
    const weight = zoom >= 14 ? 3 : zoom >= 12 ? 2 : 1;

    Object.entries(activeGeojsonLayers).forEach(([name, layer]) => {
      const checkbox = document.getElementById(`layer-${name}`);
      const slider = checkbox?.parentElement?.querySelector('input[type="range"]');
      const opacity = slider ? parseFloat(slider.value) : 1;

      if (layer && layer.setStyle) {
        layer.setStyle(feature => getLayerStyle(name, feature, opacity, weight));
      }
    });
  });
}

const activeLegends = {};

function buildLegendHTML(geojson, field) {
  const uniqueValues = [...new Set(geojson.features.map(f => f.properties?.[field]))].filter(v => !!v);
  uniqueValues.sort();

  return `
    <h4>Legend</h4>
    ${uniqueValues.map(v => `
      <div class="legend-item">
        <div class="legend-color" style="background:${getRandomColor(v)}"></div>
        ${v}
      </div>
    `).join("")}
  `;
}

function showLegend(layerName, html) {
  const container = document.getElementById("legendContainer");
  container.innerHTML = `<h4>${layerName}</h4>` + html;
  container.style.display = "block";
  activeLegends[layerName] = true;
}

function hideLegend(layerName) {
  delete activeLegends[layerName];

  const remaining = Object.keys(activeLegends);

  if (remaining.length === 0) {
    const container = document.getElementById("legendContainer");
    container.innerHTML = "";
    container.style.display = "none";
  } else {
    const lastVisible = remaining[remaining.length - 1];
    const field = categorizedLayers[lastVisible];
    const geojson = geojsonLayers.find(l => l.name === lastVisible)?.preloadedData;
    if (field && geojson) {
      const legendHTML = buildLegendHTML(geojson, field);
      showLegend(lastVisible, legendHTML);
    }
  }
}

// Expose GeoJSON configuration globally for other modules (Spatial Analysis, preload, etc.)
window.geojsonLayers = geojsonLayers;
window.GEOJSON_LAYER_GROUPS = GEOJSON_LAYER_GROUPS;
window.layersWithLegend = layersWithLegend;
window.categorizedLayers = categorizedLayers;
window.activeGeojsonLayers = activeGeojsonLayers;
