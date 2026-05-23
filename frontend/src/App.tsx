import { useCallback, useMemo, useState } from "react";

import { getNeighbors, getNode, getNodeGraph, getShortestPath } from "./api/graphApi";
import { GraphCanvas } from "./components/GraphCanvas";
import { NodeDetailsPanel } from "./components/NodeDetailsPanel";
import { SearchBar } from "./components/SearchBar";
import { ShortestPathPanel } from "./components/ShortestPathPanel";
import type { GraphEdge, GraphNode, GraphPayload, NodeDetail, SearchResult } from "./types/graph";

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

export function App() {
  const [pinnedNodes, setPinnedNodes] = useState<Map<string, GraphNode>>(new Map());
  const [expansions, setExpansions] = useState<Map<string, GraphPayload>>(new Map());
  const [pathPayload, setPathPayload] = useState<GraphPayload | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<NodeDetail | null>(null);
  const [sourceNode, setSourceNode] = useState<GraphNode | null>(null);
  const [targetNode, setTargetNode] = useState<GraphNode | null>(null);
  const [layoutAnchorNodeId, setLayoutAnchorNodeId] = useState<string | null>(null);
  const [pathNodeIds, setPathNodeIds] = useState<Set<string>>(new Set());
  const [pathEdgeIds, setPathEdgeIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState("Search for a biomedical entity to begin.");
  const [isPathLoading, setIsPathLoading] = useState(false);

  const { nodes, edges } = useMemo(() => {
    const payloads: GraphPayload[] = [
      { nodes: Array.from(pinnedNodes.values()), edges: [] },
      ...Array.from(expansions.values()),
    ];
    if (pathPayload) {
      payloads.push(pathPayload);
    }
    return mergePayloads(payloads);
  }, [expansions, pathPayload, pinnedNodes]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const handleSelectSearchNode = async (node: SearchResult) => {
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
    setSelectedNodeId(nodeId);
    try {
      const details = await getNode(nodeId);
      setSelectedDetails(details);
      setStatus(`Viewing ${details.properties.name ?? nodeId}.`);
    } catch (error) {
      console.error(error);
      setStatus("Unable to fetch node details.");
    }
  }, []);

  const handleNodeDoubleClick = useCallback(async (nodeId: string) => {
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

    setStatus("Expanding 1-hop neighborhood...");
    try {
      const payload = await getNeighbors(nodeId, { limit: 100 });
      setExpansions((currentExpansions) => new Map(currentExpansions).set(nodeId, payload));
      setStatus(`Expanded node ${nodeId} with ${payload.nodes.length} nodes and ${payload.edges.length} edges.`);
    } catch (error) {
      console.error(error);
      setStatus("Unable to expand neighbors.");
    }
  }, [expansions]);

  const handleFindPath = async () => {
    if (!sourceNode || !targetNode) {
      return;
    }

    setIsPathLoading(true);
    setStatus("Computing shortest path...");
    try {
      const path = await getShortestPath({
        sourceNodeId: sourceNode.primekg_index,
        targetNodeId: targetNode.primekg_index,
        maxHops: 5,
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
      setStatus(`Shortest path found with ${path.hops} hops.`);
    } catch (error) {
      console.error(error);
      setStatus("Unable to compute shortest path.");
    } finally {
      setIsPathLoading(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>BioKG Explorer</h1>
          <p>Interactive biomedical knowledge graph analytics over PrimeKG.</p>
        </div>
        <span>{status}</span>
      </header>

      <aside className="left-sidebar">
        <SearchBar onSelectNode={handleSelectSearchNode} />
        <ShortestPathPanel
          selectedNode={selectedNode}
          sourceNode={sourceNode}
          targetNode={targetNode}
          isLoading={isPathLoading}
          onSetSource={() => selectedNode && setSourceNode(selectedNode)}
          onSetTarget={() => selectedNode && setTargetNode(selectedNode)}
          onFindPath={handleFindPath}
          onClearPath={() => {
            setPathPayload(null);
            setPathNodeIds(new Set());
            setPathEdgeIds(new Set());
          }}
        />
      </aside>

      <section className="graph-panel">
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          selectedNodeId={selectedNodeId}
          layoutAnchorNodeId={layoutAnchorNodeId}
          pathNodeIds={pathNodeIds}
          pathEdgeIds={pathEdgeIds}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
        />
      </section>

      <aside className="right-sidebar">
        <NodeDetailsPanel node={selectedDetails} />
      </aside>
    </main>
  );
}
