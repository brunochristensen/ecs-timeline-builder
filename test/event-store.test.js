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

        it('should reset annotations', () => {
            const store = new EventStore();
            store.addEvents([{ _id: 'a' }]);
            store.setAnnotation('a', { comment: 'note' });

            store.clear();

            assert.deepStrictEqual(store.getAnnotations(), {});
        });

    });

    describe('setAnnotation()', () => {

        it('should store a new annotation keyed by eventId', () => {
            const store = new EventStore();
            const result = store.setAnnotation('evt-1', {
                comment: 'suspicious login',
                mitreTactic: 'TA0001',
                mitreTechnique: 'T1078'
            });

            assert.strictEqual(result.eventId, 'evt-1');
            assert.strictEqual(result.comment, 'suspicious login');
            assert.strictEqual(result.mitreTactic, 'TA0001');
            assert.strictEqual(result.mitreTechnique, 'T1078');
            assert.ok(typeof result.updatedAt === 'number');
        });

        it('should fill missing fields with empty strings', () => {
            const store = new EventStore();
            const result = store.setAnnotation('evt-1', { comment: 'only a note' });

            assert.strictEqual(result.comment, 'only a note');
            assert.strictEqual(result.mitreTactic, '');
            assert.strictEqual(result.mitreTechnique, '');
        });

        it('should overwrite an existing annotation for the same eventId', () => {
            const store = new EventStore();
            store.setAnnotation('evt-1', { comment: 'first' });
            store.setAnnotation('evt-1', { comment: 'second' });

            const annotations = store.getAnnotations();
            assert.strictEqual(Object.keys(annotations).length, 1);
            assert.strictEqual(annotations['evt-1'].comment, 'second');
        });

        it('should store annotations independently of whether event exists', () => {
            const store = new EventStore();
            store.setAnnotation('phantom', { comment: 'no event yet' });

            const annotations = store.getAnnotations();
            assert.ok('phantom' in annotations);
        });

    });

    describe('deleteAnnotation()', () => {

        it('should remove an existing annotation and return true', () => {
            const store = new EventStore();
            store.setAnnotation('evt-1', { comment: 'note' });

            const result = store.deleteAnnotation('evt-1');

            assert.strictEqual(result, true);
            assert.deepStrictEqual(store.getAnnotations(), {});
        });

        it('should return false for a nonexistent annotation', () => {
            const store = new EventStore();

            const result = store.deleteAnnotation('ghost');

            assert.strictEqual(result, false);
        });

        it('should only remove the targeted annotation', () => {
            const store = new EventStore();
            store.setAnnotation('a', { comment: 'keep' });
            store.setAnnotation('b', { comment: 'delete' });

            store.deleteAnnotation('b');

            const annotations = store.getAnnotations();
            assert.ok('a' in annotations);
            assert.ok(!('b' in annotations));
        });

    });

    describe('deleteEvent() annotation cascade', () => {

        it('should remove the associated annotation when event is deleted', () => {
            const store = new EventStore();
            store.addEvents([{ _id: 'evt-1' }]);
            store.setAnnotation('evt-1', { comment: 'note' });

            store.deleteEvent('evt-1');

            assert.deepStrictEqual(store.getAnnotations(), {});
        });

        it('should leave unrelated annotations intact', () => {
            const store = new EventStore();
            store.addEvents([{ _id: 'a' }, { _id: 'b' }]);
            store.setAnnotation('a', { comment: 'keep' });
            store.setAnnotation('b', { comment: 'delete' });

            store.deleteEvent('b');

            const annotations = store.getAnnotations();
            assert.ok('a' in annotations);
            assert.ok(!('b' in annotations));
        });

    });

    describe('getAnnotations()', () => {

        it('should return an empty object when no annotations exist', () => {
            const store = new EventStore();
            assert.deepStrictEqual(store.getAnnotations(), {});
        });

        it('should return all annotations keyed by eventId', () => {
            const store = new EventStore();
            store.setAnnotation('a', { comment: 'first' });
            store.setAnnotation('b', { comment: 'second' });

            const result = store.getAnnotations();

            assert.strictEqual(Object.keys(result).length, 2);
            assert.strictEqual(result['a'].comment, 'first');
            assert.strictEqual(result['b'].comment, 'second');
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

        it('should load annotations alongside events', () => {
            const store = new EventStore();
            const annotations = {
                'evt-1': { eventId: 'evt-1', comment: 'loaded', mitreTactic: 'TA0001', mitreTechnique: '', updatedAt: 1 }
            };

            store.load([{ _id: 'evt-1' }], annotations);

            assert.strictEqual(store.getAnnotations()['evt-1'].comment, 'loaded');
        });

        it('should default annotations to empty object when omitted', () => {
            const store = new EventStore();
            store.setAnnotation('old', { comment: 'prior' });

            store.load([{ _id: 'new' }]);

            assert.deepStrictEqual(store.getAnnotations(), {});
        });

    });

});
