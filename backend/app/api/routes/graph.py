from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from neo4j import Driver

from backend.app.core.config import Settings, get_settings
from backend.app.db.neo4j import get_neo4j_driver
from backend.app.repositories.graph_repository import GraphRepository
from backend.app.schemas.graph import GraphPayload, NodeDetail, SearchResult, ShortestPathRequest, ShortestPathResponse

router = APIRouter(tags=["graph"])


def get_graph_repository(
    driver: Annotated[Driver, Depends(get_neo4j_driver)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> GraphRepository:
    return GraphRepository(driver, settings)


def _parse_csv_filters(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


@router.get("/search", response_model=list[SearchResult])
def search_nodes(
    query: Annotated[str, Query(min_length=1)],
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
    repository: GraphRepository = Depends(get_graph_repository),
) -> list[SearchResult]:
    return repository.search(query, limit)


@router.get("/node/{node_id}", response_model=NodeDetail)
def get_node(
    node_id: int,
    repository: GraphRepository = Depends(get_graph_repository),
) -> NodeDetail:
    node = repository.get_node(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@router.get("/node/{node_id}/graph", response_model=GraphPayload)
def get_node_graph(
    node_id: int,
    repository: GraphRepository = Depends(get_graph_repository),
) -> GraphPayload:
    graph = repository.get_node_as_graph(node_id)
    if graph is None:
        raise HTTPException(status_code=404, detail="Node not found")
    return graph


@router.get("/node/{node_id}/neighbors", response_model=GraphPayload)
def get_neighbors(
    node_id: int,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    node_types: str | None = Query(default=None, description="Comma-separated PrimeKG node_type filters"),
    relations: str | None = Query(default=None, description="Comma-separated relation or relationship type filters"),
    repository: GraphRepository = Depends(get_graph_repository),
) -> GraphPayload:
    return repository.get_neighbors(
        node_id=node_id,
        limit=limit,
        node_types=_parse_csv_filters(node_types),
        relations=_parse_csv_filters(relations),
    )


@router.post("/shortest-path", response_model=ShortestPathResponse)
def shortest_path(
    request: ShortestPathRequest,
    repository: GraphRepository = Depends(get_graph_repository),
) -> ShortestPathResponse:
    return repository.shortest_path(
        source_id=int(request.sourceNodeId),
        target_id=int(request.targetNodeId),
        max_hops=request.maxHops,
    )
