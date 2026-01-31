import {parseEvents, buildHostRegistry, identifyConnections} from "./parser.js";
import {
    initTimelineVisualization,
    renderTimelineVisualization,
    setEventCategoryFilters,
    zoomIn,
    zoomOut,
    zoomReset,
    clearTimelineVisualization
} from "./timeline.js";
import { formatDuration } from "./utils.js";
import { renderEventDetailPanel } from "./detail-renderer.js";
import {initWebSocketSync, isConnected, sendEventsToServer, sendClearToServer} from "./sync.js";

// State
let currentEvents = [];
let currentHostRegistry = null;
let currentConnections = [];

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const jsonInput = document.getElementById('json-input');
const parseBtn = document.getElementById('parse-btn');
const clearBtn = document.getElementById('clear-btn');
const exportBtn = document.getElementById('export-btn');
const eventDetail = document.getElementById('event-detail');
const detailContent = document.getElementById('detail-content');
const closeDetailBtn = document.getElementById('close-detail');

// Sidebar elements
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');

// Filter checkboxes
const filterNetwork = document.getElementById('filter-network');
const filterFile = document.getElementById('filter-file');
const filterProcess = document.getElementById('filter-process');
const filterAuth = document.getElementById('filter-auth');
const filterOther = document.getElementById('filter-other');

// Zoom buttons
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomResetBtn = document.getElementById('zoom-reset');

/**
 * Initializes the application on page load.
 * Sets up D3 visualization, event listeners, and WebSocket sync.
 */
function init() {
    // Initialize timeline visualization
    initTimelineVisualization('#timeline-container', showEventDetail);

    // Set up event listeners
    setupDragDrop();
    setupPasteInput();
    setupFilters();
    setupZoomControls();
    setupDetailPanel();
    setupSidebar();
    setupHeaderControls();

    // Initialize WebSocket sync
    initWebSocketSync({
        onSync: handleFullSync,
        onEventsAdded: handleEventsAdded,
        onCleared: performClear,
        onUserCount: handleUserCount,
        onConnectionChange: handleConnectionChange
    });
}

/**
 * Handles full state synchronization from the server.
 * Called on initial connection and after reconnection to restore shared state.
 *
 * @param {Array} rawEvents - Complete array of raw events from server
 */
function handleFullSync(rawEvents) {
    // Clear current state
    currentEvents = [];

    if (rawEvents.length > 0) {
        // Parse and render the synced events
        currentEvents = parseEvents(rawEvents);
        currentHostRegistry = buildHostRegistry(currentEvents);
        currentConnections = identifyConnections(currentEvents, currentHostRegistry);

        updateStats(currentEvents, currentHostRegistry, currentConnections);
        clearBtn.disabled = false;
        exportBtn.disabled = false;

        renderTimelineVisualization(currentEvents, currentHostRegistry, currentConnections);
    } else {
        // Empty timeline
        currentHostRegistry = null;
        currentConnections = [];
        resetStats();
        clearBtn.disabled = true;
        exportBtn.disabled = true;
        clearTimelineVisualization();
    }
}

/**
 * Handles incremental event additions from other connected clients.
 * Deduplicates against existing events before adding to timeline.
 *
 * @param {Array} rawEvents - New raw events broadcast by another client
 */
function handleEventsAdded(rawEvents) {
    if (rawEvents.length === 0) return;

    // Parse the new events
    const newParsed = parseEvents(rawEvents);

    // Deduplicate
    const existingIds = new Set(currentEvents.map(e => e.id));
    const uniqueNew = newParsed.filter(e => !existingIds.has(e.id));

    if (uniqueNew.length > 0) {
        currentEvents = [...currentEvents, ...uniqueNew];
        currentHostRegistry = buildHostRegistry(currentEvents);
        currentConnections = identifyConnections(currentEvents, currentHostRegistry);

        updateStats(currentEvents, currentHostRegistry, currentConnections);
        clearBtn.disabled = false;
        exportBtn.disabled = false;

        renderTimelineVisualization(currentEvents, currentHostRegistry, currentConnections);
    }
}

/**
 * Resets all application state to empty.
 * Called when timeline is cleared locally or by another client.
 */
function performClear() {
    currentEvents = [];
    currentHostRegistry = null;
    currentConnections = [];

    jsonInput.value = '';
    eventDetail.hidden = true;

    clearBtn.disabled = true;
    exportBtn.disabled = true;

    resetStats();
    clearTimelineVisualization();
}

/**
 * Updates the connected users count display in the stats panel.
 *
 * @param {number} count - Number of currently connected clients
 */
function handleUserCount(count) {
    document.getElementById('stat-users').textContent = count;
}

/**
 * Updates UI to reflect WebSocket connection state changes.
 * Shows "Reconnecting..." when disconnected.
 *
 * @param {boolean} connected - Current connection state
 */
function handleConnectionChange(connected) {
    const usersEl = document.getElementById('stat-users');
    if (!connected) {
        usersEl.textContent = 'Reconnecting...';
    }
}

/**
 * Resets all statistics displays to their default empty values.
 */
function resetStats() {
    document.getElementById('stat-events').textContent = '0';
    document.getElementById('stat-hosts').textContent = '0';
    document.getElementById('stat-connections').textContent = '0';
    document.getElementById('stat-timespan').textContent = '-';
}

/**
 * Configures drag-and-drop file upload functionality.
 * Handles click-to-browse, drag-over styling, and file drop events.
 */
function setupDragDrop() {
    // Click to select files
    dropZone.addEventListener('click', () => fileInput.click());

    // File input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFiles(Array.from(e.target.files));
        }
    });

    // Drag events
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');

        const files = Array.from(e.dataTransfer.files).filter(
            f => f.name.endsWith('.json') || f.name.endsWith('.ndjson')
        );

        if (files.length > 0) {
            handleFiles(files);
        }
    });
}

/**
 * Reads dropped or selected JSON/NDJSON files and triggers parsing.
 * Concatenates multiple files into a single input stream.
 *
 * @param {File[]} files - Array of File objects to process
 */
async function handleFiles(files) {
    let allContent = '';

    for (const file of files) {
        try {
            const content = await readFile(file);
            allContent += content + '\n';
        } catch (error) {
            console.error(`Error reading file ${file.name}:`, error);
            alert(`Error reading file ${file.name}: ${error.message}`);
        }
    }

    if (allContent.trim()) {
        jsonInput.value = allContent.trim();
        parseAndRender();
    }
}

/**
 * Reads a file's contents as text using FileReader API.
 *
 * @param {File} file - File object to read
 * @returns {Promise<string>} Resolves with file contents as string
 */
function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

/**
 * Sets up the parse button and keyboard shortcut (Ctrl+Enter) for the JSON textarea.
 */
function setupPasteInput() {
    parseBtn.addEventListener('click', parseAndRender);

    // Also parse on Ctrl+Enter
    jsonInput.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            parseAndRender();
        }
    });
}

/**
 * Parses JSON input, deduplicates against existing events, and renders the timeline.
 * Syncs new events to server if connected. Events accumulate across multiple imports.
 */
function parseAndRender() {
    const input = jsonInput.value.trim();

    if (!input) {
        alert('Please enter or drop some ECS JSON data');
        return;
    }

    try {
        // Parse new events
        const newEvents = parseEvents(input);

        if (newEvents.length === 0) {
            alert('No valid events found in the input');
            return;
        }

        // Deduplicate: build set of existing event IDs
        const existingIds = new Set(currentEvents.map(e => e.id));

        // Filter out duplicates and count them
        const uniqueNewEvents = newEvents.filter(e => !existingIds.has(e.id));
        const duplicateCount = newEvents.length - uniqueNewEvents.length;

        if (uniqueNewEvents.length === 0) {
            alert(`All ${newEvents.length} events already exist in the timeline`);
            jsonInput.value = '';
            return;
        }

        // If sync is enabled, send raw events to server
        if (isConnected()) {
            // Extract raw events for the unique parsed ones
            const uniqueRawEvents = uniqueNewEvents.map(e => ({ _id: e.id, ...e.raw}));
            console.log('Sending to server:', uniqueRawEvents);
            sendEventsToServer(uniqueRawEvents);
        }

        // Add new events to cumulative list
        currentEvents = [...currentEvents, ...uniqueNewEvents];

        // Rebuild host registry and connections from full event list
        currentHostRegistry = buildHostRegistry(currentEvents);
        currentConnections = identifyConnections(currentEvents, currentHostRegistry);

        // Update stats with cumulative totals
        updateStats(currentEvents, currentHostRegistry, currentConnections);

        // Enable action buttons
        clearBtn.disabled = false;
        exportBtn.disabled = false;

        // Clear textarea
        jsonInput.value = '';

        // Render timeline with all events
        renderTimelineVisualization(currentEvents, currentHostRegistry, currentConnections);

        // Notify user if some duplicates were skipped
        if (duplicateCount > 0) {
            console.log(`Added ${uniqueNewEvents.length} events, skipped ${duplicateCount} duplicates`);
        }

    } catch (error) {
        console.error('Parse error:', error);
        alert(`Error parsing events: ${error.message}`);
    }
}

/**
 * Updates the statistics panel with current event counts and time span.
 *
 * @param {Array} events - Current event array
 * @param {Object} hostRegistry - Current host registry
 * @param {Array} connections - Current connections array
 */
function updateStats(events, hostRegistry, connections) {
    document.getElementById('stat-events').textContent = events.length;
    document.getElementById('stat-hosts').textContent = hostRegistry.getHostList().length;
    document.getElementById('stat-connections').textContent = connections.length;

    // Calculate time span
    const timestamps = events.map(e => e.timestamp).sort((a, b) => a - b);
    if (timestamps.length > 1) {
        const duration = timestamps[timestamps.length - 1] - timestamps[0];
        document.getElementById('stat-timespan').textContent = formatDuration(duration);
    } else {
        document.getElementById('stat-timespan').textContent = '-';
    }
}

/**
 * Attaches change listeners to category filter checkboxes.
 * Updates timeline visualization when filters change.
 */
function setupFilters() {
    const updateFilters = () => {
        setEventCategoryFilters({
            network: filterNetwork.checked,
            file: filterFile.checked,
            process: filterProcess.checked,
            authentication: filterAuth.checked,
            other: filterOther.checked
        });
    };

    filterNetwork.addEventListener('change', updateFilters);
    filterFile.addEventListener('change', updateFilters);
    filterProcess.addEventListener('change', updateFilters);
    filterAuth.addEventListener('change', updateFilters);
    filterOther.addEventListener('change', updateFilters);
}

/**
 * Attaches click handlers to zoom in, out, and reset buttons.
 */
function setupZoomControls() {
    zoomInBtn.addEventListener('click', () => zoomIn());
    zoomOutBtn.addEventListener('click', () => zoomOut());
    zoomResetBtn.addEventListener('click', () => zoomReset());
}

/**
 * Sets up the event detail panel close button and Escape key handler.
 */
function setupDetailPanel() {
    closeDetailBtn.addEventListener('click', hideEventDetail);

    // Close on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !eventDetail.hidden) {
            hideEventDetail();
        }
    });
}

/**
 * Attaches click handler to sidebar collapse/expand toggle.
 */
function setupSidebar() {
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
    });
}

/**
 * Displays the event detail panel with information about the clicked event.
 *
 * @param {Object} event - The parsed event object to display
 */
function showEventDetail(event) {
    detailContent.innerHTML = renderEventDetailPanel(event);
    eventDetail.hidden = false;
}

/**
 * Hides the event detail panel.
 */
function hideEventDetail() {
    eventDetail.hidden = true;
}

/**
 * Attaches click handlers to the clear and export header buttons.
 */
function setupHeaderControls() {
    clearBtn.addEventListener('click', clearTimeline);
    exportBtn.addEventListener('click', exportTimeline);
}

/**
 * Exports all current events as a timestamped JSON file download.
 */
function exportTimeline() {
    if (currentEvents.length === 0) {
        alert('No events to export');
        return;
    }

    // Extract raw events for export
    const rawEvents = currentEvents.map(e => e.raw);

    // Create JSON string
    const jsonString = JSON.stringify(rawEvents, null, 2);

    // Create blob and download link
    const blob = new Blob([jsonString], {type: 'application/json'});
    const url = URL.createObjectURL(blob);

    // Generate filename with timestamp
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `ecs-timeline-${timestamp}.json`;

    // Trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up
    URL.revokeObjectURL(url);
}

/**
 * Initiates timeline clear operation.
 * If connected, sends clear request to server; otherwise clears locally.
 */
function clearTimeline() {
    // If sync is enabled, notify server (which will broadcast to all clients)
    if (isConnected()) {
        sendClearToServer();
        // The handleRemoteCleared callback will handle the actual clearing
        return;
    }

    // Local-only clear
    performClear();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}