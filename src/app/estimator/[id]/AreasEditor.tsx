"use client";

import { nextUid, type EstimateDocument } from "@/lib/estimator/document";
import { areaTotal, itemTotal, money, sectionTotal } from "@/lib/estimator/math";

type Selection = { areaId: number | null; sectionId: number | null };
type Update = (mutate: (draft: EstimateDocument) => void) => void;

export function AreasEditor({
  doc,
  selection,
  setSelection,
  update
}: {
  doc: EstimateDocument;
  selection: Selection;
  setSelection: (selection: Selection) => void;
  update: Update;
}) {
  function addArea() {
    update((draft) => {
      const area = { id: nextUid(draft), name: "New Area", qty: 1, ignore: false, noPrint: false, sections: [{ id: nextUid(draft), name: "Section 1", ignore: false, noPrint: false, items: [] }] };
      draft.areas.push(area);
    });
  }

  return (
    <div className="areas-editor">
      {doc.areas.length === 0 ? (
        <div className="placeholder">No areas yet. Add one, import a takeoff, or add items from the pricing library.</div>
      ) : null}
      {doc.areas.map((area) => (
        <section className={`panel area-block${area.ignore ? " ignored" : ""}`} key={area.id}>
          <header className="area-head">
            <input
              className="area-name"
              onChange={(e) => update((d) => { d.areas.find((a) => a.id === area.id)!.name = e.target.value; })}
              value={area.name}
            />
            <label className="qty-label">Qty
              <input
                min={1}
                onChange={(e) => update((d) => { d.areas.find((a) => a.id === area.id)!.qty = Math.max(1, Number(e.target.value) || 1); })}
                type="number"
                value={area.qty}
              />
            </label>
            <FlagToggles
              ignore={area.ignore}
              noPrint={area.noPrint}
              onChange={(flags) => update((d) => { Object.assign(d.areas.find((a) => a.id === area.id)!, flags); })}
            />
            <strong className="area-total">{money(areaTotal(area))}</strong>
            <button
              className="danger-link"
              onClick={() => update((d) => { d.areas = d.areas.filter((a) => a.id !== area.id); })}
              type="button"
            >
              Delete
            </button>
          </header>

          {area.sections.map((section) => (
            <div className={`section-block${section.ignore ? " ignored" : ""}${selection.sectionId === section.id ? " selected" : ""}`} key={section.id}>
              <div className="section-head" onClick={() => setSelection({ areaId: area.id, sectionId: section.id })}>
                <input
                  onChange={(e) => update((d) => {
                    d.areas.find((a) => a.id === area.id)!.sections.find((s) => s.id === section.id)!.name = e.target.value;
                  })}
                  value={section.name}
                />
                <FlagToggles
                  ignore={section.ignore}
                  noPrint={section.noPrint}
                  onChange={(flags) => update((d) => {
                    Object.assign(d.areas.find((a) => a.id === area.id)!.sections.find((s) => s.id === section.id)!, flags);
                  })}
                />
                <span className="muted">{money(sectionTotal(section))}</span>
              </div>
              <table className="items-grid">
                <thead>
                  <tr><th>Description</th><th>Dwg Ref</th><th className="num">Qty</th><th>Unit</th><th className="num">Unit $</th><th className="num">Total</th><th>IG</th><th>NP</th><th /></tr>
                </thead>
                <tbody>
                  {section.items.map((item) => {
                    const patch = (fields: Partial<typeof item>) => update((d) => {
                      const target = d.areas.find((a) => a.id === area.id)!.sections.find((s) => s.id === section.id)!.items.find((i) => i.id === item.id)!;
                      Object.assign(target, fields);
                    });
                    return (
                      <tr className={item.ignore ? "ignored" : ""} key={item.id}>
                        <td><input onChange={(e) => patch({ desc: e.target.value })} value={item.desc} /></td>
                        <td className="narrow"><input onChange={(e) => patch({ drawingRef: e.target.value })} value={item.drawingRef} /></td>
                        <td className="narrow num"><input onChange={(e) => patch({ qty: Number(e.target.value) || 0 })} type="number" value={item.qty || ""} /></td>
                        <td className="narrow"><input onChange={(e) => patch({ unit: e.target.value })} value={item.unit} /></td>
                        <td className="narrow num"><input onChange={(e) => patch({ unitCost: Number(e.target.value) || 0 })} type="number" value={item.unitCost || ""} /></td>
                        <td className="num total-cell">{money(itemTotal(item))}</td>
                        <td className="flag-cell"><input checked={item.ignore} onChange={(e) => patch({ ignore: e.target.checked })} title="Ignore in totals" type="checkbox" /></td>
                        <td className="flag-cell"><input checked={item.noPrint} onChange={(e) => patch({ noPrint: e.target.checked })} title="Hide on proposal" type="checkbox" /></td>
                        <td className="flag-cell">
                          <button
                            className="danger-link"
                            onClick={() => update((d) => {
                              const target = d.areas.find((a) => a.id === area.id)!.sections.find((s) => s.id === section.id)!;
                              target.items = target.items.filter((i) => i.id !== item.id);
                            })}
                            type="button"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button
                className="add-row"
                onClick={() => update((d) => {
                  const target = d.areas.find((a) => a.id === area.id)!.sections.find((s) => s.id === section.id)!;
                  target.items.push({ id: nextUid(d), desc: "", qty: 1, unit: "ea.", unitCost: 0, drawingRef: "", ignore: false, noPrint: false });
                })}
                type="button"
              >
                + Item
              </button>
            </div>
          ))}
          <button
            className="add-row"
            onClick={() => update((d) => {
              const target = d.areas.find((a) => a.id === area.id)!;
              target.sections.push({ id: nextUid(d), name: "New Section", ignore: false, noPrint: false, items: [] });
            })}
            type="button"
          >
            + Section
          </button>
        </section>
      ))}
      <button className="ghost-button" onClick={addArea} type="button">+ Area</button>
    </div>
  );
}

function FlagToggles({
  ignore,
  noPrint,
  onChange
}: {
  ignore: boolean;
  noPrint: boolean;
  onChange: (flags: { ignore?: boolean; noPrint?: boolean }) => void;
}) {
  return (
    <span className="flag-toggles" onClick={(e) => e.stopPropagation()}>
      <label title="Ignore in totals">IG<input checked={ignore} onChange={(e) => onChange({ ignore: e.target.checked })} type="checkbox" /></label>
      <label title="Hide on proposal">NP<input checked={noPrint} onChange={(e) => onChange({ noPrint: e.target.checked })} type="checkbox" /></label>
    </span>
  );
}
