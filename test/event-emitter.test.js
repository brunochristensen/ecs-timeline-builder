import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from '../js/event-emitter.js';

describe('EventEmitter', () => {

    it('should call listener when event is emitted', () => {
        const emitter = new EventEmitter();
        let called = false;

        emitter.on('test', () => { called = true; });
        emitter.emit('test');

        assert.strictEqual(called, true);
    });

    it('should pass arguments to listeners', () => {
        const emitter = new EventEmitter();
        let received = null;

        emitter.on('data', (value) => { received = value; });
        emitter.emit('data', 42);

        assert.strictEqual(received, 42);
    });

    it('should pass multiple arguments to listeners', () => {
        const emitter = new EventEmitter();
        let args = [];

        emitter.on('multi', (a, b, c) => { args = [a, b, c]; });
        emitter.emit('multi', 1, 'two', true);

        assert.deepStrictEqual(args, [1, 'two', true]);
    });

    it('should support multiple listeners for the same event', () => {
        const emitter = new EventEmitter();
        let count = 0;

        emitter.on('inc', () => { count++; });
        emitter.on('inc', () => { count++; });
        emitter.emit('inc');

        assert.strictEqual(count, 2);
    });

    it('should not call listeners for different events', () => {
        const emitter = new EventEmitter();
        let called = false;

        emitter.on('a', () => { called = true; });
        emitter.emit('b');

        assert.strictEqual(called, false);
    });

    it('should remove a specific listener with off()', () => {
        const emitter = new EventEmitter();
        let count = 0;

        const listener = () => { count++; };
        emitter.on('test', listener);
        emitter.emit('test');
        assert.strictEqual(count, 1);

        emitter.off('test', listener);
        emitter.emit('test');
        assert.strictEqual(count, 1); // not called again
    });

    it('should only remove the specified listener, not others', () => {
        const emitter = new EventEmitter();
        let aCount = 0;
        let bCount = 0;

        const listenerA = () => { aCount++; };
        const listenerB = () => { bCount++; };

        emitter.on('test', listenerA);
        emitter.on('test', listenerB);
        emitter.off('test', listenerA);
        emitter.emit('test');

        assert.strictEqual(aCount, 0);
        assert.strictEqual(bCount, 1);
    });

    it('should handle emit with no listeners gracefully', () => {
        const emitter = new EventEmitter();
        // Should not throw
        emitter.emit('nonexistent', 'data');
    });

    it('should handle off() for event with no listeners', () => {
        const emitter = new EventEmitter();
        // Should not throw
        emitter.off('nonexistent', () => {});
    });

});
