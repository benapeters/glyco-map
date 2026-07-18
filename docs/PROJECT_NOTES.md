# Project notes

Running log of status and decisions for the interactive glycolysis map.
Update this at the end of each work session so a fresh chat (or future you)
can pick up context quickly without re-deriving it.

## Project summary

Interactive metabolic map, starting with human glycolysis, with room to add
more pathways later. Static web app (no accounts, no server-side
persistence) — all state lives in the browser and can be encoded into the
URL for sharing a scenario.

Core objectives:
1. Overview map showing flux through the whole system
2. Click an enzyme -> structure viewer with annotated key regions + Km/Kcat
3. Click a reaction -> overall reaction + detailed mechanism notes
4. Add fuel (starting with glucose) and watch it move through the system
5. (Long term) accurately modeled inhibitors
6. Works on iPad and laptop
7. (Added later) switch tissue context (muscle <-> liver) to compare
   isoforms, and support genetic variants using the same mechanism

## Key decisions made so far

- **Stack**: React + TypeScript + Vite, static build only, no backend.
  Deployable to GitHub Pages or university static hosting as-is.
- **Map**: custom SVG, D3 for layout/scales (not yet built).
- **Structure viewer**: Mol* or NGL Viewer, loads PDB/mmCIF, supports
  residue-level annotation (not yet integrated).
- **Simulation**: client-side ODE integration, runs in-browser
  (Michaelis-Menten scale systems are cheap — no backend compute needed).
- **Data model** (`src/types/schema.ts`):
  - Pathway topology (metabolites, reactions) is tissue-agnostic.
  - Each reaction step has a stable `enzymeSlot` id. Tissue/variant
    differences live entirely in `EnzymeIsoform` records swapped in behind
    that slot — switching tissue is a data lookup, not a map rebuild.
  - A genetic variant is just an isoform-like override (`baseIsoformId` +
    modified params) — not a separate concept.
  - Units fixed globally: mM for concentration, mM/s for rate, s^-1 for
    kcat, mM for Km/Ki/Ka. Do not mix.
  - Three rate law types, one dispatcher (`src/sim/rateLaws.ts`):
    `irreversible_mm` (hexokinase, PFK-1, pyruvate kinase — physiologically
    one-way), `reversible_mm` (Haldane form, for near-equilibrium steps like
    PGI/TPI/PGK/enolase), `hill` (sigmoidal, needed for glucokinase despite
    being monomeric).
  - All rate laws can carry `effectors` (allosteric activators/inhibitors)
    — needed for PFK-1's AMP/ATP/citrate/F2,6BP regulation, and this same
    mechanism will carry competitive/noncompetitive inhibitors later.
  - Every isoform/reaction carries a `citations` array — BRENDA/UniProt as
    default sources. Don't add a kinetic parameter without a source.
- **Known simplifications** (intentional, documented in `docs/schema.md`):
  multi-substrate mechanisms simplified to independent saturation terms;
  hormonal control of liver PFK2/FBPase2 deferred (model as a manual
  fed/fasted slider rather than the signaling cascade); sample structure
  annotation residue ranges are placeholders, not yet verified.
- **Scope discipline**: build muscle-only glycolysis end-to-end first
  (map -> structure viewer -> reaction panel -> simulation) before adding
  liver isoform content, and before starting inhibitors.

## Environment status

- Dev machine: PC, using WSL (Ubuntu) for Node/npm.
- Git auth: SSH configured and working (`ssh -T git@github.com` succeeds).
- Repo: `github.com/benapeters/glyco-map`, pushed and tracking `origin/main`.
- Project lives at `~/projects/glyco-map` inside WSL (not under `/mnt/c/...`
  — keep it there; cross-filesystem access is slower and can cause
  permission issues with git/npm).
- Confirmed working: `npm install` + `npm run dev` starts Vite cleanly at
  http://localhost:5173, scaffold app loads sample data, tissue dropdown
  switches hexokinase (muscle) vs glucokinase (liver) rate behavior
  correctly.

## What exists in the repo right now

- `src/types/schema.ts` — full data model (see above)
- `src/data/glycolysis/` — full glycolysis pathway: 18 metabolites/cofactors,
  all 10 reactions (glucose -> pyruvate), 11 muscle isoforms + 1 liver
  isoform (`GCK_liver`, HK step only — other steps stay muscle-only per
  scope discipline)
- `src/sim/rateLaws.ts` — rate law dispatcher, all 3 types + effectors
- `src/components/PathwayMap.tsx` — real SVG pathway map: renders all 10
  reaction steps as a static node-and-edge layout (hand-placed lattice
  coordinates, not D3 yet), correctly shows the aldolase branch / TPI merge.
  Enzyme nodes and reaction edges are clickable via `onEnzymeClick` /
  `onReactionClick` props.
- `src/App.tsx` — wires `PathwayMap` to tissue-context state and a minimal
  detail panel below the map (shows selected isoform or reaction info as
  plain text — not yet the real structure viewer / reaction panel)
- `docs/schema.md` — design rationale for the data model
- `docs/PROJECT_NOTES.md` — this file

## Next step

Replace the placeholder detail panel in `App.tsx` with the real UI pieces:
- Structure viewer: on enzyme node click, load the isoform's `pdbId` into
  Mol* or NGL Viewer and highlight `structure.annotations` residue ranges
  (currently just placeholder ranges — verify against real PDB numbering
  before this is user-facing)
- Reaction panel: on reaction edge click, show the full equation,
  `mechanismNotes`, `deltaGNote`, and citations in a proper panel (not the
  current one-line text dump)
- Once both panels exist: wire the "add glucose" / flux-through-time
  objective (objective 4) using `computeRate` + client-side ODE integration
  over the full 10-step dataset that now exists
- Still deferred, per scope discipline: liver isoforms for steps other than
  HK, inhibitors, genetic variants

## Session log

- Session 1: architecture discussion, decided on static web app, no
  accounts, established the six core objectives.
- Session 2: worked out isoform/tissue-context model, rate law types,
  allosteric effectors, unit conventions, annotation schema.
- Session 3: environment setup — scaffolded the repo (schema, sample data,
  rate law dispatcher, minimal proving App.tsx), set up WSL + SSH git auth,
  pushed to GitHub, confirmed `npm run dev` works.
- Session 4: extended sample data from 2 reactions to the full 10-step
  glycolysis pathway (added all remaining metabolites, reactions, enzyme
  slots, and muscle isoforms with BRENDA-referenced EC numbers and
  illustrative kinetic parameters — flagged as needing verification before
  publishing, same as the existing structure annotation placeholders).
  Built `PathwayMap.tsx`, a static SVG component rendering the full
  topology with clickable enzyme nodes and reaction edges, and wired it
  into `App.tsx` with a minimal placeholder detail panel. Verified with
  `tsc -b` and `vite build` — both clean.
