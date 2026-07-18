import { useEffect, useRef, useState } from "react";
import type { Stage as NglStage, StructureComponent } from "ngl";
import type { EnzymeIsoform, StructureAnnotation } from "../types/schema";

/** Color per annotation `kind`, kept distinct from the default cartoon color. */
const KIND_COLORS: Record<StructureAnnotation["kind"], string> = {
  active_site: "#dc2626", // red
  cofactor_binding: "#d97706", // amber
  allosteric_site: "#7c3aed", // violet
  mutation: "#059669", // green
  other: "#64748b", // slate
};

const KIND_LABELS: Record<StructureAnnotation["kind"], string> = {
  active_site: "Active site",
  cofactor_binding: "Cofactor binding",
  allosteric_site: "Allosteric site",
  mutation: "Mutation",
  other: "Other",
};

export interface StructureViewerProps {
  isoform: EnzymeIsoform;
}

type LoadState = "loading" | "ready" | "error";

export default function StructureViewer({ isoform }: StructureViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<NglStage | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [hoveredAnnotation, setHoveredAnnotation] = useState<number | null>(null);

  // Create the Stage once, on mount. Dispose it on unmount.
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    // Dynamic import: NGL touches `window`/WebGL at module init in some
    // builds, so keep it out of the SSR/initial bundle path and only pull it
    // in when this component actually mounts.
    import("ngl").then(({ Stage }) => {
      if (cancelled || !containerRef.current) return;
      const stage = new Stage(containerRef.current, {
        backgroundColor: "#f8fafc",
      });
      stageRef.current = stage;
    });

    const handleResize = () => stageRef.current?.handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", handleResize);
      stageRef.current?.dispose();
      stageRef.current = null;
    };
    // Stage is created once per mount; structure loading below reacts to
    // isoform changes independently instead of recreating the Stage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load (or reload) the structure whenever the isoform changes.
  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setErrorMessage("");
    setHoveredAnnotation(null);

    const load = async () => {
      // Wait for the Stage to exist (it's created asynchronously above).
      let attempts = 0;
      while (!stageRef.current && attempts < 50 && !cancelled) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        attempts += 1;
      }
      const stage = stageRef.current;
      if (!stage || cancelled) return;

      stage.removeAllComponents();

      try {
        const component = (await stage.loadFile(
          `rcsb://${isoform.structure.pdbId}`,
          { defaultRepresentation: false }
        )) as StructureComponent | undefined;

        if (cancelled || !component) return;

        component.addRepresentation("cartoon", {
          color: "#cbd5e1",
          opacity: 1,
        });

        // One highlighted representation per annotated residue range, plus
        // a text label anchored to its midpoint.
        isoform.structure.annotations.forEach((annotation) => {
          const [start, end] = annotation.residueRange;
          const sele = `${start}-${end}`;
          const color = KIND_COLORS[annotation.kind];

          component.addRepresentation("cartoon", {
            sele,
            color,
            opacity: 1,
          });
          component.addRepresentation("ball+stick", {
            sele: `${sele} and sidechainAttached`,
            color,
          });
        });

        component.autoView(undefined, 0);
        if (!cancelled) setLoadState("ready");
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(
            err instanceof Error ? err.message : "Failed to load structure"
          );
          setLoadState("error");
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [isoform]);

  const focusAnnotation = (annotation: StructureAnnotation) => {
    const stage = stageRef.current;
    if (!stage) return;
    const [start, end] = annotation.residueRange;
    const component = stage.compList.find(
      (c): c is StructureComponent => "structure" in c
    );
    component?.autoView(`${start}-${end}`, 500);
  };

  return (
    <div>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: 360,
          borderRadius: 8,
          border: "1px solid #cbd5e1",
          position: "relative",
          background: "#f8fafc",
        }}
      >
        {loadState === "loading" && (
          <div style={overlayStyle}>Loading {isoform.structure.pdbId}…</div>
        )}
        {loadState === "error" && (
          <div style={{ ...overlayStyle, color: "#dc2626" }}>
            Couldn't load structure {isoform.structure.pdbId}
            {errorMessage ? `: ${errorMessage}` : ""}
          </div>
        )}
      </div>

      {isoform.structure.annotations.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, marginTop: "0.75rem" }}>
          {isoform.structure.annotations.map((annotation, i) => (
            <li
              key={i}
              onMouseEnter={() => setHoveredAnnotation(i)}
              onMouseLeave={() => setHoveredAnnotation(null)}
              onClick={() => focusAnnotation(annotation)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.5rem",
                padding: "0.4rem 0.5rem",
                borderRadius: 6,
                cursor: loadState === "ready" ? "pointer" : "default",
                background: hoveredAnnotation === i ? "#f1f5f9" : "transparent",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  marginTop: 4,
                  flexShrink: 0,
                  background: KIND_COLORS[annotation.kind],
                }}
              />
              <span>
                <strong>{annotation.label}</strong>{" "}
                <span style={{ color: "#64748b", fontSize: "0.85em" }}>
                  ({KIND_LABELS[annotation.kind]}, residues{" "}
                  {annotation.residueRange[0]}–{annotation.residueRange[1]})
                </span>
                {annotation.note && (
                  <>
                    <br />
                    <span style={{ color: "#64748b", fontSize: "0.85em" }}>
                      {annotation.note}
                    </span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#64748b",
  fontSize: "0.9rem",
  pointerEvents: "none",
};
