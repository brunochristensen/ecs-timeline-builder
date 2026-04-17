/**
 * ECS Timeline Builder - Server
 * Transport layer: Express HTTP + WebSocket message routing.
 * Delegates business logic to EventStore and persistence to file I/O module.
 */

import express from 'express';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventStore } from './server/event-store.js';
import { loadData, saveData } from './server/persistence.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Config
const PORT = process.env.PORT || 12345;
const DATA_FILE = process.env.DATA_FILE || './data/timeline.json';
const SAVE_INTERVAL = 30000;
const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 90000;

// State
const store = new EventStore();
let isDirty = false;

/**
 * Broadcast a message to all connected clients, optionally excluding one (the sender).
 * Serializes the payload once and sends the string to each client.
 *
 * @param {Object} message - Message object to serialize and broadcast
 * @param {WebSocket|null} [excludeWs=null] - Client to skip (typically the sender)
 */
function broadcast(message, excludeWs = null) {
    const msgString = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(msgString);
        }
    });
}

/**
 * Builds a full-state SYNC message payload from the store.
 *
 * @returns {{ type: string, events: Array, annotations: Object }} SYNC message
 */
function buildSyncMessage() {
    return {
        type: 'SYNC',
        events: store.getAll(),
        annotations: store.getAnnotations()
    };
}

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('Client connected. Total clients:', wss.clients.size);

    // Track last pong for heartbeat
    ws.lastPong = Date.now();

    // Send current state to new client
    ws.send(JSON.stringify(buildSyncMessage()));

    // Broadcast user count update
    broadcast({
        type: 'USER_COUNT',
        count: wss.clients.size
    });

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            if (!message.type || typeof message.type !== 'string') {
                console.warn('Received message with missing or invalid type');
                return;
            }

            switch (message.type) {
                case 'ADD_EVENTS': {
                    if (!Array.isArray(message.events)) {
                        console.warn('ADD_EVENTS: missing or invalid events array');
                        break;
                    }
                    const result = store.addEvents(message.events);
                    if (result.added.length > 0) {
                        isDirty = true;
                        broadcast({
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
                    if (!message.eventId || typeof message.eventId !== 'string') {
                        console.warn('DELETE_EVENT: missing or invalid eventId');
                        break;
                    }
                    const removed = store.deleteEvent(message.eventId);
                    if (removed) {
                        isDirty = true;
                        broadcast({ type: 'EVENT_DELETED', eventId: message.eventId });
                    }
                    break;
                }

                case 'CLEAR': {
                    store.clear();
                    isDirty = true;
                    broadcast({ type: 'CLEARED' });
                    break;
                }

                case 'ANNOTATE_EVENT': {
                    if (!message.eventId || typeof message.eventId !== 'string') {
                        console.warn('ANNOTATE_EVENT: missing or invalid eventId');
                        break;
                    }
                    const annotation = store.setAnnotation(message.eventId, {
                        comment: message.comment,
                        mitreTactic: message.mitreTactic,
                        mitreTechnique: message.mitreTechnique
                    });
                    isDirty = true;
                    broadcast({
                        type: 'ANNOTATION_UPDATED',
                        eventId: message.eventId,
                        annotation
                    });
                    break;
                }

                case 'DELETE_ANNOTATION': {
                    if (!message.eventId || typeof message.eventId !== 'string') {
                        console.warn('DELETE_ANNOTATION: missing or invalid eventId');
                        break;
                    }
                    if (store.deleteAnnotation(message.eventId)) {
                        isDirty = true;
                        broadcast({
                            type: 'ANNOTATION_DELETED',
                            eventId: message.eventId
                        });
                    }
                    break;
                }

                case 'REQUEST_SYNC': {
                    ws.send(JSON.stringify(buildSyncMessage()));
                    break;
                }

                case 'PONG': {
                    ws.lastPong = Date.now();
                    break;
                }

                default:
                    console.warn('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Error processing message:', error.message);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected. Total clients:', wss.clients.size);
        broadcast({
            type: 'USER_COUNT',
            count: wss.clients.size
        });
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
    res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        clients: wss.clients.size,
        events: store.length,
        annotations: Object.keys(store.getAnnotations()).length,
        memory: {
            heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024)
        }
    });
});

// API endpoint to get current state
app.get('/api/events', (req, res) => {
    res.json(store.getAll());
});

// Load data on startup
const loaded = await loadData(DATA_FILE);
store.load(loaded.events, loaded.annotations);

// Auto-save interval
setInterval(() => {
    if (isDirty) {
        isDirty = false;
        saveData(DATA_FILE, store.getAll(), store.getAnnotations());
    }
}, SAVE_INTERVAL);

// Heartbeat: ping all clients, terminate stale connections
setInterval(() => {
    const now = Date.now();
    wss.clients.forEach(client => {
        if (client.readyState !== WebSocket.OPEN) return;

        if (now - client.lastPong > HEARTBEAT_TIMEOUT) {
            console.log('Terminating stale client (no pong received)');
            client.terminate();
            return;
        }

        client.send(JSON.stringify({ type: 'PING' }));
    });
}, HEARTBEAT_INTERVAL);

// Save on shutdown
async function shutdown() {
    console.log('\nShutting down...');
    if (isDirty) {
        await saveData(DATA_FILE, store.getAll(), store.getAnnotations());
    }
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`ECS Timeline Builder server running on http://localhost:${PORT}`);
    console.log(`Data file: ${path.resolve(DATA_FILE)}`);
});
