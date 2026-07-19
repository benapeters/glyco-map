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
- **Structure viewer**: NGL Viewer (chosen over Mol* — lighter runtime
  bundle for our scale, simpler API; revisit if/when we need cinematic
  state-to-state transitions for allosteric enzymes like PFK-1). Loads
  structures via `rcsb://<pdbId>`, highlights `structure.annotations`
  residue ranges with per-`kind` colored representations. NGL is loaded
  via dynamic `import()` so it doesn't block initial page load.
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
- `src/components/StructureViewer.tsx` — real structure viewer using NGL:
  loads the selected isoform's `structure.pdbId` from RCSB, draws a cartoon
  with each `structure.annotations` residue range highlighted by `kind`
  (color-coded), a legend/list below the viewer, and click-to-focus on an
  annotation. Residue ranges are still the placeholder values noted above —
  not yet verified against real PDB numbering.
- `src/App.tsx` — wires `PathwayMap` to tissue-context state; enzyme click
  renders the real `StructureViewer`, reaction click renders the real
  `ReactionPanel`
- `src/components/ReactionPanel.tsx` — reaction detail panel: substrate/
  product equation (using metabolite display names), reversibility and
  compartment, mechanism notes, thermodynamics note (`deltaGNote`, when
  present), and a citations list
- `docs/schema.md` — design rationale for the data model
- `docs/PROJECT_NOTES.md` — this file

## Next step

Structure viewer and reaction panel are both done (see above) — still need
to verify placeholder residue ranges and illustrative kinetic parameters
against real sources before this is user-facing. Remaining piece before
liver isoforms / inhibitors, per scope discipline:
- Objective 4: "add glucose" / flux-over-time UI, using `computeRate` +
  client-side ODE integration over the full 10-step dataset that now
  exists. This is the last piece of the muscle-only end-to-end pipeline
  (map -> structure viewer -> reaction panel -> simulation).
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
- Session 5: chose NGL over Mol* for the structure viewer (lighter runtime
  bundle at our scale; Mol*'s snapshot/state-interpolation system is more
  polished for allosteric state animation but not needed yet — revisit if
  PFK-1 T-state/R-state animation becomes a priority). Built
  `StructureViewer.tsx`: loads structures from RCSB, highlights annotated
  residue ranges color-coded by kind, click-to-focus. Verified `tsc -b`/
  `vite build` clean; NGL code-splits into its own ~371KB gzip chunk via
  dynamic `import()`, so it doesn't cost anything on initial page load.
  Not yet verified in a real browser against a live RCSB fetch (sandboxed
  build environment couldn't reach rcsb.org) — check this first with
  `npm run dev` locally before trusting it end-to-end.
- Session 6: verified the NGL structure viewer works against live RCSB
  fetches in a real browser (confirmed by Ben, not just build-checked).
  Committed and tagged that work as v0.2.0. Built `ReactionPanel.tsx` and
  wired it into `App.tsx`, replacing the one-line reaction text dump —
  shows the substrate/product equation with real metabolite names,
  reversibility/compartment, mechanism notes, thermodynamics note, and
  citations. Verified `tsc -b`/`vite build` clean. Not yet checked in a
  real browser.
- Session 7: fixed a real usability bug — reaction edges were
  only clickable on their 2.5px visible stroke. Added an invisible 24px-wide
  `pointer-events: stroke` hit-target line alongside each visible edge in
  `PathwayMap.tsx`; the visible line itself is now `pointer-events: none`.
  Also added `MetaboliteViewer.tsx` — a small-molecule counterpart to
  StructureViewer. Metabolites aren't proteins, so there's no PDB entry;
  instead it pulls a 3D SDF conformer from PubChem by CID
  (`rest/pug/compound/cid/<cid>/record/SDF/?record_type=3d`, falling back
  to `record_type=2d` for a few highly ionic species like bare phosphate
  that lack a 3D conformer) and hands it to the same NGL Stage machinery.
  Added `pubchemCid` to the `Metabolite` schema and hand-verified CIDs for
  all 18 metabolites against Wikipedia/PubChem infoboxes (not looked up
  programmatically — spot-check if a rendered structure looks wrong).
  Main-chain metabolite map nodes are now clickable; cofactors (ATP, NADH,
  etc., not drawn as map nodes) are viewable by clicking their name inside
  the reaction equation in `ReactionPanel`. Verified `tsc -b`/`vite build`
  clean. Two things NOT yet verified in a real browser (sandbox can't
  reach rcsb.org or pubchem.ncbi.nlm.nih.gov): the wider click target
  actually feels right, and PubChem's PUG REST allows the cross-origin
  fetch NGL needs (widely used for client-side SDF fetches, but not
  something I could confirm directly — also worth knowing PubChem asks for
  no more than 5 requests/sec, relevant if someone clicks through several
  metabolites quickly).
