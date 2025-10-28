/**
 * Parcels layer module
 * Loads parcels polygons, filters by allowed parcel_ids from portfolio,
 * and adds fill + outline layers that are only visible at higher zoom levels.
 */

import { dataConfig } from './config.js';
import { loadGeoJSON } from './dataLoader.js';

const PARCELS_SOURCE_ID = 'parcels';
const PARCELS_FILL_LAYER_ID = 'parcels-fill';
const PARCELS_LINE_LAYER_ID = 'parcels-outline';

/**
 * Loads the parcels GeoJSON and filters features by a set of allowed parcel_ids.
 * @param {Set<string>|string[]} allowedParcelIds - Unique parcel_id values to include
 * @returns {Promise<Object>} Filtered GeoJSON FeatureCollection
 */
export async function loadFilteredParcels(allowedParcelIds) {
    const data = await loadGeoJSON(dataConfig.parcelsDataPath);

    const allowed = Array.isArray(allowedParcelIds)
        ? new Set(allowedParcelIds.filter(v => v != null).map(String))
        : (allowedParcelIds instanceof Set ? allowedParcelIds : new Set());

    if (!data || !Array.isArray(data.features) || allowed.size === 0) {
        return { type: 'FeatureCollection', features: [] };
    }

    const filtered = data.features.filter(f => {
        const pid = f && f.properties ? f.properties.parcel_id : undefined;
        return pid != null && allowed.has(String(pid));
    });

    // If data is not in WGS84, reproject coordinates from EPSG:26967 to EPSG:4326.
    // We detected EPSG:26967 in the source file's CRS metadata.
    const projectedCrs = data && data.crs && data.crs.properties && typeof data.crs.properties.name === 'string'
        ? data.crs.properties.name
        : '';

    const needsReproject = projectedCrs.includes('EPSG::26967');

    let features = filtered;
    if (needsReproject && typeof proj4 === 'function') {
        // Define EPSG:26967 if not already defined
        try {
            if (!proj4.defs['EPSG:26967']) {
                proj4.defs('EPSG:26967', '+proj=tmerc +lat_0=30 +lon_0=-84.5 +k=0.9999 +x_0=200000 +y_0=0 +datum=NAD83 +units=m +no_defs +type=crs');
            }
        } catch (e) {
            // swallow; if definition exists or fails, we'll attempt anyway
        }
        const forward = (xy) => {
            const p = proj4('EPSG:26967', 'EPSG:4326', { x: xy[0], y: xy[1] });
            return [p.x, p.y];
        };

        features = filtered.map(f => reprojectFeature(f, forward)).filter(Boolean);
    }

    return { type: 'FeatureCollection', features };
}

/**
 * Adds parcels layers (fill and outline) to the map with styling and zoom visibility.
 * @param {mapboxgl.Map} map - Mapbox instance
 * @param {Object} geojson - FeatureCollection of parcels to render
 * @param {number} minZoom - Minimum zoom at which parcels are visible (default 13)
 */
export function addParcelsLayers(map, geojson, minZoom = 13) {
    const existingSource = map.getSource(PARCELS_SOURCE_ID);
    if (existingSource) {
        existingSource.setData(geojson);
    } else {
        map.addSource(PARCELS_SOURCE_ID, {
            type: 'geojson',
            data: geojson
        });
    }

    if (!map.getLayer(PARCELS_FILL_LAYER_ID)) {
        map.addLayer({
            id: PARCELS_FILL_LAYER_ID,
            type: 'fill',
            source: PARCELS_SOURCE_ID,
            paint: {
                'fill-color': '#ffffff',
                'fill-opacity': 0.35
            },
            minzoom: minZoom
        });
    }

    if (!map.getLayer(PARCELS_LINE_LAYER_ID)) {
        map.addLayer({
            id: PARCELS_LINE_LAYER_ID,
            type: 'line',
            source: PARCELS_SOURCE_ID,
            paint: {
                'line-color': '#2b2b2b',
                'line-width': 1
            },
            minzoom: minZoom
        });
    }
}

/**
 * Updates visibility filters for parcels based on map state or selections.
 * Currently a no-op; reserved for future dynamic filtering.
 * @param {mapboxgl.Map} map
 */
export function updateParcelsFilters(map) {
    // Placeholder: no dynamic filters beyond zoom constraint for now
}

/**
 * Reprojects a GeoJSON Feature's coordinates using a transform function [x,y] -> [lon,lat].
 * Supports Polygon and MultiPolygon.
 * @param {Object} feature
 * @param {(xy:number[])=>number[]} transform
 * @returns {Object}
 */
function reprojectFeature(feature, transform) {
    if (!feature || !feature.geometry) return null;
    const geom = feature.geometry;
    if (geom.type === 'Polygon') {
        return {
            type: 'Feature',
            properties: { ...(feature.properties || {}) },
            geometry: {
                type: 'Polygon',
                coordinates: geom.coordinates.map(ring => ring.map(transform))
            }
        };
    } else if (geom.type === 'MultiPolygon') {
        return {
            type: 'Feature',
            properties: { ...(feature.properties || {}) },
            geometry: {
                type: 'MultiPolygon',
                coordinates: geom.coordinates.map(poly => poly.map(ring => ring.map(transform)))
            }
        };
    }
    // Unsupported geometry types are skipped for safety
    return null;
}


