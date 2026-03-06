import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

// state.js exports a singleton, so we need to test it carefully.
// We clear state between tests and track emitted events.

import { state } from '../js/state.js';

describe('TimelineState', () => {

    beforeEach(() => {
        state.clear();
        // Remove any leftover listeners from previous tests
    });

    describe('addEvents()', () => {

        it('should parse and add events from raw objects', () => {
            const result = state.addEvents([
                { '@timestamp': '2024-01-15T10:00:00Z', host: { hostname: 'host1' } }
            ]);

            assert.strictEqual(result.parsed, 1);
            assert.strictEqual(result.added.length, 1);
            assert.strictEqual(result.duplicates, 0);
            assert.strictEqual(state.events.length, 1);
        });

        it('should parse events from JSON string input', () => {
            const json = JSON.stringify([
                { '@timestamp': '2024-01-15T10:00:00Z', host: { hostname: 'host1' } }
            ]);

            const result = state.addEvents(json);

            assert.strictEqual(result.parsed, 1);
            assert.strictEqual(result.added.length, 1);
        });

        it('should deduplicate against existing state', () => {
            state.addEvents([
                { '@timestamp': '2024-01-15T10:00:00Z', host: { hostname: 'h1' }, event: { id: 'ev1' } }
            ]);

            const result = state.addEvents([
                { '@timestamp': '2024-01-15T10:00:00Z', host: { hostname: 'h1' }, event: { id: 'ev1' } }
            ]);

            assert.strictEqual(result.added.length, 0);
            assert.strictEqual(result.duplicates, 1);
            assert.strictEqual(state.events.length, 1);
        });

        it('should return parsed: 0 for events with no valid timestamps', () => {
            const result = state.addEvents([{ host: { hostname: 'h1' } }]);

            assert.strictEqual(result.parsed, 0);
            assert.strictEqual(result.added.length, 0);
        });

        it('should emit events:added when events are added', () => {
            let emitted = false;
            const listener = () => { emitted = true; };
            state.on('events:added', listener);

            state.addEvents([
                { '@timestamp': '2024-01-15T10:00:00Z', host: { hostname: 'h1' } }
            ]);

            assert.strictEqual(emitted, true);
            state.off('events:added', listener);
        });

        it('should not emit events:added when all are duplicates', () => {
            state.addEvents([
                { '@timestamp': '2024-01-15T10:00:00Z', host: { hostname: 'h1' }, event: { id: 'dup' } }
            ]);

            let emitted = false;
            const listener = () => { emitted = true; };
            state.on('events:added', listener);

            state.addEvents([
                { '@timestamp': '2024-01-15T10:00:00Z', host: { hostname: 'h1' }, event: { id: 'dup' } }
            ]);

            assert.strictEqual(emitted, false);
            state.off('events:added', listener);
        });

        it('should rebuild hostRegistry and connections after adding', () => {
            state.addEvents([
                { '@timestamp': '2024-01-15T10:00:00Z', host: { hostname: 'server1', ip: '10.0.0.1' } }
            ]);

            assert.ok(state.hostRegistry);
            assert.strictEqual(state.hostRegistry.getHostList().length, 1);
        });

    });

    describe('setEvents()', () => {

        it('should replace all events with parsed input', () => {
            state.addEvents([
                { '@timestamp': '2024-01-15T10:00:00Z', host: { hostname: 'old' } }
            ]);

            state.setEvents([
                { '@timestamp': '2024-01-15T11:00:00Z', host: { hostname: 'new1' } },
                { '@timestamp': '2024-01-15T12:00:00Z', host: { hostname: 'new2' } }
            ]);

            assert.strictEqual(state.events.length, 2);
        });

        it('should emit events:synced', () => {
            let emitted = false;
            const listener = () => { emitted = true; };
            state.on('events:synced', listener);

            state.setEvents([]);

            assert.strictEqual(emitted, true);
            state.off('events:synced', listener);
        });

        it('should handle empty array (clear via sync)', () => {
            state.addEvents([
                { '@timestamp': '2024-01-15T10:00:00Z', host: { hostname: 'h1' } }
            ]);

            state.setEvents([]);

            assert.strictEqual(state.events.length, 0);
            assert.strictEqual(state.hostRegistry, null);
        });

    });

    describe('deleteEvent()', () => {

        it('should remove an event by id and rebuild', () => {
            state.addEvents([
                { '@timestamp': '2024-01-15T10:00:00Z', host: { hostname: 'h1' }, event: { id: 'keep' } },
                { '@timestamp': '2024-01-15T11:00:00Z', host: { hostname: 'h2' }, event: { id: 'remove' } }
            ]);

            const toRemove = state.events.find(e => e.id === 'remove');
            assert.ok(toRemove, 'Should find event to remove');

            const removed = state.deleteEvent('remove');

            assert.ok(removed);
            assert.strictEqual(state.events.length, 1);
            assert.strictEqual(state.events[0].id, 'keep');
        });

        it('should emit event:deleted with the event id', () => {
            state.addEvents([
                { '@timestamp': '2024-01-15T10:00:00Z', host: { hostname: 'h1' }, event: { id: 'del-me' } }
            ]);

            let deletedId = null;
            const listener = (id) => { deletedId = id; };
            state.on('event:deleted', listener);

            state.deleteEvent('del-me');

            assert.strictEqual(deletedId, 'del-me');
            state.off('event:deleted', listener);
        });

        it('should return null for nonexistent event id', () => {
            const result = state.deleteEvent('ghost');
            assert.strictEqual(result, null);
        });

    });

    describe('clear()', () => {

        it('should reset all state', () => {
            state.addEvents([
                { '@timestamp': '2024-01-15T10:00:00Z', host: { hostname: 'h1' } }
            ]);

            state.clear();

            assert.strictEqual(state.events.length, 0);
            assert.strictEqual(state.hostRegistry, null);
            assert.deepStrictEqual(state.connections, []);
        });

        it('should emit events:cleared', () => {
            let emitted = false;
            const listener = () => { emitted = true; };
            state.on('events:cleared', listener);

            state.clear();

            assert.strictEqual(emitted, true);
            state.off('events:cleared', listener);
        });

    });

    describe('connection tracking', () => {

        it('should track connected state', () => {
            let received = null;
            const listener = (val) => { received = val; };
            state.on('connection:changed', listener);

            state.setConnected(true);
            assert.strictEqual(state.connected, true);
            assert.strictEqual(received, true);

            state.setConnected(false);
            assert.strictEqual(state.connected, false);
            assert.strictEqual(received, false);

            state.off('connection:changed', listener);
        });

        it('should track user count', () => {
            let received = null;
            const listener = (val) => { received = val; };
            state.on('usercount:changed', listener);

            state.setUserCount(5);
            assert.strictEqual(state.userCount, 5);
            assert.strictEqual(received, 5);

            state.off('usercount:changed', listener);
        });

    });

});
