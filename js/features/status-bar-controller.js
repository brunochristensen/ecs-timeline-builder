import bus from '../event-bus.js';
import {state} from '../state.js';
import {sessionState} from '../stores/session-store.js';

let statusLed;
let statusLink;
let statusCase;
let statusEventsEl;
let statusHostsEl;
let statusSyncEl;
let statusAlert;
let statusMessage;
let statusRetryBtn;
let statUsersEl;
let initialized = false;

function updateTimelineDisplay() {
    const timeline = state.currentTimeline;
    if (!statusCase) return;

    if (timeline) {
        statusCase.textContent = timeline.name;
        statusCase.title = `${timeline.description || timeline.name} (click to switch)`;
        statusCase.style.cursor = 'pointer';
        return;
    }

    statusCase.textContent = 'No Timeline';
    statusCase.title = 'Click to select a timeline';
    statusCase.style.cursor = 'pointer';
}

function updateSyncStatus(status = sessionState.syncStatus) {
    if (statusLed) {
        statusLed.classList.toggle('connected', status === 'connected');
        statusLed.classList.toggle('disconnected', status === 'failed' || status === 'disconnected');
        statusLed.classList.toggle('warning', status === 'reconnecting' || status === 'rejoining');
    }

    if (!statusLink) return;

    statusLink.classList.remove('warning', 'error');

    if (status === 'connected') {
        statusLink.textContent = 'ACTIVE';
        return;
    }

    if (status === 'rejoining') {
        statusLink.textContent = 'REJOINING';
        statusLink.classList.add('warning');
        return;
    }

    if (status === 'reconnecting') {
        statusLink.textContent = 'RECONNECTING';
        statusLink.classList.add('warning');
        return;
    }

    if (status === 'failed') {
        statusLink.textContent = 'FAILED';
        statusLink.classList.add('error');
        return;
    }

    statusLink.textContent = 'OFFLINE';
    statusLink.classList.add('error');
}

function updateErrorBanner(message = sessionState.lastError) {
    if (!statusAlert || !statusMessage) return;
    const hasMessage = Boolean(message);
    statusAlert.hidden = !hasMessage;
    statusMessage.textContent = message || '';
}

function updateUserCount(count) {
    if (statUsersEl) {
        statUsersEl.textContent = count;
    }
}

export function stampStatusSync() {
    if (!statusSyncEl) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    statusSyncEl.textContent = `${hh}:${mm}:${ss}Z`;
}

export function updateStatusStats(eventCount, hostCount) {
    if (statusEventsEl) statusEventsEl.textContent = eventCount;
    if (statusHostsEl) statusHostsEl.textContent = hostCount;
}

export function resetStatusStats() {
    updateStatusStats(0, 0);
}

export function initStatusBarController({onSelectTimeline, onRetryConnection}) {
    if (initialized) return;
    initialized = true;

    statusLed = document.getElementById('status-led');
    statusLink = document.getElementById('status-link');
    statusCase = document.getElementById('status-case');
    statusEventsEl = document.getElementById('status-events');
    statusHostsEl = document.getElementById('status-hosts');
    statusSyncEl = document.getElementById('status-sync');
    statusAlert = document.getElementById('status-alert');
    statusMessage = document.getElementById('status-message');
    statusRetryBtn = document.getElementById('status-retry');
    statUsersEl = document.getElementById('stat-users');

    if (statusCase) {
        statusCase.addEventListener('click', () => onSelectTimeline());
    }

    if (statusRetryBtn) {
        statusRetryBtn.addEventListener('click', () => onRetryConnection());
    }

    bus.on('connection:changed', (connected) => {
        if (!connected) {
            updateUserCount('--');
        }
    });
    bus.on('usercount:changed', updateUserCount);
    bus.on('syncstatus:changed', updateSyncStatus);
    bus.on('error:changed', updateErrorBanner);
    bus.on('timeline:joined', updateTimelineDisplay);
    bus.on('timeline:updated', updateTimelineDisplay);
    bus.on('timeline:deleted', updateTimelineDisplay);

    updateTimelineDisplay();
    updateSyncStatus();
    updateErrorBanner();
    updateUserCount(state.userCount > 0 ? state.userCount : '--');
}
