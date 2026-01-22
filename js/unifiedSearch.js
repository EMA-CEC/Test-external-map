document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("unifiedSearchInput");
  const clearBtn = document.getElementById("unifiedSearchClear");
  const suggestions = document.getElementById("unifiedSearchSuggestions");

  if (!input || !clearBtn || !suggestions) return;

  let marker = null;
  let abortController = null;
  let timeout = null;

  function clearSuggestions() {
    suggestions.innerHTML = "";
  }

  function clearMarker() {
    if (marker && map) {
      map.removeLayer(marker);
      marker = null;
    }
  }

  function zoomTo(lat, lon, label) {
    clearMarker();

    marker = L.circleMarker([lat, lon], {
      radius: 8,
      color: "#e11d48",
      fillColor: "#f43f5e",
      fillOpacity: 0.8,
      weight: 2
    }).addTo(map).bindPopup(label || "Search Result").openPopup();

    map.setView([lat, lon], 16);
  }

  // Detect: Lat/Lon
  function parseLatLon(q) {
    const match = q.match(/(-?\d+(\.\d+)?)\s*[, ]\s*(-?\d+(\.\d+)?)/);
    if (!match) return null;

    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[3]);

    if (isNaN(lat) || isNaN(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

    return { lat, lon };
  }

  // Detect: UTM (E,N)
  function parseUTM(q) {
    const match = q.match(/(\d{5,7})\s*[, ]\s*(\d{6,8})/);
    if (!match) return null;

    const e = parseFloat(match[1]);
    const n = parseFloat(match[2]);
    if (isNaN(e) || isNaN(n)) return null;

    return { easting: e, northing: n };
  }

  async function searchLocation(query) {
    if (abortController) abortController.abort();
    abortController = new AbortController();

    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=tt&q=${encodeURIComponent(query)}&limit=5`;

    const res = await fetch(url, { signal: abortController.signal });
    const results = await res.json();

    clearSuggestions();

    results.forEach(place => {
      const li = document.createElement("li");
      li.textContent = place.display_name;

      li.addEventListener("click", () => {
        input.value = place.display_name;
        clearSuggestions();
        zoomTo(parseFloat(place.lat), parseFloat(place.lon), `<strong>${place.display_name}</strong>`);
      });

      suggestions.appendChild(li);
    });
  }

  input.addEventListener("input", () => {
    const q = input.value.trim();
    clearSuggestions();

    if (!q) return;

    // Delay typing calls
    clearTimeout(timeout);
    timeout = setTimeout(async () => {
      // 1) Lat/Lon
      const ll = parseLatLon(q);
      if (ll) {
        zoomTo(ll.lat, ll.lon, `<strong>Lat/Lon</strong><br>${ll.lat}, ${ll.lon}`);
        return;
      }

      // 2) UTM (uses smart zone if you implemented it)
      const utm = parseUTM(q);
      if (utm) {
        const fn = window.convertUTMToLatLonSmart || window.convertUTMToLatLon;
        const [lat, lon] = fn(utm.easting, utm.northing);
        zoomTo(lat, lon, `<strong>UTM</strong><br>E: ${utm.easting}<br>N: ${utm.northing}`);
        return;
      }

      // 3) Normal location string
      await searchLocation(q);
    }, 250);
  });

  // Press Enter: click first suggestion if available
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const first = suggestions.querySelector("li");
      if (first) first.click();
    }
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    clearSuggestions();
    clearMarker();
  });

  input.addEventListener("blur", () => {
    setTimeout(clearSuggestions, 200);
  });
});
