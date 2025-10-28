/**
 * Data loading and management module
 */

/**
 * Fetches GeoJSON data from a given path
 * @param {string} path - Path to the GeoJSON file
 * @returns {Promise<Object>} GeoJSON feature collection
 */
export async function loadGeoJSON(path) {
    try {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to load data: ${response.statusText}`);
        }
        const data = await response.json();
        console.log(`Loaded ${data.features.length} features from ${path}`);
        return data;
    } catch (error) {
        console.error('Error loading GeoJSON:', error);
        throw error;
    }
}

/**
 * Converts a FeatureCollection to Points using properties.longitude/latitude.
 * Non-finite or missing coordinates are skipped.
 * @param {Object} featureCollection - GeoJSON FeatureCollection
 * @returns {Object} New FeatureCollection with Point geometries
 */
export function asPointsFromLonLat(featureCollection) {
    if (!featureCollection || !Array.isArray(featureCollection.features)) {
        return { type: 'FeatureCollection', features: [] };
    }

    const features = featureCollection.features
        .map((feature) => {
            const props = (feature && feature.properties) ? feature.properties : {};
            // Prefer corrected fields: lon/lat, fallback to legacy: longitude/latitude
            const lonRaw = (props && props.lon != null) ? props.lon : props.longitude;
            const latRaw = (props && props.lat != null) ? props.lat : props.latitude;
            const lon = (typeof lonRaw === 'number') ? lonRaw : Number(lonRaw);
            const lat = (typeof latRaw === 'number') ? latRaw : Number(latRaw);
            const hasValid = Number.isFinite(lon) && Number.isFinite(lat);
            if (!hasValid) return null;

            return {
                type: 'Feature',
                properties: { ...props },
                geometry: {
                    type: 'Point',
                    coordinates: [lon, lat]
                }
            };
        })
        .filter(Boolean);

    return { type: 'FeatureCollection', features };
}

/**
 * Fetches text content from a file
 * @param {string} path - Path to the text file
 * @returns {Promise<string>} Text content
 */
export async function loadTextFile(path) {
    try {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to load file: ${response.statusText}`);
        }
        const text = await response.text();
        return text.trim();
    } catch (error) {
        console.error('Error loading text file:', error);
        return '';
    }
}

