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

function normalizeTimelineName(value, {allowDefault = false} = {}) {
    if (value == null) {
        return allowDefault ? 'Untitled Timeline' : null;
    }

    if (typeof value !== 'string') {
        return null;
    }

    const name = value.trim();
    if (!name) {
        return allowDefault ? 'Untitled Timeline' : null;
    }

    return name.length <= 120 ? name : null;
}

function normalizeTimelineDescription(value) {
    if (value == null) {
        return '';
    }

    if (typeof value !== 'string') {
        return null;
    }

    const description = value.trim();
    return description.length <= 1000 ? description : null;
}

export function validateCreateTimelineMetadata(ws, message, sendError) {
    const name = normalizeTimelineName(message.name, {allowDefault: true});
    const description = normalizeTimelineDescription(message.description);

    if (name == null) {
        sendError(ws, 'CREATE_TIMELINE: invalid name');
        return null;
    }

    if (description == null) {
        sendError(ws, 'CREATE_TIMELINE: invalid description');
        return null;
    }

    return {name, description};
}

export function validateUpdateTimelineMetadata(ws, message, sendError) {
    const updates = {};

    if (message.name !== undefined) {
        const name = normalizeTimelineName(message.name);
        if (name == null) {
            sendError(ws, 'UPDATE_TIMELINE: invalid name');
            return null;
        }
        updates.name = name;
    }

    if (message.description !== undefined) {
        const description = normalizeTimelineDescription(message.description);
        if (description == null) {
            sendError(ws, 'UPDATE_TIMELINE: invalid description');
            return null;
        }
        updates.description = description;
    }

    if (Object.keys(updates).length === 0) {
        sendError(ws, 'UPDATE_TIMELINE: no valid updates provided');
        return null;
    }

    return updates;
}
