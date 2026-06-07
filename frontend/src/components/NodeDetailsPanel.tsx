import type { NodeDetail } from "../types/graph";
import { AccordionPanel } from "./AccordionPanel";

interface NodeDetailsPanelProps {
  node: NodeDetail | null;
}

const preferredFields = [
  "name",
  "node_type",
  "node_source",
  "source_node_id",
  "disease_mondo_id",
  "disease_mondo_name",
  "disease_group_name_bert",
  "disease_mondo_definition",
  "drug_description",
  "drug_indication",
  "drug_mechanism_of_action",
  "drug_group",
];

const fieldLabels: Record<string, string> = {
  name: "Name",
  node_type: "Type",
  node_source: "Source",
  source_node_id: "Source ID",
  disease_mondo_id: "MONDO ID",
  disease_mondo_name: "MONDO Name",
  disease_group_name_bert: "Disease Group",
  disease_mondo_definition: "Definition",
  drug_description: "Description",
  drug_indication: "Indication",
  drug_mechanism_of_action: "Mechanism",
  drug_group: "Drug Group",
};

const metricFields = [
  { key: "degree", label: "Degree" },
  { key: "degree_centrality", label: "Centrality" },
];

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function formatMetric(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return formatValue(value);
  }
  if (Math.abs(value) < 1 && value !== 0) {
    return value.toFixed(4);
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function NodeDetailsPanel({ node }: NodeDetailsPanelProps) {
  if (!node) {
    return (
      <AccordionPanel className="details-panel" title="Node details" description="Biomedical metadata for the selected node.">
        <p className="hint">Click any node on the canvas to inspect it.</p>
      </AccordionPanel>
    );
  }

  const properties = node.properties;
  const fields = preferredFields.filter((field) => field in properties && field !== "name");
  const metrics = metricFields.filter((field) => field.key in properties);

  return (
    <AccordionPanel className="details-panel" title={formatValue(properties.name)} description={`${formatValue(properties.node_type)} · ${formatValue(properties.node_source)}`}>
      {metrics.length > 0 && (
        <div className="metrics-row">
          {metrics.map((field) => (
            <div className="metric-chip" key={field.key}>
              <span className="metric-chip-value">{formatMetric(properties[field.key])}</span>
              <span className="metric-chip-label">{field.label}</span>
            </div>
          ))}
          <div className="metric-chip">
            <span className="metric-chip-value">#{node.primekg_index}</span>
            <span className="metric-chip-label">PrimeKG ID</span>
          </div>
        </div>
      )}
      <dl className="detail-fields">
        {fields.map((field) => (
          <div className="detail-field" key={field}>
            <dt>{fieldLabels[field] ?? field}</dt>
            <dd>{formatValue(properties[field])}</dd>
          </div>
        ))}
      </dl>
    </AccordionPanel>
  );
}
