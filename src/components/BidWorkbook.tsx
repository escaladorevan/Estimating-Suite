"use client";

import { Clipboard, ClipboardPaste, FileDown, FolderPlus, Library, Plus, Trash2 } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { calculateEstimateTotals } from "../lib/estimate-math";
import { libraryItemToEstimateItem, pricingLibrary, type PricingLibraryItem } from "../lib/pricing-library";
import { bomComponentsToCsv } from "../lib/takeoff-csv";
import { expandTakeoff } from "../lib/takeoff-engine";
import { findTakeoffRule, takeoffRules } from "../lib/takeoff-rules";
import { estimateItemsToClipboardText, parseClipboardLineItems } from "../lib/workbook-clipboard";
import { cloneArea, cloneItems, cloneSection } from "../lib/workbook-copy";
import type { BOMComponent, Estimate, EstimateArea, EstimateDocumentType, EstimateItem, EstimateSection, TakeoffRule } from "../types";

type WorkbookView = "info" | "basebid" | "area" | "alternates" | "exclusions" | "clarifications" | "takeoff";
type PasteRowsTarget = { areaId: string; sectionId: string } | null;
type PasteAreaTarget = "estimate" | null;
type PasteSectionTarget = { areaId: string } | null;
type PasteOptions = { carryFlags: boolean; carryQuantities: boolean };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const documentTypes: EstimateDocumentType[] = ["Proposal", "Quote", "Budget", "Change Order", "Service Quote", "Revision"];

export function BidWorkbook({
  estimate,
  onChange,
  onExportPdf,
  onSaveSnapshot,
  saveStatus,
  onSubmitChangeOrder
}: {
  estimate: Estimate;
  onChange: (estimate: Estimate) => void;
  onExportPdf: () => void;
  onSaveSnapshot?: (estimate: Estimate) => void;
  saveStatus?: string;
  onSubmitChangeOrder?: (estimate: Estimate, amount: number) => void;
}) {
  const [view, setView] = useState<WorkbookView>("area");
  const [selectedAreaId, setSelectedAreaId] = useState(estimate.areas[0]?.id ?? "");
  const [selectedSectionId, setSelectedSectionId] = useState(estimate.areas[0]?.sections[0]?.id ?? "");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [copiedArea, setCopiedArea] = useState<EstimateArea | null>(null);
  const [copiedSection, setCopiedSection] = useState<EstimateSection | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [copiedItems, setCopiedItems] = useState<EstimateItem[]>([]);
  const [pasteAreaTarget, setPasteAreaTarget] = useState<PasteAreaTarget>(null);
  const [pasteSectionTarget, setPasteSectionTarget] = useState<PasteSectionTarget>(null);
  const [pasteRowsTarget, setPasteRowsTarget] = useState<PasteRowsTarget>(null);
  const [focusAreaNameId, setFocusAreaNameId] = useState<string | null>(null);
  const [takeoffModal, setTakeoffModal] = useState<{ item: PricingLibraryItem; rule: TakeoffRule } | null>(null);
  const [takeoffParams, setTakeoffParams] = useState<Record<string, number>>({});
  const totals = calculateEstimateTotals(estimate);
  const hasTakeoffItems = estimate.areas.some((area) =>
    area.sections.some((section) => section.items.some((item) => item.takeoffExpansion))
  );
  const selectedArea = estimate.areas.find((area) => area.id === selectedAreaId) ?? estimate.areas[0];
  const selectedSection = selectedArea?.sections.find((section) => section.id === selectedSectionId) ?? selectedArea?.sections[0];

  const filteredLibrary = useMemo(() => {
    const q = libraryQuery.toLowerCase();
    return pricingLibrary.filter((item) => `${item.category} ${item.name} ${item.description}`.toLowerCase().includes(q));
  }, [libraryQuery]);

  function patch(next: Partial<Estimate>) {
    onChange({ ...estimate, ...next });
  }

  function updateArea(areaId: string, fn: (area: EstimateArea) => EstimateArea) {
    patch({ areas: estimate.areas.map((area) => (area.id === areaId ? fn(area) : area)) });
  }

  function updateSection(areaId: string, sectionId: string, fn: (section: EstimateSection) => EstimateSection) {
    updateArea(areaId, (area) => ({
      ...area,
      sections: area.sections.map((section) => (section.id === sectionId ? fn(section) : section))
    }));
  }

  function updateItem(areaId: string, sectionId: string, itemId: string, fields: Partial<EstimateItem>) {
    updateSection(areaId, sectionId, (section) => ({
      ...section,
      items: section.items.map((item) => (item.id === itemId ? { ...item, ...fields } : item))
    }));
  }

  function selectedItems() {
    const ids = new Set(selectedItemIds);
    return estimate.areas.flatMap((area) => area.sections).flatMap((section) => section.items).filter((item) => item.id && ids.has(item.id));
  }

  function toggleItemSelection(itemId: string, selected: boolean) {
    setSelectedItemIds((current) => selected ? [...new Set([...current, itemId])] : current.filter((id) => id !== itemId));
  }

  function toggleSectionSelection(section: EstimateSection, selected: boolean) {
    const ids = section.items.map((item) => item.id).filter(Boolean) as string[];
    setSelectedItemIds((current) => {
      const set = new Set(current);
      ids.forEach((id) => selected ? set.add(id) : set.delete(id));
      return [...set];
    });
  }

  function copySelectedRows() {
    const rows = selectedItems();
    if (!rows.length) return;
    setCopiedItems(rows);
    void navigator.clipboard?.writeText(estimateItemsToClipboardText(rows)).catch(() => undefined);
  }

  function pasteRows(target: PasteRowsTarget, options: PasteOptions) {
    if (!target || !copiedItems.length) return;
    const pastedItems = cloneItems(copiedItems, options);
    updateSection(target.areaId, target.sectionId, (section) => ({ ...section, items: [...section.items, ...pastedItems] }));
    setSelectedAreaId(target.areaId);
    setSelectedSectionId(target.sectionId);
    setSelectedItemIds(pastedItems.map((item) => item.id).filter(Boolean) as string[]);
    setPasteRowsTarget(null);
    setView("area");
  }

  function pasteParsedRows(target: PasteRowsTarget, items: EstimateItem[]) {
    if (!target || !items.length) return;
    updateSection(target.areaId, target.sectionId, (section) => ({ ...section, items: [...section.items, ...items] }));
    setSelectedAreaId(target.areaId);
    setSelectedSectionId(target.sectionId);
    setSelectedItemIds(items.map((item) => item.id).filter(Boolean) as string[]);
    setView("area");
  }

  async function pasteSheetRows(areaId: string, sectionId: string) {
    const text = await navigator.clipboard?.readText().catch(() => "");
    const items = parseClipboardLineItems(text ?? "");
    pasteParsedRows({ areaId, sectionId }, items);
  }

  function handleWorkbookKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const mod = event.ctrlKey || event.metaKey;
    if (!mod || !selectedArea || !selectedSection) return;

    if (event.key.toLowerCase() === "c" && selectedItemIds.length) {
      event.preventDefault();
      copySelectedRows();
    }

    if (event.key.toLowerCase() === "v") {
      event.preventDefault();
      if (copiedItems.length) {
        setPasteRowsTarget({ areaId: selectedArea.id!, sectionId: selectedSection.id! });
      } else {
        void pasteSheetRows(selectedArea.id!, selectedSection.id!);
      }
    }
  }

  function addArea() {
    const id = `area-${Date.now()}`;
    const sectionId = `section-${Date.now()}`;
    const area: EstimateArea = {
      id,
      name: "New Area",
      qty: 1,
      sections: [{ id: sectionId, name: "New Section", items: [] }]
    };
    patch({ areas: [...estimate.areas, area] });
    setSelectedAreaId(id);
    setSelectedSectionId(sectionId);
    setFocusAreaNameId(id);
    setView("area");
  }

  function addSection(areaId: string) {
    const id = `section-${Date.now()}`;
    updateArea(areaId, (area) => ({ ...area, sections: [...area.sections, { id, name: "New Section", items: [] }] }));
    setSelectedAreaId(areaId);
    setSelectedSectionId(id);
    setView("area");
  }

  function deleteArea(areaId: string) {
    const area = estimate.areas.find((candidate) => candidate.id === areaId);
    if (!area) return;
    const confirmed = window.confirm(`Delete area "${area.name ?? "Untitled Area"}" and all sections/items inside it?`);
    if (!confirmed) return;

    const remainingAreas = estimate.areas.filter((candidate) => candidate.id !== areaId);
    patch({ areas: remainingAreas });
    const nextArea = remainingAreas[0];
    setSelectedAreaId(nextArea?.id ?? "");
    setSelectedSectionId(nextArea?.sections[0]?.id ?? "");
    setSelectedItemIds((current) => {
      const deletedItemIds = new Set(area.sections.flatMap((section) => section.items.map((item) => item.id).filter(Boolean)));
      return current.filter((itemId) => !deletedItemIds.has(itemId));
    });
    setView(remainingAreas.length ? "area" : "basebid");
  }

  function deleteSection(areaId: string, sectionId: string) {
    const area = estimate.areas.find((candidate) => candidate.id === areaId);
    const section = area?.sections.find((candidate) => candidate.id === sectionId);
    if (!area || !section) return;
    const confirmed = window.confirm(`Delete section "${section.name ?? "Untitled Section"}" and all of its line items?`);
    if (!confirmed) return;

    const remainingSections = area.sections.filter((candidate) => candidate.id !== sectionId);
    updateArea(areaId, (current) => ({ ...current, sections: remainingSections }));
    setSelectedAreaId(areaId);
    setSelectedSectionId(remainingSections[0]?.id ?? "");
    setSelectedItemIds((current) => {
      const deletedItemIds = new Set(section.items.map((item) => item.id).filter(Boolean));
      return current.filter((itemId) => !deletedItemIds.has(itemId));
    });
    setView("area");
  }

  function pasteArea() {
    if (!copiedArea) return;
    setPasteAreaTarget("estimate");
  }

  function confirmPasteArea(options: PasteOptions) {
    if (!copiedArea) return;
    const copy = cloneArea(copiedArea, undefined, options);
    patch({ areas: [...estimate.areas, copy] });
    setSelectedAreaId(copy.id!);
    setSelectedSectionId(copy.sections[0]?.id ?? "");
    setPasteAreaTarget(null);
    setView("area");
  }

  function pasteSection(areaId: string) {
    if (!copiedSection) return;
    setPasteSectionTarget({ areaId });
  }

  function confirmPasteSection(target: PasteSectionTarget, options: PasteOptions) {
    if (!copiedSection || !target) return;
    const copy = cloneSection(copiedSection, undefined, true, options);
    updateArea(target.areaId, (area) => ({ ...area, sections: [...area.sections, copy] }));
    setSelectedAreaId(target.areaId);
    setSelectedSectionId(copy.id!);
    setPasteSectionTarget(null);
    setView("area");
  }

  function addItem(areaId: string, sectionId: string, item?: EstimateItem) {
    const nextItem = item ?? { id: `item-${Date.now()}`, name: "", description: "", qty: 1, unit: "EA", unitCost: 0 };
    updateSection(areaId, sectionId, (section) => ({ ...section, items: [...section.items, nextItem] }));
    setSelectedAreaId(areaId);
    setSelectedSectionId(sectionId);
    setView("area");
  }

  function insertLibraryItem(itemId: string) {
    const item = pricingLibrary.find((candidate) => candidate.id === itemId);
    if (!item || !selectedArea || !selectedSection) return;
    const rule = findTakeoffRule(item);
    if (rule) {
      const defaults: Record<string, number> = {};
      rule.params.forEach((param) => {
        defaults[param.key] = param.default;
      });
      setTakeoffParams(defaults);
      setTakeoffModal({ item, rule });
      return;
    }
    addItem(selectedArea.id!, selectedSection.id!, libraryItemToEstimateItem(item));
  }

  function insertWithTakeoff() {
    if (!takeoffModal || !selectedArea || !selectedSection) return;
    const base = libraryItemToEstimateItem(takeoffModal.item);
    addItem(selectedArea.id!, selectedSection.id!, {
      ...base,
      takeoffExpansion: {
        ruleId: takeoffModal.rule.id,
        ruleName: takeoffModal.rule.name,
        paramValues: takeoffParams
      }
    });
    setTakeoffModal(null);
  }

  function insertWithoutTakeoff() {
    if (!takeoffModal || !selectedArea || !selectedSection) return;
    addItem(selectedArea.id!, selectedSection.id!, libraryItemToEstimateItem(takeoffModal.item));
    setTakeoffModal(null);
  }

  function exportBomCsv(components: BOMComponent[]) {
    const blob = new Blob([bomComponentsToCsv(components)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `takeoff-${estimate.projectName.replace(/\s+/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="workbook-shell" onKeyDown={handleWorkbookKeyDown}>
      <header className="workbook-head">
        <div>
          <strong>{estimate.projectName}</strong>
          <span>{estimate.client} - {estimate.pricingMode}</span>
        </div>
        <div className="workbook-margins">
          <label>OH <input type="number" value={estimate.ohPct} onChange={(event) => patch({ ohPct: Number(event.target.value) })} />%</label>
          <label>Del <input type="number" value={estimate.delPct} onChange={(event) => patch({ delPct: Number(event.target.value) })} />%</label>
          <label>Ins <input type="number" value={estimate.insPct} onChange={(event) => patch({ insPct: Number(event.target.value) })} />%</label>
          <b>{money.format(totals.bidTotal)}</b>
          {onSaveSnapshot ? <button onClick={() => onSaveSnapshot(estimate)}>Save Snapshot</button> : null}
          <button onClick={onExportPdf}><FileDown size={14} /> Build {estimate.documentType ?? "Proposal"}</button>
          {estimate.documentType === "Change Order" && estimate.jobId && onSubmitChangeOrder ? (
            <button className="submit-co-button" onClick={() => onSubmitChangeOrder(estimate, totals.bidTotal)}>
              Submit CO to Job
            </button>
          ) : null}
        </div>
      </header>
      {saveStatus ? <div className="workbook-save-strip">{saveStatus}</div> : null}
      {estimate.documentType === "Change Order" && estimate.changeOrderContext ? (
        <ChangeOrderImpactBar estimate={estimate} thisCoAmount={totals.bidTotal} />
      ) : null}

      <div className="workbook-body">
        <aside className="workbook-tree">
          <button className={view === "info" ? "active" : ""} onClick={() => setView("info")}>Project Info</button>
          <button className={view === "basebid" ? "active" : ""} onClick={() => setView("basebid")}>Base Bid Summary</button>
          <div className="tree-title">
            Areas
            <span>
              <button onClick={addArea} title="Add area"><FolderPlus size={13} /></button>
              <button disabled={!copiedArea} onClick={pasteArea} title="Paste area"><ClipboardPaste size={13} /></button>
            </span>
          </div>
          {estimate.areas.map((area) => (
            <div className="tree-group" key={area.id}>
              <div className={selectedAreaId === area.id && view === "area" ? "tree-row active" : "tree-row"}>
                <button onClick={() => { setSelectedAreaId(area.id!); setSelectedSectionId(area.sections[0]?.id ?? ""); setView("area"); }}>
                  {area.name} <span>x{area.qty}</span>
                </button>
                <FlagChecks
                  ignored={area.ignored}
                  noPrint={area.noPrint}
                  onChange={(fields) => updateArea(area.id!, (current) => ({ ...current, ...fields }))}
                  scope="area"
                />
                <button className="tree-icon" onClick={() => setCopiedArea(area)} title="Copy area"><Clipboard size={12} /></button>
                <button className="tree-icon danger-tree-icon" onClick={() => deleteArea(area.id!)} title="Delete area"><Trash2 size={12} /></button>
              </div>
              {area.sections.map((section) => (
                <div className={selectedSectionId === section.id && view === "area" ? "tree-row sub active" : "tree-row sub"} key={section.id}>
                  <button onClick={() => { setSelectedAreaId(area.id!); setSelectedSectionId(section.id!); setView("area"); }}>
                    {section.name}
                  </button>
                  <FlagChecks
                    ignored={section.ignored}
                    noPrint={section.noPrint}
                    onChange={(fields) => updateSection(area.id!, section.id!, (current) => ({ ...current, ...fields }))}
                    scope="section"
                  />
                  <button className="tree-icon" onClick={() => setCopiedSection(section)} title="Copy section"><Clipboard size={12} /></button>
                </div>
              ))}
              <div className="tree-actions">
                <button className="sub add" onClick={() => addSection(area.id!)}>+ Section</button>
                <button className="sub add" disabled={!copiedSection} onClick={() => pasteSection(area.id!)}>Paste Section</button>
              </div>
            </div>
          ))}
          <button className={view === "alternates" ? "active" : ""} onClick={() => setView("alternates")}>Alternates</button>
          <button className={view === "exclusions" ? "active" : ""} onClick={() => setView("exclusions")}>Exclusions</button>
          <button className={view === "clarifications" ? "active" : ""} onClick={() => setView("clarifications")}>Clarifications</button>
          {hasTakeoffItems ? (
            <button className={view === "takeoff" ? "active takeoff-tab" : "takeoff-tab"} onClick={() => setView("takeoff")}>Takeoff</button>
          ) : null}
        </aside>

        <section className="workbook-center">
          {view === "info" && <ProjectInfo estimate={estimate} patch={patch} />}
          {view === "basebid" && <BaseBidSummary estimate={estimate} totals={totals} />}
          {view === "area" && selectedArea && (
            <AreaEditor
              area={selectedArea}
              copiedRowsCount={copiedItems.length}
              focusAreaNameId={focusAreaNameId}
              selectedItemIds={selectedItemIds}
              selectedSectionId={selectedSectionId}
              onAreaNameFocused={() => setFocusAreaNameId(null)}
              onAreaChange={(fields) => updateArea(selectedArea.id!, (area) => ({ ...area, ...fields }))}
              onCopyRows={copySelectedRows}
              onSectionChange={(sectionId, fields) => updateSection(selectedArea.id!, sectionId, (section) => ({ ...section, ...fields }))}
              onSectionSelectionChange={toggleSectionSelection}
              onItemChange={(sectionId, itemId, fields) => updateItem(selectedArea.id!, sectionId, itemId, fields)}
              onItemSelectionChange={toggleItemSelection}
              onAddItem={(sectionId) => addItem(selectedArea.id!, sectionId)}
              onDeleteSection={(sectionId) => deleteSection(selectedArea.id!, sectionId)}
              onOpenPasteRows={(sectionId) => setPasteRowsTarget({ areaId: selectedArea.id!, sectionId })}
              onDeleteItem={(sectionId, itemId) =>
                updateSection(selectedArea.id!, sectionId, (section) => ({
                  ...section,
                  items: section.items.filter((item) => item.id !== itemId)
                }))
              }
            />
          )}
          {view === "alternates" && <Alternates estimate={estimate} patch={patch} />}
          {view === "exclusions" && <Terms title="Exclusions" values={estimate.exclusions} onChange={(exclusions) => patch({ exclusions })} />}
          {view === "clarifications" && <Terms title="Clarifications" values={estimate.clarifications} onChange={(clarifications) => patch({ clarifications })} />}
          {view === "takeoff" && <TakeoffSummary estimate={estimate} onExport={exportBomCsv} onItemChange={updateItem} />}
        </section>

        <aside className="workbook-library">
          <div className="library-head"><Library size={15} /> Pricing Library</div>
          <input placeholder="Search item, category, description" value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} />
          <div className="library-list">
            {filteredLibrary.map((item) => {
              const hasTakeoff = Boolean(findTakeoffRule(item));
              return (
              <button key={item.id} onClick={() => insertLibraryItem(item.id)}>
                <strong>{item.name}{hasTakeoff ? <span className="takeoff-badge" title="Has takeoff BOM rule">T</span> : null}</strong>
                <span>{item.category} - {item.unit} - {money.format(item.unitCost)}</span>
              </button>
              );
            })}
          </div>
        </aside>
      </div>
      {pasteAreaTarget ? (
        <PasteOptionsDialog
          label="area"
          count={1}
          onCancel={() => setPasteAreaTarget(null)}
          onPaste={confirmPasteArea}
        />
      ) : null}
      {pasteSectionTarget ? (
        <PasteOptionsDialog
          label="section"
          count={1}
          onCancel={() => setPasteSectionTarget(null)}
          onPaste={(options) => confirmPasteSection(pasteSectionTarget, options)}
        />
      ) : null}
      {pasteRowsTarget ? (
        <PasteOptionsDialog
          label="row"
          count={copiedItems.length}
          onCancel={() => setPasteRowsTarget(null)}
          onPaste={(options) => pasteRows(pasteRowsTarget, options)}
        />
      ) : null}
      {takeoffModal ? (
        <TakeoffModal
          item={takeoffModal.item}
          onCancel={() => setTakeoffModal(null)}
          onInsertWithTakeoff={insertWithTakeoff}
          onInsertWithout={insertWithoutTakeoff}
          onParamChange={(key, value) => setTakeoffParams((current) => ({ ...current, [key]: value }))}
          params={takeoffParams}
          rule={takeoffModal.rule}
        />
      ) : null}
    </div>
  );
}

function ChangeOrderImpactBar({ estimate, thisCoAmount }: { estimate: Estimate; thisCoAmount: number }) {
  const context = estimate.changeOrderContext;
  if (!context) return null;

  return (
    <section className="co-impact-bar">
      <div>
        <span>Job</span>
        <strong>{context.jobNumber}</strong>
        <small>{context.projectName}</small>
      </div>
      <div>
        <span>Base Contract</span>
        <strong>{money.format(context.baseContract)}</strong>
      </div>
      <div>
        <span>Approved COs</span>
        <strong>{money.format(context.approvedCoTotal)}</strong>
      </div>
      <div>
        <span>Pending COs</span>
        <strong>{money.format(context.pendingCoTotal)}</strong>
      </div>
      <div>
        <span>This CO</span>
        <strong>{money.format(thisCoAmount)}</strong>
      </div>
      <div>
        <span>If Approved</span>
        <strong>{money.format(context.currentContract + thisCoAmount)}</strong>
      </div>
    </section>
  );
}

function ProjectInfo({ estimate, patch }: { estimate: Estimate; patch: (next: Partial<Estimate>) => void }) {
  return (
    <div className="workbook-panel">
      <h2>Project Info</h2>
      <div className="workbook-form">
        <label>Document Type
          <select
            value={estimate.documentType ?? "Proposal"}
            onChange={(event) => patch({ documentType: event.target.value as EstimateDocumentType })}
          >
            {documentTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label>Proposal #<input value={estimate.proposalNumber ?? ""} onChange={(event) => patch({ proposalNumber: event.target.value })} /></label>
        <label>Revision<input value={estimate.revision ?? ""} onChange={(event) => patch({ revision: event.target.value })} /></label>
        <label>Bid Date<input type="date" value={estimate.bidDate ?? ""} onChange={(event) => patch({ bidDate: event.target.value })} /></label>
        <label>Project<input value={estimate.projectName} onChange={(event) => patch({ projectName: event.target.value })} /></label>
        <label>Location<input value={estimate.projectLocation ?? ""} onChange={(event) => patch({ projectLocation: event.target.value })} /></label>
        <label>Client<input value={estimate.client} onChange={(event) => patch({ client: event.target.value })} /></label>
        <label>Client Address<input value={estimate.clientAddress ?? ""} onChange={(event) => patch({ clientAddress: event.target.value })} /></label>
        <label>Client Contact<input value={estimate.clientContact ?? ""} onChange={(event) => patch({ clientContact: event.target.value })} /></label>
        <label>Architect<input value={estimate.architect ?? ""} onChange={(event) => patch({ architect: event.target.value })} /></label>
        <label>Estimator<input value={estimate.estimator ?? ""} onChange={(event) => patch({ estimator: event.target.value })} /></label>
        <label>Due Date<input type="date" value={estimate.dueDate ?? ""} onChange={(event) => patch({ dueDate: event.target.value })} /></label>
        <label>Delivery Date<input value={estimate.deliveryDate ?? ""} onChange={(event) => patch({ deliveryDate: event.target.value })} /></label>
        <label>Project ID<input value={estimate.projectId ?? ""} onChange={(event) => patch({ projectId: event.target.value })} /></label>
        <label>Ship Via<input value={estimate.shipVia ?? ""} onChange={(event) => patch({ shipVia: event.target.value })} /></label>
        <label>P.O. Number<input value={estimate.poNumber ?? ""} onChange={(event) => patch({ poNumber: event.target.value })} /></label>
        <label>Bid Documents<input value={estimate.bidDocuments ?? ""} onChange={(event) => patch({ bidDocuments: event.target.value })} /></label>
        <label>Drawings Dated<input value={estimate.drawingsDated ?? ""} onChange={(event) => patch({ drawingsDated: event.target.value })} /></label>
        <label>Addenda<input value={estimate.addenda ?? ""} onChange={(event) => patch({ addenda: event.target.value })} /></label>
        <label>Valid Days<input type="number" value={estimate.validDays ?? 30} onChange={(event) => patch({ validDays: Number(event.target.value) })} /></label>
        <label>Payment Terms<input value={estimate.paymentTerms ?? ""} onChange={(event) => patch({ paymentTerms: event.target.value })} /></label>
        <label>Lead Time<input value={estimate.leadTime ?? ""} onChange={(event) => patch({ leadTime: event.target.value })} /></label>
        <label>Pricing mode
          <select value={estimate.pricingMode} onChange={(event) => patch({ pricingMode: event.target.value as Estimate["pricingMode"] })}>
            <option value="byarea">By Area</option>
            <option value="lumpsum">Lump Sum</option>
            <option value="itemized">Itemized</option>
          </select>
        </label>
      </div>
      <label className="workbook-textarea-label">Scope Summary
        <textarea value={estimate.scopeSummary ?? ""} onChange={(event) => patch({ scopeSummary: event.target.value })} />
      </label>
    </div>
  );
}

function FlagChecks({
  ignored,
  noPrint,
  onChange,
  scope
}: {
  ignored?: boolean;
  noPrint?: boolean;
  onChange: (fields: { ignored?: boolean; noPrint?: boolean }) => void;
  scope: "area" | "section";
}) {
  return (
    <div className="tree-flags" onClick={(event) => event.stopPropagation()}>
      <label title={`Ignore this ${scope} in estimate totals`}>IG<input checked={Boolean(ignored)} type="checkbox" onChange={(event) => onChange({ ignored: event.target.checked })} /></label>
      <label title={`Do not print this ${scope} on proposal`}>NP<input checked={Boolean(noPrint)} type="checkbox" onChange={(event) => onChange({ noPrint: event.target.checked })} /></label>
    </div>
  );
}

function PasteOptionsDialog({
  count,
  label,
  onCancel,
  onPaste
}: {
  count: number;
  label: "area" | "section" | "row";
  onCancel: () => void;
  onPaste: (options: PasteOptions) => void;
}) {
  const [carryQuantities, setCarryQuantities] = useState(true);
  const [carryFlags, setCarryFlags] = useState(true);
  const plural = count === 1 ? label : `${label}s`;

  return (
    <div className="paste-options" role="dialog" aria-label="Paste row options">
      <div>
        <strong>Paste {count} {plural}</strong>
        <span>Choose what carries over.</span>
      </div>
      <label><input checked={carryQuantities} type="checkbox" onChange={(event) => setCarryQuantities(event.target.checked)} /> Carry quantities</label>
      <label><input checked={carryFlags} type="checkbox" onChange={(event) => setCarryFlags(event.target.checked)} /> Carry IG/NP flags</label>
      <div className="paste-actions">
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={() => onPaste({ carryFlags, carryQuantities })}>Paste</button>
      </div>
    </div>
  );
}

function BaseBidSummary({ estimate, totals }: { estimate: Estimate; totals: ReturnType<typeof calculateEstimateTotals> }) {
  return (
    <div className="workbook-panel">
      <h2>Base Bid Summary</h2>
      <table className="workbook-table">
        <thead><tr><th>Area</th><th>Qty</th><th>Total</th></tr></thead>
        <tbody>
          {estimate.areas.map((area) => {
            const areaTotals = calculateEstimateTotals({ ...estimate, areas: [area], subItems: [] });
            return <tr key={area.id}><td>{area.name}</td><td>{area.qty}</td><td>{money.format(areaTotals.material)}</td></tr>;
          })}
        </tbody>
      </table>
      <div className="base-summary">
        <MetricLine label="Material" value={totals.material} />
        <MetricLine label="Overhead" value={totals.overhead} />
        <MetricLine label="Delivery" value={totals.delivery} />
        <MetricLine label="Install" value={totals.install} />
        <MetricLine label="Supplier / Sub" value={totals.subcontractorSell} />
        <MetricLine label="Base Bid Total" value={totals.bidTotal} strong />
      </div>
    </div>
  );
}

function AreaEditor({
  area,
  copiedRowsCount,
  focusAreaNameId,
  selectedItemIds,
  selectedSectionId,
  onAreaNameFocused,
  onAreaChange,
  onCopyRows,
  onSectionChange,
  onSectionSelectionChange,
  onItemChange,
  onItemSelectionChange,
  onAddItem,
  onDeleteSection,
  onOpenPasteRows,
  onDeleteItem
}: {
  area: EstimateArea;
  copiedRowsCount: number;
  focusAreaNameId: string | null;
  selectedItemIds: string[];
  selectedSectionId: string;
  onAreaNameFocused: () => void;
  onAreaChange: (fields: Partial<EstimateArea>) => void;
  onCopyRows: () => void;
  onSectionChange: (sectionId: string, fields: Partial<EstimateSection>) => void;
  onSectionSelectionChange: (section: EstimateSection, selected: boolean) => void;
  onItemChange: (sectionId: string, itemId: string, fields: Partial<EstimateItem>) => void;
  onItemSelectionChange: (itemId: string, selected: boolean) => void;
  onAddItem: (sectionId: string) => void;
  onDeleteSection: (sectionId: string) => void;
  onOpenPasteRows: (sectionId: string) => void;
  onDeleteItem: (sectionId: string, itemId: string) => void;
}) {
  const areaNameRef = useRef<HTMLInputElement>(null);
  const selectedSet = new Set(selectedItemIds);
  const activeSection = area.sections.find((section) => section.id === selectedSectionId) ?? area.sections[0];
  const showRowActions = selectedItemIds.length > 0 || copiedRowsCount > 0;

  useEffect(() => {
    if (focusAreaNameId !== area.id) return;
    areaNameRef.current?.focus();
    areaNameRef.current?.select();
    onAreaNameFocused();
  }, [area.id, focusAreaNameId, onAreaNameFocused]);

  return (
    <div className="workbook-panel">
      <div className="area-title">
        <input ref={areaNameRef} value={area.name} onChange={(event) => onAreaChange({ name: event.target.value })} />
        <label>Qty <input type="number" value={area.qty} onChange={(event) => onAreaChange({ qty: Number(event.target.value) })} /></label>
      </div>
      {showRowActions ? (
        <div className="row-action-bar">
          <strong>{selectedItemIds.length ? `${selectedItemIds.length} row${selectedItemIds.length === 1 ? "" : "s"} selected` : `${copiedRowsCount} copied`}</strong>
          <span>{activeSection ? `Target: ${activeSection.name}` : "Choose a section"}</span>
          <button disabled={!selectedItemIds.length} onClick={onCopyRows}><Clipboard size={12} /> Copy</button>
          <button disabled={!copiedRowsCount || !activeSection?.id} onClick={() => activeSection?.id && onOpenPasteRows(activeSection.id)}>
            <ClipboardPaste size={12} /> Paste
          </button>
          <small>Ctrl+C / Ctrl+V</small>
        </div>
      ) : null}
      {area.sections.map((section) => (
        <section className={selectedSectionId === section.id ? "estimate-section active" : "estimate-section"} key={section.id}>
          <div className="section-title-row">
            <input value={section.name} onChange={(event) => onSectionChange(section.id!, { name: event.target.value })} />
            <div className="section-actions">
              <button aria-label="Add line item" onClick={() => onAddItem(section.id!)} title="Add line item"><Plus size={12} /></button>
              <button aria-label="Delete section" className="danger-button" onClick={() => onDeleteSection(section.id!)} title="Delete section"><Trash2 size={12} /></button>
            </div>
          </div>
          <table className="workbook-table item-grid">
            <thead>
              <tr>
                <th title="Select rows"><input checked={section.items.length > 0 && section.items.every((item) => item.id && selectedSet.has(item.id))} type="checkbox" onChange={(event) => onSectionSelectionChange(section, event.target.checked)} /></th>
                <th>Description</th><th>Qty</th><th>Unit</th><th>Cost</th><th>Total</th><th title="Ignore">IG</th><th title="No Print">NP</th><th></th>
              </tr>
            </thead>
            <tbody>
              {section.items.map((item) => (
                <tr className={item.id && selectedSet.has(item.id) ? "selected-row" : ""} key={item.id}>
                  <td><input checked={Boolean(item.id && selectedSet.has(item.id))} type="checkbox" onChange={(event) => item.id && onItemSelectionChange(item.id, event.target.checked)} /></td>
                  <td>
                    <input value={item.name ?? ""} onChange={(event) => onItemChange(section.id!, item.id!, { name: event.target.value })} />
                    {item.takeoffExpansion ? (
                      <span className="takeoff-row-badge" title={`BOM attached: ${item.takeoffExpansion.ruleName}`}>
                        T
                        <button onClick={() => onItemChange(section.id!, item.id!, { takeoffExpansion: undefined })}>Detach</button>
                      </span>
                    ) : null}
                  </td>
                  <td><input type="number" value={item.qty} onChange={(event) => onItemChange(section.id!, item.id!, { qty: Number(event.target.value) })} /></td>
                  <td><input value={item.unit ?? ""} onChange={(event) => onItemChange(section.id!, item.id!, { unit: event.target.value })} /></td>
                  <td><input type="number" value={item.unitCost} onChange={(event) => onItemChange(section.id!, item.id!, { unitCost: Number(event.target.value) })} /></td>
                  <td>{money.format(item.qty * item.unitCost)}</td>
                  <td><input checked={Boolean(item.ignored)} type="checkbox" onChange={(event) => onItemChange(section.id!, item.id!, { ignored: event.target.checked })} /></td>
                  <td><input checked={Boolean(item.noPrint)} type="checkbox" onChange={(event) => onItemChange(section.id!, item.id!, { noPrint: event.target.checked })} /></td>
                  <td><button onClick={() => onDeleteItem(section.id!, item.id!)}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function Alternates({ estimate, patch }: { estimate: Estimate; patch: (next: Partial<Estimate>) => void }) {
  return (
    <div className="workbook-panel">
      <h2>Alternates</h2>
      {estimate.alternates.map((alternate, index) => (
        <div className="term-row" key={index}>
          <input value={alternate.description} onChange={(event) => {
            const alternates = [...estimate.alternates];
            alternates[index] = { ...alternate, description: event.target.value };
            patch({ alternates });
          }} />
          <input type="number" value={alternate.amount} onChange={(event) => {
            const alternates = [...estimate.alternates];
            alternates[index] = { ...alternate, amount: Number(event.target.value) };
            patch({ alternates });
          }} />
        </div>
      ))}
      <button className="workbook-add" onClick={() => patch({ alternates: [...estimate.alternates, { description: "New alternate", amount: 0 }] })}>+ Alternate</button>
    </div>
  );
}

function Terms({ title, values, onChange }: { title: string; values: string[]; onChange: (values: string[]) => void }) {
  return (
    <div className="workbook-panel">
      <h2>{title}</h2>
      {values.map((value, index) => (
        <div className="term-row" key={index}>
          <textarea value={value} onChange={(event) => {
            const next = [...values];
            next[index] = event.target.value;
            onChange(next);
          }} />
          <button onClick={() => onChange(values.filter((_, i) => i !== index))}><Trash2 size={13} /></button>
        </div>
      ))}
      <button className="workbook-add" onClick={() => onChange([...values, "New term"])}>+ Term</button>
    </div>
  );
}

function MetricLine({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return <div className={strong ? "strong" : ""}><span>{label}</span><b>{money.format(value)}</b></div>;
}

function TakeoffModal({
  item,
  rule,
  params,
  onCancel,
  onInsertWithTakeoff,
  onInsertWithout,
  onParamChange
}: {
  item: PricingLibraryItem;
  rule: TakeoffRule;
  params: Record<string, number>;
  onCancel: () => void;
  onInsertWithTakeoff: () => void;
  onInsertWithout: () => void;
  onParamChange: (key: string, value: number) => void;
}) {
  const preview = useMemo(() => {
    try {
      return expandTakeoff(rule, params, params.lengthLF ?? 1);
    } catch {
      return null;
    }
  }, [params, rule]);
  const bomTotal = preview?.reduce((sum, component) => sum + component.totalCost, 0) ?? 0;
  const groups = preview ? groupBomByCategory(preview) : [];

  return (
    <div className="takeoff-modal-overlay" role="dialog" aria-label="Attach takeoff BOM">
      <div className="takeoff-modal">
        <div className="takeoff-modal-head">
          <div>
            <h3>Attach Takeoff BOM</h3>
            <p>{item.name}</p>
          </div>
          <button onClick={onCancel}>x</button>
        </div>
        <div className="takeoff-params">
          {rule.params.map((param) => (
            <label key={param.key}>
              {param.label}
              <input
                max={param.max}
                min={param.min}
                onChange={(event) => onParamChange(param.key, Number(event.target.value))}
                step={param.inputType === "integer" ? 1 : 0.25}
                type="number"
                value={params[param.key] ?? param.default}
              />
            </label>
          ))}
        </div>
        <div className="takeoff-preview">
          <table>
            <thead><tr><th>Component</th><th>Qty</th><th>Unit</th><th>@ Cost</th><th>Total</th></tr></thead>
            <tbody>
              {groups.map(({ category, items }) => (
                <FragmentRows category={category} items={items} key={category} />
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={4}>BOM purchasing ref</td><td>{bomTotal ? money.format(bomTotal) : "Pricing TBD"}</td></tr>
            </tfoot>
          </table>
        </div>
        <div className="takeoff-modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button onClick={onInsertWithout}>Insert without Takeoff</button>
          <button className="primary" onClick={onInsertWithTakeoff}>Insert with Takeoff</button>
        </div>
      </div>
    </div>
  );
}

function FragmentRows({ category, items }: { category: BOMComponent["category"]; items: BOMComponent[] }) {
  return (
    <>
      <tr className="takeoff-category-row"><td colSpan={5}>{category.toUpperCase()}</td></tr>
      {items.map((component) => (
        <tr key={component.label}>
          <td>{component.label}</td>
          <td>{component.qty}</td>
          <td>{component.unit}</td>
          <td>{component.unitCost ? money.format(component.unitCost) : "-"}</td>
          <td>{component.totalCost ? money.format(component.totalCost) : "-"}</td>
        </tr>
      ))}
    </>
  );
}

function TakeoffSummary({
  estimate,
  onExport,
  onItemChange
}: {
  estimate: Estimate;
  onExport: (components: BOMComponent[]) => void;
  onItemChange: (areaId: string, sectionId: string, itemId: string, fields: Partial<EstimateItem>) => void;
}) {
  const [installPct, setInstallPct] = useState(6);
  const [targetGpPct, setTargetGpPct] = useState(35);
  const components = aggregateBom(estimate);
  const groups = groupBomByCategory(components);
  const takeoffLines = estimate.areas.flatMap((area) =>
    area.sections.flatMap((section) =>
      section.items
        .filter((item) => item.takeoffExpansion)
        .map((item) => ({ areaId: area.id!, sectionId: section.id!, item }))
    )
  );
  const bidTotal = calculateEstimateTotals(estimate).bidTotal;
  const bomTotal = components.reduce((sum, component) => sum + component.totalCost, 0);
  const installCost = bidTotal * (installPct / 100);
  const cogs = bomTotal + installCost;
  const grossProfit = bidTotal - cogs;
  const gpPct = bidTotal ? (grossProfit / bidTotal) * 100 : 0;

  return (
    <div className="workbook-panel takeoff-summary">
      <div className="takeoff-header">
        <div>
          <h2>Takeoff</h2>
          <p>BOM costs are a purchasing reference and are not added to estimate pricing.</p>
        </div>
        <button disabled={!components.length} onClick={() => onExport(components)}><FileDown size={14} /> Export BOM CSV</button>
      </div>

      <h3 className="takeoff-cat-head">Attached Line Items</h3>
      {takeoffLines.length ? (
        <table className="workbook-table takeoff-table">
          <thead><tr><th>Item</th><th>Qty</th><th>Rule</th><th>Dimensions</th><th></th></tr></thead>
          <tbody>
            {takeoffLines.map(({ areaId, sectionId, item }) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.qty} {item.unit}</td>
                <td>{item.takeoffExpansion!.ruleName}</td>
                <td>{Object.entries(item.takeoffExpansion!.paramValues).map(([key, value]) => `${key}=${value}`).join(" / ")}</td>
                <td><button onClick={() => onItemChange(areaId, sectionId, item.id!, { takeoffExpansion: undefined })}>Detach</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="takeoff-empty">No takeoff rules attached. Add items from the library with a T badge.</p>}

      <h3 className="takeoff-cat-head">Bill of Materials</h3>
      {groups.map(({ category, items }) => (
        <div key={category}>
          <h4 className="takeoff-subcat-head">{category.toUpperCase()}</h4>
          <table className="workbook-table takeoff-table">
            <thead><tr><th>Component</th><th>Qty</th><th>Unit</th><th>@ Cost</th><th>Total</th></tr></thead>
            <tbody>
              {items.map((component) => (
                <tr key={component.label}>
                  <td>{component.label}</td>
                  <td>{component.qty}</td>
                  <td>{component.unit}</td>
                  <td>{component.unitCost ? money.format(component.unitCost) : "-"}</td>
                  <td>{component.totalCost ? money.format(component.totalCost) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <div className="takeoff-grand-total"><span>BOM Material Total</span><strong>{bomTotal ? money.format(bomTotal) : "Pricing TBD"}</strong></div>

      <h3 className="takeoff-cat-head">Margin Calculus</h3>
      <div className="margin-grid">
        <div className="margin-row"><span>Base Bid Total</span><strong>{money.format(bidTotal)}</strong></div>
        <div className="margin-row"><span>Material COGS (BOM)</span><span>{bomTotal ? money.format(bomTotal) : "Pending pricing"}</span></div>
        <div className="margin-row">
          <label>Install %<input min={0} onChange={(event) => setInstallPct(Number(event.target.value))} type="number" value={installPct} /></label>
          <span>{money.format(installCost)}</span>
        </div>
        <div className="margin-row">
          <label>Target GP %<input min={0} onChange={(event) => setTargetGpPct(Number(event.target.value))} type="number" value={targetGpPct} /></label>
          <span>{targetGpPct}%</span>
        </div>
        <div className={gpPct >= targetGpPct ? "margin-row margin-good" : "margin-row margin-warn"}>
          <span>Projected GP</span><strong>{bidTotal ? `${gpPct.toFixed(1)}% (${money.format(grossProfit)})` : "TBD"}</strong>
        </div>
      </div>
    </div>
  );
}

function aggregateBom(estimate: Estimate): BOMComponent[] {
  const byLabel = new Map<string, BOMComponent>();
  for (const area of estimate.areas) {
    for (const section of area.sections) {
      for (const item of section.items) {
        if (!item.takeoffExpansion || !item.qty) continue;
        const rule = takeoffRules.find((candidate) => candidate.id === item.takeoffExpansion!.ruleId);
        if (!rule) continue;
        let components: BOMComponent[];
        try {
          components = expandTakeoff(rule, item.takeoffExpansion.paramValues, item.qty);
        } catch {
          continue;
        }
        for (const component of components) {
          const key = `${component.label}-${component.unit}-${component.category}`;
          const existing = byLabel.get(key);
          if (existing) {
            existing.qty = Math.round((existing.qty + component.qty) * 100) / 100;
            existing.totalCost = Math.round(existing.qty * existing.unitCost * 100) / 100;
          } else {
            byLabel.set(key, { ...component });
          }
        }
      }
    }
  }
  return [...byLabel.values()];
}

function groupBomByCategory(components: BOMComponent[]) {
  return (["hardware", "material", "labor"] as const)
    .map((category) => ({ category, items: components.filter((component) => component.category === category) }))
    .filter((group) => group.items.length);
}
