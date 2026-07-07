// The estimate document — the FS Estimator v2.1 state, persisted whole as
// one JSONB column. Field names and defaults follow docs/spec-estimator.md.

export type TermLine = { text: string; active: boolean; sub: boolean };

export type EstimateInfo = {
  id: string;
  name: string;
  client: string;
  address: string;
  bidDate: string;
  scope: string; // internal notes — never printed
  architect: string;
  gc: string; // collected, not printed
  attention: string;
  shipVia: string;
  terms: string;
  deliveryDate: string;
  estimator: string;
  poNumber: string;
  bidDocs: string;
  drawingsDated: string;
  specsDated: string;
  addendums: string;
  docType: string; // Proposal | Quote | Bid | Budget | Change Order
};

export type EstimateItem = {
  id: number;
  desc: string;
  qty: number;
  unit: string;
  unitCost: number;
  drawingRef: string;
  ignore: boolean;
  noPrint: boolean;
};

export type EstimateSection = {
  id: number;
  name: string;
  ignore: boolean;
  noPrint: boolean;
  items: EstimateItem[];
};

export type EstimateArea = {
  id: number;
  name: string;
  qty: number; // room/floor multiplier for the whole area
  ignore: boolean;
  noPrint: boolean;
  sections: EstimateSection[];
};

export type SubItem = { desc: string; cost: number; markupPct: number };
export type AltItem = { desc: string; qty: number; unit: string; price: number };

export type PricingMode = "lumpsum" | "byarea" | "itemized";

// Ship Via options per Evan (replaces v2.1's free-text 'Truck' default).
export const SHIP_VIA_OPTIONS = [
  "Installed by F&S",
  "Union Install",
  "P.W. Install",
  "Delivery Only",
  "Shop Pick-up"
] as const;

export const DOC_TYPES = ["Proposal", "Quote", "Bid", "Budget", "Change Order"] as const;

export type EstimateDocument = {
  info: EstimateInfo;
  areas: EstimateArea[];
  ohPct: number;
  delPct: number;
  insPct: number;
  pricingMode: PricingMode;
  subItems: SubItem[];
  altItems: AltItem[];
  exclusions: TermLine[];
  clarifications: TermLine[];
  generalTerms: TermLine[];
  warranty: TermLine[];
  finishTerms: TermLine[];
  hardwareTerms: TermLine[];
  fabNote: TermLine[];
  _uid: number;
};

// Term default texts — verbatim from FS_Estimator_v2_1.html. Leading two
// spaces mark an indented sub-line.
const asTerms = (lines: string[]): TermLine[] =>
  lines.map((raw) => ({ text: raw.trimStart(), active: true, sub: raw.startsWith("  ") }));

export const DEFAULT_EXCLUSIONS = [
  "Unless explicitly noted in the proposal, the following items are excluded from Form & Structure's scope of work:",
  "All demolition work.",
  "Any item shown in plan view but not dimensioned, detailed, or called out in elevations.",
  "Site finishing, including painting, patching, and putty work.",
  "Phased delivery or installation beyond a single mobilization.",
  "Mock-ups or material samples beyond standard submittals.",
  "Installation labor performed at prevailing wage rates unless explicitly included in the proposal.",
  "LEED documentation or AWI certification (unless otherwise noted).",
  "Supply and installation of the following:",
  "  FRP panels, plastic laminate wainscot, wall protection, chair rail, or bumper rail.",
  "  Glass, glazing tracks, or glass hardware.",
  "  Metal or plastic corner guards.",
  "  Metalwork, metal fabrications, or plastic fabrications not integrated into casework.",
  "  Rubber base at casework toe spaces.",
  "  Appliances, plumbing fixtures, or electrical fixtures."
];

export const DEFAULT_CLARIFICATIONS = [
  "Due to uncontrollable rises in tariffs and shipping, F&S reserves the right to adjust abnormal price increases accordingly.",
  "All tariff and shipping increases will be added to the original bid and subject to approval by change order prior to ordering.",
  "Should any change order related to tariff increases be denied, F&S reserves the right to omit affected areas from scope."
];

export const DEFAULT_GENERAL_TERMS = [
  "F&S reserves the right to adjust prices 30 days after the original bid date.",
  "All quoted material and hardware pricing is based on availability and costs at the time of bid.",
  "F&S reserves the right to adjust pricing due to unforeseen increases at time of ordering;",
  "  any changes will require written approval via change order prior to procurement.",
  "All work will be performed during standard working hours unless otherwise agreed upon.",
  "F&S maintains standard commercial liability and workers' compensation coverage."
];

export const DEFAULT_WARRANTY = [
  "Standard warranty is one (1) year, written or implied, unless otherwise stated in the proposal or contract.",
  "Casework is constructed using dowel-and-screw joinery per industry standards.",
  "Dovetail joinery or other premium construction methods are not included unless specifically requested.",
  "Standard finish consists of one coat of sanding sealer and two coats of clear lacquer."
];

export const DEFAULT_FINISH_TERMS = [
  "If finish schedule is not available at the time of bid, plastic laminate pricing is based on mfg's standard colors and patterns.",
  "A maximum of four (4) plastic laminate colors is included per project. Additional colors may result in upcharges.",
  "If specified P-Lam, PVC, ABS, or T-Mold edgebanding is not readily available or requires a minimum order,",
  "  additional charges will apply."
];

export const DEFAULT_HARDWARE_TERMS = [
  "Hinges: Blum 125° concealed, self-closing, no magnetic catches",
  "Pulls: Brushed chrome standard pulls",
  "Drawer Slides: Accuride 3832 full-extension slides",
  "Adjustable Shelving: 5mm hole system with KV nickel spoon supports",
  "In-wall support brackets are to be furnished by F&S but installed by the general contractor.",
  "F&S is not responsible for manufacturer lead times for specialty items."
];

export const DEFAULT_FAB_NOTE = [
  "Unless otherwise agreed upon in writing, all casework will be fabricated using dowel-and-screw construction,",
  "  which meets or exceeds typical performance requirements. While some projects may be spec'd at AWI Custom Grade,",
  "  fabrication will follow our standard construction methods unless explicitly required and priced accordingly."
];

export function defaultDocument(): EstimateDocument {
  return {
    info: {
      id: "",
      name: "",
      client: "",
      address: "",
      bidDate: "",
      scope: "",
      architect: "",
      gc: "",
      attention: "",
      shipVia: "Installed by F&S",
      terms: "Net 30",
      deliveryDate: "",
      estimator: "Evan Ramsey",
      poNumber: "",
      bidDocs: "",
      drawingsDated: "",
      specsDated: "",
      addendums: "",
      docType: "Proposal"
    },
    areas: [],
    ohPct: 15,
    delPct: 5,
    insPct: 20,
    pricingMode: "byarea",
    subItems: [],
    altItems: [],
    exclusions: asTerms(DEFAULT_EXCLUSIONS),
    clarifications: asTerms(DEFAULT_CLARIFICATIONS),
    generalTerms: asTerms(DEFAULT_GENERAL_TERMS),
    warranty: asTerms(DEFAULT_WARRANTY),
    finishTerms: asTerms(DEFAULT_FINISH_TERMS),
    hardwareTerms: asTerms(DEFAULT_HARDWARE_TERMS),
    fabNote: asTerms(DEFAULT_FAB_NOTE),
    _uid: 1
  };
}

export function nextUid(doc: EstimateDocument): number {
  doc._uid += 1;
  return doc._uid;
}
