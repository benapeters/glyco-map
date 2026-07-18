# Data model design notes

## Why isoforms are separated from pathway topology

Metabolites and reactions describe *what the pathway is* and don't change
between tissues. `EnzymeIsoform` records describe *what fills a given step*
and vary by tissue context. Every reaction step has a stable `enzymeSlot` id;
the UI and simulation always resolve "which isoform is active" through that
slot, keyed by the currently selected `tissueContext`. Switching tissue is
therefore a data lookup, not a structural change to the map.

Genetic variants reuse the same shape: a variant is an `EnzymeIsoform` with
`tissueContext: "variant"`, a `baseIsoformId` pointing at the isoform it
modifies, and overridden rate law / structure annotation fields.

## Units (fixed, do not mix)

- Concentrations: mM
- Rates: mM/s
- kcat: s^-1
- Km, Ki, Ka: mM

## Rate laws supported

- `irreversible_mm` — standard saturating kinetics for physiologically
  one-way steps (hexokinase, PFK-1, pyruvate kinase).
- `reversible_mm` — Haldane-relation form for near-equilibrium steps (PGI,
  TPI, PGK, enolase). Requires `keq`.
- `hill` — sigmoidal kinetics, needed for glucokinase's non-Michaelian
  behavior despite being monomeric.

All three can carry `effectors` for allosteric activation/inhibition
(needed for PFK-1's AMP/ATP/citrate/F2,6BP regulation). Everything routes
through one dispatcher (`src/sim/rateLaws.ts`) so tissue switching,
inhibitors, and variants are all just different parameter sets through the
same code path — not special-cased branches.

## Known simplifications (intentional, flagged for later)

- Multi-substrate mechanisms are modeled as independent saturation terms,
  not true ordered/ping-pong kinetics.
- Hormonal control of liver PFK2/FBPase2 (insulin/glucagon-driven F2,6BP
  levels) is out of scope for now — treat as a manual slider input
  ("fed/fasted") rather than modeling the signaling cascade.
- Structure annotation residue ranges in the sample data are placeholders
  and must be verified against real PDB numbering before publishing.

## Citations

Every isoform and reaction carries a `citations` array. Do not add a
kinetic parameter without a source — BRENDA and UniProt are the default
references; note the organism/isoform/assay conditions where it matters.
