import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";

import {
  explainPath,
  getDiseaseCandidateDrugs,
  getNeighbors,
  getNode,
  getNodeGraph,
  getShortestPath,
  getSimilarDiseases,
} from "./api/graphApi";
import { AccordionPanel } from "./components/AccordionPanel";
import { CandidateDrugsPanel } from "./components/CandidateDrugsPanel";
import { GraphCanvas } from "./components/GraphCanvas";
import { NodeDetailsPanel } from "./components/NodeDetailsPanel";
import { NodeSimilarityPanel } from "./components/NodeSimilarityPanel";
import { SearchBar } from "./components/SearchBar";
import { ShortestPathPanel } from "./components/ShortestPathPanel";
import type {
  DiseaseCandidateDrugsResponse,
  DiseaseSimilarityResponse,
  GraphEdge,
  GraphNode,
  GraphPayload,
  NodeDetail,
  PathExplanationResponse,
  SearchResult,
  ShortestPathResponse,
} from "./types/graph";

function mergePayloads(payloads: GraphPayload[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();

  payloads.forEach((payload) => {
    payload.nodes.forEach((node) => nodeMap.set(node.id, node));
    payload.edges.forEach((edge) => edgeMap.set(edge.id, edge));
  });

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
  };
}

function nodeFromSearchResult(node: SearchResult): GraphNode {
  return {
    id: node.id,
    primekg_index: node.primekg_index,
    label: node.name,
    node_type: node.node_type,
    node_source: node.node_source,
    properties: {
      name: node.name,
      node_type: node.node_type,
      node_source: node.node_source,
      primekg_index: node.primekg_index,
    },
  };
}

function pathSignatureForPayload(path: GraphPayload | null): string | null {
  if (!path || path.nodes.length === 0 || path.edges.length === 0) {
    return null;
  }

  const nodePart = path.nodes.map((node) => node.id).join(">");
  const edgePart = path.edges
    .map((edge) => `${edge.source}-${edge.label ?? edge.relationship_type}-${edge.target}`)
    .join(">");
  return `${nodePart}::${edgePart}`;
}

function pathSignatureForShortestPath(path: ShortestPathResponse | null, requestedPathCount: number): string | null {
  if (!path?.found) {
    return null;
  }

  const pathSignatures = (path.paths.length > 0 ? path.paths : [{ nodes: path.nodes, edges: path.edges }])
    .map((pathPayload, index) => `${index}:${pathSignatureForPayload(pathPayload) ?? "empty"}`)
    .join("||");
  return `k=${requestedPathCount};found=${path.path_count};hops=${path.hops ?? "unknown"};${pathSignatures}`;
}

function shortestPathSubgraph(path: ShortestPathResponse | null): GraphPayload | null {
  if (!path?.found) {
    return null;
  }
  return { nodes: path.nodes, edges: path.edges };
}

const MIN_SIDEBAR_WIDTH = 260;
const MAX_SIDEBAR_WIDTH = 580;

function clampSidebarWidth(width: number): number {
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, width));
}

interface AppSnapshot {
  pinnedNodes: Map<string, GraphNode>;
  expansions: Map<string, GraphPayload>;
  pathPayload: ShortestPathResponse | null;
  selectedNodeId: string | null;
  selectedDetails: NodeDetail | null;
  sourceNode: GraphNode | null;
  targetNode: GraphNode | null;
  layoutAnchorNodeId: string | null;
  candidateDrugGraph: GraphPayload | null;
  similarityGraph: GraphPayload | null;
  pathNodeIds: Set<string>;
  pathEdgeIds: Set<string>;
  status: string;
}

export function App() {
  const [pinnedNodes, setPinnedNodes] = useState<Map<string, GraphNode>>(new Map());
  const [expansions, setExpansions] = useState<Map<string, GraphPayload>>(new Map());
  const [pathPayload, setPathPayload] = useState<ShortestPathResponse | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<NodeDetail | null>(null);
  const [sourceNode, setSourceNode] = useState<GraphNode | null>(null);
  const [targetNode, setTargetNode] = useState<GraphNode | null>(null);
  const [layoutAnchorNodeId, setLayoutAnchorNodeId] = useState<string | null>(null);
  const [candidateDrugGraph, setCandidateDrugGraph] = useState<GraphPayload | null>(null);
  const [similarityGraph, setSimilarityGraph] = useState<GraphPayload | null>(null);
  const [candidateDrugs, setCandidateDrugs] = useState<DiseaseCandidateDrugsResponse | null>(null);
  const [similarDiseases, setSimilarDiseases] = useState<DiseaseSimilarityResponse | null>(null);
  const [isCandidateDrugsLoading, setIsCandidateDrugsLoading] = useState(false);
  const [isSimilarityLoading, setIsSimilarityLoading] = useState(false);
  const [pathNodeIds, setPathNodeIds] = useState<Set<string>>(new Set());
  const [pathEdgeIds, setPathEdgeIds] = useState<Set<string>>(new Set());
  const [topKPaths, setTopKPaths] = useState(1);
  const [expansionNeighborLimit, setExpansionNeighborLimit] = useState(25);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [status, setStatus] = useState("Search for a biomedical entity to begin.");
  const [isPathLoading, setIsPathLoading] = useState(false);
  const [undoStack, setUndoStack] = useState<AppSnapshot[]>([]);
  const [pathExplanation, setPathExplanation] = useState<PathExplanationResponse | null>(null);
  const [pathExplanationError, setPathExplanationError] = useState<string | null>(null);
  const [isPathExplanationLoading, setIsPathExplanationLoading] = useState(false);
  const [pathExplanationCache, setPathExplanationCache] = useState<Map<string, PathExplanationResponse>>(new Map());
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(320);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(360);

  const createSnapshot = useCallback(
    (): AppSnapshot => ({
      pinnedNodes: new Map(pinnedNodes),
      expansions: new Map(expansions),
      pathPayload,
      selectedNodeId,
      selectedDetails,
      sourceNode,
      targetNode,
      layoutAnchorNodeId,
      candidateDrugGraph,
      similarityGraph,
      pathNodeIds: new Set(pathNodeIds),
      pathEdgeIds: new Set(pathEdgeIds),
      status,
    }),
    [
      candidateDrugGraph,
      expansions,
      layoutAnchorNodeId,
      pathEdgeIds,
      pathNodeIds,
      pathPayload,
      pinnedNodes,
      selectedDetails,
      selectedNodeId,
      similarityGraph,
      sourceNode,
      status,
      targetNode,
    ],
  );

  const pushUndoSnapshot = useCallback(() => {
    const snapshot = createSnapshot();
    setUndoStack((currentStack) => [...currentStack.slice(-49), snapshot]);
  }, [createSnapshot]);

  const restoreSnapshot = useCallback((snapshot: AppSnapshot) => {
    setPinnedNodes(new Map(snapshot.pinnedNodes));
    setExpansions(new Map(snapshot.expansions));
    setPathPayload(snapshot.pathPayload);
    setSelectedNodeId(snapshot.selectedNodeId);
    setSelectedDetails(snapshot.selectedDetails);
    setSourceNode(snapshot.sourceNode);
    setTargetNode(snapshot.targetNode);
    setLayoutAnchorNodeId(snapshot.layoutAnchorNodeId);
    setCandidateDrugGraph(snapshot.candidateDrugGraph);
    setSimilarityGraph(snapshot.similarityGraph);
    setPathNodeIds(new Set(snapshot.pathNodeIds));
    setPathEdgeIds(new Set(snapshot.pathEdgeIds));
    setStatus(snapshot.status);
  }, []);

  const handleUndo = useCallback(() => {
    setUndoStack((currentStack) => {
      const previousSnapshot = currentStack.at(-1);
      if (!previousSnapshot) {
        return currentStack;
      }
      restoreSnapshot(previousSnapshot);
      return currentStack.slice(0, -1);
    });
  }, [restoreSnapshot]);

  const { nodes, edges } = useMemo(() => {
    const payloads: GraphPayload[] = [
      { nodes: Array.from(pinnedNodes.values()), edges: [] },
      ...Array.from(expansions.values()),
    ];
    if (pathPayload) {
      payloads.push(pathPayload);
    }
    if (candidateDrugGraph) {
      payloads.push(candidateDrugGraph);
    }
    if (similarityGraph) {
      payloads.push(similarityGraph);
    }
    return mergePayloads(payloads);
  }, [candidateDrugGraph, expansions, pathPayload, pinnedNodes, similarityGraph]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const currentExplanationPath = useMemo<GraphPayload | null>(() => {
    if (!pathPayload?.found) {
      return null;
    }
    return pathPayload.paths[0] ?? { nodes: pathPayload.nodes, edges: pathPayload.edges };
  }, [pathPayload]);

  const currentExplanationSubgraph = useMemo(() => shortestPathSubgraph(pathPayload), [pathPayload]);

  const currentPathSignature = useMemo(
    () => pathSignatureForShortestPath(pathPayload, topKPaths),
    [pathPayload, topKPaths],
  );

  const expansionGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    expansions.forEach((payload, anchorNodeId) => {
      groups.set(
        anchorNodeId,
        payload.nodes.map((node) => node.id).filter((nodeId) => nodeId !== anchorNodeId),
      );
    });
    return groups;
  }, [expansions]);

  useEffect(() => {
    if (selectedDetails?.properties.node_type !== "disease") {
      setCandidateDrugs(null);
      setIsCandidateDrugsLoading(false);
      setSimilarDiseases(null);
      setIsSimilarityLoading(false);
      return;
    }

    let isActive = true;
    setIsCandidateDrugsLoading(true);
    setIsSimilarityLoading(true);
    getDiseaseCandidateDrugs(selectedDetails.primekg_index)
      .then((response) => {
        if (isActive) {
          setCandidateDrugs(response);
        }
      })
      .catch((error) => {
        console.error(error);
        if (isActive) {
          setCandidateDrugs(null);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsCandidateDrugsLoading(false);
        }
      });
    getSimilarDiseases(selectedDetails.primekg_index)
      .then((response) => {
        if (isActive) {
          setSimilarDiseases(response);
        }
      })
      .catch((error) => {
        console.error(error);
        if (isActive) {
          setSimilarDiseases(null);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsSimilarityLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [selectedDetails]);

  useEffect(() => {
    setPathExplanationError(null);
    setIsPathExplanationLoading(false);
    if (!currentPathSignature) {
      setPathExplanation(null);
      return;
    }
    setPathExplanation(pathExplanationCache.get(currentPathSignature) ?? null);
  }, [currentPathSignature, pathExplanationCache]);

  const handleSelectSearchNode = async (node: SearchResult) => {
    pushUndoSnapshot();
    const searchNode = nodeFromSearchResult(node);
    setPinnedNodes((currentNodes) => new Map(currentNodes).set(searchNode.id, searchNode));
    setLayoutAnchorNodeId(searchNode.id);
    setSelectedNodeId(node.id);
    setStatus(`Selected ${node.name ?? node.id}.`);

    try {
      const [details, graph] = await Promise.all([getNode(node.primekg_index), getNodeGraph(node.primekg_index)]);
      setSelectedDetails(details);
      setPinnedNodes((currentNodes) => {
        const nextNodes = new Map(currentNodes);
        graph.nodes.forEach((graphNode) => nextNodes.set(graphNode.id, graphNode));
        return nextNodes;
      });
    } catch (error) {
      console.error(error);
      setStatus("Unable to fetch node details. Is the backend running?");
    }
  };

  const handleNodeClick = useCallback(async (nodeId: string) => {
    pushUndoSnapshot();
    setSelectedNodeId(nodeId);
    try {
      const details = await getNode(nodeId);
      setSelectedDetails(details);
      setStatus(`Viewing ${details.properties.name ?? nodeId}.`);
    } catch (error) {
      console.error(error);
      setStatus("Unable to fetch node details.");
    }
  }, [pushUndoSnapshot]);

  const handleNodeDoubleClick = useCallback(async (nodeId: string) => {
    pushUndoSnapshot();
    setLayoutAnchorNodeId(nodeId);
    if (expansions.has(nodeId)) {
      setExpansions((currentExpansions) => {
        const nextExpansions = new Map(currentExpansions);
        nextExpansions.delete(nodeId);
        return nextExpansions;
      });
      setStatus(`Collapsed neighbors for node ${nodeId}.`);
      return;
    }

    setStatus(`Expanding up to ${expansionNeighborLimit} neighbors...`);
    try {
      const payload = await getNeighbors(nodeId, { limit: expansionNeighborLimit });
      setExpansions((currentExpansions) => new Map(currentExpansions).set(nodeId, payload));
      setStatus(`Expanded node ${nodeId} with ${payload.nodes.length} nodes and ${payload.edges.length} edges.`);
    } catch (error) {
      console.error(error);
      setStatus("Unable to expand neighbors.");
    }
  }, [expansionNeighborLimit, expansions, pushUndoSnapshot]);

  const handleFindPath = async () => {
    if (!sourceNode || !targetNode) {
      return;
    }

    pushUndoSnapshot();
    setIsPathLoading(true);
    setStatus("Computing shortest path...");
    try {
      const path = await getShortestPath({
        sourceNodeId: sourceNode.primekg_index,
        targetNodeId: targetNode.primekg_index,
        maxHops: 5,
        k: topKPaths,
      });

      if (!path.found) {
        setPathPayload(null);
        setStatus("No path found within the configured hop limit.");
        setPathNodeIds(new Set());
        setPathEdgeIds(new Set());
        return;
      }

      setPathPayload(path);
      setLayoutAnchorNodeId(sourceNode.id);
      setPathNodeIds(new Set(path.nodes.map((node) => node.id)));
      setPathEdgeIds(new Set(path.edges.map((edge) => edge.id)));
      setStatus(`Found ${path.path_count} path${path.path_count === 1 ? "" : "s"}; shortest has ${path.hops} hops.`);
    } catch (error) {
      console.error(error);
      setStatus("Unable to compute shortest path.");
    } finally {
      setIsPathLoading(false);
    }
  };

  const handleSetSource = useCallback(() => {
    if (!selectedNode) {
      return;
    }
    pushUndoSnapshot();
    setSourceNode(selectedNode);
  }, [pushUndoSnapshot, selectedNode]);

  const handleSetTarget = useCallback(() => {
    if (!selectedNode) {
      return;
    }
    pushUndoSnapshot();
    setTargetNode(selectedNode);
  }, [pushUndoSnapshot, selectedNode]);

  const handlePathCountChange = useCallback((pathCount: number) => {
    setTopKPaths(pathCount);
    setPathExplanation(null);
    setPathExplanationError(null);
    setIsPathExplanationLoading(false);
  }, []);

  const handleClearPath = useCallback(() => {
    pushUndoSnapshot();
    setPathPayload(null);
    setPathNodeIds(new Set());
    setPathEdgeIds(new Set());
  }, [pushUndoSnapshot]);

  const handleGeneratePathExplanation = useCallback(async () => {
    if (!currentExplanationPath || !currentExplanationSubgraph || !currentPathSignature) {
      return;
    }

    const cachedExplanation = pathExplanationCache.get(currentPathSignature);
    if (cachedExplanation) {
      setPathExplanation(cachedExplanation);
      setPathExplanationError(null);
      return;
    }

    setIsPathExplanationLoading(true);
    setPathExplanationError(null);
    try {
      const response = await explainPath({
        path: currentExplanationPath,
        subgraph: currentExplanationSubgraph,
        paths: pathPayload?.paths.length ? pathPayload.paths : [currentExplanationPath],
        subgraphContext: {
          kind: "shortest_paths",
          requested_top_k: topKPaths,
          returned_path_count: pathPayload?.path_count ?? 0,
          shortest_hops: pathPayload?.hops ?? null,
          source_node_id: sourceNode?.primekg_index ?? null,
          target_node_id: targetNode?.primekg_index ?? null,
        },
        sourceNodeId: sourceNode?.primekg_index,
        targetNodeId: targetNode?.primekg_index,
        pathIndex: 0,
        pathSignature: currentPathSignature,
      });
      setPathExplanation(response);
      setPathExplanationCache((currentCache) => new Map(currentCache).set(currentPathSignature, response));
    } catch (error) {
      console.error(error);
      setPathExplanation(null);
      setPathExplanationError(error instanceof Error ? error.message : "Unable to generate path explanation.");
    } finally {
      setIsPathExplanationLoading(false);
    }
  }, [
    currentExplanationPath,
    currentExplanationSubgraph,
    currentPathSignature,
    pathExplanationCache,
    pathPayload,
    sourceNode,
    targetNode,
    topKPaths,
  ]);

  const handleAddCandidateGraph = useCallback(
    (payload: GraphPayload, anchorNodeId: string) => {
      pushUndoSnapshot();
      setCandidateDrugGraph(payload);
      setLayoutAnchorNodeId(anchorNodeId);
      setStatus("Added candidate drug evidence to the graph.");
    },
    [pushUndoSnapshot],
  );

  const handleAddSimilarityGraph = useCallback(
    (payload: GraphPayload, anchorNodeId: string) => {
      pushUndoSnapshot();
      setSimilarityGraph(payload);
      setLayoutAnchorNodeId(anchorNodeId);
      setStatus("Added disease similarity evidence to the graph.");
    },
    [pushUndoSnapshot],
  );

  const handleSidebarResizeStart = useCallback(
    (side: "left" | "right", event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = side === "left" ? leftSidebarWidth : rightSidebarWidth;

      const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        const nextWidth = side === "left" ? startWidth + delta : startWidth - delta;
        if (side === "left") {
          setLeftSidebarWidth(clampSidebarWidth(nextWidth));
        } else {
          setRightSidebarWidth(clampSidebarWidth(nextWidth));
        }
      };

      const handlePointerUp = () => {
        document.body.classList.remove("is-resizing-sidebar");
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      document.body.classList.add("is-resizing-sidebar");
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [leftSidebarWidth, rightSidebarWidth],
  );

  const appShellStyle = {
    "--left-sidebar-width": `${leftSidebarWidth}px`,
    "--right-sidebar-width": `${rightSidebarWidth}px`,
  } as CSSProperties;

  return (
    <main className={`app-shell${isDarkMode ? " dark-mode" : ""}`} style={appShellStyle}>
      <header className="app-header">
        <div className="header-actions">
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setIsDarkMode((currentMode) => !currentMode)}
            aria-pressed={isDarkMode}
          >
            {isDarkMode ? "Light mode" : "Dark mode"}
          </button>
          <button className="undo-button" type="button" disabled={undoStack.length === 0} onClick={handleUndo}>
            Undo
          </button>
        </div>
        <div className="brand-block">
          <img className="brand-logo" src="/logo.png" alt="BioKG Explorer logo" />
          <div>
            <h1>BioKG Explorer</h1>
            <p>Interactive biomedical knowledge graph analytics</p>
          </div>
        </div>
        <span>{status}</span>
      </header>

      <aside className="left-sidebar">
        <button
          className="sidebar-resize-handle sidebar-resize-handle-left"
          type="button"
          aria-label="Resize left sidebar"
          onPointerDown={(event) => handleSidebarResizeStart("left", event)}
        />
        <SearchBar onSelectNode={handleSelectSearchNode} />
        <AccordionPanel className="expansion-panel" title="Expansion">
          <p className="hint">Double-click a node to show at most this many 1-hop neighbors.</p>
          <label className="path-count-control" htmlFor="expansion-neighbor-limit">
            <span>Max neighbors</span>
            <select
              id="expansion-neighbor-limit"
              value={expansionNeighborLimit}
              onChange={(event) => setExpansionNeighborLimit(Number(event.target.value))}
            >
              {[5, 10, 25, 50, 100, 200].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </AccordionPanel>
        <ShortestPathPanel
          selectedNode={selectedNode}
          sourceNode={sourceNode}
          targetNode={targetNode}
          pathCount={topKPaths}
          isLoading={isPathLoading}
          onPathCountChange={handlePathCountChange}
          onSetSource={handleSetSource}
          onSetTarget={handleSetTarget}
          onFindPath={handleFindPath}
          onClearPath={handleClearPath}
          canExplainPath={Boolean(currentExplanationPath && currentPathSignature)}
          pathExplanation={pathExplanation}
          pathExplanationError={pathExplanationError}
          isPathExplanationLoading={isPathExplanationLoading}
          onGeneratePathExplanation={handleGeneratePathExplanation}
        />
      </aside>

      <section className="graph-panel">
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          selectedNodeId={selectedNodeId}
          layoutAnchorNodeId={layoutAnchorNodeId}
          isDarkMode={isDarkMode}
          expansionGroups={expansionGroups}
          pathNodeIds={pathNodeIds}
          pathEdgeIds={pathEdgeIds}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
        />
      </section>

      <aside className="right-sidebar">
        <button
          className="sidebar-resize-handle sidebar-resize-handle-right"
          type="button"
          aria-label="Resize right sidebar"
          onPointerDown={(event) => handleSidebarResizeStart("right", event)}
        />
        <NodeDetailsPanel node={selectedDetails} />
        <CandidateDrugsPanel
          selectedNode={selectedDetails}
          candidates={candidateDrugs}
          isLoading={isCandidateDrugsLoading}
          onAddCandidateGraph={handleAddCandidateGraph}
        />
        <NodeSimilarityPanel
          selectedNode={selectedDetails}
          similarity={similarDiseases}
          isLoading={isSimilarityLoading}
          onAddSimilarityGraph={handleAddSimilarityGraph}
        />
      </aside>
    </main>
  );
}
