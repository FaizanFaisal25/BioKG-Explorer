from typing import Any

from pydantic import BaseModel, Field, field_validator


class GraphNode(BaseModel):
    id: str
    primekg_index: int
    label: str | None = None
    node_type: str | None = None
    node_source: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str | None = None
    relationship_type: str
    relation: str | None = None
    display_relation: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)


class GraphPayload(BaseModel):
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)


class SearchResult(BaseModel):
    id: str
    primekg_index: int
    name: str | None = None
    node_type: str | None = None
    node_source: str | None = None
    score: float | None = None


class NodeDetail(BaseModel):
    id: str
    primekg_index: int
    labels: list[str] = Field(default_factory=list)
    properties: dict[str, Any] = Field(default_factory=dict)


class ShortestPathRequest(BaseModel):
    sourceNodeId: int | str
    targetNodeId: int | str
    maxHops: int = 5

    @field_validator("sourceNodeId", "targetNodeId")
    @classmethod
    def validate_node_id(cls, value: int | str) -> int | str:
        if isinstance(value, str) and not value.strip():
            raise ValueError("node id cannot be empty")
        return value


class ShortestPathResponse(GraphPayload):
    hops: int | None = None
    found: bool = False
