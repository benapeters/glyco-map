import { useState } from "react";
import metabolites from "./data/glycolysis/metabolites.json";
import reactions from "./data/glycolysis/reactions.json";
import enzymeData from "./data/glycolysis/enzymes.json";
import { computeRate } from "./sim/rateLaws";
import type { EnzymeIsoform, TissueContext } from "./types/schema";

const isoforms = enzymeData.isoforms as EnzymeIsoform[];

export default function App() {
  const [tissue, setTissue] = useState<TissueContext>("muscle");
  const [glucose, setGlucose] = useState(5);

  const hkIsoform = isoforms.find(
    (iso) => iso.enzymeSlot === "HK_step" && iso.tissueContext === tissue
  );

  const rate = hkIsoform
    ? computeRate(hkIsoform.rateLaw, { glucose, atp: 2, g6p: 0.1 })
    : undefined;

  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 640 }}>
      <h1>Glycolysis map — scaffold check</h1>
      <p>
        This confirms the data pipeline works end to end: JSON data loads,
        types check, and the rate-law dispatcher runs. Replace this with the
        real map component next.
      </p>

      <label>
        Tissue context:{" "}
        <select value={tissue} onChange={(e) => setTissue(e.target.value as TissueContext)}>
          <option value="muscle">Muscle</option>
          <option value="liver">Liver</option>
        </select>
      </label>
      <br />
      <label>
        Glucose (mM):{" "}
        <input
          type="number"
          value={glucose}
          step={0.5}
          onChange={(e) => setGlucose(Number(e.target.value))}
        />
      </label>

      <h2>Active isoform</h2>
      <p>{hkIsoform ? hkIsoform.displayName : "none found"}</p>
      <p>Computed rate: {rate !== undefined ? rate.toFixed(4) : "n/a"} mM/s</p>

      <h2>Loaded data counts</h2>
      <ul>
        <li>Metabolites: {metabolites.length}</li>
        <li>Reactions: {reactions.length}</li>
        <li>Isoforms: {isoforms.length}</li>
      </ul>
    </div>
  );
}
