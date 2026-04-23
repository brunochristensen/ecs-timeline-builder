import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import { state } from '../js/state.js';

class FakeWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
    static instances = [];

    constructor(url) {
        this.url = url;
        this.readyState = FakeWebSocket.OPEN;
        this.sent = [];
        this.onopen = null;
        this.onclose = null;
        this.onmessage = null;
        this.onerror = null;
        FakeWebSocket.instances.push(this);
    }

    send(message) {
        this.sent.push(JSON.parse(message));
    }

    close() {
        this.readyState = FakeWebSocket.CLOSED;
        if (typeof this.onclose === 'function') {
            this.onclose();
        }
    }

    emitOpen() {
        if (typeof this.onopen === 'function') {
            this.onopen();
        }
    }

    emitClose() {
        this.readyState = FakeWebSocket.CLOSED;
        if (typeof this.onclose === 'function') {
            this.onclose();
        }
    }
}

const originalWindow = global.window;
const originalWebSocket = global.WebSocket;
const originalSetTimeout = global.setTimeout;

function resetState() {
    state.clear();
    state.setConnected(false);
    state.setSyncStatus('disconnected');
    state.clearLastError();
    state.setTimelines([]);
    state.setCurrentTimeline(null);
    state.setUserCount(0);
}

beforeEach(() => {
    resetState();
    FakeWebSocket.instances = [];
    global.window = {
        location: {
            protocol: 'http:',
            host: 'localhost:12345'
        }
    };
    global.WebSocket = FakeWebSocket;
});

afterEach(() => {
    resetState();
    FakeWebSocket.instances = [];
    global.window = originalWindow;
    global.WebSocket = originalWebSocket;
    global.setTimeout = originalSetTimeout;
});

describe('sync module reconnect behavior', () => {
    it('rejoins the active timeline on initial socket open', async () => {
        state.setCurrentTimeline('timeline-1');

        await import(`../js/sync.js?test=${Date.now()}-${Math.random()}`);

        assert.strictEqual(FakeWebSocket.instances.length, 1);

        const socket = FakeWebSocket.instances[0];
        socket.emitOpen();

        assert.strictEqual(state.connected, true);
        assert.strictEqual(state.syncStatus, 'rejoining');
        assert.deepStrictEqual(socket.sent, [
            { type: 'JOIN_TIMELINE', timelineId: 'timeline-1' }
        ]);
    });

    it('rejoins the active timeline again after a disconnect and reconnect', async () => {
        state.setCurrentTimeline('timeline-2');
        global.setTimeout = (callback) => {
            callback();
            return 1;
        };

        await import(`../js/sync.js?test=${Date.now()}-${Math.random()}`);

        const firstSocket = FakeWebSocket.instances[0];
        firstSocket.emitOpen();

        assert.deepStrictEqual(firstSocket.sent, [
            { type: 'JOIN_TIMELINE', timelineId: 'timeline-2' }
        ]);

        firstSocket.emitClose();

        assert.strictEqual(state.connected, false);
        assert.strictEqual(state.syncStatus, 'reconnecting');
        assert.strictEqual(FakeWebSocket.instances.length, 2);

        const secondSocket = FakeWebSocket.instances[1];
        secondSocket.emitOpen();

        assert.strictEqual(state.connected, true);
        assert.strictEqual(state.syncStatus, 'rejoining');
        assert.deepStrictEqual(secondSocket.sent, [
            { type: 'JOIN_TIMELINE', timelineId: 'timeline-2' }
        ]);
    });
});
