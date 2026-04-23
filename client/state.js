import bus from './event-bus.js';
import {EVENTS} from './events.js';
import {parseEvents} from './parser.js';
import {deduplicateEvents} from '../shared/dedup.js';
import {getConnections, getHostRegistry, invalidateTimelineSelectors} from './selectors/timeline-selectors.js';

/**
 * Centralized timeline/domain state store. Holds canonical timeline data:
 * events, annotations, timeline metadata, and active timeline selection.
 */
class TimelineState {
    #events = [];
    #annotations = new Map();
    #timelines = [];
    #currentTimelineId = null;
    #currentTimelineCache = null;

    /** @returns {Array} Parsed event objects */
    get events() {
        return this.#events;
    }

    /** @returns {Object|null} Host registry with getHostList()/getEventsForHost()/resolveIp() */
    get hostRegistry() {
        return getHostRegistry(this.#events);
    }

    /** @returns {Array} Cross-host connection objects */
    get connections() {
        return getConnections(this.#events);
    }

    /** @returns {Map<string, Object>} Map of eventId to annotation */
    get annotations() {
        return this.#annotations;
    }

    /** @returns {Array} Available timelines */
    get timelines() {
        return this.#timelines;
    }

    /** @returns {string|null} Currently joined timeline ID */
    get currentTimelineId() {
        return this.#currentTimelineId;
    }

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
            return {parsed: 0, added: [], duplicates: 0};
        }

        const unique = deduplicateEvents(parsed, this.#events);
        if (unique.length === 0) {
            return {parsed: parsed.length, added: [], duplicates: parsed.length};
        }

        this.#events = [...this.#events, ...unique];
        invalidateTimelineSelectors();
        bus.emit(EVENTS.EVENTS_ADDED, unique);
        return {parsed: parsed.length, added: unique, duplicates: parsed.length - unique.length};
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
        invalidateTimelineSelectors();
        bus.emit(EVENTS.EVENTS_SYNCED);
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

        const removed = this.#events[index];
        this.#events = this.#events.filter(event => event.id !== eventId);
        this.#annotations.delete(eventId);
        invalidateTimelineSelectors();
        bus.emit(EVENTS.EVENT_DELETED, eventId);
        return removed;
    }

    /**
     * Reset all state to empty. Emits `events:cleared`.
     */
    clear() {
        this.#events = [];
        this.#annotations = new Map();
        invalidateTimelineSelectors();
        bus.emit(EVENTS.EVENTS_CLEARED);
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
        bus.emit(EVENTS.ANNOTATION_UPDATED, eventId, annotation);
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
        bus.emit(EVENTS.ANNOTATION_DELETED, eventId);
        return true;
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
        bus.emit(EVENTS.TIMELINES_CHANGED, timelines);
    }

    /**
     * Add a new timeline to the list.
     * Emits `timeline:created`.
     *
     * @param {Object} timeline - Timeline metadata
     */
    addTimeline(timeline) {
        this.#timelines.push(timeline);
        this.#updateCurrentTimelineCache();
        bus.emit(EVENTS.TIMELINE_CREATED, timeline);
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
        this.#timelines[index] = {...this.#timelines[index], ...updates};
        this.#updateCurrentTimelineCache();
        bus.emit(EVENTS.TIMELINE_UPDATED, this.#timelines[index]);
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
        this.#updateCurrentTimelineCache();
        bus.emit(EVENTS.TIMELINE_DELETED, id);
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
        bus.emit(EVENTS.TIMELINE_JOINED, timelineId);
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
        this.#annotations = new Map();
        invalidateTimelineSelectors();
    }

}

export const state = new TimelineState();
