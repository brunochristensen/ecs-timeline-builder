import * as d3 from '../lib/d3.v7.min.js';

/**
 * ECS Timeline Builder - D3.js Timeline Visualization
 * Renders swim lane timeline with cross-host connection lines
 */

// Configuration
const config = {
        margin: {top: 110, right: 70, bottom: 40, left: 220},
        laneHeight: 60,
        eventRadius: 5,
        minWidth: 800,
        transitionDuration: 300
    };

/**
 * Calculate top margin based on floating input box position
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
let currentFilters = {
    network: true,
    file: true,
    process: true,
    authentication: true,
    other: true
};
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
 */
export function renderTimelineVisualization(events, hostRegistry, connections) {
    currentData = {events, hostRegistry, connections};
    const hosts = hostRegistry.getHostList();

    // Update top margin based on input box position
    config.margin.top = calculateTopMargin();

    const containerRect = container.node().getBoundingClientRect();
    const width = Math.max(containerRect.width, config.minWidth);
    const height = Math.max(
        hosts.length * config.laneHeight + config.margin.top + config.margin.bottom,
        400
    );

    // Update SVG size
    svg.attr('width', width)
        .attr('height', height);

    // Filter events based on current filters
    const filteredEvents = filterEvents(events);

    // Calculate time domain
    const timeExtent = d3.extent(filteredEvents, d => d.timestamp);
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
    renderEvents(filteredEvents, xScale, yScale, hostRegistry);
}

/**
 * Render swim lanes
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
        .attr('fill', (d, i) => i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent');

    lanesUpdate.select('.swim-lane-label')
        .attr('x', 44)
        .attr('y', d => yScale(d.hostname) + yScale.bandwidth() / 2)
        .attr('dy', '-0.2em')
        .text(d => d.hostname);

    lanesUpdate.select('.swim-lane-ip')
        .attr('x', 44)
        .attr('y', d => yScale(d.hostname) + yScale.bandwidth() / 2)
        .attr('dy', '1em')
        .text(d => d.ips.length > 0 ? d.ips[0] : '');

    // Exit
    lanes.exit().remove();
}

/**
 * Render time axis
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
 * Render grid lines
 */
function renderGrid(xScale, yScale, width, height) {
    const gridGroup = mainGroup.select('.grid-group');
    gridGroup.selectAll('*').remove();

    // Vertical grid lines
    const ticks = xScale.ticks(20);
    gridGroup.selectAll('.grid-line')
        .data(ticks)
        .enter()
        .append('line')
        .attr('class', 'grid-line')
        .attr('x1', d => xScale(d))
        .attr('x2', d => xScale(d))
        .attr('y1', config.margin.top)
        .attr('y2', height - config.margin.bottom);
}

/**
 * Render cross-host connection lines
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
        .attr('d', d => {
            const x = xScale(d.timestamp);
            const y1 = yScale(d.sourceHost) + yScale.bandwidth() / 2;
            const y2 = yScale(d.destHost) + yScale.bandwidth() / 2;

            // Draw curved line
            const midY = (y1 + y2) / 2;
            const curveOffset = Math.abs(y2 - y1) * 0.1;

            return `M ${x} ${y1}
                        Q ${x + curveOffset} ${midY}, ${x} ${y2}`;
        })
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
    lines.attr('d', d => {
        const x = xScale(d.timestamp);
        const y1 = yScale(d.sourceHost) + yScale.bandwidth() / 2;
        const y2 = yScale(d.destHost) + yScale.bandwidth() / 2;

        const midY = (y1 + y2) / 2;
        const curveOffset = Math.abs(y2 - y1) * 0.1;

        return `M ${x} ${y1}
                    Q ${x + curveOffset} ${midY}, ${x} ${y2}`;
    });

    // Exit
    lines.exit().remove();
}

/**
 * Render event dots on swim lanes
 */
function renderEvents(events, xScale, yScale, hostRegistry) {
    const eventsGroup = mainGroup.select('.events-group');

    // Group events by host
    const eventsByHost = new Map();
    events.forEach(event => {
        if (!event.host) return;

        let hostKey = event.host.hostname;

        // For network events, also check if we should place on source/dest host
        if (event.connection && event.host.hostname === 'Unknown') {
            // Try to place on source host
            const sourceHost = hostRegistry.resolveIp(event.connection.sourceIp);
            if (sourceHost && sourceHost !== event.connection.sourceIp) {
                hostKey = sourceHost;
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

    // Enter
    dots.enter()
        .append('circle')
        .attr('class', d => `event-dot ${d.category}`)
        .attr('r', config.eventRadius)
        .attr('cx', d => xScale(d.timestamp))
        .attr('cy', d => yScale(d.renderHost) + yScale.bandwidth() / 2)
        .on('mouseover', showEventTooltip)
        .on('mouseout', hideTooltip)
        .on('click', (event, d) => {
            event.stopPropagation();
            if (onEventClick) {
                onEventClick(d);
            }
        });

    // Update
    dots.attr('cx', d => xScale(d.timestamp))
        .attr('cy', d => yScale(d.renderHost) + yScale.bandwidth() / 2)
        .attr('class', d => `event-dot ${d.category}`);

    // Exit
    dots.exit().remove();
}

/**
 * Filter events based on category filters
 */
function filterEvents(events) {
    return events.filter(event => {
        const category = event.category;
        if (category === 'network') return currentFilters.network;
        if (category === 'file') return currentFilters.file;
        if (category === 'process') return currentFilters.process;
        if (category === 'authentication') return currentFilters.authentication;
        return currentFilters.other;
    });
}

/**
 * Updates which event categories are visible on the timeline.
 * Triggers a re-render with the new filter settings applied.
 *
 * @param {Object} filters - Category visibility flags
 * @param {boolean} filters.network - Show network events
 * @param {boolean} filters.file - Show file events
 * @param {boolean} filters.process - Show process events
 * @param {boolean} filters.authentication - Show authentication events
 * @param {boolean} filters.other - Show uncategorized events
 */
export function setEventCategoryFilters(filters) {
    currentFilters = {...currentFilters, ...filters};
    if (currentData) {
        renderTimelineVisualization(
            currentData.events,
            currentData.hostRegistry,
            currentData.connections
        );
    }
}

/**
 * Handle zoom events
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
    const ticks = newXScale.ticks(20);
    const gridGroup = mainGroup.select('.grid-group');
    gridGroup.selectAll('.grid-line').remove();
    gridGroup.selectAll('.grid-line')
        .data(ticks)
        .enter()
        .append('line')
        .attr('class', 'grid-line')
        .attr('x1', d => newXScale(d))
        .attr('x2', d => newXScale(d))
        .attr('y1', config.margin.top)
        .attr('y2', currentData.height - config.margin.bottom);

    // Update event positions
    mainGroup.select('.events-group')
        .selectAll('.event-dot')
        .attr('cx', d => newXScale(d.timestamp));

    // Update connection lines
    mainGroup.select('.connections-group')
        .selectAll('.connection-line')
        .attr('d', d => {
            const x = newXScale(d.timestamp);
            const y1 = currentData.yScale(d.sourceHost) + currentData.yScale.bandwidth() / 2;
            const y2 = currentData.yScale(d.destHost) + currentData.yScale.bandwidth() / 2;
            const midY = (y1 + y2) / 2;
            const curveOffset = Math.abs(y2 - y1) * 0.1;

            return `M ${x} ${y1} Q ${x + curveOffset} ${midY}, ${x} ${y2}`;
        });
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
 * Show tooltip for event dot
 */
function showEventTooltip(event, d) {
    const tooltip = d3.select('.tooltip');

    tooltip.html(`
            <div class="tooltip-title">${d.summary}</div>
            <div class="tooltip-content">
                ${d.timestamp.toLocaleString()}<br>
                Host: ${d.host ? d.host.hostname : 'Unknown'}<br>
                Category: ${d.category}
            </div>
        `)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px')
        .style('opacity', 1);
}

/**
 * Show tooltip for connection line
 */
function showConnectionTooltip(event, d) {
    const tooltip = d3.select('.tooltip');

    tooltip.html(`
            <div class="tooltip-title">Connection</div>
            <div class="tooltip-content">
                ${d.sourceHost} (${d.sourceIp}:${d.sourcePort || '?'})<br>
                ↓<br>
                ${d.destHost} (${d.destIp}:${d.destPort || '?'})<br>
                Protocol: ${d.protocol || 'unknown'}<br>
                ${d.timestamp.toLocaleString()}
            </div>
        `)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px')
        .style('opacity', 1);
}

/**
 * Hide tooltip
 */
function hideTooltip() {
    d3.select('.tooltip').style('opacity', 0);
}

/**
 * Handle window resize
 */
function handleResize() {
    if (currentData) {
        renderTimelineVisualization(
            currentData.events,
            currentData.hostRegistry,
            currentData.connections
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
 * Get appropriate time format based on visible time range
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
 * Debounce utility
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

