# Interactive Metabolic Map — Glycolysis (v0)

An interactive, static web app for exploring human glycolysis: flux through the
pathway, per-enzyme structure + kinetics, per-reaction mechanism notes, tissue
isoform switching, and (later) inhibitor modeling.

No accounts, no server-side persistence. All state (fuel input, tissue
context, active inhibitors) lives in the browser and can be encoded into the
URL for sharing a specific scenario.

## Stack

- **Frontend only** — React + TypeScript, built with Vite.
- **Map**: custom SVG, D3 for layout/scales.
- **Structure viewer**: Mol* (to be added in `src/components/StructureViewer`).
- **Simulation**: client-side ODE integrator (`src/sim`), no backend compute.
- **Data**: versioned JSON under `src/data/`, typed by `src/types/schema.ts`.

## Getting started

Prerequisites: Node.js LTS (20.x or later) and git.

```bash
npm install
npm run dev
```

This starts a local dev server (Vite will print the URL, typically
http://localhost:5173).

```bash
npm run build
```

Produces a static `dist/` folder — this is the entire deployable artifact.
Any static host works: GitHub Pages, university web server, S3, etc.

## Project structure

```
src/
  types/schema.ts       - TypeScript types for the whole data model
  data/glycolysis/       - the actual pathway content (metabolites, enzymes,
                            isoforms, reactions) as JSON
  sim/                   - rate law functions + ODE integrator
  components/            - React components (map, structure viewer,
                            reaction panel, kinetics panel)
docs/
  schema.md              - explains the data model design decisions
```

## Roadmap (tracked as GitHub issues/milestones)

1. Overview flux map (static, then animated)
2. Enzyme structure viewer with annotations + kinetics
3. Reaction detail panel
4. Fuel input + client-side flux simulation
5. Tissue isoform switching (muscle -> liver)
6. Inhibitors (competitive / noncompetitive / allosteric)
7. Genetic variants (as isoform overrides)
