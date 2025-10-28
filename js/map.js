/**
 * Map initialization and management module
 */

import { mapConfig } from './config.js';

/**
 * Initializes the Mapbox map
 * @param {string} containerId - ID of the container element
 * @returns {Promise<mapboxgl.Map>} Initialized map instance
 */
export async function initializeMap(containerId) {
    return new Promise((resolve, reject) => {
        try {
            // Set the Mapbox access token
            mapboxgl.accessToken = mapConfig.accessToken;

            // Create the map
            const map = new mapboxgl.Map({
                container: containerId,
                style: mapConfig.style,
                center: mapConfig.center,
                zoom: mapConfig.zoom,
                pitch: mapConfig.pitch,
                bearing: mapConfig.bearing
            });

            // Wait for map to load before resolving
            map.on('load', async () => {
                console.log('Map loaded successfully');

                // Add scale control
                const scale = new mapboxgl.ScaleControl({
                    maxWidth: 175,
                    unit: "imperial",
                });
                map.addControl(scale, "bottom-right");

                // --- ADD MAPBOX LABELS ON TOP ---
                try {
                    console.log('Loading Mapbox Streets labels...');
                    const streetsUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${mapboxgl.accessToken}`;
                    const response = await fetch(streetsUrl);
                    const streetsStyle = await response.json();

                    // Add all sources from the Streets style (if not already present)
                    for (const [name, source] of Object.entries(streetsStyle.sources)) {
                        if (!map.getSource(name)) {
                            map.addSource(name, source);
                        }
                    }

                    // Filter only label/icon layers
                    const labelLayers = streetsStyle.layers.filter(layer => layer.type === 'symbol');
                    const addedLabelLayerIds = [];

                    // Add label layers to the map (above imagery)
                    for (const layer of labelLayers) {
                        if (!map.getLayer(layer.id)) {
                            map.addLayer(layer);
                            addedLabelLayerIds.push(layer.id);
                        }
                    }

                    // Persist the list of Mapbox label layer ids on the map instance for later reordering
                    map.__mapboxLabelLayerIds = addedLabelLayerIds;

                    console.log('Mapbox label layers added successfully');
                } catch (err) {
                    console.error('Error loading Mapbox labels:', err);
                }
                

                resolve(map);
            });

            // Handle errors
            map.on('error', (e) => {
                console.error('Map error:', e);
                reject(e);
            });

        } catch (error) {
            console.error('Error initializing map:', error);
            reject(error);
        }
    });
}

/**
 * Adds GeoJSON data as a source and layer to the map
 * @param {mapboxgl.Map} map - Mapbox map instance
 * @param {Object} geojsonData - GeoJSON feature collection
 * @param {string} sourceId - ID for the data source
 * @param {string} layerId - ID for the layer
 */
export function addGeoJSONLayer(map, geojsonData, sourceId = 'portfolio', layerId = 'portfolio-points') {
    // Load the custom marker image
    const logoPath = 'assets/nghs_logo.png';
    const iconName = 'nghs-logo-icon';
    const backgroundLayerId = `${layerId}-background`;
    
    // Ensure the image is available
    const ensureIcon = (cb) => {
        if (map.hasImage(iconName)) {
            cb();
        } else {
            map.loadImage(logoPath, (error, image) => {
                if (error) {
                    console.error('Error loading logo image:', error);
                    return;
                }
                // Double-check in case another call added it while loading
                if (!map.hasImage(iconName)) {
                    try {
                        map.addImage(iconName, image);
                    } catch (e) {
                        // Swallow duplicate image add errors due to race conditions
                        if (!(e && e.message && e.message.includes('already exists'))) {
                            console.error('Unexpected error adding image:', e);
                        }
                    }
                }
                cb();
            });
        }
    };

    ensureIcon(() => {
        // Add or update source
        const existingSource = map.getSource(sourceId);
        if (existingSource) {
            existingSource.setData(geojsonData);
        } else {
            map.addSource(sourceId, {
                type: 'geojson',
                data: geojsonData
            });
        }

        // Add background layer if missing
        if (!map.getLayer(backgroundLayerId)) {
            map.addLayer({
                id: backgroundLayerId,
                type: 'circle',
                source: sourceId,
                paint: {
                    'circle-radius': 23,
                    'circle-color': '#ffffff',
                    'circle-stroke-width': 2.5,
                    'circle-stroke-color': '#333333',
                    'circle-opacity': 0.8
                }
            });
        }

        // Add symbol layer if missing
        if (!map.getLayer(layerId)) {
            map.addLayer({
                id: layerId,
                type: 'symbol',
                source: sourceId,
                layout: {
                    'icon-image': iconName,
                    'icon-size': 0.1,
                    'icon-allow-overlap': true
                }
            });
        }

        console.log(`Added layer '${layerId}' with source '${sourceId}' using custom icon with background`);
    });
}

/**
 * Enables popups on portfolio point layers showing name and building type
 * @param {mapboxgl.Map} map - Mapbox map instance
 * @param {string} layerId - ID of the symbol layer
 */
export function enablePortfolioPopups(map, layerId = 'portfolio-points') {
    const backgroundLayerId = `${layerId}-background`;
    let activePopup = null;

    function escapeHtml(value) {
        if (value == null) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function showPopup(e) {
        const feature = e.features && e.features[0];
        if (!feature) return;
        const coordinates = (feature.geometry && feature.geometry.type === 'Point')
            ? feature.geometry.coordinates.slice()
            : [e.lngLat.lng, e.lngLat.lat];
        const props = feature.properties || {};
        const name = escapeHtml(props.name || 'Unknown');
        const buildingType = escapeHtml(props.building_type || '');

        const html = `\n            <div class="popup-content">\n                <div class="popup-title">${name}</div>\n                <div class="popup-subtitle">${buildingType}</div>\n            </div>\n        `;

        // Ensure only one popup is open at a time to avoid overlap/race issues
        if (activePopup) {
            try { activePopup.remove(); } catch (_) {}
            activePopup = null;
        }

        activePopup = new mapboxgl.Popup({
            closeOnClick: true,
            closeButton: true,
            className: 'custom-popup',
            anchor: 'bottom',
            offset: 25
        })
            .setLngLat(coordinates)
            .setHTML(html)
            .addTo(map);

        activePopup.on('close', () => { activePopup = null; });
    }

    // Attach handlers unconditionally; Mapbox GL allows registering for layers
    // before they exist. This avoids race conditions with async image loading.
    map.on('click', layerId, showPopup);
    map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });

    map.on('click', backgroundLayerId, showPopup);
    map.on('mouseenter', backgroundLayerId, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', backgroundLayerId, () => { map.getCanvas().style.cursor = ''; });
}

/**
 * Fits the map to show all features in the given bounds
 * @param {mapboxgl.Map} map - Mapbox map instance
 * @param {Object} geojsonData - GeoJSON feature collection
 */
export function fitMapToBounds(map, geojsonData) {
    if (!geojsonData || !geojsonData.features || geojsonData.features.length === 0) {
        return;
    }

    const bounds = new mapboxgl.LngLatBounds();

    let added = false;
    geojsonData.features.forEach(feature => {
        if (feature && feature.geometry && feature.geometry.type === 'Point') {
            const coords = feature.geometry.coordinates;
            if (Array.isArray(coords) && coords.length >= 2 &&
                Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
                bounds.extend(coords);
                added = true;
            }
        }
    });

    if (!added) return; // Avoid calling fitBounds with empty bounds

    map.fitBounds(bounds, {
        padding: 50,
        maxZoom: 12
    });
}

/**
 * Updates the filter on map layers based on ownership type
 * @param {mapboxgl.Map} map - Mapbox map instance
 * @param {string} ownershipType - 'all', 'Owned', or 'Leased'
 * @param {string} layerId - ID of the main layer to filter
 */
export function updateOwnershipFilter(map, ownershipType, layerId = 'portfolio-points') {
    const backgroundLayerId = `${layerId}-background`;
    
    // Create the filter based on ownership type
    let filter;
    if (ownershipType === 'all') {
        filter = null; // Show all features
    } else {
        // Filter to show only properties matching the ownership type
        filter = ['==', ['get', 'ownership_type'], ownershipType];
    }
    
    // Apply the filter to both the main layer and background layer
    if (map.getLayer(layerId)) {
        map.setFilter(layerId, filter);
    }
    if (map.getLayer(backgroundLayerId)) {
        map.setFilter(backgroundLayerId, filter);
    }
}

/**
 * Changes the map's basemap style
 * @param {mapboxgl.Map} map - Mapbox map instance
 * @param {string} styleUrl - The Mapbox style URL to apply
 */
export function changeBasemap(map, styleUrl) {
    if (map && styleUrl) {
        map.setStyle(styleUrl);
    }
}

// Esri basemap utilities were removed per request; default Mapbox basemap remains


/**
 * Repositions previously added Mapbox label layers so they render above
 * polygon layers (mask and service areas) but below portfolio point layers.
 * @param {mapboxgl.Map} map - Mapbox map instance
 */
export function bringMapboxLabelsAboveServiceAreas(map) {
    if (!map) return;
    const labelIds = Array.isArray(map.__mapboxLabelLayerIds) ? map.__mapboxLabelLayerIds : [];
    if (labelIds.length === 0) return;

    // Prefer to place labels just beneath portfolio points background so
    // points (and their backgrounds) remain visually on top of labels
    const beforeLayerId = map.getLayer('portfolio-points-background')
        ? 'portfolio-points-background'
        : (map.getLayer('portfolio-points') ? 'portfolio-points' : null);

    for (const id of labelIds) {
        if (!map.getLayer(id)) continue;
        try {
            if (beforeLayerId) {
                map.moveLayer(id, beforeLayerId);
            } else {
                // Fallback: move to top if portfolio layers are not present yet
                map.moveLayer(id);
            }
        } catch (e) {
            // Non-fatal if a specific layer cannot be moved
            console.warn(`Could not reposition label layer '${id}':`, e);
        }
    }
}

