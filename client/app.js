import bus from "./event-bus.js";
import {EVENTS} from "./events.js";
import {
    initTimelineVisualization,
    renderTimelineVisualization,
    zoomIn,
    zoomOut,
    zoomReset,
    clearTimelineVisualization
} from "./timeline.js";
import {formatDuration} from "./utils.js";
import {sendClearToServer, joinTimeline, retryConnection, isTimelineReady} from "./sync.js";
import {state} from "./state.js";
import {sessionState} from "./stores/session-store.js";
import {initStatusBarController, resetStatusStats, stampStatusSync, updateStatusStats} from "./features/status-bar-controller.js";
import {initImportController} from "./features/import-controller.js";
import {initDetailPanelController, showEventDetail} from "./features/detail-panel-controller.js";
import "./gap-detection.js";
import {showSelector, getTimelineIdFromUrl} from "./timeline-selector.js";

const clearBtn = document.getElementById('clear-btn');
const exportBtn = document.getElementById('export-btn');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomResetBtn = document.getElementById('zoom-reset');

let initialTimelineHandled = false;

function init() {
    initTimelineVisualization('#timeline-container', showEventDetail);
    initImportController();
    initDetailPanelController();
    initStatusBarController({
        onSelectTimeline: showSelector,
        onRetryConnection: retryConnection
    });

    setupZoomControls();
    setupSidebar();
    setupHeaderControls();
    subscribeToState();

    bus.on(EVENTS.TIMELINES_CHANGED, handleTimelineListReceived);
}

function handleTimelineListReceived() {
    if (initialTimelineHandled) return;
    initialTimelineHandled = true;

    const urlTimelineId = getTimelineIdFromUrl();
    if (urlTimelineId) {
        const exists = state.timelines.some(t => t.id === urlTimelineId);
        if (exists) {
            joinTimeline(urlTimelineId);
            return;
        }
    }

    showSelector();
}

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

    stampStatusSync();
}

function subscribeToState() {
    bus.on(EVENTS.EVENTS_ADDED, refreshTimelineUi);
    bus.on(EVENTS.EVENTS_SYNCED, refreshTimelineUi);
    bus.on(EVENTS.EVENT_DELETED, refreshTimelineUi);
    bus.on(EVENTS.EVENTS_CLEARED, refreshTimelineUi);

    const onAnnotationChange = () => {
        if (state.events.length > 0) {
            renderTimelineVisualization(state.events, state.hostRegistry, state.connections, state.annotations);
        }
    };
    bus.on(EVENTS.ANNOTATION_UPDATED, onAnnotationChange);
    bus.on(EVENTS.ANNOTATION_DELETED, onAnnotationChange);

    bus.on(EVENTS.TIMELINE_DELETED, (deletedId) => {
        if (state.currentTimelineId === deletedId || !state.currentTimelineId) {
            showSelector();
        }
    });
}

function resetStats() {
    document.getElementById('stat-events').textContent = '0';
    document.getElementById('stat-hosts').textContent = '0';
    document.getElementById('stat-connections').textContent = '0';
    document.getElementById('stat-timespan').textContent = '--';
    resetStatusStats();
}

function updateStats() {
    const events = state.events;
    const hostRegistry = state.hostRegistry;
    const connections = state.connections;
    const hostCount = hostRegistry.getHostList().length;

    document.getElementById('stat-events').textContent = events.length;
    document.getElementById('stat-hosts').textContent = hostCount;
    document.getElementById('stat-connections').textContent = connections.length;

    const timestamps = events.map(event => event.timestamp).sort((a, b) => a - b);
    if (timestamps.length > 1) {
        const duration = timestamps[timestamps.length - 1] - timestamps[0];
        document.getElementById('stat-timespan').textContent = formatDuration(duration);
    } else {
        document.getElementById('stat-timespan').textContent = '--';
    }

    updateStatusStats(events.length, hostCount);
}

function setupZoomControls() {
    zoomInBtn.addEventListener('click', () => zoomIn());
    zoomOutBtn.addEventListener('click', () => zoomOut());
    zoomResetBtn.addEventListener('click', () => zoomReset());
}

function setupSidebar() {
    const timelineContainer = document.getElementById('timeline-container');
    const appContainer = document.querySelector('.app-container');
    sidebarToggle.addEventListener('click', () => {
        const collapsed = sidebar.classList.toggle('collapsed');
        if (timelineContainer) timelineContainer.classList.toggle('sidebar-collapsed', collapsed);
        if (appContainer) appContainer.classList.toggle('sidebar-collapsed', collapsed);
    });
}

function setupHeaderControls() {
    clearBtn.addEventListener('click', clearTimeline);
    exportBtn.addEventListener('click', exportTimeline);
}

function exportTimeline() {
    if (state.events.length === 0) {
        alert('No events to export');
        return;
    }

    const exportData = {
        exportedAt: new Date().toISOString(),
        events: state.events.map(event => event.raw),
        annotations: Object.fromEntries(state.annotations)
    };
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], {type: 'application/json'});
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `ecs-timeline-${timestamp}.json`;

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    URL.revokeObjectURL(url);
}

function clearTimeline() {
    if (isTimelineReady()) {
        sendClearToServer();
        return;
    }

    sessionState.setLastError('Cannot clear the timeline while timeline sync is not ready.');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
