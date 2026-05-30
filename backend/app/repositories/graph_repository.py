import re
from typing import Any

from neo4j import Driver

from backend.app.core.config import Settings
from backend.app.schemas.graph import (
    DiseaseCandidateDrugsResponse,
    DiseaseSimilarityResponse,
    DrugCandidate,
    GraphEdge,
    GraphNode,
    GraphPayload,
    NodeDetail,
    SearchResult,
    SimilarDisease,
    ShortestPathResponse,
)

GDS_GRAPH_NAME = "biokg_entity_undirected"
LUCENE_SPECIAL_CHARS = re.compile(r'([+\-&|!(){}\[\]^"~*?:\\/])')


def _node_id(primekg_index: int) -> str:
    return str(primekg_index)


def _edge_id(source: int, target: int, relationship_type: str, relation: str | None = None) -> str:
    relation_part = relation or relationship_type
    return f"{source}-{target}-{relationship_type}-{relation_part}"


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if hasattr(value, "iso_format"):
        return value.iso_format()
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _safe_properties(properties: dict[str, Any]) -> dict[str, Any]:
    return _json_safe(properties)


def _node_from_properties(properties: dict[str, Any]) -> GraphNode:
    properties = _safe_properties(properties)
    primekg_index = int(properties["primekg_index"])
    return GraphNode(
        id=_node_id(primekg_index),
        primekg_index=primekg_index,
        label=properties.get("name"),
        node_type=properties.get("node_type"),
        node_source=properties.get("node_source"),
        properties=properties,
    )


def _prefix_fulltext_query(query: str) -> str:
    terms = [term for term in query.strip().split() if term]
    escaped_terms = [LUCENE_SPECIAL_CHARS.sub(r"\\\1", term) for term in terms]
    return " AND ".join(f"{term}*" for term in escaped_terms)


class GraphRepository:
    def __init__(self, driver: Driver, settings: Settings) -> None:
        self.driver = driver
        self.database = settings.neo4j_database
        self.settings = settings

    def search(self, query: str, limit: int) -> list[SearchResult]:
        limit = min(limit, self.settings.max_search_limit)
        query = query.strip()
        if not query:
            return []

        cypher = """
        CALL db.index.fulltext.queryNodes('entity_fulltext', $query_text) YIELD node, score
        RETURN
            node.primekg_index AS primekg_index,
            node.name AS name,
            node.node_type AS node_type,
            node.node_source AS node_source,
            score
        ORDER BY score DESC
        LIMIT $limit
        """
        fallback_cypher = """
        MATCH (node:Entity)
        WHERE node.name_lc CONTAINS toLower($query_text)
        RETURN
            node.primekg_index AS primekg_index,
            node.name AS name,
            node.node_type AS node_type,
            node.node_source AS node_source,
            0.0 AS score
        ORDER BY node.name
        LIMIT $limit
        """
        with self.driver.session(database=self.database) as session:
            try:
                rows = list(session.run(cypher, query_text=_prefix_fulltext_query(query), limit=limit))
            except Exception:
                rows = []

            if len(rows) < limit:
                seen_indices = {record["primekg_index"] for record in rows}
                fallback_rows = list(
                    session.run(
                        fallback_cypher,
                        query_text=query,
                        limit=limit,
                    )
                )
                rows.extend(record for record in fallback_rows if record["primekg_index"] not in seen_indices)
                rows = rows[:limit]

        return [
            SearchResult(
                id=_node_id(record["primekg_index"]),
                primekg_index=record["primekg_index"],
                name=record["name"],
                node_type=record["node_type"],
                node_source=record["node_source"],
                score=record["score"],
            )
            for record in rows
        ]

    def get_node(self, node_id: int) -> NodeDetail | None:
        cypher = """
        MATCH (node:Entity {primekg_index: $node_id})
        RETURN properties(node) AS properties, labels(node) AS labels
        """
        with self.driver.session(database=self.database) as session:
            record = session.run(cypher, node_id=node_id).single()

        if record is None:
            return None

        properties = _safe_properties(dict(record["properties"]))
        primekg_index = int(properties["primekg_index"])
        return NodeDetail(
            id=_node_id(primekg_index),
            primekg_index=primekg_index,
            labels=list(record["labels"]),
            properties=properties,
        )

    def get_node_as_graph(self, node_id: int) -> GraphPayload | None:
        node = self.get_node(node_id)
        if node is None:
            return None
        return GraphPayload(nodes=[_node_from_properties(node.properties)], edges=[])

    def get_neighbors(
        self,
        node_id: int,
        limit: int,
        node_types: list[str] | None = None,
        relations: list[str] | None = None,
    ) -> GraphPayload:
        limit = min(limit, self.settings.max_neighbor_limit)
        node_types = node_types or []
        relations = relations or []

        cypher = """
        MATCH (source:Entity {primekg_index: $node_id})-[rel]-(target:Entity)
        WHERE ($node_types = [] OR target.node_type IN $node_types)
          AND ($relations = [] OR rel.relation IN $relations OR type(rel) IN $relations)
        RETURN
            properties(source) AS source_props,
            properties(target) AS target_props,
            type(rel) AS relationship_type,
            properties(rel) AS relationship_props
        LIMIT $limit
        """
        with self.driver.session(database=self.database) as session:
            rows = list(
                session.run(
                    cypher,
                    node_id=node_id,
                    node_types=node_types,
                    relations=relations,
                    limit=limit,
                )
            )

        nodes_by_id: dict[str, GraphNode] = {}
        edges: list[GraphEdge] = []

        for record in rows:
            source_props = _safe_properties(dict(record["source_props"]))
            target_props = _safe_properties(dict(record["target_props"]))
            rel_props = _safe_properties(dict(record["relationship_props"]))
            relationship_type = record["relationship_type"]

            source_node = _node_from_properties(source_props)
            target_node = _node_from_properties(target_props)
            nodes_by_id[source_node.id] = source_node
            nodes_by_id[target_node.id] = target_node

            edges.append(
                GraphEdge(
                    id=_edge_id(
                        source_node.primekg_index,
                        target_node.primekg_index,
                        relationship_type,
                        rel_props.get("relation"),
                    ),
                    source=source_node.id,
                    target=target_node.id,
                    label=rel_props.get("display_relation") or rel_props.get("relation") or relationship_type,
                    relationship_type=relationship_type,
                    relation=rel_props.get("relation"),
                    display_relation=rel_props.get("display_relation"),
                    properties=rel_props,
                )
            )

        return GraphPayload(nodes=list(nodes_by_id.values()), edges=edges)

    def shortest_path(self, source_id: int, target_id: int, max_hops: int, k: int = 1) -> ShortestPathResponse:
        k = max(1, min(k, 10))
        cypher = """
        MATCH (source:Entity {primekg_index: $source_id}),
              (target:Entity {primekg_index: $target_id})
        CALL gds.shortestPath.yens.stream($graph_name, {
            sourceNode: source,
            targetNode: target,
            k: $k
        })
        YIELD index, totalCost, nodeIds
        RETURN
            index,
            totalCost,
            [nodeId IN nodeIds | properties(gds.util.asNode(nodeId))] AS node_props,
            size(nodeIds) - 1 AS hops
        ORDER BY hops ASC
        """
        with self.driver.session(database=self.database) as session:
            self._ensure_gds_graph(session)
            records = list(session.run(cypher, graph_name=GDS_GRAPH_NAME, source_id=source_id, target_id=target_id, k=k))

        if not records:
            return ShortestPathResponse(found=False, hops=None, path_count=0, nodes=[], edges=[], paths=[])

        merged_nodes: dict[str, GraphNode] = {}
        merged_edges: dict[str, GraphEdge] = {}
        paths: list[GraphPayload] = []

        for record in records:
            path_nodes = [_node_from_properties(dict(node_props)) for node_props in record["node_props"]]
            path_edges: list[GraphEdge] = []
            for source_node, target_node in zip(path_nodes, path_nodes[1:]):
                original_rel = self._relationship_between(
                    source_node.primekg_index,
                    target_node.primekg_index,
                )
                rel_label = (
                    original_rel.get("display_relation")
                    or original_rel.get("relation")
                    or original_rel.get("relationship_type")
                    or "relationship"
                )
                edge = GraphEdge(
                    id=_edge_id(
                        source_node.primekg_index,
                        target_node.primekg_index,
                        original_rel.get("relationship_type") or "GDS_SHORTEST_PATH",
                        f"path_{record['index']}",
                    ),
                    source=source_node.id,
                    target=target_node.id,
                    label=f"{rel_label} (shortest path)",
                    relationship_type=original_rel.get("relationship_type") or "GDS_SHORTEST_PATH",
                    relation=original_rel.get("relation"),
                    display_relation=original_rel.get("display_relation"),
                    properties={
                        **original_rel.get("properties", {}),
                        "source": "Neo4j Graph Data Science",
                        "algorithm": "Yen's k-shortest paths",
                        "path_index": record["index"],
                        "total_cost": record["totalCost"],
                    },
                )
                path_edges.append(edge)
                merged_edges[edge.id] = edge

            for node in path_nodes:
                merged_nodes[node.id] = node
            paths.append(GraphPayload(nodes=path_nodes, edges=path_edges))

        return ShortestPathResponse(
            found=True,
            hops=records[0]["hops"],
            path_count=len(paths),
            nodes=list(merged_nodes.values()),
            edges=list(merged_edges.values()),
            paths=paths,
        )

    def _relationship_between(self, source_index: int, target_index: int) -> dict[str, Any]:
        cypher = """
        MATCH (source:Entity {primekg_index: $source_index})-[rel]-(target:Entity {primekg_index: $target_index})
        RETURN
            type(rel) AS relationship_type,
            rel.relation AS relation,
            rel.display_relation AS display_relation,
            properties(rel) AS properties
        LIMIT 1
        """
        with self.driver.session(database=self.database) as session:
            record = session.run(cypher, source_index=source_index, target_index=target_index).single()

        if record is None:
            return {}

        return {
            "relationship_type": record["relationship_type"],
            "relation": record["relation"],
            "display_relation": record["display_relation"],
            "properties": _safe_properties(dict(record["properties"])),
        }

    def _ensure_gds_graph(self, session) -> None:
        exists_record = session.run(
            "CALL gds.graph.exists($graph_name) YIELD exists RETURN exists",
            graph_name=GDS_GRAPH_NAME,
        ).single()
        if exists_record and exists_record["exists"]:
            return

        session.run(
            """
            CALL gds.graph.project(
                $graph_name,
                'Entity',
                { ALL_RELATIONSHIPS: { type: '*', orientation: 'UNDIRECTED' } }
            )
            YIELD graphName
            RETURN graphName
            """,
            graph_name=GDS_GRAPH_NAME,
        ).consume()

    def get_disease_candidate_drugs(
        self,
        disease_id: int,
        direct_limit: int = 25,
        repurposing_limit: int = 25,
    ) -> DiseaseCandidateDrugsResponse | None:
        disease = self.get_node(disease_id)
        if disease is None:
            return None
        if disease.properties.get("node_type") != "disease":
            return DiseaseCandidateDrugsResponse(
                disease_id=disease.id,
                disease_name=disease.properties.get("name"),
            )

        return DiseaseCandidateDrugsResponse(
            disease_id=disease.id,
            disease_name=disease.properties.get("name"),
            known=self._direct_drug_candidates(disease_id, "indication", "known", direct_limit),
            off_label=self._direct_drug_candidates(disease_id, "off-label use", "off_label", direct_limit),
            contraindicated=self._direct_drug_candidates(disease_id, "contraindication", "contraindicated", direct_limit),
            repurposing=self._repurposing_candidates(disease_id, repurposing_limit),
        )

    def get_similar_diseases(self, disease_id: int, limit: int = 10) -> DiseaseSimilarityResponse | None:
        disease = self.get_node(disease_id)
        if disease is None or disease.properties.get("node_type") != "disease":
            return None

        cypher = """
        MATCH (disease:Entity {primekg_index: $disease_id})-[similarity:SIMILAR_DISEASE]-(similar:Entity {node_type: 'disease'})
        WITH disease, similar, similarity
        ORDER BY similarity.score DESC, similarity.evidence_count DESC, similar.name
        LIMIT $limit
        OPTIONAL MATCH (disease)--(support:Entity)--(similar)
        WHERE support.node_type IN ['gene/protein', 'pathway', 'effect/phenotype']
        WITH
            disease,
            similar,
            similarity,
            collect(DISTINCT support)[0..6] AS support_nodes
        RETURN
            properties(disease) AS disease_props,
            properties(similar) AS similar_props,
            properties(similarity) AS similarity_props,
            [node IN support_nodes | properties(node)] AS support_props
        ORDER BY similarity_props.score DESC, similarity_props.evidence_count DESC, similar_props.name
        """
        with self.driver.session(database=self.database) as session:
            rows = list(session.run(cypher, disease_id=disease_id, limit=limit))

        similar_diseases: list[SimilarDisease] = []
        for record in rows:
            disease_node = _node_from_properties(dict(record["disease_props"]))
            similar_node = _node_from_properties(dict(record["similar_props"]))
            similarity_props = _safe_properties(dict(record["similarity_props"]))
            support_nodes = [_node_from_properties(dict(node_props)) for node_props in record["support_props"]]
            edge = GraphEdge(
                id=_edge_id(
                    disease_node.primekg_index,
                    similar_node.primekg_index,
                    "SIMILAR_DISEASE",
                    "disease_similarity",
                ),
                source=disease_node.id,
                target=similar_node.id,
                label="similar disease",
                relationship_type="SIMILAR_DISEASE",
                relation="disease_similarity",
                display_relation="similar disease",
                properties=similarity_props,
            )
            support_edges = [
                GraphEdge(
                    id=_edge_id(
                        disease_node.primekg_index,
                        support_node.primekg_index,
                        "SIMILARITY_SUPPORT",
                        f"{similar_node.primekg_index}_shared_evidence",
                    ),
                    source=disease_node.id,
                    target=support_node.id,
                    label="shared evidence",
                    relationship_type="SIMILARITY_SUPPORT",
                    relation="shared_evidence",
                    display_relation="shared evidence",
                    properties={"source": "computed", "evidence": "disease similarity support"},
                )
                for support_node in support_nodes
            ]
            support_edges.extend(
                GraphEdge(
                    id=_edge_id(
                        support_node.primekg_index,
                        similar_node.primekg_index,
                        "SIMILARITY_SUPPORT",
                        f"{disease_node.primekg_index}_shared_evidence",
                    ),
                    source=support_node.id,
                    target=similar_node.id,
                    label="shared evidence",
                    relationship_type="SIMILARITY_SUPPORT",
                    relation="shared_evidence",
                    display_relation="shared evidence",
                    properties={"source": "computed", "evidence": "disease similarity support"},
                )
                for support_node in support_nodes
            )
            similar_diseases.append(
                SimilarDisease(
                    id=similar_node.id,
                    primekg_index=similar_node.primekg_index,
                    name=similar_node.label,
                    score=float(similarity_props.get("score") or 0.0),
                    evidence_count=int(similarity_props.get("evidence_count") or 0),
                    shared_gene_count=int(similarity_props.get("shared_gene_count") or 0),
                    shared_pathway_count=int(similarity_props.get("shared_pathway_count") or 0),
                    shared_phenotype_count=int(similarity_props.get("shared_phenotype_count") or 0),
                    support_nodes=support_nodes,
                    graph=GraphPayload(
                        nodes=[disease_node, similar_node, *support_nodes],
                        edges=[edge, *support_edges],
                    ),
                )
            )

        return DiseaseSimilarityResponse(
            disease_id=disease.id,
            disease_name=disease.properties.get("name"),
            similar=similar_diseases,
        )

    def _direct_drug_candidates(
        self,
        disease_id: int,
        relation: str,
        category: str,
        limit: int,
    ) -> list[DrugCandidate]:
        cypher = """
        MATCH (disease:Entity {primekg_index: $disease_id})-[rel]-(drug:Entity {node_type: 'drug'})
        WHERE rel.relation = $relation
        RETURN
            properties(disease) AS disease_props,
            properties(drug) AS drug_props,
            type(rel) AS relationship_type,
            properties(rel) AS relationship_props
        ORDER BY drug.name
        LIMIT $limit
        """
        with self.driver.session(database=self.database) as session:
            rows = list(session.run(cypher, disease_id=disease_id, relation=relation, limit=limit))

        candidates: list[DrugCandidate] = []
        for record in rows:
            disease_props = _safe_properties(dict(record["disease_props"]))
            drug_props = _safe_properties(dict(record["drug_props"]))
            rel_props = _safe_properties(dict(record["relationship_props"]))
            disease_node = _node_from_properties(disease_props)
            drug_node = _node_from_properties(drug_props)
            relationship_type = record["relationship_type"]
            edge = GraphEdge(
                id=_edge_id(disease_node.primekg_index, drug_node.primekg_index, relationship_type, rel_props.get("relation")),
                source=disease_node.id,
                target=drug_node.id,
                label=rel_props.get("display_relation") or rel_props.get("relation") or relationship_type,
                relationship_type=relationship_type,
                relation=rel_props.get("relation"),
                display_relation=rel_props.get("display_relation"),
                properties=rel_props,
            )
            candidates.append(
                DrugCandidate(
                    id=drug_node.id,
                    primekg_index=drug_node.primekg_index,
                    name=drug_node.label,
                    category=category,
                    evidence_count=1,
                    relation=relation,
                    rationale=f"Direct PrimeKG relationship: {relation}",
                    graph=GraphPayload(nodes=[disease_node, drug_node], edges=[edge]),
                )
            )
        return candidates

    def _repurposing_candidates(self, disease_id: int, limit: int) -> list[DrugCandidate]:
        cypher = """
        MATCH (disease:Entity {primekg_index: $disease_id})-[disease_rel]-(support:Entity)-[drug_rel]-(drug:Entity {node_type: 'drug'})
        WHERE support.node_type IN ['gene/protein', 'pathway']
          AND disease_rel.relation IN ['disease_protein', 'pathway_protein']
          AND drug_rel.relation = 'drug_protein'
          AND NOT EXISTS {
            MATCH (disease)-[known_rel]-(drug)
            WHERE known_rel.relation IN ['indication', 'off-label use', 'contraindication']
          }
        WITH
            disease,
            drug,
            collect(DISTINCT support)[0..5] AS support_nodes,
            count(DISTINCT support) AS evidence_count
        RETURN
            properties(disease) AS disease_props,
            properties(drug) AS drug_props,
            [node IN support_nodes | properties(node)] AS support_props,
            evidence_count
        ORDER BY evidence_count DESC, drug.name
        LIMIT $limit
        """
        with self.driver.session(database=self.database) as session:
            rows = list(session.run(cypher, disease_id=disease_id, limit=limit))

        candidates: list[DrugCandidate] = []
        for record in rows:
            disease_node = _node_from_properties(dict(record["disease_props"]))
            drug_node = _node_from_properties(dict(record["drug_props"]))
            support_nodes = [_node_from_properties(dict(node_props)) for node_props in record["support_props"]]
            edges = [
                GraphEdge(
                    id=_edge_id(disease_node.primekg_index, support_node.primekg_index, "REPURPOSING_SUPPORT", "shared_target_or_pathway"),
                    source=disease_node.id,
                    target=support_node.id,
                    label="support",
                    relationship_type="REPURPOSING_SUPPORT",
                    relation="shared_target_or_pathway",
                    display_relation="support",
                    properties={"source": "computed", "evidence": "disease-support-drug path"},
                )
                for support_node in support_nodes
            ]
            edges.extend(
                GraphEdge(
                    id=_edge_id(support_node.primekg_index, drug_node.primekg_index, "REPURPOSING_SUPPORT", "shared_target_or_pathway"),
                    source=support_node.id,
                    target=drug_node.id,
                    label="support",
                    relationship_type="REPURPOSING_SUPPORT",
                    relation="shared_target_or_pathway",
                    display_relation="support",
                    properties={"source": "computed", "evidence": "disease-support-drug path"},
                )
                for support_node in support_nodes
            )
            candidates.append(
                DrugCandidate(
                    id=drug_node.id,
                    primekg_index=drug_node.primekg_index,
                    name=drug_node.label,
                    category="repurposing",
                    evidence_count=record["evidence_count"],
                    relation="shared_target_or_pathway",
                    rationale="Candidate connected through shared disease genes/proteins or pathways.",
                    support_nodes=support_nodes,
                    graph=GraphPayload(nodes=[disease_node, drug_node, *support_nodes], edges=edges),
                )
            )
        return candidates
