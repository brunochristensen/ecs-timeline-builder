/**
 * ECS Timeline Builder - Server
 * Transport layer: Express HTTP + WebSocket message routing.
 * Supports multiple concurrent timelines via TimelineManager.
 */

import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { TimelineManager } from './server/timeline-manager.js';
import { createRoomManager } from './server/websocket/room-manager.js';
import { createMessageRouter } from './server/websocket/message-router.js';
import { sendJson } from './server/websocket/respond.js';
import { startHeartbeat } from './server/websocket/heartbeat.js';
import { WS_MESSAGE_TYPES } from './shared/ws-protocol.js';

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
const roomManager = createRoomManager(wss);
const {
    leaveRoom,
    roomCount
} = roomManager;
const routeMessage = createMessageRouter({manager, roomManager});

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('Client connected. Total clients:', wss.clients.size);

    ws.lastPong = Date.now();
    ws.currentTimeline = null;

    sendJson(ws, {
        type: WS_MESSAGE_TYPES.TIMELINES_LIST,
        timelines: manager.listTimelines()
    });

    ws.on('message', async (data) => routeMessage(ws, data));

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
        rooms: roomCount(),
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

startHeartbeat({
    wss,
    heartbeatTimeout: HEARTBEAT_TIMEOUT,
    heartbeatInterval: HEARTBEAT_INTERVAL,
    leaveRoom
});

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

