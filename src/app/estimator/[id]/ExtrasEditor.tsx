"use client";

import type { EstimateDocument, TermLine } from "@/lib/estimator/document";
import { altTotal, money } from "@/lib/estimator/math";

type Update = (mutate: (draft: EstimateDocument) => void) => void;

const TERM_SECTIONS: { key: keyof EstimateDocument & string; label: string }[] = [
  { key: "exclusions", label: "Exclusions" },
  { key: "clarifications", label: "Clarifications" },
  { key: "generalTerms", label: "General Terms" },
  { key: "warranty", label: "Warranty and Fabrication" },
  { key: "finishTerms", label: "Finish Materials" },
  { key: "hardwareTerms", label: "Hardware Assumptions" },
  { key: "fabNote", label: "Fabrication Note" }
];

export function ExtrasEditor({ doc, update }: { doc: EstimateDocument; update: Update }) {
  return (
    <div className="extras-editor">
      <section className="panel">
        <h3>Supplier / Subcontractor Items</h3>
        <p className="muted">Markup only — no OH, delivery, or install percentages. Prints as “1 lump sum”.</p>
        {doc.subItems.map((sub, index) => (
          <div className="inline-row" key={index}>
            <input onChange={(e) => update((d) => { d.subItems[index].desc = e.target.value; })} placeholder="Description" value={sub.desc} />
            <input onChange={(e) => update((d) => { d.subItems[index].cost = Number(e.target.value) || 0; })} placeholder="Cost" type="number" value={sub.cost || ""} />
            <input onChange={(e) => update((d) => { d.subItems[index].markupPct = Number(e.target.value) || 0; })} placeholder="Markup %" type="number" value={sub.markupPct} />
            <strong>{money(sub.cost * (1 + sub.markupPct / 100))}</strong>
            <button className="danger-link" onClick={() => update((d) => { d.subItems.splice(index, 1); })} type="button">✕</button>
          </div>
        ))}
        <button className="add-row" onClick={() => update((d) => { d.subItems.push({ desc: "", cost: 0, markupPct: 10 }); })} type="button">+ Sub item</button>
      </section>

      <section className="panel">
        <h3>Alternates</h3>
        <p className="muted">Displayed on the proposal; never added to the base bid.</p>
        {doc.altItems.map((alt, index) => (
          <div className="inline-row" key={index}>
            <input onChange={(e) => update((d) => { d.altItems[index].desc = e.target.value; })} placeholder="Description" value={alt.desc} />
            <input onChange={(e) => update((d) => { d.altItems[index].qty = Number(e.target.value) || 1; })} placeholder="Qty" type="number" value={alt.qty} />
            <input onChange={(e) => update((d) => { d.altItems[index].unit = e.target.value; })} placeholder="Unit" value={alt.unit} />
            <input onChange={(e) => update((d) => { d.altItems[index].price = Number(e.target.value) || 0; })} placeholder="Price" type="number" value={alt.price || ""} />
            <strong>{money(altTotal(alt))}</strong>
            <button className="danger-link" onClick={() => update((d) => { d.altItems.splice(index, 1); })} type="button">✕</button>
          </div>
        ))}
        <button className="add-row" onClick={() => update((d) => { d.altItems.push({ desc: "", qty: 1, unit: "lump sum", price: 0 }); })} type="button">+ Alternate</button>
      </section>

      {TERM_SECTIONS.map(({ key, label }) => (
        <TermsSection doc={doc} key={key} label={label} termsKey={key} update={update} />
      ))}
    </div>
  );
}

function TermsSection({
  doc,
  termsKey,
  label,
  update
}: {
  doc: EstimateDocument;
  termsKey: string;
  label: string;
  update: Update;
}) {
  const lines = doc[termsKey as keyof EstimateDocument] as TermLine[];
  const mutate = (fn: (target: TermLine[]) => void) =>
    update((draft) => { fn(draft[termsKey as keyof EstimateDocument] as TermLine[]); });

  return (
    <details className="panel terms-section">
      <summary>
        {label} <span className="muted">({lines.filter((line) => line.active).length} of {lines.length} on)</span>
      </summary>
      <div className="terms-actions">
        <button onClick={() => mutate((t) => t.forEach((line) => { line.active = true; }))} type="button">All on</button>
        <button onClick={() => mutate((t) => t.forEach((line) => { line.active = false; }))} type="button">All off</button>
      </div>
      {lines.map((line, index) => (
        <div className={`term-line${line.sub ? " sub" : ""}`} key={index}>
          <input checked={line.active} onChange={(e) => mutate((t) => { t[index].active = e.target.checked; })} type="checkbox" />
          <input className="term-text" onChange={(e) => mutate((t) => { t[index].text = e.target.value; })} value={line.text} />
          <button className="danger-link" onClick={() => mutate((t) => { t.splice(index, 1); })} type="button">✕</button>
        </div>
      ))}
      <button className="add-row" onClick={() => mutate((t) => t.push({ text: "New line", active: true, sub: false }))} type="button">+ Line</button>
    </details>
  );
}
