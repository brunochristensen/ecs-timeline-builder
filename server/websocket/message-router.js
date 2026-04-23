import {createAnnotationHandlers} from './handlers/annotation-handlers.js';
import {createEventHandlers} from './handlers/event-handlers.js';
import {createTimelineHandlers} from './handlers/timeline-handlers.js';
import {sendError} from './respond.js';
import {WS_MESSAGE_TYPES} from '../../shared/ws-protocol.js';

export function createMessageRouter({manager, roomManager}) {
    const handlers = {
        ...createTimelineHandlers({manager, roomManager}),
        ...createEventHandlers({manager, roomManager}),
        ...createAnnotationHandlers({manager, roomManager}),
        async [WS_MESSAGE_TYPES.PONG]({ws}) {
            ws.lastPong = Date.now();
        }
    };

    return async function routeMessage(ws, data) {
        try {
            const message = JSON.parse(data);
            if (!message.type || typeof message.type !== 'string') {
                sendError(ws, 'Invalid message: missing type');
                return;
            }

            const handler = handlers[message.type];
            if (!handler) {
                console.warn('Unknown message type:', message.type);
                sendError(ws, `Unknown message type: ${message.type}`);
                return;
            }

            await handler({ws, message});
        } catch (error) {
            console.error('Error processing message:', error.message);
            sendError(ws, `Failed to process message: ${error.message}`);
        }
    };
}
