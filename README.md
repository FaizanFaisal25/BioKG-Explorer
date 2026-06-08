# BioKG Explorer

BioKG Explorer is a full-stack biomedical knowledge graph analytics application built on the [PrimeKG](https://github.com/mims-harvard/PrimeKG) dataset and Neo4j. It enables interactive visual exploration of a precision medicine knowledge graph containing 17,080 diseases, drugs, genes, proteins, pathways, and more — connected by over 4 million biological relationships.

The application provides an interactive D3.js graph canvas where users can search for any biomedical entity, expand its neighborhood, discover shortest paths between two nodes, and receive LLM-generated natural language explanations of those paths. A side panel surfaces disease-specific insights such as known drug candidates, off-label uses, contraindications, and repurposing candidates, as well as a list of similar diseases derived from shared biomedical evidence.

The system is organized into four layers: a data ingestion pipeline (Jupyter notebooks) that loads PrimeKG into Neo4j, a FastAPI backend that serves graph queries and LLM explanations, a React + D3.js frontend for interactive exploration, and a Neo4j graph database augmented with Graph Data Science analytics for degree centrality and disease similarity.

## Features

- **D3.js graph canvas** with force-directed layout, smooth expansion animations, and grouped dragging.
- **Node search** with autocomplete and partial-match fallback across all entity types.
- **Double-click expansion** to load 1-hop neighbors; collapse to clean up the canvas.
- **Top-k shortest paths** via Neo4j Graph Data Science, with relationship types preserved.
- **Path highlighting** with border-only node styling and dark-mode-aware edge labels.
- **LLM path explanations** powered by Google Gemini via the FastAPI backend.
- **Disease drug panel** listing known, off-label, contraindicated, and repurposing drug candidates.
- **Similar diseases panel** based on precomputed shared biomedical evidence.
- **Node details panel** with biomedical metadata and degree centrality.
- **Undo support**, resizable sidebars, collapsible accordions, and dark mode toggle.

## Project Structure

```
BioKG-Explorer/
├── prime-kg-dataset/        # PrimeKG CSV files (not committed — see Dataset section)
├── data-exploration/        # PrimeKG EDA notebooks
├── graph-ingestion/         # Neo4j ingestion, validation, and analytics notebooks
├── backend/                 # FastAPI server
├── frontend/                # React + D3.js client
└── requirements.txt         # Python dependencies
```

---

## Dataset

BioKG Explorer uses **PrimeKG** (Precision Medicine Knowledge Graph), developed by the MIMS Lab at Harvard. The dataset is publicly available and must be downloaded separately — the CSV files are large (up to ~1 GB each) and are not included in this repository.

**Download PrimeKG:**

1. Visit the Harvard Dataverse page linked from the official repository:
   [Dataverse/PrimeKG](https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/IXA7BM)
2. Download the following files and place them in `prime-kg-dataset/`:

| File | Description |
|------|-------------|
| `nodes.csv` | Node-level information (node_index, type, name, source) |
| `edges.csv` | Undirected relationships between nodes |
| `kg.csv` | Full knowledge graph (nodes + edges joined) |
| `disease_features.csv` | Textual clinical descriptions for disease nodes |
| `drug_features.csv` | Textual clinical descriptions for drug nodes |

The ingestion notebooks (`graph-ingestion/`) read these files, preprocess them, and load the resulting graph into Neo4j.

---

## Installation

### Prerequisites

| Dependency | Version | Notes |
|------------|---------|-------|
| Python | 3.10+ | Backend and ingestion notebooks |
| Node.js | 18+ | Frontend |
| Neo4j | 5.x | Graph database (Desktop or Docker) |
| Neo4j Graph Data Science plugin | 2.x | Required for shortest-path and similarity analytics |
| Google Gemini API key | — | Required for LLM path explanations |

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/BioKG-Explorer.git
cd BioKG-Explorer
```

### 2. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment variables

Create a `.env` file in the project root (or export variables in your shell):

```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-neo4j-password
NEO4J_DATABASE=neo4j
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-1.5-flash-latest
```

### 4. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

---

## Execution

Follow these steps in order to run the full application.

### Step 1 — Load PrimeKG into Neo4j

Open and run the ingestion notebooks in sequence from `graph-ingestion/`:

```
01_prepare_primekg_for_neo4j.ipynb   — preprocess PrimeKG CSVs into Neo4j import format
02_load_primekg_into_neo4j.ipynb     — create constraints/indexes and load nodes + relationships
03_validate_and_query_neo4j.ipynb    — validate the graph and prototype backend query patterns
04_compute_graph_analytics.ipynb     — compute degree centrality and disease similarity scores
```

This only needs to be done once. After `04_compute_graph_analytics.ipynb`, the graph is fully populated with the analytics used by the disease panel and degree-based node sizing.

### Step 2 — Start the backend

From the project root:

```bash
uvicorn backend.app.main:app --reload
```

The API will be available at `http://localhost:8000`. You can verify it with:

```bash
curl http://localhost:8000/health
```

### Step 3 — Start the frontend

In a separate terminal:

```bash
cd frontend
npm run dev
```

Open your browser at `http://localhost:5173`.

### Step 4 — Explore the graph

1. **Search** for a biomedical entity (e.g., `diabetes`, `metformin`, `TP53`) in the search bar.
2. **Click a result** to add the node to the D3.js canvas.
3. **Double-click a node** to expand its 1-hop neighbors.
4. **Single-click a node** to load its details and metadata in the right panel.
5. **Select two nodes** as source and target, then click **Find Path** to highlight the top-k shortest paths between them.
6. Click **Explain Path** to generate an LLM-powered natural language explanation of the path.
7. For disease nodes, the left panel surfaces drug candidates and similar diseases.

---

## Backend API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/v1/search?query=...` | GET | Search nodes by name/type |
| `/api/v1/node/{id}` | GET | Node metadata and degree centrality |
| `/api/v1/node/{id}/neighbors` | GET | 1-hop neighborhood |
| `/api/v1/shortest-path` | POST | Top-k shortest paths between two nodes |
| `/api/v1/path-explanation` | POST | LLM explanation for a path |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Graph database | Neo4j 5.x + Graph Data Science plugin |
| Backend | Python, FastAPI, neo4j Python driver |
| Frontend | React, D3.js v7 (force-directed graph) |
| LLM | Google Gemini via REST API |
| Data ingestion | Jupyter, pandas, py2neo |

---

## Use of AI

AI assistance (Claude) was used during development for specific tasks where we got stuck or needed a faster path forward. This included debugging the D3.js force simulation when nodes would cluster or fly off-screen on incremental graph updates, structuring the Neo4j Cypher queries for top-k shortest paths with the Graph Data Science plugin, wiring up the FastAPI CORS configuration for local development, and resolving React state synchronization issues between the graph canvas and the side panels. All AI-generated code was reviewed, tested, and integrated manually into the codebase.
