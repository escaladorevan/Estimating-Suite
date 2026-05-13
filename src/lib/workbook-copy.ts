import type { EstimateArea, EstimateItem, EstimateSection } from "../types";

type CloneItemOptions = {
  carryFlags?: boolean;
  carryQuantities?: boolean;
};

export function cloneArea(area: EstimateArea, id = makeId("area"), options: CloneItemOptions = {}): EstimateArea {
  const carryFlags = options.carryFlags ?? true;
  const carryQuantities = options.carryQuantities ?? true;

  return {
    ...area,
    id,
    ignored: carryFlags ? area.ignored : false,
    noPrint: carryFlags ? area.noPrint : false,
    name: `${area.name} copy`,
    qty: carryQuantities ? area.qty : 1,
    sections: area.sections.map((section) => cloneSection(section, undefined, false, options))
  };
}

export function cloneSection(
  section: EstimateSection,
  id = makeId("section"),
  rename = true,
  options: CloneItemOptions = {}
): EstimateSection {
  const carryFlags = options.carryFlags ?? true;

  return {
    ...section,
    id,
    ignored: carryFlags ? section.ignored : false,
    noPrint: carryFlags ? section.noPrint : false,
    name: rename ? `${section.name} copy` : section.name,
    items: cloneItems(section.items, options)
  };
}

export function cloneItems(items: EstimateItem[], options: CloneItemOptions = {}): EstimateItem[] {
  return items.map((item) => cloneItem(item, options));
}

function cloneItem(item: EstimateItem, options: CloneItemOptions = {}): EstimateItem {
  const carryFlags = options.carryFlags ?? true;
  const carryQuantities = options.carryQuantities ?? true;

  return {
    ...item,
    ignored: carryFlags ? item.ignored : false,
    noPrint: carryFlags ? item.noPrint : false,
    qty: carryQuantities ? item.qty : 1,
    id: makeId("item")
  };
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
