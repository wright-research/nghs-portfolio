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
                    console.table(map.getStyle().layers);
                    const streetsUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${mapboxgl.accessToken}`;
                    const response = await fetch(streetsUrl);
                    const streetsStyle = await response.json();

                    // Add all sources from the Streets style (if not already present)
                    for (const [name, source] of Object.entries(streetsStyle.sources)) {
                        if (!map.getSource(name)) {
                            map.addSource(name, source);
                        }
                    }

                    // Separate line layers (roads) and symbol layers (labels)
                    const roadLayers = streetsStyle.layers.filter(layer =>
                        layer.type === 'line' && layer.id.startsWith('road-')
                    );
                    const labelLayers = streetsStyle.layers.filter(layer =>
                        layer.type === 'symbol'
                    );

                    const addedRoadLayerIds = [];
                    const addedLabelLayerIds = [];

                    // Add road line layers first (so labels draw on top)
                    for (const layer of roadLayers) {
                        if (!map.getLayer(layer.id)) {
                            map.addLayer(layer);
                            addedRoadLayerIds.push(layer.id);
                        }
                    }

                    // Add label layers on top of roads
                    for (const layer of labelLayers) {
                        if (!map.getLayer(layer.id)) {
                            map.addLayer(layer);
                            addedLabelLayerIds.push(layer.id);
                        }
                    }

                    // Persist IDs for debugging or later restyling
                    map.__mapboxRoadLayerIds = addedRoadLayerIds;
                    map.__mapboxLabelLayerIds = addedLabelLayerIds;

                    // --- STYLE ROAD LAYERS FOR SATELLITE CONTEXT ---
                    for (const layerId of addedRoadLayerIds) {
                        const layer = map.getLayer(layerId);
                        if (layer && layer.type === 'line') {
                            // show all line layer.id values in the console
                            console.log('Line layer ID:', layer.id);
                            // Only keep major highways and interstates
                            if (
                                layer.id.includes('motorway') ||  
                                layer.id.includes('major') ||     
                                layer.id.includes('primary')
                            ) {
                                // Make these slightly brighter and semi-transparent
                                map.setPaintProperty(layerId, 'line-opacity', 0.5);
                                map.setPaintProperty(layerId, 'line-color', '#ffffff');
                                map.setLayoutProperty(layerId, 'visibility', 'visible');
                            } else {
                                // Hide local and residential roads to declutter the map
                                map.setLayoutProperty(layerId, 'visibility', 'none');
                            }
                        }
                    }

                    // --- HIDE UNWANTED LABEL LAYERS ---
                    const hiddenLabelIds = [
                        'airport-label',
                        'golf-hole-label',
                        'natural-line-label',
                        'natural-point-label',
                        'water-line-label',
                        'water-point-label',
                        'poi-label',
                        'transit-label',
                        'ferry-aerialway-label',
                        'road-intersection',
                        'building-number-label',
                        'building-entrance',
                        'block-number-label'
                    ];

                    for (const layerId of hiddenLabelIds) {
                        if (map.getLayer(layerId)) {
                          map.setLayoutProperty(layerId, 'visibility', 'none');
                        }
                      }                      


                    // --- ENHANCE LABEL READABILITY OVER SATELLITE IMAGERY ---
                    for (const layerId of addedLabelLayerIds) {
                        const layer = map.getLayer(layerId);
                        if (layer && layer.type === 'symbol') {
                            // Target only place-name layers (not roads, shields, or POIs)
                            if (layer.id.startsWith('settlement-')) {
                                map.setPaintProperty(layerId, 'text-halo-color', '#ffffff');
                                map.setPaintProperty(layerId, 'text-halo-width', 1.5);
                            }

                            // Road shields and route symbols
                            if (
                                layer.id.includes('road') ||
                                layer.id.includes('motorway') ||
                                layer.id.includes('trunk') ||
                                layer.id.includes('primary')
                            ) {
                                // Slight transparency for shields and text
                                map.setPaintProperty(layerId, 'icon-opacity', 0.9);
                                map.setPaintProperty(layerId, 'text-opacity', 0.9);
                            }
                        }
                    }                    

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


/**
 * Adds clustered portfolio layers (clustered and unclustered) using the NGHS logo.
 * - Source id defaults to 'portfolio' and enables clustering
 * - Cluster layers: background circle + symbol with logo and count
 * - Unclustered layers reuse ids 'portfolio-points[-background]' to keep popup code working
 * @param {mapboxgl.Map} map
 * @param {Object} geojsonData FeatureCollection of portfolio points
 * @param {string} sourceId
 */
export function addClusteredPortfolioLayers(map, geojsonData, sourceId = 'portfolio') {
    const logoPath = 'assets/nghs_logo.png';
    const iconName = 'nghs-logo-icon';

    const ensureIcon = (cb) => {
        if (map.hasImage(iconName)) {
            cb();
        } else {
            map.loadImage(logoPath, (error, image) => {
                if (error) {
                    console.error('Error loading logo image:', error);
                    return;
                }
                if (!map.hasImage(iconName)) {
                    try {
                        map.addImage(iconName, image);
                    } catch (e) {
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
        const existing = map.getSource(sourceId);
        if (existing) {
            existing.setData(geojsonData);
        } else {
            map.addSource(sourceId, {
                type: 'geojson',
                data: geojsonData,
                cluster: true,
                clusterMaxZoom: 14,
                clusterRadius: 50
            });
        }

        // Cluster background circle (dark gray) sized by point_count
        if (!map.getLayer('portfolio-clusters-background')) {
            map.addLayer({
                id: 'portfolio-clusters-background',
                type: 'circle',
                source: sourceId,
                filter: ['has', 'point_count'],
                paint: {
                    'circle-radius': [
                        'step', ['get', 'point_count'],
                        20, 10, 22,
                        50, 26,
                        100, 30,
                        250, 36
                    ],
                    'circle-color': '#343a40',
                    'circle-opacity': 0.95,
                    'circle-stroke-width': 2.5,
                    'circle-stroke-color': '#222222'
                }
            });
        }

        // Cluster symbol: bold white count text (no icon)
        if (!map.getLayer('portfolio-clusters')) {
            map.addLayer({
                id: 'portfolio-clusters',
                type: 'symbol',
                source: sourceId,
                filter: ['has', 'point_count'],
                layout: {
                    'text-field': ['get', 'point_count_abbreviated'],
                    'text-font': ['Arial Unicode MS Bold', 'DIN Offc Pro Medium'],
                    'text-size': [
                        'step', ['get', 'point_count'],
                        14, 50, 16,
                        100, 18,
                        250, 22
                    ],
                    'text-anchor': 'center',
                    'text-allow-overlap': true
                },
                paint: {
                    'text-color': '#ffffff',
                    'text-halo-color': '#343a40',
                    'text-halo-width': 0
                }
            });
        }

        // Unclustered background circle (keep id pattern for popup helper)
        if (!map.getLayer('portfolio-points-background')) {
            map.addLayer({
                id: 'portfolio-points-background',
                type: 'circle',
                source: sourceId,
                filter: ['!', ['has', 'point_count']],
                paint: {
                    'circle-radius': 23,
                    'circle-color': '#ffffff',
                    'circle-stroke-width': 2.5,
                    'circle-stroke-color': '#333333',
                    'circle-opacity': 0.8
                }
            });
        }

        // Unclustered symbol with NGHS logo (retain id 'portfolio-points')
        if (!map.getLayer('portfolio-points')) {
            map.addLayer({
                id: 'portfolio-points',
                type: 'symbol',
                source: sourceId,
                filter: ['!', ['has', 'point_count']],
                layout: {
                    'icon-image': iconName,
                    'icon-size': 0.1,
                    'icon-allow-overlap': true
                }
            });
        }

        // Cluster click to expand zoom
        const onClusterClick = (e) => {
            const features = map.queryRenderedFeatures(e.point, { layers: ['portfolio-clusters'] });
            const clusterId = features && features[0] && features[0].properties && features[0].properties.cluster_id;
            if (clusterId == null) return;
            const src = map.getSource(sourceId);
            if (!src) return;
            src.getClusterExpansionZoom(clusterId, (err, zoom) => {
                if (err) return;
                map.easeTo({ center: features[0].geometry.coordinates, zoom });
            });
        };
        // Attach once
        if (!map.__nghsClusterClickBound) {
            map.on('click', 'portfolio-clusters', onClusterClick);
            map.on('click', 'portfolio-clusters-background', onClusterClick);
            map.__nghsClusterClickBound = true;
        }

        // Pointer cursor on cluster layers
        if (!map.__nghsClusterCursorBound) {
            const setPointer = () => { map.getCanvas().style.cursor = 'pointer'; };
            const unsetPointer = () => { map.getCanvas().style.cursor = ''; };
            map.on('mouseenter', 'portfolio-clusters', setPointer);
            map.on('mouseleave', 'portfolio-clusters', unsetPointer);
            map.on('mouseenter', 'portfolio-clusters-background', setPointer);
            map.on('mouseleave', 'portfolio-clusters-background', unsetPointer);
            map.__nghsClusterCursorBound = true;
        }
    });
}

/**
 * Updates the clustered portfolio source data (to reflect filters).
 * @param {mapboxgl.Map} map
 * @param {Object} filteredGeojson FeatureCollection to set on the source
 * @param {string} sourceId
 */
export function updateClusteredPortfolioData(map, filteredGeojson, sourceId = 'portfolio') {
    const src = map.getSource(sourceId);
    if (src && filteredGeojson) {
        try {
            src.setData(filteredGeojson);
        } catch (e) {
            console.error('Failed to update clustered portfolio data:', e);
        }
    }
}

