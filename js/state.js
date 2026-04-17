import { EventEmitter } from './event-emitter.js';
import { parseEvents, buildHostRegistry, identifyConnections } from './parser.js';
import { deduplicateEvents } from '../shared/dedup.js';

/**
 * Centralized timeline state store. Single source of truth for events, annotations,
 * and connection status. Modules subscribe via inherited EventEmitter methods.
 */
class TimelineState extends EventEmitter {
    #events = [];
    #hostRegistry = null;
    #connections = [];
    #annotations = new Map();
    #connected = false;
    #userCount = 0;

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
        this.emit('events:added', unique);
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
        this.emit('events:synced');
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
        this.emit('event:deleted', eventId);
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
        this.emit('events:cleared');
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
        this.emit('annotation:updated', eventId, annotation);
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
        this.emit('annotation:deleted', eventId);
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
        this.emit('connection:changed', connected);
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
        this.emit('usercount:changed', count);
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
}

export const state = new TimelineState();
