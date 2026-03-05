import { EventEmitter } from './event-emitter.js';
import { parseEvents, buildHostRegistry, identifyConnections } from './parser.js';
import { deduplicateEvents } from './dedup.js';

class TimelineState extends EventEmitter {
    #events = [];
    #hostRegistry = null;
    #connections = [];
    #connected = false;
    #userCount = 0;

    get events() { return this.#events; }
    get hostRegistry() { return this.#hostRegistry; }
    get connections() { return this.#connections; }
    get connected() { return this.#connected; }
    get userCount() { return this.#userCount; }

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

    setEvents(rawEvents) {
        this.#events = rawEvents.length > 0 ? parseEvents(rawEvents) : [];
        this.#rebuild();
        this.emit('events:synced');
    }

    deleteEvent(eventId) {
        const index = this.#events.findIndex(e => e.id === eventId);
        if (index === -1) return null;

        const [removed] = this.#events.splice(index, 1);
        this.#rebuild();
        this.emit('event:deleted', eventId);
        return removed;
    }

    clear() {
        this.#events = [];
        this.#hostRegistry = null;
        this.#connections = [];
        this.emit('events:cleared');
    }

    setConnected(connected) {
        this.#connected = connected;
        this.emit('connection:changed', connected);
    }

    setUserCount(count) {
        this.#userCount = count;
        this.emit('usercount:changed', count);
    }

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
