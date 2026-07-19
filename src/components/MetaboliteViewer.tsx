import { useEffect, useRef, useState } from "react";
import type { Stage as NglStage } from "ngl";
import type { Metabolite } from "../types/schema";

export interface MetaboliteViewerProps {
  metabolite: Metabolite;
}

type LoadState = "loading" | "ready" | "error";

/**
 * Small-molecule counterpart to StructureViewer. Metabolites aren't proteins
 * — there's no PDB entry to load — so instead of RCSB we pull a 3D SDF
 * conformer from PubChem by CID and hand it to the same NGL Stage machinery.
 * PubChem falls back to a 2D-only depiction for a handful of highly ionic
 * species (e.g. bare phosphate) that don't have a meaningful 3D conformer;
 * we retry with `record_type=2d` if the 3D request fails.
 */
export default function MetaboliteViewer({ metabolite }: MetaboliteViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<NglStage | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [usedFallback2d, setUsedFallback2d] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

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
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setErrorMessage("");
    setUsedFallback2d(false);

    const load = async () => {
      let attempts = 0;
      while (!stageRef.current && attempts < 50 && !cancelled) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        attempts += 1;
      }
      const stage = stageRef.current;
      if (!stage || cancelled) return;

      stage.removeAllComponents();

      if (!metabolite.pubchemCid) {
        setErrorMessage("No PubChem CID on record for this metabolite");
        setLoadState("error");
        return;
      }

      const urlFor = (recordType: "3d" | "2d") =>
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${metabolite.pubchemCid}/record/SDF/?record_type=${recordType}`;

      const tryLoad = async (recordType: "3d" | "2d") => {
        const component = await stage.loadFile(urlFor(recordType), {
          ext: "sdf",
          defaultRepresentation: false,
        });
        return component;
      };

      try {
        let component;
        try {
          component = await tryLoad("3d");
        } catch {
          component = await tryLoad("2d");
          if (!cancelled) setUsedFallback2d(true);
        }

        if (cancelled || !component) return;

        component.addRepresentation("ball+stick", {
          multipleBond: true,
        });
        component.autoView(0);
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
  }, [metabolite]);

  return (
    <div>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: 280,
          borderRadius: 8,
          border: "1px solid #cbd5e1",
          position: "relative",
          background: "#f8fafc",
        }}
      >
        {loadState === "loading" && (
          <div style={overlayStyle}>Loading {metabolite.name}…</div>
        )}
        {loadState === "error" && (
          <div style={{ ...overlayStyle, color: "#dc2626" }}>
            Couldn't load structure for {metabolite.name}
            {errorMessage ? `: ${errorMessage}` : ""}
          </div>
        )}
      </div>
      {usedFallback2d && loadState === "ready" && (
        <p style={{ color: "#64748b", fontSize: "0.8em", marginTop: "0.4rem" }}>
          PubChem has no 3D conformer for this ion — showing the 2D depiction
          instead.
        </p>
      )}
      <p style={{ color: "#64748b", fontSize: "0.85em", marginTop: "0.4rem" }}>
        Source:{" "}
        <a
          href={`https://pubchem.ncbi.nlm.nih.gov/compound/${metabolite.pubchemCid}`}
          target="_blank"
          rel="noreferrer"
        >
          PubChem CID {metabolite.pubchemCid}
        </a>
      </p>
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
  textAlign: "center",
  padding: "0 1rem",
};
