// ---------------------------------------------------------
// Analysis Layer Preloader
// Ensures selected GeoJSON layers are fetched and stored for analysis.
// ---------------------------------------------------------

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

window.preloadAnalysisLayers = async function preloadAnalysisLayers() {
  // Wait until geojsonLayers exists
  if (!window.geojsonLayers || !Array.isArray(window.geojsonLayers)) {
    console.warn("geojsonLayers not ready yet. Retrying preload in 300ms...");
    await new Promise(res => setTimeout(res, 300));
    return window.preloadAnalysisLayers();
  }

  // Build lookup map
  geojsonLayers.byName = geojsonLayers.byName || {};
  geojsonLayers.forEach(l => geojsonLayers.byName[l.name] = l);

  const tasks = analysisLayersToPreload.map(async (name) => {
    const item = geojsonLayers.byName[name];
    if (!item) return;

    try {
      const response = await fetch(item.url);
      if (!response.ok) throw new Error(`Failed to fetch ${name} (HTTP ${response.status})`);

      const geojson = await response.json();
      item.preloadedData = geojson;

      // Build a Leaflet GeoJSON layer for spatial checks (not necessarily added to map)
      item.loadedLayer = L.geoJSON(geojson);

      console.log(`✅ Preloaded analysis layer: ${name}`);
    } catch (err) {
      console.warn(`❌ Could not preload layer: ${name}`, err);
    }
  });

  await Promise.all(tasks);

  console.log("✅ All analysis layers finished preloading.");
};
