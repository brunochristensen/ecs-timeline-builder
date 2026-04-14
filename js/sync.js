/**
 * ECS Timeline Builder - WebSocket Sync Module
 * Handles real-time synchronization with server
 */

import { state } from './state.js';

let ws = null;
let reconnectAttempts = 0;
let maxReconnectAttempts = 10;
let reconnectDelay = 1000;
let connectionActive = false;

/**
 * Initializes the WebSocket connection for multi-user synchronization.
 * Automatically connects to the server and sets up reconnection logic.
 */
export function initWebSocketSync() {
    connect();
}

/**
 * Establishes WebSocket connection to the server.
 * Uses secure WebSocket (wss:) for HTTPS pages, standard (ws:) otherwise.
 */
function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    console.log('Connecting to WebSocket:', wsUrl);

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connected');
        connectionActive = true;
        reconnectAttempts = 0;
        state.setConnected(true);
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
        state.setConnected(false);
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
 * Routes incoming WebSocket messages to state manager methods.
 *
 * @param {Object} message - Parsed JSON message from server
 */
function handleMessage(message) {
    switch (message.type) {
        case 'SYNC':
            console.log(`Received sync: ${message.events.length} events`);
            state.setEvents(message.events);
            break;

        case 'EVENTS_ADDED':
            console.log(`Events added by another user: ${message.events.length}`);
            state.addEvents(message.events);
            break;

        case 'ADD_CONFIRMED':
            console.log(`Add confirmed: ${message.count} added, ${message.duplicates} duplicates`);
            break;

        case 'EVENT_DELETED':
            console.log(`Event deleted: ${message.eventId}`);
            state.deleteEvent(message.eventId);
            break;

        case 'CLEARED':
            console.log('Timeline cleared');
            state.clear();
            break;

        case 'USER_COUNT':
            state.setUserCount(message.count);
            break;

        case 'PING':
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'PONG' }));
            }
            break;

        default:
            console.warn('Unknown message type:', message.type);
    }
}

/**
 * Broadcasts new events to the server for distribution to other clients.
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
 * Requests the server to delete a single event by ID.
 *
 * @param {string} eventId - The ID of the event to delete
 * @returns {boolean} True if message was sent, false if not connected
 */
export function sendDeleteToServer(eventId) {
    if (!connectionActive || !ws) {
        console.error('Not connected to server');
        return false;
    }

    ws.send(JSON.stringify({
        type: 'DELETE_EVENT',
        eventId: eventId
    }));

    return true;
}

/**
 * Requests the server to clear the shared timeline state.
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
