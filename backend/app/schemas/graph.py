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


class DrugCandidate(BaseModel):
    id: str
    primekg_index: int
    name: str | None = None
    category: str
    evidence_count: int = 0
    relation: str | None = None
    rationale: str | None = None
    support_nodes: list[GraphNode] = Field(default_factory=list)
    graph: GraphPayload = Field(default_factory=GraphPayload)


class DiseaseCandidateDrugsResponse(BaseModel):
    disease_id: str
    disease_name: str | None = None
    known: list[DrugCandidate] = Field(default_factory=list)
    off_label: list[DrugCandidate] = Field(default_factory=list)
    contraindicated: list[DrugCandidate] = Field(default_factory=list)
    repurposing: list[DrugCandidate] = Field(default_factory=list)


class SimilarDisease(BaseModel):
    id: str
    primekg_index: int
    name: str | None = None
    score: float = 0.0
    evidence_count: int = 0
    shared_gene_count: int = 0
    shared_pathway_count: int = 0
    shared_phenotype_count: int = 0
    support_nodes: list[GraphNode] = Field(default_factory=list)
    graph: GraphPayload = Field(default_factory=GraphPayload)


class DiseaseSimilarityResponse(BaseModel):
    disease_id: str
    disease_name: str | None = None
    similar: list[SimilarDisease] = Field(default_factory=list)


class ShortestPathRequest(BaseModel):
    sourceNodeId: int | str
    targetNodeId: int | str
    maxHops: int = 5
    k: int = Field(default=1, ge=1, le=10)

    @field_validator("sourceNodeId", "targetNodeId")
    @classmethod
    def validate_node_id(cls, value: int | str) -> int | str:
        if isinstance(value, str) and not value.strip():
            raise ValueError("node id cannot be empty")
        return value


class ShortestPathResponse(GraphPayload):
    hops: int | None = None
    found: bool = False
    path_count: int = 0
    paths: list[GraphPayload] = Field(default_factory=list)


class PathExplanationRequest(BaseModel):
    path: GraphPayload | None = None
    subgraph: GraphPayload | None = None
    paths: list[GraphPayload] = Field(default_factory=list)
    subgraphContext: dict[str, Any] = Field(default_factory=dict)
    sourceNodeId: int | str | None = None
    targetNodeId: int | str | None = None
    pathIndex: int | None = None
    pathSignature: str | None = None


class PathExplanationResponse(BaseModel):
    explanation: str
    model: str
    path_signature: str
