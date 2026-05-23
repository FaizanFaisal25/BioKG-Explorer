# BioKG Explorer Backend

FastAPI service for querying the PrimeKG Neo4j graph.

## Run

From the project root:

```bash
pip install -r requirements.txt
uvicorn backend.app.main:app --reload
```

The API is available at `http://localhost:8000`.

## Configuration

The backend reads Neo4j settings from environment variables or `.env`:

```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password
NEO4J_DATABASE=neo4j
```

## MVP Endpoints

- `GET /health`
- `GET /api/v1/search?query=diabetes`
- `GET /api/v1/node/{id}`
- `GET /api/v1/node/{id}/graph`
- `GET /api/v1/node/{id}/neighbors`
- `POST /api/v1/shortest-path`
