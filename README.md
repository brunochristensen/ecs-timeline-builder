# ECS Timeline Builder

Browser-based timeline visualization for Elastic Common Schema (ECS) events. Supports collaborative editing for team use on closed networks.

## Features

- Drag-and-drop or paste ECS JSON/NDJSON events
- Swim lane visualization grouped by host
- Cross-host connection lines for network events
- Event filtering by category
- Real-time collaborative editing (multiple users, shared timeline)
- Export timeline as JSON

## Quick Start

### Collaborative Use

#### Prerequisites

- Node.js 18+ or Docker

#### Option A: Node.js

```bash
npm install
npm start
```
Access at `http://<host-ip>:12345`

To manually specify a port:
```bash
PORT=<port> npm start #Linux
$env:PORT=<port>; npm start #Or for PowerShell
```

#### Option B: Docker

```bash
docker-compose up -d
```

Access at `http://<host-ip>:12345`

## Deployment on Closed Network

### Preparation (on internet-connected machine)

Build and export the Docker image:

```bash
docker build -t ecs-timeline-builder .
docker save ecs-timeline-builder > ecs-timeline-builder.tar
```

Transfer `ecs-timeline-builder.tar` to the closed network.

### Deployment (on closed network)

```bash
docker load < ecs-timeline-builder.tar
docker run -d -p <host-port>:12345 -v timeline-data:/app/data --name ecs-timeline ecs-timeline-builder
```

Team members access via `http://<host-ip>:<host-port>`

### Data Persistence

Timeline data auto-saves to `/app/data/timeline.json` inside the container. The Docker volume `timeline-data` preserves data across container restarts.

To backup:
```bash
docker cp ecs-timeline:/app/data/timeline.json ./backup.json
```

To restore:
```bash
docker cp ./backup.json ecs-timeline:/app/data/timeline.json
```

## Usage

1. Paste ECS JSON into the text area or drop a `.json`/`.ndjson` file
2. Click the play button or press `Ctrl+Enter` to parse
3. Click events on the timeline to view details
4. Use mouse wheel to zoom, drag to pan
5. Filter event types using the sidebar checkboxes
6. Export timeline via the sidebar when done

