import bus from './event-bus.js';
import { parseEvents, buildHostRegistry, identifyConnections } from './parser.js';
import { deduplicateEvents } from '../shared/dedup.js';

/**
 * Centralized timeline state store. Single source of truth for events, annotations,
 * timeline metadata, and connection status. Emits state changes to the global event bus.
 */
class TimelineState {
    #events = [];
    #hostRegistry = null;
    #connections = [];
    #annotations = new Map();
    #connected = false;
    #userCount = 0;
    #timelines = [];
    #currentTimelineId = null;
    #currentTimelineCache = null;

    /** @returns {Array} Parsed event objects */
    get events() { return this.#events; }
    /** @returns {Object|null} Host registry with getHostList()/getEventsForHost()/resolveIp() */
    get hostRegistry() { return this.#hostRegistry; }
    /** @returns {Array} Cross-host connection objects */
    get connections() { return this.#connections; }
    /** @returns {Map<string, Object>} Map of eventId to annotation */
    get annotations() { return this.#annotations; }
    /** @returns {boolean} WebSocket connection status */
    get connected() { return this.#connected; }
    /** @returns {number} Connected user count from server */
    get userCount() { return this.#userCount; }
    /** @returns {Array} Available timelines */
    get timelines() { return this.#timelines; }
    /** @returns {string|null} Currently joined timeline ID */
    get currentTimelineId() { return this.#currentTimelineId; }
    /** @returns {Object|null} Currently joined timeline metadata */
    get currentTimeline() {
        return this.#currentTimelineCache;
    }

    /**
     * Parse raw input, deduplicate against existing events, and add new ones.
     * Emits `events:added` with the array of newly added events.
     *
     * @param {string|Array} rawInput - JSON string, NDJSON, or array of raw events
     * @returns {{parsed: number, added: Array, duplicates: number}} Ingestion result
     */
    addEvents(rawInput) {
        const parsed = parseEvents(rawInput);
        if (parsed.length === 0) {
            return { parsed: 0, added: [], duplicates: 0 };
        }

        const unique = deduplicateEvents(parsed, this.#events);
        if (unique.length === 0) {
            return { parsed: parsed.length, added: [], duplicates: parsed.length };
        }

        this.#events = [...this.#events, ...unique];
        this.#rebuild();
        bus.emit('events:added', unique);
        return { parsed: parsed.length, added: unique, duplicates: parsed.length - unique.length };
    }

    /**
     * Replace all state with a full sync payload from the server.
     * Emits `events:synced`.
     *
     * @param {Array} rawEvents - Raw event objects from the server
     * @param {Object} [annotations={}] - Annotation object keyed by eventId
     */
    setEvents(rawEvents, annotations = {}) {
        this.#events = rawEvents.length > 0 ? parseEvents(rawEvents) : [];
        this.#annotations = new Map(Object.entries(annotations));
        this.#rebuild();
        bus.emit('events:synced');
    }

    /**
     * Delete an event by ID. Cascades to its annotation.
     * Emits `event:deleted` with the eventId.
     *
     * @param {string} eventId - ID of the event to remove
     * @returns {Object|null} The removed event, or null if not found
     */
    deleteEvent(eventId) {
        const index = this.#events.findIndex(e => e.id === eventId);
        if (index === -1) return null;

        const [removed] = this.#events.splice(index, 1);
        this.#annotations.delete(eventId);
        this.#rebuild();
        bus.emit('event:deleted', eventId);
        return removed;
    }

    /**
     * Reset all state to empty. Emits `events:cleared`.
     */
    clear() {
        this.#events = [];
        this.#hostRegistry = null;
        this.#connections = [];
        this.#annotations = new Map();
        bus.emit('events:cleared');
    }

    /**
     * Add or update an annotation for the given event.
     * Emits `annotation:updated` with (eventId, annotation).
     *
     * @param {string} eventId - Event to annotate
     * @param {Object} annotation - { comment, mitreTactic, mitreTechnique, updatedAt }
     */
    setAnnotation(eventId, annotation) {
        this.#annotations.set(eventId, annotation);
        bus.emit('annotation:updated', eventId, annotation);
    }

    /**
     * Remove an annotation by event ID.
     * Emits `annotation:deleted` with the eventId if the annotation existed.
     *
     * @param {string} eventId - Event whose annotation to remove
     * @returns {boolean} True if an annotation was deleted, false if none existed
     */
    deleteAnnotation(eventId) {
        if (!this.#annotations.has(eventId)) return false;
        this.#annotations.delete(eventId);
        bus.emit('annotation:deleted', eventId);
        return true;
    }

    /**
     * Update WebSocket connection status. No-ops if the value hasn't changed.
     * Emits `connection:changed` with the boolean.
     *
     * @param {boolean} connected - Whether the WebSocket is currently connected
     */
    setConnected(connected) {
        if (this.#connected === connected) return;
        this.#connected = connected;
        bus.emit('connection:changed', connected);
    }

    /**
     * Update the connected user count. No-ops if the value hasn't changed.
     * Emits `usercount:changed` with the count.
     *
     * @param {number} count - Number of connected users
     */
    setUserCount(count) {
        if (this.#userCount === count) return;
        this.#userCount = count;
        bus.emit('usercount:changed', count);
    }

    /**
     * Set the list of available timelines.
     * Emits `timelines:changed` only if the list actually changed.
     *
     * @param {Array} timelines - Array of timeline metadata objects
     */
    setTimelines(timelines) {
        if (JSON.stringify(this.#timelines) === JSON.stringify(timelines)) return;
        this.#timelines = timelines;
        this.#updateCurrentTimelineCache();
        bus.emit('timelines:changed', timelines);
    }

    /**
     * Add a new timeline to the list.
     * Emits `timeline:created`.
     *
     * @param {Object} timeline - Timeline metadata
     */
    addTimeline(timeline) {
        this.#timelines.push(timeline);
        bus.emit('timeline:created', timeline);
    }

    /**
     * Update a timeline's metadata in the list.
     * Emits `timeline:updated`.
     *
     * @param {string} id - Timeline ID
     * @param {Object} updates - Updated timeline metadata
     */
    updateTimelineMeta(id, updates) {
        const index = this.#timelines.findIndex(t => t.id === id);
        if (index === -1) return;
        this.#timelines[index] = { ...this.#timelines[index], ...updates };
        bus.emit('timeline:updated', this.#timelines[index]);
    }

    /**
     * Remove a timeline from the list.
     * Emits `timeline:deleted`.
     *
     * @param {string} id - Timeline ID to remove
     */
    removeTimeline(id) {
        const index = this.#timelines.findIndex(t => t.id === id);
        if (index === -1) return;
        this.#timelines.splice(index, 1);
        if (this.#currentTimelineId === id) {
            this.#currentTimelineId = null;
        }
        bus.emit('timeline:deleted', id);
    }

    /**
     * Set the currently joined timeline.
     * Emits `timeline:joined`.
     *
     * @param {string} timelineId - Timeline ID
     */
    setCurrentTimeline(timelineId) {
        this.#currentTimelineId = timelineId;
        this.#updateCurrentTimelineCache();
        bus.emit('timeline:joined', timelineId);
    }

    #updateCurrentTimelineCache() {
        this.#currentTimelineCache = this.#currentTimelineId
            ? this.#timelines.find(t => t.id === this.#currentTimelineId) || null
            : null;
    }

    /**
     * Clear local state when switching timelines (before receiving new data).
     * Does NOT emit events:cleared to avoid triggering UI updates meant for user-initiated clears.
     */
    clearForTimelineSwitch() {
        this.#events = [];
        this.#hostRegistry = null;
        this.#connections = [];
        this.#annotations = new Map();
    }

    /** Rebuild host registry and connections from the current event list. */
    #rebuild() {
        if (this.#events.length > 0) {
            this.#hostRegistry = buildHostRegistry(this.#events);
            this.#connections = identifyConnections(this.#events, this.#hostRegistry);
        } else {
            this.#hostRegistry = null;
            this.#connections = [];
        }
    }

    /**
     * Subscribe to state events via the global bus.
     * @param {string} event - Event name
     * @param {Function} listener - Callback
     */
    on(event, listener) {
        bus.on(event, listener);
    }

    /**
     * Unsubscribe from state events.
     * @param {string} event - Event name
     * @param {Function} listener - Callback to remove
     */
    off(event, listener) {
        bus.off(event, listener);
    }
}

export const state = new TimelineState();
