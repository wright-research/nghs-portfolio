/**
 * Service Areas module
 * Handles loading and display of service area boundaries and labels
 */

import { loadGeoJSON } from './dataLoader.js';

// Color scheme for different service areas
export const SERVICE_AREA_COLORS = {
    'Habersham': '#6d98ad',      
    'Lumpkin': '#ecb451',         
    'Gainesville': '#949546',     
    'Braselton': '#ed7036',       
    'Barrow': '#1c484f'           
};

/**
 * Adds a white, semi-transparent mask beneath all service area layers
 * @param {mapboxgl.Map} map - Mapbox map instance
 * @param {Object} geojsonData - GeoJSON feature collection of mask polygons
 * @param {string} sourceId - ID for the data source
 * @param {string} layerId - ID for the layer
 */
export function addServiceAreaMaskLayer(map, geojsonData, sourceId = 'service-areas-mask', layerId = 'service-areas-mask') {
    // Add or update the data source
    const existingSource = map.getSource(sourceId);
    if (existingSource) {
        existingSource.setData(geojsonData);
    } else {
        map.addSource(sourceId, {
            type: 'geojson',
            data: geojsonData
        });
    }

    // Add a fill layer with white color
    if (!map.getLayer(layerId)) {
        map.addLayer({
            id: layerId,
            type: 'fill',
            source: sourceId,
            paint: {
                'fill-color': '#ffffff',
                'fill-opacity': 0.6
            }
        });
    }

    console.log(`Added service area mask layer: '${layerId}'`);
}

/**
 * Adds service area polygons to the map with colored boundaries
 * @param {mapboxgl.Map} map - Mapbox map instance
 * @param {Object} geojsonData - GeoJSON feature collection of service areas
 * @param {string} sourceId - ID for the data source
 * @param {string} layerId - ID for the layer
 */
export function addServiceAreaLayer(map, geojsonData, sourceId = 'service-areas', layerId = 'service-areas-fill') {
    // Add or update the data source
    const existingSource = map.getSource(sourceId);
    if (existingSource) {
        existingSource.setData(geojsonData);
    } else {
        map.addSource(sourceId, {
            type: 'geojson',
            data: geojsonData
        });
    }

    // Add a fill layer with transparent fill if not present
    if (!map.getLayer(layerId)) {
        map.addLayer({
            id: layerId,
            type: 'fill',
            source: sourceId,
            paint: {
                'fill-color': [
                    'match',
                    ['get', 'service_area'],
                    'Habersham', SERVICE_AREA_COLORS['Habersham'],
                    'Lumpkin', SERVICE_AREA_COLORS['Lumpkin'],
                    'Gainesville', SERVICE_AREA_COLORS['Gainesville'],
                    'Braselton', SERVICE_AREA_COLORS['Braselton'],
                    'Barrow', SERVICE_AREA_COLORS['Barrow'],
                    '#cccccc' // Default color
                ],
                'fill-opacity': 0.6
            }
        });
    }

    // Add a line layer for the boundaries if not present
    const outlineId = `${layerId}-outline`;
    if (!map.getLayer(outlineId)) {
        map.addLayer({
            id: outlineId,
            type: 'line',
            source: sourceId,
            paint: {
                'line-color': '#333333',
                'line-width': 1.5,
                'line-opacity': 0.8
            }
        });
    }

    console.log(`Added service area layers: '${layerId}' and '${layerId}-outline'`);
}

/**
 * Adds service area labels to the map
 * @param {mapboxgl.Map} map - Mapbox map instance
 * @param {Object} geojsonData - GeoJSON feature collection of label points
 * @param {string} sourceId - ID for the data source
 * @param {string} layerId - ID for the layer
 */
export function addServiceAreaLabels(map, geojsonData, sourceId = 'service-areas-labels', layerId = 'service-areas-labels') {
    // Add or update the data source
    const existingSource = map.getSource(sourceId);
    if (existingSource) {
        existingSource.setData(geojsonData);
    } else {
        map.addSource(sourceId, {
            type: 'geojson',
            data: geojsonData
        });
    }

    // Add a symbol layer for the labels if not present
    if (!map.getLayer(layerId)) {
        map.addLayer({
            id: layerId,
            type: 'symbol',
            source: sourceId,
            maxzoom: 12,
            layout: {
                'text-field': ['get', 'label'],
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                'text-size': 16,
                'text-transform': 'uppercase',
                'text-letter-spacing': 0.1,
                'text-offset': [0, 0],
                'text-anchor': 'center'
            },
            paint: {
                'text-color': '#333333',
                'text-halo-color': '#ffffff',
                'text-halo-width': 2,
                'text-halo-blur': 1
            }
        });
    }

    console.log(`Added service area labels layer: '${layerId}'`);
}

/**
 * Toggles the service area fill on or off.
 * On: semi-transparent colored fill with a thin dark outline.
 * Off: no fill, thick white outline only.
 * @param {mapboxgl.Map} map
 * @param {boolean} showFill
 */
export function setServiceAreaFill(map, showFill) {
    if (map.getLayer('service-areas-fill')) {
        map.setPaintProperty('service-areas-fill', 'fill-opacity', showFill ? 0.6 : 0);
    }
    if (map.getLayer('service-areas-fill-outline')) {
        map.setPaintProperty('service-areas-fill-outline', 'line-color', showFill ? '#333333' : '#ffffff');
        map.setPaintProperty('service-areas-fill-outline', 'line-width', showFill ? 1.5 : 2);
        map.setPaintProperty('service-areas-fill-outline', 'line-opacity', showFill ? 0.8 : 0.9);
        map.setPaintProperty('service-areas-fill-outline', 'line-dasharray', showFill ? null : [1, 2]);
    }
}

/**
 * Loads and adds all service area data to the map
 * @param {mapboxgl.Map} map - Mapbox map instance
 * @returns {Promise<void>}
 */
export async function initializeServiceAreas(map) {
    try {
        console.log('Loading service areas...');

        // Load service area polygons
        const serviceAreasData = await loadGeoJSON('data/service-areas.geojson');

        // Load service area labels
        const labelsData = await loadGeoJSON('data/service-areas-labels.geojson');

        // Add the polygon layer (below portfolio points)
        addServiceAreaLayer(map, serviceAreasData);

        // Add the labels layer (below portfolio points)
        addServiceAreaLabels(map, labelsData);

        // Mask layer disabled for evaluation
        // addServiceAreaMaskLayer(map, maskData);

        console.log('Service areas initialized successfully');

    } catch (error) {
        console.error('Error initializing service areas:', error);
        throw error;
    }
}

