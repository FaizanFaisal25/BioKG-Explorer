import ReactMarkdown from "react-markdown";

import type { PathExplanationResponse } from "../types/graph";

interface PathExplanationPanelProps {
  canExplain: boolean;
  explanation: PathExplanationResponse | null;
  error: string | null;
  isLoading: boolean;
  onGenerate: () => void;
}

export function PathExplanationPanel({
  canExplain,
  explanation,
  error,
  isLoading,
  onGenerate,
}: PathExplanationPanelProps) {
  return (
    <div className="path-explanation">
      <div className="path-explanation-header">
        <strong>AI path explanation</strong>
        <button type="button" disabled={!canExplain || isLoading || Boolean(explanation)} onClick={onGenerate}>
          {isLoading ? "Generating..." : explanation ? "Explanation ready" : "Generate explanation"}
        </button>
      </div>
      {!canExplain && <p className="hint">Find a shortest path before requesting an explanation.</p>}
      {error && (
        <div className="path-explanation-error">
          <span>{error}</span>
          <button type="button" disabled={!canExplain || isLoading} onClick={onGenerate}>
            Retry
          </button>
        </div>
      )}
      {explanation && !error && (
        <div className="path-explanation-body">
          <ReactMarkdown>{explanation.explanation}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
