import type { NodeDetail } from "../types/graph";

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

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "Not available";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

export function NodeDetailsPanel({ node }: NodeDetailsPanelProps) {
  if (!node) {
    return (
      <section className="panel details-panel">
        <h2>Node details</h2>
        <p className="hint">Select a node to view biomedical metadata.</p>
      </section>
    );
  }

  const properties = node.properties;
  const fields = preferredFields.filter((field) => field in properties);

  return (
    <section className="panel details-panel">
      <h2>{formatValue(properties.name)}</h2>
      <p className="hint">Labels: {node.labels.join(", ")}</p>
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
    </section>
  );
}
