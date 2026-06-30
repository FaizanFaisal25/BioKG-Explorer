import type {
  DiseaseCandidateDrugsResponse,
  DiseaseSimilarityResponse,
  GraphPayload,
  NodeDetail,
  PathExplanationRequest,
  PathExplanationResponse,
  SearchResult,
  ShortestPathRequest,
  ShortestPathResponse,
} from "../types/graph";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function searchNodes(query: string, limit = 10, signal?: AbortSignal): Promise<SearchResult[]> {
  const params = new URLSearchParams({ query, limit: String(limit) });
  return requestJson<SearchResult[]>(`/search?${params.toString()}`, { signal });
}

export function getNode(nodeId: number | string): Promise<NodeDetail> {
  return requestJson<NodeDetail>(`/node/${nodeId}`);
}

export function getNodeGraph(nodeId: number | string): Promise<GraphPayload> {
  return requestJson<GraphPayload>(`/node/${nodeId}/graph`);
}

export function getNeighbors(
  nodeId: number | string,
  options: { limit?: number; nodeTypes?: string[]; relations?: string[] } = {},
): Promise<GraphPayload> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? 100),
  });
  if (options.nodeTypes?.length) {
    params.set("node_types", options.nodeTypes.join(","));
  }
  if (options.relations?.length) {
    params.set("relations", options.relations.join(","));
  }
  return requestJson<GraphPayload>(`/node/${nodeId}/neighbors?${params.toString()}`);
}

export function getDiseaseCandidateDrugs(
  diseaseId: number | string,
  options: { directLimit?: number; repurposingLimit?: number } = {},
): Promise<DiseaseCandidateDrugsResponse> {
  const params = new URLSearchParams({
    direct_limit: String(options.directLimit ?? 25),
    repurposing_limit: String(options.repurposingLimit ?? 25),
  });
  return requestJson<DiseaseCandidateDrugsResponse>(`/disease/${diseaseId}/candidate-drugs?${params.toString()}`);
}

export function getSimilarDiseases(
  diseaseId: number | string,
  options: { limit?: number } = {},
): Promise<DiseaseSimilarityResponse> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? 10),
  });
  return requestJson<DiseaseSimilarityResponse>(`/disease/${diseaseId}/similar?${params.toString()}`);
}

export function getShortestPath(request: ShortestPathRequest): Promise<ShortestPathResponse> {
  return requestJson<ShortestPathResponse>("/shortest-path", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function explainPath(request: PathExplanationRequest): Promise<PathExplanationResponse> {
  return requestJson<PathExplanationResponse>("/path-explanation", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
