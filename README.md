# BioKG-Explorer

BioKG Explorer is a full-stack biomedical knowledge graph analytics application built around the PrimeKG dataset and Neo4j.

## Current Features

- PrimeKG ingestion into Neo4j with enriched nodes, relationship typing, constraints, and indexes.
- Interactive node search with autocomplete and partial-match fallback.
- Cytoscape.js graph canvas with stable incremental layout, smooth expansion animations, collision spacing, and grouped dragging.
- Double-click node expansion/collapse with configurable max-neighbor limit.
- Node details panel with biomedical metadata and graph metrics such as degree centrality.
- Degree-based node sizing using precomputed Neo4j analytics.
- Top-k shortest paths using Neo4j Graph Data Science, with original relationship labels preserved.
- Shortest-path highlighting with border-only node styling and dark-mode-aware edge labels.
- LLM-powered path explanations using Gemini via the FastAPI backend.
- Disease candidate drugs panel for known, off-label, contraindicated, and repurposing candidates.
- Similar diseases panel based on precomputed shared biomedical evidence.
- Collapsible accordion side panels with resizable left and right sidebars.
- Undo support for graph exploration actions.
- Dark mode toggle and glassmorphic UI styling.

## Project Structure

- `data-exploration/`: PrimeKG EDA notebooks.
- `graph-ingestion/`: PrimeKG-to-Neo4j preparation, loading, validation, and analytics notebooks.
- `backend/`: FastAPI server for graph search, traversal, analytics, LLM explanations, and path queries.
- `frontend/`: React + Cytoscape.js client for interactive graph exploration.

## Backend

```bash
pip install -r requirements.txt
uvicorn backend.app.main:app --reload
```

Configure Neo4j with:

```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password
NEO4J_DATABASE=neo4j
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.1-flash-lite
```

Run `graph-ingestion/04_compute_graph_analytics.ipynb` after loading Neo4j to populate degree sizing and disease similarity features.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend expects the backend at `http://localhost:8000/api/v1` unless `VITE_API_BASE_URL` is set.