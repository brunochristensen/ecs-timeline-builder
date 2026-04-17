# ECS Timeline Builder

Browser-based timeline visualization for Elastic Common Schema (ECS) events. Supports collaborative editing for team use on closed networks.

## Features

- Drag-and-drop or paste ECS JSON/NDJSON events right from Kibana
- Swim lane visualization grouped by host for maximum clarity
- Cross-host connection lines for network events to track adversary movement
- Event filtering by event category
- Real-time collaborative editing with multiple users
- Export timeline as JSON for sharing and preservation

## Quick Start

- Requires Node.js 18+

#### In a console:

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
Access at `http://<host-ip>:12345`

## Deployment

### Preparation (on internet-connected machine)

Build and export the Docker image:

```bash
docker build -t ecs-timeline-builder .
docker save ecs-timeline-builder -o ecs-timeline-builder.tar
```

Transfer `ecs-timeline-builder.tar` to the closed network.

### Deployment

```bash
docker load -i ecs-timeline-builder.tar
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