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

export interface PathwayMapProps {
  dataset: PathwayDataset;
  tissue: TissueContext;
  selectedEnzymeSlot?: string | null;
  selectedReactionId?: string | null;
  selectedMetaboliteId?: string | null;
  onEnzymeClick?: (enzymeSlotId: string) => void;
  onReactionClick?: (reactionId: string) => void;
  onMetaboliteClick?: (metaboliteId: string) => void;
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
}: PathwayMapProps) {
  const metaboliteById = new Map(dataset.metabolites.map((m) => [m.id, m]));
  const reactionById = new Map(dataset.reactions.map((r) => [r.id, r]));

  const isoformForSlot = (enzymeSlotId: string) =>
    dataset.isoforms.find(
      (iso) => iso.enzymeSlot === enzymeSlotId && iso.tissueContext === tissue
    );

  return (
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
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={isSelected ? "#1d4ed8" : "#94a3b8"}
                    strokeWidth={isSelected ? 4 : 2.5}
                    markerEnd="url(#arrowhead)"
                    pointerEvents="none"
                  />
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
        return (
          <g
            key={`metabolite-${id}`}
            onClick={() => onMetaboliteClick?.(id)}
            style={{ cursor: onMetaboliteClick ? "pointer" : "default" }}
          >
            <rect
              x={pos.x - NODE_RX}
              y={pos.y - NODE_RY}
              width={NODE_RX * 2}
              height={NODE_RY * 2}
              rx={10}
              fill={isSelected ? "#1d4ed8" : "#ffffff"}
              stroke={isSelected ? "#1d4ed8" : "#334155"}
              strokeWidth={1.5}
            >
              <title>{metabolite.name}</title>
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
  );
}
