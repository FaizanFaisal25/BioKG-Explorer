export type NodeProperties = Record<string, unknown>;
export type EdgeProperties = Record<string, unknown>;

export interface GraphNode {
  id: string;
  primekg_index: number;
  label?: string | null;
  node_type?: string | null;
  node_source?: string | null;
  properties: NodeProperties;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string | null;
  relationship_type: string;
  relation?: string | null;
  display_relation?: string | null;
  properties: EdgeProperties;
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface SearchResult {
  id: string;
  primekg_index: number;
  name?: string | null;
  node_type?: string | null;
  node_source?: string | null;
  score?: number | null;
}

export interface NodeDetail {
  id: string;
  primekg_index: number;
  labels: string[];
  properties: NodeProperties;
}

export interface ShortestPathRequest {
  sourceNodeId: number | string;
  targetNodeId: number | string;
  maxHops?: number;
}

export interface ShortestPathResponse extends GraphPayload {
  hops?: number | null;
  found: boolean;
}
