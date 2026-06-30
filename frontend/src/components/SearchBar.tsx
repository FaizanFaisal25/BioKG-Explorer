import { useEffect, useRef, useState } from "react";

import { searchNodes } from "../api/graphApi";
import type { SearchResult } from "../types/graph";
import { AccordionPanel } from "./AccordionPanel";

interface SearchBarProps {
  onSelectNode: (node: SearchResult) => void;
}

export function SearchBar({ onSelectNode }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const latestRequestId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    const requestId = latestRequestId.current + 1;
    latestRequestId.current = requestId;

    if (trimmed.length < 1) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const matches = await searchNodes(trimmed, 12, controller.signal);
        if (!controller.signal.aborted && latestRequestId.current === requestId) {
          setResults(matches);
        }
      } catch (error) {
        if (!controller.signal.aborted && latestRequestId.current === requestId) {
          console.error(error);
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted && latestRequestId.current === requestId) {
          setIsLoading(false);
        }
      }
    }, 90);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query]);

  return (
    <AccordionPanel className="search-panel" title="Search PrimeKG nodes" description="Find any disease, drug, gene, or pathway in the knowledge graph." defaultExpanded>
      <label htmlFor="node-search">Node name</label>
      <input
        id="node-search"
        value={query}
        placeholder="Try diabetes, insulin, TP53..."
        onChange={(event) => setQuery(event.target.value)}
      />
      {isLoading && <p className="hint">Searching...</p>}
      <div className="search-results">
        {results.map((node) => (
          <button
            className="search-result"
            key={node.id}
            type="button"
            onClick={() => {
              onSelectNode(node);
              setQuery(node.name ?? String(node.primekg_index));
              setResults([]);
            }}
          >
            <span>{node.name}</span>
            <small>
              {node.node_type} · {node.node_source} · #{node.primekg_index}
            </small>
          </button>
        ))}
      </div>
    </AccordionPanel>
  );
}
