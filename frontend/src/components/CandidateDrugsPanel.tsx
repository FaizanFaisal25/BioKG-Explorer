import type { DiseaseCandidateDrugsResponse, DrugCandidate, GraphPayload, NodeDetail } from "../types/graph";
import { AccordionPanel } from "./AccordionPanel";

interface CandidateDrugsPanelProps {
  selectedNode: NodeDetail | null;
  candidates: DiseaseCandidateDrugsResponse | null;
  isLoading: boolean;
  onAddCandidateGraph: (payload: GraphPayload, anchorNodeId: string) => void;
}

const sections: Array<{
  key: keyof Pick<DiseaseCandidateDrugsResponse, "known" | "off_label" | "contraindicated" | "repurposing">;
  title: string;
  color: string;
}> = [
  { key: "known",          title: "Approved",       color: "#16a34a" },
  { key: "off_label",      title: "Off-label",      color: "#2563eb" },
  { key: "contraindicated",title: "Contraindicated", color: "#ef4444" },
  { key: "repurposing",    title: "Repurposing",    color: "#a855f7" },
];

function CandidateRow({
  candidate,
  onAddCandidateGraph,
}: {
  candidate: DrugCandidate;
  onAddCandidateGraph: (payload: GraphPayload, anchorNodeId: string) => void;
}) {
  const supportLabel =
    candidate.support_nodes.length > 0
      ? candidate.support_nodes.slice(0, 3).map((n) => n.label ?? n.id).join(", ")
      : null;

  return (
    <button
      className={`candidate-row candidate-${candidate.category}`}
      type="button"
      onClick={() => onAddCandidateGraph(candidate.graph, candidate.id)}
    >
      <span className="candidate-row-name">{candidate.name ?? `Drug #${candidate.primekg_index}`}</span>
      <div className="candidate-row-meta">
        <span className="candidate-chip">Evidence: {candidate.evidence_count}</span>
        {supportLabel && <span className="candidate-chip candidate-chip-muted">{supportLabel}</span>}
      </div>
    </button>
  );
}

export function CandidateDrugsPanel({
  selectedNode,
  candidates,
  isLoading,
  onAddCandidateGraph,
}: CandidateDrugsPanelProps) {
  const isDisease = selectedNode?.properties.node_type === "disease";

  return (
    <AccordionPanel className="candidate-panel" title="Candidate drugs" description="Drug relationships linked to a selected disease node.">
      {!isDisease && <p className="hint">Select a disease node to view drug candidates.</p>}
      {isDisease && isLoading && <p className="hint">Finding drug candidates...</p>}
      {isDisease && candidates && (
        <div className="candidate-sections">
          <p className="hint candidate-for">
            Showing results for <strong>{candidates.disease_name ?? `disease #${candidates.disease_id}`}</strong>
          </p>
          {sections.map((section) => {
            const items = candidates[section.key];
            if (items.length === 0) return null;
            return (
              <div className="candidate-section" key={section.key}>
                <div className="candidate-section-header">
                  <span className="candidate-section-dot" style={{ background: section.color }} />
                  <strong>{section.title}</strong>
                  <span className="candidate-count">{items.length}</span>
                </div>
                <div className="candidate-list">
                  {items.map((candidate) => (
                    <CandidateRow
                      candidate={candidate}
                      key={`${section.key}-${candidate.id}`}
                      onAddCandidateGraph={onAddCandidateGraph}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AccordionPanel>
  );
}
