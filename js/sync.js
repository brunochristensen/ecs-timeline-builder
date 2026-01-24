/**
 * ECS Timeline Builder - WebSocket Sync Module
 * Handles real-time synchronization with server
 */

const TimelineSync = (function() {
    'use strict';

    let ws = null;
    let reconnectAttempts = 0;
    let maxReconnectAttempts = 10;
    let reconnectDelay = 1000;
    let isConnected = false;

    // Callbacks
    let onSync = null;
    let onEventsAdded = null;
    let onCleared = null;
    let onUserCount = null;
    let onConnectionChange = null;

    /**
     * Initialize WebSocket connection
     */
    function init(callbacks) {
        onSync = callbacks.onSync || (() => {});
        onEventsAdded = callbacks.onEventsAdded || (() => {});
        onCleared = callbacks.onCleared || (() => {});
        onUserCount = callbacks.onUserCount || (() => {});
        onConnectionChange = callbacks.onConnectionChange || (() => {});

        connect();
    }

    /**
     * Connect to WebSocket server
     */
    function connect() {
        // Determine WebSocket URL based on current page location
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        console.log('Connecting to WebSocket:', wsUrl);

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('WebSocket connected');
            isConnected = true;
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
            isConnected = false;
            onConnectionChange(false);
            attemptReconnect();
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    /**
     * Attempt to reconnect with exponential backoff
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
            if (!isConnected) {
                connect();
            }
        }, delay);
    }

    /**
     * Handle incoming WebSocket messages
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
     * Send events to server
     */
    function addEvents(rawEvents) {
        if (!isConnected || !ws) {
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
     * Request timeline clear
     */
    function clear() {
        if (!isConnected || !ws) {
            console.error('Not connected to server');
            return false;
        }

        ws.send(JSON.stringify({
            type: 'CLEAR'
        }));

        return true;
    }

    /**
     * Request full sync from server
     */
    function requestSync() {
        if (!isConnected || !ws) {
            console.error('Not connected to server');
            return false;
        }

        ws.send(JSON.stringify({
            type: 'REQUEST_SYNC'
        }));

        return true;
    }

    /**
     * Check if connected
     */
    function connected() {
        return isConnected;
    }

    return {
        init,
        addEvents,
        clear,
        requestSync,
        connected
    };

})();
