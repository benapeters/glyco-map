import { useState } from "react";
import metabolites from "./data/glycolysis/metabolites.json";
import reactions from "./data/glycolysis/reactions.json";
import enzymeData from "./data/glycolysis/enzymes.json";
import PathwayMap from "./components/PathwayMap";
import StructureViewer from "./components/StructureViewer";
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

  const selectedIsoform = selectedEnzymeSlot
    ? dataset.isoforms.find(
        (iso) => iso.enzymeSlot === selectedEnzymeSlot && iso.tissueContext === tissue
      )
    : undefined;

  const selectedReaction = selectedReactionId
    ? dataset.reactions.find((r) => r.id === selectedReactionId)
    : undefined;

  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 1100 }}>
      <h1>Glycolysis map</h1>

      <label>
        Tissue context:{" "}
        <select
          value={tissue}
          onChange={(e) => setTissue(e.target.value as TissueContext)}
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
          onEnzymeClick={(slotId) => {
            setSelectedEnzymeSlot(slotId);
            setSelectedReactionId(null);
          }}
          onReactionClick={(reactionId) => {
            setSelectedReactionId(reactionId);
            setSelectedEnzymeSlot(null);
          }}
        />
      </div>

      {/* Structure viewer (enzyme click) is now real (NGL). Reaction/mechanism
          panel (reaction click) is still the next piece of UI to build on
          top of this, per docs/PROJECT_NOTES.md. */}
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
          <div>
            <h2>{selectedReaction.name}</h2>
            <p>{selectedReaction.equation}</p>
            <p>{selectedReaction.mechanismNotes}</p>
          </div>
        )}
        {!selectedIsoform && !selectedReaction && (
          <p style={{ color: "#64748b" }}>
            Click an enzyme node (circle) or a reaction edge (arrow) above for details.
          </p>
        )}
      </div>

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
