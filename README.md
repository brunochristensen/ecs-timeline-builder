# ECS Timeline Builder

[![CodeQL](https://github.com/brunochristensen/ecs-timeline-builder/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/brunochristensen/ecs-timeline-builder/actions/workflows/github-code-scanning/codeql)
[![Node.js CI](https://github.com/brunochristensen/ecs-timeline-builder/actions/workflows/node.js.yml/badge.svg)](https://github.com/brunochristensen/ecs-timeline-builder/actions/workflows/node.js.yml)

Collaborative incident timeline visualization for DFIR teams. Import ECS events from Kibana, build shared host-based timelines, annotate events with MITRE ATT&CK tactics and techniques, and track per-host tactic coverage to surface investigation gaps.

Designed for simple deployment on trusted networks, including air-gapped environments, with minimal runtime dependencies.

![ECS Timeline Builder](docs/images/application.png)

## Features

- Drag-and-drop or paste ECS JSON/NDJSON events directly from Kibana exports
- Swim-lane timeline grouped by host with zoom, pan, and scales from sub-second to multi-day
- Cross-host connection arcs for lateral movement and network flows
- MITRE ATT&CK annotations with analyst comments
- Real-time collaboration over WebSocket sync
- Multi-timeline workflow for separate cases or incidents
- Event detail panel with structured ECS field display and raw JSON view
- Export timelines with annotations as JSON
- Air-gapped deployment with bundled assets only; no CDN calls at runtime

## Quick Start

Requires Node.js 18+.

```bash
npm install
npm start
```

Open `http://localhost:12345` in a browser.

To use a custom port:

```bash
PORT=8080 npm start            # Linux / macOS / Git Bash
$env:PORT=8080; npm start      # PowerShell
```

## Usage

1. Open the app and create or join a timeline.
2. Import events by dragging in a `.json` or `.ndjson` file, or by pasting JSON. Supported formats include single objects, arrays, NDJSON, and Elasticsearch `_source` wrappers.
3. Explore the timeline with zoom and pan controls. Events are grouped by host and color-coded by category.
4. Click an event to inspect ECS fields, view raw JSON, and add or remove annotations.
5. Review the MITRE coverage sidebar to see per-host tactic coverage.
6. Export the active timeline as JSON when needed for reporting or archival.

## Development

```bash
npm test
npm run lint
```

Helpful endpoints:

- `GET /health` for runtime health and loaded timeline counts
- `GET /api/timelines` for timeline metadata
- `GET /api/timelines/:id/events` for a timeline's events

## Docker Deployment

### Build on an internet-connected machine

```bash
docker build -t ecs-timeline-builder .
docker save ecs-timeline-builder -o ecs-timeline-builder.tar
```

Transfer `ecs-timeline-builder.tar` to the target network.

### Deploy

```bash
docker load -i ecs-timeline-builder.tar
docker run -d -p 12345:12345 -v timeline-data:/app/data --name ecs-timeline ecs-timeline-builder
```

Or with Docker Compose:

```bash
docker-compose up -d
```

Team members can then access `http://<host-ip>:12345`.

## Data Persistence

Timeline data is stored under `/app/data` inside the container:

- `timelines.json` stores the timeline index and metadata
- `timeline-<id>.json` stores events and annotations for each timeline

The `timeline-data` Docker volume preserves that data across container restarts.

Example backup and restore:

```bash
# Backup all persisted data
docker cp ecs-timeline:/app/data ./timeline-backup

# Restore all persisted data
docker cp ./timeline-backup/. ecs-timeline:/app/data
```
