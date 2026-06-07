import type { GraphNode, PathExplanationResponse } from "../types/graph";
import { AccordionPanel } from "./AccordionPanel";
import { PathExplanationPanel } from "./PathExplanationPanel";

interface ShortestPathPanelProps {
  selectedNode: GraphNode | null;
  sourceNode: GraphNode | null;
  targetNode: GraphNode | null;
  pathCount: number;
  isLoading: boolean;
  onPathCountChange: (pathCount: number) => void;
  onSetSource: () => void;
  onSetTarget: () => void;
  onFindPath: () => void;
  onClearPath: () => void;
  canExplainPath: boolean;
  pathExplanation: PathExplanationResponse | null;
  pathExplanationError: string | null;
  isPathExplanationLoading: boolean;
  onGeneratePathExplanation: () => void;
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
  pathCount,
  isLoading,
  onPathCountChange,
  onSetSource,
  onSetTarget,
  onFindPath,
  onClearPath,
  canExplainPath,
  pathExplanation,
  pathExplanationError,
  isPathExplanationLoading,
  onGeneratePathExplanation,
}: ShortestPathPanelProps) {
  return (
    <AccordionPanel className="path-panel" title="Shortest path" description="Find the most direct connection between two nodes in the graph.">
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
      <label className="path-count-control" htmlFor="path-count">
        <span>Top-k paths</span>
        <select
          id="path-count"
          value={pathCount}
          onChange={(event) => onPathCountChange(Number(event.target.value))}
        >
          {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <div className="path-actions">
        <button type="button" disabled={!sourceNode || !targetNode || isLoading} onClick={onFindPath}>
          {isLoading ? "Finding..." : "Find path"}
        </button>
        <button type="button" onClick={onClearPath}>
          Clear path
        </button>
      </div>
      <PathExplanationPanel
        canExplain={canExplainPath}
        explanation={pathExplanation}
        error={pathExplanationError}
        isLoading={isPathExplanationLoading}
        onGenerate={onGeneratePathExplanation}
      />
    </AccordionPanel>
  );
}
