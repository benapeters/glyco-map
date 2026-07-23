import { useEffect, useRef, useState } from "react";
import type { PathwayDataset, TissueContext } from "../types/schema";

/**
 * Hand-placed lattice coordinates for the glycolysis topology.
 *
 * This is intentionally static (not D3-computed) for now: the topology is a
 * simple linear chain with one branch/merge (aldolase splits F1,6BP into
 * DHAP + G3P; TPI merges DHAP back into the G3P pool), so a hand-placed
 * layout is clearer than a general force/DAG layout at this scale. Revisit
 * with a real D3 layout (see docs/PROJECT_NOTES.md) once more pathways are
 * added and node count grows.
 *
 * Only "main chain" metabolites get a node here — cofactors (ATP, ADP, NAD+,
 * etc.) are listed in each reaction's equation/tooltip instead of drawn as
 * separate nodes, to keep the topology view readable.
 */
const METABOLITE_POSITIONS: Record<string, { x: number; y: number }> = {
  glucose: { x: 60, y: 220 },
  g6p: { x: 220, y: 220 },
  f6p: { x: 380, y: 220 },
  f16bp: { x: 540, y: 220 },
  dhap: { x: 700, y: 110 },
  g3p: { x: 700, y: 330 },
  bpg13: { x: 860, y: 330 },
  pg3: { x: 1020, y: 330 },
  pg2: { x: 1180, y: 330 },
  pep: { x: 1340, y: 330 },
  pyruvate: { x: 1500, y: 330 },
};

/** Main-chain edges per reaction. Aldolase has two (the branch point). */
const MAIN_CHAIN_EDGES: Record<string, [string, string][]> = {
  hk_reaction: [["glucose", "g6p"]],
  pgi_reaction: [["g6p", "f6p"]],
  pfk1_reaction: [["f6p", "f16bp"]],
  aldolase_reaction: [
    ["f16bp", "dhap"],
    ["f16bp", "g3p"],
  ],
  tpi_reaction: [["dhap", "g3p"]],
  gapdh_reaction: [["g3p", "bpg13"]],
  pgk_reaction: [["bpg13", "pg3"]],
  pgm_reaction: [["pg3", "pg2"]],
  enolase_reaction: [["pg2", "pep"]],
  pk_reaction: [["pep", "pyruvate"]],
};

/** Where to draw the clickable enzyme node for each slot, offset off the main edge line. */
const ENZYME_ANCHORS: Record<string, { x: number; y: number }> = {
  HK_step: { x: 140, y: 175 },
  PGI_step: { x: 300, y: 175 },
  PFK1_step: { x: 460, y: 175 },
  ALD_step: { x: 560, y: 165 },
  TPI_step: { x: 745, y: 220 },
  GAPDH_step: { x: 780, y: 285 },
  PGK_step: { x: 940, y: 285 },
  PGM_step: { x: 1100, y: 285 },
  ENO_step: { x: 1260, y: 285 },
  PK_step: { x: 1420, y: 285 },
};

const VIEWBOX = "0 0 1580 420";
const NODE_RX = 46;
const NODE_RY = 24;
const ENZYME_R = 16;

/**
 * Particle-Based Flux Animation
 * -----------------------------
 * Presentational-only chemistry metadata: carbon-backbone length and
 * phosphate-tag count per main-chain metabolite, used purely to draw a
 * recognizable little "molecule" riding the flux particles below. This is
 * NOT part of the citation-bearing kinetic data model (schema.ts) — it's
 * textbook-standard structure (a hexose has 6 carbons, a triose has 3,
 * etc.), not a parameter that needs a BRENDA/UniProt source. Hand-derived
 * from each metabolite's known structure:
 *   glucose 6C/0P, G6P 6C/1P, F6P 6C/1P, F1,6BP 6C/2P (hexoses)
 *   DHAP 3C/1P, G3P 3C/1P, 1,3-BPG 3C/2P, 3-PG 3C/1P, 2-PG 3C/1P,
 *   PEP 3C/1P, pyruvate 3C/0P (trioses, post-aldolase)
 */
const PARTICLE_MODEL: Record<string, { carbons: number; phosphates: number }> = {
  glucose: { carbons: 6, phosphates: 0 },
  g6p: { carbons: 6, phosphates: 1 },
  f6p: { carbons: 6, phosphates: 1 },
  f16bp: { carbons: 6, phosphates: 2 },
  dhap: { carbons: 3, phosphates: 1 },
  g3p: { carbons: 3, phosphates: 1 },
  bpg13: { carbons: 3, phosphates: 2 },
  pg3: { carbons: 3, phosphates: 1 },
  pg2: { carbons: 3, phosphates: 1 },
  pep: { carbons: 3, phosphates: 1 },
  pyruvate: { carbons: 3, phosphates: 0 },
};

/** Perpendicular offset (px) of the forward/reverse Bezier control point from the edge midpoint. */
const ARC_HEIGHT = 26;

interface EdgeGeometry {
  reactionId: string;
  edgeIndex: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Control point for the outward-right forward stream: M + h*N̂. */
  fwdControl: { x: number; y: number };
  /** Control point for the outward-left reverse stream: M - h*N̂. */
  revControl: { x: number; y: number };
  /** Straight-line length, used as a cheap stand-in for arc length when converting speed to dt/dt-of-t. */
  length: number;
  fromModel?: { carbons: number; phosphates: number };
  toModel?: { carbons: number; phosphates: number };
}

/**
 * Static per-edge geometry (positions never change), computed once at
 * module scope rather than re-derived every render/frame.
 */
const EDGE_GEOMETRY: EdgeGeometry[] = Object.entries(MAIN_CHAIN_EDGES).flatMap(
  ([reactionId, edges]) =>
    edges
      .map(([fromId, toId], edgeIndex): EdgeGeometry | null => {
        const from = METABOLITE_POSITIONS[fromId];
        const to = METABOLITE_POSITIONS[toId];
        if (!from || !to) return null;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        // Unit normal, perpendicular to the edge direction.
        const nx = -dy / len;
        const ny = dx / len;
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2;
        return {
          reactionId,
          edgeIndex,
          from,
          to,
          fwdControl: { x: mx + ARC_HEIGHT * nx, y: my + ARC_HEIGHT * ny },
          revControl: { x: mx - ARC_HEIGHT * nx, y: my - ARC_HEIGHT * ny },
          length: len,
          fromModel: PARTICLE_MODEL[fromId],
          toModel: PARTICLE_MODEL[toId],
        };
      })
      .filter((e): e is EdgeGeometry => e !== null)
);

function quadraticBezierPoint(
  p0: { x: number; y: number },
  c: { x: number; y: number },
  p1: { x: number; y: number },
  t: number
) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p1.x,
    y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * p1.y,
  };
}

/** Tangent (unnormalized) of a quadratic Bezier at t — used to orient the particle along its path. */
function quadraticBezierTangent(
  p0: { x: number; y: number },
  c: { x: number; y: number },
  p1: { x: number; y: number },
  t: number
) {
  return {
    x: 2 * (1 - t) * (c.x - p0.x) + 2 * t * (p1.x - c.x),
    y: 2 * (1 - t) * (c.y - p0.y) + 2 * t * (p1.y - c.y),
  };
}

type Stream = "fwd" | "rev";

interface FluxParticle {
  id: number;
  reactionId: string;
  edgeIndex: number;
  stream: Stream;
  t: number; // progress along the arc, 0 -> 1
  progressPerSecond: number; // fixed at spawn time from the flux magnitude then
}

/**
 * Below this |flux| (mM/s), an edge is treated as inactive: no new spawns,
 * and any particles already on it keep coasting to completion rather than
 * snapping away. Keeps idle edges from spawning particles from numerical
 * noise near zero.
 */
const FLUX_EPSILON = 1e-3;
/** mM/s of flux that saturates spawn rate / speed scaling, past which more flux just means denser/faster, not unboundedly so. */
const FLUX_SATURATION = 1.2;
const MIN_SPAWN_PER_SEC = 0.4;
const MAX_SPAWN_PER_SEC = 9;
const MIN_PROGRESS_PER_SEC = 0.35; // full edge crossing in ~2.9s at minimum
const MAX_PROGRESS_PER_SEC = 1.4; // full edge crossing in ~0.7s at max flux
/**
 * Reversible (near-equilibrium) steps run substantial flux in both
 * directions even when net flux is small — that's the physical meaning of
 * "near equilibrium". We don't track separate forward/reverse gross
 * fluxes (only the net signed velocity from `computeRate`), so the
 * secondary stream is approximated as this fraction of the primary
 * stream's spawn rate rather than a true independent rate.
 */
const SECONDARY_STREAM_RATIO = 0.45;
const MAX_ACTIVE_PARTICLES = 240;

function densityFromFlux(absFlux: number): number {
  const saturation = Math.min(1, absFlux / FLUX_SATURATION);
  return MIN_SPAWN_PER_SEC + saturation * (MAX_SPAWN_PER_SEC - MIN_SPAWN_PER_SEC);
}

function speedFromFlux(absFlux: number): number {
  const saturation = Math.min(1, absFlux / FLUX_SATURATION);
  return MIN_PROGRESS_PER_SEC + saturation * (MAX_PROGRESS_PER_SEC - MIN_PROGRESS_PER_SEC);
}

let particleIdCounter = 0;

/**
 * Owns the particle simulation and its own `requestAnimationFrame` loop.
 * Split out from the main map component so the (frequent, per-particle)
 * re-renders this causes during playback stay scoped to this `<g>` instead
 * of re-rendering the whole map's nodes/edges every frame.
 */
function FluxParticles({
  reactionFlux,
  reversibleReactions,
}: {
  reactionFlux: Record<string, number>;
  /** Set of reaction ids resolved to a `reversible_mm` isoform for the current tissue — these get a secondary back-flow stream. */
  reversibleReactions: Set<string>;
}) {
  const [particles, setParticles] = useState<FluxParticle[]>([]);
  const particlesRef = useRef<FluxParticle[]>([]);
  const spawnDebtRef = useRef<Record<string, number>>({});
  const fluxRef = useRef(reactionFlux);
  fluxRef.current = reactionFlux;
  const reversibleRef = useRef(reversibleReactions);
  reversibleRef.current = reversibleReactions;
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    let frameId: number;
    const tick = (ts: number) => {
      if (lastTsRef.current === null) lastTsRef.current = ts;
      const dt = Math.min(0.25, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;

      const flux = fluxRef.current;
      const reversible = reversibleRef.current;
      const debt = spawnDebtRef.current;
      let live = particlesRef.current;

      // Advance existing particles, dropping any that finished their arc.
      live = live
        .map((p) => ({ ...p, t: p.t + p.progressPerSecond * dt }))
        .filter((p) => p.t < 1);

      // Spawn new particles per edge, density/speed driven by current flux.
      for (const edge of EDGE_GEOMETRY) {
        const flowVelocity = flux[edge.reactionId] ?? 0;
        const absFlux = Math.abs(flowVelocity);
        if (absFlux < FLUX_EPSILON) continue;
        if (live.length >= MAX_ACTIVE_PARTICLES) break;

        const primaryStream: Stream = flowVelocity >= 0 ? "fwd" : "rev";
        const secondaryStream: Stream = primaryStream === "fwd" ? "rev" : "fwd";
        const isReversible = reversible.has(edge.reactionId);

        const streams: Array<{ stream: Stream; rate: number }> = [
          { stream: primaryStream, rate: densityFromFlux(absFlux) },
        ];
        if (isReversible) {
          streams.push({
            stream: secondaryStream,
            rate: densityFromFlux(absFlux) * SECONDARY_STREAM_RATIO,
          });
        }

        for (const { stream, rate } of streams) {
          const key = `${edge.reactionId}-${edge.edgeIndex}-${stream}`;
          const nextDebt = (debt[key] ?? 0) + rate * dt;
          let spent = nextDebt;
          const spawned: FluxParticle[] = [];
          while (spent >= 1 && live.length + spawned.length < MAX_ACTIVE_PARTICLES) {
            spawned.push({
              id: ++particleIdCounter,
              reactionId: edge.reactionId,
              edgeIndex: edge.edgeIndex,
              stream,
              t: 0,
              progressPerSecond: speedFromFlux(absFlux),
            });
            spent -= 1;
          }
          debt[key] = spent;
          if (spawned.length) live = live.concat(spawned);
        }
      }

      particlesRef.current = live;
      setParticles(live);
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <g pointerEvents="none">
      {particles.map((p) => {
        const edge = EDGE_GEOMETRY.find(
          (e) => e.reactionId === p.reactionId && e.edgeIndex === p.edgeIndex
        );
        if (!edge) return null;
        const control = p.stream === "fwd" ? edge.fwdControl : edge.revControl;
        // A particle drawn on the forward arc travels from -> to as t: 0->1;
        // one drawn on the reverse arc represents the reaction running
        // backward, so it travels to -> from instead (arc geometry is
        // shared, only the endpoints swap).
        const p0 = p.stream === "fwd" ? edge.from : edge.to;
        const p1 = p.stream === "fwd" ? edge.to : edge.from;
        const pos = quadraticBezierPoint(p0, control, p1, p.t);
        const tangent = quadraticBezierTangent(p0, control, p1, p.t);
        const angle = (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI;
        // Forward particles carry the substrate's shape (what's leaving the
        // "from" pool); reverse particles carry the product's shape (what's
        // flowing back out of the "to" pool) — an approximation, since we
        // don't model the intermediate transition state visually.
        const model = (p.stream === "fwd" ? edge.fromModel : edge.toModel) ?? {
          carbons: 3,
          phosphates: 0,
        };
        const spacing = 4.5;
        const span = (model.carbons - 1) * spacing;

        return (
          <g key={p.id} transform={`translate(${pos.x}, ${pos.y}) rotate(${angle})`} opacity={p.stream === "fwd" ? 0.9 : 0.65}>
            {Array.from({ length: model.carbons }).map((_, i) => (
              <circle
                key={`c-${i}`}
                cx={-span / 2 + i * spacing}
                cy={0}
                r={1.6}
                fill={p.stream === "fwd" ? "#3b82f6" : "#94a3b8"}
              />
            ))}
            {model.phosphates >= 1 && (
              <circle cx={-span / 2} cy={-3.4} r={1.9} fill="#f59e0b" />
            )}
            {model.phosphates >= 2 && (
              <circle cx={span / 2} cy={-3.4} r={1.9} fill="#f59e0b" />
            )}
          </g>
        );
      })}
    </g>
  );
}

export interface PathwayMapProps {
  dataset: PathwayDataset;
  tissue: TissueContext;
  selectedEnzymeSlot?: string | null;
  selectedReactionId?: string | null;
  selectedMetaboliteId?: string | null;
  onEnzymeClick?: (enzymeSlotId: string) => void;
  onReactionClick?: (reactionId: string) => void;
  onMetaboliteClick?: (metaboliteId: string) => void;
  /**
   * Instantaneous velocity (mM/s) per reaction id, from the simulation
   * (see `src/sim/simulate.ts`). Optional and purely additive — when
   * present, edges are tinted/thickened by relative flux; when absent the
   * map renders exactly as it did before flux existed.
   */
  reactionFlux?: Record<string, number>;
  /**
   * Concentrations (mM) by metabolite id, from the simulation. Optional and
   * purely additive, same pattern as `reactionFlux` — when present,
   * metabolite boxes fill bottom-up with color proportional to
   * concentration (a "level meter" — pooling metabolite in front of a slow
   * step is an immediate visual for a bottleneck); when absent the boxes
   * render exactly as they did before concentration existed.
   */
  concentrations?: Record<string, number>;
}

const FLUX_IDLE_COLOR = "#94a3b8"; // matches the original unhighlighted edge color
const FLUX_ACTIVE_COLOR = "#0369a1"; // deep blue at max flux
/**
 * Fill color for the metabolite "level meter", deliberately a different
 * hue from the flux gradient above — blue edges read as "rate happening
 * now", amber boxes read as "amount currently held", and conflating the
 * two colors would blur that distinction.
 */
const FILL_COLOR = "#f59e0b";
/**
 * Concentration (mM) that reads as a "full" box. Illustrative, not derived
 * from the isoform Km values — same "flagged, not yet verified" status as
 * the rest of the illustrative kinetic parameters (see docs/schema.md).
 * Concentrations above this just render full rather than overflow the box,
 * which is itself a useful signal (metabolite piling up faster than the
 * next step can clear it).
 */
const MAX_FILL_MM = 3;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const toHex = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Linear interpolation between two hex colors, t in [0, 1]. */
function lerpColor(from: string, to: string, t: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return rgbToHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

export default function PathwayMap({
  dataset,
  tissue,
  selectedEnzymeSlot,
  selectedReactionId,
  selectedMetaboliteId,
  onEnzymeClick,
  onReactionClick,
  onMetaboliteClick,
  reactionFlux,
  concentrations,
}: PathwayMapProps) {
  // Reversible steps (e.g. aldolase, with its tiny keq) can legitimately run
  // net-backward — computeRate returns a negative velocity in that case.
  // Normalizing by absolute value keeps the color scale meaningful either
  // way; direction isn't shown (the arrow always points the documented
  // forward direction), only magnitude of net flux.
  const maxFlux = reactionFlux
    ? Math.max(0.001, ...Object.values(reactionFlux).map((v) => Math.abs(v)))
    : 0;
  const metaboliteById = new Map(dataset.metabolites.map((m) => [m.id, m]));
  const reactionById = new Map(dataset.reactions.map((r) => [r.id, r]));

  const isoformForSlot = (enzymeSlotId: string) =>
    dataset.isoforms.find(
      (iso) => iso.enzymeSlot === enzymeSlotId && iso.tissueContext === tissue
    );

  // Reactions whose active isoform (for the current tissue) uses the
  // Haldane-relation reversible rate law — these are the near-equilibrium
  // steps that get a secondary back-flow particle stream (see
  // FluxParticles/SECONDARY_STREAM_RATIO above).
  const reversibleReactions = new Set(
    dataset.enzymeSlots
      .filter((slot) => isoformForSlot(slot.id)?.rateLaw.type === "reversible_mm")
      .map((slot) => slot.reactionId)
  );

  return (
    <div style={{ position: "relative" }}>
      {reactionFlux && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            fontFamily: "sans-serif",
            fontSize: 11,
            color: "#64748b",
            gap: 2,
          }}
        >
          <span>Reaction flux</span>
          <div
            style={{
              width: 100,
              height: 8,
              borderRadius: 4,
              border: "1px solid #cbd5e1",
              background: `linear-gradient(to right, ${FLUX_IDLE_COLOR}, ${FLUX_ACTIVE_COLOR})`,
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", width: 100 }}>
            <span>low</span>
            <span>high</span>
          </div>
        </div>
      )}
      <svg
        viewBox={VIEWBOX}
        role="img"
        aria-label="Glycolysis pathway map"
        style={{ width: "100%", height: "auto", fontFamily: "sans-serif" }}
      >
      {/* Edges (reactions) drawn first so nodes sit on top */}
      {dataset.enzymeSlots.map((slot) => {
        const edges = MAIN_CHAIN_EDGES[slot.reactionId];
        const reaction = reactionById.get(slot.reactionId);
        if (!edges || !reaction) return null;
        const isSelected = selectedReactionId === reaction.id;

        return (
          <g key={`edges-${slot.id}`}>
            {edges.map(([fromId, toId], i) => {
              const from = METABOLITE_POSITIONS[fromId];
              const to = METABOLITE_POSITIONS[toId];
              if (!from || !to) return null;
              return (
                <g key={`${slot.id}-edge-${i}`}>
                  {/* Wide, invisible hit target — the visible line below is
                      only 2.5-4px wide, which is a frustratingly small
                      click/tap target on its own. `pointer-events: stroke`
                      makes this line's full stroke width clickable even
                      though it isn't painted. */}
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="transparent"
                    strokeWidth={24}
                    style={{
                      cursor: onReactionClick ? "pointer" : "default",
                      pointerEvents: "stroke",
                    }}
                    onClick={() => onReactionClick?.(reaction.id)}
                  >
                    <title>
                      {reaction.name}: {reaction.equation}
                    </title>
                  </line>
                  {(() => {
                    const flux = reactionFlux?.[reaction.id] ?? 0;
                    // Always non-negative, regardless of reaction direction.
                    const fluxRatio = reactionFlux ? Math.min(1, Math.abs(flux) / maxFlux) : 0;
                    const stroke = isSelected
                      ? "#1d4ed8"
                      : reactionFlux
                        ? lerpColor(FLUX_IDLE_COLOR, FLUX_ACTIVE_COLOR, fluxRatio)
                        : "#94a3b8";
                    return (
                      <line
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke={stroke}
                        strokeWidth={isSelected ? 4 : 2.5}
                        markerEnd="url(#arrowhead)"
                        pointerEvents="none"
                      />
                    );
                  })()}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Arrowhead marker definition */}
      <defs>
        <marker
          id="arrowhead"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8" />
        </marker>
      </defs>

      {/* Flux particles (carbon backbone + phosphate tags riding the arcs),
          drawn after edges but before nodes so particles duck behind the
          metabolite boxes/enzyme circles rather than rendering on top of
          their labels. Purely additive: only mounted while a live
          `reactionFlux` is being fed in from the simulation. */}
      {reactionFlux && (
        <FluxParticles reactionFlux={reactionFlux} reversibleReactions={reversibleReactions} />
      )}

      {/* Enzyme nodes (one per reaction step, clickable independent of edges) */}
      {dataset.enzymeSlots.map((slot) => {
        const anchor = ENZYME_ANCHORS[slot.id];
        if (!anchor) return null;
        const isoform = isoformForSlot(slot.id);
        const isSelected = selectedEnzymeSlot === slot.id;

        return (
          <g
            key={`enzyme-${slot.id}`}
            onClick={() => onEnzymeClick?.(slot.id)}
            style={{ cursor: onEnzymeClick ? "pointer" : "default" }}
          >
            <circle
              cx={anchor.x}
              cy={anchor.y}
              r={ENZYME_R}
              fill={isSelected ? "#1d4ed8" : "#f8fafc"}
              stroke={isSelected ? "#1d4ed8" : "#475569"}
              strokeWidth={2}
            >
              <title>
                {slot.name}
                {isoform ? ` — ${isoform.displayName} (${isoform.geneName})` : " — no isoform for this tissue"}
              </title>
            </circle>
            <text
              x={anchor.x}
              y={anchor.y + 4}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={isSelected ? "#f8fafc" : "#334155"}
              pointerEvents="none"
            >
              E
            </text>
          </g>
        );
      })}

      {/* Metabolite nodes */}
      {Object.entries(METABOLITE_POSITIONS).map(([id, pos]) => {
        const metabolite = metaboliteById.get(id);
        if (!metabolite) return null;
        const isSelected = selectedMetaboliteId === id;
        const conc = concentrations?.[id] ?? 0;
        const fillRatio = concentrations ? Math.min(1, conc / MAX_FILL_MM) : 0;
        const fillHeight = fillRatio * NODE_RY * 2;
        const clipId = `fill-clip-${id}`;
        const boxLeft = pos.x - NODE_RX;
        const boxTop = pos.y - NODE_RY;

        return (
          <g
            key={`metabolite-${id}`}
            onClick={() => onMetaboliteClick?.(id)}
            style={{ cursor: onMetaboliteClick ? "pointer" : "default" }}
          >
            {concentrations && (
              <clipPath id={clipId}>
                <rect x={boxLeft} y={boxTop} width={NODE_RX * 2} height={NODE_RY * 2} rx={10} />
              </clipPath>
            )}
            {/* Base/background, drawn first so the fill (if any) shows on
                top of it and the border (drawn last) sits cleanly over both. */}
            <rect
              x={boxLeft}
              y={boxTop}
              width={NODE_RX * 2}
              height={NODE_RY * 2}
              rx={10}
              fill={isSelected ? "#1d4ed8" : "#ffffff"}
            />
            {concentrations && !isSelected && fillRatio > 0 && (
              <rect
                x={boxLeft}
                y={pos.y + NODE_RY - fillHeight}
                width={NODE_RX * 2}
                height={fillHeight}
                fill={FILL_COLOR}
                opacity={0.55}
                clipPath={`url(#${clipId})`}
                pointerEvents="none"
              />
            )}
            <rect
              x={boxLeft}
              y={boxTop}
              width={NODE_RX * 2}
              height={NODE_RY * 2}
              rx={10}
              fill="none"
              stroke={isSelected ? "#1d4ed8" : "#334155"}
              strokeWidth={1.5}
              pointerEvents="none"
            >
              <title>
                {metabolite.name}
                {concentrations ? ` — ${conc.toFixed(3)} mM` : ""}
              </title>
            </rect>
            <text
              x={pos.x}
              y={pos.y + 4}
              textAnchor="middle"
              fontSize={12}
              fill={isSelected ? "#f8fafc" : "#0f172a"}
              pointerEvents="none"
            >
              {metabolite.name.length > 14 ? `${metabolite.id}` : metabolite.name}
            </text>
          </g>
        );
      })}
      </svg>
    </div>
  );
}
