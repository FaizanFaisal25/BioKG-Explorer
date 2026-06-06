import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  pointer,
  select,
  zoom,
  zoomIdentity,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
  type ZoomBehavior,
  type ZoomTransform,
} from "d3";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { GraphEdge, GraphNode } from "../types/graph";

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  layoutAnchorNodeId: string | null;
  isDarkMode: boolean;
  expansionGroups: Map<string, string[]>;
  pathNodeIds: Set<string>;
  pathEdgeIds: Set<string>;
  onNodeClick: (nodeId: string) => void;
  onNodeDoubleClick: (nodeId: string) => void;
}

interface PositionedNode extends SimulationNodeDatum {
  id: string;
  label: string;
  color: string;
  radius: number;
  nodeType?: string | null;
}

interface PositionedLink extends SimulationLinkDatum<PositionedNode> {
  id: string;
  source: string | PositionedNode;
  target: string | PositionedNode;
  label: string;
}

const nodeColors: Record<string, string> = {
  disease: "#ef4444",
  drug: "#2563eb",
  "gene/protein": "#16a34a",
  "effect/phenotype": "#a855f7",
  anatomy: "#f97316",
  pathway: "#0d9488",
  exposure: "#64748b",
  biological_process: "#84cc16",
  molecular_function: "#06b6d4",
  cellular_component: "#eab308",
};

function colorForNode(node: GraphNode): string {
  return nodeColors[node.node_type ?? ""] ?? "#475569";
}

function sizeForNode(node: GraphNode): number {
  const degreeSize = node.properties.degree_size;
  if (typeof degreeSize === "number" && Number.isFinite(degreeSize)) {
    return Math.max(26, Math.min(degreeSize, 76));
  }
  return 34;
}

function expandedNodeOffset(index: number, total: number): { x: number; y: number } {
  const baseRadius = 120;
  const ringSpacing = 88;
  const baseRingSize = 12;
  let remainingIndex = index;
  let ring = 0;
  let ringSize = Math.min(total, baseRingSize);

  while (remainingIndex >= ringSize) {
    remainingIndex -= ringSize;
    ring += 1;
    ringSize = Math.min(total - index + remainingIndex, baseRingSize + ring * 6);
  }

  const radius = baseRadius + ring * ringSpacing;
  const angle = (remainingIndex / Math.max(ringSize, 1)) * Math.PI * 2 + ring * 0.32;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function nodePosition(nodeId: string, positions: Map<string, { x: number; y: number }>): { x: number; y: number } {
  return positions.get(nodeId) ?? { x: 0, y: 0 };
}

function linkEndpoint(endpoint: string | PositionedNode): string {
  return typeof endpoint === "string" ? endpoint : endpoint.id;
}

function resolveExpansionCollisions(
  nodeIds: string[],
  movingNodeIds: string[],
  positions: Map<string, { x: number; y: number }>,
  radii: Map<string, number>,
): void {
  const movingSet = new Set(movingNodeIds);
  const maxStep = 14;

  for (let iteration = 0; iteration < 70; iteration += 1) {
    nodeIds.forEach((sourceId, sourceIndex) => {
      const sourcePosition = positions.get(sourceId);
      if (!sourcePosition) {
        return;
      }

      for (let targetIndex = sourceIndex + 1; targetIndex < nodeIds.length; targetIndex += 1) {
        const targetId = nodeIds[targetIndex];
        const sourceCanMove = movingSet.has(sourceId);
        const targetCanMove = movingSet.has(targetId);
        if (!sourceCanMove && !targetCanMove) {
          continue;
        }

        const targetPosition = positions.get(targetId);
        if (!targetPosition) {
          continue;
        }

        let dx = targetPosition.x - sourcePosition.x;
        let dy = targetPosition.y - sourcePosition.y;
        let distance = Math.hypot(dx, dy);
        if (distance === 0) {
          const angle = ((sourceIndex + targetIndex + 1) / Math.max(nodeIds.length, 1)) * Math.PI * 2;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }

        const minDistance = (radii.get(sourceId) ?? 18) + (radii.get(targetId) ?? 18) + 42;
        if (distance >= minDistance) {
          continue;
        }

        const overlap = Math.min((minDistance - distance) * 0.42, maxStep);
        const pushX = (dx / distance) * overlap;
        const pushY = (dy / distance) * overlap;

        if (sourceCanMove && targetCanMove) {
          sourcePosition.x -= pushX / 2;
          sourcePosition.y -= pushY / 2;
          targetPosition.x += pushX / 2;
          targetPosition.y += pushY / 2;
        } else if (sourceCanMove) {
          sourcePosition.x -= pushX;
          sourcePosition.y -= pushY;
        } else if (targetCanMove) {
          targetPosition.x += pushX;
          targetPosition.y += pushY;
        }
      }
    });
  }
}

function simulateInitialLayout(nodes: PositionedNode[], links: PositionedLink[]): void {
  const simulationLinks = links.map((link) => ({ ...link }));
  const simulation = forceSimulation(nodes)
    .force(
      "link",
      forceLink<PositionedNode, PositionedLink>(simulationLinks)
        .id((node) => node.id)
        .distance(125)
        .strength(0.35),
    )
    .force("charge", forceManyBody<PositionedNode>().strength(-260))
    .force("collide", forceCollide<PositionedNode>().radius((node) => node.radius + 24).strength(0.92))
    .stop();

  for (let index = 0; index < 160; index += 1) {
    simulation.tick();
  }
}

export function D3GraphCanvas({
  nodes,
  edges,
  selectedNodeId,
  layoutAnchorNodeId,
  isDarkMode,
  expansionGroups,
  pathNodeIds,
  pathEdgeIds,
  onNodeClick,
  onNodeDoubleClick,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const knownNodeIdsRef = useRef<Set<string>>(new Set());
  const knownEdgeIdsRef = useRef<Set<string>>(new Set());
  const hasFitInitialGraphRef = useRef(false);
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const expansionGroupsRef = useRef(expansionGroups);
  const dragGroupRef = useRef<{
    anchorId: string;
    anchorStartPosition: { x: number; y: number };
    memberStartPositions: Map<string, { x: number; y: number }>;
    pointerStartPosition: { x: number; y: number };
  } | null>(null);
  const didDragRef = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [transform, setTransform] = useState(zoomIdentity);
  const [renderVersion, setRenderVersion] = useState(0);

  useEffect(() => {
    expansionGroupsRef.current = expansionGroups;
  }, [expansionGroups]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.12, 4])
      .on("zoom", (event) => {
        transformRef.current = event.transform;
        setTransform(event.transform);
      });
    zoomBehaviorRef.current = zoomBehavior;
    select(svg).call(zoomBehavior).on("dblclick.zoom", null);

    return () => {
      select(svg).on(".zoom", null);
    };
  }, []);

  const renderNodes = useMemo<PositionedNode[]>(
    () =>
      nodes.map((node) => {
        const position = nodePosition(node.id, positionsRef.current);
        return {
          id: node.id,
          label: node.label ?? node.id,
          color: colorForNode(node),
          radius: sizeForNode(node) / 2,
          nodeType: node.node_type,
          x: position.x,
          y: position.y,
        };
      }),
    // renderVersion intentionally invalidates when refs mutate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, renderVersion],
  );

  const renderEdges = useMemo<PositionedLink[]>(
    () =>
      edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label ?? edge.relationship_type,
      })),
    [edges],
  );

  const fitElements = useCallback(
    (elementIds: string[], force = false) => {
      const svg = svgRef.current;
      const zoomBehavior = zoomBehaviorRef.current;
      if (!svg || !zoomBehavior || size.width === 0 || size.height === 0 || nodes.length === 0) {
        return;
      }

      const targetIds = elementIds.length > 0 ? elementIds : nodes.map((node) => node.id);
      const positions = targetIds.map((id) => positionsRef.current.get(id)).filter(Boolean) as Array<{
        x: number;
        y: number;
      }>;
      if (positions.length === 0) {
        return;
      }

      const current = transformRef.current;
      const visibleX1 = current.invertX(0);
      const visibleX2 = current.invertX(size.width);
      const visibleY1 = current.invertY(0);
      const visibleY2 = current.invertY(size.height);
      const needsFit =
        force ||
        positions.some((position) => position.x < visibleX1 || position.x > visibleX2 || position.y < visibleY1 || position.y > visibleY2);
      if (!needsFit) {
        return;
      }

      const padding = 120;
      const xValues = positions.map((position) => position.x);
      const yValues = positions.map((position) => position.y);
      const x1 = Math.min(...xValues);
      const x2 = Math.max(...xValues);
      const y1 = Math.min(...yValues);
      const y2 = Math.max(...yValues);
      const graphWidth = Math.max(x2 - x1, 1);
      const graphHeight = Math.max(y2 - y1, 1);
      const scale = Math.min(1.8, Math.max(0.12, Math.min((size.width - padding) / graphWidth, (size.height - padding) / graphHeight)));
      const nextTransform = zoomIdentity
        .translate(size.width / 2 - ((x1 + x2) / 2) * scale, size.height / 2 - ((y1 + y2) / 2) * scale)
        .scale(scale);

      select(svg).transition().duration(320).call(zoomBehavior.transform, nextTransform);
    },
    [nodes, size.height, size.width],
  );

  useEffect(() => {
    if (size.width === 0 || size.height === 0) {
      return;
    }

    const nextNodeIds = new Set(nodes.map((node) => node.id));
    const nextEdgeIds = new Set(edges.map((edge) => edge.id));
    const previousNodeIds = knownNodeIdsRef.current;
    const previousEdgeIds = knownEdgeIdsRef.current;
    const newNodeIds = nodes.map((node) => node.id).filter((id) => !previousNodeIds.has(id));
    const newEdgeIds = edges.map((edge) => edge.id).filter((id) => !previousEdgeIds.has(id));
    const radii = new Map(nodes.map((node) => [node.id, sizeForNode(node) / 2]));
    const positions = positionsRef.current;

    Array.from(positions.keys()).forEach((id) => {
      if (!nextNodeIds.has(id)) {
        positions.delete(id);
      }
    });

    const currentTransform = transformRef.current;
    const anchorPosition =
      (layoutAnchorNodeId ? positions.get(layoutAnchorNodeId) : undefined) ?? {
        x: currentTransform.invertX(size.width / 2),
        y: currentTransform.invertY(size.height / 2),
      };

    newNodeIds.forEach((id, index) => {
      const offset = expandedNodeOffset(index, newNodeIds.length);
      positions.set(id, {
        x: anchorPosition.x + offset.x,
        y: anchorPosition.y + offset.y,
      });
    });

    nodes.forEach((node, index) => {
      if (!positions.has(node.id)) {
        const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
        positions.set(node.id, {
          x: Math.cos(angle) * 180,
          y: Math.sin(angle) * 180,
        });
      }
    });

    if (!hasFitInitialGraphRef.current && nodes.length > 0) {
      const simulationNodes = nodes.map((node) => {
        const position = nodePosition(node.id, positions);
        return {
          id: node.id,
          label: node.label ?? node.id,
          color: colorForNode(node),
          radius: sizeForNode(node) / 2,
          nodeType: node.node_type,
          x: position.x,
          y: position.y,
        };
      });
      const simulationLinks = edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label ?? edge.relationship_type,
      }));
      simulateInitialLayout(simulationNodes, simulationLinks);
      simulationNodes.forEach((node) => {
        positions.set(node.id, { x: node.x ?? 0, y: node.y ?? 0 });
      });
      hasFitInitialGraphRef.current = true;
      setRenderVersion((version) => version + 1);
      requestAnimationFrame(() => fitElements(nodes.map((node) => node.id), true));
    } else if (newNodeIds.length > 0 || newEdgeIds.length > 0) {
      resolveExpansionCollisions(
        nodes.map((node) => node.id),
        newNodeIds,
        positions,
        radii,
      );
      setRenderVersion((version) => version + 1);
      requestAnimationFrame(() => fitElements(newNodeIds));
    } else {
      setRenderVersion((version) => version + 1);
    }

    knownNodeIdsRef.current = nextNodeIds;
    knownEdgeIdsRef.current = nextEdgeIds;
  }, [edges, fitElements, layoutAnchorNodeId, nodes, size.height, size.width]);

  const handleNodePointerDown = useCallback(
    (event: React.PointerEvent<SVGGElement>, nodeId: string) => {
      event.stopPropagation();
      event.preventDefault();
      const svg = svgRef.current;
      if (!svg) {
        return;
      }

      const [pointerX, pointerY] = pointer(event.nativeEvent, svg);
      const [worldX, worldY] = transformRef.current.invert([pointerX, pointerY]);
      const memberIds = expansionGroupsRef.current.get(nodeId) ?? [];
      const anchorStartPosition = nodePosition(nodeId, positionsRef.current);
      const memberStartPositions = new Map<string, { x: number; y: number }>();
      memberIds.forEach((memberId) => {
        if (memberId !== nodeId) {
          memberStartPositions.set(memberId, nodePosition(memberId, positionsRef.current));
        }
      });
      dragGroupRef.current = {
        anchorId: nodeId,
        anchorStartPosition,
        memberStartPositions,
        pointerStartPosition: { x: worldX, y: worldY },
      };

      const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
        const dragGroup = dragGroupRef.current;
        const currentSvg = svgRef.current;
        if (!dragGroup || !currentSvg) {
          return;
        }
        didDragRef.current = true;
        const [moveX, moveY] = pointer(moveEvent, currentSvg);
        const [moveWorldX, moveWorldY] = transformRef.current.invert([moveX, moveY]);
        const dx = moveWorldX - dragGroup.pointerStartPosition.x;
        const dy = moveWorldY - dragGroup.pointerStartPosition.y;
        positionsRef.current.set(dragGroup.anchorId, {
          x: dragGroup.anchorStartPosition.x + dx,
          y: dragGroup.anchorStartPosition.y + dy,
        });
        dragGroup.memberStartPositions.forEach((position, memberId) => {
          positionsRef.current.set(memberId, { x: position.x + dx, y: position.y + dy });
        });
        setRenderVersion((version) => version + 1);
      };

      const handlePointerUp = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        dragGroupRef.current = null;
        window.setTimeout(() => {
          didDragRef.current = false;
        }, 0);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [],
  );

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (didDragRef.current) {
        return;
      }
      const now = Date.now();
      const lastTap = lastTapRef.current;
      if (lastTap && lastTap.id === nodeId && now - lastTap.time < 300) {
        onNodeDoubleClick(nodeId);
        lastTapRef.current = null;
        return;
      }
      lastTapRef.current = { id: nodeId, time: now };
      onNodeClick(nodeId);
    },
    [onNodeClick, onNodeDoubleClick],
  );

  return (
    <div className="graph-canvas d3-graph-canvas" ref={containerRef}>
      <svg className="d3-graph-svg" ref={svgRef} width={size.width} height={size.height} role="img">
        <g transform={transform.toString()}>
          <g className="d3-edge-layer">
            {renderEdges.map((edge) => {
              const sourceId = linkEndpoint(edge.source);
              const targetId = linkEndpoint(edge.target);
              const source = nodePosition(sourceId, positionsRef.current);
              const target = nodePosition(targetId, positionsRef.current);
              const isPath = pathEdgeIds.has(edge.id);
              return (
                <line
                  className={`d3-edge${isPath ? " path" : ""}`}
                  key={edge.id}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                />
              );
            })}
          </g>
          <g className="d3-edge-label-layer">
            {renderEdges.map((edge) => {
              const source = nodePosition(linkEndpoint(edge.source), positionsRef.current);
              const target = nodePosition(linkEndpoint(edge.target), positionsRef.current);
              const angle = (Math.atan2(target.y - source.y, target.x - source.x) * 180) / Math.PI;
              return (
                <text
                  className="d3-edge-label"
                  fill={isDarkMode ? "#ffffff" : "#475569"}
                  key={edge.id}
                  transform={`translate(${(source.x + target.x) / 2},${(source.y + target.y) / 2}) rotate(${angle})`}
                >
                  {edge.label}
                </text>
              );
            })}
          </g>
          <g className="d3-node-layer">
            {renderNodes.map((node) => {
              const isSelected = node.id === selectedNodeId;
              const isPath = pathNodeIds.has(node.id);
              return (
                <g
                  className={`d3-node${isSelected ? " selected" : ""}${isPath ? " path" : ""}`}
                  key={node.id}
                  transform={`translate(${node.x ?? 0},${node.y ?? 0})`}
                  onClick={() => handleNodeClick(node.id)}
                  onPointerDown={(event) => handleNodePointerDown(event, node.id)}
                >
                  <circle r={node.radius} fill={node.color} />
                  <text>{node.label}</text>
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}
