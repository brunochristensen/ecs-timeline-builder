/**
 * ECS Timeline Builder - Event Store
 * Business logic layer: state management, deduplication, CRD operations.
 * No knowledge of WebSocket, HTTP, or file I/O.
 */

import { deduplicateEvents, getId } from '../js/dedup.js';

export class EventStore {
    #events = [];

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
     * Removes a single event by its ID.
     *
     * @param {string} eventId - The _id or id of the event to remove
     * @returns {Object|null} The removed event, or null if not found
     */
    deleteEvent(eventId) {
        const index = this.#events.findIndex(e => getId(e) === eventId);
        if (index === -1) return null;
        const [removed] = this.#events.splice(index, 1);
        return removed;
    }

    /**
     * Clears all events from the store.
     */
    clear() {
        this.#events = [];
    }

    /**
     * Returns all events in the store.
     *
     * @returns {Array} The events array
     */
    getAll() {
        return this.#events;
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
     * Loads events into the store, replacing any existing state.
     *
     * @param {Array} events - Events to load
     */
    load(events) {
        this.#events = events;
    }
}
