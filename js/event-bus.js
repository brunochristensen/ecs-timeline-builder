/**
 * ECS Timeline Builder - Event Bus
 * Central pub/sub backbone for module communication.
 * Singleton instance — all modules import the same bus.
 */

import { EventEmitter } from './event-emitter.js';

/**
 * Global event bus for decoupled module communication.
 * Modules subscribe via bus.on() and publish via bus.emit().
 *
 * Event catalog:
 * - events:added        — new events parsed and stored
 * - events:synced       — full state replacement from server
 * - event:deleted       — single event removed
 * - events:cleared      — all events cleared
 * - annotation:updated  — annotation added/changed
 * - annotation:deleted  — annotation removed
 * - connection:changed  — WebSocket connected/disconnected
 * - usercount:changed   — connected user count changed
 * - timelines:changed   — timeline list updated
 * - timeline:joined     — joined a timeline
 * - timeline:left       — left a timeline
 * - timeline:deleted    — timeline was deleted
 * - event:selected      — user clicked an event dot
 * - ui:refresh          — request UI refresh
 */
const bus = new EventEmitter();

export default bus;
