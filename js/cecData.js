// Fetches and displays CEC application data as markers and heatmap

let markers, heatLayer, currentView = "cluster";
window.allCECData = []; // Store original dataset and expose globally
window.filteredCECData = []; // filtered results for Spatial analysis CEC list

function escapeHTML(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildCECPopupHTML(item) {
  const ref = escapeHTML(item["CEC Reference"] || "N/A");
  const year = escapeHTML(item["Year"] || "N/A");
  const applicant = escapeHTML(item["Applicant"] || "N/A");
  const officer = escapeHTML(item["Officer Name"] || "N/A");
  const da = escapeHTML(item["Designated Activity"] || "N/A");
  const location = escapeHTML(item["Activity Location"] || "N/A");
  const desc = escapeHTML(item["Activity Description"] || "N/A");
  const comment = escapeHTML(item["Comment"] || "N/A");

  const statusRaw = item["Application Determination"] || "Pending";
  const statusBadgeHTML = getStatusBadge(statusRaw);

  const detDate = formatDateOnly(item["Determination Date"]);

  return `
    <div class="cec-popup">
      <div class="cec-popup__header">
        <div class="cec-popup__head-left">
          <div class="cec-popup__eyebrow">CEC Application</div>
          <div class="cec-popup__title">${ref}</div>
        </div>

        <div class="cec-popup__head-right">
          ${statusBadgeHTML}
        </div>
      </div>

      <div class="cec-popup__meta">
        <span><strong>Year:</strong> ${year}</span>
        <span class="cec-popup__dot">•</span>
        <span><strong>Officer:</strong> ${officer}</span>
      </div>

      <div class="cec-popup__grid">
        <div class="cec-popup__row">
          <div class="cec-popup__k">Applicant</div>
          <div class="cec-popup__v">${applicant}</div>
        </div>

        <div class="cec-popup__row">
          <div class="cec-popup__k">Designated Activity</div>
          <div class="cec-popup__v">${da}</div>
        </div>

        <div class="cec-popup__row">
          <div class="cec-popup__k">Location</div>
          <div class="cec-popup__v">${location}</div>
        </div>

        <div class="cec-popup__row">
          <div class="cec-popup__k">Determination Date</div>
          <div class="cec-popup__v">${escapeHTML(detDate || "N/A")}</div>
        </div>
      </div>

      <div class="cec-popup__section">
        <div class="cec-popup__label">Description</div>
        <div class="cec-popup__text">${desc}</div>
      </div>

      <div class="cec-popup__section">
        <div class="cec-popup__label">Comment</div>
        <div class="cec-popup__text">${comment}</div>
      </div>

      <div class="cec-popup__coords">
        <span><strong>UTM:</strong> E ${escapeHTML(item["Easting"] || "—")} / N ${escapeHTML(item["Northing"] || "—")}</span>
      </div>
    </div>
  `;
}

// Load and display CEC Applications
function loadCECData() {
  const CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRBy94L3h3BDlk7wBSQH1eDTFIcBB6zPyyHLhbgc3PQWk-Xg7K30H9WXvRNnusAFx3vODUoO3z1pxjV/pub?gid=0&single=true&output=csv";

  fetch(CSV_URL)
    .then((res) => res.text())
    .then((csvText) => {
      // Parse CSV into array of objects using PapaParse
      const parsed = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
      });

      let data = parsed.data;

      // Convert numeric fields (Easting/Northing) from string → number
      data = data.map((row) => {
        return {
          ...row,
          Easting: row.Easting ? parseFloat(row.Easting) : null,
          Northing: row.Northing ? parseFloat(row.Northing) : null,
        };
      });

      // Store globally for filters + analysis
      allCECData = data;
      filteredCECData = data.slice();

      // Populate dropdowns
      const statuses = [
        ...new Set(
          data.map((item) => item["Application Determination"]).filter(Boolean)
        ),
      ].sort();

      if (window.DA_OPTIONS) {
        populateDropdown("activitySelect", window.DA_OPTIONS);
      }

      populateDropdown("statusSelect", statuses);

      const heatPoints = [];

      markers = L.markerClusterGroup({
        iconCreateFunction: function (cluster) {
          const count = cluster.getChildCount();
          let className = "marker-cluster-small";

          if (count > 50) className = "marker-cluster-large";
          else if (count > 20) className = "marker-cluster-medium";

          return L.divIcon({
            html: `<div><span>${count}</span></div>`,
            className: `marker-cluster ${className}`,
            iconSize: L.point(40, 40),
          });
        },
      });

      data.forEach((item) => {
        // Make sure Easting/Northing exist before converting
        if (!item.Easting || !item.Northing) return;

        const [lat, lon] = convertUTMToLatLonSmart(item.Easting, item.Northing);
        if (lat === null || lon === null) return;

        // ✅ Pretty popup HTML
        const popupContent = buildCECPopupHTML(item);

        const marker = L.marker([lat, lon]).bindPopup(popupContent, {
          maxWidth: 380,
          className: "cec-popup-wrapper",
        });

        markers.addLayer(marker);

        heatPoints.push([lat, lon, 0.6]);
      });

      heatLayer = L.heatLayer(heatPoints, {
        radius: 20,
        blur: 15,
        maxZoom: 17,
      });

      map.addLayer(markers);

      // Enable filter + toggle UI
      document.getElementById("dataViewToggle").classList.remove("disabled");
      document.getElementById("filterContainer").classList.remove("disabled");
    })
    .catch((err) => {
      console.error("❌ Error loading CSV data:", err);
    });
}

// Toggle between cluster, heatmap, or hide view
function switchDataView(mode) {
  // Remove both layers before switching view
  if (map.hasLayer(markers)) map.removeLayer(markers);
  if (map.hasLayer(heatLayer)) map.removeLayer(heatLayer);

  // Set current view mode
  currentView = mode;

  // Re-render based on the current full dataset
  renderCECData(allCECData);
}

function renderCECData(data) {
  // Clear existing layers
  if (markers) map.removeLayer(markers);
  if (heatLayer) map.removeLayer(heatLayer);

  const heatPoints = [];

  markers = L.markerClusterGroup({
    iconCreateFunction: function (cluster) {
      const count = cluster.getChildCount();
      let className = "marker-cluster-small";

      if (count > 50) className = "marker-cluster-large";
      else if (count > 20) className = "marker-cluster-medium";

      return L.divIcon({
        html: `<div><span>${count}</span></div>`,
        className: `marker-cluster ${className}`,
        iconSize: L.point(40, 40),
      });
    },
  });

  // Choose best UTM converter available
  const utmFn = window.convertUTMToLatLonSmart || window.convertUTMToLatLon;

  data.forEach((item) => {
    if (!item.Easting || !item.Northing) return;

    const [lat, lon] = utmFn(item.Easting, item.Northing);
    if (lat == null || lon == null) return;

    // Pretty popup HTML
    const popupContent = buildCECPopupHTML(item);

    const marker = L.marker([lat, lon]).bindPopup(popupContent, {
      maxWidth: 380,
      className: "cec-popup-wrapper",
    });

    markers.addLayer(marker);

    heatPoints.push([lat, lon, 0.6]);
  });

  heatLayer = L.heatLayer(heatPoints, { radius: 20, blur: 15, maxZoom: 17 });

  // Add view based on currentView
  if (currentView === "cluster") {
    map.addLayer(markers);
  } else if (currentView === "heatmap") {
    map.addLayer(heatLayer);
  }

  // Update stats text
  const stats = document.getElementById("filterStats");
  if (stats) stats.innerText = `Showing ${data.length} application(s)`;
}
