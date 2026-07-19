/**
 * Core data model.
 *
 * Design principles (see docs/schema.md for the full rationale):
 * - Pathway topology (metabolites, reactions) is tissue-agnostic.
 * - Tissue/variant differences live entirely in `EnzymeIsoform` records,
 *   which are swapped in behind a stable `enzymeSlot` id.
 * - A genetic variant is just another isoform-like override, not a
 *   separate concept.
 * - Units are fixed globally: concentrations in mM, rates in mM/s,
 *   kcat in s^-1, Km/Ki in mM, volumes not modeled (well-mixed compartment).
 */

export type Compartment = "cytosol" | "mitochondrial_matrix" | "extracellular";

export type TissueContext = "muscle" | "liver"; // extend as pathways/tissues grow

export interface Citation {
  source: string; // e.g. "BRENDA", "UniProt", "Smith et al. 1998"
  url?: string;
  note?: string;
}

export interface Metabolite {
  id: string; // e.g. "glucose", "g6p", "pyruvate"
  name: string;
  formula?: string;
  compartment: Compartment;
  /**
   * PubChem Compound ID for the free/unbound small molecule. Used to load a
   * 3D structure via NGL (see StructureViewer/MetaboliteViewer) — distinct
   * from `structure.pdbId` on enzyme isoforms, which points to a protein
   * structure. Verified by hand against Wikipedia/PubChem infoboxes at
   * data-entry time (see docs/PROJECT_NOTES.md) rather than looked up
   * programmatically, so worth a spot-check if a rendered structure looks
   * wrong for a given metabolite.
   */
  pubchemCid?: number;
}

/** A stable position in the pathway topology, independent of which isoform fills it. */
export interface EnzymeSlot {
  id: string; // e.g. "HK_step", "PFK1_step", "PK_step"
  name: string; // human-readable step name, e.g. "Glucose phosphorylation"
  reactionId: string; // links to Reaction
}

export type RateLawType =
  | "irreversible_mm" // classic single-substrate Michaelis-Menten
  | "reversible_mm" // Haldane-relation reversible MM
  | "hill"; // sigmoidal, e.g. glucokinase

export interface AllostericEffector {
  metaboliteId: string;
  mode: "activator" | "inhibitor";
  kA_or_kI: number; // effective constant, mM
  hillCoefficient?: number;
}

export interface RateLawParams {
  type: RateLawType;
  vMax: number; // mM/s, at reference enzyme concentration
  km: Record<string, number>; // metaboliteId -> Km (mM), per substrate
  kmProducts?: Record<string, number>; // for reversible_mm
  keq?: number; // equilibrium constant, required for reversible_mm
  hillCoefficient?: number; // for hill
  effectors?: AllostericEffector[];
}

/** One isoform of one enzyme, scoped to a tissue context (or a named variant). */
export interface EnzymeIsoform {
  id: string; // e.g. "HK1_muscle", "GCK_liver", "GCK_MODY2_variant"
  enzymeSlot: string; // -> EnzymeSlot.id
  tissueContext: TissueContext | "variant";
  geneName: string; // e.g. "HK1", "GCK"
  displayName: string; // e.g. "Hexokinase I", "Glucokinase (MODY2 variant)"
  compartment: Compartment;
  structure: {
    pdbId: string;
    annotations: StructureAnnotation[];
  };
  rateLaw: RateLawParams;
  regulationNotes: string; // free text, cited
  citations: Citation[];
  /** If this is a variant, which isoform it's an override of. */
  baseIsoformId?: string;
  variantDescription?: string; // e.g. "R36W substitution, reduces glucose affinity"
}

export interface StructureAnnotation {
  label: string; // e.g. "Catalytic aspartate", "ATP-binding loop"
  residueRange: [number, number]; // 1-indexed, per PDB numbering
  kind: "active_site" | "cofactor_binding" | "allosteric_site" | "mutation" | "other";
  note?: string;
}

export interface Reaction {
  id: string;
  name: string; // e.g. "Hexokinase reaction"
  equation: string; // e.g. "glucose + ATP -> G6P + ADP"
  substrateIds: string[];
  productIds: string[];
  compartment: Compartment;
  reversible: boolean;
  deltaGNote?: string; // physiological ΔG context, cited
  mechanismNotes: string;
  citations: Citation[];
}

export interface PathwayDataset {
  metabolites: Metabolite[];
  enzymeSlots: EnzymeSlot[];
  isoforms: EnzymeIsoform[];
  reactions: Reaction[];
}
