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
  const score = Number.isFinite(disease.score) ? disease.score.toFixed(3) : "0.000";
  const supportLabel =
    disease.support_nodes.length > 0
      ? disease.support_nodes.slice(0, 3).map((n) => n.label ?? n.id).join(", ")
      : null;

  return (
    <button
      className="candidate-row similarity-row"
      type="button"
      onClick={() => onAddSimilarityGraph(disease.graph, disease.id)}
    >
      <span className="candidate-row-name">{disease.name ?? `Disease #${disease.primekg_index}`}</span>
      <div className="candidate-row-meta">
        <span className="candidate-chip">Score: {score}</span>
        {disease.shared_gene_count > 0 && (
          <span className="candidate-chip">🧬 {disease.shared_gene_count}</span>
        )}
        {disease.shared_pathway_count > 0 && (
          <span className="candidate-chip">⬡ {disease.shared_pathway_count}</span>
        )}
        {disease.shared_phenotype_count > 0 && (
          <span className="candidate-chip">◎ {disease.shared_phenotype_count}</span>
        )}
      </div>
      {supportLabel && <span className="candidate-row-support">{supportLabel}</span>}
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
    <AccordionPanel className="similarity-panel" title="Similar diseases" description="Diseases sharing genes, pathways, or phenotypes with the selected node.">
      {!isDisease && <p className="hint">Select a disease node to find similar diseases.</p>}
      {isDisease && isLoading && <p className="hint">Finding diseases with shared biomedical evidence...</p>}
      {isDisease && similarity && (
        <div className="candidate-sections">
          <p className="hint candidate-for">
            Showing results for <strong>{similarity.disease_name ?? `disease #${similarity.disease_id}`}</strong>
          </p>
          {similarity.similar.length === 0 ? (
            <p className="hint">No similar diseases precomputed yet.</p>
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
