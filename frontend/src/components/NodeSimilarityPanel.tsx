import type { DiseaseSimilarityResponse, GraphPayload, NodeDetail, SimilarDisease } from "../types/graph";
import { AccordionPanel } from "./AccordionPanel";

interface NodeSimilarityPanelProps {
  selectedNode: NodeDetail | null;
  similarity: DiseaseSimilarityResponse | null;
  isLoading: boolean;
  onAddSimilarityGraph: (payload: GraphPayload, anchorNodeId: string) => void;
}

function SimilarDiseaseRow({
  disease,
  onAddSimilarityGraph,
}: {
  disease: SimilarDisease;
  onAddSimilarityGraph: (payload: GraphPayload, anchorNodeId: string) => void;
}) {
  const supportLabel =
    disease.support_nodes.length > 0
      ? disease.support_nodes
          .slice(0, 3)
          .map((node) => node.label ?? node.id)
          .join(", ")
      : "No shared evidence sampled";
  const score = Number.isFinite(disease.score) ? disease.score.toFixed(3) : "0.000";

  return (
    <button
      className="candidate-row similarity-row"
      type="button"
      onClick={() => onAddSimilarityGraph(disease.graph, disease.id)}
    >
      <span>{disease.name ?? `Disease #${disease.primekg_index}`}</span>
      <small>
        Score: {score} · Evidence: {disease.evidence_count} · Genes: {disease.shared_gene_count} · Pathways:{" "}
        {disease.shared_pathway_count} · Phenotypes: {disease.shared_phenotype_count}
      </small>
      <small>{supportLabel}</small>
    </button>
  );
}

export function NodeSimilarityPanel({
  selectedNode,
  similarity,
  isLoading,
  onAddSimilarityGraph,
}: NodeSimilarityPanelProps) {
  const isDisease = selectedNode?.properties.node_type === "disease";

  return (
    <AccordionPanel className="similarity-panel" title="Similar diseases">
      {!isDisease && <p className="hint">Select a disease node to view similar diseases.</p>}
      {isDisease && isLoading && <p className="hint">Finding diseases with shared biomedical evidence...</p>}
      {isDisease && similarity && (
        <div className="candidate-sections">
          <p className="hint">For {similarity.disease_name ?? `disease #${similarity.disease_id}`}</p>
          {similarity.similar.length === 0 ? (
            <p className="hint">No similar diseases have been precomputed yet.</p>
          ) : (
            <div className="candidate-list">
              {similarity.similar.map((disease) => (
                <SimilarDiseaseRow
                  disease={disease}
                  key={disease.id}
                  onAddSimilarityGraph={onAddSimilarityGraph}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </AccordionPanel>
  );
}
