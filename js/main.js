/**
 * Main application controller
 * Coordinates the initialization and interaction of all modules
 */

import { initializeMap, addGeoJSONLayer, fitMapToBounds, enablePortfolioPopups, bringMapboxLabelsAboveServiceAreas } from './map.js';
import { loadGeoJSON, loadTextFile, asPointsFromLonLat } from './dataLoader.js';
import { dataConfig } from './config.js';
import { addServiceAreaLayer, addServiceAreaLabels, addServiceAreaMaskLayer } from './serviceAreas.js';
import { initStatsPanel, updateStatsPanel } from './stats.js';
import { loadFilteredParcels, addParcelsLayers } from './parcels.js';

// Store map instance and data globally for filter functions and basemap changes
let mapInstance = null;
let portfolioData = null;
let parcelsData = null;
let serviceAreasData = null;
let serviceAreasLabelsData = null;
let serviceAreasMaskData = null;
let selectedOwnership = 'all';
let selectedPropertyType = 'All';
const ALL_SERVICE_AREAS = ['Habersham', 'Lumpkin', 'Gainesville', 'Braselton', 'Barrow'];
let selectedServiceAreas = [...ALL_SERVICE_AREAS];
let showLongstreet = true; // default matches checked switch

/**
 * Initializes the application
 */
async function initApp() {
    try {
        console.log('Initializing NGHS Portfolio application...');

        // Initialize the map
        const map = await initializeMap('map-container');
        mapInstance = map; // Store for filter functions

        // Load service area data
        serviceAreasData = await loadGeoJSON('data/service-areas.geojson');
        serviceAreasLabelsData = await loadGeoJSON('data/service-areas-labels.geojson');
        serviceAreasMaskData = await loadGeoJSON('data/service-areas-mask.geojson');
        
        // Load the portfolio GeoJSON data and convert to Points from lon/lat
        const rawPortfolio = await loadGeoJSON(dataConfig.portfolioDataPath);
        portfolioData = asPointsFromLonLat(rawPortfolio);

        // Build allowed parcel_ids from portfolio
        const allowedParcelIds = getUniqueParcelIdsFromPortfolio(portfolioData);

        // Load and filter parcels by allowed parcel_ids
        parcelsData = await loadFilteredParcels(allowedParcelIds);

        // Add all layers to the map (service areas, parcels, portfolio)
        addAllLayers(map);

        // Default Mapbox basemap only; no Esri layer arrangement

        // Fit the map to show all portfolio locations
        fitMapToBounds(map, portfolioData);

        // Initialize the stats panel before filters apply
        initStatsPanel();
        // Initial stats render with current defaults
        updateStatsPanel(portfolioData, {
            selectedOwnership,
            selectedPropertyType,
            selectedServiceAreas,
            showLongstreet
        });

        // Load and display the last updated date
        const lastUpdated = await loadTextFile(dataConfig.lastUpdatedPath);
        const lastUpdatedElement = document.getElementById('last-updated');
        if (lastUpdatedElement && lastUpdated) {
            lastUpdatedElement.textContent = lastUpdated;
        }

        // Initialize drawer functionality
        initializeDrawer();

        // Initialize ownership filter
        initializeOwnershipFilter();

        // Initialize property type filter
        initializePropertyTypeFilter();

        // Initialize service area filter
        initializeServiceAreaFilter();

        // Initialize Longstreet toggle filter
        initializeLongstreetToggle();

        // Basemap selector removed; default basemap remains in config

        console.log('Application initialized successfully');

    } catch (error) {
        console.error('Failed to initialize application:', error);
        alert('Failed to load the map. Please check the console for details.');
    }
}

/**
 * Adds all layers to the map (service areas and portfolio points)
 * This function is called on initial load and after basemap changes
 * @param {mapboxgl.Map} map - Mapbox map instance
 */
function addAllLayers(map) {
    console.log('Adding all layers to map...');
    
    // Add service area layers first (so they appear below portfolio points)
    // Add mask first to ensure it sits beneath other service area layers
    if (serviceAreasMaskData) {
        addServiceAreaMaskLayer(map, serviceAreasMaskData, 'service-areas-mask', 'service-areas-mask');
    }
    if (serviceAreasData) {
        addServiceAreaLayer(map, serviceAreasData, 'service-areas', 'service-areas-fill');
    }
    
    if (serviceAreasLabelsData) {
        addServiceAreaLabels(map, serviceAreasLabelsData, 'service-areas-labels', 'service-areas-labels');
    }
    
    // Add parcels polygons below portfolio points but above service areas
    if (parcelsData) {
        addParcelsLayers(map, parcelsData, 13);
    }

    // Add portfolio points on top
    if (portfolioData) {
        addGeoJSONLayer(map, portfolioData, 'portfolio', 'portfolio-points');
        // Enable popups for portfolio points
        enablePortfolioPopups(map, 'portfolio-points');
    }
    
    // Ensure Mapbox label layers render above service area and mask polygons
    bringMapboxLabelsAboveServiceAreas(map);

    console.log('All layers added successfully');
}

/**
 * Extracts unique parcel_id values from portfolio feature properties
 * @param {Object} portfolio - GeoJSON FeatureCollection of portfolio points
 * @returns {string[]} unique parcel_id values
 */
function getUniqueParcelIdsFromPortfolio(portfolio) {
    if (!portfolio || !Array.isArray(portfolio.features)) return [];
    const ids = new Set();
    portfolio.features.forEach(f => {
        const p = f && f.properties ? f.properties : {};
        const pid = p && p.parcel_id != null ? String(p.parcel_id) : null;
        if (pid) ids.add(pid);
    });
    return Array.from(ids);
}

/**
 * Builds the combined Mapbox GL filter expression for portfolio layers
 * based on current ownership and property type selections
 */
function buildPortfolioFilterExpression() {
    // Ownership condition
    let ownershipCondition = null;
    if (selectedOwnership && selectedOwnership !== 'all') {
        ownershipCondition = ['==', ['get', 'ownership_type'], selectedOwnership];
    }

    // Property type condition
    let propertyCondition = null;
    if (selectedPropertyType && selectedPropertyType !== 'All') {
        if (selectedPropertyType === 'Medical Office') {
            // Prefix match: any building_type that starts with "Medical Office"
            propertyCondition = ['match', ['slice', ['get', 'building_type'], 0, 13], ['Medical Office'], true, false];
        } else if (selectedPropertyType === 'Other') {
            // Everything else: not one of listed explicit categories and not starting with Medical Office
            const explicitCategories = ['Hospital', 'Land', 'Office', 'Vacant Building'];
            const notExplicit = ['!', ['in', ['get', 'building_type'], ['literal', explicitCategories]]];
            const notMedicalPrefix = ['!=', ['slice', ['get', 'building_type'], 0, 13], 'Medical Office'];
            propertyCondition = ['all', notExplicit, notMedicalPrefix];
        } else {
            propertyCondition = ['==', ['get', 'building_type'], selectedPropertyType];
        }
    }

    // Service area condition (for portfolio points)
    let serviceAreaCondition = null;
    if (selectedServiceAreas && selectedServiceAreas.length > 0 && selectedServiceAreas.length < ALL_SERVICE_AREAS.length) {
        serviceAreaCondition = ['in', ['get', 'service_area'], ['literal', selectedServiceAreas]];
    }

    // Longstreet condition: when toggle is OFF, exclude longstreet === 'Yes'
    let longstreetCondition = null;
    if (showLongstreet === false) {
        longstreetCondition = ['!=', ['get', 'longstreet'], 'Yes'];
    }

    // Combine conditions
    const conditions = [ownershipCondition, propertyCondition, serviceAreaCondition, longstreetCondition].filter(Boolean);
    if (conditions.length > 1) {
        return ['all', ...conditions];
    }
    return conditions[0] || null;
}

/**
 * Applies the combined filters to portfolio layers (points and background)
 * @param {mapboxgl.Map} map
 */
function applyCombinedFilters(map) {
    const layerId = 'portfolio-points';
    const backgroundLayerId = `${layerId}-background`;
    const combinedFilter = buildPortfolioFilterExpression();

    if (map.getLayer(layerId)) {
        map.setFilter(layerId, combinedFilter);
    }
    if (map.getLayer(backgroundLayerId)) {
        map.setFilter(backgroundLayerId, combinedFilter);
    }

    // Apply service area filters to polygon and label layers
    const polygonsLayerId = 'service-areas-fill';
    const polygonsOutlineId = 'service-areas-fill-outline';
    const labelsLayerId = 'service-areas-labels';

    // Build expressions: show all when all are selected
    const polygonsFilter = (selectedServiceAreas.length === ALL_SERVICE_AREAS.length)
        ? null
        : ['in', ['get', 'service_area'], ['literal', selectedServiceAreas]];

    const labelsFilter = (selectedServiceAreas.length === ALL_SERVICE_AREAS.length)
        ? null
        : ['in', ['get', 'label'], ['literal', selectedServiceAreas]];

    if (map.getLayer(polygonsLayerId)) {
        map.setFilter(polygonsLayerId, polygonsFilter);
    }
    if (map.getLayer(polygonsOutlineId)) {
        map.setFilter(polygonsOutlineId, polygonsFilter);
    }
    if (map.getLayer(labelsLayerId)) {
        map.setFilter(labelsLayerId, labelsFilter);
    }

    // Update stats based on current selections
    if (portfolioData) {
        updateStatsPanel(portfolioData, {
            selectedOwnership,
            selectedPropertyType,
            selectedServiceAreas,
            showLongstreet
        });
    }
}

/**
 * Initializes the ownership type filter
 */
function initializeOwnershipFilter() {
    const ownershipFilter = document.getElementById('ownership-filter');
    
    if (ownershipFilter && mapInstance) {
        // Listen for multiple event types to ensure compatibility with Web Awesome components
        const eventTypes = ['wa-change', 'change', 'wa-select', 'input', 'sl-change'];
        
        eventTypes.forEach(eventType => {
            ownershipFilter.addEventListener(eventType, (event) => {
                selectedOwnership = event.target.value;
                applyCombinedFilters(mapInstance);
            });
        });
        
        console.log('Ownership filter initialized');
    }
}

/**
 * Initializes the property type filter
 */
function initializePropertyTypeFilter() {
    const propertyTypeFilter = document.getElementById('property-type-filter');

    if (propertyTypeFilter && mapInstance) {
        const eventTypes = ['wa-change', 'change', 'wa-select', 'input', 'sl-change'];

        eventTypes.forEach(eventType => {
            propertyTypeFilter.addEventListener(eventType, (event) => {
                selectedPropertyType = event.target.value;
                applyCombinedFilters(mapInstance);
            });
        });

        console.log('Property type filter initialized');
    }
}

// Basemap selector removed

/**
 * Initializes the service area multi-select filter
 */
function initializeServiceAreaFilter() {
    const serviceAreaFilter = document.getElementById('service-area-filter');

    if (serviceAreaFilter && mapInstance) {
        // Default select all options
        const options = Array.from(serviceAreaFilter.querySelectorAll('wa-option'));
        options.forEach(opt => { opt.selected = true; });
        selectedServiceAreas = options.map(opt => opt.value).filter(Boolean);
        // Apply initial filters
        applyCombinedFilters(mapInstance);

        const eventTypes = ['wa-change', 'change', 'wa-select', 'input', 'sl-change'];
        eventTypes.forEach(eventType => {
            serviceAreaFilter.addEventListener(eventType, () => {
                const currentOptions = Array.from(serviceAreaFilter.querySelectorAll('wa-option'));
                const currentSelected = currentOptions.filter(o => o.selected).map(o => o.value).filter(Boolean);
                // Fallback: if component exposes value as array
                if ((!currentSelected || currentSelected.length === 0) && Array.isArray(serviceAreaFilter.value)) {
                    selectedServiceAreas = serviceAreaFilter.value;
                } else {
                    selectedServiceAreas = currentSelected;
                }
                // Guard: if none selected, treat as all (show everything)
                if (!selectedServiceAreas || selectedServiceAreas.length === 0) {
                    selectedServiceAreas = [...ALL_SERVICE_AREAS];
                }
                applyCombinedFilters(mapInstance);
            });
        });

        console.log('Service area filter initialized');
    }
}

/**
 * Initializes the Longstreet toggle filter
 */
function initializeLongstreetToggle() {
    const longstreetToggle = document.getElementById('longstreet-toggle');
    if (longstreetToggle && mapInstance) {
        // Initialize state from control
        // Web Awesome switch exposes `checked`; default is checked per markup
        showLongstreet = Boolean(longstreetToggle.checked);

        const eventTypes = ['wa-change', 'change', 'input', 'sl-change'];
        eventTypes.forEach(eventType => {
            longstreetToggle.addEventListener(eventType, (event) => {
                // Some events may not carry target.checked reliably; read directly
                showLongstreet = Boolean(longstreetToggle.checked);
                applyCombinedFilters(mapInstance);
            });
        });

        console.log('Longstreet toggle initialized');
    }
}

/**
 * Initializes drawer open/close functionality
 */
function initializeDrawer() {
    const drawer = document.querySelector('wa-drawer');
    const openButton = document.querySelector('.openDrawerBtn');
    const closeButton = document.querySelector('.close-button');

    // Function to toggle button visibility based on drawer state
    function updateButtonVisibility() {
        if (drawer.open) {
            openButton.style.display = 'none';
        } else {
            openButton.style.display = 'block';
        }
    }

    if (openButton && drawer) {
        // Set initial visibility
        updateButtonVisibility();

        // Open drawer and update button visibility
        openButton.addEventListener('click', () => {
            drawer.open = true;
            updateButtonVisibility();
        });
    }

    if (closeButton && drawer) {
        closeButton.addEventListener('click', () => {
            drawer.open = false;
            updateButtonVisibility();
        });
    }

    // Listen for drawer state changes (in case it's controlled elsewhere)
    if (drawer) {
        drawer.addEventListener('wa-after-show', updateButtonVisibility);
        drawer.addEventListener('wa-after-hide', updateButtonVisibility);
    }

    console.log('Drawer functionality initialized');
}

// Start the application when the DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

