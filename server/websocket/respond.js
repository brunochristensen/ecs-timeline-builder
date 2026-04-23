import {WS_MESSAGE_TYPES} from '../../shared/ws-protocol.js';

/**
 * Send a JSON message to a WebSocket client.
 *
 * @param {import('ws').WebSocket} ws - Client socket
 * @param {Object} message - Serializable message payload
 */
export function sendJson(ws, message) {
    ws.send(JSON.stringify(message));
}

/**
 * Send a standard error payload to a WebSocket client.
 *
 * @param {import('ws').WebSocket} ws - Client socket
 * @param {string} message - Error message
 */
export function sendError(ws, message) {
    sendJson(ws, {
        type: WS_MESSAGE_TYPES.ERROR,
        message
    });
}
