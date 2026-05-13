import type { EstimateItem } from "../types";

type ClipboardColumn = "name" | "qty" | "unit" | "unitCost" | "ignored" | "noPrint" | "skip";

const defaultColumns: ClipboardColumn[] = ["name", "qty", "unit", "unitCost"];

export function estimateItemsToClipboardText(items: EstimateItem[]) {
  return items
    .map((item) =>
      [
        item.name ?? item.description ?? "",
        String(item.qty ?? 1),
        item.unit ?? "",
        String(item.unitCost ?? 0),
        item.ignored ? "TRUE" : "",
        item.noPrint ? "TRUE" : ""
      ].join("\t")
    )
    .join("\n");
}

export function parseClipboardLineItems(text: string): EstimateItem[] {
  const rows = text
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map(splitRow);

  if (!rows.length) return [];

  const columns = looksLikeHeader(rows[0]) ? headerColumns(rows.shift() ?? []) : defaultColumns;

  return rows
    .map((cells) => rowToItem(cells, columns))
    .filter((item) => item.name || item.description);
}

function splitRow(row: string) {
  return row.includes("\t") ? row.split("\t").map((cell) => cell.trim()) : row.split(",").map((cell) => cell.trim());
}

function looksLikeHeader(cells: string[]) {
  return cells.some((cell) => /description|item|name|qty|quantity|unit|cost|price/i.test(cell));
}

function headerColumns(cells: string[]): ClipboardColumn[] {
  return cells.map((cell) => {
    const value = cell.toLowerCase();
    if (/description|item|name/.test(value)) return "name";
    if (/qty|quantity/.test(value)) return "qty";
    if (/unit cost|cost|price|rate/.test(value)) return "unitCost";
    if (/unit|uom/.test(value)) return "unit";
    if (/ignore|ig/.test(value)) return "ignored";
    if (/no print|np/.test(value)) return "noPrint";
    return "skip";
  });
}

function rowToItem(cells: string[], columns: ClipboardColumn[]): EstimateItem {
  const item: EstimateItem = { id: makeId(), name: "", qty: 1, unit: "EA", unitCost: 0 };

  cells.forEach((cell, index) => {
    switch (columns[index] ?? "skip") {
      case "name":
        item.name = cell;
        break;
      case "qty":
        item.qty = parseNumber(cell, 1);
        break;
      case "unit":
        item.unit = cell || "EA";
        break;
      case "unitCost":
        item.unitCost = parseNumber(cell, 0);
        break;
      case "ignored":
        item.ignored = parseBoolean(cell);
        break;
      case "noPrint":
        item.noPrint = parseBoolean(cell);
        break;
    }
  });

  return item;
}

function parseNumber(value: string, fallback: number) {
  const number = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(number) ? number : fallback;
}

function parseBoolean(value: string) {
  return /^(true|yes|y|1|x)$/i.test(value.trim());
}

function makeId() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
