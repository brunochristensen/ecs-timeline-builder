import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

// state.js exports a singleton, so we need to test it carefully.
// We clear state between tests and track emitted events via the bus.

import { state } from '../js/state.js';
import bus from '../js/event-bus.js';

describe('TimelineState', () => {

    beforeEach(() => {
        state.clear();
        state.setConnected(false);
        state.setSyncStatus('disconnected');
        state.clearLastError();
        state.setTimelines([]);
        state.setCurrentTimeline(null);
        state.setUserCount(0);
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
            bus.on('events:added', listener);

            state.addEvents([
                { '@timestamp': '2024-01-15T10:00:00Z', host: { hostname: 'h1' } }
            ]);

            assert.strictEqual(emitted, true);
            bus.off('events:added', listener);
        });

        it('should not emit events:added when all are duplicates', () => {
            state.addEvents([
                { '@timestamp': '2024-01-15T10:00:00Z', host: { hostname: 'h1' }, event: { id: 'dup' } }
            ]);

            let emitted = false;
            const listener = () => { emitted = true; };
            bus.on('events:added', listener);

            state.addEvents([
                { '@timestamp': '2024-01-15T10:00:00Z', host: { hostname: 'h1' }, event: { id: 'dup' } }
            ]);

            assert.strictEqual(emitted, false);
            bus.off('events:added', listener);
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
            bus.on('events:synced', listener);

            state.setEvents([]);

            assert.strictEqual(emitted, true);
            bus.off('events:synced', listener);
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
            bus.on('event:deleted', listener);

            state.deleteEvent('del-me');

            assert.strictEqual(deletedId, 'del-me');
            bus.off('event:deleted', listener);
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
            bus.on('events:cleared', listener);

            state.clear();

            assert.strictEqual(emitted, true);
            bus.off('events:cleared', listener);
        });

    });

    describe('annotations', () => {

        it('should start with an empty annotations map', () => {
            assert.strictEqual(state.annotations.size, 0);
        });

        it('setAnnotation() should store an annotation keyed by eventId', () => {
            state.setAnnotation('evt-1', {
                eventId: 'evt-1',
                comment: 'note',
                mitreTactic: 'TA0001',
                mitreTechnique: 'T1078',
                updatedAt: 1
            });

            assert.strictEqual(state.annotations.size, 1);
            assert.strictEqual(state.annotations.get('evt-1').comment, 'note');
        });

        it('setAnnotation() should emit annotation:updated with eventId and annotation', () => {
            let receivedId = null;
            let receivedAnn = null;
            const listener = (id, ann) => { receivedId = id; receivedAnn = ann; };
            bus.on('annotation:updated', listener);

            const annotation = { eventId: 'evt-1', comment: 'hi', mitreTactic: '', mitreTechnique: '', updatedAt: 1 };
            state.setAnnotation('evt-1', annotation);

            assert.strictEqual(receivedId, 'evt-1');
            assert.strictEqual(receivedAnn, annotation);
            bus.off('annotation:updated', listener);
        });

        it('setAnnotation() should overwrite an existing annotation for the same event', () => {
            state.setAnnotation('evt-1', { eventId: 'evt-1', comment: 'first', mitreTactic: '', mitreTechnique: '', updatedAt: 1 });
            state.setAnnotation('evt-1', { eventId: 'evt-1', comment: 'second', mitreTactic: '', mitreTechnique: '', updatedAt: 2 });

            assert.strictEqual(state.annotations.size, 1);
            assert.strictEqual(state.annotations.get('evt-1').comment, 'second');
        });

        it('deleteAnnotation() should remove an existing annotation and return true', () => {
            state.setAnnotation('evt-1', { eventId: 'evt-1', comment: 'x', mitreTactic: '', mitreTechnique: '', updatedAt: 1 });

            const result = state.deleteAnnotation('evt-1');

            assert.strictEqual(result, true);
            assert.strictEqual(state.annotations.size, 0);
        });

        it('deleteAnnotation() should return false for a nonexistent annotation', () => {
            assert.strictEqual(state.deleteAnnotation('ghost'), false);
        });

        it('deleteAnnotation() should emit annotation:deleted only when an annotation existed', () => {
            let emittedCount = 0;
            const listener = () => { emittedCount++; };
            bus.on('annotation:deleted', listener);

            state.deleteAnnotation('ghost'); // no-op
            state.setAnnotation('evt-1', { eventId: 'evt-1', comment: 'x', mitreTactic: '', mitreTechnique: '', updatedAt: 1 });
            state.deleteAnnotation('evt-1');

            assert.strictEqual(emittedCount, 1);
            bus.off('annotation:deleted', listener);
        });

        it('setEvents() should accept annotations and populate the annotations map', () => {
            state.setEvents(
                [{ '@timestamp': '2024-01-15T10:00:00Z', host: { hostname: 'h1' }, event: { id: 'evt-1' } }],
                { 'evt-1': { eventId: 'evt-1', comment: 'synced', mitreTactic: 'TA0003', mitreTechnique: '', updatedAt: 1 } }
            );

            assert.strictEqual(state.annotations.size, 1);
            assert.strictEqual(state.annotations.get('evt-1').comment, 'synced');
        });

        it('setEvents() should default annotations to empty map when omitted', () => {
            state.setAnnotation('old', { eventId: 'old', comment: 'prior', mitreTactic: '', mitreTechnique: '', updatedAt: 1 });

            state.setEvents([{ '@timestamp': '2024-01-15T10:00:00Z', host: { hostname: 'h1' } }]);

            assert.strictEqual(state.annotations.size, 0);
        });

        it('clear() should reset annotations', () => {
            state.setAnnotation('evt-1', { eventId: 'evt-1', comment: 'x', mitreTactic: '', mitreTechnique: '', updatedAt: 1 });

            state.clear();

            assert.strictEqual(state.annotations.size, 0);
        });

    });

    describe('connection tracking', () => {

        it('should track connected state', () => {
            let received = null;
            const listener = (val) => { received = val; };
            bus.on('connection:changed', listener);

            state.setConnected(true);
            assert.strictEqual(state.connected, true);
            assert.strictEqual(received, true);

            state.setConnected(false);
            assert.strictEqual(state.connected, false);
            assert.strictEqual(received, false);

            bus.off('connection:changed', listener);
        });

        it('should track user count', () => {
            let received = null;
            const listener = (val) => { received = val; };
            bus.on('usercount:changed', listener);

            state.setUserCount(5);
            assert.strictEqual(state.userCount, 5);
            assert.strictEqual(received, 5);

            bus.off('usercount:changed', listener);
        });

    });

    describe('sync lifecycle', () => {

        it('should track sync status and emit syncstatus:changed', () => {
            let received = null;
            const listener = (val) => { received = val; };
            bus.on('syncstatus:changed', listener);

            state.setSyncStatus('reconnecting');

            assert.strictEqual(state.syncStatus, 'reconnecting');
            assert.strictEqual(received, 'reconnecting');
            bus.off('syncstatus:changed', listener);
        });

        it('should track last error and emit error:changed', () => {
            let received = null;
            const listener = (val) => { received = val; };
            bus.on('error:changed', listener);

            state.setLastError('Sync failed');

            assert.strictEqual(state.lastError, 'Sync failed');
            assert.strictEqual(received, 'Sync failed');

            state.clearLastError();
            assert.strictEqual(state.lastError, '');
            bus.off('error:changed', listener);
        });
    });

    describe('timeline metadata', () => {

        it('should update currentTimeline cache when the active timeline is renamed', () => {
            state.setTimelines([{ id: 't1', name: 'Initial', description: '' }]);
            state.setCurrentTimeline('t1');

            state.updateTimelineMeta('t1', { name: 'Renamed' });

            assert.ok(state.currentTimeline);
            assert.strictEqual(state.currentTimeline.name, 'Renamed');
        });

        it('should clear currentTimeline cache when the active timeline is removed', () => {
            state.setTimelines([{ id: 't1', name: 'Initial', description: '' }]);
            state.setCurrentTimeline('t1');

            state.removeTimeline('t1');

            assert.strictEqual(state.currentTimelineId, null);
            assert.strictEqual(state.currentTimeline, null);
        });
    });

});
