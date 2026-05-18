# Graph Ingestion Pipeline

This folder contains the PrimeKG-to-Neo4j ingestion pipeline for BioKG Explorer.

## Recommended Order

1. `01_prepare_primekg_for_neo4j.ipynb`  
   Builds enriched node and deduplicated undirected relationship staging files in `graph-ingestion/build/neo4j_import/`.

2. `02_load_primekg_into_neo4j.ipynb`  
   Creates Neo4j constraints/indexes and loads nodes/relationships in batches.

3. `03_validate_and_query_neo4j.ipynb`  
   Validates the loaded graph and prototypes backend query patterns for search, neighborhood expansion, shortest paths, and detail views.

## Neo4j Configuration

The notebooks read these environment variables:

```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password
NEO4J_DATABASE=neo4j
```

Neo4j is the chosen database because it supports scalable property-graph storage, Cypher traversal queries, Python/FastAPI integration through the official driver, and optional graph algorithms through Neo4j Graph Data Science.
