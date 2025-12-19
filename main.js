import './style.css';
import './antigravity-tracker/client.js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import osmtogeojson from 'osmtogeojson';
import html2canvas from 'html2canvas';

// Fix Leaflet's icon path issues in Vite/Webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
    iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
    shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
});


// State
const state = {
    mmToPx: 3.7795,
    map: null,
    tileLayer: null,
    markers: [],
    vectorMode: false,
    vectorData: null, // Stores GeoJSON
    vectorLayers: {}, // Stores Leaflet Layer references
    activeLayers: {
        buildings: { visible: true, stroke: '#64748b', width: 1, fill: '#64748b', fillEnabled: true, hatched: false },
        water: { visible: true, stroke: '#3b82f6', width: 1, fill: '#3b82f6', fillEnabled: true, hatched: false },
        streets: { visible: true, stroke: '#333333', width: 1, fill: '#ffffff', fillEnabled: false, hatched: false, labelsEnabled: false },
        parks: { visible: true, stroke: '#22c55e', width: 0, fill: '#22c55e', fillEnabled: true, hatched: false },
        railways: { visible: true, stroke: '#475569', width: 1.5, fill: '#000000', fillEnabled: false, hatched: false },
        industrial: { visible: false, stroke: '#94a3b8', width: 0.5, fill: '#cbd5e1', fillEnabled: false, hatched: false },
        parking: { visible: false, stroke: '#94a3b8', width: 0.5, fill: '#e2e8f0', fillEnabled: false, hatched: false }
    },
    settings: {
        fontFamily: "'Outfit', sans-serif",
        fontSize: 14,
        bubble: false,
        mapStyle: 'standard',
        backgroundColor: '#ffffff'
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupControls();
    updateMapSize();
    initResizeObserver();

    // Set initial background color from input
    document.getElementById('map-wrapper').style.backgroundColor = document.getElementById('map-bg-color').value;
});

function initMap() {
    const defaultCoords = [50.0755, 14.4378]; // Prague

    state.map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView(defaultCoords, 13);

    // Initial Tile Layer (Dark by default)
    state.tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20,
        keepBuffer: 50, // Load significantly more tiles outside the viewport
        updateWhenIdle: false // Load tiles immediately during interaction
    }).addTo(state.map);
}

function setMapStyle(style) {
    const mapDiv = document.getElementById('map');
    let url = '';
    let className = '';

    // Reset filters
    mapDiv.classList.remove('map-filter-grey', 'map-filter-line', 'map-filter-vintage', 'map-filter-blueprint');

    switch (style) {
        case 'light':
            url = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';
            break;
        case 'vintage':
            url = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png';
            className = 'map-filter-vintage';
            break;
        case 'blueprint':
            url = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';
            className = 'map-filter-blueprint';
            break;
        case 'satellite':
            url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
            break;
        case 'topo':
            url = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
            break;
        case 'line':
            url = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';
            className = 'map-filter-line';
            break;
        case 'standard':
        default:
            url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
            break;
    }

    state.tileLayer.setUrl(url);
    if (className) mapDiv.classList.add(className);
    state.settings.mapStyle = style;
}

function setupControls() {
    // Search
    const searchBtn = document.getElementById('search-btn');
    const addressInput = document.getElementById('address-input');
    searchBtn.addEventListener('click', () => doSearch(addressInput.value));
    addressInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') doSearch(addressInput.value);
    });

    // Map Style
    document.getElementById('map-style-select').addEventListener('change', (e) => {
        setMapStyle(e.target.value);
    });

    // Dimensions & Shape
    const widthInput = document.getElementById('map-width');
    const heightInput = document.getElementById('map-height');
    const radiusInput = document.getElementById('map-radius');

    [widthInput, heightInput].forEach(inp => {
        inp.addEventListener('input', updateMapSize);
        inp.addEventListener('change', () => state.map.invalidateSize());
    });

    radiusInput.addEventListener('input', (e) => {
        const mm = e.target.value;
        const px = mm * state.mmToPx;
        document.getElementById('map-wrapper').style.borderRadius = `${px}px`;
    });

    // Presets (Dimensions)
    document.querySelectorAll('.chip:not(.theme-btn)').forEach(btn => {
        btn.addEventListener('click', () => {
            widthInput.value = btn.dataset.w;
            heightInput.value = btn.dataset.h;
            updateMapSize();
            state.map.invalidateSize();
        });
    });

    // Graphic Themes
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            applyGraphicTheme(btn.dataset.theme);
        });
    });

    // Label Styling
    const fontSelect = document.getElementById('font-select');
    const fontSizeInput = document.getElementById('font-size');
    const bubbleCheck = document.getElementById('bubble-check');

    const updateLabels = () => {
        state.settings.fontFamily = fontSelect.value;
        state.settings.fontSize = parseInt(fontSizeInput.value);
        state.settings.bubble = bubbleCheck.checked;
        updateMarkerStyles();
    };

    fontSelect.addEventListener('change', updateLabels);
    fontSizeInput.addEventListener('input', updateLabels);
    bubbleCheck.addEventListener('change', updateLabels);

    // Zoom Controls
    document.getElementById('zoom-in').addEventListener('click', () => state.map.zoomIn());
    document.getElementById('zoom-out').addEventListener('click', () => state.map.zoomOut());

    // Vector Layers Controls
    const vectorToggle = document.getElementById('vector-mode-toggle');
    const layerList = document.getElementById('layer-toggles');
    const styleSelect = document.getElementById('map-style-select');
    const exportBtn = document.getElementById('export-btn');
    const layers = ['buildings', 'water', 'streets', 'parks', 'railways', 'industrial', 'parking'];

    const updateUIState = () => {
        if (state.vectorMode) {
            layerList.classList.remove('disabled');
            styleSelect.disabled = true;
            exportBtn.innerText = "Export Laser (SVG)";

            // Auto Zoom-in if needed
            if (state.map.getZoom() < 15) {
                state.map.flyTo(state.map.getCenter(), 15);
                // The moveend/zoomend will trigger the fetch
            } else {
                fetchAndRenderVectors();
            }

        } else {
            layerList.classList.add('disabled');
            styleSelect.disabled = false;
            exportBtn.innerText = "Export Bitmap (SVG)";
            clearVectorLayers();
            state.tileLayer.setOpacity(1);
        }
    };

    // Initial state
    exportBtn.innerText = "Export Bitmap (SVG)";

    vectorToggle.addEventListener('change', (e) => {
        state.vectorMode = e.target.checked;
        updateUIState();
    });

    layers.forEach(layer => {
        // Visibility
        document.getElementById(`layer-${layer}-visible`).addEventListener('change', (e) => {
            state.activeLayers[layer].visible = e.target.checked;
            updateVectorVisibility();
        });

        // Styling
        const updateStyle = () => {
            state.activeLayers[layer].stroke = document.getElementById(`layer-${layer}-stroke`).value;
            state.activeLayers[layer].width = parseFloat(document.getElementById(`layer-${layer}-width`).value) || 0;
            state.activeLayers[layer].fill = document.getElementById(`layer-${layer}-fill`).value;
            state.activeLayers[layer].fillEnabled = document.getElementById(`layer-${layer}-fill-enabled`).checked;

            console.log(`Updating ${layer}:`, state.activeLayers[layer]); // Debug log

            // Re-apply style to Leaflet layer if it exists
            if (state.vectorLayers[layer]) {
                const conf = state.activeLayers[layer];
                state.vectorLayers[layer].setStyle({
                    color: conf.stroke,
                    weight: conf.width,
                    fillColor: conf.fill,
                    fillOpacity: conf.fillEnabled ? 0.2 : 0
                });
            }
        };

        ['stroke', 'width', 'fill'].forEach(prop => {
            const el = document.getElementById(`layer-${layer}-${prop}`);
            if (el) el.addEventListener('input', updateStyle);
        });

        const fillEnabledBtn = document.getElementById(`layer-${layer}-fill-enabled`);
        if (fillEnabledBtn) fillEnabledBtn.addEventListener('change', updateStyle);

        const hatchedBtn = document.getElementById(`layer-${layer}-hatched`);
        if (hatchedBtn) hatchedBtn.addEventListener('change', (e) => {
            state.activeLayers[layer].hatched = e.target.checked;
            updateStyle();
        });
    });

    // Street Labels Toggle
    document.getElementById('layer-streets-labels').addEventListener('change', (e) => {
        state.activeLayers.streets.labelsEnabled = e.target.checked;
        if (state.vectorMode) renderVectorLayers();
    });

    // Background Color
    const bgColorInput = document.getElementById('map-bg-color');
    bgColorInput.addEventListener('input', (e) => {
        state.settings.backgroundColor = e.target.value;
        document.getElementById('map-wrapper').style.backgroundColor = state.settings.backgroundColor;
    });

    // Export
    document.getElementById('export-btn').addEventListener('click', exportMap);
    document.getElementById('export-jpg-btn').addEventListener('click', exportJpg);

    // Markers
    const markerInput = document.getElementById('marker-text');
    const addMarkerBtn = document.getElementById('add-marker-btn');

    const handleAddMarker = () => {
        const text = markerInput.value;
        if (text) {
            addMarker(text);
            markerInput.value = '';
        }
    };

    addMarkerBtn.addEventListener('click', handleAddMarker);
    markerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAddMarker();
    });

    // Sidebar Toggle
    const sidebar = document.getElementById('sidebar');
    const collapseBtn = document.getElementById('collapse-btn');
    collapseBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const isCollapsed = sidebar.classList.contains('collapsed');
        collapseBtn.innerHTML = isCollapsed
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>'
            : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>';
    });

    // Map Move/Zoom monitoring for Vector Mode
    let moveTimeout;
    state.map.on('moveend', () => {
        if (state.vectorMode) {
            clearTimeout(moveTimeout);
            moveTimeout = setTimeout(() => {
                fetchAndRenderVectors();
            }, 500); // Debounce 500ms
        }
    });

    // Zoom listener for Label Toggling
    state.map.on('zoomend', () => {
        if (state.vectorMode && state.activeLayers.streets.labelsEnabled) {
            renderVectorLayers(); // Re-render to check zoom threshold for labels
        }
    });
}

function updateMarkerStyles() {
    state.markers.forEach(item => {
        const { marker, fontFamily, fontSize } = item;
        const tooltip = marker.getTooltip();
        if (tooltip) {
            const el = tooltip.getElement();
            if (el) {
                el.style.fontFamily = fontFamily || state.settings.fontFamily;
                el.style.fontSize = `${fontSize || state.settings.fontSize}px`;

                if (state.settings.bubble) {
                    el.classList.add('bubble-style');
                } else {
                    el.classList.remove('bubble-style');
                }
            }
        }
    });
}

function addMarker(text) {
    const center = state.map.getCenter();
    const marker = L.marker(center, {
        draggable: true,
        title: 'Drag to position'
    }).addTo(state.map);

    marker.bindTooltip(text, {
        permanent: true,
        direction: 'top',
        className: 'custom-marker-label'
    }).openTooltip();

    // Track it with current global settings as defaults
    const markerObj = {
        id: Date.now(),
        text,
        marker,
        fontFamily: state.settings.fontFamily,
        fontSize: state.settings.fontSize
    };
    state.markers.push(markerObj);

    // Apply current styles immediately
    setTimeout(() => updateMarkerStyles(), 50);

    // Update UI
    refreshMarkerListUI();

    marker.on('dragend', () => {
        // Just to be safe, update styles again if needed
        updateMarkerStyles();
    });
}

function refreshMarkerListUI() {
    const container = document.getElementById('marker-list');
    if (!container) return;

    container.innerHTML = '';

    state.markers.forEach(item => {
        const card = document.createElement('div');
        card.className = 'marker-card';
        card.innerHTML = `
            <div class="marker-card-header">
                <span>${item.text}</span>
                <button class="btn-delete-marker" data-id="${item.id}" title="Delete Pin">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
            <div class="marker-card-controls">
                <div class="input-group">
                    <select class="marker-font-select" data-id="${item.id}">
                        <option value="'Outfit', sans-serif" ${item.fontFamily.includes('Outfit') ? 'selected' : ''}>Sans</option>
                        <option value="'Playfair Display', serif" ${item.fontFamily.includes('Playfair') ? 'selected' : ''}>Serif</option>
                        <option value="'Source Code Pro', monospace" ${item.fontFamily.includes('Source Code') ? 'selected' : ''}>Mono</option>
                    </select>
                </div>
                <div class="input-group">
                    <input type="number" class="marker-size-input" data-id="${item.id}" value="${item.fontSize}" min="8" max="60">
                </div>
            </div>
        `;
        container.appendChild(card);

        // Listeners for this card
        card.querySelector('.btn-delete-marker').onclick = () => deleteMarker(item.id);

        card.querySelector('.marker-font-select').onchange = (e) => {
            item.fontFamily = e.target.value;
            updateMarkerStyles();
        };

        card.querySelector('.marker-size-input').oninput = (e) => {
            item.fontSize = parseInt(e.target.value);
            updateMarkerStyles();
        };
    });
}

function deleteMarker(id) {
    const index = state.markers.findIndex(m => m.id === id);
    if (index !== -1) {
        state.markers[index].marker.remove();
        state.markers.splice(index, 1);
        refreshMarkerListUI();
    }
}

async function doSearch(query) {
    if (!query) return;
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        const data = await response.json();
        if (data && data.length > 0) {
            const hit = data[0];
            state.map.flyTo([hit.lat, hit.lon], 13);
        } else {
            alert('Location not found');
        }
    } catch (e) {
        console.error('Search error', e);
        alert('Error searching location');
    }
}

function updateMapSize() {
    const widthMm = parseFloat(document.getElementById('map-width').value) || 200;
    const heightMm = parseFloat(document.getElementById('map-height').value) || 200;
    const wrapper = document.getElementById('map-wrapper');

    const widthPx = widthMm * state.mmToPx;
    const heightPx = heightMm * state.mmToPx;

    wrapper.style.width = `${widthPx}px`;
    wrapper.style.height = `${heightPx}px`;

    // Also update radius if needed
    const radiusMm = document.getElementById('map-radius').value;
    wrapper.style.borderRadius = `${radiusMm * state.mmToPx}px`;

    // No need for manual timeout anymore - ResizeObserver handles it
}

// Initialize ResizeObserver to keep map tiles in sync with container size
function initResizeObserver() {
    const wrapper = document.getElementById('map-wrapper');
    let resizeTimeout;

    const resizeObserver = new ResizeObserver(() => {
        if (!state.map) return;

        // Debounce to prevent thrashing during CSS transitions
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            state.map.invalidateSize();
        }, 60);
    });

    resizeObserver.observe(wrapper);
}

// --- Vector Export Logic ---

function lat2y(lat) {
    return Math.log(Math.tan((lat * Math.PI) / 180 / 2 + Math.PI / 4));
}

function project(lat, lon, bounds, width, height) {
    const yMin = lat2y(bounds.getSouth());
    const yMax = lat2y(bounds.getNorth());
    const xMin = bounds.getWest();
    const xMax = bounds.getEast();

    const xNorm = (lon - xMin) / (xMax - xMin);
    const yNorm = (lat2y(lat) - yMin) / (yMax - yMin);

    return {
        x: xNorm * width,
        y: height - (yNorm * height)
    };
}

async function fetchAndRenderVectors() {
    if (!state.map) return;
    const btn = document.getElementById('vector-mode-toggle');
    // Simple lock
    if (btn.disabled) return;
    btn.disabled = true;

    try {
        const bounds = state.map.getBounds();
        const currentZoom = state.map.getZoom();

        // Safety: Prevent fetching if zoom is too low (area too big)
        if (currentZoom < 15) {
            // If manual activation (not auto-refetch), we might want to inform the user
            // But valid flow: User toggles ON -> We zoom them IN -> fetch happens.
            // Or user zooms OUT -> We stop fetching or clear.

            // Strategy: If zoom < 15, we do NOT fetch/render vectors to avoid freeze/crash.
            // We can clear existing ones to indicate "out of range".
            console.log("Zoom too low for vectors, clearing.");
            clearVectorLayers();
            state.tileLayer.setOpacity(1); // Show raster again
            return;
        }

        // Hide raster to show we are in vector mode (or just dim it)
        state.tileLayer.setOpacity(0.1);

        // OSM Overpass Query
        // We want roads, water, buildings, parks, railways, landuse
        const query = `
            [out:json][timeout:25];
            (
              way["highway"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
              way["railway"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
              way["waterway"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
              relation["waterway"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
              way["building"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
              way["leisure"~"park|garden"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
              way["landuse"~"grass|forest|orchard|vineyard|industrial|commercial|residential|retail"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
              way["natural"~"water|wood|scrub|grassland"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
              way["amenity"~"parking"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
            );
            out geom;
        `;

        console.log("Fetching vector data...");
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });

        if (!response.ok) throw new Error("Overpass API request failed");

        const data = await response.json();
        // Convert to GeoJSON
        state.vectorData = osmtogeojson(data);
        console.log("GeoJSON parsed:", state.vectorData);

        renderVectorLayers();

    } catch (e) {
        console.error("Vector fetch failed:", e);
        alert("Failed to load vector data. Try a smaller area.");
        // Revert
        document.getElementById('vector-mode-toggle').checked = false;
        state.vectorMode = false;
        state.tileLayer.setOpacity(1);
        document.getElementById('layer-toggles').classList.add('disabled');
    } finally {
        btn.disabled = false;
    }
}

function clearVectorLayers() {
    Object.values(state.vectorLayers).forEach(layer => {
        if (layer) state.map.removeLayer(layer);
    });
    state.vectorLayers = {};
}

function renderVectorLayers() {
    if (!state.vectorData) return;
    clearVectorLayers();

    // Update dynamic patterns
    const defs = document.querySelector('defs');
    Object.keys(state.activeLayers).forEach(key => {
        const conf = state.activeLayers[key];
        if (conf.hatched) {
            let pattern = document.getElementById(`hatch-diag-${key}`);
            if (!pattern) {
                pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
                pattern.setAttribute('id', `hatch-diag-${key}`);
                pattern.setAttribute('patternUnits', 'userSpaceOnUse');
                pattern.setAttribute('width', '10');
                pattern.setAttribute('height', '10');
                pattern.setAttribute('patternTransform', 'rotate(45)');
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', '0');
                line.setAttribute('y1', '0');
                line.setAttribute('x2', '0');
                line.setAttribute('y2', '10');
                line.setAttribute('stroke-width', '2');
                pattern.appendChild(line);
                defs.appendChild(pattern);
            }
            // Update patterns stroke color
            pattern.querySelector('line').setAttribute('stroke', conf.fill);
        }
    });

    const getStyle = (key) => {
        const conf = state.activeLayers[key];
        return {
            color: conf.stroke,
            weight: conf.width,
            opacity: 1,
            fill: true,
            fillColor: conf.hatched ? `url(#hatch-diag-${key})` : conf.fill,
            fillOpacity: conf.fillEnabled ? (conf.hatched ? 1 : 0.2) : 0
        };
    };

    // Filter features into groups
    state.vectorLayers.streets = L.geoJSON(state.vectorData, {
        filter: feature => !!feature.properties.highway,
        style: getStyle('streets'),
        onEachFeature: (feature, layer) => {
            if (state.activeLayers.streets.labelsEnabled &&
                feature.properties.name &&
                state.map.getZoom() >= 16) {

                layer.bindTooltip(feature.properties.name, {
                    permanent: true,
                    direction: 'center',
                    className: 'street-label-preview',
                    opacity: 0.7
                });
            }
        }
    });

    state.vectorLayers.railways = L.geoJSON(state.vectorData, {
        filter: feature => !!feature.properties.railway,
        style: getStyle('railways')
    });

    state.vectorLayers.water = L.geoJSON(state.vectorData, {
        filter: feature => !!feature.properties.waterway || (feature.properties.natural === 'water') || (feature.properties.landuse === 'reservoir'),
        style: getStyle('water')
    });

    state.vectorLayers.buildings = L.geoJSON(state.vectorData, {
        filter: feature => !!feature.properties.building,
        style: getStyle('buildings')
    });

    state.vectorLayers.parks = L.geoJSON(state.vectorData, {
        filter: feature => {
            const p = feature.properties;
            return p.leisure === 'park' || p.leisure === 'garden' || p.landuse === 'grass' || p.landuse === 'forest' || p.natural === 'wood' || p.natural === 'scrub' || p.landuse === 'orchard' || p.landuse === 'vineyard';
        },
        style: getStyle('parks')
    });

    state.vectorLayers.industrial = L.geoJSON(state.vectorData, {
        filter: feature => feature.properties.landuse === 'industrial' || feature.properties.landuse === 'commercial',
        style: getStyle('industrial')
    });

    state.vectorLayers.parking = L.geoJSON(state.vectorData, {
        filter: feature => feature.properties.amenity === 'parking',
        style: getStyle('parking')
    });

    updateVectorVisibility();
}

function updateVectorVisibility() {
    if (!state.vectorMode) return;
    Object.keys(state.activeLayers).forEach(key => {
        if (state.vectorLayers[key]) {
            if (state.activeLayers[key].visible) {
                state.vectorLayers[key].addTo(state.map);
            } else {
                state.map.removeLayer(state.vectorLayers[key]);
            }
        }
    });
}

function geometryToPath(geometry, bounds, width, height) {
    if (geometry.type === 'LineString') {
        const points = geometry.coordinates.map(coord => {
            // GeoJSON is Lng, Lat
            const xy = project(coord[1], coord[0], bounds, width, height);
            return `${xy.x.toFixed(2)},${xy.y.toFixed(2)}`;
        });
        return `M ${points.join(' L ')}`;
    }
    else if (geometry.type === 'Polygon') {
        // Simple polygon handling (outer ring only for simplicity)
        const points = geometry.coordinates[0].map(coord => {
            const xy = project(coord[1], coord[0], bounds, width, height);
            return `${xy.x.toFixed(2)},${xy.y.toFixed(2)}`;
        });
        return `M ${points.join(' L ')} Z`;
    }
    return '';
}

async function exportMap() {
    const btn = document.getElementById('export-btn');
    const originalText = btn.innerText;

    try {
        if (!state.map) throw new Error("Map not initialized");
        btn.disabled = true;
        btn.innerText = "Generating SVG...";

        // If not in vector mode, try to fetch data now?
        // User asked for "possibility to turn on and off".
        // If they hit Export without previewing, we should probably fetch everything.
        // But for better UX, let's assume they use the toggle.
        // If not, we trigger the fetch logic internally.

        const widthMm = parseFloat(document.getElementById('map-width').value) || 200;
        const heightMm = parseFloat(document.getElementById('map-height').value) || 200;
        const radiusMm = parseFloat(document.getElementById('map-radius').value) || 0;

        // Add Markers (common to both export types)
        const bounds = state.map.getBounds();
        const markerSvg = state.markers.map(m => {
            const latLng = m.marker.getLatLng();
            const pos = project(latLng.lat, latLng.lng, bounds, widthMm, heightMm);
            const text = m.marker.getTooltip().getContent();
            return `
                <g transform="translate(${pos.x}, ${pos.y})">
                    <circle r="3" fill="red" />
                    <text y="-5" text-anchor="middle" font-family="${state.settings.fontFamily}" font-size="${state.settings.fontSize}" fill="black">${text}</text>
                </g>
            `;
        }).join('\n');


        if (state.vectorMode) {
            // --- VECTOR EXPORT ---
            let geoJsonData = state.vectorData;

            if (!geoJsonData) {
                // simplified for brevity, assuming data exists or fetch happens
                throw new Error("Vector data missing. Please toggle Vector Mode off/on.");
            }

            // Group paths
            const groups = { streets: [], water: [], buildings: [], parks: [], railways: [], industrial: [], parking: [] };

            geoJsonData.features.forEach(f => {
                const props = f.properties;
                const path = geometryToPath(f.geometry, bounds, widthMm, heightMm);
                if (!path) return;

                if (props.highway && state.activeLayers.streets.visible) groups.streets.push(`<path d="${path}" />`);
                else if (props.railway && state.activeLayers.railways.visible) groups.railways.push(`<path d="${path}" />`);
                else if ((props.waterway || props.natural === 'water' || props.landuse === 'reservoir') && state.activeLayers.water.visible) groups.water.push(`<path d="${path}" />`);
                else if (props.building && state.activeLayers.buildings.visible) groups.buildings.push(`<path d="${path}" />`);
                else if ((props.leisure === 'park' || props.leisure === 'garden' || props.landuse === 'grass' || props.landuse === 'forest' || props.natural === 'wood' || props.natural === 'scrub' || props.landuse === 'orchard' || props.landuse === 'vineyard') && state.activeLayers.parks.visible) groups.parks.push(`<path d="${path}" />`);
                else if ((props.landuse === 'industrial' || props.landuse === 'commercial') && state.activeLayers.industrial.visible) groups.industrial.push(`<path d="${path}" />`);
                else if (props.amenity === 'parking' && state.activeLayers.parking.visible) groups.parking.push(`<path d="${path}" />`);
            });

            // Helper to get attrs
            const getAttrs = (k) => {
                const c = state.activeLayers[k];
                const fill = c.hatched ? `url(#hatch-diag-${k})` : (c.fillEnabled ? c.fill : 'none');
                return `stroke="${c.stroke}" stroke-width="${c.width}" fill="${fill}" fill-opacity="${c.fillEnabled ? (c.hatched ? 1 : 0.2) : 0}"`;
            };

            // Pattern defs for export
            const patternsSvg = Object.keys(state.activeLayers)
                .filter(k => state.activeLayers[k].hatched)
                .map(k => {
                    const c = state.activeLayers[k];
                    return `<pattern id="hatch-diag-${k}" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="${c.fill}" stroke-width="1"/></pattern>`;
                }).join('\n');

            // Street Labels SVG
            const labelsSvg = [];
            if (state.activeLayers.streets.labelsEnabled) {
                geoJsonData.features.filter(f => f.properties.highway && f.properties.name && state.activeLayers.streets.visible).forEach(f => {
                    let center;
                    if (f.geometry.type === 'LineString') {
                        const mid = Math.floor(f.geometry.coordinates.length / 2);
                        center = f.geometry.coordinates[mid];
                    } else if (f.geometry.type === 'Polygon') center = f.geometry.coordinates[0][0];

                    if (center) {
                        const pos = project(center[1], center[0], bounds, widthMm, heightMm);
                        labelsSvg.push(`<text x="${pos.x}" y="${pos.y}" font-family="sans-serif" font-size="2" fill="#555" text-anchor="middle" opacity="0.8">${f.properties.name}</text>`);
                    }
                });
            }

            const svgContent = `
    <svg width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <clipPath id="mapClip">
                <rect x="0" y="0" width="${widthMm}" height="${heightMm}" rx="${radiusMm}" ry="${radiusMm}" />
            </clipPath>
            ${patternsSvg}
        </defs>
        <rect x="0" y="0" width="${widthMm}" height="${heightMm}" rx="${radiusMm}" ry="${radiusMm}" fill="${state.settings.backgroundColor}" />
        <g clip-path="url(#mapClip)">
            <g id="Industrial" ${getAttrs('industrial')}>${groups.industrial.join('')}</g>
            <g id="Parking" ${getAttrs('parking')}>${groups.parking.join('')}</g>
            <g id="Parks" ${getAttrs('parks')}>${groups.parks.join('')}</g>
            <g id="Water" ${getAttrs('water')}>${groups.water.join('')}</g>
            <g id="Buildings" ${getAttrs('buildings')}>${groups.buildings.join('')}</g>
            <g id="Railways" ${getAttrs('railways')}>${groups.railways.join('')}</g>
            <g id="Streets" ${getAttrs('streets')}>${groups.streets.join('')}</g>
            <g id="Labels">${labelsSvg.join('')}</g>
            <g id="Markers">${markerSvg}</g>
        </g>
         <rect x="0" y="0" width="${widthMm}" height="${heightMm}" rx="${radiusMm}" ry="${radiusMm}" fill="none" stroke="#000" stroke-width="0.2" />
    </svg>`;
            downloadFile(svgContent, 'vector-map.svg', 'image/svg+xml');

        } else {
            // --- BITMAP EXPORT (Raster) ---
            btn.innerText = "Capturing...";
            // Disable map controls to avoid capturing UI artifacts if any
            state.map.dragging.disable();
            state.map.scrollWheelZoom.disable();

            // Wait a moment for tiles to handle any pending load (optional but safer)
            await new Promise(r => setTimeout(r, 500));

            const mapElement = document.getElementById('map');
            const canvas = await html2canvas(mapElement, {
                useCORS: true,
                scale: 2 // High res
            });

            // Re-enable
            state.map.dragging.enable();
            state.map.scrollWheelZoom.enable();

            const imgData = canvas.toDataURL('image/png');

            // Wrap in SVG to handle dimensions/radius same as vector mode
            const svgContent = `
    <svg width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
        <defs>
            <clipPath id="mapClip">
                <rect x="0" y="0" width="${widthMm}" height="${heightMm}" rx="${radiusMm}" ry="${radiusMm}" />
            </clipPath>
        </defs>
        <rect x="0" y="0" width="${widthMm}" height="${heightMm}" rx="${radiusMm}" ry="${radiusMm}" fill="${state.settings.backgroundColor}" />
        <g clip-path="url(#mapClip)">
            <image width="${widthMm}" height="${heightMm}" href="${imgData}" preserveAspectRatio="xMidYMid slice" />
            <g id="Markers">${markerSvg}</g>
        </g>
         <rect x="0" y="0" width="${widthMm}" height="${heightMm}" rx="${radiusMm}" ry="${radiusMm}" fill="none" stroke="#000" stroke-width="0.2" />
    </svg>`;
            downloadFile(svgContent, 'raster-map.svg', 'image/svg+xml');
        }

    } catch (e) {
        console.error(e);
        alert("Export failed: " + e.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

function downloadFile(content, fileName, mimeType) {
    const link = document.createElement('a');
    link.style.display = 'none';
    link.setAttribute('download', fileName);
    link.download = fileName;

    if (typeof content === 'string' && content.startsWith('data:')) {
        link.href = content;
    } else {
        const blob = new Blob([content], { type: mimeType });
        link.href = URL.createObjectURL(blob);
    }

    document.body.appendChild(link);
    link.click();

    // Increase timeout to ensure download starts before revocation
    setTimeout(() => {
        document.body.removeChild(link);
        if (typeof content !== 'string' || !content.startsWith('data:')) {
            URL.revokeObjectURL(link.href);
        }
    }, 2000);
}

async function exportJpg() {
    const btn = document.getElementById('export-jpg-btn');
    const originalText = btn.innerText;

    try {
        if (!state.map) throw new Error("Map not initialized");
        btn.disabled = true;
        btn.innerText = "Processing...";

        // Disable interactive controls to prevent shifts
        state.map.dragging.disable();
        state.map.scrollWheelZoom.disable();

        // High scale for print quality (approx 300 DPI)
        // 1 mm = 3.78 px (screen) -> ~11.8 px (300 dpi) -> Scale ~3.125
        const scale = 3.125;

        const mapElement = document.getElementById('map-wrapper');

        const canvas = await html2canvas(mapElement, {
            useCORS: true,
            scale: scale,
            backgroundColor: state.settings.backgroundColor, // Capture flat background
            logging: false,
            allowTaint: true
        });

        // Re-enable
        state.map.dragging.enable();
        state.map.scrollWheelZoom.enable();

        // Download
        const imgData = canvas.toDataURL('image/jpeg', 0.9); // 90% quality JPG
        downloadFile(imgData, 'map-engrave.jpg', 'image/jpeg');

    } catch (e) {
        console.error(e);
        alert("Export failed: " + e.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
} function applyGraphicTheme(themeId) {
    const themes = {
        industrial: {
            style: 'standard',
            bg: '#0f172a',
            layers: {
                buildings: { stroke: '#f97316', width: 0.5, fill: '#f97316', fillEnabled: true, hatched: true },
                water: { stroke: '#1e293b', width: 1, fill: '#1e293b', fillEnabled: true, hatched: false },
                streets: { stroke: '#475569', width: 1.2, fill: '#ffffff', fillEnabled: false, hatched: false },
                parks: { stroke: '#064e3b', width: 0, fill: '#064e3b', fillEnabled: true, hatched: false },
                railways: { stroke: '#facc15', width: 2, fill: '#000000', fillEnabled: false, hatched: false },
                industrial: { visible: true, stroke: '#475569', width: 0.5, fill: '#334155', fillEnabled: true, hatched: true }
            }
        },
        blueprint: {
            style: 'blueprint',
            bg: '#000044',
            layers: {
                buildings: { stroke: '#ffffff', width: 0.8, fill: '#ffffff', fillEnabled: false, hatched: false },
                water: { stroke: '#00ffff', width: 1, fill: '#00ffff', fillEnabled: true, hatched: true },
                streets: { stroke: '#ffffff', width: 1.5, fill: '#ffffff', fillEnabled: false, hatched: false },
                parks: { stroke: '#00aa00', width: 0.5, fill: '#00aa00', fillEnabled: false, hatched: false },
                railways: { stroke: '#ffffff', width: 1, fill: '#ffffff', fillEnabled: false, hatched: false },
                industrial: { visible: false, stroke: '#ffffff', width: 0.5, fill: '#ffffff', fillEnabled: false, hatched: false }
            }
        },
        nature: {
            style: 'line',
            bg: '#fcfaf2',
            layers: {
                buildings: { stroke: '#8b4513', width: 0.5, fill: '#d2b48c', fillEnabled: true, hatched: false },
                water: { stroke: '#4682b4', width: 1.5, fill: '#b0c4de', fillEnabled: true, hatched: false },
                streets: { stroke: '#555555', width: 0.8, fill: '#ffffff', fillEnabled: false, hatched: false },
                parks: { stroke: '#228b22', width: 0, fill: '#228b22', fillEnabled: true, hatched: true },
                railways: { stroke: '#333333', width: 1, fill: '#000000', fillEnabled: false, hatched: false },
                industrial: { visible: false, stroke: '#94a3b8', width: 0.5, fill: '#cbd5e1', fillEnabled: false, hatched: false }
            }
        },
        gold: {
            style: 'standard',
            bg: '#000000',
            layers: {
                buildings: { stroke: '#d4af37', width: 1.2, fill: '#d4af37', fillEnabled: true, hatched: false },
                water: { stroke: '#111111', width: 2, fill: '#111111', fillEnabled: true, hatched: false },
                streets: { stroke: '#d4af37', width: 0.5, fill: '#ffffff', fillEnabled: false, hatched: false },
                parks: { stroke: '#d4af37', width: 0.3, fill: '#000000', fillEnabled: true, hatched: true },
                railways: { stroke: '#d4af37', width: 0.5, fill: '#000000', fillEnabled: false, hatched: false },
                industrial: { visible: false, stroke: '#d4af37', width: 0.5, fill: '#000000', fillEnabled: false, hatched: false }
            }
        }
    };

    const t = themes[themeId];
    if (!t) return;

    // Apply Base Style
    document.getElementById('map-style-select').value = t.style;
    setMapStyle(t.style);

    // Apply Background
    document.getElementById('map-bg-color').value = t.bg;
    state.settings.backgroundColor = t.bg;
    document.getElementById('map-wrapper').style.backgroundColor = t.bg;

    // Apply Layers
    Object.keys(t.layers).forEach(key => {
        const conf = t.layers[key];
        Object.assign(state.activeLayers[key], conf);

        // Update UI inputs to match
        if (conf.visible !== undefined) document.getElementById(`layer-${key}-visible`).checked = conf.visible;
        if (conf.stroke) document.getElementById(`layer-${key}-stroke`).value = conf.stroke;
        if (conf.width !== undefined) document.getElementById(`layer-${key}-width`).value = conf.width;
        if (conf.fill) document.getElementById(`layer-${key}-fill`).value = conf.fill;
        if (conf.fillEnabled !== undefined) document.getElementById(`layer-${key}-fill-enabled`).checked = conf.fillEnabled;
        if (conf.hatched !== undefined) {
            const hb = document.getElementById(`layer-${key}-hatched`);
            if (hb) hb.checked = conf.hatched;
        }
    });

    // Refresh Map
    if (state.vectorMode) {
        renderVectorLayers();
    } else {
        // If not in vector mode, maybe turn it on? 
        // User probably expects the theme to work, so let's enable vector mode.
        document.getElementById('vector-mode-toggle').checked = true;
        state.vectorMode = true;

        // Trigger same logic as toggle
        const layerList = document.getElementById('layer-toggles');
        const styleSelect = document.getElementById('map-style-select');
        const exportBtn = document.getElementById('export-btn');
        layerList.classList.remove('disabled');
        styleSelect.disabled = true;
        exportBtn.innerText = "Export Laser (SVG)";

        if (state.map.getZoom() < 15) {
            state.map.flyTo(state.map.getCenter(), 15);
        } else {
            fetchAndRenderVectors();
        }
    }
}
