import { describe, it } from 'node:test';
import assert from 'node:assert';
import WebSocket from 'ws';
import { createRoomManager } from '../server/websocket/room-manager.js';

function createClient() {
    return {
        readyState: WebSocket.OPEN,
        currentTimeline: null,
        sent: [],
        send(message) {
            this.sent.push(JSON.parse(message));
        }
    };
}

describe('room-manager', () => {
    it('joins, broadcasts user counts, and leaves rooms', () => {
        const clientA = createClient();
        const clientB = createClient();
        const wss = { clients: new Set([clientA, clientB]) };
        const manager = createRoomManager(wss);

        const firstCount = manager.joinRoom(clientA, 'timeline-1');
        const secondCount = manager.joinRoom(clientB, 'timeline-1');

        assert.strictEqual(firstCount, 1);
        assert.strictEqual(secondCount, 2);
        assert.strictEqual(clientA.currentTimeline, 'timeline-1');
        assert.strictEqual(clientB.currentTimeline, 'timeline-1');
        assert.deepStrictEqual(clientA.sent.at(-1), { type: 'USER_COUNT', count: 2 });
        assert.deepStrictEqual(clientB.sent.at(-1), { type: 'USER_COUNT', count: 2 });

        manager.leaveRoom(clientB, 'timeline-1');

        assert.strictEqual(clientB.currentTimeline, null);
        assert.deepStrictEqual(clientA.sent.at(-1), { type: 'USER_COUNT', count: 1 });
        assert.strictEqual(manager.roomCount(), 1);
    });

    it('broadcasts to all connected clients', () => {
        const clientA = createClient();
        const clientB = createClient();
        const wss = { clients: new Set([clientA, clientB]) };
        const manager = createRoomManager(wss);

        manager.broadcastToAll({ type: 'PING' });

        assert.deepStrictEqual(clientA.sent[0], { type: 'PING' });
        assert.deepStrictEqual(clientB.sent[0], { type: 'PING' });
    });

    it('clears a timeline room and detaches currentTimeline from members', () => {
        const clientA = createClient();
        const clientB = createClient();
        const wss = { clients: new Set([clientA, clientB]) };
        const manager = createRoomManager(wss);

        manager.joinRoom(clientA, 'timeline-2');
        manager.joinRoom(clientB, 'timeline-2');

        const cleared = manager.clearTimelineRoom('timeline-2');

        assert.strictEqual(cleared, 2);
        assert.strictEqual(clientA.currentTimeline, null);
        assert.strictEqual(clientB.currentTimeline, null);
        assert.strictEqual(manager.roomCount(), 0);
    });
});
