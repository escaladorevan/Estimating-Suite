"use client";

import { DOC_TYPES, SHIP_VIA_OPTIONS, type EstimateDocument, type EstimateInfo } from "@/lib/estimator/document";

export function InfoForm({
  doc,
  update
}: {
  doc: EstimateDocument;
  update: (mutate: (draft: EstimateDocument) => void) => void;
}) {
  const set = <K extends keyof EstimateInfo>(key: K, value: EstimateInfo[K]) =>
    update((draft) => { draft.info[key] = value; });
  const info = doc.info;

  return (
    <div className="panel form-grid">
      <label>Project Id<input onChange={(e) => set("id", e.target.value)} placeholder="Q-26-119" value={info.id} /></label>
      <label>Document type
        <select onChange={(e) => set("docType", e.target.value)} value={info.docType}>
          {DOC_TYPES.map((type) => <option key={type}>{type}</option>)}
        </select>
      </label>
      <label className="span-2">Project description<input onChange={(e) => set("name", e.target.value)} value={info.name} /></label>
      <label>Client / To<input onChange={(e) => set("client", e.target.value)} value={info.client} /></label>
      <label>Attention<input onChange={(e) => set("attention", e.target.value)} value={info.attention} /></label>
      <label className="span-2">Address<input onChange={(e) => set("address", e.target.value)} placeholder="Street, City, ST ZIP (commas become lines)" value={info.address} /></label>
      <label>Bid date<input onChange={(e) => set("bidDate", e.target.value)} placeholder="MM/DD/YYYY" value={info.bidDate} /></label>
      <label>Ship via
        <select onChange={(e) => set("shipVia", e.target.value)} value={info.shipVia}>
          {SHIP_VIA_OPTIONS.map((option) => <option key={option}>{option}</option>)}
          {!SHIP_VIA_OPTIONS.includes(info.shipVia as (typeof SHIP_VIA_OPTIONS)[number]) && info.shipVia ? (
            <option value={info.shipVia}>{info.shipVia} (legacy)</option>
          ) : null}
        </select>
      </label>
      <label>Terms<input onChange={(e) => set("terms", e.target.value)} value={info.terms} /></label>
      <label>P.O. number<input onChange={(e) => set("poNumber", e.target.value)} value={info.poNumber} /></label>
      <label>Delivery date<input onChange={(e) => set("deliveryDate", e.target.value)} value={info.deliveryDate} /></label>
      <label>Estimator<input onChange={(e) => set("estimator", e.target.value)} value={info.estimator} /></label>
      <label>GC<input onChange={(e) => set("gc", e.target.value)} value={info.gc} /></label>
      <label>Architect<input onChange={(e) => set("architect", e.target.value)} value={info.architect} /></label>
      <label className="span-2">Bid documents<input onChange={(e) => set("bidDocs", e.target.value)} placeholder="100% CD Set, Addendum 1" value={info.bidDocs} /></label>
      <label>Drawings dated<input onChange={(e) => set("drawingsDated", e.target.value)} value={info.drawingsDated} /></label>
      <label>Addendums<input onChange={(e) => set("addendums", e.target.value)} value={info.addendums} /></label>
      <label className="span-2">Internal scope notes (never printed)
        <textarea onChange={(e) => set("scope", e.target.value)} rows={3} value={info.scope} />
      </label>
    </div>
  );
}
