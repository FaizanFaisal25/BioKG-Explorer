import hashlib
import json
from dataclasses import dataclass
from typing import Any

from backend.app.core.config import Settings
from backend.app.schemas.graph import GraphEdge, GraphNode, GraphPayload


class PathExplanationError(RuntimeError):
    pass


class PathExplanationNotConfiguredError(PathExplanationError):
    pass


@dataclass(frozen=True)
class PathExplanationResult:
    explanation: str
    model: str
    path_signature: str


def path_signature(path: GraphPayload) -> str:
    ordered_nodes = _ordered_path_nodes(path)
    edge_lookup = _edge_lookup(path.edges)
    parts: list[str] = []
    for index, node in enumerate(ordered_nodes):
        parts.append(node.id)
        if index < len(ordered_nodes) - 1:
            edge = edge_lookup.get(frozenset({node.id, ordered_nodes[index + 1].id}))
            parts.append(edge.label or edge.display_relation or edge.relation or edge.relationship_type if edge else "relationship")
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


def explain_path(
    path: GraphPayload,
    settings: Settings,
    requested_signature: str | None = None,
    paths: list[GraphPayload] | None = None,
    subgraph: GraphPayload | None = None,
    subgraph_context: dict[str, Any] | None = None,
) -> PathExplanationResult:
    api_key = settings.gemini_api_key or settings.google_api_key
    if not api_key:
        raise PathExplanationNotConfiguredError("Set GEMINI_API_KEY or GOOGLE_API_KEY to enable path explanations.")
    explanation_subgraph = subgraph or path
    explanation_paths = paths or [path]
    if not explanation_subgraph.nodes or not explanation_subgraph.edges:
        raise PathExplanationError("A path explanation requires at least one node and one edge.")

    signature = requested_signature or _subgraph_signature(explanation_subgraph, explanation_paths)
    prompt = _build_prompt(
        subgraph=explanation_subgraph,
        paths=explanation_paths,
        subgraph_context=subgraph_context or {},
    )

    try:
        from google import genai
        from google.genai import types  # type: ignore[import-not-found]
    except ImportError as exc:
        raise PathExplanationNotConfiguredError(
            "Install the google-genai package to enable path explanations."
        ) from exc

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                max_output_tokens=settings.gemini_max_output_tokens,
                temperature=settings.gemini_temperature,
            ),
        )
    except Exception as exc:
        raise PathExplanationError(f"Gemini explanation request failed: {exc}") from exc

    explanation = (getattr(response, "text", None) or "").strip()
    if not explanation:
        raise PathExplanationError("Gemini returned an empty explanation.")

    return PathExplanationResult(
        explanation=explanation,
        model=settings.gemini_model,
        path_signature=signature,
    )


def _ordered_path_nodes(path: GraphPayload) -> list[GraphNode]:
    if len(path.nodes) <= 2:
        return path.nodes

    adjacency: dict[str, list[str]] = {node.id: [] for node in path.nodes}
    node_by_id = {node.id: node for node in path.nodes}
    for edge in path.edges:
        if edge.source in adjacency and edge.target in adjacency:
            adjacency[edge.source].append(edge.target)
            adjacency[edge.target].append(edge.source)

    endpoints = [node_id for node_id, neighbors in adjacency.items() if len(neighbors) <= 1]
    start_id = endpoints[0] if endpoints else path.nodes[0].id
    ordered_ids = [start_id]
    previous_id: str | None = None
    current_id = start_id

    while len(ordered_ids) < len(path.nodes):
        next_ids = [node_id for node_id in adjacency.get(current_id, []) if node_id != previous_id]
        if not next_ids:
            break
        previous_id = current_id
        current_id = next_ids[0]
        if current_id in ordered_ids:
            break
        ordered_ids.append(current_id)

    if len(ordered_ids) != len(path.nodes):
        remaining = [node.id for node in path.nodes if node.id not in set(ordered_ids)]
        ordered_ids.extend(remaining)

    return [node_by_id[node_id] for node_id in ordered_ids]


def _edge_lookup(edges: list[GraphEdge]) -> dict[frozenset[str], GraphEdge]:
    return {frozenset({edge.source, edge.target}): edge for edge in edges}


def _build_prompt(subgraph: GraphPayload, paths: list[GraphPayload], subgraph_context: dict[str, Any]) -> str:
    context = _subgraph_context(subgraph, paths, subgraph_context)
    return (
        "You are explaining a biomedical knowledge graph subgraph for a visual analytics user.\n"
        "Use only the graph facts provided below. Do not claim clinical causality, diagnosis, or treatment guidance.\n"
        "Write a concise, accurate explanation for technical and non-technical users.\n\n"
        "Explain:\n"
        "- the significance of key nodes in the subgraph,\n"
        "- how adjacent nodes are related,\n"
        "- why the highlighted path(s) or subgraph are meaningful in the graph context,\n"
        "- notable intermediary concepts, repeated bridge nodes, or relationship patterns,\n"
        "- how alternative paths differ if multiple paths are present.\n\n"
        "Make sure your response is concise and in markdown format.\n\n"
        "Subgraph context JSON:\n"
        f"{json.dumps(context, indent=2, sort_keys=True)}\n"
    )


def _subgraph_context(subgraph: GraphPayload, paths: list[GraphPayload], subgraph_context: dict[str, Any]) -> dict[str, Any]:
    node_by_id = {node.id: node for node in subgraph.nodes}
    edge_by_key = {f"{edge.source}|{edge.target}|{edge.id}": edge for edge in subgraph.edges}
    path_contexts = [_path_context(path, index) for index, path in enumerate(paths)]
    path_node_counts: dict[str, int] = {}
    path_edge_counts: dict[str, int] = {}

    for path in paths:
        for node in path.nodes:
            path_node_counts[node.id] = path_node_counts.get(node.id, 0) + 1
        for edge in path.edges:
            edge_key = f"{edge.source}|{edge.target}|{edge.label or edge.relationship_type}"
            path_edge_counts[edge_key] = path_edge_counts.get(edge_key, 0) + 1

    shared_node_ids = [node_id for node_id, count in path_node_counts.items() if count > 1]
    shared_edges = [edge_key for edge_key, count in path_edge_counts.items() if count > 1]

    return {
        "task": "explain_biomedical_knowledge_graph_subgraph",
        "context": subgraph_context,
        "summary": {
            "node_count": len(subgraph.nodes),
            "edge_count": len(subgraph.edges),
            "highlighted_path_count": len(paths),
            "node_types": _counts(node.node_type or "unknown" for node in subgraph.nodes),
            "relationship_types": _counts(edge.relationship_type for edge in subgraph.edges),
        },
        "nodes": [_node_context(node) for node in subgraph.nodes[:80]],
        "edges": [_edge_context(edge, node_by_id) for edge in subgraph.edges[:120]],
        "highlighted_paths": path_contexts,
        "shared_across_paths": {
            "nodes": [_node_context(node_by_id[node_id]) for node_id in shared_node_ids if node_id in node_by_id],
            "edges": shared_edges,
        },
        "truncation": {
            "nodes_truncated": max(0, len(subgraph.nodes) - 80),
            "edges_truncated": max(0, len(subgraph.edges) - 120),
        },
    }


def _path_context(path: GraphPayload, index: int) -> dict[str, Any]:
    ordered_nodes = _ordered_path_nodes(path)
    edge_lookup = _edge_lookup(path.edges)
    ordered_steps = []
    for source_node, target_node in zip(ordered_nodes, ordered_nodes[1:]):
        edge = edge_lookup.get(frozenset({source_node.id, target_node.id}))
        ordered_steps.append(
            {
                "source": _node_ref(source_node),
                "relationship": _edge_relation_text(edge),
                "target": _node_ref(target_node),
            }
        )
    return {
        "path_index": index,
        "hop_count": max(0, len(ordered_nodes) - 1),
        "ordered_nodes": [_node_ref(node) for node in ordered_nodes],
        "ordered_steps": ordered_steps,
    }


def _node_context(node: GraphNode) -> dict[str, Any]:
    return {
        "id": node.id,
        "name": node.label or node.id,
        "type": node.node_type or "unknown",
        "source": node.node_source or "unknown",
        "degree": node.properties.get("degree"),
        "degree_centrality": node.properties.get("degree_centrality"),
    }


def _node_ref(node: GraphNode) -> dict[str, str]:
    return {
        "id": node.id,
        "name": node.label or node.id,
        "type": node.node_type or "unknown",
    }


def _edge_context(edge: GraphEdge, node_by_id: dict[str, GraphNode]) -> dict[str, Any]:
    return {
        "id": edge.id,
        "source": _node_ref(node_by_id[edge.source]) if edge.source in node_by_id else {"id": edge.source},
        "target": _node_ref(node_by_id[edge.target]) if edge.target in node_by_id else {"id": edge.target},
        "label": edge.label,
        "relationship_type": edge.relationship_type,
        "relation": edge.relation,
        "display_relation": edge.display_relation,
        "properties": _selected_edge_properties(edge.properties),
    }


def _counts(values) -> dict[str, int]:
    counts: dict[str, int] = {}
    for value in values:
        counts[value] = counts.get(value, 0) + 1
    return counts


def _subgraph_signature(subgraph: GraphPayload, paths: list[GraphPayload]) -> str:
    payload = {
        "nodes": sorted(node.id for node in subgraph.nodes),
        "edges": sorted(f"{edge.source}|{edge.target}|{edge.label or edge.relationship_type}" for edge in subgraph.edges),
        "paths": [path_signature(path) for path in paths],
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def _edge_relation_text(edge: GraphEdge | None) -> str:
    if edge is None:
        return "relationship"
    relation_parts = [
        edge.label,
        edge.display_relation,
        edge.relation,
        edge.relationship_type,
    ]
    properties = _selected_edge_properties(edge.properties)
    relation_text = " / ".join(str(part) for part in relation_parts if part)
    if properties:
        relation_text = f"{relation_text}; properties: {properties}" if relation_text else f"properties: {properties}"
    return relation_text or "relationship"


def _selected_edge_properties(properties: dict[str, Any]) -> dict[str, Any]:
    allowed_keys = {"source", "evidence", "algorithm", "path_index", "total_cost"}
    return {key: value for key, value in properties.items() if key in allowed_keys}
