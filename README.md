# vfs-server

A lightweight file system backend framework. Define sections in a config file and get a fully working REST API with file watching, schema validation, and WebSocket events automatically.

## Requirements

Node.js 20+ and npm.

## Setup

```bash
npm install
npm run build
```

## Running

Development with file watching:
```bash
make dev
```

Production:
```bash
make start
```

Docker:
```bash
make docker-build
make docker-run
```

## Configuration

All behaviour is controlled through `vfs.config.json` in the project root.

```json
{
  "dataDir": "./data",
  "port": 3001,
  "watch": true,
  "cors": "*",
  "sections": []
}
```

Each section defines a collection of JSON records stored on disk. Sections can be top-level or children of another section, have a JSON Schema for validation, and declare default values applied on creation.

## API

Every section gets a full set of routes automatically.

Top-level sections are available at `/{section}` and `/{section}/:id`.

Child sections are available at `/{parent}/:parentId/{section}` and `/{parent}/:parentId/{section}/:id`.

All endpoints support GET, POST, PUT, PATCH and DELETE.

## WebSocket

Connect to `/ws` to receive live file change events. Each event contains the section name, record id, parent id if applicable, the type of change and a timestamp.

## Data Storage

Records are stored as JSON files under the configured `dataDir`. Directory-storage sections give each record its own folder, which child sections are nested inside. File-storage sections store each record as a single JSON file.