# BioKG Explorer Frontend

React + D3.js client for interactive PrimeKG exploration.

## Run

```bash
npm install
npm run dev
```

The development server runs on `http://localhost:5173`.

## Configuration

By default, the client calls `http://localhost:8000/api/v1`. Override with:

```bash
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

## Interactions

- Search for a PrimeKG node and add it to the D3.js force-directed canvas.
- Single-click a node to load its details and metadata.
- Double-click a node to expand its 1-hop neighbors; double-click again to collapse.
- Select source and target nodes to compute and highlight a shortest path.
- Click **Explain Path** to generate an LLM natural language explanation of the path.
