/**
 * ECS Timeline Builder - Server
 * Transport layer: Express HTTP + WebSocket message routing.
 * Supports multiple concurrent timelines via TimelineManager.
 */

import express from 'express';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { TimelineManager } from './server/timeline-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Config
const PORT = process.env.PORT || 12345;
const SAVE_INTERVAL = 30000;
const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 90000;

// State
const manager = new TimelineManager();
const rooms = new Map();  // timelineId → Set<WebSocket>

/**
 * Broadcast a message to all clients in a specific timeline room.
 */
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

/**
 * Broadcast a message to ALL connected clients (for timeline list updates).
 */
function broadcastToAll(message, excludeWs = null) {
    const msgString = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(msgString);
        }
    });
}

/**
 * Adds a client to a timeline room.
 */
function joinRoom(ws, timelineId) {
    if (ws.currentTimeline) {
        leaveRoom(ws, ws.currentTimeline);
    }

    if (!rooms.has(timelineId)) {
        rooms.set(timelineId, new Set());
    }
    rooms.get(timelineId).add(ws);
    ws.currentTimeline = timelineId;

    broadcastToRoom(timelineId, {
        type: 'USER_COUNT',
        count: rooms.get(timelineId).size
    });

    return rooms.get(timelineId).size;
}

/**
 * Removes a client from a timeline room.
 */
function leaveRoom(ws, timelineId) {
    const room = rooms.get(timelineId);
    if (room) {
        room.delete(ws);
        broadcastToRoom(timelineId, {
            type: 'USER_COUNT',
            count: room.size
        });
        if (room.size === 0) {
            rooms.delete(timelineId);
        }
    }
    ws.currentTimeline = null;
}

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('Client connected. Total clients:', wss.clients.size);

    ws.lastPong = Date.now();
    ws.currentTimeline = null;

    ws.send(JSON.stringify({
        type: 'TIMELINES_LIST',
        timelines: manager.listTimelines()
    }));

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);
            if (!message.type || typeof message.type !== 'string') {
                ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid message: missing type' }));
                return;
            }

            switch (message.type) {
                case 'LIST_TIMELINES': {
                    ws.send(JSON.stringify({
                        type: 'TIMELINES_LIST',
                        timelines: manager.listTimelines()
                    }));
                    break;
                }

                case 'CREATE_TIMELINE': {
                    const timeline = await manager.createTimeline(
                        message.name,
                        message.description || ''
                    );
                    broadcastToAll({
                        type: 'TIMELINE_CREATED',
                        timeline
                    });
                    break;
                }

                case 'UPDATE_TIMELINE': {
                    if (!message.timelineId) {
                        ws.send(JSON.stringify({ type: 'ERROR', message: 'UPDATE_TIMELINE: missing timelineId' }));
                        break;
                    }
                    const updated = await manager.updateTimeline(message.timelineId, {
                        name: message.name,
                        description: message.description
                    });
                    if (updated) {
                        broadcastToAll({
                            type: 'TIMELINE_UPDATED',
                            timeline: updated
                        });
                    }
                    break;
                }

                case 'DELETE_TIMELINE': {
                    if (!message.timelineId) {
                        ws.send(JSON.stringify({ type: 'ERROR', message: 'DELETE_TIMELINE: missing timelineId' }));
                        break;
                    }
                    const deleted = await manager.deleteTimeline(message.timelineId);
                    if (deleted) {
                        const room = rooms.get(message.timelineId);
                        if (room) {
                            for (const client of room) {
                                client.send(JSON.stringify({
                                    type: 'TIMELINE_DELETED',
                                    timelineId: message.timelineId
                                }));
                                client.currentTimeline = null;
                            }
                            rooms.delete(message.timelineId);
                        }
                        broadcastToAll({
                            type: 'TIMELINE_DELETED',
                            timelineId: message.timelineId
                        });
                    }
                    break;
                }

                case 'JOIN_TIMELINE': {
                    if (!message.timelineId) {
                        ws.send(JSON.stringify({ type: 'ERROR', message: 'JOIN_TIMELINE: missing timelineId' }));
                        break;
                    }
                    const store = await manager.getStore(message.timelineId);
                    if (!store) {
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            message: 'Timeline not found'
                        }));
                        break;
                    }
                    const userCount = joinRoom(ws, message.timelineId);
                    ws.send(JSON.stringify({
                        type: 'JOINED_TIMELINE',
                        timelineId: message.timelineId,
                        events: store.getAll(),
                        annotations: store.getAnnotations(),
                        userCount
                    }));
                    break;
                }

                case 'LEAVE_TIMELINE': {
                    if (ws.currentTimeline) {
                        const timelineId = ws.currentTimeline;
                        leaveRoom(ws, timelineId);
                        ws.send(JSON.stringify({
                            type: 'LEFT_TIMELINE',
                            timelineId
                        }));
                    }
                    break;
                }

                case 'ADD_EVENTS': {
                    if (!ws.currentTimeline) {
                        ws.send(JSON.stringify({ type: 'ERROR', message: 'ADD_EVENTS: not in a timeline' }));
                        break;
                    }
                    if (!Array.isArray(message.events)) {
                        ws.send(JSON.stringify({ type: 'ERROR', message: 'ADD_EVENTS: events must be an array' }));
                        break;
                    }
                    const validEvents = message.events.filter(e => e && typeof e === 'object');
                    if (validEvents.length === 0) {
                        ws.send(JSON.stringify({ type: 'ERROR', message: 'ADD_EVENTS: no valid event objects' }));
                        break;
                    }
                    const store = await manager.getStore(ws.currentTimeline);
                    if (!store) break;

                    const result = store.addEvents(validEvents);
                    if (result.added.length > 0) {
                        manager.markDirty(ws.currentTimeline);
                        broadcastToRoom(ws.currentTimeline, {
                            type: 'EVENTS_ADDED',
                            events: result.added
                        }, ws);
                    }
                    ws.send(JSON.stringify({
                        type: 'ADD_CONFIRMED',
                        count: result.added.length,
                        duplicates: result.duplicates
                    }));
                    break;
                }

                case 'DELETE_EVENT': {
                    if (!ws.currentTimeline) {
                        ws.send(JSON.stringify({ type: 'ERROR', message: 'DELETE_EVENT: not in a timeline' }));
                        break;
                    }
                    if (!message.eventId || typeof message.eventId !== 'string') {
                        ws.send(JSON.stringify({ type: 'ERROR', message: 'DELETE_EVENT: invalid eventId' }));
                        break;
                    }
                    const store = await manager.getStore(ws.currentTimeline);
                    if (!store) break;

                    const removed = store.deleteEvent(message.eventId);
                    if (removed) {
                        manager.markDirty(ws.currentTimeline);
                        broadcastToRoom(ws.currentTimeline, {
                            type: 'EVENT_DELETED',
                            eventId: message.eventId
                        });
                    }
                    break;
                }

                case 'CLEAR': {
                    if (!ws.currentTimeline) {
                        ws.send(JSON.stringify({ type: 'ERROR', message: 'CLEAR: not in a timeline' }));
                        break;
                    }
                    const store = await manager.getStore(ws.currentTimeline);
                    if (!store) break;

                    store.clear();
                    manager.markDirty(ws.currentTimeline);
                    broadcastToRoom(ws.currentTimeline, { type: 'CLEARED' });
                    break;
                }

                case 'ANNOTATE_EVENT': {
                    if (!ws.currentTimeline) {
                        ws.send(JSON.stringify({ type: 'ERROR', message: 'ANNOTATE_EVENT: not in a timeline' }));
                        break;
                    }
                    if (!message.eventId || typeof message.eventId !== 'string') {
                        ws.send(JSON.stringify({ type: 'ERROR', message: 'ANNOTATE_EVENT: invalid eventId' }));
                        break;
                    }
                    const store = await manager.getStore(ws.currentTimeline);
                    if (!store) break;

                    const annotation = store.setAnnotation(message.eventId, {
                        comment: message.comment,
                        mitreTactic: message.mitreTactic,
                        mitreTechnique: message.mitreTechnique
                    });
                    manager.markDirty(ws.currentTimeline);
                    broadcastToRoom(ws.currentTimeline, {
                        type: 'ANNOTATION_UPDATED',
                        eventId: message.eventId,
                        annotation
                    });
                    break;
                }

                case 'DELETE_ANNOTATION': {
                    if (!ws.currentTimeline) {
                        ws.send(JSON.stringify({ type: 'ERROR', message: 'DELETE_ANNOTATION: not in a timeline' }));
                        break;
                    }
                    if (!message.eventId || typeof message.eventId !== 'string') {
                        ws.send(JSON.stringify({ type: 'ERROR', message: 'DELETE_ANNOTATION: invalid eventId' }));
                        break;
                    }
                    const store = await manager.getStore(ws.currentTimeline);
                    if (!store) break;

                    if (store.deleteAnnotation(message.eventId)) {
                        manager.markDirty(ws.currentTimeline);
                        broadcastToRoom(ws.currentTimeline, {
                            type: 'ANNOTATION_DELETED',
                            eventId: message.eventId
                        });
                    }
                    break;
                }

                case 'REQUEST_SYNC': {
                    if (!ws.currentTimeline) {
                        ws.send(JSON.stringify({
                            type: 'SYNC',
                            events: [],
                            annotations: {}
                        }));
                        break;
                    }
                    const store = await manager.getStore(ws.currentTimeline);
                    ws.send(JSON.stringify({
                        type: 'SYNC',
                        events: store ? store.getAll() : [],
                        annotations: store ? store.getAnnotations() : {}
                    }));
                    break;
                }

                case 'PONG': {
                    ws.lastPong = Date.now();
                    break;
                }

                default:
                    console.warn('Unknown message type:', message.type);
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        message: `Unknown message type: ${message.type}`
                    }));
            }
        } catch (error) {
            console.error('Error processing message:', error.message);
            ws.send(JSON.stringify({
                type: 'ERROR',
                message: `Failed to process message: ${error.message}`
            }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected. Total clients:', wss.clients.size);
        if (ws.currentTimeline) {
            leaveRoom(ws, ws.currentTimeline);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error.message);
    });
});

// Serve static files
app.use(express.static(path.join(__dirname)));

// Health check endpoint
app.get('/health', (req, res) => {
    const mem = process.memoryUsage();
    const timelines = manager.listTimelines();
    const loadedStores = manager.getLoadedStoreIds();

    res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        clients: wss.clients.size,
        timelines: timelines.length,
        loadedStores: loadedStores.length,
        rooms: rooms.size,
        memory: {
            heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024)
        }
    });
});

// API endpoint to list timelines
app.get('/api/timelines', (req, res) => {
    res.json(manager.listTimelines());
});

// API endpoint to get events for a specific timeline
app.get('/api/timelines/:id/events', async (req, res) => {
    const store = await manager.getStore(req.params.id);
    if (!store) {
        res.status(404).json({ error: 'Timeline not found' });
        return;
    }
    res.json(store.getAll());
});

// Initialize and start
await manager.initialize();

// Auto-save interval
setInterval(async () => {
    const saved = await manager.saveAll();
    if (saved > 0) {
        console.log(`Auto-saved ${saved} timeline(s)`);
    }
}, SAVE_INTERVAL);

// Heartbeat: ping all clients, terminate stale connections
setInterval(() => {
    const now = Date.now();
    wss.clients.forEach(client => {
        if (client.readyState !== WebSocket.OPEN) return;

        if (now - client.lastPong > HEARTBEAT_TIMEOUT) {
            console.log('Terminating stale client (no pong received)');
            if (client.currentTimeline) {
                leaveRoom(client, client.currentTimeline);
            }
            client.terminate();
            return;
        }

        client.send(JSON.stringify({ type: 'PING' }));
    });
}, HEARTBEAT_INTERVAL);

// Save on shutdown
async function shutdown() {
    console.log('\nShutting down...');
    await manager.saveAll();
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`ECS Timeline Builder server running on http://localhost:${PORT}`);
    console.log(`Timelines: ${manager.listTimelines().length}`);
});
