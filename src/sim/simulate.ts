import type { EnzymeIsoform, PathwayDataset, TissueContext } from "../types/schema";
import { computeRate, type ConcentrationMap } from "./rateLaws";

/**
 * Resting-state starting concentrations (mM), illustrative — same
 * "flagged, not yet verified against real sources" status as the kinetic
 * parameters in the isoform data. Cofactor pools (ATP/ADP/NAD+/NADH/Pi)
 * start away from zero since they're recycled, not consumed from nothing;
 * all pathway intermediates start at zero until glucose is added.
 */
export const DEFAULT_INITIAL_CONCENTRATIONS: ConcentrationMap = {
  glucose: 0,
  g6p: 0,
  f6p: 0,
  f16bp: 0,
  dhap: 0,
  g3p: 0,
  bpg13: 0,
  pg3: 0,
  pg2: 0,
  pep: 0,
  pyruvate: 0,
  atp: 2.5,
  adp: 0.5,
  amp: 0.05,
  pi: 1.0,
  nad: 0.3,
  nadh: 0.02,
  citrate: 0.1,
};

/** How much a single "add glucose" click bumps glucose concentration, in mM. */
export const GLUCOSE_PULSE_MM = 5;

/**
 * Every metabolite is clamped to >= 0. This is a numerical-stability
 * safeguard (large dt / stiff steps like PGK's keq=3200 can otherwise
 * overshoot into negative territory), not a claim that the underlying
 * kinetics are unconditionally stable — same caveat as the rest of the
 * illustrative parameter set.
 */
function clampNonNegative(conc: ConcentrationMap): ConcentrationMap {
  const out: ConcentrationMap = {};
  for (const [id, v] of Object.entries(conc)) {
    out[id] = v < 0 ? 0 : v;
  }
  return out;
}

/**
 * One reaction step, resolved to the isoform active for the current tissue
 * context. Resolved once per tissue change rather than re-looked-up every
 * integration step.
 */
export interface ResolvedStep {
  reactionId: string;
  enzymeSlotId: string;
  substrateIds: string[];
  productIds: string[];
  isoform: EnzymeIsoform;
}

export function resolveSteps(dataset: PathwayDataset, tissue: TissueContext): ResolvedStep[] {
  const reactionById = new Map(dataset.reactions.map((r) => [r.id, r]));
  const steps: ResolvedStep[] = [];
  for (const slot of dataset.enzymeSlots) {
    const reaction = reactionById.get(slot.reactionId);
    const isoform = dataset.isoforms.find(
      (iso) => iso.enzymeSlot === slot.id && iso.tissueContext === tissue
    );
    if (!reaction || !isoform) continue; // e.g. liver-only slots not yet modeled
    steps.push({
      reactionId: reaction.id,
      enzymeSlotId: slot.id,
      substrateIds: reaction.substrateIds,
      productIds: reaction.productIds,
      isoform,
    });
  }
  return steps;
}

/**
 * Instantaneous velocity (mM/s) of every step at the given concentrations.
 * Exposed separately from the integrator so the UI can show current flux
 * (e.g. to color pathway edges) without re-deriving it from a finite
 * difference of concentrations.
 */
export function computeFlux(steps: ResolvedStep[], conc: ConcentrationMap): Record<string, number> {
  const flux: Record<string, number> = {};
  for (const step of steps) {
    flux[step.reactionId] = computeRate(step.isoform.rateLaw, conc);
  }
  return flux;
}

/**
 * dConc/dt from reaction stoichiometry. Every reaction here is modeled 1:1
 * per the schema's documented simplification (independent saturation terms
 * rather than true multi-substrate mechanisms) — one step of the reaction
 * consumes one unit of each substrate and produces one unit of each
 * product, at the rate given by its rate law. Aldolase is the one branch
 * point (1 F1,6BP -> 1 DHAP + 1 G3P); TPI merges the branch back into the
 * shared G3P pool.
 */
function derivatives(steps: ResolvedStep[], conc: ConcentrationMap): ConcentrationMap {
  const d: ConcentrationMap = {};
  for (const step of steps) {
    const v = computeRate(step.isoform.rateLaw, conc);
    for (const sub of step.substrateIds) {
      d[sub] = (d[sub] ?? 0) - v;
    }
    for (const prod of step.productIds) {
      d[prod] = (d[prod] ?? 0) + v;
    }
  }
  return d;
}

function addScaled(
  base: ConcentrationMap,
  delta: ConcentrationMap,
  scale: number
): ConcentrationMap {
  const out: ConcentrationMap = { ...base };
  for (const [id, dv] of Object.entries(delta)) {
    out[id] = (out[id] ?? 0) + dv * scale;
  }
  return out;
}

/**
 * Classic 4th-order Runge-Kutta step. Chosen over simple Euler because the
 * near-equilibrium reversible steps (large keq, tiny Km — see PGK's
 * keq=3200) make this system locally stiff; RK4 stays stable at a much
 * larger dt than Euler would tolerate, which matters for a real-time UI
 * loop.
 */
export function rk4Step(steps: ResolvedStep[], conc: ConcentrationMap, dt: number): ConcentrationMap {
  const k1 = derivatives(steps, conc);
  const k2 = derivatives(steps, addScaled(conc, k1, dt / 2));
  const k3 = derivatives(steps, addScaled(conc, k2, dt / 2));
  const k4 = derivatives(steps, addScaled(conc, k3, dt));

  const next: ConcentrationMap = { ...conc };
  const allIds = new Set([
    ...Object.keys(k1),
    ...Object.keys(k2),
    ...Object.keys(k3),
    ...Object.keys(k4),
  ]);
  for (const id of allIds) {
    const combined = ((k1[id] ?? 0) + 2 * (k2[id] ?? 0) + 2 * (k3[id] ?? 0) + (k4[id] ?? 0)) / 6;
    next[id] = (next[id] ?? 0) + combined * dt;
  }
  return clampNonNegative(next);
}

/**
 * Advances the simulation by `totalDt` seconds of model time, taking
 * `substeps` internal RK4 steps. Used by the UI's animation loop: one call
 * per animation frame, with a fixed small internal dt for stability
 * regardless of how much wall-clock time the frame actually covered.
 */
export function advance(
  steps: ResolvedStep[],
  conc: ConcentrationMap,
  totalDt: number,
  substeps = 10
): ConcentrationMap {
  const internalDt = totalDt / substeps;
  let current = conc;
  for (let i = 0; i < substeps; i++) {
    current = rk4Step(steps, current, internalDt);
  }
  return current;
}
