/**
 * ECS Timeline Builder - WebSocket Sync Module
 * Handles real-time synchronization with server
 */

import { state } from './state.js';

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 1000;

let ws = null;
let reconnectAttempts = 0;
let connectionActive = false;

function buildReconnectErrorMessage() {
    return `Sync unavailable after ${MAX_RECONNECT_ATTEMPTS} reconnect attempts.`;
}

/**
 * Initializes the WebSocket connection for multi-user synchronization.
 * Called automatically on module load (self-wiring).
 */
function init() {
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
        state.setConnected(true);
        state.clearLastError();

        if (state.currentTimelineId) {
            state.setSyncStatus('rejoining');
            send({ type: 'JOIN_TIMELINE', timelineId: state.currentTimelineId });
        } else {
            state.setSyncStatus('connected');
        }

        reconnectAttempts = 0;
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
        state.setSyncStatus('reconnecting');
        attemptReconnect();
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

/**
 * Attempts to reconnect after connection loss using exponential backoff.
 * Doubles delay after each attempt up to MAX_RECONNECT_ATTEMPTS.
 */
function attemptReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('Max reconnection attempts reached');
        state.setSyncStatus('failed');
        state.setLastError(buildReconnectErrorMessage());
        return;
    }

    reconnectAttempts++;
    const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts - 1);

    console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

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
        case 'TIMELINES_LIST':
            console.log(`Received ${message.timelines.length} timeline(s)`);
            state.setTimelines(message.timelines);
            if (!state.currentTimelineId) {
                state.setSyncStatus('connected');
            }
            break;

        case 'TIMELINE_CREATED':
            console.log(`Timeline created: ${message.timeline.name}`);
            state.addTimeline(message.timeline);
            break;

        case 'TIMELINE_UPDATED':
            console.log(`Timeline updated: ${message.timeline.name}`);
            state.updateTimelineMeta(message.timeline.id, message.timeline);
            break;

        case 'TIMELINE_DELETED':
            console.log(`Timeline deleted: ${message.timelineId}`);
            state.removeTimeline(message.timelineId);
            break;

        case 'JOINED_TIMELINE':
            console.log(`Joined timeline: ${message.timelineId} (${message.events.length} events)`);
            state.clearForTimelineSwitch();
            state.setCurrentTimeline(message.timelineId);
            state.setEvents(message.events, message.annotations || {});
            state.setUserCount(typeof message.userCount === 'number' ? message.userCount : state.userCount);
            state.setSyncStatus('connected');
            break;

        case 'LEFT_TIMELINE':
            console.log(`Left timeline: ${message.timelineId}`);
            state.clearForTimelineSwitch();
            state.setSyncStatus('connected');
            break;

        case 'SYNC':
            console.log(`Received sync: ${message.events.length} events`);
            state.setEvents(message.events, message.annotations || {});
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

        case 'ANNOTATION_UPDATED':
            state.setAnnotation(message.eventId, message.annotation);
            break;

        case 'ANNOTATION_DELETED':
            state.deleteAnnotation(message.eventId);
            break;

        case 'PING':
            send({ type: 'PONG' });
            break;

        case 'ERROR':
            console.error('Server error:', message.message);
            state.setLastError(message.message || 'Server error');
            break;

        default:
            console.warn('Unknown message type:', message.type);
    }
}

/**
 * Sends a message to the server if the connection is open.
 *
 * @param {Object} message - Message object to serialize and send
 * @returns {boolean} True if the message was sent, false if not connected
 */
function send(message) {
    if (!connectionActive || !ws || ws.readyState !== WebSocket.OPEN) {
        return false;
    }
    ws.send(JSON.stringify(message));
    return true;
}

/**
 * Broadcasts new events to the server for distribution to other clients.
 *
 * @param {Array} rawEvents - Array of raw ECS event objects to send
 * @returns {boolean} True if message was sent, false if not connected
 */
export function sendEventsToServer(rawEvents) {
    return send({ type: 'ADD_EVENTS', events: rawEvents });
}

/**
 * Requests the server to delete a single event by ID.
 *
 * @param {string} eventId - The ID of the event to delete
 * @returns {boolean} True if message was sent, false if not connected
 */
export function sendDeleteToServer(eventId) {
    return send({ type: 'DELETE_EVENT', eventId });
}

/**
 * Requests the server to clear the shared timeline state.
 *
 * @returns {boolean} True if message was sent, false if not connected
 */
export function sendClearToServer() {
    return send({ type: 'CLEAR' });
}

/**
 * Sends an annotation to the server for broadcast to other clients.
 *
 * @param {string} eventId - The event ID to annotate
 * @param {Object} annotation - { comment, mitreTactic, mitreTechnique }
 * @returns {boolean} True if message was sent
 */
export function sendAnnotationToServer(eventId, annotation) {
    return send({
        type: 'ANNOTATE_EVENT',
        eventId,
        comment: annotation.comment || '',
        mitreTactic: annotation.mitreTactic || '',
        mitreTechnique: annotation.mitreTechnique || ''
    });
}

/**
 * Requests the server to delete an annotation.
 *
 * @param {string} eventId - The event ID whose annotation to delete
 * @returns {boolean} True if message was sent
 */
export function sendDeleteAnnotationToServer(eventId) {
    return send({ type: 'DELETE_ANNOTATION', eventId });
}

/**
 * Checks if WebSocket connection is currently active.
 *
 * @returns {boolean} True if connected to server
 */
export function isConnected() {
    return connectionActive;
}

/**
 * Requests the server to send the list of available timelines.
 *
 * @returns {boolean} True if message was sent
 */
export function requestTimelineList() {
    return send({ type: 'LIST_TIMELINES' });
}

/**
 * Creates a new timeline on the server.
 *
 * @param {string} name - Timeline name
 * @param {string} [description=''] - Optional description
 * @returns {boolean} True if message was sent
 */
export function createTimeline(name, description = '') {
    return send({ type: 'CREATE_TIMELINE', name, description });
}

/**
 * Joins a specific timeline.
 *
 * @param {string} timelineId - ID of the timeline to join
 * @returns {boolean} True if message was sent
 */
export function joinTimeline(timelineId) {
    state.clearLastError();
    state.setSyncStatus('rejoining');
    return send({ type: 'JOIN_TIMELINE', timelineId });
}

/**
 * Leaves the current timeline.
 *
 * @returns {boolean} True if message was sent
 */
export function leaveTimeline() {
    return send({ type: 'LEAVE_TIMELINE' });
}

/**
 * Deletes a timeline from the server.
 *
 * @param {string} timelineId - ID of the timeline to delete
 * @returns {boolean} True if message was sent
 */
export function deleteTimeline(timelineId) {
    return send({ type: 'DELETE_TIMELINE', timelineId });
}

/**
 * Updates a timeline's metadata.
 *
 * @param {string} timelineId - ID of the timeline to update
 * @param {Object} updates - { name?, description? }
 * @returns {boolean} True if message was sent
 */
export function updateTimeline(timelineId, updates) {
    return send({ type: 'UPDATE_TIMELINE', timelineId, ...updates });
}

/**
 * Retry connection after a terminal reconnect failure.
 */
export function retryConnection() {
    reconnectAttempts = 0;
    state.clearLastError();
    state.setSyncStatus('reconnecting');

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
        return;
    }

    connect();
}

// Self-wire on import
init();
