import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getId, deduplicateEvents } from '../js/dedup.js';

describe('Deduplication', () => {

    describe('getId()', () => {

        it('should return _id when present', () => {
            assert.strictEqual(getId({ _id: 'es-123', id: 'other' }), 'es-123');
        });

        it('should fall back to id when _id is absent', () => {
            assert.strictEqual(getId({ id: 'fallback-456' }), 'fallback-456');
        });

        it('should return undefined when neither _id nor id exists', () => {
            assert.strictEqual(getId({}), undefined);
        });

    });

    describe('deduplicateEvents()', () => {

        it('should return all events when no duplicates exist', () => {
            const newEvents = [{ id: 'a' }, { id: 'b' }];
            const existing = [{ id: 'c' }];

            const result = deduplicateEvents(newEvents, existing);
            assert.strictEqual(result.length, 2);
        });

        it('should filter out events that already exist', () => {
            const newEvents = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
            const existing = [{ id: 'b' }];

            const result = deduplicateEvents(newEvents, existing);
            assert.strictEqual(result.length, 2);
            assert.ok(result.some(e => e.id === 'a'));
            assert.ok(result.some(e => e.id === 'c'));
        });

        it('should return empty array when all events are duplicates', () => {
            const newEvents = [{ id: 'a' }, { id: 'b' }];
            const existing = [{ id: 'a' }, { id: 'b' }];

            const result = deduplicateEvents(newEvents, existing);
            assert.strictEqual(result.length, 0);
        });

        it('should handle empty new events array', () => {
            const result = deduplicateEvents([], [{ id: 'a' }]);
            assert.strictEqual(result.length, 0);
        });

        it('should handle empty existing events array', () => {
            const newEvents = [{ id: 'a' }, { id: 'b' }];
            const result = deduplicateEvents(newEvents, []);
            assert.strictEqual(result.length, 2);
        });

        it('should use _id for deduplication when present', () => {
            const newEvents = [{ _id: 'es-1', id: 'local-1' }];
            const existing = [{ _id: 'es-1', id: 'local-2' }];

            const result = deduplicateEvents(newEvents, existing);
            assert.strictEqual(result.length, 0);
        });

    });

});
