document.addEventListener("DOMContentLoaded", () => {
  function startInset() {
    if (!window.map || !window.L || !(map instanceof L.Map)) {
      setTimeout(startInset, 250);
      return;
    }

    function boundsAtZoom(center, zoom) {
      const size = map.getSize();
      const half = size.divideBy(2);
      const centerPx = map.project(center, zoom);

      const sw = map.unproject(centerPx.subtract(half), zoom);
      const ne = map.unproject(centerPx.add(half), zoom);

      return L.latLngBounds(sw, ne);
    }

    const BOUNDS_TRINIDAD = L.latLngBounds([9.95, -61.95], [10.95, -60.45]);
    const BOUNDS_TOBAGO   = L.latLngBounds([11.05, -60.95], [11.40, -60.40]);
    const BOUNDS_BOTH     = L.latLngBounds([9.95, -61.95], [11.45, -60.35]);

    const insetMap = L.map("inset-map", {
      attributionControl: false,
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      touchZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      inertia: false,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
      { subdomains: "abcd", maxZoom: 19 }
    ).addTo(insetMap);

    const viewRect = L.rectangle(map.getBounds(), {
      color: "red",
      weight: 2,
      fill: false
    }).addTo(insetMap);

    function insetModeForCenter(centerLatLng) {
      if (BOUNDS_TOBAGO.contains(centerLatLng)) return "TOBAGO";
      if (BOUNDS_TRINIDAD.contains(centerLatLng)) return "TRINIDAD";
      return "BOTH";
    }

    const RECT_ZOOM_MIN = 12;
    const RECT_ZOOM_MAX = 14;

    function updateInset() {
      const center = map.getCenter();
      const currentZoom = map.getZoom();

      const mode = insetModeForCenter(center);

      let targetBounds = BOUNDS_BOTH;
      if (mode === "TOBAGO") targetBounds = BOUNDS_TOBAGO;
      if (mode === "TRINIDAD") targetBounds = BOUNDS_TRINIDAD;

      const clampedZoom = Math.max(RECT_ZOOM_MIN, Math.min(currentZoom, RECT_ZOOM_MAX));
      const rectBounds = boundsAtZoom(center, clampedZoom);

      viewRect.setBounds(rectBounds);

      if (mode === "BOTH") {
        const combined = L.latLngBounds(targetBounds);
        combined.extend(rectBounds);
        insetMap.fitBounds(combined, { animate: false, padding: [8, 8] });
      } else {
        insetMap.fitBounds(targetBounds, { animate: false, padding: [8, 8] });
      }
    }

    map.whenReady(() => {
      insetMap.invalidateSize();
      updateInset();
    });

    map.on("moveend zoomend", updateInset);
  }

  startInset();
});
