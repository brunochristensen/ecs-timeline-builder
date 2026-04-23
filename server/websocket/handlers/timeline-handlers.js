import {sendError, sendJson} from '../respond.js';
import {WS_MESSAGE_TYPES} from '../../../shared/ws-protocol.js';
import {
    requireTimelineId,
    validateCreateTimelineMetadata,
    validateUpdateTimelineMetadata
} from '../../validation.js';

export function createTimelineHandlers({manager, roomManager}) {
    const {
        broadcastToAll,
        joinRoom,
        leaveRoom,
        clearTimelineRoom
    } = roomManager;

    return {
        async [WS_MESSAGE_TYPES.LIST_TIMELINES]({ws}) {
            sendJson(ws, {
                type: WS_MESSAGE_TYPES.TIMELINES_LIST,
                timelines: manager.listTimelines()
            });
        },

        async [WS_MESSAGE_TYPES.CREATE_TIMELINE]({ws, message}) {
            const metadata = validateCreateTimelineMetadata(ws, message, sendError);
            if (!metadata) {
                return;
            }

            const timeline = await manager.createTimeline(
                metadata.name,
                metadata.description
            );
            broadcastToAll({
                type: WS_MESSAGE_TYPES.TIMELINE_CREATED,
                timeline
            });
        },

        async [WS_MESSAGE_TYPES.UPDATE_TIMELINE]({ws, message}) {
            if (!requireTimelineId(ws, message, WS_MESSAGE_TYPES.UPDATE_TIMELINE, sendError)) {
                return;
            }

            const updates = validateUpdateTimelineMetadata(ws, message, sendError);
            if (!updates) {
                return;
            }

            const updated = await manager.updateTimeline(message.timelineId, updates);

            if (updated) {
                broadcastToAll({
                    type: WS_MESSAGE_TYPES.TIMELINE_UPDATED,
                    timeline: updated
                });
            }
        },

        async [WS_MESSAGE_TYPES.DELETE_TIMELINE]({ws, message}) {
            if (!requireTimelineId(ws, message, WS_MESSAGE_TYPES.DELETE_TIMELINE, sendError)) {
                return;
            }

            const deleted = await manager.deleteTimeline(message.timelineId);
            if (deleted) {
                clearTimelineRoom(message.timelineId);
                broadcastToAll({
                    type: WS_MESSAGE_TYPES.TIMELINE_DELETED,
                    timelineId: message.timelineId
                });
            }
        },

        async [WS_MESSAGE_TYPES.JOIN_TIMELINE]({ws, message}) {
            if (!requireTimelineId(ws, message, WS_MESSAGE_TYPES.JOIN_TIMELINE, sendError)) {
                return;
            }

            const store = await manager.getStore(message.timelineId);
            if (!store) {
                sendError(ws, 'Timeline not found');
                return;
            }

            const userCount = joinRoom(ws, message.timelineId);
            sendJson(ws, {
                type: WS_MESSAGE_TYPES.JOINED_TIMELINE,
                timelineId: message.timelineId,
                events: store.getAll(),
                annotations: store.getAnnotations(),
                userCount
            });
        },

        async [WS_MESSAGE_TYPES.LEAVE_TIMELINE]({ws}) {
            if (!ws.currentTimeline) return;

            const timelineId = ws.currentTimeline;
            leaveRoom(ws, timelineId);
            sendJson(ws, {
                type: WS_MESSAGE_TYPES.LEFT_TIMELINE,
                timelineId
            });
        }
    };
}
