import bus from './event-bus.js';
import { state } from './state.js';
import { TACTICS, getTacticName } from './mitre.js';
import { escapeHtml } from './utils.js';

/**
 * Gap Detection — per-host MITRE ATT&CK tactic coverage indicator.
 *
 * Reads annotation state and cross-references against events to produce
 * a Map<hostname, Set<tacticId>>. Renders a collapsible per-host view in
 * the sidebar showing which tactics have been tagged and which are missing.
 */

const coverageContent = document.getElementById('coverage-content');

let eventsByIdCache = null;

/**
 * Lazily build and memoize a `Map<eventId, event>` for annotation lookups.
 * Invalidated whenever the event list changes.
 *
 * @returns {Map<string, Object>} Map keyed by stable event ID
 */
function getEventsById() {
    if (eventsByIdCache) return eventsByIdCache;
    eventsByIdCache = new Map();
    for (const event of state.events) {
        eventsByIdCache.set(event.id, event);
    }
    return eventsByIdCache;
}

/**
 * Drop the memoized events-by-id map and re-render the coverage panel.
 * Called when state events mutate the event list.
 */
function invalidateEventsCache() {
    eventsByIdCache = null;
    render();
}

/**
 * Builds a per-host tactic coverage map from current state.
 *
 * @returns {Map<string, Set<string>>} hostname → set of tagged tactic IDs
 */
function buildCoverage() {
    const coverage = new Map();
    const eventsById = getEventsById();

    for (const event of state.events) {
        const host = event.host && event.host.hostname;
        if (host && host !== 'Unknown' && !coverage.has(host)) {
            coverage.set(host, new Set());
        }
    }

    for (const [eventId, annotation] of state.annotations) {
        if (!annotation.mitreTactic) continue;
        const event = eventsById.get(eventId);
        if (!event) continue;
        const host = event.host && event.host.hostname;
        if (!host || host === 'Unknown') continue;
        if (!coverage.has(host)) coverage.set(host, new Set());
        coverage.get(host).add(annotation.mitreTactic);
    }

    return coverage;
}

/**
 * Renders the coverage panel into the sidebar.
 */
function render() {
    if (!coverageContent) return;

    const coverage = buildCoverage();

    if (coverage.size === 0) {
        coverageContent.innerHTML = '<div class="coverage-empty">No events to analyze</div>';
        return;
    }

    const hosts = Array.from(coverage.keys()).sort();
    let html = '';

    for (const host of hosts) {
        const tagged = coverage.get(host);
        const hostClass = tagged.size === 0 ? 'coverage-host host-no-annotations' : 'coverage-host';
        const countLabel = `${tagged.size}/${TACTICS.length}`;

        html += `
            <div class="${hostClass}">
                <div class="coverage-host-header">
                    <span class="coverage-host-name" title="${escapeHtml(host)}">${escapeHtml(host)}</span>
                    <span class="coverage-host-count">${countLabel}</span>
                </div>
                <div class="coverage-tactics">`;

        for (const tactic of TACTICS) {
            const covered = tagged.has(tactic.id);
            const chipClass = covered ? 'tactic-chip covered' : 'tactic-chip missing';
            const title = `${tactic.id} · ${getTacticName(tactic.id)}${covered ? ' · tagged' : ' · gap'}`;
            html += `<span class="${chipClass}" title="${escapeHtml(title)}"></span>`;
        }

        html += `
                </div>
            </div>`;
    }

    coverageContent.innerHTML = html;
}

/**
 * Initializes the gap detection module by subscribing to bus events.
 * Called automatically on module load (self-wiring).
 */
function init() {
    bus.on('events:added', invalidateEventsCache);
    bus.on('events:synced', invalidateEventsCache);
    bus.on('event:deleted', invalidateEventsCache);
    bus.on('events:cleared', invalidateEventsCache);
    bus.on('annotation:updated', render);
    bus.on('annotation:deleted', render);
    render();
}

// Self-wire on import
init();
