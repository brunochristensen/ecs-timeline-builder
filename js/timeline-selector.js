/**
 * ECS Timeline Builder - Timeline Selector
 * Modal UI for listing, creating, and joining timelines.
 */

import bus from './event-bus.js';
import { state } from './state.js';
import { joinTimeline, createTimeline, deleteTimeline } from './sync.js';
import { escapeHtml } from './utils.js';

let selectorElement = null;

/**
 * Initializes the timeline selector. Creates the DOM element and subscribes to bus events.
 * Called automatically on module load (self-wiring).
 */
function init() {
    createSelectorElement();

    bus.on('timelines:changed', renderTimelineList);
    bus.on('timeline:created', renderTimelineList);
    bus.on('timeline:deleted', renderTimelineList);
    bus.on('timeline:joined', hideSelector);
}

/**
 * Shows the timeline selector modal.
 */
export function showSelector() {
    if (!selectorElement) return;
    renderTimelineList();
    selectorElement.hidden = false;
    selectorElement.classList.add('visible');
}

/**
 * Hides the timeline selector modal.
 */
export function hideSelector() {
    if (!selectorElement) return;
    selectorElement.classList.remove('visible');
    setTimeout(() => {
        selectorElement.hidden = true;
    }, 200);
}

/**
 * Returns whether the selector is currently visible.
 */
export function isSelectorVisible() {
    return selectorElement && !selectorElement.hidden;
}

/**
 * Creates the selector DOM element and appends it to the body.
 */
function createSelectorElement() {
    selectorElement = document.createElement('div');
    selectorElement.id = 'timeline-selector';
    selectorElement.className = 'timeline-selector-overlay';
    selectorElement.hidden = true;

    selectorElement.innerHTML = `
        <div class="timeline-selector-modal">
            <div class="timeline-selector-header">
                <h2>Select Timeline</h2>
            </div>
            <div class="timeline-selector-content">
                <div id="timeline-list" class="timeline-list"></div>
                <button id="create-timeline-btn" class="timeline-create-btn">
                    <svg viewBox="0 0 24 24" width="18" height="18">
                        <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                    <span>Create New Timeline</span>
                </button>
            </div>
            <div id="create-timeline-form" class="timeline-create-form" hidden>
                <h3>Create New Timeline</h3>
                <div class="form-group">
                    <label for="new-timeline-name">Name</label>
                    <input type="text" id="new-timeline-name" placeholder="e.g., APT29 Incident - April 2026" maxlength="100">
                </div>
                <div class="form-group">
                    <label for="new-timeline-description">Description (optional)</label>
                    <textarea id="new-timeline-description" placeholder="Brief description of the incident or investigation..." rows="2" maxlength="500"></textarea>
                </div>
                <div class="form-actions">
                    <button id="cancel-create-btn" class="btn-secondary">Cancel</button>
                    <button id="confirm-create-btn" class="btn-primary">Create</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(selectorElement);

    // Event listeners
    const createBtn = selectorElement.querySelector('#create-timeline-btn');
    const createForm = selectorElement.querySelector('#create-timeline-form');
    const cancelBtn = selectorElement.querySelector('#cancel-create-btn');
    const confirmBtn = selectorElement.querySelector('#confirm-create-btn');
    const nameInput = selectorElement.querySelector('#new-timeline-name');
    const descInput = selectorElement.querySelector('#new-timeline-description');

    createBtn.addEventListener('click', () => {
        createBtn.hidden = true;
        createForm.hidden = false;
        nameInput.focus();
    });

    cancelBtn.addEventListener('click', () => {
        createForm.hidden = true;
        createBtn.hidden = false;
        nameInput.value = '';
        descInput.value = '';
    });

    confirmBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (!name) {
            nameInput.focus();
            return;
        }
        const description = descInput.value.trim();
        createTimeline(name, description);

        // Reset form
        createForm.hidden = true;
        createBtn.hidden = false;
        nameInput.value = '';
        descInput.value = '';
    });

    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            confirmBtn.click();
        } else if (e.key === 'Escape') {
            cancelBtn.click();
        }
    });
}

/**
 * Renders the list of available timelines.
 */
function renderTimelineList() {
    const listEl = selectorElement.querySelector('#timeline-list');
    const timelines = state.timelines;

    if (timelines.length === 0) {
        listEl.innerHTML = `
            <div class="timeline-list-empty">
                <p>No timelines yet</p>
                <p class="text-muted">Create one to get started</p>
            </div>
        `;
        return;
    }

    listEl.innerHTML = timelines.map(t => `
        <div class="timeline-item" data-id="${t.id}">
            <div class="timeline-item-info">
                <div class="timeline-item-name">${escapeHtml(t.name)}</div>
                ${t.description ? `<div class="timeline-item-desc">${escapeHtml(t.description)}</div>` : ''}
                <div class="timeline-item-meta">
                    Created ${formatDate(t.createdAt)} · Updated ${formatRelative(t.updatedAt)}
                </div>
            </div>
            <div class="timeline-item-actions">
                <button class="btn-join" data-id="${t.id}" title="Join Timeline">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                        <path fill="currentColor" d="M8 5v14l11-7z"/>
                    </svg>
                </button>
                <button class="btn-delete" data-id="${t.id}" title="Delete Timeline">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                        <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');

    // Attach event listeners
    listEl.querySelectorAll('.btn-join').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const timelineId = btn.dataset.id;
            joinTimeline(timelineId);
            updateUrlWithTimeline(timelineId);
        });
    });

    listEl.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const timelineId = btn.dataset.id;
            const timeline = timelines.find(t => t.id === timelineId);
            if (confirm(`Delete "${timeline?.name || 'this timeline'}"? This cannot be undone.`)) {
                deleteTimeline(timelineId);
            }
        });
    });

    // Click on item row to join
    listEl.querySelectorAll('.timeline-item').forEach(item => {
        item.addEventListener('click', () => {
            const timelineId = item.dataset.id;
            joinTimeline(timelineId);
            updateUrlWithTimeline(timelineId);
        });
    });
}

/**
 * Updates the URL with the timeline ID query parameter.
 */
function updateUrlWithTimeline(timelineId) {
    const url = new URL(window.location);
    url.searchParams.set('timeline', timelineId);
    history.pushState({}, '', url);
}

/**
 * Gets the timeline ID from the URL query parameter.
 */
export function getTimelineIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('timeline');
}

/**
 * Formats a date string to a readable format.
 */
function formatDate(isoString) {
    if (!isoString) return 'unknown';
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Formats a date string to a relative time (e.g., "2 hours ago").
 */
function formatRelative(isoString) {
    if (!isoString) return 'unknown';
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(isoString);
}

// Self-wire on import
init();
