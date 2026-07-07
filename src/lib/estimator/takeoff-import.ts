// ZZTakeoff export → areas/items mapping, per docs/spec-estimator.md §2.
//
// Works on raw cell rows (string[][]) so both .xlsx and .csv exports feed the
// same logic. Two deliberate fixes over v2.1 (spec §7.8): unpriced condition
// rows (indented, measured, no cost) no longer create phantom areas, and
// nested group rows still open a new area but never leave empty ones behind.

export type TakeoffItem = { desc: string; qty: number; unit: string; unitCost: number };
export type TakeoffArea = { name: string; items: TakeoffItem[] };

export type ParsedTakeoff = {
  /** Format B = measured-only export (no Cost Each column); items arrive unpriced. */
  measuredOnly: boolean;
  areas: TakeoffArea[];
};

type Cols = {
  name: number;
  meas1: number;
  units1: number;
  qty: number;
  units: number;
  costEach: number; // -1 in Format B
};

const cell = (row: unknown[], index: number): string =>
  index >= 0 && row[index] != null ? String(row[index]).trim() : "";

const num = (value: string): number => {
  const parsed = Number(value.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

function findHeader(rows: unknown[][]): { headerIndex: number; cols: Cols } | null {
  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    // Strip BOM and stray quotes — CSV exports carry both on the first cell.
    const row = rows[i].map((value) =>
      String(value ?? "").replace(/^﻿/, "").replace(/^"|"$/g, "").trim().toLowerCase()
    );
    const name = row.findIndex((value) => value === "name" || value === "group");
    const meas1 = row.findIndex((value) => /measurement.?1/.test(value));
    if (name === -1 || meas1 === -1) continue;
    return {
      headerIndex: i,
      cols: {
        name,
        meas1,
        units1: row.findIndex((value) => /^units.?1$/.test(value)),
        qty: row.findIndex((value) => value === "qty"),
        units: row.findIndex((value) => value === "units"),
        costEach: row.findIndex((value) => /cost.?each/.test(value))
      }
    };
  }
  return null;
}

export function parseTakeoffRows(rows: unknown[][]): ParsedTakeoff | null {
  const header = findHeader(rows);
  if (!header) return null;
  const { cols } = header;
  const measuredOnly = cols.costEach === -1;

  const areas: TakeoffArea[] = [];
  let current: TakeoffArea | null = null;

  for (const row of rows.slice(header.headerIndex + 1)) {
    const rawName = cols.name >= 0 && row[cols.name] != null ? String(row[cols.name]) : "";
    const name = rawName.trim();
    if (!name) continue;

    const meas1 = cell(row, cols.meas1);
    const units1 = cell(row, cols.units1);
    const qty = cell(row, cols.qty);
    const units = cell(row, cols.units);
    const costEach = cell(row, cols.costEach);
    const hasCost = !measuredOnly && costEach !== "" && num(costEach) !== 0;

    if (measuredOnly) {
      if (!units1) {
        current = { name, items: [] };
        areas.push(current);
      } else if (current) {
        current.items.push({ desc: name, qty: num(meas1), unit: units1, unitCost: 0 });
      }
      continue;
    }

    if (!hasCost) {
      // Group/area rows never carry a "Units 1" value; measured-but-costless
      // rows do. Skipping the latter avoids v2.1's phantom areas from
      // unpriced condition lines.
      if (units1) continue;
      current = { name, items: [] };
      areas.push(current);
      continue;
    }

    if (!current) continue;

    const isPrimary = units1 !== "" && units === ""; // 2-space parent — its child carries the real qty/unit
    const isProper = meas1 === "" && units !== "";
    const isSimple = units1 !== "" && units !== "" && units1 === units;

    if (isPrimary) continue;
    if (isProper) {
      current.items.push({ desc: name, qty: num(qty), unit: units, unitCost: num(costEach) });
    } else if (isSimple) {
      current.items.push({ desc: name, qty: num(meas1) || num(qty), unit: units1, unitCost: num(costEach) });
    }
  }

  const nonEmpty = areas.filter((area) => area.items.length > 0);
  return { measuredOnly, areas: nonEmpty };
}

export function takeoffAreaTotal(area: TakeoffArea): number {
  return area.items.reduce((sum, item) => sum + item.qty * item.unitCost, 0);
}
