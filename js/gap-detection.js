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

function getEventsById() {
    if (eventsByIdCache) return eventsByIdCache;
    eventsByIdCache = new Map();
    for (const event of state.events) {
        eventsByIdCache.set(event.id, event);
    }
    return eventsByIdCache;
}

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
            const title = `${tactic.id} — ${getTacticName(tactic.id)}${covered ? ' (tagged)' : ' (not tagged)'}`;
            html += `<span class="${chipClass}" title="${escapeHtml(title)}">${escapeHtml(tactic.id)}</span>`;
        }

        html += `
                </div>
            </div>`;
    }

    coverageContent.innerHTML = html;
}

/**
 * Initializes the gap detection module by subscribing to state events.
 */
export function initGapDetection() {
    state.on('events:added', invalidateEventsCache);
    state.on('events:synced', invalidateEventsCache);
    state.on('event:deleted', invalidateEventsCache);
    state.on('events:cleared', invalidateEventsCache);
    state.on('annotation:updated', render);
    state.on('annotation:deleted', render);
    render();
}
