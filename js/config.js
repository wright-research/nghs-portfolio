/**
 * Configuration settings for the Mapbox GL JS mapping application
 */

export const mapConfig = {
    accessToken: 'pk.eyJ1Ijoid3dyaWdodDIxIiwiYSI6ImNtYTJ4NWtwdjAwb2oydnEzdjV0anRxeWIifQ.h63WS8JxUedXWYkcNCkSnQ', // Replace with your actual Mapbox token
    // style: 'mapbox://styles/mapbox/satellite-streets-v12', // Default and only basemap
    style: {
        version: 8,
        // Required for text rendering on symbol layers
        glyphs: 'https://api.mapbox.com/fonts/v1/mapbox/{fontstack}/{range}.pbf?access_token=pk.eyJ1Ijoid3dyaWdodDIxIiwiYSI6ImNtYTJ4NWtwdjAwb2oydnEzdjV0anRxeWIifQ.h63WS8JxUedXWYkcNCkSnQ',
        // Required for icons (e.g., highway shields) used by Mapbox Streets layers added at runtime
        sprite: 'https://api.mapbox.com/styles/v1/mapbox/streets-v12/sprite?access_token=pk.eyJ1Ijoid3dyaWdodDIxIiwiYSI6ImNtYTJ4NWtwdjAwb2oydnEzdjV0anRxeWIifQ.h63WS8JxUedXWYkcNCkSnQ',
        sources: {
            'esri-satellite': {
                type: 'raster',
                tiles: [
                    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                ],
                tileSize: 256,
                attribution: ''
            }      
        },
        layers: [
            {
                id: 'esri-satellite-layer',
                type: 'raster',
                source: 'esri-satellite',
                minzoom: 0,
                maxzoom: 22
            },
        ]
    },
    center: [-83.82, 34.30], // Centered on Gainesville, GA area
    zoom: 8,
    pitch: 0,
    bearing: 0
};

export const dataConfig = {
    portfolioDataPath: 'data/nghs_portfolio.geojson',
    lastUpdatedPath: 'data/last_updated.txt',
    parcelsDataPath: 'data/nghs_parcels.geojson'
};

