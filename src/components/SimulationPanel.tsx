import { useEffect, useRef, useState } from "react";
import type React from "react";
import type { ConcentrationMap } from "../sim/rateLaws";
import { GLUCOSE_PULSE_MM, DEFAULT_INITIAL_CONCENTRATIONS, advance, computeFlux } from "../sim/simulate";
import type { ResolvedStep } from "../sim/simulate";

// 1x is back as the default — easier to actually watch the flux particle
// animation land, rather than starting at 4x. Higher speeds are still
// available for anyone who wants to fast-forward past the slow build-up.
// Substep count scales with model-time span per frame (see
// TARGET_INTERNAL_DT below), so raising the ceiling doesn't reintroduce
// instability at high speed.
const SPEED_OPTIONS = [1, 4, 8, 16, 32];
const DEFAULT_SPEED = 1;

/**
 * Target internal RK4 step size (seconds of model time), independent of
 * speed. Substep count scales with the model-time span of each frame so
 * the near-equilibrium reversible steps (e.g. PGK's keq=3200) stay stable
 * even at 8x speed, rather than fixing substep count and letting the
 * internal step grow with it.
 */
const TARGET_INTERNAL_DT = 0.005;

export interface SimulationPanelProps {
  steps: ResolvedStep[];
  /** Latest per-reaction flux, one call per frame — forwarded to
   * `PathwayMap` for edge highlighting. */
  onFlux?: (flux: Record<string, number>) => void;
  /** Latest concentrations, one call per frame — forwarded to
   * `PathwayMap` for the metabolite "fill level" visualization. */
  onConcentrations?: (conc: ConcentrationMap) => void;
  /**
   * Fires whenever Play/Pause/Reset actually changes whether the
   * integrator is running. `PathwayMap`'s flux particles use this to stay
   * frozen when concentrations change from "Add glucose" or "Reset" while
   * paused — otherwise a nonzero instantaneous flux, computed from a
   * static snapshot, would look like the animation is running unprompted.
   */
  onPlayingChange?: (isPlaying: boolean) => void;
  /** Fires whenever the speed multiplier changes (and once on mount with the default), so the flux particle animation can scale its own playback speed to match rather than only reflecting instantaneous flux. */
  onSpeedChange?: (speed: number) => void;
}

export default function SimulationPanel({
  steps,
  onFlux,
  onConcentrations,
  onPlayingChange,
  onSpeedChange,
}: SimulationPanelProps) {
  const [conc, setConc] = useState<ConcentrationMap>(DEFAULT_INITIAL_CONCENTRATIONS);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);

  // Refs so the rAF loop always sees current values without re-subscribing.
  const concRef = useRef(conc);
  concRef.current = conc;
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const lastTsRef = useRef<number | null>(null);

  // Notify the parent (map fill + edge flux) whenever concentrations
  // change, whether that's from the animation loop, "Add glucose", or
  // "Reset" — not just during playback.
  useEffect(() => {
    onConcentrations?.(conc);
    onFlux?.(computeFlux(stepsRef.current, conc));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conc]);

  useEffect(() => {
    onPlayingChange?.(isPlaying);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  useEffect(() => {
    onSpeedChange?.(speed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed]);

  useEffect(() => {
    if (!isPlaying) {
      lastTsRef.current = null;
      return;
    }
    let frameId: number;
    const tick = (ts: number) => {
      if (lastTsRef.current === null) lastTsRef.current = ts;
      const wallDt = Math.min(0.25, (ts - lastTsRef.current) / 1000); // clamp huge tab-switch gaps
      lastTsRef.current = ts;

      const modelDt = wallDt * speedRef.current;
      const substeps = Math.max(1, Math.ceil(modelDt / TARGET_INTERNAL_DT));
      const next = advance(stepsRef.current, concRef.current, modelDt, substeps);
      setConc(next);

      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying]);

  const addGlucose = () => {
    setConc((prev) => ({ ...prev, glucose: (prev.glucose ?? 0) + GLUCOSE_PULSE_MM }));
  };

  const reset = () => {
    setIsPlaying(false);
    setConc(DEFAULT_INITIAL_CONCENTRATIONS);
  };

  return (
    <div style={{ marginTop: "2rem" }}>
      <h2 style={{ marginBottom: "0.25rem" }}>Simulation</h2>
      <p style={{ color: "#64748b", marginTop: 0, fontSize: 14 }}>
        Add glucose and watch it move through the pathway — metabolite boxes
        on the map above fill with color as they accumulate, and reaction
        edges highlight by current flux. Client-side ODE integration over
        the same rate laws that drive the enzyme detail panels, nothing
        pre-scripted.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={addGlucose} style={buttonStyle("#0ea5e9")}>
          + Add glucose ({GLUCOSE_PULSE_MM} mM)
        </button>
        <button onClick={() => setIsPlaying((p) => !p)} style={buttonStyle(isPlaying ? "#f97316" : "#16a34a")}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button onClick={reset} style={buttonStyle("#64748b")}>
          Reset
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
            marginLeft: "0.5rem",
            paddingLeft: "0.75rem",
            borderLeft: "1px solid #e2e8f0",
          }}
        >
          <span style={{ fontSize: 13, color: "#64748b" }}>Speed:</span>
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              style={{
                ...buttonStyle(speed === s ? "#1d4ed8" : "#e2e8f0"),
                color: speed === s ? "#fff" : "#334155",
                padding: "0.3rem 0.6rem",
                fontSize: 12,
              }}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function buttonStyle(color: string): React.CSSProperties {
  return {
    padding: "0.4rem 0.8rem",
    borderRadius: 6,
    border: "none",
    background: color,
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  };
}
