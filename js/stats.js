/**
 * Stats panel module
 * Renders and updates a summary panel showing portfolio statistics
 */

import { SERVICE_AREA_COLORS } from './serviceAreas.js';

let panelEl = null;
let kpiEl = null;

/**
 * Creates the stats panel container in the DOM if it doesn't exist
 */
export function initStatsPanel() {
    if (panelEl) return panelEl;

    panelEl = document.createElement('div');
    panelEl.id = 'stats-panel';
    panelEl.className = 'stats-panel';
    panelEl.setAttribute('role', 'region');
    panelEl.setAttribute('aria-label', 'Portfolio Summary');

    panelEl.innerHTML = getEmptyPanelMarkup();

    // Append near the map so it overlays correctly
    const container = document.getElementById('map-container') || document.body;
    container.appendChild(panelEl);

    // Create KPI container for mobile view
    if (!kpiEl) {
        kpiEl = document.createElement('div');
        kpiEl.id = 'stats-kpi';
        kpiEl.className = 'stats-kpi-container';
        kpiEl.setAttribute('role', 'region');
        kpiEl.setAttribute('aria-label', 'Portfolio KPIs');

        kpiEl.innerHTML = (
            '<div class="kpi-card" id="kpi-card-properties">' +
                '<div class="kpi-title">Properties</div>' +
                '<div class="kpi-value" id="kpi-properties">—</div>' +
            '</div>' +
            '<div class="kpi-card" id="kpi-card-secondary">' +
                '<div class="kpi-title" id="kpi-secondary-title">Total SF</div>' +
                '<div class="kpi-value" id="kpi-secondary-value">—</div>' +
            '</div>'
        );

        container.appendChild(kpiEl);
    }
    return panelEl;
}

function getEmptyPanelMarkup() {
    return (
        '<div class="stats-panel-inner">' +
            '<table class="stats-table" aria-describedby="summary-description">' +
                '<thead>' +
                    '<tr>' +
                        '<th scope="col" colspan="2" class="stats-section-title" id="stats-main-title">All Properties</th>' +
                    '</tr>' +
                '</thead>' +
                '<tbody>' +
                    '<tr><td colspan="2" class="empty">No data</td></tr>' +
                '</tbody>' +
            '</table>' +
            '<hr id="divider-size-total" class="stats-divider" />' +
            '<table id="table-size-total" class="stats-table stats-size-table" aria-describedby="summary-description">' +
                '<thead>' +
                    '<tr>' +
                        '<th scope="col" colspan="2" class="stats-section-title">Total Building Size (SF)</th>' +
                    '</tr>' +
                '</thead>' +
                '<tbody class="stats-size-total-tbody">' +
                    '<tr><td colspan="2" class="empty">No data</td></tr>' +
                '</tbody>' +
            '</table>' +
            '<hr id="divider-size-avg" class="stats-divider" />' +
            '<table id="table-size-avg" class="stats-table stats-size-table" aria-describedby="summary-description">' +
                '<thead>' +
                    '<tr>' +
                        '<th scope="col" colspan="2" class="stats-section-title">Average Building Size (SF)</th>' +
                    '</tr>' +
                '</thead>' +
                '<tbody class="stats-size-avg-tbody">' +
                    '<tr><td colspan="2" class="empty">No data</td></tr>' +
                '</tbody>' +
            '</table>' +
            '<hr id="divider-acres" class="stats-divider" />' +
            '<table id="table-acres" class="stats-table stats-acres-table" aria-describedby="summary-description">' +
                '<thead>' +
                    '<tr>' +
                        '<th scope="col" colspan="2" class="stats-section-title">Land Size - Total Acres</th>' +
                    '</tr>' +
                '</thead>' +
                '<tbody class="stats-acres-tbody">' +
                    '<tr><td colspan="2" class="empty">No data</td></tr>' +
                '</tbody>' +
            '</table>' +
        '</div>'
    );
}

/**
 * Updates the stats panel based on current selections
 * @param {Object} portfolioData - GeoJSON FeatureCollection
 * @param {Object} selections - { selectedOwnership, selectedPropertyType, selectedServiceAreas, showLongstreet }
 */
export function updateStatsPanel(portfolioData, selections) {
    if (!panelEl) initStatsPanel();
    if (!portfolioData || !portfolioData.features) return;

    const { selectedOwnership, selectedPropertyType, selectedServiceAreas, showLongstreet = true } = selections || {};

    // Update main heading based on selected property type
    try {
        const titleEl = panelEl.querySelector('#stats-main-title');
        if (titleEl) {
            const isAll = !selectedPropertyType || selectedPropertyType === 'All';
            const heading = isAll ? 'All Properties' : `${selectedPropertyType} Properties`;
            titleEl.textContent = heading;
        }
    } catch (_) {
        // non-fatal
    }

    // Show/hide sections based on selected property type
    updateSectionVisibility(selectedPropertyType);

    const features = portfolioData.features.filter(f => filterFeature(f, selectedOwnership, selectedPropertyType, selectedServiceAreas, showLongstreet));

    // Build counts per selected service area (preserve selection order)
    const rows = (selectedServiceAreas || []).map(area => {
        const count = features.reduce((acc, f) => acc + (getServiceArea(f) === area ? 1 : 0), 0);
        return { area, count };
    });

    const showTotal = Array.isArray(selectedServiceAreas) && selectedServiceAreas.length > 1;
    renderRows(rows, showTotal);

    // Build size stats per selected service area
    const sizeRows = (selectedServiceAreas || []).map(area => {
        const areaFeatures = features.filter(f => getServiceArea(f) === area);
        const numericSfs = areaFeatures
            .map(f => f && f.properties ? f.properties.square_footage : null)
            .filter(v => typeof v === 'number' && isFinite(v));
        const totalSf = numericSfs.reduce((sum, v) => sum + v, 0);
        const avgSf = numericSfs.length > 0 ? (totalSf / numericSfs.length) : null;
        return { area, totalSf, avgSf, countWithSf: numericSfs.length };
    });
    renderSizeTotalRows(sizeRows, showTotal);
    renderSizeAvgRows(sizeRows);

    // Build land size (acres) per selected service area using grouping logic
    const acresRows = (selectedServiceAreas || []).map(area => {
        const areaFeatures = features.filter(f => getServiceArea(f) === area);
        // Sum of non-grouped properties (grouping is missing or 'None')
        const standaloneAcres = areaFeatures.reduce((sum, f) => {
            const p = f && f.properties ? f.properties : {};
            const grouping = p.grouping;
            const acres = p.land_size;
            const isStandalone = !grouping || grouping === 'None';
            if (isStandalone && typeof acres === 'number' && isFinite(acres)) {
                return sum + acres;
            }
            return sum;
        }, 0);

        // For grouped properties: take each group's acreage once (use max numeric for safety)
        const groupingToMaxAcres = new Map();
        areaFeatures.forEach(f => {
            const p = f && f.properties ? f.properties : {};
            const grouping = p.grouping;
            const acres = p.land_size;
            if (grouping && grouping !== 'None' && typeof acres === 'number' && isFinite(acres)) {
                const prev = groupingToMaxAcres.get(grouping);
                if (prev === undefined || acres > prev) {
                    groupingToMaxAcres.set(grouping, acres);
                }
            }
        });
        const groupedAcres = Array.from(groupingToMaxAcres.values()).reduce((a, b) => a + b, 0);

        const totalAcres = standaloneAcres + groupedAcres;
        return { area, totalAcres };
    });
    renderAcresRows(acresRows, showTotal);

    // --- KPI updates for mobile view ---
    try {
        // Total properties shown
        const totalProperties = Array.isArray(features) ? features.length : 0;
        const propertiesEl = document.getElementById('kpi-properties');
        if (propertiesEl) {
            propertiesEl.textContent = Number(totalProperties).toLocaleString();
        }

        // Secondary KPI: Total SF or Total Acreage (for Land)
        const secondaryTitleEl = document.getElementById('kpi-secondary-title');
        const secondaryValueEl = document.getElementById('kpi-secondary-value');
        if (secondaryTitleEl && secondaryValueEl) {
            if (selectedPropertyType === 'Land') {
                // Compute acreage without double counting grouped properties
                const standaloneAcres = features.reduce((sum, f) => {
                    const p = f && f.properties ? f.properties : {};
                    const grouping = p.grouping;
                    const acres = p.land_size;
                    const isStandalone = !grouping || grouping === 'None';
                    if (isStandalone && typeof acres === 'number' && isFinite(acres)) {
                        return sum + acres;
                    }
                    return sum;
                }, 0);

                const groupingToMaxAcres = new Map();
                features.forEach(f => {
                    const p = f && f.properties ? f.properties : {};
                    const grouping = p.grouping;
                    const acres = p.land_size;
                    if (grouping && grouping !== 'None' && typeof acres === 'number' && isFinite(acres)) {
                        const prev = groupingToMaxAcres.get(grouping);
                        if (prev === undefined || acres > prev) {
                            groupingToMaxAcres.set(grouping, acres);
                        }
                    }
                });
                const groupedAcres = Array.from(groupingToMaxAcres.values()).reduce((a, b) => a + b, 0);
                const totalAcres = standaloneAcres + groupedAcres;

                secondaryTitleEl.textContent = 'Total Acreage';
                secondaryValueEl.textContent = formatAcreage(totalAcres);
            } else {
                // Total square footage across all selected features
                const numericSfs = features
                    .map(f => f && f.properties ? f.properties.square_footage : null)
                    .filter(v => typeof v === 'number' && isFinite(v));
                const totalSf = numericSfs.reduce((sum, v) => sum + v, 0);
                secondaryTitleEl.textContent = 'Total SF';
                secondaryValueEl.textContent = formatNumber(totalSf);
            }
        }
    } catch (e) {
        // Non-fatal; KPI rendering should not break desktop stats
        console.warn('KPI update failed:', e);
    }
}

function updateSectionVisibility(selectedPropertyType) {
    const isLand = selectedPropertyType === 'Land';
    const isAll = selectedPropertyType === 'All' || !selectedPropertyType;
    const hideSize = isLand; // Hide size sections for Land
    const hideAcres = !isLand && !isAll; // Hide acres for anything except Land or All

    const sizeTotalTable = panelEl.querySelector('#table-size-total');
    const sizeTotalDivider = panelEl.querySelector('#divider-size-total');
    const sizeAvgTable = panelEl.querySelector('#table-size-avg');
    const sizeAvgDivider = panelEl.querySelector('#divider-size-avg');
    const acresTable = panelEl.querySelector('#table-acres');
    const acresDivider = panelEl.querySelector('#divider-acres');

    setDisplay(sizeTotalTable, !hideSize);
    setDisplay(sizeTotalDivider, !hideSize);
    setDisplay(sizeAvgTable, !hideSize);
    setDisplay(sizeAvgDivider, !hideSize);

    setDisplay(acresTable, !hideAcres);
    setDisplay(acresDivider, !hideAcres);
}

function setDisplay(element, show) {
    if (element) {
        element.style.display = show ? '' : 'none';
    }
}

function getServiceArea(feature) {
    return feature && feature.properties ? (feature.properties.service_area || feature.properties.label || '') : '';
}

function filterFeature(feature, selectedOwnership, selectedPropertyType, selectedServiceAreas, showLongstreet) {
    if (!feature || !feature.properties) return false;
    const p = feature.properties;

    // Ownership filter
    if (selectedOwnership && selectedOwnership !== 'all') {
        if (p.ownership_type !== selectedOwnership) return false;
    }

    // Property type filter
    if (selectedPropertyType && selectedPropertyType !== 'All') {
        if (selectedPropertyType === 'Medical Office') {
            // Prefix match
            const bt = String(p.building_type || '');
            if (!bt.startsWith('Medical Office')) return false;
        } else if (selectedPropertyType === 'Other') {
            const bt = String(p.building_type || '');
            const explicitCategories = new Set(['Hospital', 'Land', 'Office', 'Vacant Building']);
            const isExplicit = explicitCategories.has(bt);
            const isMedicalPrefix = bt.startsWith('Medical Office');
            if (isExplicit || isMedicalPrefix) return false;
        } else if (p.building_type !== selectedPropertyType) {
            return false;
        }
    }

    // Service area filter
    if (Array.isArray(selectedServiceAreas) && selectedServiceAreas.length > 0) {
        const area = getServiceArea(feature);
        if (!selectedServiceAreas.includes(area)) return false;
    }

    // Longstreet toggle filter: when disabled, exclude longstreet === 'Yes'
    if (showLongstreet === false) {
        if (p.longstreet === 'Yes') return false;
    }

    return true;
}

function renderRows(rows, showTotal) {
    const tbody = panelEl.querySelector('tbody');
    if (!tbody) return;
    if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="empty">No data</td></tr>';
        return;
    }

    let html = rows.map((r, idx) => {
        const color = SERVICE_AREA_COLORS[r.area] || '#343a40';
        const safeArea = escapeHtml(r.area);
        const valueText = r.count.toLocaleString();
        const isLastServiceArea = showTotal && idx === rows.length - 1;
        const valueHtml = isLastServiceArea ? `<span class="sum-underline">${valueText}</span>` : valueText;
        return (
            '<tr class="stats-row">' +
                `<td class="sa-name" style="color:${color}"><span class="dot" style="background-color:${color}"></span><span class="sa-name-text">${safeArea}</span></td>` +
                `<td class="num" style="color:${color}">${valueHtml}</td>` +
            '</tr>'
        );
    }).join('');

    if (showTotal) {
        const total = rows.reduce((sum, r) => sum + (Number.isFinite(r.count) ? r.count : 0), 0);
        html += (
            '<tr class="stats-row stats-total-row">' +
                '<td class="sa-name total-label">Total</td>' +
                `<td class="num total-num">${total.toLocaleString()}</td>` +
            '</tr>'
        );
    }
    tbody.innerHTML = html;
}

function renderSizeTotalRows(rows, showTotal) {
    const tbody = panelEl.querySelector('.stats-size-total-tbody');
    if (!tbody) return;
    if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="empty">No data</td></tr>';
        return;
    }
    let html = rows.map((r, idx) => {
        const color = SERVICE_AREA_COLORS[r.area] || '#343a40';
        const safeArea = escapeHtml(r.area);
        const totalText = Number.isFinite(r.totalSf) ? formatNumber(r.totalSf) : '—';
        const isLastServiceArea = showTotal && idx === rows.length - 1;
        const valueHtml = isLastServiceArea ? `<span class="sum-underline">${totalText}</span>` : totalText;
        return (
            '<tr class="stats-row">' +
                `<td class="sa-name" style="color:${color}"><span class="dot" style="background-color:${color}"></span><span class="sa-name-text">${safeArea}</span></td>` +
                `<td class="num" style="color:${color}">${valueHtml}</td>` +
            '</tr>'
        );
    }).join('');
    if (showTotal) {
        const grandTotal = rows.reduce((sum, r) => sum + (Number.isFinite(r.totalSf) ? r.totalSf : 0), 0);
        html += (
            '<tr class="stats-row stats-total-row">' +
                '<td class="sa-name total-label">Total</td>' +
                `<td class="num total-num">${formatNumber(grandTotal)}</td>` +
            '</tr>'
        );
    }
    tbody.innerHTML = html;
}

function renderSizeAvgRows(rows) {
    const tbody = panelEl.querySelector('.stats-size-avg-tbody');
    if (!tbody) return;
    if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="empty">No data</td></tr>';
        return;
    }
    const html = rows.map(r => {
        const color = SERVICE_AREA_COLORS[r.area] || '#343a40';
        const safeArea = escapeHtml(r.area);
        const avgText = Number.isFinite(r.avgSf) ? formatNumber(r.avgSf) : '—';
        return (
            '<tr class="stats-row">' +
                `<td class="sa-name" style="color:${color}"><span class="dot" style="background-color:${color}"></span><span class="sa-name-text">${safeArea}</span></td>` +
                `<td class="num" style="color:${color}">${avgText}</td>` +
            '</tr>'
        );
    }).join('');
    tbody.innerHTML = html;
}

function renderAcresRows(rows, showTotal) {
    const tbody = panelEl.querySelector('.stats-acres-tbody');
    if (!tbody) return;
    if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="empty">No data</td></tr>';
        return;
    }
    let html = rows.map((r, idx) => {
        const color = SERVICE_AREA_COLORS[r.area] || '#343a40';
        const safeArea = escapeHtml(r.area);
        const totalText = Number.isFinite(r.totalAcres) ? formatAcreage(r.totalAcres) : '—';
        const isLastServiceArea = showTotal && idx === rows.length - 1;
        const valueHtml = isLastServiceArea ? `<span class="sum-underline">${totalText}</span>` : totalText;
        return (
            '<tr class="stats-row">' +
                `<td class="sa-name" style="color:${color}"><span class="dot" style="background-color:${color}"></span><span class="sa-name-text">${safeArea}</span></td>` +
                `<td class="num" style="color:${color}">${valueHtml}</td>` +
            '</tr>'
        );
    }).join('');
    if (showTotal) {
        const grandTotal = rows.reduce((sum, r) => sum + (Number.isFinite(r.totalAcres) ? r.totalAcres : 0), 0);
        html += (
            '<tr class="stats-row stats-total-row">' +
                '<td class="sa-name total-label">Total</td>' +
                `<td class="num total-num">${formatAcreage(grandTotal)}</td>` +
            '</tr>'
        );
    }
    tbody.innerHTML = html;
}

function formatAcreage(value) {
    try {
        return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch (e) {
        return String(value);
    }
}

function formatNumber(value) {
    try {
        return Math.round(value).toLocaleString();
    } catch (e) {
        return String(value);
    }
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


