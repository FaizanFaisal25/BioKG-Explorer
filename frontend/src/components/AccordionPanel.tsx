import { ReactNode, useId, useState } from "react";

interface AccordionPanelProps {
  title: string;
  description?: string;
  className?: string;
  defaultExpanded?: boolean;
  children: ReactNode;
}

export function AccordionPanel({ title, description, className = "", defaultExpanded = false, children }: AccordionPanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const contentId = useId();

  return (
    <section className={`panel accordion-panel ${className}`}>
      <button
        aria-controls={contentId}
        aria-expanded={isExpanded}
        className="accordion-header"
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
      >
        <div className="accordion-header-text">
          <h2>{title}</h2>
          {description && <p className="accordion-description">{description}</p>}
        </div>
        <span className="accordion-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      <div className="accordion-content" id={contentId} aria-hidden={!isExpanded}>
        <div className="accordion-content-inner">{children}</div>
      </div>
    </section>
  );
}
