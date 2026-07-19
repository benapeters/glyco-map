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
- `src/data/glycolysis/` — full glycolysis pathway: 18 metabolites/cofactors
  (each with a hand-verified `pubchemCid` for structure viewing), all 10
  reactions (glucose -> pyruvate), 11 muscle isoforms + 1 liver isoform
  (`GCK_liver`, HK step only — other steps stay muscle-only per scope
  discipline)
- `src/sim/rateLaws.ts` — rate law dispatcher, all 3 types + effectors
- `src/components/PathwayMap.tsx` — real SVG pathway map: renders all 10
  reaction steps as a static node-and-edge layout (hand-placed lattice
  coordinates, not D3 yet), correctly shows the aldolase branch / TPI merge.
  Enzyme nodes, reaction edges, and main-chain metabolite nodes are all
  clickable via `onEnzymeClick` / `onReactionClick` / `onMetaboliteClick`
  props. Reaction edges have a wide invisible `pointer-events: stroke` hit
  target layered under the thin visible line — clicking the actual 2.5px
  line was a real usability problem, fixed in session 7.
- `src/components/StructureViewer.tsx` — real structure viewer using NGL:
  loads the selected isoform's `structure.pdbId` from RCSB, draws a cartoon
  with each `structure.annotations` residue range highlighted by `kind`
  (color-coded), a legend/list below the viewer, and click-to-focus on an
  annotation. Residue ranges are still the placeholder values noted above —
  not yet verified against real PDB numbering.
- `src/components/MetaboliteViewer.tsx` — small-molecule counterpart to
  StructureViewer: loads a 3D structure from PubChem by `pubchemCid` (2D
  fallback for a few ionic species with no 3D conformer) and renders it
  with NGL. Main-chain metabolites are clickable on the map; cofactors
  (ATP, NADH, etc., not drawn as map nodes) are clickable by name inside
  the reaction equation in `ReactionPanel`.
- `src/App.tsx` — wires `PathwayMap` to tissue-context state; enzyme click
  renders the real `StructureViewer`, reaction click renders the real
  `ReactionPanel`, metabolite click (map node or in-equation name) renders
  the real `MetaboliteViewer`; holds the live simulation's flux and feeds
  it back into `PathwayMap` for edge highlighting
- `src/components/ReactionPanel.tsx` — reaction detail panel: substrate/
  product equation (using metabolite display names, each clickable to open
  `MetaboliteViewer`), reversibility and compartment, mechanism notes,
  thermodynamics note (`deltaGNote`, when present), and a citations list
- `src/sim/simulate.ts` — objective 4 (add glucose / flux over time):
  resolves each enzyme slot to the active isoform for the current tissue
  (`resolveSteps`), derives dConc/dt from reaction stoichiometry using the
  existing `computeRate` dispatcher (1:1 per the schema's documented
  simplification — see `derivatives`), and integrates with fixed-step RK4
  (`rk4Step` / `advance`). RK4 rather than Euler because the near-
  equilibrium reversible steps (e.g. PGK's `keq=3200`) are locally stiff at
  the dt a real-time UI loop needs. `computeFlux` exposes instantaneous
  per-reaction velocity for the map's edge highlighting without having to
  finite-difference concentrations for it.
- `src/components/SimulationPanel.tsx` — "Add glucose" / Play / Reset / speed
  (0.25x-8x) controls. Runs the integrator in a `requestAnimationFrame`
  loop; substep count scales with the model-time span of each frame
  (target ~5ms internal RK4 step) so speeding up doesn't destabilize the
  near-equilibrium reversible steps. Reports live concentrations and flux
  up to `App` every time they change (not just during playback, so "Add
  glucose"/"Reset" show up immediately even while paused) so `PathwayMap`
  can render the fill-level visualization and edge highlighting. No chart —
  see session 9 below for why that was replaced.
- `src/components/PathwayMap.tsx` — gained two optional props, both
  purely additive (map renders exactly as before when absent): `reactionFlux`
  tints/thickens edges by relative flux; `concentrations` fills each
  metabolite box bottom-up like a level meter (amber, distinct hue from the
  blue flux edges), capped at an illustrative `MAX_FILL_MM` so metabolite
  piling up faster than the next step can clear it reads as a pinned-full
  box — itself a bottleneck signal.
- `docs/schema.md` — design rationale for the data model
- `docs/PROJECT_NOTES.md` — this file

## Next step

Objective 4 (add glucose / flux-over-time) is done and has been through
three UI iterations (see session log) — line chart, then map fill + speed
controls, then a fix for a real bug in the flux-edge styling plus a wider
speed range. That completes the muscle-only end-to-end pipeline (map ->
structure viewer -> reaction panel -> simulation) called out in the
scope-discipline decision.

Not yet checked in a real browser (sandboxed build environment — `tsc -b`
and `vite build` are clean, but the animation loop, RK4 stability at real
frame rates up to 32x, and whether the flux color-key and fill-level
visualization actually feel good on iPad haven't been eyeballed live).
Check that first with `npm run dev` before trusting it end-to-end, same
pattern as the structure viewer in session 5.

Remaining before liver isoforms / inhibitors, per scope discipline:
- Verify placeholder residue ranges (structure viewer) and illustrative
  kinetic parameters against real sources — flagged since session 3/4,
  still not done. Worth noting while doing that pass: PFK-1 is
  substantially pre-inhibited at the current resting-state ATP/AMP
  defaults (ATP=2.5mM vs. its own Ki=1.5mM), which is part of why the
  simulation reads as slow at 1x — physiologically plausible, but worth
  double-checking against real resting-muscle values rather than assuming
  it's simply a units/scale problem.
- `MAX_FILL_MM` (the concentration that reads as a "full" box) is a guessed
  constant, not derived from the isoform Km values — worth revisiting once
  the kinetic parameters above are verified, since realistic Km/vMax values
  might make some boxes always-full or always-empty at the current scale.
- Still deferred, per scope discipline: liver isoforms for steps other than
  HK, inhibitors, genetic variants.

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
  clean. Two things I couldn't check from the sandbox (no access to
  rcsb.org or pubchem.ncbi.nlm.nih.gov): whether the wider click target
  actually feels right, and whether PubChem's PUG REST allows the
  cross-origin fetch NGL needs (widely used for client-side SDF fetches,
  but not something I could confirm directly — also worth knowing PubChem
  asks for no more than 5 requests/sec, relevant if someone clicks through
  several metabolites quickly). Both confirmed working in a real browser by
  Ben: metabolite structures load, and the wider edges are much easier to
  click.
- Session 8: built objective 4 (add glucose / flux-over-time), the last
  piece of the muscle-only end-to-end pipeline. `src/sim/simulate.ts`
  resolves each enzyme slot to its tissue-appropriate isoform and
  integrates the 10-reaction system with fixed-step RK4 over the existing
  `computeRate` dispatcher — RK4 over Euler because near-equilibrium steps
  (PGK's `keq=3200`) are locally stiff at real-time-UI step sizes. Built
  `SimulationPanel.tsx` (add-glucose / play / reset, `requestAnimationFrame`
  loop, 20s rolling chart at 5 Hz) and `ConcentrationChart.tsx` (plain SVG,
  `d3.scaleLinear` for axes only). Gave `PathwayMap.tsx` an optional
  `reactionFlux` prop so active edges highlight during simulation, without
  changing its behavior when the prop is absent. Verified `tsc -b` and
  `vite build` clean. Not yet run in a real browser — the animation loop,
  numerical stability at real frame rates, and whether the flux
  highlighting reads well haven't been eyeballed live; check with
  `npm run dev` before trusting it end-to-end (same caveat as new UI in
  sessions 5 and 7).
- Session 9: reworked the objective-4 UI after Ben tried session 8's build —
  the line chart felt visually flat and a separate third panel is a poor
  fit on iPad. Removed `ConcentrationChart.tsx` and the chart entirely.
  Instead, `PathwayMap.tsx`'s existing metabolite boxes now double as the
  visualization: each fills bottom-up with color proportional to
  concentration (capped at an illustrative `MAX_FILL_MM`, so a metabolite
  backing up faster than the next step clears it reads as a pinned-full
  box — an immediate bottleneck signal, sitting right on the map instead of
  in separate readouts). Also added speed controls (0.25x-8x) to
  `SimulationPanel.tsx`; substep count now scales with each frame's
  model-time span (target ~5ms internal RK4 step) rather than being fixed,
  so higher speeds don't destabilize the near-equilibrium reversible steps.
  Verified `tsc -b` and `vite build` clean. Not yet checked in a real
  browser — same caveat as session 8, now compounded by the higher-speed
  numerical stability question above.
- Session 10: fixed a real bug Ben hit — hitting Play then adding glucose
  made the aldolase edges disappear temporarily. Root cause: aldolase's
  rate law has a tiny `keq` (0.0001, physiologically realistic — aldolase
  favors substrate at standard state, only pulled forward in vivo by rapid
  downstream consumption), so `computeRate` legitimately returns a
  negative velocity once enough G3P/DHAP has built up (net reverse flux).
  The flux-ratio math for edge width/opacity wasn't guarding against
  negative flux, so it briefly went to near-zero width/opacity —
  invisible, not actually broken. Per Ben's ask, replaced the width+opacity
  scheme entirely: edges are now a constant width, colored on a fixed
  low->high gradient by `Math.abs(flux)` (direction isn't shown, only
  magnitude — the arrow always points the documented forward direction),
  which structurally can't collapse to invisible. Added a small color-key
  in the map's top-right corner. Also widened the speed range — 1x read as
  sluggish given the illustrative vMax values and real product/allosteric
  inhibition baked into the rate laws (see PFK-1 note above); default is
  now 4x (was the most-used setting), ceiling raised to 32x. Verified
  `tsc -b` and `vite build` clean. Not yet checked in a real browser.
