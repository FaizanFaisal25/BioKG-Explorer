from typing import Any

from neo4j import Driver

from backend.app.core.config import Settings
from backend.app.schemas.graph import GraphEdge, GraphNode, GraphPayload, NodeDetail, SearchResult, ShortestPathResponse


def _node_id(primekg_index: int) -> str:
    return str(primekg_index)


def _edge_id(source: int, target: int, relationship_type: str, relation: str | None = None) -> str:
    relation_part = relation or relationship_type
    return f"{source}-{target}-{relationship_type}-{relation_part}"


def _node_from_properties(properties: dict[str, Any]) -> GraphNode:
    primekg_index = int(properties["primekg_index"])
    return GraphNode(
        id=_node_id(primekg_index),
        primekg_index=primekg_index,
        label=properties.get("name"),
        node_type=properties.get("node_type"),
        node_source=properties.get("node_source"),
        properties=properties,
    )


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
                rows = list(session.run(cypher, query_text=query, limit=limit))
            except Exception:
                rows = list(session.run(fallback_cypher, query_text=query, limit=limit))

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

        properties = dict(record["properties"])
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
            source_props = dict(record["source_props"])
            target_props = dict(record["target_props"])
            rel_props = dict(record["relationship_props"])
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

    def shortest_path(self, source_id: int, target_id: int, max_hops: int) -> ShortestPathResponse:
        max_hops = max(1, min(max_hops, self.settings.max_shortest_path_hops))
        cypher = f"""
        MATCH (source:Entity {{primekg_index: $source_id}}),
              (target:Entity {{primekg_index: $target_id}})
        MATCH path = shortestPath((source)-[*..{max_hops}]-(target))
        RETURN
            [node IN nodes(path) | properties(node)] AS node_props,
            [rel IN relationships(path) | {{
                relationship_type: type(rel),
                properties: properties(rel),
                source: startNode(rel).primekg_index,
                target: endNode(rel).primekg_index
            }}] AS rel_props,
            length(path) AS hops
        """
        with self.driver.session(database=self.database) as session:
            record = session.run(cypher, source_id=source_id, target_id=target_id).single()

        if record is None:
            return ShortestPathResponse(found=False, hops=None, nodes=[], edges=[])

        nodes = [_node_from_properties(dict(node_props)) for node_props in record["node_props"]]
        edges: list[GraphEdge] = []
        for rel in record["rel_props"]:
            rel_properties = dict(rel["properties"])
            relationship_type = rel["relationship_type"]
            source = int(rel["source"])
            target = int(rel["target"])
            edges.append(
                GraphEdge(
                    id=_edge_id(source, target, relationship_type, rel_properties.get("relation")),
                    source=_node_id(source),
                    target=_node_id(target),
                    label=rel_properties.get("display_relation") or rel_properties.get("relation") or relationship_type,
                    relationship_type=relationship_type,
                    relation=rel_properties.get("relation"),
                    display_relation=rel_properties.get("display_relation"),
                    properties=rel_properties,
                )
            )

        return ShortestPathResponse(found=True, hops=record["hops"], nodes=nodes, edges=edges)
