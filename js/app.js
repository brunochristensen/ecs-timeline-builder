import {
    initTimelineVisualization,
    renderTimelineVisualization,
    zoomIn,
    zoomOut,
    zoomReset,
    clearTimelineVisualization
} from "./timeline.js";
import { formatDuration } from "./utils.js";
import { renderEventDetailPanel, renderMitreOptions } from "./detail-renderer.js";
import { initWebSocketSync, isConnected, sendEventsToServer, sendDeleteToServer, sendClearToServer, sendAnnotationToServer, sendDeleteAnnotationToServer, joinTimeline } from "./sync.js";
import { state } from "./state.js";
import { TECHNIQUES } from "./mitre.js";
import { initGapDetection } from "./gap-detection.js";
import { initTimelineSelector, showSelector, getTimelineIdFromUrl } from "./timeline-selector.js";

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

// Zoom buttons
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomResetBtn = document.getElementById('zoom-reset');

// Status bar elements
const statusLed = document.getElementById('status-led');
const statusLink = document.getElementById('status-link');
const statusCase = document.getElementById('status-case');
const statusEventsEl = document.getElementById('status-events');
const statusHostsEl = document.getElementById('status-hosts');
const statusSyncEl = document.getElementById('status-sync');

// Currently displayed event in the detail panel (for annotation refresh)
let currentDetailEvent = null;

/**
 * Initializes the application on page load.
 * Sets up D3 visualization, event listeners, state subscriptions, and WebSocket sync.
 */
function init() {
    initTimelineVisualization('#timeline-container', showEventDetail);

    setupDragDrop();
    setupPasteInput();
    setupZoomControls();
    setupDetailPanel();
    setupSidebar();
    setupHeaderControls();
    setupTimelineSwitch();
    subscribeToState();
    initGapDetection();

    initTimelineSelector(onTimelineJoined);
    initWebSocketSync();

    // After WebSocket connects and we receive timeline list, handle auto-join or show selector
    state.on('timelines:changed', handleTimelineListReceived);
}

/**
 * Handles the initial timeline list received from server.
 * Auto-joins if URL has timeline param, otherwise shows selector.
 */
function handleTimelineListReceived() {
    // Only run once on initial connection
    if (state.currentTimelineId) return;

    const urlTimelineId = getTimelineIdFromUrl();
    if (urlTimelineId) {
        const exists = state.timelines.some(t => t.id === urlTimelineId);
        if (exists) {
            joinTimeline(urlTimelineId);
            return;
        }
    }

    // No URL param or timeline not found, show selector
    showSelector();
}

/**
 * Called when a timeline is successfully joined.
 */
function onTimelineJoined() {
    updateTimelineDisplay();
}

/**
 * Updates the status bar with the current timeline name.
 */
function updateTimelineDisplay() {
    const timeline = state.currentTimeline;
    if (statusCase) {
        if (timeline) {
            statusCase.textContent = timeline.name;
            statusCase.title = `${timeline.description || timeline.name} (click to switch)`;
            statusCase.style.cursor = 'pointer';
        } else {
            statusCase.textContent = 'No Timeline';
            statusCase.title = 'Click to select a timeline';
            statusCase.style.cursor = 'pointer';
        }
    }
}

/**
 * Sets up the timeline switch handler on the status bar.
 */
function setupTimelineSwitch() {
    if (statusCase) {
        statusCase.addEventListener('click', () => {
            showSelector();
        });
    }
}

/**
 * Updates the last-sync timestamp in the status bar to the current time.
 */
function stampSync() {
    if (!statusSyncEl) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    statusSyncEl.textContent = `${hh}:${mm}:${ss}Z`;
}

/**
 * Refreshes the timeline visualization and UI controls to match current state.
 * Renders events when present, otherwise shows the empty state.
 */
function refreshTimelineUi() {
    const hasEvents = state.events.length > 0;
    clearBtn.disabled = !hasEvents;
    exportBtn.disabled = !hasEvents;

    if (hasEvents) {
        updateStats();
        renderTimelineVisualization(state.events, state.hostRegistry, state.connections, state.annotations);
    } else {
        resetStats();
        clearTimelineVisualization();
    }
    stampSync();
}

/**
 * Re-renders the detail panel if it is open for the given event ID.
 *
 * @param {string} eventId - The event ID whose detail panel should refresh
 */
function refreshDetailIfOpen(eventId) {
    if (currentDetailEvent && currentDetailEvent.id === eventId) {
        showEventDetail(currentDetailEvent);
    }
}

/**
 * Subscribes to state change events and updates UI accordingly.
 */
function subscribeToState() {
    state.on('events:added', refreshTimelineUi);
    state.on('events:synced', refreshTimelineUi);

    state.on('event:deleted', () => {
        eventDetail.hidden = true;
        refreshTimelineUi();
    });

    state.on('events:cleared', () => {
        jsonInput.value = '';
        eventDetail.hidden = true;
        refreshTimelineUi();
    });

    state.on('connection:changed', (connected) => {
        if (statusLed) {
            statusLed.classList.toggle('connected', connected);
            statusLed.classList.toggle('disconnected', !connected);
        }
        if (statusLink) {
            statusLink.textContent = connected ? 'ACTIVE' : 'RECONNECTING';
        }
        if (!connected) {
            document.getElementById('stat-users').textContent = '—';
        }
    });

    state.on('usercount:changed', (count) => {
        document.getElementById('stat-users').textContent = count;
    });

    // Annotation changes refresh the detail panel (if open) and update timeline markers
    const onAnnotationChange = (eventId) => {
        refreshDetailIfOpen(eventId);
        if (state.events.length > 0) {
            renderTimelineVisualization(state.events, state.hostRegistry, state.connections, state.annotations);
        }
    };
    state.on('annotation:updated', onAnnotationChange);
    state.on('annotation:deleted', onAnnotationChange);

    // Timeline changes
    state.on('timeline:joined', updateTimelineDisplay);
    state.on('timeline:deleted', (deletedId) => {
        if (state.currentTimelineId === deletedId || !state.currentTimelineId) {
            showSelector();
        }
    });
}

/**
 * Resets all statistics displays to their default empty values.
 */
function resetStats() {
    document.getElementById('stat-events').textContent = '0';
    document.getElementById('stat-hosts').textContent = '0';
    document.getElementById('stat-connections').textContent = '0';
    document.getElementById('stat-timespan').textContent = '—';
    if (statusEventsEl) statusEventsEl.textContent = '0';
    if (statusHostsEl) statusHostsEl.textContent = '0';
}

/**
 * Updates the statistics panel from current state.
 */
function updateStats() {
    const events = state.events;
    const hostRegistry = state.hostRegistry;
    const connections = state.connections;
    const hostCount = hostRegistry.getHostList().length;

    document.getElementById('stat-events').textContent = events.length;
    document.getElementById('stat-hosts').textContent = hostCount;
    document.getElementById('stat-connections').textContent = connections.length;

    const timestamps = events.map(e => e.timestamp).sort((a, b) => a - b);
    if (timestamps.length > 1) {
        const duration = timestamps[timestamps.length - 1] - timestamps[0];
        document.getElementById('stat-timespan').textContent = formatDuration(duration);
    } else {
        document.getElementById('stat-timespan').textContent = '—';
    }

    if (statusEventsEl) statusEventsEl.textContent = events.length;
    if (statusHostsEl) statusHostsEl.textContent = hostCount;
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
    const timelineContainer = document.getElementById('timeline-container');
    const appContainer = document.querySelector('.app-container');
    sidebarToggle.addEventListener('click', () => {
        const collapsed = sidebar.classList.toggle('collapsed');
        if (timelineContainer) timelineContainer.classList.toggle('sidebar-collapsed', collapsed);
        if (appContainer) appContainer.classList.toggle('sidebar-collapsed', collapsed);
    });
}

/**
 * Displays the event detail panel with information about the clicked event.
 *
 * @param {Object} event - The parsed event object to display
 */
function showEventDetail(event) {
    currentDetailEvent = event;
    const annotation = state.annotations.get(event.id) || null;
    detailContent.innerHTML = renderEventDetailPanel(event, annotation);
    eventDetail.hidden = false;

    // Delete event button
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

    // Tactic dropdown changes technique options
    const tacticSelect = document.getElementById('annotation-tactic');
    const techniqueSelect = document.getElementById('annotation-technique');
    if (tacticSelect && techniqueSelect) {
        tacticSelect.addEventListener('change', () => {
            const techniqueList = TECHNIQUES[tacticSelect.value] || null;
            techniqueSelect.innerHTML = renderMitreOptions(techniqueList, '', '-- Select Technique --');
        });
    }

    // Save annotation button
    const saveAnnotationBtn = document.getElementById('save-annotation-btn');
    if (saveAnnotationBtn) {
        saveAnnotationBtn.addEventListener('click', () => {
            const comment = document.getElementById('annotation-comment').value;
            const mitreTactic = document.getElementById('annotation-tactic').value;
            const mitreTechnique = document.getElementById('annotation-technique').value;

            const annotationData = { comment, mitreTactic, mitreTechnique };

            if (isConnected()) {
                sendAnnotationToServer(event.id, annotationData);
            } else {
                state.setAnnotation(event.id, {
                    eventId: event.id,
                    ...annotationData,
                    updatedAt: Date.now()
                });
            }
        });
    }

    // Delete annotation button
    const deleteAnnotationBtn = document.getElementById('delete-annotation-btn');
    if (deleteAnnotationBtn) {
        deleteAnnotationBtn.addEventListener('click', () => {
            if (isConnected()) {
                sendDeleteAnnotationToServer(event.id);
            } else {
                state.deleteAnnotation(event.id);
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

    const exportData = {
        exportedAt: new Date().toISOString(),
        events: state.events.map(e => e.raw),
        annotations: Object.fromEntries(state.annotations)
    };
    const jsonString = JSON.stringify(exportData, null, 2);
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
