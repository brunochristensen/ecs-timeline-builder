/**
 * ECS Timeline Builder - WebSocket Sync Module
 * Handles real-time synchronization with server
 */

let ws = null;
let reconnectAttempts = 0;
let maxReconnectAttempts = 10;
let reconnectDelay = 1000;
let connectionActive = false;

// Callbacks
let onSync = null;
let onEventsAdded = null;
let onCleared = null;
let onUserCount = null;
let onConnectionChange = null;

/**
 * Initializes the WebSocket connection for multi-user synchronization.
 * Automatically connects to the server and sets up reconnection logic.
 *
 * @param {Object} callbacks - Event handlers for sync operations
 * @param {Function} callbacks.onSync - Called with full event array on initial connect/reconnect
 * @param {Function} callbacks.onEventsAdded - Called when another client adds events
 * @param {Function} callbacks.onCleared - Called when any client clears the timeline
 * @param {Function} callbacks.onUserCount - Called with updated connected user count
 * @param {Function} callbacks.onConnectionChange - Called with boolean when connection state changes
 */
export function initWebSocketSync(callbacks) {
    onSync = callbacks.onSync || (() => {
    });
    onEventsAdded = callbacks.onEventsAdded || (() => {
    });
    onCleared = callbacks.onCleared || (() => {
    });
    onUserCount = callbacks.onUserCount || (() => {
    });
    onConnectionChange = callbacks.onConnectionChange || (() => {
    });

    connect();
}

/**
 * Establishes WebSocket connection to the server.
 * Uses secure WebSocket (wss:) for HTTPS pages, standard (ws:) otherwise.
 */
function connect() {
    // Determine WebSocket URL based on current page location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    console.log('Connecting to WebSocket:', wsUrl);

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connected');
        connectionActive = true;
        reconnectAttempts = 0;
        onConnectionChange(true);
    };

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            handleMessage(message);
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        connectionActive = false;
        onConnectionChange(false);
        attemptReconnect();
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

/**
 * Attempts to reconnect after connection loss using exponential backoff.
 * Doubles delay after each attempt up to maxReconnectAttempts.
 */
function attemptReconnect() {
    if (reconnectAttempts >= maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
        return;
    }

    reconnectAttempts++;
    const delay = reconnectDelay * Math.pow(2, reconnectAttempts - 1);

    console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);

    setTimeout(() => {
        if (!connectionActive) {
            connect();
        }
    }, delay);
}

/**
 * Routes incoming WebSocket messages to appropriate callback handlers.
 * Handles SYNC, EVENTS_ADDED, ADD_CONFIRMED, CLEARED, and USER_COUNT message types.
 *
 * @param {Object} message - Parsed JSON message from server
 */
function handleMessage(message) {
    switch (message.type) {
        case 'SYNC':
            // Full state sync from server
            console.log(`Received sync: ${message.events.length} events`);
            onSync(message.events);
            break;

        case 'EVENTS_ADDED':
            // New events from another client
            console.log(`Events added by another user: ${message.events.length}`);
            onEventsAdded(message.events);
            break;

        case 'ADD_CONFIRMED':
            // Server confirmed our add
            console.log(`Add confirmed: ${message.count} added, ${message.duplicates} duplicates`);
            break;

        case 'CLEARED':
            // Timeline was cleared
            console.log('Timeline cleared');
            onCleared();
            break;

        case 'USER_COUNT':
            // Update user count
            onUserCount(message.count);
            break;

        default:
            console.warn('Unknown message type:', message.type);
    }
}

/**
 * Broadcasts new events to the server for distribution to other clients.
 * Events are deduplicated server-side before broadcasting.
 *
 * @param {Array} rawEvents - Array of raw ECS event objects to send
 * @returns {boolean} True if message was sent, false if not connected
 */
export function sendEventsToServer(rawEvents) {
    if (!connectionActive || !ws) {
        console.error('Not connected to server');
        return false;
    }

    ws.send(JSON.stringify({
        type: 'ADD_EVENTS',
        events: rawEvents
    }));

    return true;
}

/**
 * Requests the server to clear the shared timeline state.
 * Server will broadcast CLEARED message to all connected clients.
 *
 * @returns {boolean} True if message was sent, false if not connected
 */
export function sendClearToServer() {
    if (!connectionActive || !ws) {
        console.error('Not connected to server');
        return false;
    }

    ws.send(JSON.stringify({
        type: 'CLEAR'
    }));

    return true;
}

/**
 * Checks if WebSocket connection is currently active.
 *
 * @returns {boolean} True if connected to server
 */
export function isConnected() {
    return connectionActive;
}
