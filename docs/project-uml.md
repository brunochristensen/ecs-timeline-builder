# Project UML

## Class / Component Diagram

```mermaid
classDiagram
    direction LR

    class App {
      +init()
      +handleTimelineListReceived()
      +refreshTimelineUi()
      +clearTimeline()
      +exportTimeline()
    }

    class TimelineState {
      -events: Array
      -annotations: Map
      -timelines: Array
      -currentTimelineId: string|null
      -currentTimelineCache: Object|null
      +addEvents(rawInput)
      +setEvents(rawEvents, annotations)
      +deleteEvent(eventId)
      +clear()
      +setAnnotation(eventId, annotation)
      +deleteAnnotation(eventId)
      +setTimelines(timelines)
      +addTimeline(timeline)
      +updateTimelineMeta(id, updates)
      +removeTimeline(id)
      +setCurrentTimeline(id)
      +clearForTimelineSwitch()
    }

    class SessionStore {
      -connected: boolean
      -syncStatus: string
      -lastError: string
      -userCount: number
      +setConnected(connected)
      +setSyncStatus(status)
      +setLastError(message)
      +clearLastError()
      +setUserCount(count)
    }

    class TimelineSelectors {
      +getDerivedTimelineData(events)
      +getHostRegistry(events)
      +getConnections(events)
      +invalidateTimelineSelectors()
    }

    class EventBus {
      +on(event, fn)
      +off(event, fn)
      +emit(event, ...args)
    }

    class EventEmitter {
      -listeners: Map
      +on(event, fn)
      +off(event, fn)
      +emit(event, ...args)
    }

    class Sync {
      -ws: WebSocket
      -reconnectAttempts: number
      -connectionActive: boolean
      +sendEventsToServer(rawEvents)
      +sendDeleteToServer(eventId)
      +sendClearToServer()
      +sendAnnotationToServer(eventId, annotation)
      +sendDeleteAnnotationToServer(eventId)
      +requestTimelineList()
      +createTimeline(name, description)
      +joinTimeline(timelineId)
      +leaveTimeline()
      +retryConnection()
      +isConnected()
      +isTimelineReady()
      +requireTimelineReady(actionLabel)
    }

    class StatusBarController {
      +initStatusBarController(options)
      +stampStatusSync()
      +updateStatusStats(eventCount, hostCount)
      +resetStatusStats()
    }

    class ImportController {
      +initImportController()
    }

    class DetailPanelController {
      +initDetailPanelController()
      +showEventDetail(event)
    }

    class TimelineVisualization {
      +initTimelineVisualization(container, onSelect)
      +renderTimelineVisualization(events, hostRegistry, connections, annotations)
      +clearTimelineVisualization()
      +zoomIn()
      +zoomOut()
      +zoomReset()
    }

    class DetailRenderer {
      +renderEventDetailPanel(event, annotation)
      +renderMitreOptions(techniques, selected, placeholder)
    }

    class Parser {
      +parseEvents(rawInput)
      +buildHostRegistry(events)
      +identifyConnections(events)
    }

    class SharedDedup {
      +getId(event)
      +deduplicateEvents(newEvents, existingEvents)
    }

    class GapDetection {
      +renderGapDetection()
    }

    class TimelineSelector {
      +showSelector()
      +hideSelector()
      +getTimelineIdFromUrl()
    }

    class Server {
      -app: Express
      -server: HTTPServer
      -wss: WebSocketServer
      -manager: TimelineManager
      -roomManager: RoomManager
      -routeMessage: Function
    }

    class RoomManager {
      +joinRoom(ws, timelineId)
      +leaveRoom(ws, timelineId)
      +broadcastToRoom(timelineId, message, excludeWs)
      +broadcastToAll(message, excludeWs)
      +clearTimelineRoom(timelineId)
      +roomCount()
    }

    class MessageRouter {
      +routeMessage(ws, data)
    }

    class TimelineHandlers {
      +list/create/update/delete/join/leave
    }

    class EventHandlers {
      +add/delete/clear
    }

    class AnnotationHandlers {
      +annotate/deleteAnnotation
    }

    class Validation {
      +requireTimelineId(message)
      +requireActiveTimeline(ws)
      +requireEventId(message)
      +validateAddEvents(message)
    }

    class Heartbeat {
      +startHeartbeat(config)
    }

    class TimelineManager {
      -timelines: Map
      -stores: Map
      -dirty: Set
      +initialize()
      +listTimelines()
      +getTimeline(id)
      +createTimeline(name, description)
      +updateTimeline(id, updates)
      +deleteTimeline(id)
      +getStore(id)
      +markDirty(id)
      +saveAll()
      +saveTimeline(id)
      +unloadStore(id)
      +hasDirtyTimelines()
      +getLoadedStoreIds()
    }

    class EventStore {
      -events: Array
      -annotations: Object
      +addEvents(newEvents)
      +deleteEvent(eventId)
      +setAnnotation(eventId, annotation)
      +deleteAnnotation(eventId)
      +getAnnotations()
      +getAll()
      +clear()
      +load(events, annotations)
      +length
    }

    class Persistence {
      +loadTimelineIndex()
      +saveTimelineIndex(index)
      +loadTimelineData(id)
      +saveTimelineData(id, events, annotations)
      +deleteTimelineData(id)
      +generateTimelineId()
    }

    App --> TimelineVisualization : render
    App --> TimelineState : read domain state
    App --> TimelineSelectors : derive host data
    App --> StatusBarController : init
    App --> ImportController : init
    App --> DetailPanelController : init
    App --> EventBus : subscribe
    App --> TimelineSelector : timeline switch
    App --> Sync : clear or join actions

    TimelineState --> Parser : parse events
    TimelineState --> SharedDedup : dedup
    TimelineState --> TimelineSelectors : invalidate cache
    TimelineState --> EventBus : emit domain events

    SessionStore --> EventBus : emit session events

    EventBus --> EventEmitter : singleton
    Sync --> TimelineState : update canonical data
    Sync --> SessionStore : update transport state
    Sync --> Server : websocket

    GapDetection --> EventBus : subscribe
    GapDetection --> TimelineState : read state
    TimelineSelector --> EventBus : subscribe
    TimelineSelector --> TimelineState : read timelines
    TimelineVisualization --> EventBus : select event
    StatusBarController --> SessionStore : read status
    ImportController --> Sync : submit events
    DetailPanelController --> Sync : annotation and delete
    DetailPanelController --> DetailRenderer : render

    Server --> RoomManager : room lifecycle
    Server --> MessageRouter : route inbound messages
    Server --> Heartbeat : stale client detection
    Server --> TimelineManager : timeline access
    MessageRouter --> TimelineHandlers : timeline commands
    MessageRouter --> EventHandlers : event commands
    MessageRouter --> AnnotationHandlers : annotation commands
    TimelineHandlers --> Validation : validate
    EventHandlers --> Validation : validate
    AnnotationHandlers --> Validation : validate
    TimelineHandlers --> RoomManager : broadcast
    EventHandlers --> RoomManager : broadcast
    AnnotationHandlers --> RoomManager : broadcast
    TimelineHandlers --> TimelineManager : manage timelines
    EventHandlers --> EventStore : mutate timeline
    AnnotationHandlers --> EventStore : mutate annotations
    TimelineManager --> EventStore : own stores
    TimelineManager --> Persistence : persist
```

## Sequence Diagram: Typical Event Import

```mermaid
sequenceDiagram
    actor Analyst
    participant Import as ImportController
    participant State as TimelineState
    participant Sync
    participant Server
    participant Router as MessageRouter
    participant Events as EventHandlers
    participant Manager as TimelineManager
    participant Store as EventStore
    participant Selectors as TimelineSelectors
    participant Bus as EventBus
    participant UI as TimelineVisualization
    participant Others as Other Clients

    Analyst->>Import: Paste or upload ECS JSON
    Import->>State: addEvents(rawInput)
    State->>Selectors: invalidate cache
    State->>Bus: emit events:added
    Bus-->>UI: refresh from state + selectors
    Import->>Sync: sendEventsToServer(rawEvents)
    Sync->>Server: WebSocket ADD_EVENTS
    Server->>Router: routeMessage(ws, data)
    Router->>Events: handle ADD_EVENTS
    Events->>Manager: getStore(currentTimeline)
    Manager->>Store: addEvents(validEvents)
    Store-->>Events: { added, duplicates }
    Events->>Manager: markDirty(timelineId)
    Events-->>Sync: ADD_CONFIRMED
    Events-->>Others: EVENTS_ADDED
    Sync->>State: addEvents(rawEvents) or setEvents(...)
    State->>Selectors: invalidate cache
    State->>Bus: emit events:added or events:synced
    Bus-->>UI: refresh from state + selectors
```

## Notes

- `client/app.js` is now a bootstrap/composition module. It initializes visualization and feature controllers, subscribes to top-level state events, and owns only the remaining cross-feature rendering flow.
- `client/state.js` is the canonical timeline/domain store. It owns events, annotations, timeline metadata, and active timeline selection.
- `client/stores/session-store.js` owns connection/session state: WebSocket connectivity, sync lifecycle, user count, and last transport-visible error.
- `client/selectors/timeline-selectors.js` owns derived visualization data such as host registry and cross-host connections.
- `client/event-bus.js` remains the pub/sub backbone, with event names centralized in `client/events.js`.
- `client/sync.js` manages WebSocket lifecycle, reconnect behavior, maps server messages into timeline/session stores, and exports the `requireTimelineReady` guard used by feature controllers to gate mutations.
- `server.js` is now a composition root. Room lifecycle lives in `server/websocket/room-manager.js`, heartbeat in `server/websocket/heartbeat.js`, and protocol routing in `server/websocket/message-router.js`.
- Focused WebSocket handlers in `server/websocket/handlers/` now own timeline, event, and annotation commands.
- `server/timeline-manager.js`, `server/event-store.js`, and `server/persistence.js` still form the timeline application and persistence layers.
