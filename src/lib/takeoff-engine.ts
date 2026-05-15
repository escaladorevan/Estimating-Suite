import type { BOMComponent, TakeoffRule } from "../types";

export type EvalContext = Record<string, number>;

export function evalFormula(formula: string, ctx: EvalContext): number {
  const keys = Object.keys(ctx);
  const vals = keys.map((k) => ctx[k]);
  // Formula strings are hardcoded in takeoff-rules.ts, never user-provided.
  // new Function() with explicit scope is safe here.
  const fn = new Function(
    ...keys,
    "ceil", "floor", "round", "min", "max",
    `"use strict"; return (${formula});`
  );
  const result = fn(...vals, Math.ceil, Math.floor, Math.round, Math.min, Math.max) as unknown;
  if (typeof result !== "number" || !isFinite(result)) {
    throw new Error(`Formula "${formula}" evaluated to non-finite value: ${String(result)}`);
  }
  return result;
}

export function buildContext(
  rule: TakeoffRule,
  paramValues: Record<string, number>,
  baseQty: number
): EvalContext {
  const ctx: EvalContext = { lengthLF: baseQty, ...paramValues };
  for (const [name, formula] of Object.entries(rule.derivedVars)) {
    ctx[name] = evalFormula(formula, ctx);
  }
  return ctx;
}

export function expandTakeoff(
  rule: TakeoffRule,
  paramValues: Record<string, number>,
  baseQty: number
): BOMComponent[] {
  const ctx = buildContext(rule, paramValues, baseQty);
  return rule.components.map((def) => {
    const qty = evalFormula(def.formula, ctx);
    const rounded = Math.round(qty * 100) / 100;
    return {
      label: def.label,
      unit: def.unit,
      qty: rounded,
      unitCost: def.unitCost,
      totalCost: Math.round(rounded * def.unitCost * 100) / 100,
      category: def.category,
    };
  });
}
