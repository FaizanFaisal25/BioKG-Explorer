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

export interface DrugCandidate {
  id: string;
  primekg_index: number;
  name?: string | null;
  category: "known" | "off_label" | "contraindicated" | "repurposing" | string;
  evidence_count: number;
  relation?: string | null;
  rationale?: string | null;
  support_nodes: GraphNode[];
  graph: GraphPayload;
}

export interface DiseaseCandidateDrugsResponse {
  disease_id: string;
  disease_name?: string | null;
  known: DrugCandidate[];
  off_label: DrugCandidate[];
  contraindicated: DrugCandidate[];
  repurposing: DrugCandidate[];
}

export interface SimilarDisease {
  id: string;
  primekg_index: number;
  name?: string | null;
  score: number;
  evidence_count: number;
  shared_gene_count: number;
  shared_pathway_count: number;
  shared_phenotype_count: number;
  support_nodes: GraphNode[];
  graph: GraphPayload;
}

export interface DiseaseSimilarityResponse {
  disease_id: string;
  disease_name?: string | null;
  similar: SimilarDisease[];
}

export interface ShortestPathRequest {
  sourceNodeId: number | string;
  targetNodeId: number | string;
  maxHops?: number;
  k?: number;
}

export interface ShortestPathResponse extends GraphPayload {
  hops?: number | null;
  found: boolean;
  path_count: number;
  paths: GraphPayload[];
}

export interface PathExplanationRequest {
  path?: GraphPayload | null;
  subgraph?: GraphPayload | null;
  paths?: GraphPayload[];
  subgraphContext?: Record<string, unknown>;
  sourceNodeId?: number | string | null;
  targetNodeId?: number | string | null;
  pathIndex?: number | null;
  pathSignature?: string | null;
}

export interface PathExplanationResponse {
  explanation: string;
  model: string;
  path_signature: string;
}
