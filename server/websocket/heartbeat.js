import WebSocket from 'ws';
import {sendJson} from './respond.js';
import {WS_MESSAGE_TYPES} from '../../shared/ws-protocol.js';

export function startHeartbeat({wss, heartbeatTimeout, heartbeatInterval, leaveRoom}) {
    return setInterval(() => {
        const now = Date.now();

        wss.clients.forEach(client => {
            if (client.readyState !== WebSocket.OPEN) return;

            if (now - client.lastPong > heartbeatTimeout) {
                console.log('Terminating stale client (no pong received)');
                if (client.currentTimeline) {
                    leaveRoom(client, client.currentTimeline);
                }
                client.terminate();
                return;
            }

            sendJson(client, {type: WS_MESSAGE_TYPES.PING});
        });
    }, heartbeatInterval);
}
