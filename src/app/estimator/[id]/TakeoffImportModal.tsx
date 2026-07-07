"use client";

import { useState, type ChangeEvent } from "react";
import { nextUid, type EstimateDocument } from "@/lib/estimator/document";
import { money } from "@/lib/estimator/math";
import { parseTakeoffRows, takeoffAreaTotal, type ParsedTakeoff } from "@/lib/estimator/takeoff-import";

export function TakeoffImportModal({
  onClose,
  update
}: {
  onClose: () => void;
  update: (mutate: (draft: EstimateDocument) => void) => void;
}) {
  const [parsed, setParsed] = useState<ParsedTakeoff | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const XLSX = await import("xlsx");
      const isCsv = /\.csv$/i.test(file.name);
      const workbook = isCsv
        ? XLSX.read(await file.text(), { type: "string", raw: true })
        : XLSX.read(await file.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "", raw: false });
      const result = parseTakeoffRows(rows as unknown[][]);
      if (!result || result.areas.length === 0) {
        setError("Could not find a ZZTakeoff header or any priced areas in this file.");
        return;
      }
      setParsed(result);
      setChecked(new Set(result.areas.flatMap((area, ai) => area.items.map((_, ii) => `${ai}:${ii}`))));
    } catch {
      setError("Could not read that file.");
    }
  }

  function toggleArea(ai: number, on: boolean) {
    setChecked((current) => {
      const next = new Set(current);
      parsed!.areas[ai].items.forEach((_, ii) => {
        if (on) next.add(`${ai}:${ii}`);
        else next.delete(`${ai}:${ii}`);
      });
      return next;
    });
  }

  function commit() {
    if (!parsed) return;
    let imported = 0;
    update((draft) => {
      parsed.areas.forEach((area, ai) => {
        const items = area.items.filter((_, ii) => checked.has(`${ai}:${ii}`));
        if (!items.length) return;
        draft.areas.push({
          id: nextUid(draft),
          name: area.name,
          qty: 1,
          ignore: false,
          noPrint: false,
          sections: [{
            id: nextUid(draft),
            name: "Casework",
            ignore: false,
            noPrint: false,
            items: items.map((item) => ({
              id: nextUid(draft),
              desc: item.desc,
              qty: item.qty,
              unit: item.unit,
              unitCost: item.unitCost,
              drawingRef: "",
              ignore: false,
              noPrint: false
            }))
          }]
        });
        imported += items.length;
      });
    });
    if (imported) onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>Import ZZTakeoff</h2>
            <p className="muted">Excel or CSV export. Import is additive — areas append to the estimate.</p>
          </div>
          <button className="modal-close" onClick={onClose} type="button">✕</button>
        </header>
        <div className="modal-body">
          {!parsed ? (
            <label className="ghost-button file-drop">
              Choose takeoff export…
              <input accept=".xlsx,.xls,.csv" hidden onChange={(e) => void readFile(e)} type="file" />
            </label>
          ) : (
            <div className="takeoff-preview">
              {parsed.measuredOnly ? (
                <p className="muted">Measured-only export — items arrive unpriced; price them by hand or from the library.</p>
              ) : null}
              {parsed.areas.map((area, ai) => {
                const areaChecked = area.items.every((_, ii) => checked.has(`${ai}:${ii}`));
                return (
                  <div className="takeoff-area" key={ai}>
                    <label className="takeoff-area-head">
                      <input checked={areaChecked} onChange={(e) => toggleArea(ai, e.target.checked)} type="checkbox" />
                      <strong>{area.name}</strong>
                      <span className="muted">{money(takeoffAreaTotal(area))}</span>
                    </label>
                    {area.items.map((item, ii) => (
                      <label className="takeoff-item" key={ii}>
                        <input
                          checked={checked.has(`${ai}:${ii}`)}
                          onChange={(e) => setChecked((current) => {
                            const next = new Set(current);
                            if (e.target.checked) next.add(`${ai}:${ii}`);
                            else next.delete(`${ai}:${ii}`);
                            return next;
                          })}
                          type="checkbox"
                        />
                        <span>{item.desc}</span>
                        <small>{item.qty} {item.unit} × ${item.unitCost}</small>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
          {error ? <p className="muted">{error}</p> : null}
        </div>
        <footer className="modal-foot">
          <button onClick={onClose} type="button">Cancel</button>
          <button className="primary" disabled={!parsed || checked.size === 0} onClick={commit} type="button">
            Import {checked.size} item{checked.size === 1 ? "" : "s"}
          </button>
        </footer>
      </section>
    </div>
  );
}
