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


// Mapbox Configuration
// Note: This is a public example token. For production, use your own from mapbox.com
const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoiZXhhbXBsZXMiLCJhIjoiY2p1dHRybDR5MGJuZjQzcGhrZ2doeGgwNyJ9.a-vxW4UaxOoUMWUTGnEArw';

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
        streets: { visible: true, stroke: '#333333', width: 1, fill: '#ffffff', fillEnabled: false, hatched: false, labelsEnabled: false, laserMode: 'score', power: 20, speed: 100 },
        water: { visible: true, stroke: '#3b82f6', width: 1, fill: '#3b82f6', fillEnabled: false, hatched: false, laserMode: 'engrave', power: 15, speed: 150 },
        buildings: { visible: true, stroke: '#64748b', width: 1, fill: '#64748b', fillEnabled: true, hatched: false, hatchStyle: 'lines', hatchScale: 1, hatchRotation: 45, laserMode: 'engrave', power: 10, speed: 200 },
        parks: { visible: true, stroke: '#22c55e', width: 0, fill: '#22c55e', fillEnabled: true, hatched: false, hatchStyle: 'lines', hatchScale: 1, hatchRotation: 45, laserMode: 'engrave', power: 10, speed: 200 },
        railways: { visible: true, stroke: '#475569', width: 1.5, fill: '#000000', fillEnabled: false, hatched: false, laserMode: 'score', power: 30, speed: 80 },
        industrial: { visible: false, stroke: '#94a3b8', width: 0.5, fill: '#cbd5e1', fillEnabled: false, hatched: false, laserMode: 'engrave', power: 10, speed: 200 },
        parking: { visible: false, stroke: '#94a3b8', width: 0.5, fill: '#e2e8f0', fillEnabled: true, hatched: false, hatchStyle: 'lines', hatchScale: 1, hatchRotation: 45, laserMode: 'engrave', power: 10, speed: 200 }
    },
    settings: {
        fontFamily: "'Outfit', sans-serif",
        fontSize: 14,
        bubble: false,
        mapStyle: 'standard',
        backgroundColor: '#ffffff',
        frameOutline: true // Default to true as per user request "always export outline"
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
    mapDiv.classList.remove(
        'map-filter-grey',
        'map-filter-line',
        'map-filter-vintage',
        'map-filter-blueprint',
        'map-filter-neon',
        'map-filter-mono',
        'map-filter-inverted',
        'map-filter-night'
    );

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
        case 'neon':
            url = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';
            className = 'map-filter-neon';
            break;
        case 'mono':
            url = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';
            className = 'map-filter-mono';
            break;
        case 'inverted':
            url = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';
            className = 'map-filter-inverted';
            break;
        case 'night':
            url = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png';
            className = 'map-filter-night';
            break;
        case 'mapbox-streets':
            url = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_ACCESS_TOKEN}`;
            break;
        case 'mapbox-outdoors':
            url = `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_ACCESS_TOKEN}`;
            break;
        case 'mapbox-light':
            url = `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_ACCESS_TOKEN}`;
            break;
        case 'mapbox-dark':
            url = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_ACCESS_TOKEN}`;
            break;
        case 'mapbox-satellite':
            url = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_ACCESS_TOKEN}`;
            break;
        case 'mapbox-satellite-streets':
            url = `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_ACCESS_TOKEN}`;
            break;
        case 'mapbox-navigation-day':
            url = `https://api.mapbox.com/styles/v1/mapbox/navigation-day-v1/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_ACCESS_TOKEN}`;
            break;
        case 'mapbox-navigation-night':
            url = `https://api.mapbox.com/styles/v1/mapbox/navigation-night-v1/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_ACCESS_TOKEN}`;
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
            exportBtn.disabled = false;
            exportBtn.innerText = "Export Laser (SVG)";

            // Auto Zoom-in if needed
            if (state.map.getZoom() < 15) {
                state.map.flyTo(state.map.getCenter(), 15);
            } else {
                fetchAndRenderVectors();
            }

        } else {
            layerList.classList.add('disabled');
            styleSelect.disabled = false;
            exportBtn.disabled = true;
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
        if (hatchedBtn) {
            const hatchSettings = document.getElementById(`layer-${layer}-hatch-settings`);
            hatchedBtn.addEventListener('change', (e) => {
                state.activeLayers[layer].hatched = e.target.checked;
                if (hatchSettings) {
                    hatchSettings.classList.toggle('visible', e.target.checked);
                }
                updateStyle();
                if (state.vectorMode) renderVectorLayers(); // Force re-render of patterns
            });

            // Initial visibility state
            if (hatchSettings && hatchedBtn.checked) {
                hatchSettings.classList.add('visible');
            }
        }

        // Hatch Patterns
        ['hatch-style', 'hatch-scale', 'hatch-rotation'].forEach(prop => {
            const el = document.getElementById(`layer-${layer}-${prop}`);
            if (el) {
                el.addEventListener('input', (e) => {
                    const camelProp = prop.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                    state.activeLayers[layer][camelProp] = e.target.value;

                    // Update value display if exists
                    const valEl = document.getElementById(`layer-${layer}-${prop}-val`);
                    if (valEl) {
                        valEl.innerText = e.target.value + (prop === 'hatch-rotation' ? '°' : '');
                    }

                    if (state.vectorMode) renderVectorLayers();
                });
            }
        });

        // Laser Settings
        ['laser-mode', 'power', 'speed'].forEach(prop => {
            const el = document.getElementById(`layer-${layer}-${prop}`);
            if (el) {
                el.addEventListener('input', (e) => {
                    const camelProp = prop.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                    state.activeLayers[layer][camelProp] = e.target.value;
                });
            }
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

    // Frame Outline Toggle
    const outlineCheck = document.getElementById('export-outline-check');
    if (outlineCheck) {
        outlineCheck.addEventListener('change', (e) => {
            state.settings.frameOutline = e.target.checked;
        });
    }

    // Export
    document.getElementById('export-btn').addEventListener('click', exportMap);
    document.getElementById('export-xtool-btn').addEventListener('click', () => exportMap(true));
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

    // World Scale Calculation
    // Baseline zoom is 15.
    // If zoom > 15 (zoomed in), scale > 1. Elements appear larger (occupy more pixels).
    const currentZoom = state.map.getZoom();
    const zoomScale = Math.pow(2, currentZoom - 15);

    // Update dynamic patterns
    const defs = document.querySelector('defs');
    Object.keys(state.activeLayers).forEach(key => {
        const conf = state.activeLayers[key];
        if (conf.hatched) {
            const patternId = `hatch-diag-${key}`;
            let pattern = document.getElementById(patternId);
            if (pattern) pattern.remove(); // Recreate to update style/transform

            pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
            pattern.setAttribute('id', patternId);
            pattern.setAttribute('patternUnits', 'userSpaceOnUse');

            // Scale pattern size by zoomScale
            const baseSize = 10 * (conf.hatchScale || 1);
            const size = baseSize * zoomScale;

            pattern.setAttribute('width', size);
            pattern.setAttribute('height', size);
            pattern.setAttribute('patternTransform', `rotate(${conf.hatchRotation || 0})`);

            const createLine = (x1, y1, x2, y2, dash = '') => {
                const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                l.setAttribute('x1', x1); l.setAttribute('y1', y1);
                l.setAttribute('x2', x2); l.setAttribute('y2', y2);
                l.setAttribute('stroke', conf.fill);
                // Also scale the pattern stroke width slightly, or keep it 1?
                // Visual consistency usually requires scaling it too, otherwise it looks too thin.
                // Let's scale it but clamp it so it doesn't get absurdly thick.
                l.setAttribute('stroke-width', (1 * zoomScale).toFixed(2));
                if (dash) l.setAttribute('stroke-dasharray', dash);
                return l;
            };

            switch (conf.hatchStyle) {
                case 'lines-left':
                    pattern.appendChild(createLine(0, size, size, 0));
                    break;
                case 'horizontal':
                    pattern.appendChild(createLine(0, size / 2, size, size / 2));
                    break;
                case 'vertical':
                    pattern.appendChild(createLine(size / 2, 0, size / 2, size));
                    break;
                case 'grid':
                    pattern.appendChild(createLine(0, 0, 0, size));
                    pattern.appendChild(createLine(0, 0, size, 0));
                    break;
                case 'crosshatch':
                    pattern.appendChild(createLine(0, 0, size, size));
                    pattern.appendChild(createLine(0, size, size, 0));
                    break;
                case 'dots':
                    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    circle.setAttribute('cx', size / 2); circle.setAttribute('cy', size / 2);
                    circle.setAttribute('r', (size / 6)); // Radius scales with size
                    circle.setAttribute('fill', conf.fill);
                    pattern.appendChild(circle);
                    break;
                case 'dots-large':
                    const circleL = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    circleL.setAttribute('cx', size / 2); circleL.setAttribute('cy', size / 2);
                    circleL.setAttribute('r', (size / 3));
                    circleL.setAttribute('fill', conf.fill);
                    pattern.appendChild(circleL);
                    break;
                case 'dashed':
                    pattern.appendChild(createLine(0, 0, 0, size, `${size / 2},${size / 2}`));
                    break;
                case 'zigzag':
                    const pZig = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    pZig.setAttribute('d', `M 0 ${size} L ${size / 2} 0 L ${size} ${size}`);
                    pZig.setAttribute('fill', 'none'); pZig.setAttribute('stroke', conf.fill);
                    pZig.setAttribute('stroke-width', (1 * zoomScale).toFixed(2));
                    pattern.appendChild(pZig);
                    break;
                case 'waves':
                    const pWave = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    pWave.setAttribute('d', `M 0 ${size / 2} Q ${size / 4} 0, ${size / 2} ${size / 2} T ${size} ${size / 2}`);
                    pWave.setAttribute('fill', 'none'); pWave.setAttribute('stroke', conf.fill);
                    pWave.setAttribute('stroke-width', (1 * zoomScale).toFixed(2));
                    pattern.appendChild(pWave);
                    break;
                case 'hexagons':
                    const pHex = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    const h = (Math.sqrt(3) / 2) * size;
                    pHex.setAttribute('d', `M ${size / 4} 0 L ${size * 3 / 4} 0 L ${size} ${h / 2} L ${size * 3 / 4} h L ${size / 4} h L 0 ${h / 2} Z`);
                    pHex.setAttribute('fill', 'none'); pHex.setAttribute('stroke', conf.fill);
                    pHex.setAttribute('stroke-width', (1 * zoomScale).toFixed(2));
                    pattern.appendChild(pHex);
                    pattern.setAttribute('height', h);
                    break;
                case 'bricks':
                    pattern.appendChild(createLine(0, 0, size, 0));
                    pattern.appendChild(createLine(0, size / 2, size, size / 2));
                    pattern.appendChild(createLine(0, 0, 0, size / 2));
                    pattern.appendChild(createLine(size / 2, size / 2, size / 2, size));
                    break;
                case 'stars':
                    const pStar = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    pStar.setAttribute('d', `M ${size / 2} 0 L ${size / 2} ${size} M 0 ${size / 2} L ${size} ${size / 2} M ${size / 4} ${size / 4} L ${size * 3 / 4} ${size * 3 / 4} M ${size * 3 / 4} ${size / 4} L ${size / 4} ${size * 3 / 4}`);
                    pStar.setAttribute('fill', 'none'); pStar.setAttribute('stroke', conf.fill);
                    pStar.setAttribute('stroke-width', (1 * zoomScale).toFixed(2));
                    pattern.appendChild(pStar);
                    break;
                case 'squares':
                    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    rect.setAttribute('x', size / 4); rect.setAttribute('y', size / 4);
                    rect.setAttribute('width', size / 2); rect.setAttribute('height', size / 2);
                    rect.setAttribute('fill', 'none'); rect.setAttribute('stroke', conf.fill);
                    rect.setAttribute('stroke-width', (1 * zoomScale).toFixed(2));
                    pattern.appendChild(rect);
                    break;
                case 'lines':
                default:
                    pattern.appendChild(createLine(0, 0, 0, size));
                    break;
            }
            defs.appendChild(pattern);
        }
    });

    const getStyle = (key) => {
        const conf = state.activeLayers[key];
        return {
            color: conf.stroke,
            // Scale stroke weight by zoomScale for 'Absolute' thickness
            weight: conf.width * zoomScale,
            opacity: 1,
            fill: true,
            fillColor: conf.hatched ? `url(#hatch-diag-${key})` : conf.fill,
            fillOpacity: conf.fillEnabled ? (conf.hatched ? 1 : 0.2) : 0
        };
    };

    // Filter features into groups and add to map
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

async function exportMap(isXtool = false) {
    const btn = isXtool ? document.getElementById('export-xtool-btn') : document.getElementById('export-btn');
    const originalText = btn.innerText;

    try {
        if (!state.map) throw new Error("Map not initialized");
        btn.disabled = true;
        btn.innerText = isXtool ? "Optimizing for xTool..." : "Generating SVG...";

        // If isXtool and vectorMode is off, we do a BitMap-to-XCS export
        if (isXtool && !state.vectorMode) {
            return exportXCS(null, null, null, null, true); // true for isBitmapOnly
        }

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

            // Special case for native .xcs export
            if (isXtool) {
                return exportXCS(geoJsonData, bounds, widthMm, heightMm, false);
            }

            // Group paths
            const groups = { streets: [], water: [], buildings: [], parks: [], railways: [], industrial: [], parking: [] };

            geoJsonData.features.forEach(f => {
                const props = f.properties;
                const path = geometryToPath(f.geometry, bounds, widthMm, heightMm);
                if (!path) return;

                const layerKey = getLayerKey(f);
                if (!layerKey || !state.activeLayers[layerKey].visible) return;

                const conf = state.activeLayers[layerKey];
                const style = `stroke="${conf.stroke}" stroke-width="${conf.width}" fill="${conf.hatched ? `url(#hatch-diag-${layerKey})` : (conf.fillEnabled ? conf.fill : 'none')}" fill-opacity="${conf.fillEnabled ? (conf.hatched ? 1 : 0.2) : 0}"`;

                groups[layerKey].push(`<path d="${path}" ${style} />`);
            });

            // Helper to get attrs
            const getAttrs = (k) => {
                const c = state.activeLayers[k];
                if (isXtool) {
                    // Standard Laser Colors for Autodetect
                    // Red = Cut, Blue = Score, Black/Gray = Engrave
                    let stroke = '#000000'; // Default Engrave
                    if (c.laserMode === 'score') stroke = '#0000FF'; // Blue
                    if (c.laserMode === 'cut') stroke = '#FF0000'; // Red

                    const fill = c.laserMode === 'engrave' ? '#000000' : 'none';
                    return `stroke="${stroke}" stroke-width="${c.width}" fill="${fill}" xtool:mode="${c.laserMode}" xtool:power="${c.power}" xtool:speed="${c.speed}"`;
                }
                const fill = c.hatched ? `url(#hatch-diag-${k})` : (c.fillEnabled ? c.fill : 'none');
                return `stroke="${c.stroke}" stroke-width="${c.width}" fill="${fill}" fill-opacity="${c.fillEnabled ? (c.hatched ? 1 : 0.2) : 0}"`;
            };

            // Pattern defs for export
            const patternsSvg = Object.keys(state.activeLayers)
                .filter(k => state.activeLayers[k].hatched)
                .map(k => {
                    const conf = state.activeLayers[k];
                    const size = 4 * (conf.hatchScale || 1); // Use smaller base size for export (PDF/SVG)
                    let content = '';

                    switch (conf.hatchStyle) {
                        case 'lines-left':
                            content = `<line x1="0" y1="${size}" x2="${size}" y2="0" stroke="${conf.fill}" stroke-width="0.5"/>`;
                            break;
                        case 'horizontal':
                            content = `<line x1="0" y1="${size / 2}" x2="${size}" y2="${size / 2}" stroke="${conf.fill}" stroke-width="0.5"/>`;
                            break;
                        case 'vertical':
                            content = `<line x1="${size / 2}" y1="0" x2="${size / 2}" y2="${size}" stroke="${conf.fill}" stroke-width="0.5"/>`;
                            break;
                        case 'grid':
                            content = `<line x1="0" y1="0" x2="0" y2="${size}" stroke="${conf.fill}" stroke-width="0.5"/><line x1="0" y1="0" x2="${size}" y2="0" stroke="${conf.fill}" stroke-width="0.5"/>`;
                            break;
                        case 'crosshatch':
                            content = `<line x1="0" y1="0" x2="${size}" y2="${size}" stroke="${conf.fill}" stroke-width="0.5"/><line x1="0" y1="${size}" x2="${size}" y2="0" stroke="${conf.fill}" stroke-width="0.5"/>`;
                            break;
                        case 'dots':
                            content = `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 6}" fill="${conf.fill}"/>`;
                            break;
                        case 'dots-large':
                            content = `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 3}" fill="${conf.fill}"/>`;
                            break;
                        case 'dashed':
                            content = `<line x1="0" y1="0" x2="0" y2="${size}" stroke="${conf.fill}" stroke-width="0.5" stroke-dasharray="${size / 2},${size / 2}"/>`;
                            break;
                        case 'zigzag':
                            content = `<path d="M 0 ${size} L ${size / 2} 0 L ${size} ${size}" fill="none" stroke="${conf.fill}" stroke-width="0.5"/>`;
                            break;
                        case 'waves':
                            content = `<path d="M 0 ${size / 2} Q ${size / 4} 0, ${size / 2} ${size / 2} T ${size} ${size / 2}" fill="none" stroke="${conf.fill}" stroke-width="0.5"/>`;
                            break;
                        case 'hexagons':
                            const h_exp = (Math.sqrt(3) / 2) * size;
                            content = `<path d="M ${size / 4} 0 L ${size * 3 / 4} 0 L ${size} ${h_exp / 2} L ${size * 3 / 4} ${h_exp} L ${size / 4} ${h_exp} L 0 ${h_exp / 2} Z" fill="none" stroke="${conf.fill}" stroke-width="0.5"/>`;
                            break;
                        case 'bricks':
                            content = `<line x1="0" y1="0" x2="${size}" y2="0" stroke="${conf.fill}" stroke-width="0.5"/><line x1="0" y1="${size / 2}" x2="${size}" y2="${size / 2}" stroke="${conf.fill}" stroke-width="0.5"/><line x1="0" y1="0" x2="0" y2="${size / 2}" stroke="${conf.fill}" stroke-width="0.5"/><line x1="${size / 2}" y1="${size / 2}" x2="${size / 2}" y2="${size}" stroke="${conf.fill}" stroke-width="0.5"/>`;
                            break;
                        case 'stars':
                            content = `<path d="M ${size / 2} 0 L ${size / 2} ${size} M 0 ${size / 2} L ${size} ${size / 2} M ${size / 4} ${size / 4} L ${size * 3 / 4} ${size * 3 / 4} M ${size * 3 / 4} ${size / 4} L ${size / 4} ${size * 3 / 4}" fill="none" stroke="${conf.fill}" stroke-width="0.5"/>`;
                            break;
                        case 'squares':
                            content = `<rect x="${size / 4}" y="${size / 4}" width="${size / 2}" height="${size / 2}" fill="none" stroke="${conf.fill}" stroke-width="0.5"/>`;
                            break;
                        case 'lines':
                        default:
                            content = `<line x1="0" y1="0" x2="0" y2="${size}" stroke="${conf.fill}" stroke-width="0.5"/>`;
                            break;
                    }
                    return `<pattern id="hatch-diag-${k}" patternUnits="userSpaceOnUse" width="${size}" height="${size}" patternTransform="rotate(${conf.hatchRotation || 0})">${content}</pattern>`;
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

            const isSplitExport = document.getElementById('export-split-check')?.checked;
            const isOutlineChecked = document.getElementById('export-outline-check')?.checked;
            const filename = isXtool ? 'xtool-project.svg' : (isSplitExport ? 'vector-map' : 'vector-map.svg');

            // Frame outline path
            const framePath = `M 0 0 H ${widthMm} V ${heightMm} H 0 Z`;
            const frameStyle = isXtool ? `stroke="#FF0000" stroke-width="0.2" fill="none" xtool:mode="cut" xtool:power="100" xtool:speed="10"` : `stroke="#FF0000" stroke-width="0.2" fill="none"`;
            const frameSvg = isOutlineChecked ? `<g id="Frame_Outline">${isXtool ? `<path d="${framePath}" ${frameStyle} />` : `<rect x="0" y="0" width="${widthMm}" height="${heightMm}" rx="${radiusMm}" ry="${radiusMm}" ${frameStyle} />`}</g>` : '';

            if (isSplitExport && !isXtool) {
                // Export multiple files
                const layerKeys = Object.keys(groups);
                for (const key of layerKeys) {
                    if (groups[key].length === 0) continue;

                    const layerSvg = `
    <svg width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <clipPath id="mapClip">
                <rect x="0" y="0" width="${widthMm}" height="${heightMm}" rx="${radiusMm}" ry="${radiusMm}" />
            </clipPath>
            ${patternsSvg}
        </defs>
        <g clip-path="url(#mapClip)">
            <g id="${key}" ${getAttrs(key)}>${groups[key].join('')}</g>
        </g>
    </svg>`;
                    downloadFile(layerSvg, `map-${key}.svg`, 'image/svg+xml');
                    await new Promise(r => setTimeout(r, 200)); // Delay between downloads
                }

                // Markers, Labels and Frame Outline as another file
                if (markerSvg || labelsSvg.length > 0 || isOutlineChecked) {
                    const auxSvg = `
    <svg width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}" xmlns="http://www.w3.org/2000/svg">
        <g id="Labels">${labelsSvg.join('')}</g>
        <g id="Markers">${markerSvg}</g>
        ${frameSvg}
    </svg>`;
                    downloadFile(auxSvg, 'map-annotations.svg', 'image/svg+xml');
                }
            } else {
                // original single file export
                const laserNs = isXtool ? 'xmlns:xtool="http://www.xtool.com/xtool"' : '';
                const svgContent = `
    <svg width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}" xmlns="http://www.w3.org/2000/svg" ${laserNs}>
        <defs>
            <clipPath id="mapClip">
                <rect x="0" y="0" width="${widthMm}" height="${heightMm}" rx="${radiusMm}" ry="${radiusMm}" />
            </clipPath>
            ${patternsSvg}
        </defs>
        ${isXtool ? '' : `<rect x="0" y="0" width="${widthMm}" height="${heightMm}" rx="${radiusMm}" ry="${radiusMm}" fill="${state.settings.backgroundColor}" />`}
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
        ${frameSvg}
    </svg>`;
                downloadFile(svgContent, filename, 'image/svg+xml');
            }

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
            if (hb) {
                hb.checked = conf.hatched;
                const hatchSettings = document.getElementById(`layer-${key}-hatch-settings`);
                if (hatchSettings) {
                    hatchSettings.classList.toggle('visible', conf.hatched);
                }
            }
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

/**
 * Native .xcs Export for xTool Creative Space
 * Generates a JSON project file compatible with xTool Studio.
 */
/**
 * Helper to get layer key from feature properties
 */
const getLayerKey = (f) => {
    const p = f.properties;
    if (p.highway) return 'streets';
    if (p.railway) return 'railways';
    if (p.waterway || p.natural === 'water' || p.landuse === 'reservoir') return 'water';
    if (p.building) return 'buildings';
    if (p.leisure === 'park' || p.leisure === 'garden' || p.landuse === 'grass' || p.landuse === 'forest' || p.natural === 'wood' || p.natural === 'scrub' || p.landuse === 'orchard' || p.landuse === 'vineyard') return 'parks';
    if (p.landuse === 'industrial' || p.landuse === 'commercial') return 'industrial';
    if (p.amenity === 'parking') return 'parking';
    return null;
};

/**
 * Native .xcs Export for xTool Creative Space
 * Generates a JSON project file compatible with xTool Studio.
 */
async function exportXCS(geoJsonData, bounds, widthMm, heightMm, isBitmapOnly = false) {
    const canvasId = generateUUID();
    const projectTraceID = generateUUID();

    const layerData = {};
    const displays = [];
    const processingDataMap = {};
    const canvasWidth = parseFloat(document.getElementById('map-width').value) || 200;
    const canvasHeight = parseFloat(document.getElementById('map-height').value) || 200;

    if (isBitmapOnly) {
        // --- BITMAP ONLY EXPORT ---
        const wrapper = document.getElementById('map-wrapper');
        const canvas = await html2canvas(wrapper, {
            useCORS: true,
            scale: 2,
            backgroundColor: state.settings.backgroundColor
        });
        const imgData = canvas.toDataURL('image/png');
        const id = generateUUID();

        displays.push({
            id: id,
            name: "Map Engraving",
            type: "BITMAP",
            x: 0,
            y: 0,
            angle: 0,
            scale: { x: 1, y: 1 },
            skew: { x: 0, y: 0 },
            pivot: { x: 0, y: 0 },
            offsetX: 0,
            offsetY: 0,
            lockRatio: true,
            visible: true,
            layerTag: "#000000",
            layerColor: "#000000",
            resourceOrigin: imgData,
            width: canvasWidth,
            height: canvasHeight,
            isFill: true
        });

        processingDataMap[id] = {
            isFill: true,
            type: "BITMAP",
            processingType: "BITMAP_ENGRAVING",
            data: {
                BITMAP_ENGRAVING: {
                    materialType: "customize",
                    planType: "official",
                    parameter: {
                        customize: { power: 60, speed: 100, repeat: 1, laser: "laser_10W", density: 100, bitmapScanMode: "zMode", bitmapMode: "grayscale", processHead: "LASER" }
                    }
                }
            }
        };

        layerData["#000000"] = { name: "Engraving", order: 1, visible: true };

    } else {
        // --- VECTOR EXPORT ---
        // Prepare Layer Metadata (Colors in XCS)
        Object.keys(state.activeLayers).forEach((key, idx) => {
            const conf = state.activeLayers[key];
            if (!conf.visible) return;
            const color = conf.stroke || "#000000";
            layerData[color] = {
                name: key.charAt(0).toUpperCase() + key.slice(1),
                order: idx + 1,
                visible: true
            };
        });

        // Process Features into XCS Displays
        geoJsonData.features.forEach(f => {
            const key = getLayerKey(f);
            if (!key || !state.activeLayers[key].visible) return;

            const conf = state.activeLayers[key];
            const id = generateUUID();
            const dPath = geometryToPath(f.geometry, bounds, widthMm, heightMm);
            if (!dPath) return;

            // Create display object for the path
            const display = {
                id: id,
                name: null,
                type: "PATH",
                x: 0,
                y: 0,
                angle: 0,
                scale: { x: 1, y: 1 },
                skew: { x: 0, y: 0 },
                pivot: { x: 0, y: 0 },
                localSkew: { x: 0, y: 0 },
                offsetX: 0,
                offsetY: 0,
                lockRatio: true,
                isClosePath: true,
                zOrder: 0,
                groupTag: "",
                layerTag: conf.stroke,
                layerColor: conf.stroke,
                visible: true,
                originColor: "#000000",
                enableTransform: true,
                visibleState: true,
                lockState: false,
                resourceOrigin: "",
                customData: {},
                rootComponentId: "",
                minCanvasVersion: "0.0.0",
                fill: { paintType: "color", visible: conf.fillEnabled && !conf.hatched, color: toXToolColor(conf.fill), alpha: 1 },
                stroke: { paintType: "color", visible: true, color: toXToolColor(conf.stroke), alpha: 1, width: conf.width || 0.1, cap: "butt", join: "miter", miterLimit: 4, alignment: 0.5 },
                width: widthMm,
                height: heightMm,
                isFill: conf.fillEnabled && !conf.hatched,
                lineColor: toXToolColor(conf.stroke),
                fillColor: conf.fill,
                points: [],
                dPath: dPath,
                fillRule: "nonzero",
                graphicX: 0,
                graphicY: 0,
                isCompoundPath: false
            };

            displays.push(display);

            // Add to processing data map (Power/Speed settings)
            const procType = conf.laserMode === 'cut' ? "VECTOR_CUTTING" : "VECTOR_ENGRAVING";
            const isFillXCS = conf.laserMode === 'engrave';

            processingDataMap[id] = {
                isFill: isFillXCS,
                type: "PATH",
                processingType: procType,
                data: {
                    VECTOR_ENGRAVING: {
                        materialType: "customize",
                        planType: "official",
                        parameter: {
                            customize: { power: parseInt(conf.power), speed: parseInt(conf.speed), repeat: 1, laser: "laser_10W", density: 100, processHead: "LASER" }
                        }
                    },
                    VECTOR_CUTTING: {
                        materialType: "customize",
                        planType: "official",
                        parameter: {
                            customize: { power: parseInt(conf.power), speed: parseInt(conf.speed), repeat: 1, laser: "laser_10W", processHead: "LASER" }
                        }
                    }
                }
            };
        });

        // Add Frame Outline to XCS
        const isOutlineChecked = document.getElementById('export-outline-check')?.checked;
        if (isOutlineChecked) {
            const frameId = generateUUID();
            const framePath = `M 0 0 H ${canvasWidth} V ${canvasHeight} H 0 Z`;

            displays.push({
                id: frameId,
                name: "Frame Outline",
                type: "PATH",
                x: 0,
                y: 0,
                angle: 0,
                scale: { x: 1, y: 1 },
                skew: { x: 0, y: 0 },
                pivot: { x: 0, y: 0 },
                localSkew: { x: 0, y: 0 },
                offsetX: 0,
                offsetY: 0,
                lockRatio: true,
                isClosePath: true,
                zOrder: 999, // On top
                groupTag: "",
                layerTag: "#FF0000",
                layerColor: "#FF0000",
                visible: true,
                originColor: "#FF0000",
                enableTransform: true,
                visibleState: true,
                lockState: false,
                resourceOrigin: "",
                customData: {},
                rootComponentId: "",
                minCanvasVersion: "0.0.0",
                fill: { paintType: "none", visible: false, color: 0, alpha: 1 },
                stroke: { paintType: "color", visible: true, color: 16711680, alpha: 1, width: 0.2, cap: "butt", join: "miter", miterLimit: 4, alignment: 0.5 },
                width: canvasWidth,
                height: canvasHeight,
                isFill: false,
                lineColor: 16711680,
                fillColor: "#000000",
                points: [],
                dPath: framePath,
                fillRule: "nonzero",
                graphicX: 0,
                graphicY: 0,
                isCompoundPath: false
            });

            processingDataMap[frameId] = {
                isFill: false,
                type: "PATH",
                processingType: "VECTOR_CUTTING",
                data: {
                    VECTOR_CUTTING: {
                        materialType: "customize",
                        planType: "official",
                        parameter: {
                            customize: { power: 100, speed: 10, repeat: 1, laser: "laser_10W", processHead: "LASER" }
                        }
                    }
                }
            };

            layerData["#FF0000"] = { name: "Frame Outline (Cut)", order: 0, visible: true };
        }
    }

    // Assemble final project structure
    const xcsStructure = {
        canvasId: canvasId,
        canvas: [{
            id: canvasId,
            title: "MapGen Project",
            layerData: layerData,
            groupData: {},
            displays: displays,
            extendInfo: {
                version: "2.15.17",
                minCanvasVersion: "0.0.0",
                displayProcessConfigMap: {},
                rulerPluginData: { rulerGuide: [] },
                gridOptions: { color: "normal", isShow: true }
            }
        }],
        extId: "D1_Pro",
        extName: "D1 Pro",
        device: {
            id: "D1_Pro",
            power: 10,
            data: {
                dataType: "Map",
                value: [
                    [canvasId, {
                        mode: "LASER_PLANE",
                        data: {
                            LASER_PLANE: {
                                material: 1, focalLen: 5, isProcessByLayer: false, pathPlanning: "auto",
                                thickness: 3, fanGear: 3, purifierGear: 4,
                                precautionCodes: ["FLAMMABLE", "TURN_ON_AIR_PUMP"]
                            }
                        },
                        displays: {
                            dataType: "Map",
                            value: Object.entries(processingDataMap)
                        }
                    }]
                ]
            }
        },
        minRequiredVersion: "2.6.0",
        projectTraceID: projectTraceID
    };

    // Download Blob
    const blob = new Blob([JSON.stringify(xcsStructure, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MapGen_${new Date().getTime()}.xcs`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Reset button UI
    const btn = document.getElementById('export-xtool-btn');
    btn.disabled = false;
    btn.innerText = "Open in xTool Studio";
}

function generateUUID() {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function toXToolColor(hex) {
    if (!hex) return 0;
    const cleanHex = hex.replace('#', '');
    return parseInt(cleanHex, 16);
}
