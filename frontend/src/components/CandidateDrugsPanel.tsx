import type { DiseaseCandidateDrugsResponse, DrugCandidate, GraphPayload, NodeDetail } from "../types/graph";

interface CandidateDrugsPanelProps {
  selectedNode: NodeDetail | null;
  candidates: DiseaseCandidateDrugsResponse | null;
  isLoading: boolean;
  onAddCandidateGraph: (payload: GraphPayload, anchorNodeId: string) => void;
}

const sections: Array<{
  key: keyof Pick<DiseaseCandidateDrugsResponse, "known" | "off_label" | "contraindicated" | "repurposing">;
  title: string;
  description: string;
}> = [
  {
    key: "known",
    title: "Approved / known",
    description: "Direct indication relationships.",
  },
  {
    key: "off_label",
    title: "Off-label",
    description: "Direct off-label use relationships.",
  },
  {
    key: "contraindicated",
    title: "Unsafe / contraindicated",
    description: "Direct contraindication relationships.",
  },
  {
    key: "repurposing",
    title: "Repurposing candidates",
    description: "Computed through shared genes, proteins, or pathways.",
  },
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
      ? candidate.support_nodes
          .slice(0, 3)
          .map((node) => node.label ?? node.id)
          .join(", ")
      : candidate.relation;

  return (
    <button
      className={`candidate-row candidate-${candidate.category}`}
      type="button"
      onClick={() => onAddCandidateGraph(candidate.graph, candidate.id)}
    >
      <span>{candidate.name ?? `Drug #${candidate.primekg_index}`}</span>
      <small>
        Evidence: {candidate.evidence_count}
        {supportLabel ? ` · ${supportLabel}` : ""}
      </small>
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
    <section className="panel candidate-panel">
      <h2>Candidate drugs</h2>
      {!isDisease && <p className="hint">Select a disease node to view drug discovery candidates.</p>}
      {isDisease && isLoading && <p className="hint">Finding disease-linked drug candidates...</p>}
      {isDisease && candidates && (
        <div className="candidate-sections">
          <p className="hint">For {candidates.disease_name ?? `disease #${candidates.disease_id}`}</p>
          {sections.map((section) => {
            const items = candidates[section.key];
            return (
              <div className="candidate-section" key={section.key}>
                <div className="candidate-section-header">
                  <strong>{section.title}</strong>
                  <span>{items.length}</span>
                </div>
                <p className="hint">{section.description}</p>
                {items.length === 0 ? (
                  <p className="hint">No candidates found.</p>
                ) : (
                  <div className="candidate-list">
                    {items.map((candidate) => (
                      <CandidateRow
                        candidate={candidate}
                        key={`${section.key}-${candidate.id}`}
                        onAddCandidateGraph={onAddCandidateGraph}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
