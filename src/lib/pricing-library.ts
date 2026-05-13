import type { EstimateItem } from "../types";

export type PricingLibraryItem = {
  id: string;
  category: string;
  name: string;
  description: string;
  unit: string;
  unitCost: number;
};

export const pricingLibrary: PricingLibraryItem[] = [
  {
    id: "lib-pl-base",
    category: "Casework",
    name: "PL base cabinets",
    description: "Plastic laminate base cabinet run",
    unit: "lin. ft",
    unitCost: 310
  },
  {
    id: "lib-pl-wall",
    category: "Casework",
    name: "PL wall cabinets",
    description: "Plastic laminate wall cabinet run",
    unit: "lin. ft",
    unitCost: 255
  },
  {
    id: "lib-ss-top",
    category: "Countertops",
    name: "Solid surface top",
    description: "Solid surface countertop with standard edge",
    unit: "sq. ft",
    unitCost: 92
  },
  {
    id: "lib-reception",
    category: "Specialty",
    name: "Reception desk",
    description: "Custom plastic laminate reception desk",
    unit: "lin. ft",
    unitCost: 425
  },
  {
    id: "lib-hardware",
    category: "Hardware",
    name: "Cabinet hardware allowance",
    description: "Pulls, hinges, slides, and misc hardware",
    unit: "each",
    unitCost: 18
  },
  {
    id: "lib-install",
    category: "Install",
    name: "Field install labor",
    description: "Install labor allowance",
    unit: "HR",
    unitCost: 95
  }
];

export function libraryItemToEstimateItem(item: PricingLibraryItem): EstimateItem {
  return {
    id: `item-${Date.now()}-${item.id}`,
    name: item.name,
    description: item.description,
    qty: 1,
    unit: item.unit,
    unitCost: item.unitCost
  };
}
