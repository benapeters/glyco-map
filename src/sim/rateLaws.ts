import type { RateLawParams } from "../types/schema";

/** Concentrations keyed by metabolite id, in mM. */
export type ConcentrationMap = Record<string, number>;

/**
 * Computes reaction velocity (mM/s) for a given rate law and current
 * concentrations. This is the single dispatch point tissue-switching,
 * inhibitors, and variants all flow through — extend here, not per-enzyme.
 */
export function computeRate(params: RateLawParams, conc: ConcentrationMap): number {
  let v: number;

  switch (params.type) {
    case "irreversible_mm": {
      // Multi-substrate ping-pong/sequential mechanisms simplified to a
      // product of independent saturation terms — adequate for a teaching
      // model, flagged here as a simplification.
      v = params.vMax;
      for (const [metaboliteId, km] of Object.entries(params.km)) {
        const s = conc[metaboliteId] ?? 0;
        v *= s / (km + s);
      }
      break;
    }
    case "reversible_mm": {
      if (params.keq === undefined) {
        throw new Error("reversible_mm rate law requires keq");
      }
      // Single-substrate/single-product Haldane form. Extend for
      // multi-substrate reversible steps as needed.
      const [subId, subKm] = Object.entries(params.km)[0];
      const [prodId, prodKm] = Object.entries(params.kmProducts ?? {})[0] ?? ["", 1];
      const s = conc[subId] ?? 0;
      const p = prodId ? (conc[prodId] ?? 0) : 0;
      v = (params.vMax * (s - p / params.keq)) / (subKm + s + (prodKm * s) / subKm);
      break;
    }
    case "hill": {
      const [subId, km] = Object.entries(params.km)[0];
      const s = conc[subId] ?? 0;
      const n = params.hillCoefficient ?? 1;
      v = (params.vMax * s ** n) / (km ** n + s ** n);
      break;
    }
  }

  for (const eff of params.effectors ?? []) {
    const effConc = conc[eff.metaboliteId] ?? 0;
    if (eff.mode === "inhibitor") {
      v *= eff.kA_or_kI / (eff.kA_or_kI + effConc);
    } else {
      v *= effConc / (eff.kA_or_kI + effConc);
    }
  }

  return v;
}
