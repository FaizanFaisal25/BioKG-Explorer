# BioKG Explorer Frontend

React + Cytoscape.js client for interactive PrimeKG exploration.

## Run

```bash
npm install
npm run dev
```

The development server runs on `http://localhost:5173`.

## Configuration

By default, the client calls `http://localhost:8000/api/v1`. Override it with:

```bash
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

## MVP Interactions

- Search for a PrimeKG node and add it to the canvas.
- Single-click a node to load details.
- Double-click a node to expand its 1-hop neighbors.
- Select source and target nodes to highlight a shortest path.
