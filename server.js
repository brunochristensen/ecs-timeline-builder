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
import { loadEvents, saveEvents } from './server/persistence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
 * Broadcast message to all connected clients except sender.
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
 * Broadcast message to all connected clients.
 */
function broadcastAll(message) {
    const msgString = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msgString);
        }
    });
}

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('Client connected. Total clients:', wss.clients.size);

    // Track last pong for heartbeat
    ws.lastPong = Date.now();

    // Send current state to new client
    ws.send(JSON.stringify({
        type: 'SYNC',
        events: store.getAll()
    }));

    // Broadcast user count update
    broadcastAll({
        type: 'USER_COUNT',
        count: wss.clients.size
    });

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            if (!message.type || typeof message.type !== 'string') {
                console.warn('Received message with missing or invalid type');
                break;
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
                        broadcastAll({ type: 'EVENT_DELETED', eventId: message.eventId });
                    }
                    break;
                }

                case 'CLEAR': {
                    store.clear();
                    isDirty = true;
                    broadcastAll({ type: 'CLEARED' });
                    break;
                }

                case 'REQUEST_SYNC': {
                    ws.send(JSON.stringify({
                        type: 'SYNC',
                        events: store.getAll()
                    }));
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
        broadcastAll({
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
    res.json({
        status: 'ok',
        clients: wss.clients.size,
        events: store.length
    });
});

// API endpoint to get current state
app.get('/api/events', (req, res) => {
    res.json(store.getAll());
});

// Load data on startup
store.load(loadEvents(DATA_FILE));

// Auto-save interval
setInterval(() => {
    if (isDirty) {
        saveEvents(DATA_FILE, store.getAll());
        isDirty = false;
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
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    if (isDirty) {
        saveEvents(DATA_FILE, store.getAll());
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down...');
    if (isDirty) {
        saveEvents(DATA_FILE, store.getAll());
    }
    process.exit(0);
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`ECS Timeline Builder server running on http://localhost:${PORT}`);
    console.log(`Data file: ${path.resolve(DATA_FILE)}`);
});
