import cytoscape, { Core, EventObject } from "cytoscape";
import { useEffect, useRef } from "react";

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

function shouldFitElements(cy: Core, elementIds: string[]): boolean {
  if (elementIds.length === 0) {
    return false;
  }

  const extent = cy.extent();
  return elementIds.some((id) => {
    const element = cy.getElementById(id);
    if (!element.isNode() || element.empty()) {
      return false;
    }

    const position = element.position();
    return position.x < extent.x1 || position.x > extent.x2 || position.y < extent.y1 || position.y > extent.y2;
  });
}

function softFitIfNeeded(cy: Core, elementIds: string[], force = false): void {
  if (cy.elements().empty()) {
    return;
  }

  if (!force && !shouldFitElements(cy, elementIds)) {
    return;
  }

  cy.animate(
    {
      fit: {
        eles: cy.elements(),
        padding: 120,
      },
    },
    { duration: 320 },
  );
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

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function resolveExpansionCollisions(cy: Core, movingNodeIds: string[]): Map<string, { x: number; y: number }> {
  const movingNodeIdSet = new Set(movingNodeIds);
  const nodeIds = cy.nodes().map((node) => node.id());
  const positions = new Map<string, { x: number; y: number }>();
  const minDistance = movingNodeIds.length > 25 ? 78 : 96;
  const maxStep = 14;

  nodeIds.forEach((id) => {
    const node = cy.getElementById(id);
    if (node.isNode()) {
      positions.set(id, { ...node.position() });
    }
  });

  for (let iteration = 0; iteration < 70; iteration += 1) {
    nodeIds.forEach((sourceId, sourceIndex) => {
      const sourcePosition = positions.get(sourceId);
      if (!sourcePosition) {
        return;
      }

      for (let targetIndex = sourceIndex + 1; targetIndex < nodeIds.length; targetIndex += 1) {
        const targetId = nodeIds[targetIndex];
        const sourceCanMove = movingNodeIdSet.has(sourceId);
        const targetCanMove = movingNodeIdSet.has(targetId);
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

  return new Map(movingNodeIds.map((id) => [id, positions.get(id)]).filter((entry): entry is [string, { x: number; y: number }] => Boolean(entry[1])));
}

export function GraphCanvas({
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
  const cyRef = useRef<Core | null>(null);
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const onNodeClickRef = useRef(onNodeClick);
  const onNodeDoubleClickRef = useRef(onNodeDoubleClick);
  const expansionGroupsRef = useRef(expansionGroups);
  const knownNodeIdsRef = useRef<Set<string>>(new Set());
  const knownEdgeIdsRef = useRef<Set<string>>(new Set());
  const hasFitInitialGraphRef = useRef(false);
  const dragGroupRef = useRef<{
    anchorId: string;
    anchorStartPosition: { x: number; y: number };
    memberStartPositions: Map<string, { x: number; y: number }>;
  } | null>(null);

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
    onNodeDoubleClickRef.current = onNodeDoubleClick;
  }, [onNodeClick, onNodeDoubleClick]);

  useEffect(() => {
    expansionGroupsRef.current = expansionGroups;
  }, [expansionGroups]);

  useEffect(() => {
    if (!containerRef.current || cyRef.current) {
      return;
    }

    cyRef.current = cytoscape({
      container: containerRef.current,
      elements: [],
      layout: { name: "cose", animate: false },
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            label: "data(label)",
            color: "#0f172a",
            "font-size": 10,
            "text-outline-width": 2,
            "text-outline-color": "#ffffff",
            "text-valign": "center",
            "text-halign": "center",
            width: "data(size)",
            height: "data(size)",
            "border-width": 0,
            "border-color": "#ffffff",
            "transition-property": "background-color, border-color, border-width, opacity, width, height",
            "transition-duration": 220,
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.4,
            "line-color": "#94a3b8",
            "curve-style": "bezier",
            label: "data(label)",
            "font-size": 8,
            color: "#475569",
            "text-rotation": "autorotate",
            opacity: 0.72,
            "transition-property": "line-color, width, opacity",
            "transition-duration": 220,
          },
        },
        {
          selector: ".selected",
          style: {
            "border-width": 4,
            "border-color": "#111827",
          },
        },
        {
          selector: "node.path",
          style: {
            "border-color": "#f59e0b",
            "border-width": 4,
            "z-index": 10,
          },
        },
        {
          selector: "edge.path",
          style: {
            "line-color": "#f59e0b",
            opacity: 1,
            width: 5,
            "z-index": 10,
          },
        },
      ],
    });

    cyRef.current.on("tap", "node", (event: EventObject) => {
      const id = event.target.id();
      const now = Date.now();
      const lastTap = lastTapRef.current;
      if (lastTap && lastTap.id === id && now - lastTap.time < 300) {
        onNodeDoubleClickRef.current(id);
        lastTapRef.current = null;
        return;
      }

      lastTapRef.current = { id, time: now };
      onNodeClickRef.current(id);
    });

    cyRef.current.on("grab", "node", (event: EventObject) => {
      const anchor = event.target;
      const memberIds = expansionGroupsRef.current.get(anchor.id()) ?? [];
      if (!anchor.isNode() || memberIds.length === 0) {
        dragGroupRef.current = null;
        return;
      }

      const memberStartPositions = new Map<string, { x: number; y: number }>();
      memberIds.forEach((memberId) => {
        const member = cyRef.current?.getElementById(memberId);
        if (member?.isNode() && member.id() !== anchor.id()) {
          memberStartPositions.set(member.id(), { ...member.position() });
        }
      });

      dragGroupRef.current = {
        anchorId: anchor.id(),
        anchorStartPosition: { ...anchor.position() },
        memberStartPositions,
      };
    });

    cyRef.current.on("drag", "node", (event: EventObject) => {
      const anchor = event.target;
      const dragGroup = dragGroupRef.current;
      if (!anchor.isNode() || !dragGroup || dragGroup.anchorId !== anchor.id()) {
        return;
      }

      const anchorPosition = anchor.position();
      const dx = anchorPosition.x - dragGroup.anchorStartPosition.x;
      const dy = anchorPosition.y - dragGroup.anchorStartPosition.y;

      dragGroup.memberStartPositions.forEach((position, memberId) => {
        const member = cyRef.current?.getElementById(memberId);
        if (member?.isNode()) {
          member.position({ x: position.x + dx, y: position.y + dy });
        }
      });
    });

    cyRef.current.on("free", "node", () => {
      dragGroupRef.current = null;
    });

    return () => {
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }

    const nextNodeIds = new Set(nodes.map((node) => node.id));
    const nextEdgeIds = new Set(edges.map((edge) => edge.id));
    const previousNodeIds = knownNodeIdsRef.current;
    const previousEdgeIds = knownEdgeIdsRef.current;
    const newNodeIds = nodes.map((node) => node.id).filter((id) => !previousNodeIds.has(id));
    const newEdgeIds = edges.map((edge) => edge.id).filter((id) => !previousEdgeIds.has(id));
    const anchor = layoutAnchorNodeId ? cy.getElementById(layoutAnchorNodeId) : cy.collection();
    const anchorPosition = anchor.nonempty() ? anchor.position() : { x: cy.width() / 2, y: cy.height() / 2 };
    const newElementIds = [...newNodeIds, ...newEdgeIds];

    cy.batch(() => {
      cy.edges().forEach((edge) => {
        if (!nextEdgeIds.has(edge.id())) {
          edge.animate({ style: { opacity: 0 } }, { duration: 160, complete: () => edge.remove() });
        }
      });

      cy.nodes().forEach((node) => {
        if (!nextNodeIds.has(node.id())) {
          node.animate({ style: { opacity: 0 } }, { duration: 160, complete: () => node.remove() });
        }
      });

      nodes.forEach((node, index) => {
        const existing = cy.getElementById(node.id);
        const data = {
          id: node.id,
          label: node.label ?? node.id,
          color: colorForNode(node),
          nodeType: node.node_type,
          size: sizeForNode(node),
        };

        if (existing.nonempty()) {
          existing.data(data);
          return;
        }

        const newIndex = Math.max(newNodeIds.indexOf(node.id), 0);
        const offset = expandedNodeOffset(newIndex, newNodeIds.length);
        cy.add({
          group: "nodes",
          data,
          position: {
            x: anchorPosition.x + offset.x,
            y: anchorPosition.y + offset.y,
          },
        }).style("opacity", 0);
      });

      edges.forEach((edge) => {
        if (cy.getElementById(edge.id).nonempty()) {
          return;
        }

        cy.add({
          group: "edges",
          data: {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            label: edge.label ?? edge.relationship_type,
          },
        }).style("opacity", 0);
      });
    });

    const collisionPositions = resolveExpansionCollisions(cy, newNodeIds);
    newElementIds.forEach((id) => {
      const element = cy.getElementById(id);
      const position = collisionPositions.get(id);
      if (element.isNode() && position) {
        element.animate({ position, style: { opacity: 1 } }, { duration: 420 });
        return;
      }
      element.animate({ style: { opacity: 1 } }, { duration: 260 });
    });

    knownNodeIdsRef.current = nextNodeIds;
    knownEdgeIdsRef.current = nextEdgeIds;

    if (!hasFitInitialGraphRef.current) {
      hasFitInitialGraphRef.current = true;
      const initialLayout = cy.layout({
        name: "cose",
        animate: true,
        animationDuration: 420,
        fit: false,
        randomize: false,
        nodeRepulsion: 4200,
        idealEdgeLength: 100,
      });
      initialLayout.one("layoutstop", () => {
        softFitIfNeeded(cy, nodes.map((node) => node.id), true);
      });
      initialLayout.run();
      return;
    }

    if (newNodeIds.length === 0 && newEdgeIds.length === 0) {
      softFitIfNeeded(cy, []);
      return;
    }

    // Preserve mental-map stability: expansion nodes are already placed in a
    // deterministic fan around the anchor, so do not relax them toward center.
    softFitIfNeeded(cy, newNodeIds);
  }, [nodes, edges, layoutAnchorNodeId]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }

    cy.elements().removeClass("selected path");
    if (selectedNodeId) {
      cy.getElementById(selectedNodeId).addClass("selected");
    }
    pathNodeIds.forEach((id) => cy.getElementById(id).addClass("path"));
    pathEdgeIds.forEach((id) => cy.getElementById(id).addClass("path"));
  }, [selectedNodeId, pathNodeIds, pathEdgeIds, nodes, edges]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }

    cy.edges().style("color", isDarkMode ? "#ffffff" : "#475569");
  }, [isDarkMode, edges]);

  return <div className="graph-canvas" ref={containerRef} />;
}
