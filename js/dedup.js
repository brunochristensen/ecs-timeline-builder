/**
 * ECS Timeline Builder - Shared Deduplication Module
 * Used by both server (event-store.js) and client (app.js)
 */

/**
 * Extracts the unique identifier from an event.
 * Prefers _id (Elasticsearch document ID) over id (parser-generated).
 *
 * @param {Object} event - Raw or parsed event object
 * @returns {string|undefined} The event's unique identifier
 */
export function getId(event) {
    return event._id || event.id;
}

/**
 * Filters out events that already exist in the existing set.
 * Uses _id (Elasticsearch document ID) as the primary key,
 * falling back to id (parser-generated) if _id is absent.
 *
 * @param {Array} newEvents - Events to check for duplicates
 * @param {Array} existingEvents - Events already in the store
 * @returns {Array} Only the events from newEvents that are not duplicates
 */
export function deduplicateEvents(newEvents, existingEvents) {
    const existingIds = new Set(existingEvents.map(getId));
    return newEvents.filter(e => !existingIds.has(getId(e)));
}
