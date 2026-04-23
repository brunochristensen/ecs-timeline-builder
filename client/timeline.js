/**
 * ECS Timeline Builder - D3.js Timeline Visualization
 * Renders swim lane timeline with cross-host connection lines
 */

import {escapeHtml} from './utils.js';

// Configuration
const config = {
    margin: {top: 110, right: 70, bottom: 40, left: 220},
    laneHeight: 60,
    eventRadius: 5,
    minWidth: 800,
    transitionDuration: 300
};

/**
 * Calculate top margin based on the floating input box position so that swim lanes
 * start below any overlapping chrome.
 *
 * @returns {number} Top margin in pixels (falls back to 110 when the input box is absent)
 */
function calculateTopMargin() {
    const inputBox = document.querySelector('.floating-input');
    if (inputBox) {
        const rect = inputBox.getBoundingClientRect();
        // Add 30px padding below the input box
        return rect.bottom + 30;
    }
    return 110; // fallback
}

// State
let svg, container, mainGroup;
let xAxis, zoom;
let currentData = null;
let onEventClick = null;

/**
 * Initializes the D3.js timeline visualization SVG container.
 * Sets up the base SVG, zoom behavior, and event handlers.
 *
 * @param {string} containerId - CSS selector for the container element (e.g., '#timeline-container')
 * @param {Function} eventClickHandler - Callback invoked when user clicks an event dot, receives event object
 */
export function initTimelineVisualization(containerId, eventClickHandler) {
    container = d3.select(containerId);
    svg = container.select('svg');
    onEventClick = eventClickHandler;

    // Create main group for transforms
    mainGroup = svg.append('g')
        .attr('class', 'main-group');

    // Create layer groups in order
    mainGroup.append('g').attr('class', 'lanes-group');
    mainGroup.append('g').attr('class', 'grid-group');
    mainGroup.append('g').attr('class', 'connections-group');
    mainGroup.append('g').attr('class', 'events-group');
    mainGroup.append('g').attr('class', 'axis-group');

    // Create tooltip
    d3.select('body').append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0);

    // Initialize zoom behavior
    // Scale extent: 0.0001 allows viewing ~11 years when base is 1 minute
    // Scale extent: 100 allows viewing sub-second detail
    zoom = d3.zoom()
        .scaleExtent([0.0001, 100])
        .on('zoom', handleZoom);

    svg.call(zoom);

    // Handle window resize
    window.addEventListener('resize', debounce(handleResize, 250));
}

/**
 * Renders the complete timeline visualization with swim lanes and connection arcs.
 * Clears existing content and redraws based on current events and filters.
 *
 * @param {Array} events - Array of parsed event objects to display
 * @param {Object} hostRegistry - Host registry mapping hosts to their events
 * @param {Array} connections - Array of cross-host connection objects
 * @param {Map} annotations - Map of eventId to annotation for styling annotated events
 */
export function renderTimelineVisualization(events, hostRegistry, connections, annotations) {
    currentData = {events, hostRegistry, connections, annotations};
    const hosts = hostRegistry.getHostList();

    // Update top margin based on input box position
    config.margin.top = calculateTopMargin();

    const containerRect = container.node().getBoundingClientRect();
    const width = Math.max(containerRect.width, config.minWidth);
    const contentHeight = hosts.length * config.laneHeight + config.margin.top + config.margin.bottom;
    const height = Math.max(contentHeight, containerRect.height);

    // Update SVG size
    svg.attr('width', width)
        .attr('height', height);

    // Calculate time domain
    const timeExtent = d3.extent(events, d => d.timestamp);
    if (!timeExtent[0] || !timeExtent[1]) {
        console.warn('No valid timestamps in events');
        return;
    }

    // Add padding to time range
    const timePadding = (timeExtent[1] - timeExtent[0]) * 0.05 || 60000;
    const timeMin = new Date(timeExtent[0].getTime() - timePadding);
    const timeMax = new Date(timeExtent[1].getTime() + timePadding);

    // Create scales
    const xScale = d3.scaleTime()
        .domain([timeMin, timeMax])
        .range([config.margin.left, width - config.margin.right]);

    const yScale = d3.scaleBand()
        .domain(hosts.map(h => h.hostname))
        .range([config.margin.top, height - config.margin.bottom])
        .padding(0.1);

    // Store scales for zoom
    currentData.xScale = xScale;
    currentData.yScale = yScale;
    currentData.width = width;
    currentData.height = height;

    // Render components
    renderLanes(hosts, yScale, width);
    renderAxis(xScale, height);
    renderGrid(xScale, yScale, width, height);
    renderConnections(connections, xScale, yScale, hostRegistry);
    renderEvents(events, xScale, yScale, hostRegistry, annotations);
}

/**
 * Render swim lanes with background, midline, label, and IP for each host.
 *
 * @param {Array<{hostname: string, ips: string[]}>} hosts - Host list from the registry
 * @param {Function} yScale - D3 band scale mapping hostname to y position
 * @param {number} width - Total SVG width in pixels
 */
function renderLanes(hosts, yScale, width) {
    const lanesGroup = mainGroup.select('.lanes-group');
    const lanes = lanesGroup.selectAll('.swim-lane')
        .data(hosts, d => d.hostname);

    // Enter
    const lanesEnter = lanes.enter()
        .append('g')
        .attr('class', 'swim-lane');

    lanesEnter.append('rect')
        .attr('class', 'lane-bg');

    lanesEnter.append('line')
        .attr('class', 'swim-lane-midline');

    lanesEnter.append('text')
        .attr('class', 'swim-lane-label');

    lanesEnter.append('text')
        .attr('class', 'swim-lane-ip');

    // Update
    const lanesUpdate = lanesEnter.merge(lanes);

    lanesUpdate.select('.lane-bg')
        .attr('x', 0)
        .attr('y', d => yScale(d.hostname))
        .attr('width', width)
        .attr('height', yScale.bandwidth())
        .attr('fill', (d, i) => i % 2 === 0 ? 'rgba(255,255,255,0.008)' : 'transparent');

    lanesUpdate.select('.swim-lane-midline')
        .attr('x1', config.margin.left)
        .attr('x2', width - config.margin.right)
        .attr('y1', d => yScale(d.hostname) + yScale.bandwidth() / 2)
        .attr('y2', d => yScale(d.hostname) + yScale.bandwidth() / 2);

    lanesUpdate.select('.swim-lane-label')
        .attr('x', 20)
        .attr('y', d => yScale(d.hostname) + yScale.bandwidth() / 2)
        .attr('dy', '-0.2em')
        .text(d => d.hostname);

    lanesUpdate.select('.swim-lane-ip')
        .attr('x', 20)
        .attr('y', d => yScale(d.hostname) + yScale.bandwidth() / 2)
        .attr('dy', '1.1em')
        .text(d => d.ips.length > 0 ? d.ips[0] : '');

    // Exit
    lanes.exit().remove();
}

/**
 * Render top and bottom time axes using an appropriate format for the visible range.
 *
 * @param {Function} xScale - D3 time scale
 * @param {number} height - Total SVG height in pixels
 */
function renderAxis(xScale, height) {
    const axisGroup = mainGroup.select('.axis-group');
    const timeFormat = getTimeFormat(xScale);

    xAxis = d3.axisBottom(xScale)
        .ticks(10)
        .tickFormat(timeFormat);

    // Remove old axis
    axisGroup.selectAll('*').remove();

    // Top axis
    axisGroup.append('g')
        .attr('class', 'time-axis')
        .attr('transform', `translate(0, ${config.margin.top - 5})`)
        .call(d3.axisTop(xScale).ticks(10).tickFormat(timeFormat));

    // Bottom axis
    axisGroup.append('g')
        .attr('class', 'time-axis')
        .attr('transform', `translate(0, ${height - config.margin.bottom + 5})`)
        .call(xAxis);
}

/**
 * Render vertical grid lines across the timeline.
 *
 * @param {Function} xScale - D3 time scale
 * @param {Function} yScale - D3 band scale (unused but kept for call-site symmetry)
 * @param {number} width - Total SVG width in pixels (unused; reserved)
 * @param {number} height - Total SVG height in pixels
 */
function renderGrid(xScale, yScale, width, height) {
    const gridGroup = mainGroup.select('.grid-group');
    gridGroup.selectAll('*').remove();
    drawGridLines(gridGroup, xScale, height);
}

/**
 * Draws vertical grid lines for the current x scale onto the supplied group.
 * Used by both the initial render and the zoom handler.
 *
 * @param {Object} gridGroup - D3 selection of the group that should hold grid lines
 * @param {Function} xScale - D3 time scale used to position the ticks
 * @param {number} height - Total SVG height in pixels
 */
function drawGridLines(gridGroup, xScale, height) {
    const ticks = xScale.ticks(20);
    gridGroup.selectAll('.grid-line')
        .data(ticks)
        .join('line')
        .attr('class', 'grid-line')
        .attr('x1', d => xScale(d))
        .attr('x2', d => xScale(d))
        .attr('y1', config.margin.top)
        .attr('y2', height - config.margin.bottom);
}

/**
 * Builds the SVG path string for a cross-host connection arc.
 *
 * @param {{timestamp: Date, sourceHost: string, destHost: string}} d - Connection datum
 * @param {Function} xScale - D3 time scale
 * @param {Function} yScale - D3 band scale mapping hostname to y position
 * @returns {string} SVG path `d` attribute describing a quadratic arc between source and dest hosts
 */
function connectionPath(d, xScale, yScale) {
    const x = xScale(d.timestamp);
    const y1 = yScale(d.sourceHost) + yScale.bandwidth() / 2;
    const y2 = yScale(d.destHost) + yScale.bandwidth() / 2;
    const midY = (y1 + y2) / 2;
    const curveOffset = Math.abs(y2 - y1) * 0.1;
    return `M ${x} ${y1} Q ${x + curveOffset} ${midY}, ${x} ${y2}`;
}

/**
 * Render cross-host connection arcs, filtering to connections between visible hosts.
 *
 * @param {Array} connections - Connection objects from identifyConnections()
 * @param {Function} xScale - D3 time scale
 * @param {Function} yScale - D3 band scale mapping hostname to y position
 * @param {Object} hostRegistry - Host registry used to determine which hosts are currently visible
 */
function renderConnections(connections, xScale, yScale, hostRegistry) {
    const connectionsGroup = mainGroup.select('.connections-group');

    // Filter to only show connections between visible hosts
    const visibleHosts = new Set(hostRegistry.getHostList().map(h => h.hostname.toLowerCase()));

    const visibleConnections = connections.filter(conn => {
        const sourceKey = conn.sourceHost.toLowerCase();
        const destKey = conn.destHost.toLowerCase();
        return visibleHosts.has(sourceKey) && visibleHosts.has(destKey);
    });

    const lines = connectionsGroup.selectAll('.connection-line')
        .data(visibleConnections, d => d.eventId);

    // Enter
    lines.enter()
        .append('path')
        .attr('class', 'connection-line')
        .attr('d', d => connectionPath(d, xScale, yScale))
        .on('mouseover', showConnectionTooltip)
        .on('mouseout', hideTooltip)
        .on('click', (event, d) => {
            // Find and show the associated event
            const associatedEvent = currentData.events.find(e => e.id === d.eventId);
            if (associatedEvent && onEventClick) {
                onEventClick(associatedEvent);
            }
        });

    // Update
    lines.attr('d', d => connectionPath(d, xScale, yScale));

    // Exit
    lines.exit().remove();
}

/**
 * Render event dots on their host swim lanes. Annotated events are filled and sized
 * larger than raw events to serve as the visual "figure" above the "ground".
 *
 * @param {Array} events - Parsed event objects
 * @param {Function} xScale - D3 time scale
 * @param {Function} yScale - D3 band scale mapping hostname to y position
 * @param {Object} hostRegistry - Host registry used for IP-to-host resolution
 * @param {Map} annotations - Map of eventId to annotation (used to mark annotated dots)
 */
function renderEvents(events, xScale, yScale, hostRegistry, annotations) {
    const eventsGroup = mainGroup.select('.events-group');

    // Group events by host
    const eventsByHost = new Map();
    events.forEach(event => {
        if (!event.host) return;

        let hostKey = event.host.hostname;

        // For network events, also check if we should place on source/dest host
        if (event.host.hostname === 'Unknown' && event.raw) {
            const sourceIp = event.raw.source?.ip;
            if (sourceIp) {
                const sourceHost = hostRegistry.resolveIp(Array.isArray(sourceIp) ? sourceIp[0] : sourceIp);
                if (sourceHost && sourceHost !== sourceIp) {
                    hostKey = sourceHost;
                }
            }
        }

        if (!yScale.domain().includes(hostKey)) return;

        if (!eventsByHost.has(hostKey)) {
            eventsByHost.set(hostKey, []);
        }
        eventsByHost.get(hostKey).push(event);
    });

    // Flatten for rendering
    const allEvents = [];
    eventsByHost.forEach((hostEvents, hostKey) => {
        hostEvents.forEach(event => {
            allEvents.push({...event, renderHost: hostKey});
        });
    });

    const dots = eventsGroup.selectAll('.event-dot')
        .data(allEvents, d => d.id);

    const isAnnotated = d => annotations && annotations.has(d.id);
    const dotClass = d => isAnnotated(d) ? `event-dot ${d.category} annotated` : `event-dot ${d.category}`;
    const dotRadius = d => isAnnotated(d) ? 6 : 4.5;

    // Enter
    dots.enter()
        .append('circle')
        .attr('class', dotClass)
        .attr('r', dotRadius)
        .attr('cx', d => xScale(d.timestamp))
        .attr('cy', d => yScale(d.renderHost) + yScale.bandwidth() / 2)
        .on('mouseover', function (event, d) {
            d3.select(this).attr('r', dotRadius(d) + 2);
            showEventTooltip(event, d);
        })
        .on('mouseout', function (event, d) {
            d3.select(this).attr('r', dotRadius(d));
            hideTooltip();
        })
        .on('click', (event, d) => {
            event.stopPropagation();
            if (onEventClick) {
                onEventClick(d);
            }
        });

    // Update
    dots.attr('cx', d => xScale(d.timestamp))
        .attr('cy', d => yScale(d.renderHost) + yScale.bandwidth() / 2)
        .attr('r', dotRadius)
        .attr('class', dotClass);

    // Exit
    dots.exit().remove();
}

/**
 * Handle a D3 zoom/pan event by rescaling the time axis, grid, event dots, and connections.
 *
 * @param {{transform: Object}} event - D3 zoom event
 */
function handleZoom(event) {
    if (!currentData || !currentData.xScale) return;

    const transform = event.transform;
    const newXScale = transform.rescaleX(currentData.xScale);
    const timeFormat = getTimeFormat(newXScale);

    // Update axis
    mainGroup.select('.axis-group')
        .selectAll('.time-axis')
        .each(function (d, i) {
            const axis = i === 0 ? d3.axisTop(newXScale) : d3.axisBottom(newXScale);
            d3.select(this).call(axis.ticks(10).tickFormat(timeFormat));
        });

    // Update grid
    drawGridLines(mainGroup.select('.grid-group'), newXScale, currentData.height);

    // Update event positions
    mainGroup.select('.events-group')
        .selectAll('.event-dot')
        .attr('cx', d => newXScale(d.timestamp));

    // Update connection lines
    mainGroup.select('.connections-group')
        .selectAll('.connection-line')
        .attr('d', d => connectionPath(d, newXScale, currentData.yScale));
}

/**
 * Zooms in on the timeline by increasing the scale factor.
 * Centers the zoom on the current viewport center.
 */
export function zoomIn() {
    svg.transition().duration(300).call(zoom.scaleBy, 1.5);
}

/**
 * Zooms out on the timeline by decreasing the scale factor.
 * Centers the zoom on the current viewport center.
 */
export function zoomOut() {
    svg.transition().duration(300).call(zoom.scaleBy, 0.67);
}

/**
 * Resets the timeline zoom to fit all events in the viewport.
 * Restores the default scale and translation.
 */
export function zoomReset() {
    svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
}

/**
 * Show the hover tooltip for an event dot.
 *
 * @param {MouseEvent} event - Source mouse event (used for pointer coordinates)
 * @param {Object} d - Parsed event datum bound to the dot
 */
function showEventTooltip(event, d) {
    const tooltip = d3.select('.tooltip');
    const summary = escapeHtml(String(d.summary || 'Unknown event'));
    const timestamp = escapeHtml(d.timestamp ? d.timestamp.toLocaleString() : 'Unknown');
    const host = escapeHtml(String(d.host ? d.host.hostname : 'Unknown'));
    const category = escapeHtml(String(d.category || 'unknown'));

    tooltip.html(`
            <div class="tooltip-title">${summary}</div>
            <div class="tooltip-content">
                ${timestamp}<br>
                Host: ${host}<br>
                Category: ${category}
            </div>
        `)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px')
        .style('opacity', 1);
}

/**
 * Show the hover tooltip for a cross-host connection arc.
 *
 * @param {MouseEvent} event - Source mouse event (used for pointer coordinates)
 * @param {Object} d - Connection datum bound to the arc
 */
function showConnectionTooltip(event, d) {
    const tooltip = d3.select('.tooltip');
    const sourceHost = escapeHtml(String(d.sourceHost || 'Unknown'));
    const sourceIp = escapeHtml(String(d.sourceIp || 'Unknown'));
    const sourcePort = escapeHtml(String(d.sourcePort ?? '?'));
    const destHost = escapeHtml(String(d.destHost || 'Unknown'));
    const destIp = escapeHtml(String(d.destIp || 'Unknown'));
    const destPort = escapeHtml(String(d.destPort ?? '?'));
    const protocol = escapeHtml(String(d.protocol || 'unknown'));
    const timestamp = escapeHtml(d.timestamp ? d.timestamp.toLocaleString() : 'Unknown');

    tooltip.html(`
            <div class="tooltip-title">Connection</div>
            <div class="tooltip-content">
                ${sourceHost} (${sourceIp}:${sourcePort})<br>
                -><br>
                ${destHost} (${destIp}:${destPort})<br>
                Protocol: ${protocol}<br>
                ${timestamp}
            </div>
        `)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px')
        .style('opacity', 1);
}

/**
 * Hide the hover tooltip.
 */
function hideTooltip() {
    d3.select('.tooltip').style('opacity', 0);
}

/**
 * Re-render the timeline with the last rendered data after a window resize.
 */
function handleResize() {
    if (currentData) {
        renderTimelineVisualization(
            currentData.events,
            currentData.hostRegistry,
            currentData.connections,
            currentData.annotations
        );
    }
}

/**
 * Removes all rendered content from the timeline SVG.
 * Used when clearing the timeline or before a full re-render.
 */
export function clearTimelineVisualization() {
    mainGroup.selectAll('.lanes-group > *').remove();
    mainGroup.selectAll('.grid-group > *').remove();
    mainGroup.selectAll('.connections-group > *').remove();
    mainGroup.selectAll('.events-group > *').remove();
    mainGroup.selectAll('.axis-group > *').remove();
    currentData = null;
}

/**
 * Pick a `d3.timeFormat` appropriate for the visible time range — from multi-year
 * down to sub-minute — so axis ticks stay readable at any zoom level.
 *
 * @param {Function} scale - D3 time scale whose domain determines the format
 * @returns {Function} A `d3.timeFormat` formatter
 */
function getTimeFormat(scale) {
    const domain = scale.domain();
    const rangeMs = domain[1] - domain[0];
    const rangeSeconds = rangeMs / 1000;
    const rangeMinutes = rangeSeconds / 60;
    const rangeHours = rangeMinutes / 60;
    const rangeDays = rangeHours / 24;
    const rangeMonths = rangeDays / 30;
    const rangeYears = rangeDays / 365;

    if (rangeYears > 2) {
        // Multi-year view: show year and month
        return d3.timeFormat('%Y-%m');
    } else if (rangeMonths > 3) {
        // Months view: show month and year
        return d3.timeFormat('%b %Y');
    } else if (rangeDays > 7) {
        // Weeks view: show month and day
        return d3.timeFormat('%b %d');
    } else if (rangeDays > 1) {
        // Days view: show day and time
        return d3.timeFormat('%b %d %H:%M');
    } else if (rangeHours > 1) {
        // Hours view: show hour and minute
        return d3.timeFormat('%H:%M');
    } else {
        // Minutes/seconds view: show full time
        return d3.timeFormat('%H:%M:%S');
    }
}

/**
 * Debounce a function so it only fires after `wait` ms of inactivity.
 *
 * @param {Function} func - Function to debounce
 * @param {number} wait - Quiet period in milliseconds before invoking `func`
 * @returns {Function} Debounced wrapper that forwards all arguments
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

