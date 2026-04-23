import WebSocket from 'ws';
import {WS_MESSAGE_TYPES} from '../../shared/ws-protocol.js';

/**
 * Build helpers for room membership and room-scoped broadcasts.
 *
 * @param {WebSocket.Server} wss - Active WebSocket server
 * @returns {Object} Room management helpers
 */
export function createRoomManager(wss) {
    const rooms = new Map();

    function broadcastToRoom(timelineId, message, excludeWs = null) {
        const room = rooms.get(timelineId);
        if (!room) return;

        const msgString = JSON.stringify(message);
        for (const client of room) {
            if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
                client.send(msgString);
            }
        }
    }

    function broadcastToAll(message, excludeWs = null) {
        const msgString = JSON.stringify(message);
        wss.clients.forEach(client => {
            if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
                client.send(msgString);
            }
        });
    }

    function joinRoom(ws, timelineId) {
        if (ws.currentTimeline) {
            leaveRoom(ws, ws.currentTimeline);
        }

        if (!rooms.has(timelineId)) {
            rooms.set(timelineId, new Set());
        }

        const room = rooms.get(timelineId);
        room.add(ws);
        ws.currentTimeline = timelineId;

        broadcastToRoom(timelineId, {
            type: WS_MESSAGE_TYPES.USER_COUNT,
            count: room.size
        });

        return room.size;
    }

    function leaveRoom(ws, timelineId) {
        const room = rooms.get(timelineId);
        if (room) {
            room.delete(ws);
            broadcastToRoom(timelineId, {
                type: WS_MESSAGE_TYPES.USER_COUNT,
                count: room.size
            });

            if (room.size === 0) {
                rooms.delete(timelineId);
            }
        }

        ws.currentTimeline = null;
    }

    function clearTimelineRoom(timelineId) {
        const room = rooms.get(timelineId);
        if (!room) return 0;

        for (const client of room) {
            client.currentTimeline = null;
        }

        const count = room.size;
        rooms.delete(timelineId);
        return count;
    }

    function roomCount() {
        return rooms.size;
    }

    return {
        broadcastToRoom,
        broadcastToAll,
        joinRoom,
        leaveRoom,
        clearTimelineRoom,
        roomCount
    };
}
