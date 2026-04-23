import {sendError, sendJson} from '../respond.js';
import {WS_MESSAGE_TYPES} from '../../../shared/ws-protocol.js';
import {requireActiveTimeline, requireEventId, validateAddEvents} from '../../validation.js';

export function createEventHandlers({manager, roomManager}) {
    const {broadcastToRoom} = roomManager;

    return {
        async [WS_MESSAGE_TYPES.ADD_EVENTS]({ws, message}) {
            if (!requireActiveTimeline(ws, WS_MESSAGE_TYPES.ADD_EVENTS, sendError)) {
                return;
            }

            const validEvents = validateAddEvents(ws, message, sendError);
            if (!validEvents) {
                return;
            }

            const store = await manager.getStore(ws.currentTimeline);
            if (!store) return;

            const result = store.addEvents(validEvents);
            if (result.added.length > 0) {
                manager.markDirty(ws.currentTimeline);
                broadcastToRoom(ws.currentTimeline, {
                    type: WS_MESSAGE_TYPES.EVENTS_ADDED,
                    events: result.added
                }, ws);
            }

            sendJson(ws, {
                type: WS_MESSAGE_TYPES.ADD_CONFIRMED,
                count: result.added.length,
                duplicates: result.duplicates
            });
        },

        async [WS_MESSAGE_TYPES.DELETE_EVENT]({ws, message}) {
            if (!requireActiveTimeline(ws, WS_MESSAGE_TYPES.DELETE_EVENT, sendError)) {
                return;
            }

            if (!requireEventId(ws, message, WS_MESSAGE_TYPES.DELETE_EVENT, sendError)) {
                return;
            }

            const store = await manager.getStore(ws.currentTimeline);
            if (!store) return;

            const removed = store.deleteEvent(message.eventId);
            if (removed) {
                manager.markDirty(ws.currentTimeline);
                broadcastToRoom(ws.currentTimeline, {
                    type: WS_MESSAGE_TYPES.EVENT_DELETED,
                    eventId: message.eventId
                });
            }
        },

        async [WS_MESSAGE_TYPES.CLEAR]({ws}) {
            if (!requireActiveTimeline(ws, WS_MESSAGE_TYPES.CLEAR, sendError)) {
                return;
            }

            const store = await manager.getStore(ws.currentTimeline);
            if (!store) return;

            store.clear();
            manager.markDirty(ws.currentTimeline);
            broadcastToRoom(ws.currentTimeline, {type: WS_MESSAGE_TYPES.CLEARED});
        },

        async [WS_MESSAGE_TYPES.REQUEST_SYNC]({ws}) {
            if (!ws.currentTimeline) {
                sendJson(ws, {
                    type: WS_MESSAGE_TYPES.SYNC,
                    events: [],
                    annotations: {}
                });
                return;
            }

            const store = await manager.getStore(ws.currentTimeline);
            sendJson(ws, {
                type: WS_MESSAGE_TYPES.SYNC,
                events: store ? store.getAll() : [],
                annotations: store ? store.getAnnotations() : {}
            });
        }
    };
}
