# BioKG-Explorer

BioKG Explorer is a full-stack biomedical knowledge graph analytics application built around the PrimeKG dataset and Neo4j.

## Project Structure

- `data-exploration/`: PrimeKG EDA notebooks.
- `graph-ingestion/`: PrimeKG-to-Neo4j preparation, loading, and validation notebooks.
- `backend/`: FastAPI server for graph search, traversal, node details, and shortest path queries.
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
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend expects the backend at `http://localhost:8000/api/v1` unless `VITE_API_BASE_URL` is set.