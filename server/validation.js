export function requireTimelineId(ws, message, action, sendError) {
    if (!message.timelineId) {
        sendError(ws, `${action}: missing timelineId`);
        return false;
    }

    return true;
}

export function requireActiveTimeline(ws, action, sendError) {
    if (!ws.currentTimeline) {
        sendError(ws, `${action}: not in a timeline`);
        return false;
    }

    return true;
}

export function requireEventId(ws, message, action, sendError) {
    if (!message.eventId || typeof message.eventId !== 'string') {
        sendError(ws, `${action}: invalid eventId`);
        return false;
    }

    return true;
}

export function validateAddEvents(ws, message, sendError) {
    if (!Array.isArray(message.events)) {
        sendError(ws, 'ADD_EVENTS: events must be an array');
        return null;
    }

    const validEvents = message.events.filter(event => event && typeof event === 'object');
    if (validEvents.length === 0) {
        sendError(ws, 'ADD_EVENTS: no valid event objects');
        return null;
    }

    return validEvents;
}
