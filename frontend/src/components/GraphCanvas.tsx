import cytoscape, { Core, EventObject } from "cytoscape";
import { useEffect, useRef } from "react";

import type { GraphEdge, GraphNode } from "../types/graph";

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  layoutAnchorNodeId: string | null;
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

export function GraphCanvas({
  nodes,
  edges,
  selectedNodeId,
  layoutAnchorNodeId,
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

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
    onNodeDoubleClickRef.current = onNodeDoubleClick;
  }, [onNodeClick, onNodeDoubleClick]);

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
            width: 34,
            height: 34,
            "border-width": 0,
            "border-color": "#ffffff",
            "transition-property": "background-color, border-color, border-width, opacity",
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
            "background-color": "#facc15",
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
    const anchor = layoutAnchorNodeId ? cy.getElementById(layoutAnchorNodeId) : cy.collection();
    const anchorPosition = anchor.nonempty() ? anchor.position() : { x: cy.width() / 2, y: cy.height() / 2 };
    const newElementIds: string[] = [];

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
        };

        if (existing.nonempty()) {
          existing.data(data);
          return;
        }

        const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
        const radius = 22;
        cy.add({
          group: "nodes",
          data,
          position: {
            x: anchorPosition.x + Math.cos(angle) * radius,
            y: anchorPosition.y + Math.sin(angle) * radius,
          },
        }).style("opacity", 0);
        newElementIds.push(node.id);
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
        newElementIds.push(edge.id);
      });
    });

    newElementIds.forEach((id) => {
      cy.getElementById(id).animate({ style: { opacity: 1 } }, { duration: 260 });
    });

    const anchorWasLocked = anchor.nonempty() ? anchor.locked() : false;
    if (anchor.nonempty()) {
      anchor.lock();
    }

    const layout = cy.layout({
      name: "cose",
      animate: true,
      animationDuration: 650,
      fit: false,
      randomize: false,
      nodeRepulsion: 9000,
      idealEdgeLength: 110,
    });

    layout.one("layoutstop", () => {
      if (anchor.nonempty() && !anchorWasLocked) {
        anchor.unlock();
      }
    });
    layout.run();
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

  return <div className="graph-canvas" ref={containerRef} />;
}
