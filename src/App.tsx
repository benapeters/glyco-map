import { useMemo, useState } from "react";
import metabolites from "./data/glycolysis/metabolites.json";
import reactions from "./data/glycolysis/reactions.json";
import enzymeData from "./data/glycolysis/enzymes.json";
import PathwayMap from "./components/PathwayMap";
import StructureViewer from "./components/StructureViewer";
import ReactionPanel from "./components/ReactionPanel";
import MetaboliteViewer from "./components/MetaboliteViewer";
import SimulationPanel from "./components/SimulationPanel";
import { resolveSteps } from "./sim/simulate";
import type {
  EnzymeIsoform,
  EnzymeSlot,
  Metabolite,
  PathwayDataset,
  Reaction,
  TissueContext,
} from "./types/schema";

// JSON imports widen literal fields (e.g. `compartment: string` instead of
// the `Compartment` union) — cast through `unknown` at this single boundary
// rather than losing type-checking on the data model everywhere it's used.
const dataset: PathwayDataset = {
  metabolites: metabolites as unknown as Metabolite[],
  reactions: reactions as unknown as Reaction[],
  enzymeSlots: enzymeData.enzymeSlots as unknown as EnzymeSlot[],
  isoforms: enzymeData.isoforms as unknown as EnzymeIsoform[],
};

export default function App() {
  const [tissue, setTissue] = useState<TissueContext>("muscle");
  const [selectedEnzymeSlot, setSelectedEnzymeSlot] = useState<string | null>(null);
  const [selectedReactionId, setSelectedReactionId] = useState<string | null>(null);
  const [selectedMetaboliteId, setSelectedMetaboliteId] = useState<string | null>(null);
  const [reactionFlux, setReactionFlux] = useState<Record<string, number>>({});
  const [concentrations, setConcentrations] = useState<Record<string, number>>({});
  const [isSimulationRunning, setIsSimulationRunning] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);

  // Recomputed only when tissue changes, not every simulation frame.
  const simulationSteps = useMemo(() => resolveSteps(dataset, tissue), [tissue]);

  const selectedIsoform = selectedEnzymeSlot
    ? dataset.isoforms.find(
        (iso) => iso.enzymeSlot === selectedEnzymeSlot && iso.tissueContext === tissue
      )
    : undefined;

  const selectedReaction = selectedReactionId
    ? dataset.reactions.find((r) => r.id === selectedReactionId)
    : undefined;

  const metaboliteById = new Map(dataset.metabolites.map((m) => [m.id, m]));
  const selectedMetabolite = selectedMetaboliteId
    ? metaboliteById.get(selectedMetaboliteId)
    : undefined;

  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 1100 }}>
      <h1>Glycolysis map</h1>

      <label>
        Tissue context:{" "}
        <select
          value={tissue}
          onChange={(e) => {
            setTissue(e.target.value as TissueContext);
            setReactionFlux({});
            setConcentrations({});
          }}
        >
          <option value="muscle">Muscle</option>
          <option value="liver">Liver</option>
        </select>
      </label>

      <div style={{ marginTop: "1.5rem", overflowX: "auto" }}>
        <PathwayMap
          dataset={dataset}
          tissue={tissue}
          selectedEnzymeSlot={selectedEnzymeSlot}
          selectedReactionId={selectedReactionId}
          selectedMetaboliteId={selectedMetaboliteId}
          reactionFlux={reactionFlux}
          concentrations={concentrations}
          isSimulationRunning={isSimulationRunning}
          simSpeed={simSpeed}
          onEnzymeClick={(slotId) => {
            setSelectedEnzymeSlot(slotId);
            setSelectedReactionId(null);
            setSelectedMetaboliteId(null);
          }}
          onReactionClick={(reactionId) => {
            setSelectedReactionId(reactionId);
            setSelectedEnzymeSlot(null);
            setSelectedMetaboliteId(null);
          }}
          onMetaboliteClick={(metaboliteId) => {
            setSelectedMetaboliteId(metaboliteId);
            setSelectedEnzymeSlot(null);
            setSelectedReactionId(null);
          }}
        />
      </div>

      {/* Structure viewer (enzyme click), reaction panel (reaction click),
          and metabolite viewer (metabolite node or in-equation name click)
          are all real. */}
      <div style={{ marginTop: "1.5rem", minHeight: "6rem" }}>
        {selectedIsoform && (
          <div>
            <h2>{selectedIsoform.displayName}</h2>
            <p>
              Gene: {selectedIsoform.geneName} · Rate law: {selectedIsoform.rateLaw.type} ·
              PDB: {selectedIsoform.structure.pdbId}
            </p>
            <p>{selectedIsoform.regulationNotes}</p>
            <StructureViewer isoform={selectedIsoform} />
          </div>
        )}
        {selectedReaction && (
          <ReactionPanel
            reaction={selectedReaction}
            metaboliteById={metaboliteById}
            selectedMetaboliteId={selectedMetaboliteId}
            onMetaboliteClick={setSelectedMetaboliteId}
          />
        )}
        {/* Shown whenever a metabolite is selected, whether that came from
            clicking a map node (which clears enzyme/reaction selection
            above) or clicking a name inside the reaction equation (which
            doesn't — so this renders alongside the reaction panel). */}
        {selectedMetabolite && !selectedIsoform && (
          <div style={{ marginTop: selectedReaction ? "1rem" : 0 }}>
            <h2>{selectedMetabolite.name}</h2>
            <p>
              Formula: {selectedMetabolite.formula ?? "—"} · Compartment:{" "}
              {selectedMetabolite.compartment}
            </p>
            <MetaboliteViewer metabolite={selectedMetabolite} />
          </div>
        )}
        {!selectedIsoform && !selectedReaction && !selectedMetabolite && (
          <p style={{ color: "#64748b" }}>
            Click an enzyme node (circle), a reaction edge (arrow), or a
            metabolite box above for details.
          </p>
        )}
      </div>

      <SimulationPanel
        steps={simulationSteps}
        onFlux={setReactionFlux}
        onConcentrations={setConcentrations}
        onPlayingChange={setIsSimulationRunning}
        onSpeedChange={setSimSpeed}
      />

      <h2>Loaded data counts</h2>
      <ul>
        <li>Metabolites: {dataset.metabolites.length}</li>
        <li>Reactions: {dataset.reactions.length}</li>
        <li>Enzyme slots: {dataset.enzymeSlots.length}</li>
        <li>Isoforms: {dataset.isoforms.length}</li>
      </ul>
    </div>
  );
}
