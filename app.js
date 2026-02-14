/* global maplibregl, pmtiles */

const UI = {
  statusText: document.getElementById("status-text"),
  toggleParcels: document.getElementById("toggle-parcels"),
  toggleParks: document.getElementById("toggle-parks"),
  toggleResidentialOnly: document.getElementById("toggle-residential-only"),
  toggleTracts: document.getElementById("toggle-tracts"),
  toggleTownships: document.getElementById("toggle-townships"),
  toggleDistricts: document.getElementById("toggle-districts"),
  parksMetro: document.getElementById("parks-metro"),
  parksAll: document.getElementById("parks-all"),
  bandFilterList: document.getElementById("bandFilterList"),
  bandSelectAll: document.getElementById("band-select-all"),
  bandClear: document.getElementById("band-clear"),
  refreshBtn: document.getElementById("refresh"),
  pendingHint: document.getElementById("pending-hint"),
  distTypeStraight: document.getElementById("dist-type-straight"),
  distTypeRoad: document.getElementById("dist-type-road"),
  legendStraight: document.getElementById("legend-straight"),
  legendRoad: document.getElementById("legend-road"),
  detailsContent: document.getElementById("details-content"),
};

function setStatus(message) {
  UI.statusText.textContent = message;
}

function urlHere(relPath) {
  return new URL(relPath, window.location.href).toString();
}

async function fileExists(url) {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok;
  } catch {
    return false;
  }
}

async function supportsByteRange(url) {
  try {
    const r = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" } });
    return r.status === 206;
  } catch {
    return false;
  }
}

async function fetchJson(url) {
  const r = await fetch(url, { method: "GET" });
  if (!r.ok) throw new Error(`Fetch failed (${r.status}): ${url}`);
  return r.json();
}

function setLayerVisibility(map, layerId, visible) {
  if (!map.getLayer(layerId)) return;
  map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
}

function setGroupVisibility(map, layerIds, visible) {
  for (const id of layerIds) setLayerVisibility(map, id, visible);
}

function quantileBreaks(values, classCount) {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (clean.length === 0 || classCount < 2) return [];

  const breaks = [];
  for (let i = 1; i < classCount; i += 1) {
    const p = i / classCount;
    const idx = Math.floor(p * (clean.length - 1));
    breaks.push(clean[idx]);
  }

  // Ensure strictly increasing (MapLibre "step" stops should be monotonic)
  for (let i = 1; i < breaks.length; i += 1) {
    if (breaks[i] <= breaks[i - 1]) breaks[i] = breaks[i - 1] + 1e-6;
  }
  return breaks;
}

function stepColorExpression(metric, breaks, colors) {
  const base = ["step", ["to-number", ["get", metric]], colors[0]];
  for (let i = 0; i < breaks.length; i += 1) {
    base.push(breaks[i], colors[i + 1]);
  }
  return [
    "case",
    ["all", ["has", metric], ["!=", ["get", metric], null]],
    base,
    "#cccccc",
  ];
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtNum(v, digits = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "NA";
  return n.toFixed(digits);
}

function renderParkDetails(props) {
  const name = props?.park_name ?? props?.name ?? "Park";
  const lines = [`<b>Park:</b> ${escapeHtml(name)}`];
  const amenityList = props?.amenity_list;
  if (amenityList) {
    const arr = Array.isArray(amenityList) ? amenityList : String(amenityList).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    const top = arr.slice(0, 6);
    const more = arr.length - 6;
    lines.push(`<b>Amenities:</b> ${escapeHtml(top.join(", "))}${more > 0 ? ` (+${more} more)` : ""}`);
  }
  if (props?.fee_status != null) lines.push(`<b>Fee:</b> ${escapeHtml(String(props.fee_status))}`);
  if (props?.hours_status != null) lines.push(`<b>Hours:</b> ${escapeHtml(String(props.hours_status))}`);
  if (props?.active_passive != null) lines.push(`<b>Type:</b> ${escapeHtml(String(props.active_passive))}`);
  const ndvi = props?.ndvi_mean_inside ?? props?.ndvi_inside_mean;
  if (ndvi != null) lines.push(`<b>NDVI inside:</b> ${escapeHtml(fmtNum(ndvi, 3))}`);
  const ring = props?.ndvi_ring_500m_mean;
  if (ring != null) lines.push(`<b>NDVI around:</b> ${escapeHtml(fmtNum(ring, 3))}`);
  const delta = props?.greenness_delta_500m;
  if (delta != null) {
    const interp = Number(delta) > 0 ? "Greener than surroundings" : Number(delta) < 0 ? "Less green than surroundings" : "Similar to surroundings";
    lines.push(`<b>Green-ness:</b> ${escapeHtml(interp)} (Δ ${escapeHtml(fmtNum(delta, 3))})`);
  }
  return lines.join("<br>");
}

function renderTractDetails(props) {
  const name = props?.NAME ?? props?.NAMELSAD ?? "Tract";
  const lines = [`<b>Tract:</b> ${escapeHtml(name)}`];
  if (props?.dist_to_park_miles != null) lines.push(`<b>Distance to park:</b> ${escapeHtml(fmtNum(props.dist_to_park_miles, 2))} mi`);
  if (props?.TotalPopulation != null) lines.push(`<b>Population:</b> ${escapeHtml(Number(props.TotalPopulation).toLocaleString())}`);
  if (props?.LPA_CrudePrev != null) lines.push(`<b>Physical inactivity:</b> ${escapeHtml(fmtNum(props.LPA_CrudePrev, 2))}%`);
  if (props?.OBESITY_CrudePrev != null) lines.push(`<b>Obesity:</b> ${escapeHtml(fmtNum(props.OBESITY_CrudePrev, 2))}%`);
  if (props?.MHLTH_CrudePrev != null) lines.push(`<b>Mental distress:</b> ${escapeHtml(fmtNum(props.MHLTH_CrudePrev, 2))}%`);
  if (props?.greenness_relative != null) lines.push(`<b>Green-ness (relative):</b> ${escapeHtml(fmtNum(props.greenness_relative, 3))}`);
  return lines.join("<br>");
}

function renderTownshipDetails(props) {
  const name = props?.NAME ?? props?.NAMELSAD ?? props?.name ?? "Township";
  const lines = [`<b>Township:</b> ${escapeHtml(name)}`];
  if (props?.total_population != null) lines.push(`<b>Population:</b> ${escapeHtml(Number(props.total_population).toLocaleString())}`);
  if (props?.dist_to_park_miles != null) lines.push(`<b>Avg distance to park:</b> ${escapeHtml(fmtNum(props.dist_to_park_miles, 2))} mi`);
  if (props?.LPA_CrudePrev != null) lines.push(`<b>Physical inactivity (avg):</b> ${escapeHtml(fmtNum(props.LPA_CrudePrev, 2))}%`);
  if (props?.OBESITY_CrudePrev != null) lines.push(`<b>Obesity (avg):</b> ${escapeHtml(fmtNum(props.OBESITY_CrudePrev, 2))}%`);
  if (props?.MHLTH_CrudePrev != null) lines.push(`<b>Mental distress (avg):</b> ${escapeHtml(fmtNum(props.MHLTH_CrudePrev, 2))}%`);
  return lines.join("<br>");
}

function renderDistrictDetails(props) {
  const name = props?.district_name ?? props?.NAME ?? "School district";
  const lines = [`<b>School district:</b> ${escapeHtml(name)}`];
  if (props?.rank != null) lines.push(`<b>Rank:</b> ${escapeHtml(String(props.rank))}`);
  if (props?.rating != null) lines.push(`<b>Rating:</b> ${escapeHtml(String(props.rating))}`);
  return lines.join("<br>");
}

function updateDetailsPanel(html) {
  if (UI.detailsContent) UI.detailsContent.innerHTML = html || '<p class="hint">Click a park, tract, township, or school district on the map.</p>';
}

async function main() {
  setStatus("Loading map...");

  const baseStyle = {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#f8fafc" } },
      { id: "osm", type: "raster", source: "osm" },
    ],
  };

  const map = new maplibregl.Map({
    container: "map",
    style: baseStyle,
    center: [-84.56, 39.4],
    zoom: 12,
  });
  map.addControl(new maplibregl.NavigationControl(), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-right");

  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);

  const urls = {
    parksBoundariesMetro: urlHere("./data/parks_boundaries_metro.geojson"),
    parksBoundariesAll: urlHere("./data/parks_boundaries_all.geojson"),
    parksPointsMetro: urlHere("./data/parks_points_metro.geojson"),
    parksPointsAll: urlHere("./data/parks_points_all.geojson"),
    tracts: urlHere("./data/tracts.geojson"),
    townships: urlHere("./data/townships.geojson"),
    schoolDistricts: urlHere("./data/school_districts.geojson"),
    parcelsPmtiles: urlHere("./data/parcels.pmtiles"),
    parcelsPmtilesVersion: urlHere("./data/parcels.pmtiles.version"),
    parcelsGeojson: urlHere("./data/parcels.geojson"),
    butlerFade: urlHere("./data/butler_county_fade.geojson"),
  };

  const LAYERS = {
    parcels: ["parcels-points"],
    parks: ["parks-fill", "parks-outline", "parks-points", "parks-labels"],
    tracts: ["tracts-fill", "tracts-outline"],
    townships: ["townships-fill", "townships-outline"],
    districts: ["districts-fill", "districts-outline"],
  };

  const parcelBandColors = {
    "0-0.1": "#c0392b",
    "0.1-0.25": "#e74c3c",
    "0.25-0.75": "#e67e22",
    "0.75-1.5": "#f39c12",
    "1.5-3": "#f1c40f",
    ">3": "#999999",
  };
  const parcelBandColorsRoad = {
    "0-0.5": "#c0392b",
    "0.5-1": "#e74c3c",
    "1-2": "#e67e22",
    "2-4": "#f39c12",
    "4-6": "#f1c40f",
    "6-10": "#e8c547",
    ">10": "#999999",
  };
  const STRAIGHT_BANDS = ["0-0.1", "0.1-0.25", "0.25-0.75", "0.75-1.5", "1.5-3", ">3"];
  const ROAD_BANDS = ["0-0.5", "0.5-1", "1-2", "2-4", "4-6", "6-10", ">10"];

  const pendingState = {
    distanceType: "straight",
    bands: new Set(STRAIGHT_BANDS),
    layers: { parcels: true, parks: true, tracts: false, townships: false, districts: false },
    parksUniverse: "metro",
    residentialOnly: true,
  };
  const appliedState = {
    distanceType: "straight",
    bands: new Set(STRAIGHT_BANDS),
    layers: { parcels: true, parks: true, tracts: false, townships: false, districts: false },
    parksUniverse: "metro",
    residentialOnly: true,
  };

  function getDistanceType() {
    return UI.distTypeRoad?.checked ? "road" : "straight";
  }
  function getBandProp() {
    return getDistanceType() === "road" ? "band_road" : "band";
  }
  function buildBandColorExpr(bandProp, colors) {
    const pairs = [];
    for (const [band, color] of Object.entries(colors)) {
      pairs.push(band, color);
    }
    return ["match", ["get", bandProp], ...pairs, "#999999"];
  }
  function getBandsForType(type) {
    return type === "road" ? ROAD_BANDS : STRAIGHT_BANDS;
  }
  function renderBandCheckboxes() {
    if (!UI.bandFilterList) return;
    const type = pendingState.distanceType;
    const bands = getBandsForType(type);
    UI.bandFilterList.innerHTML = "";
    for (const b of bands) {
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = b;
      cb.checked = pendingState.bands.has(b);
      cb.dataset.band = b;
      cb.addEventListener("change", () => {
        if (cb.checked) pendingState.bands.add(b);
        else pendingState.bands.delete(b);
        updatePendingHint();
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(` ${b} mi`));
      UI.bandFilterList.appendChild(label);
    }
  }
  function updateLegendVisibility(type) {
    if (UI.legendStraight) UI.legendStraight.style.display = type === "straight" ? "" : "none";
    if (UI.legendRoad) UI.legendRoad.style.display = type === "road" ? "" : "none";
  }
  function updatePendingHint() {
    const same =
      appliedState.distanceType === pendingState.distanceType &&
      appliedState.parksUniverse === pendingState.parksUniverse &&
      appliedState.residentialOnly === pendingState.residentialOnly &&
      appliedState.layers.parcels === pendingState.layers.parcels &&
      appliedState.layers.parks === pendingState.layers.parks &&
      appliedState.layers.tracts === pendingState.layers.tracts &&
      appliedState.layers.townships === pendingState.layers.townships &&
      appliedState.layers.districts === pendingState.layers.districts &&
      appliedState.bands.size === pendingState.bands.size &&
      [...appliedState.bands].every((b) => pendingState.bands.has(b));
    if (UI.pendingHint) UI.pendingHint.style.display = same ? "none" : "";
  }
  function applyStateToMap(map) {
    const { distanceType, bands, layers, parksUniverse, residentialOnly } = appliedState;
    const bandProp = distanceType === "road" ? "band_road" : "band";
    const colors = distanceType === "road" ? parcelBandColorsRoad : parcelBandColors;
    if (map.getLayer("parcels-points")) {
      map.setPaintProperty("parcels-points", "circle-color", buildBandColorExpr(bandProp, colors));
      let bandFilter;
      if (bands.size === 0) {
        bandFilter = ["==", ["get", bandProp], "__none__"];
      } else {
        bandFilter = ["in", ["get", bandProp], ["literal", [...bands]]];
      }
      const parcelFilter = residentialOnly
        ? ["all", bandFilter, ["any", ["==", ["get", "class"], "R"], ["!", ["has", "class"]]]]
        : bandFilter;
      map.setFilter("parcels-points", parcelFilter);
    }
    updateLegendVisibility(distanceType);
    setGroupVisibility(map, LAYERS.parcels, layers.parcels);
    setGroupVisibility(map, LAYERS.parks, layers.parks);
    setGroupVisibility(map, LAYERS.tracts, layers.tracts);
    setGroupVisibility(map, LAYERS.townships, layers.townships);
    setGroupVisibility(map, LAYERS.districts, layers.districts);
    if (map.getSource("parks_boundaries") && map.getSource("parks_points")) {
      const boundariesUrl = parksUniverse === "all" ? urls.parksBoundariesAll : urls.parksBoundariesMetro;
      const pointsUrl = parksUniverse === "all" ? urls.parksPointsAll : urls.parksPointsMetro;
      fetchJson(boundariesUrl).then((d) => map.getSource("parks_boundaries").setData(d));
      fetchJson(pointsUrl).then((d) => map.getSource("parks_points").setData(d));
    }
    updatePendingHint();
  }

  map.on("load", async () => {
    const missing = [];
    let parcelsRangeOk = null;

    let hasButlerFade = false;
    try {
      const butlerFade = await fetchJson(urls.butlerFade);
      map.addSource("butler_fade", { type: "geojson", data: butlerFade });
      map.addLayer({
        id: "butler-fade",
        type: "fill",
        source: "butler_fade",
        filter: [
          "any",
          ["==", ["get", "role"], "fade_ring"],
          ["==", ["get", "role"], "fade_outer"],
        ],
        paint: {
          "fill-color": "#ffffff",
          "fill-opacity": ["to-number", ["get", "opacity"]],
        },
      });
      hasButlerFade = true;
    } catch {
      /* optional */
    }

    try {
      const parksBoundaries = await fetchJson(urls.parksBoundariesMetro);
      map.addSource("parks_boundaries", { type: "geojson", data: parksBoundaries });
      map.on("click", "parks-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const html = renderParkDetails(f.properties);
        updateDetailsPanel(html);
        new maplibregl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);
      });
      map.on("mouseenter", "parks-fill", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "parks-fill", () => (map.getCanvas().style.cursor = ""));
    } catch {
      missing.push("parks_boundaries.geojson");
      UI.toggleParks.checked = false;
      UI.toggleParks.disabled = true;
    }

    try {
      const parksPoints = await fetchJson(urls.parksPointsMetro);
      map.addSource("parks_points", { type: "geojson", data: parksPoints });
      map.on("click", "parks-points", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const props = { ...f.properties, name: f.properties?.park_name ?? f.properties?.name };
        const html = renderParkDetails(props);
        updateDetailsPanel(html);
        new maplibregl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);
      });
      map.on("mouseenter", "parks-points", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "parks-points", () => (map.getCanvas().style.cursor = ""));
    } catch {
      missing.push("parks_points.geojson");
    }

    try {
      const tracts = await fetchJson(urls.tracts);
      const metric = "LPA_CrudePrev";
      const values = (tracts.features ?? [])
        .map((ft) => Number(ft?.properties?.[metric]))
        .filter((v) => Number.isFinite(v));
      const breaks = quantileBreaks(values, 6);
      const colors = ["#f7fbff", "#deebf7", "#c6dbef", "#9ecae1", "#6baed6", "#2171b5"];
      const fillExpr = stepColorExpression(metric, breaks, colors);
      map.addSource("tracts", { type: "geojson", data: tracts });
      map.addLayer({
        id: "tracts-fill",
        type: "fill",
        source: "tracts",
        paint: { "fill-color": fillExpr, "fill-opacity": 0.35 },
      });
      map.addLayer({
        id: "tracts-outline",
        type: "line",
        source: "tracts",
        paint: { "line-color": "rgba(0,0,0,0.25)", "line-width": 1 },
      });
      setGroupVisibility(map, LAYERS.tracts, UI.toggleTracts.checked);
      map.on("click", "tracts-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const html = renderTractDetails(f.properties);
        updateDetailsPanel(html);
        new maplibregl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);
      });
      map.on("mouseenter", "tracts-fill", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "tracts-fill", () => (map.getCanvas().style.cursor = ""));
    } catch {
      missing.push("tracts.geojson");
      UI.toggleTracts.checked = false;
      UI.toggleTracts.disabled = true;
    }

    try {
      const townships = await fetchJson(urls.townships);
      map.addSource("townships", { type: "geojson", data: townships });
      map.addLayer({
        id: "townships-fill",
        type: "fill",
        source: "townships",
        paint: { "fill-color": "#7b1fa2", "fill-opacity": 0.2 },
      });
      map.addLayer({
        id: "townships-outline",
        type: "line",
        source: "townships",
        paint: { "line-color": "#7b1fa2", "line-width": 1.5 },
      });
      setGroupVisibility(map, LAYERS.townships, false);
      map.on("click", "townships-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const html = renderTownshipDetails(f.properties);
        updateDetailsPanel(html);
        new maplibregl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);
      });
      map.on("mouseenter", "townships-fill", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "townships-fill", () => (map.getCanvas().style.cursor = ""));
    } catch {
      missing.push("townships.geojson");
      UI.toggleTownships.checked = false;
      UI.toggleTownships.disabled = true;
    }

    try {
      const districts = await fetchJson(urls.schoolDistricts);
      const rankValues = (districts.features ?? [])
        .map((ft) => Number(ft?.properties?.rank))
        .filter((v) => Number.isFinite(v));
      const rankBreaks = quantileBreaks(rankValues, 5);
      const rankColors = ["#e8f5e9", "#c8e6c9", "#81c784", "#4caf50", "#2e7d32"];
      const rankExpr = rankBreaks.length > 0
        ? stepColorExpression("rank", rankBreaks, rankColors)
        : "#9e9e9e";
      map.addSource("school_districts", { type: "geojson", data: districts });
      map.addLayer({
        id: "districts-fill",
        type: "fill",
        source: "school_districts",
        paint: { "fill-color": rankExpr, "fill-opacity": 0.35 },
      });
      map.addLayer({
        id: "districts-outline",
        type: "line",
        source: "school_districts",
        paint: { "line-color": "rgba(0,0,0,0.4)", "line-width": 1 },
      });
      setGroupVisibility(map, LAYERS.districts, false);
      map.on("click", "districts-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const html = renderDistrictDetails(f.properties);
        updateDetailsPanel(html);
        new maplibregl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);
      });
      map.on("mouseenter", "districts-fill", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "districts-fill", () => (map.getCanvas().style.cursor = ""));
    } catch {
      missing.push("school_districts.geojson");
      UI.toggleDistricts.checked = false;
      UI.toggleDistricts.disabled = true;
    }

    let parcelsPmtilesHttpUrl = urls.parcelsPmtiles;
    try {
      const r = await fetch(urls.parcelsPmtilesVersion, { method: "GET" });
      if (r.ok) {
        const v = (await r.text()).trim();
        if (v) parcelsPmtilesHttpUrl = `${urls.parcelsPmtiles}?v=${encodeURIComponent(v)}`;
      }
    } catch {
      /* ignore */
    }

    const parcelsGeojsonUrl = urls.parcelsGeojson;
    const isGitHubPages = /github\.io$/i.test(window.location.hostname);
    if (await fileExists(parcelsPmtilesHttpUrl)) {
      parcelsRangeOk = await supportsByteRange(parcelsPmtilesHttpUrl);
    }
    const useGeojsonFallback = isGitHubPages || !(await fileExists(parcelsPmtilesHttpUrl)) || !parcelsRangeOk;

    const addParcelsLayer = (bandColorExpr, isVector) => {
      const layer = {
        id: "parcels-points",
        type: "circle",
        source: "parcels",
        ...(isVector ? { "source-layer": "parcels" } : {}),
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3.0, 12, 5.0, 15, 6.0],
          "circle-color": bandColorExpr,
          "circle-opacity": 1.0,
          "circle-stroke-color": "rgba(0,0,0,0.25)",
          "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 9, 0.0, 12, 0.6, 15, 0.9],
        },
      };
      map.addLayer(layer);
      map.on("click", "parcels-points", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const isRoad = getDistanceType() === "road";
        const band = isRoad ? (f.properties?.band_road ?? f.properties?.band ?? "NA") : (f.properties?.band ?? "NA");
        const dist = isRoad ? (f.properties?.dist_mi_road ?? f.properties?.dist_mi ?? "NA") : (f.properties?.dist_mi ?? "NA");
        const distLabel = isRoad ? "Road distance (mi)" : "Distance (mi)";
        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(
            `<b>Distance band:</b> ${escapeHtml(band)}<br><b>${escapeHtml(distLabel)}:</b> ${escapeHtml(fmtNum(dist, 3))}`
          )
          .addTo(map);
      });
      map.on("mouseenter", "parcels-points", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "parcels-points", () => (map.getCanvas().style.cursor = ""));
    };

    if (useGeojsonFallback && (await fileExists(parcelsGeojsonUrl))) {
      setStatus("Loading parcels (GeoJSON, ~28MB)...");
      try {
        const parcelsData = await fetchJson(parcelsGeojsonUrl);
        map.addSource("parcels", { type: "geojson", data: parcelsData });
        addParcelsLayer(buildBandColorExpr("band", parcelBandColors), false);
        parcelsRangeOk = true;
      } catch (err) {
        setStatus(`Parcels failed to load: ${err?.message ?? err}`);
        missing.push("parcels.geojson");
        UI.toggleParcels.checked = false;
        UI.toggleParcels.disabled = true;
      }
    } else if (await fileExists(parcelsPmtilesHttpUrl)) {
      const pmtilesUrl = `pmtiles://${parcelsPmtilesHttpUrl}`;
      map.addSource("parcels", { type: "vector", url: pmtilesUrl });
      addParcelsLayer(buildBandColorExpr("band", parcelBandColors), true);
    } else {
      missing.push("parcels.pmtiles");
      UI.toggleParcels.checked = false;
      UI.toggleParcels.disabled = true;
    }

    if (map.getSource("parks_boundaries")) {
      map.addLayer({
        id: "parks-fill",
        type: "fill",
        source: "parks_boundaries",
        paint: { "fill-color": "#1b5e20", "fill-opacity": 0.35 },
      });
      map.addLayer({
        id: "parks-outline",
        type: "line",
        source: "parks_boundaries",
        paint: { "line-color": "#1b5e20", "line-width": 2 },
      });
    }
    if (map.getSource("parks_points")) {
      map.addLayer({
        id: "parks-points",
        type: "circle",
        source: "parks_points",
        paint: {
          "circle-radius": 6,
          "circle-color": "#1b5e20",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "parks-labels",
        type: "symbol",
        source: "parks_points",
        layout: {
          "text-field": ["get", "park_name"],
          "text-size": 13,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
        },
        paint: {
          "text-color": "#1b5e20",
          "text-halo-color": "rgba(255,255,255,0.95)",
          "text-halo-width": 1.5,
        },
      });
    }

    if (hasButlerFade) {
      map.addLayer({
        id: "butler-border",
        type: "line",
        source: "butler_fade",
        filter: ["==", ["get", "role"], "county"],
        paint: {
          "line-color": "rgba(0,0,0,0.55)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.5, 12, 2.5, 15, 4],
        },
      });
    }

    function syncPendingFromUI() {
      pendingState.layers.parcels = UI.toggleParcels?.checked ?? true;
      pendingState.layers.parks = UI.toggleParks?.checked ?? true;
      pendingState.layers.tracts = UI.toggleTracts?.checked ?? false;
      pendingState.layers.townships = UI.toggleTownships?.checked ?? false;
      pendingState.layers.districts = UI.toggleDistricts?.checked ?? false;
      pendingState.residentialOnly = UI.toggleResidentialOnly?.checked ?? true;
      pendingState.distanceType = getDistanceType();
      pendingState.parksUniverse = UI.parksAll?.checked ? "all" : "metro";
      updatePendingHint();
    }
    function syncUIToPending() {
      if (UI.toggleParcels) UI.toggleParcels.checked = pendingState.layers.parcels;
      if (UI.toggleParks) UI.toggleParks.checked = pendingState.layers.parks;
      if (UI.toggleResidentialOnly) UI.toggleResidentialOnly.checked = pendingState.residentialOnly;
      if (UI.toggleTracts) UI.toggleTracts.checked = pendingState.layers.tracts;
      if (UI.toggleTownships) UI.toggleTownships.checked = pendingState.layers.townships;
      if (UI.toggleDistricts) UI.toggleDistricts.checked = pendingState.layers.districts;
      if (UI.distTypeStraight) UI.distTypeStraight.checked = pendingState.distanceType === "straight";
      if (UI.distTypeRoad) UI.distTypeRoad.checked = pendingState.distanceType === "road";
      if (UI.parksMetro) UI.parksMetro.checked = pendingState.parksUniverse === "metro";
      if (UI.parksAll) UI.parksAll.checked = pendingState.parksUniverse === "all";
      renderBandCheckboxes();
    }

    UI.toggleParcels?.addEventListener("change", syncPendingFromUI);
    UI.toggleParks?.addEventListener("change", syncPendingFromUI);
    UI.toggleResidentialOnly?.addEventListener("change", syncPendingFromUI);
    UI.toggleTracts?.addEventListener("change", syncPendingFromUI);
    UI.toggleTownships?.addEventListener("change", syncPendingFromUI);
    UI.toggleDistricts?.addEventListener("change", syncPendingFromUI);
    UI.parksMetro?.addEventListener("change", () => { pendingState.parksUniverse = "metro"; updatePendingHint(); });
    UI.parksAll?.addEventListener("change", () => { pendingState.parksUniverse = "all"; updatePendingHint(); });
    UI.distTypeStraight?.addEventListener("change", () => {
      pendingState.distanceType = "straight";
      pendingState.bands = new Set(STRAIGHT_BANDS);
      renderBandCheckboxes();
      updatePendingHint();
    });
    UI.distTypeRoad?.addEventListener("change", () => {
      pendingState.distanceType = "road";
      pendingState.bands = new Set(ROAD_BANDS);
      renderBandCheckboxes();
      updatePendingHint();
    });
    UI.bandSelectAll?.addEventListener("click", () => {
      const bands = getBandsForType(pendingState.distanceType);
      bands.forEach((b) => pendingState.bands.add(b));
      renderBandCheckboxes();
      updatePendingHint();
    });
    UI.bandClear?.addEventListener("click", () => {
      pendingState.bands.clear();
      renderBandCheckboxes();
      updatePendingHint();
    });
    UI.refreshBtn?.addEventListener("click", () => {
      appliedState.distanceType = pendingState.distanceType;
      appliedState.bands = new Set(pendingState.bands);
      appliedState.layers = { ...pendingState.layers };
      appliedState.parksUniverse = pendingState.parksUniverse;
      appliedState.residentialOnly = pendingState.residentialOnly;
      applyStateToMap(map);
    });

    renderBandCheckboxes();
    syncPendingFromUI();
    appliedState.distanceType = pendingState.distanceType;
    appliedState.bands = new Set(pendingState.bands);
    appliedState.layers = { ...pendingState.layers };
    appliedState.parksUniverse = pendingState.parksUniverse;
    appliedState.residentialOnly = pendingState.residentialOnly;
    applyStateToMap(map);

    if (missing.length > 0) {
      setStatus(`Loaded map. Missing data: ${missing.join(", ")}.`);
    } else {
      setStatus(parcelsRangeOk === false
        ? "Loaded map + layers. Parcel distance bands require HTTP Range requests."
        : "Loaded map + layers.");
    }

    window.setTimeout(() => {
      if (!map.getLayer("parcels-points")) return;
      const rendered = map.queryRenderedFeatures({ layers: ["parcels-points"] }).length;
      if (rendered === 0) {
        setStatus(`${UI.statusText.textContent} Parcels in view: 0 (try zooming in to 12+).`);
      } else {
        setStatus(`${UI.statusText.textContent} Parcels in view: ${rendered}.`);
      }
    }, 1500);
  });
}

main().catch((err) => {
  console.error(err);
  setStatus(`Failed to initialize: ${err?.message ?? err}`);
});
