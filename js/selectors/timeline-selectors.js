import {buildHostRegistry, identifyConnections} from '../parser.js';

let cachedEvents = null;
let cachedDerived = {
    hostRegistry: null,
    connections: []
};

function deriveTimelineData(events) {
    if (!events || events.length === 0) {
        return {
            hostRegistry: null,
            connections: []
        };
    }

    const hostRegistry = buildHostRegistry(events);
    const connections = identifyConnections(events, hostRegistry);

    return {
        hostRegistry,
        connections
    };
}

export function getDerivedTimelineData(events) {
    if (events === cachedEvents) {
        return cachedDerived;
    }

    cachedEvents = events;
    cachedDerived = deriveTimelineData(events);
    return cachedDerived;
}

export function getHostRegistry(events) {
    return getDerivedTimelineData(events).hostRegistry;
}

export function getConnections(events) {
    return getDerivedTimelineData(events).connections;
}

export function invalidateTimelineSelectors() {
    cachedEvents = null;
    cachedDerived = {
        hostRegistry: null,
        connections: []
    };
}
