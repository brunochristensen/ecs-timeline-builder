import {sendError} from '../respond.js';
import {WS_MESSAGE_TYPES} from '../../../shared/ws-protocol.js';
import {requireActiveTimeline, requireEventId} from '../../validation.js';

export function createAnnotationHandlers({manager, roomManager}) {
    const {broadcastToRoom} = roomManager;

    return {
        async [WS_MESSAGE_TYPES.ANNOTATE_EVENT]({ws, message}) {
            if (!requireActiveTimeline(ws, WS_MESSAGE_TYPES.ANNOTATE_EVENT, sendError)) {
                return;
            }

            if (!requireEventId(ws, message, WS_MESSAGE_TYPES.ANNOTATE_EVENT, sendError)) {
                return;
            }

            const store = await manager.getStore(ws.currentTimeline);
            if (!store) return;

            const annotation = store.setAnnotation(message.eventId, {
                comment: message.comment,
                mitreTactic: message.mitreTactic,
                mitreTechnique: message.mitreTechnique
            });

            manager.markDirty(ws.currentTimeline);
            broadcastToRoom(ws.currentTimeline, {
                type: WS_MESSAGE_TYPES.ANNOTATION_UPDATED,
                eventId: message.eventId,
                annotation
            });
        },

        async [WS_MESSAGE_TYPES.DELETE_ANNOTATION]({ws, message}) {
            if (!requireActiveTimeline(ws, WS_MESSAGE_TYPES.DELETE_ANNOTATION, sendError)) {
                return;
            }

            if (!requireEventId(ws, message, WS_MESSAGE_TYPES.DELETE_ANNOTATION, sendError)) {
                return;
            }

            const store = await manager.getStore(ws.currentTimeline);
            if (!store) return;

            if (store.deleteAnnotation(message.eventId)) {
                manager.markDirty(ws.currentTimeline);
                broadcastToRoom(ws.currentTimeline, {
                    type: WS_MESSAGE_TYPES.ANNOTATION_DELETED,
                    eventId: message.eventId
                });
            }
        }
    };
}
