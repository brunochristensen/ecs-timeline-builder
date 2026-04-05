import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EventStore } from '../server/event-store.js';

describe('EventStore', () => {

    describe('addEvents()', () => {

        it('should add events to the store', () => {
            const store = new EventStore();
            const result = store.addEvents([{ _id: 'a' }, { _id: 'b' }]);

            assert.strictEqual(result.added.length, 2);
            assert.strictEqual(result.duplicates, 0);
            assert.strictEqual(store.length, 2);
        });

        it('should deduplicate against existing events', () => {
            const store = new EventStore();
            store.addEvents([{ _id: 'a' }, { _id: 'b' }]);

            const result = store.addEvents([{ _id: 'b' }, { _id: 'c' }]);

            assert.strictEqual(result.added.length, 1);
            assert.strictEqual(result.duplicates, 1);
            assert.strictEqual(store.length, 3);
        });

        it('should return zero added for all duplicates', () => {
            const store = new EventStore();
            store.addEvents([{ _id: 'a' }]);

            const result = store.addEvents([{ _id: 'a' }]);

            assert.strictEqual(result.added.length, 0);
            assert.strictEqual(result.duplicates, 1);
            assert.strictEqual(store.length, 1);
        });

    });

    describe('deleteEvent()', () => {

        it('should remove an event by _id', () => {
            const store = new EventStore();
            store.addEvents([{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }]);

            const removed = store.deleteEvent('b');

            assert.ok(removed);
            assert.strictEqual(removed._id, 'b');
            assert.strictEqual(store.length, 2);
        });

        it('should return null for nonexistent event', () => {
            const store = new EventStore();
            store.addEvents([{ _id: 'a' }]);

            const removed = store.deleteEvent('nonexistent');

            assert.strictEqual(removed, null);
            assert.strictEqual(store.length, 1);
        });

    });

    describe('clear()', () => {

        it('should remove all events', () => {
            const store = new EventStore();
            store.addEvents([{ _id: 'a' }, { _id: 'b' }]);

            store.clear();

            assert.strictEqual(store.length, 0);
            assert.deepStrictEqual(store.getAll(), []);
        });

    });

    describe('getAll()', () => {

        it('should return all stored events', () => {
            const store = new EventStore();
            store.addEvents([{ _id: 'x' }, { _id: 'y' }]);

            const all = store.getAll();
            assert.strictEqual(all.length, 2);
        });

    });

    describe('load()', () => {

        it('should replace store contents', () => {
            const store = new EventStore();
            store.addEvents([{ _id: 'old' }]);

            store.load([{ _id: 'new1' }, { _id: 'new2' }]);

            assert.strictEqual(store.length, 2);
            assert.strictEqual(store.getAll()[0]._id, 'new1');
        });

    });

});
