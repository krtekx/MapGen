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
    blackMode: false,
    grayscaleMode: false,
    vectorData: null, // Stores GeoJSON
    vectorLayers: {}, // Stores Leaflet Layer references
    activeLayers: {
        streets: { visible: true, stroke: '#333333', width: 1, fill: '#ffffff', fillEnabled: false, hatched: false, hatchStyle: 'lines', hatchScale: 1, hatchRotation: 45, hatchColor: '#000000', hatchWidth: 0.5, hatchText: 'STREET', labelsEnabled: false, laserMode: 'score', power: 20, speed: 100 },
        water: { visible: true, stroke: '#3b82f6', width: 1, fill: '#3b82f6', fillEnabled: false, hatched: false, hatchStyle: 'lines', hatchScale: 1, hatchRotation: 45, hatchColor: '#000000', hatchWidth: 0.5, hatchText: 'WATER', laserMode: 'engrave', power: 15, speed: 150 },
        buildings: { visible: true, stroke: '#64748b', width: 1, fill: '#64748b', fillEnabled: true, hatched: false, hatchStyle: 'lines', hatchScale: 1, hatchRotation: 45, hatchColor: '#000000', hatchWidth: 0.5, hatchText: 'MAP', laserMode: 'engrave', power: 10, speed: 200 },
        parks: { visible: true, stroke: '#22c55e', width: 0, fill: '#22c55e', fillEnabled: true, hatched: false, hatchStyle: 'lines', hatchScale: 1, hatchRotation: 45, hatchColor: '#000000', hatchWidth: 0.5, hatchText: 'PARK', laserMode: 'engrave', power: 10, speed: 200 },
        railways: { visible: true, stroke: '#475569', width: 1.5, fill: '#000000', fillEnabled: false, hatched: false, hatchStyle: 'lines', hatchScale: 1, hatchRotation: 45, hatchColor: '#000000', hatchWidth: 0.5, hatchText: 'RAIL', laserMode: 'score', power: 30, speed: 80 },
        industrial: { visible: false, stroke: '#94a3b8', width: 0.5, fill: '#cbd5e1', fillEnabled: false, hatched: false, hatchStyle: 'lines', hatchScale: 1, hatchRotation: 45, hatchColor: '#000000', hatchWidth: 0.5, hatchText: 'INDUS', laserMode: 'engrave', power: 10, speed: 200 },
        parking: { visible: false, stroke: '#94a3b8', width: 0.5, fill: '#e2e8f0', fillEnabled: true, hatched: false, hatchStyle: 'lines', hatchScale: 1, hatchRotation: 45, hatchColor: '#000000', hatchWidth: 0.5, hatchText: 'P', laserMode: 'engrave', power: 10, speed: 200 }
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

const StatusLog = {
    term: null,
    bar: null,
    mem: null,
    zoom: null,
    init() {
        this.term = document.getElementById('status-terminal');
        this.bar = document.getElementById('progress-bar');
        this.mem = document.getElementById('status-memory');
        this.zoom = document.getElementById('status-zoom');
    },
    log(msg, type = '') {
        if (!this.term) this.init();
        if (!this.term) return; // fail safe
        const line = document.createElement('div');
        line.className = `terminal-line ${type}`;
        line.textContent = `> ${msg}`;
        this.term.insertBefore(line, this.term.firstChild); // Prepend
        if (this.term.children.length > 50) this.term.lastChild.remove();
    },
    progress(percent) {
        if (!this.bar) this.init();
        if (!this.bar) return;
        this.bar.style.width = `${percent}%`;
    },
    updateMeta() {
        if (!this.zoom) this.init();
        if (!this.zoom) return;
        const z = state.map ? state.map.getZoom() : '--';
        this.zoom.textContent = `Zoom: ${z}`;

        // Estimate memory
        let size = 0;
        if (state.vectorData) {
            try {
                size = JSON.stringify(state.vectorData).length;
            } catch (e) { }
        }
        const mb = (size / 1024 / 1024).toFixed(2);
        this.mem.textContent = `Mem: ${mb} MB`;
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
    state.tileLayer.setUrl(url);
    if (className) mapDiv.classList.add(className);
    state.settings.mapStyle = style;
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const debouncedRenderVectorLayers = debounce(() => {
    if (state.vectorMode) renderVectorLayers();
}, 500);

function setupControls() {
    // Search
    const searchBtn = document.getElementById('search-btn');
    const addressInput = document.getElementById('address-input');
    searchBtn.addEventListener('click', () => doSearch(addressInput.value));
    addressInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') doSearch(addressInput.value);
    });

    // Map Style
    // Map Style Buttons
    const styleBtns = document.querySelectorAll('.style-btn');
    const syncMapStyleUI = (val) => {
        styleBtns.forEach(b => {
            if (b.dataset.val === val) b.classList.add('active');
            else b.classList.remove('active');
        });
    };

    styleBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const val = e.target.dataset.val;
            state.settings.mapStyle = val;
            syncMapStyleUI(val);
            setMapStyle(val);
        });
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
        state.settings.mapRadius = parseFloat(mm);
        document.getElementById('map-wrapper').style.borderRadius = `${mm}mm`;
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

    const layers = ['buildings', 'water', 'streets', 'parks', 'railways', 'industrial', 'parking'];

    const updateUIState = () => {
        const styleGrid = document.getElementById('map-style-grid');
        if (state.vectorMode) {
            layerList.classList.remove('disabled');
            if (styleGrid) {
                styleGrid.style.pointerEvents = 'none';
                styleGrid.style.opacity = '0.5';
            }

            // Auto Zoom-in if needed
            if (state.map.getZoom() < 15) {
                state.map.flyTo(state.map.getCenter(), 15);
            } else {
                fetchAndRenderVectors();
            }

        } else {
            layerList.classList.add('disabled');
            if (styleGrid) {
                styleGrid.style.pointerEvents = 'auto';
                styleGrid.style.opacity = '1';
            }
            clearVectorLayers();
            state.tileLayer.setOpacity(1);
        }
    };

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
            const getVal = (id, type) => {
                const el = document.getElementById(id);
                if (!el) return null;
                return type === 'chk' ? el.checked : el.value;
            };

            let rawStroke = getVal(`layer-${layer}-stroke`);
            if (rawStroke === '#000000') rawStroke = '#ffffff';
            else if (rawStroke === '#ffffff') rawStroke = '#000000';

            state.activeLayers[layer].stroke = rawStroke;
            state.activeLayers[layer].width = parseFloat(getVal(`layer-${layer}-width`)) || 0;
            state.activeLayers[layer].fill = getVal(`layer-${layer}-fill`);
            state.activeLayers[layer].fillEnabled = getVal(`layer-${layer}-fill-enabled`, 'chk');

            // Immediate feedback (though weight might be slightly off until full render)
            if (state.vectorLayers[layer]) {
                const conf = state.activeLayers[layer];
                state.vectorLayers[layer].setStyle({
                    color: conf.stroke,
                    weight: conf.width, // Note: real render applies zoom scale
                    fillColor: conf.fill,
                    fillOpacity: conf.fillEnabled ? 0.2 : 0
                });
            }

            // Trigger full re-render (debounced) to ensure patterns and correct scaling
            debouncedRenderVectorLayers();
        };

        ['stroke', 'width', 'fill'].forEach(prop => {
            const el = document.getElementById(`layer-${layer}-${prop}`);
            if (el) el.addEventListener('input', updateStyle);
        });

        const fillEnabledBtn = document.getElementById(`layer-${layer}-fill-enabled`);
        if (fillEnabledBtn) fillEnabledBtn.addEventListener('change', updateStyle);

        const hatchedBtn = document.getElementById(`layer-${layer}-hatched`);
        const hatchTrigger = document.getElementById(`layer-${layer}-hatch-trigger`);
        const hatchSettings = document.getElementById(`layer-${layer}-hatch-settings`);

        if (hatchedBtn) {
            hatchedBtn.addEventListener('change', (e) => {
                state.activeLayers[layer].hatched = e.target.checked;
                // Auto-show settings if checked for the first time? 
                // Let's keep it manual via the button to save space, 
                // OR auto-open if the user explicitly checks it.
                if (e.target.checked && hatchSettings && !hatchSettings.classList.contains('visible')) {
                    hatchSettings.classList.add('visible');
                }
                updateStyle();
            });
        }

        if (hatchTrigger && hatchSettings) {
            hatchTrigger.addEventListener('click', () => {
                hatchSettings.classList.toggle('visible');
            });
        }

        // Hatch Patterns - Sync Range and Number inputs
        ['hatch-style', 'hatch-scale', 'hatch-rotation', 'hatch-color', 'hatch-width'].forEach(prop => {
            const rawProp = `layer-${layer}-${prop}`;
            const el = document.getElementById(rawProp);

            // Sync logic for scale/rotation
            if (prop === 'hatch-scale' || prop === 'hatch-rotation') {
                const rangeInput = document.getElementById(rawProp);
                const numInput = document.getElementById(rawProp + '-num'); // e.g. layer-buildings-hatch-scale-num

                const syncAndUpdate = (val) => {
                    const camelProp = prop.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                    state.activeLayers[layer][camelProp] = val;
                    debouncedRenderVectorLayers();
                };

                if (rangeInput && numInput) {
                    rangeInput.addEventListener('input', (e) => {
                        numInput.value = e.target.value;
                        syncAndUpdate(e.target.value);
                    });
                    numInput.addEventListener('input', (e) => {
                        rangeInput.value = e.target.value;
                        syncAndUpdate(e.target.value);
                    });
                }
            } else {
                // Style, Color, Width
                if (el) {
                    el.addEventListener('input', (e) => {
                        const camelProp = prop.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                        state.activeLayers[layer][camelProp] = e.target.value;

                        // Toggle Text Row visibility if style changes
                        if (prop === 'hatch-style') {
                            const textRow = document.getElementById(`layer-${layer}-hatch-text-row`);
                            if (textRow) {
                                textRow.style.display = e.target.value === 'text' ? 'block' : 'none';
                            }
                        }

                        debouncedRenderVectorLayers();
                    });
                }
            }
        });

        // Hatch Text dedicated listener
        const hatchTextEl = document.getElementById(`layer-${layer}-hatch-text`);
        if (hatchTextEl) {
            hatchTextEl.addEventListener('input', (e) => {
                state.activeLayers[layer].hatchText = e.target.value;
                debouncedRenderVectorLayers();
            });
        }

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

    // Special Modes (Black & Grayscale)
    document.getElementById('black-mode-toggle').addEventListener('change', (e) => {
        state.blackMode = e.target.checked;
        if (state.blackMode && state.grayscaleMode) {
            state.grayscaleMode = false;
            document.getElementById('grayscale-mode-toggle').checked = false;
        }
        if (state.vectorMode) renderVectorLayers();
    });

    document.getElementById('grayscale-mode-toggle').addEventListener('change', (e) => {
        state.grayscaleMode = e.target.checked;
        if (state.grayscaleMode && state.blackMode) {
            state.blackMode = false;
            document.getElementById('black-mode-toggle').checked = false;
        }
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

const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];

async function fetchWithFallback(query) {
    for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
            StatusLog.log(`Querying: ${new URL(endpoint).hostname}...`, 'info');
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

            const response = await fetch(endpoint, {
                method: 'POST',
                body: query,
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 429) {
                    StatusLog.log(`Rate limited by ${new URL(endpoint).hostname}, trying next...`, 'warn');
                    continue;
                }
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.json();
        } catch (e) {
            console.warn(`Failed to fetch from ${endpoint}:`, e);
            StatusLog.log(`Failed: ${new URL(endpoint).hostname} (${e.message})`, 'warn');
        }
    }
    throw new Error("All Overpass servers failed.");
}

async function fetchAndRenderVectors() {
    if (!state.map) return;
    const btn = document.getElementById('vector-mode-toggle');
    // Simple lock
    if (btn.disabled) return;
    btn.disabled = true;

    // Update zoom display
    StatusLog.updateMeta();

    try {
        const bounds = state.map.getBounds();
        const currentZoom = state.map.getZoom();

        // Safety: Prevent fetching if zoom is too low (area too big)
        if (currentZoom < 15) {
            StatusLog.log(`Zoom level ${currentZoom} too low.`, 'warn');
            StatusLog.log(`Please zoom in to at least 15 (Vector Mode).`, 'warn');
            StatusLog.progress(0);

            // We can clear existing ones to indicate "out of range".
            clearVectorLayers();
            state.tileLayer.setOpacity(1); // Show raster again

            // We do NOT turn off vector mode toggle, just show warning.
            // But we must stop the fetch.
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

        StatusLog.log("Starting Query...", "info");
        StatusLog.progress(20);

        console.log("Fetching vector data...");

        let data;
        try {
            data = await fetchWithFallback(query);
        } catch (fetchError) {
            throw new Error("Network Error: Could not reach OSM servers. " + fetchError.message);
        }

        StatusLog.log("Data Received. Parsing...", "info");
        StatusLog.progress(60);

        // Convert to GeoJSON
        state.vectorData = osmtogeojson(data);
        console.log("GeoJSON parsed:", state.vectorData);

        StatusLog.log(`Parsed ${data.elements ? data.elements.length : 0} elements.`, "info");
        StatusLog.progress(80);
        StatusLog.updateMeta();

        renderVectorLayers();
        StatusLog.log("Render Complete.", "info");
        StatusLog.progress(100);
        setTimeout(() => StatusLog.progress(0), 2000);

    } catch (e) {
        console.error("Vector fetch failed:", e);
        StatusLog.log(`Error: ${e.message}`, "error");
        StatusLog.progress(0);
        // Do not turn off toggle automatically, just user know it failed
        // Revert raster visibility if it failed completely
        if (!state.vectorData) state.tileLayer.setOpacity(1);
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

const toGrayscale = (hex) => {
    if (!hex || hex.startsWith('url')) return hex;
    const color = hex.replace('#', '');
    const r = parseInt(color.substring(0, 2), 16);
    const g = parseInt(color.substring(2, 4), 16);
    const b = parseInt(color.substring(4, 6), 16);
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    const hexVal = gray.toString(16).padStart(2, '0');
    return `#${hexVal}${hexVal}${hexVal}`;
};

const getEffectiveColors = (conf) => {
    let stroke = conf.stroke;
    let fill = conf.fill;
    let hatchColor = conf.hatchColor || '#000000';

    if (state.blackMode) {
        stroke = '#000000';
        fill = '#000000';
        hatchColor = '#000000';
    } else if (state.grayscaleMode) {
        stroke = toGrayscale(stroke);
        fill = toGrayscale(fill);
        hatchColor = toGrayscale(hatchColor);
    }
    return { stroke, fill, hatchColor };
};

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
        const { stroke, fill, hatchColor } = getEffectiveColors(conf);

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

            // Background fill if enabled (allows Solid Fill + Hatch)
            if (conf.fillEnabled) {
                const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                bgRect.setAttribute('width', size);
                bgRect.setAttribute('height', size);
                bgRect.setAttribute('fill', fill);
                // No opacity here, solid fill
                pattern.appendChild(bgRect);
            }

            const createLine = (x1, y1, x2, y2, dash = '') => {
                const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                l.setAttribute('x1', x1); l.setAttribute('y1', y1);
                l.setAttribute('x2', x2); l.setAttribute('y2', y2);
                l.setAttribute('stroke', hatchColor); // Use hatch color

                // Scale hatch width
                const hw = (conf.hatchWidth || 0.5) * zoomScale;
                l.setAttribute('stroke-width', hw.toFixed(2));

                if (dash) l.setAttribute('stroke-dasharray', dash);
                return l;
            };

            const hColor = hatchColor;
            const hWidth = (conf.hatchWidth || 0.5) * zoomScale;

            // Helper for circle/paths
            const setStrokeFill = (el, isStroke = true) => {
                if (isStroke) {
                    el.setAttribute('stroke', hColor);
                    el.setAttribute('stroke-width', hWidth.toFixed(2));
                    el.setAttribute('fill', 'none');
                } else {
                    el.setAttribute('fill', hColor);
                }
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
                    circle.setAttribute('r', (size / 6));
                    setStrokeFill(circle, false);
                    pattern.appendChild(circle);
                    break;
                case 'dots-large':
                    const circleL = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    circleL.setAttribute('cx', size / 2); circleL.setAttribute('cy', size / 2);
                    circleL.setAttribute('r', (size / 3));
                    setStrokeFill(circleL, false);
                    pattern.appendChild(circleL);
                    break;
                case 'dashed':
                    pattern.appendChild(createLine(0, 0, 0, size, `${size / 2},${size / 2}`));
                    break;
                case 'zigzag':
                    const pZig = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    pZig.setAttribute('d', `M 0 ${size} L ${size / 2} 0 L ${size} ${size}`);
                    setStrokeFill(pZig, true);
                    pattern.appendChild(pZig);
                    break;
                case 'waves':
                    const pWave = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    pWave.setAttribute('d', `M 0 ${size / 2} Q ${size / 4} 0, ${size / 2} ${size / 2} T ${size} ${size / 2}`);
                    setStrokeFill(pWave, true);
                    pattern.appendChild(pWave);
                    break;
                case 'hexagons':
                    const pHex = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    const h = (Math.sqrt(3) / 2) * size;
                    pHex.setAttribute('d', `M ${size / 4} 0 L ${size * 3 / 4} 0 L ${size} ${h / 2} L ${size * 3 / 4} ${h} L ${size / 4} ${h} L 0 ${h / 2} Z`);
                    setStrokeFill(pHex, true);
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
                    setStrokeFill(pStar, true);
                    pattern.appendChild(pStar);
                    break;
                case 'squares':
                    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    rect.setAttribute('x', size / 4); rect.setAttribute('y', size / 4);
                    rect.setAttribute('width', size / 2); rect.setAttribute('height', size / 2);
                    setStrokeFill(rect, true);
                    pattern.appendChild(rect);
                    break;
                case 'text':
                    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    text.setAttribute('x', size / 2);
                    text.setAttribute('y', size / 2);
                    text.setAttribute('text-anchor', 'middle');
                    text.setAttribute('dominant-baseline', 'middle');
                    text.setAttribute('font-size', size / 2);
                    text.setAttribute('font-family', state.settings.fontFamily);
                    text.textContent = conf.hatchText || 'TEXT';
                    setStrokeFill(text, true);
                    pattern.appendChild(text);
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
        const { stroke, fill } = getEffectiveColors(conf);

        return {
            color: stroke,
            weight: conf.width * zoomScale,
            opacity: 1,
            fill: true,
            fillColor: conf.hatched ? `url(#hatch-diag-${key})` : fill,
            fillOpacity: (conf.fillEnabled || conf.hatched) ? 1 : 0
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
    if (!btn) return;
    const originalText = btn.innerHTML;

    try {
        if (!state.map) throw new Error("Map not initialized");
        btn.disabled = true;
        btn.innerText = "Generating JPG...";

        const scale = 4; // High definition capture
        const mapElement = document.getElementById('map-wrapper');

        // Capture using html2canvas
        const canvas = await html2canvas(mapElement, {
            useCORS: true,
            scale: scale,
            backgroundColor: state.settings.backgroundColor,
            logging: false,
            allowTaint: true,
            onclone: (clonedDoc) => {
                const clonedWrapper = clonedDoc.getElementById('map-wrapper');
                clonedWrapper.style.transform = 'none';
                clonedWrapper.style.margin = '0';

                // CRITICAL: Copy all global SVG patterns into the cloned map container
                // html2canvas needs the patterns to be within the captured context or accessible.
                const originalDefs = document.querySelector('defs');
                if (originalDefs) {
                    const clonedSvg = clonedWrapper.querySelector('svg');
                    if (clonedSvg) {
                        const newDefs = originalDefs.cloneNode(true);
                        clonedSvg.insertBefore(newDefs, clonedSvg.firstChild);
                    } else {
                        // If no SVG found yet (maybe Leaflet hasn't rendered it in clone?), 
                        // we can append it to the wrapper as a hidden SVG.
                        const hiddenSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                        hiddenSvg.style.display = 'none';
                        hiddenSvg.appendChild(originalDefs.cloneNode(true));
                        clonedWrapper.appendChild(hiddenSvg);
                    }
                }
            }
        });

        // Download as JPG
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        downloadFile(imgData, `map-export-${Date.now()}.jpg`, 'image/jpeg');

    } catch (e) {
        console.error("JPG Export failed:", e);
        alert("Export failed: " + e.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
} function applyGraphicTheme(themeId) {
    const themes = {
        industrial: {
            style: 'standard',
            bg: '#1a1a1a',
            layers: {
                buildings: { visible: true, stroke: '#f97316', width: 0.8, fill: '#334155', fillEnabled: true, hatched: true, hatchStyle: 'lines', hatchScale: 0.8, hatchRotation: 45, hatchColor: '#f97316', hatchWidth: 0.4 },
                water: { visible: true, stroke: '#0f172a', width: 1.5, fill: '#1e293b', fillEnabled: true, hatched: false },
                streets: { visible: true, stroke: '#64748b', width: 1.2, fill: '#ffffff', fillEnabled: false },
                parks: { visible: true, stroke: '#064e3b', width: 0, fill: '#064e3b', fillEnabled: true, hatched: true, hatchStyle: 'dots', hatchScale: 1.2, hatchColor: '#059669' },
                railways: { visible: true, stroke: '#fbbf24', width: 2, fill: 'none', fillEnabled: false },
                industrial: { visible: true, stroke: '#475569', width: 0.5, fill: '#334155', fillEnabled: true, hatched: true, hatchStyle: 'grid', hatchScale: 1.5, hatchColor: '#64748b' }
            }
        },
        blueprint: {
            style: 'blueprint',
            bg: '#001a4d',
            layers: {
                buildings: { visible: true, stroke: '#ffffff', width: 0.8, fill: 'none', fillEnabled: false, hatched: false },
                water: { visible: true, stroke: '#00ffff', width: 1, fill: '#003366', fillEnabled: true, hatched: true, hatchStyle: 'waves', hatchScale: 1, hatchRotation: 0, hatchColor: '#00ffff', hatchWidth: 0.3 },
                streets: { visible: true, stroke: '#ffffff', width: 1.5, fill: 'none', fillEnabled: false },
                parks: { visible: true, stroke: '#00ff00', width: 0.3, fill: 'none', fillEnabled: false, hatched: true, hatchStyle: 'grid', hatchScale: 0.5, hatchColor: '#00ff00' },
                railways: { visible: true, stroke: '#ffffff', width: 1, fill: 'none', fillEnabled: false },
                industrial: { visible: false }
            }
        },
        nature: {
            style: 'light',
            bg: '#fdf6e3',
            layers: {
                buildings: { visible: true, stroke: '#8b4513', width: 0.5, fill: '#eee8d5', fillEnabled: true, hatched: false },
                water: { visible: true, stroke: '#268bd2', width: 1.5, fill: '#b58900', fillEnabled: true, hatched: true, hatchStyle: 'waves', hatchScale: 1.5, hatchColor: '#268bd2' },
                streets: { visible: true, stroke: '#93a1a1', width: 0.8, fill: '#ffffff', fillEnabled: false },
                parks: { visible: true, stroke: '#859900', width: 0, fill: '#859900', fillEnabled: true, hatched: true, hatchStyle: 'text', hatchText: 'TREE', hatchScale: 1.2, hatchColor: '#22863a' },
                railways: { visible: true, stroke: '#586e75', width: 1.2, fill: 'none', fillEnabled: false },
                industrial: { visible: false }
            }
        },
        gold: {
            style: 'standard',
            bg: '#000000',
            layers: {
                buildings: { visible: true, stroke: '#d4af37', width: 1.2, fill: '#d4af37', fillEnabled: true, hatched: true, hatchStyle: 'lines', hatchScale: 0.5, hatchRotation: 0, hatchColor: '#000000', hatchWidth: 0.8 },
                water: { visible: true, stroke: '#111111', width: 2, fill: '#000000', fillEnabled: true, hatched: false },
                streets: { visible: true, stroke: '#d4af37', width: 0.5, fill: '#ffffff', fillEnabled: false },
                parks: { visible: true, stroke: '#d4af37', width: 0.3, fill: '#000000', fillEnabled: true, hatched: true, hatchStyle: 'squares', hatchScale: 0.8, hatchColor: '#d4af37' },
                railways: { visible: true, stroke: '#d4af37', width: 0.5, fill: '#000000', fillEnabled: false },
                industrial: { visible: false }
            }
        }
    };

    const t = themes[themeId];
    if (!t) return;

    // Apply Base Style
    syncMapStyleUI(t.style);
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
        layerList.classList.remove('disabled');

        if (state.map.getZoom() < 15) {
            state.map.flyTo(state.map.getCenter(), 15);
        } else {
            fetchAndRenderVectors();
        }
    }
}
