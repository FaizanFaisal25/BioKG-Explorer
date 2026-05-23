import type { GraphNode } from "../types/graph";

interface ShortestPathPanelProps {
  selectedNode: GraphNode | null;
  sourceNode: GraphNode | null;
  targetNode: GraphNode | null;
  isLoading: boolean;
  onSetSource: () => void;
  onSetTarget: () => void;
  onFindPath: () => void;
  onClearPath: () => void;
}

function nodeLabel(node: GraphNode | null): string {
  if (!node) {
    return "Not selected";
  }
  return `${node.label ?? node.id} (#${node.primekg_index})`;
}

export function ShortestPathPanel({
  selectedNode,
  sourceNode,
  targetNode,
  isLoading,
  onSetSource,
  onSetTarget,
  onFindPath,
  onClearPath,
}: ShortestPathPanelProps) {
  return (
    <section className="panel path-panel">
      <h2>Shortest path</h2>
      <p className="hint">Click a graph node, assign it as source or target, then compute a bounded shortest path.</p>
      <div className="path-actions">
        <button type="button" disabled={!selectedNode} onClick={onSetSource}>
          Set source
        </button>
        <button type="button" disabled={!selectedNode} onClick={onSetTarget}>
          Set target
        </button>
      </div>
      <dl>
        <div>
          <dt>Source</dt>
          <dd>{nodeLabel(sourceNode)}</dd>
        </div>
        <div>
          <dt>Target</dt>
          <dd>{nodeLabel(targetNode)}</dd>
        </div>
      </dl>
      <div className="path-actions">
        <button type="button" disabled={!sourceNode || !targetNode || isLoading} onClick={onFindPath}>
          {isLoading ? "Finding..." : "Find path"}
        </button>
        <button type="button" onClick={onClearPath}>
          Clear path
        </button>
      </div>
    </section>
  );
}
