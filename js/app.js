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
import { initWebSocketSync, isConnected, sendEventsToServer, sendDeleteToServer, sendClearToServer } from "./sync.js";
import { state } from "./state.js";

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
 * Sets up D3 visualization, event listeners, state subscriptions, and WebSocket sync.
 */
function init() {
    initTimelineVisualization('#timeline-container', showEventDetail);

    setupDragDrop();
    setupPasteInput();
    setupFilters();
    setupZoomControls();
    setupDetailPanel();
    setupSidebar();
    setupHeaderControls();
    subscribeToState();

    initWebSocketSync();
}

/**
 * Subscribes to state change events and updates UI accordingly.
 */
function subscribeToState() {
    state.on('events:added', () => {
        updateStats();
        clearBtn.disabled = false;
        exportBtn.disabled = false;
        renderTimelineVisualization(state.events, state.hostRegistry, state.connections);
    });

    state.on('events:synced', () => {
        if (state.events.length > 0) {
            updateStats();
            clearBtn.disabled = false;
            exportBtn.disabled = false;
            renderTimelineVisualization(state.events, state.hostRegistry, state.connections);
        } else {
            resetStats();
            clearBtn.disabled = true;
            exportBtn.disabled = true;
            clearTimelineVisualization();
        }
    });

    state.on('event:deleted', () => {
        eventDetail.hidden = true;
        if (state.events.length > 0) {
            updateStats();
            renderTimelineVisualization(state.events, state.hostRegistry, state.connections);
        } else {
            resetStats();
            clearBtn.disabled = true;
            exportBtn.disabled = true;
            clearTimelineVisualization();
        }
    });

    state.on('events:cleared', () => {
        jsonInput.value = '';
        eventDetail.hidden = true;
        clearBtn.disabled = true;
        exportBtn.disabled = true;
        resetStats();
        clearTimelineVisualization();
    });

    state.on('connection:changed', (connected) => {
        const usersEl = document.getElementById('stat-users');
        if (!connected) {
            usersEl.textContent = 'Reconnecting...';
        }
    });

    state.on('usercount:changed', (count) => {
        document.getElementById('stat-users').textContent = count;
    });
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
 * Updates the statistics panel from current state.
 */
function updateStats() {
    const events = state.events;
    const hostRegistry = state.hostRegistry;
    const connections = state.connections;

    document.getElementById('stat-events').textContent = events.length;
    document.getElementById('stat-hosts').textContent = hostRegistry.getHostList().length;
    document.getElementById('stat-connections').textContent = connections.length;

    const timestamps = events.map(e => e.timestamp).sort((a, b) => a - b);
    if (timestamps.length > 1) {
        const duration = timestamps[timestamps.length - 1] - timestamps[0];
        document.getElementById('stat-timespan').textContent = formatDuration(duration);
    } else {
        document.getElementById('stat-timespan').textContent = '-';
    }
}

/**
 * Configures drag-and-drop file upload functionality.
 */
function setupDragDrop() {
    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFiles(Array.from(e.target.files));
        }
    });

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

    jsonInput.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            parseAndRender();
        }
    });
}

/**
 * Parses JSON input, deduplicates against existing events, and syncs to server.
 * State subscriptions handle rendering and UI updates.
 */
function parseAndRender() {
    const input = jsonInput.value.trim();

    if (!input) {
        alert('Please enter or drop some ECS JSON data');
        return;
    }

    try {
        const result = state.addEvents(input);

        if (result.parsed === 0) {
            alert('No valid events found in the input');
            return;
        }

        if (result.added.length === 0) {
            alert(`All ${result.parsed} events already exist in the timeline`);
            jsonInput.value = '';
            return;
        }

        // Send to server for broadcast to other clients
        if (isConnected()) {
            const rawEvents = result.added.map(e => ({ _id: e.id, ...e.raw }));
            sendEventsToServer(rawEvents);
        }

        jsonInput.value = '';

        if (result.duplicates > 0) {
            console.log(`Added ${result.added.length} events, skipped ${result.duplicates} duplicates`);
        }

    } catch (error) {
        console.error('Parse error:', error);
        alert(`Error parsing events: ${error.message}`);
    }
}

/**
 * Attaches change listeners to category filter checkboxes.
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

    const deleteBtn = document.getElementById('delete-event-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            const eventId = deleteBtn.dataset.eventId;
            if (confirm('Delete this event? This cannot be undone.')) {
                if (isConnected()) {
                    sendDeleteToServer(eventId);
                } else {
                    state.deleteEvent(eventId);
                }
            }
        });
    }
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
    if (state.events.length === 0) {
        alert('No events to export');
        return;
    }

    const rawEvents = state.events.map(e => e.raw);
    const jsonString = JSON.stringify(rawEvents, null, 2);
    const blob = new Blob([jsonString], {type: 'application/json'});
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `ecs-timeline-${timestamp}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
}

/**
 * Initiates timeline clear operation.
 * If connected, sends clear request to server; otherwise clears locally.
 */
function clearTimeline() {
    if (isConnected()) {
        sendClearToServer();
        return;
    }

    state.clear();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
