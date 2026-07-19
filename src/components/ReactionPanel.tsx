import type { Citation, Metabolite, Reaction } from "../types/schema";

export interface ReactionPanelProps {
  reaction: Reaction;
  metaboliteById: Map<string, Metabolite>;
  selectedMetaboliteId?: string | null;
  onMetaboliteClick?: (metaboliteId: string) => void;
}

function CitationList({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;
  return (
    <ul style={{ margin: "0.25rem 0 0", padding: 0, listStyle: "none" }}>
      {citations.map((c, i) => (
        <li key={i} style={{ fontSize: "0.85em", color: "#64748b" }}>
          {c.url ? (
            <a href={c.url} target="_blank" rel="noreferrer">
              {c.source}
            </a>
          ) : (
            c.source
          )}
          {c.note ? ` — ${c.note}` : ""}
        </li>
      ))}
    </ul>
  );
}

function MetaboliteNames({
  ids,
  metaboliteById,
  selectedMetaboliteId,
  onMetaboliteClick,
}: {
  ids: string[];
  metaboliteById: Map<string, Metabolite>;
  selectedMetaboliteId?: string | null;
  onMetaboliteClick?: (metaboliteId: string) => void;
}) {
  return (
    <>
      {ids.map((id, i) => {
        const metabolite = metaboliteById.get(id);
        const isSelected = selectedMetaboliteId === id;
        return (
          <span key={id}>
            {i > 0 && " + "}
            <span
              onClick={() => onMetaboliteClick?.(id)}
              style={{
                cursor: onMetaboliteClick ? "pointer" : "default",
                textDecoration: onMetaboliteClick ? "underline" : "none",
                textDecorationStyle: "dotted",
                color: isSelected ? "#1d4ed8" : "inherit",
                fontWeight: isSelected ? 600 : 400,
              }}
              title={onMetaboliteClick ? "View structure" : undefined}
            >
              {metabolite?.name ?? id}
            </span>
          </span>
        );
      })}
    </>
  );
}

export default function ReactionPanel({
  reaction,
  metaboliteById,
  selectedMetaboliteId,
  onMetaboliteClick,
}: ReactionPanelProps) {
  return (
    <div>
      <h2 style={{ marginBottom: "0.25rem" }}>{reaction.name}</h2>

      <p
        style={{
          fontFamily: "monospace",
          fontSize: "1.05em",
          background: "#f1f5f9",
          padding: "0.5rem 0.75rem",
          borderRadius: 6,
          display: "inline-block",
        }}
      >
        <MetaboliteNames
          ids={reaction.substrateIds}
          metaboliteById={metaboliteById}
          selectedMetaboliteId={selectedMetaboliteId}
          onMetaboliteClick={onMetaboliteClick}
        />
        {" "}
        {reaction.reversible ? "⇌" : "→"}
        {" "}
        <MetaboliteNames
          ids={reaction.productIds}
          metaboliteById={metaboliteById}
          selectedMetaboliteId={selectedMetaboliteId}
          onMetaboliteClick={onMetaboliteClick}
        />
      </p>

      <p style={{ color: "#64748b", fontSize: "0.9em", margin: "0.25rem 0 0.75rem" }}>
        Equation as written: <code>{reaction.equation}</code> · Compartment:{" "}
        {reaction.compartment} ·{" "}
        {reaction.reversible ? "Reversible" : "Irreversible in vivo"}
      </p>

      <section style={{ marginBottom: "0.75rem" }}>
        <h3 style={sectionHeadingStyle}>Mechanism</h3>
        <p style={{ margin: 0 }}>{reaction.mechanismNotes}</p>
      </section>

      {reaction.deltaGNote && (
        <section style={{ marginBottom: "0.75rem" }}>
          <h3 style={sectionHeadingStyle}>Thermodynamics</h3>
          <p style={{ margin: 0 }}>{reaction.deltaGNote}</p>
        </section>
      )}

      <section>
        <h3 style={sectionHeadingStyle}>Citations</h3>
        <CitationList citations={reaction.citations} />
      </section>
    </div>
  );
}

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: "0.85em",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#64748b",
  margin: "0 0 0.25rem",
};
