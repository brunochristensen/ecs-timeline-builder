const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// config
const PORT = process.env.PORT || 12345;
const DATA_FILE = process.env.DATA_FILE || './data/timeline.json';
const SAVE_INTERVAL = 30000; // Auto-save every 30 seconds if changed

// shared state
let timelineEvents = [];
let isDirty = false;

/**
 * Load timeline data from file
 */
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            timelineEvents = JSON.parse(data);
            console.log(`Loaded ${timelineEvents.length} events from ${DATA_FILE}`);
        } else {
            console.log('No existing data file, starting fresh');
            timelineEvents = [];
        }
    } catch (error) {
        console.error('Error loading data:', error.message);
        timelineEvents = [];
    }
}

/**
 * Save timeline data to file
 */
function saveData() {
    if (!isDirty) return;
    try {
        const dataDir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(timelineEvents, null, 2));
        isDirty = false;
        console.log(`Saved ${timelineEvents.length} events to ${DATA_FILE}`);
    } catch (error) {
        console.error('Error saving data:', error.message);
    }
}

/**
 * Broadcast message to all connected clients except sender
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
 * Broadcast message to all connected clients
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

    // Send current state to new client
    ws.send(JSON.stringify({
        type: 'SYNC',
        events: timelineEvents
    }));

    // Broadcast user count update
    broadcastAll({
        type: 'USER_COUNT',
        count: wss.clients.size
    });

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            switch (message.type) {
                case 'ADD_EVENTS': {
                    // Add new events (with deduplication)
                    const existingIds = new Set(timelineEvents.map(e => e._id || e.id));
                    const newEvents = message.events.filter(e => {
                        const id = e._id || e.id;
                        return !existingIds.has(id);
                    });

                    if (newEvents.length > 0) {
                        timelineEvents = [...timelineEvents, ...newEvents];
                        isDirty = true;

                        // Broadcast to other clients
                        broadcast({
                            type: 'EVENTS_ADDED',
                            events: newEvents
                        }, ws);

                        // Confirm to sender
                        ws.send(JSON.stringify({
                            type: 'ADD_CONFIRMED',
                            count: newEvents.length,
                            duplicates: message.events.length - newEvents.length
                        }));
                    } else {
                        ws.send(JSON.stringify({
                            type: 'ADD_CONFIRMED',
                            count: 0,
                            duplicates: message.events.length
                        }));
                    }
                    break;
                }

                case 'CLEAR': {
                    timelineEvents = [];
                    isDirty = true;

                    // Broadcast to all clients including sender
                    broadcastAll({
                        type: 'CLEARED'
                    });
                    break;
                }

                case 'REQUEST_SYNC': {
                    // Client requesting full state
                    ws.send(JSON.stringify({
                        type: 'SYNC',
                        events: timelineEvents
                    }));
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

        // Broadcast updated user count
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
        events: timelineEvents.length
    });
});

// API endpoint to get current state (for debugging/export)
app.get('/api/events', (req, res) => {
    res.json(timelineEvents);
});

// Load data on startup
loadData();

// Auto-save interval
setInterval(saveData, SAVE_INTERVAL);

// Save on shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    saveData();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down...');
    saveData();
    process.exit(0);
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`ECS Timeline Builder server running on http://0.0.0.0:${PORT}`);
    console.log(`Data file: ${path.resolve(DATA_FILE)}`);
});
