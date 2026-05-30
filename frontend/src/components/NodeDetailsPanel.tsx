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

const metricFields = [
  { key: "degree", label: "Degree" },
  { key: "degree_centrality", label: "Degree centrality" },
  { key: "degree_size", label: "Display size" },
];

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "Not available";
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
      <AccordionPanel className="details-panel" title="Node details">
        <p className="hint">Select a node to view biomedical metadata.</p>
      </AccordionPanel>
    );
  }

  const properties = node.properties;
  const fields = preferredFields.filter((field) => field in properties);
  const metrics = metricFields.filter((field) => field.key in properties);

  return (
    <AccordionPanel className="details-panel" title={formatValue(properties.name)}>
      <p className="hint">Labels: {node.labels.join(", ")}</p>
      {metrics.length > 0 && (
        <div className="graph-metrics">
          <strong>Graph metrics</strong>
          <dl>
            {metrics.map((field) => (
              <div key={field.key}>
                <dt>{field.label}</dt>
                <dd>{formatMetric(properties[field.key])}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <dl>
        <div>
          <dt>PrimeKG Index</dt>
          <dd>{node.primekg_index}</dd>
        </div>
        {fields.map((field) => (
          <div key={field}>
            <dt>{field}</dt>
            <dd>{formatValue(properties[field])}</dd>
          </div>
        ))}
      </dl>
    </AccordionPanel>
  );
}
