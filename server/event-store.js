/**
 * ECS Timeline Builder - Event Store
 * Business logic layer: state management, deduplication, CRD operations.
 * No knowledge of WebSocket, HTTP, or file I/O.
 */

import { deduplicateEvents, getId } from '../shared/dedup.js';

export class EventStore {
    #events = [];
    #annotations = {};

    /**
     * Adds new events to the store, deduplicating against existing events.
     *
     * @param {Array} newEvents - Raw event objects to add
     * @returns {{ added: Array, duplicates: number }} Result of the operation
     */
    addEvents(newEvents) {
        const unique = deduplicateEvents(newEvents, this.#events);
        if (unique.length > 0) {
            this.#events.push(...unique);
        }
        return { added: unique, duplicates: newEvents.length - unique.length };
    }

    /**
     * Removes a single event by its ID. Also removes any associated annotation.
     *
     * @param {string} eventId - The _id or id of the event to remove
     * @returns {Object|null} The removed event, or null if not found
     */
    deleteEvent(eventId) {
        const index = this.#events.findIndex(e => getId(e) === eventId);
        if (index === -1) return null;
        const [removed] = this.#events.splice(index, 1);
        delete this.#annotations[eventId];
        return removed;
    }

    /**
     * Sets or updates an annotation for an event.
     *
     * @param {string} eventId - The event ID to annotate
     * @param {Object} annotation - { comment, mitreTactic, mitreTechnique }
     * @returns {Object} The stored annotation
     */
    setAnnotation(eventId, annotation) {
        this.#annotations[eventId] = {
            eventId,
            comment: annotation.comment || '',
            mitreTactic: annotation.mitreTactic || '',
            mitreTechnique: annotation.mitreTechnique || '',
            updatedAt: Date.now()
        };
        return this.#annotations[eventId];
    }

    /**
     * Removes an annotation for an event.
     *
     * @param {string} eventId - The event ID whose annotation to remove
     * @returns {boolean} True if annotation existed and was removed
     */
    deleteAnnotation(eventId) {
        if (!(eventId in this.#annotations)) return false;
        delete this.#annotations[eventId];
        return true;
    }

    /**
     * Returns all annotations as a plain object keyed by eventId.
     *
     * @returns {Object}
     */
    getAnnotations() {
        return structuredClone(this.#annotations);
    }

    /**
     * Clears all events and annotations from the store.
     */
    clear() {
        this.#events = [];
        this.#annotations = {};
    }

    /**
     * Returns all events in the store.
     *
     * @returns {Array} The events array
     */
    getAll() {
        return structuredClone(this.#events);
    }

    /**
     * Returns the number of events in the store.
     *
     * @returns {number}
     */
    get length() {
        return this.#events.length;
    }

    /**
     * Loads events and annotations into the store, replacing any existing state.
     *
     * @param {Array} events - Events to load
     * @param {Object} [annotations={}] - Annotations to load
     */
    load(events, annotations = {}) {
        this.#events = structuredClone(events);
        this.#annotations = structuredClone(annotations);
    }
}
