"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { defaultDocument, type EstimateDocument, type PricingMode } from "@/lib/estimator/document";
import { computeTotals, money } from "@/lib/estimator/math";
import { listEstimates, saveEstimate } from "@/lib/repos/estimates";
import { InfoForm } from "./InfoForm";
import { AreasEditor } from "./AreasEditor";
import { ExtrasEditor } from "./ExtrasEditor";
import { LibraryPanel } from "./LibraryPanel";
import { TakeoffImportModal } from "./TakeoffImportModal";

type Tab = "areas" | "info" | "extras";

export function Workspace() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const isNew = params.id === "new";

  const [doc, setDoc] = useState<EstimateDocument | null>(null);
  const [recordId, setRecordId] = useState<string>(isNew ? "" : params.id);
  const [opportunityId, setOpportunityId] = useState<string | null>(searchParams.get("opportunity"));
  const [tab, setTab] = useState<Tab>("areas");
  const [saveState, setSaveState] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [selection, setSelection] = useState<{ areaId: number | null; sectionId: number | null }>({ areaId: null, sectionId: null });
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (isNew) {
      const fresh = defaultDocument();
      fresh.info.name = searchParams.get("project") ?? "";
      fresh.info.client = searchParams.get("client") ?? "";
      fresh.info.id = searchParams.get("number") ?? "";
      setDoc(fresh);
      return;
    }
    let mounted = true;
    listEstimates().then((rows) => {
      if (!mounted) return;
      const record = rows.find((row) => row.id === params.id);
      if (record) {
        setDoc(record.document as EstimateDocument);
        setOpportunityId(record.opportunityId);
      } else {
        setSaveState("Estimate not found.");
      }
    }).catch(() => setSaveState("Could not load estimate."));
    return () => { mounted = false; };
  }, [isNew, params.id, searchParams]);

  const update = useCallback((mutate: (draft: EstimateDocument) => void) => {
    setDoc((current) => {
      if (!current) return current;
      const draft = structuredClone(current);
      mutate(draft);
      dirtyRef.current = true;
      return draft;
    });
  }, []);

  const save = useCallback(async () => {
    if (!doc) return;
    const totals = computeTotals(doc);
    setSaveState("Saving…");
    try {
      const saved = await saveEstimate({
        id: recordId,
        opportunityId,
        name: doc.info.name,
        client: doc.info.client,
        docType: doc.info.docType,
        baseBid: totals.totalBid,
        document: doc,
        updatedAt: ""
      });
      dirtyRef.current = false;
      setSaveState(`Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
      if (!recordId) {
        setRecordId(saved.id);
        router.replace(`/estimator/${saved.id}`);
      }
    } catch {
      setSaveState("Save failed — your work is local only. Retry.");
    }
  }, [doc, recordId, opportunityId, router]);

  // Autosave: 4s after the last edit.
  useEffect(() => {
    if (!doc || !dirtyRef.current) return;
    const timer = setTimeout(() => { void save(); }, 4000);
    return () => clearTimeout(timer);
  }, [doc, save]);

  if (!doc) return <p className="muted">{saveState || "Loading…"}</p>;
  const totals = computeTotals(doc);

  return (
    <div className="workspace">
      <div className="totals-strip panel">
        <div className="totals-cells">
          <div><span>Material</span><strong>{money(totals.mat)}</strong></div>
          <div><span>Overhead</span><strong>{money(totals.ohAmt)}</strong></div>
          <div><span>Del + Install</span><strong>{money(totals.delAmt + totals.insAmt)}</strong></div>
          <div><span>Subs</span><strong>{money(totals.subTotal)}</strong></div>
          <div className="grand"><span>Base Bid</span><strong>{money(totals.totalBid)}</strong></div>
        </div>
        <div className="totals-params">
          <label>OH %<input onChange={(e) => update((d) => { d.ohPct = Number(e.target.value) || 0; })} step="0.5" type="number" value={doc.ohPct} /></label>
          <label>Del %<input onChange={(e) => update((d) => { d.delPct = Number(e.target.value) || 0; })} step="0.5" type="number" value={doc.delPct} /></label>
          <label>Inst %<input onChange={(e) => update((d) => { d.insPct = Number(e.target.value) || 0; })} step="0.5" type="number" value={doc.insPct} /></label>
          <label>Mode
            <select onChange={(e) => update((d) => { d.pricingMode = e.target.value as PricingMode; })} value={doc.pricingMode}>
              <option value="byarea">By Area</option>
              <option value="lumpsum">Lump Sum</option>
              <option value="itemized">Itemized</option>
            </select>
          </label>
          <button className="ghost-button" onClick={() => setImportOpen(true)} type="button">Import Takeoff</button>
          <button className="primary" onClick={() => void save()} type="button">Save</button>
        </div>
        <span className="muted save-state">{saveState}</span>
      </div>

      <nav className="workspace-tabs">
        {([["areas", "Areas & Items"], ["info", "Project Info"], ["extras", "Subs · Alternates · Terms"]] as [Tab, string][]).map(([id, label]) => (
          <button className={tab === id ? "active" : ""} key={id} onClick={() => setTab(id)} type="button">{label}</button>
        ))}
      </nav>

      <div className={tab === "areas" ? "workspace-main with-library" : "workspace-main"}>
        <div className="workspace-content">
          {tab === "areas" ? (
            <AreasEditor doc={doc} selection={selection} setSelection={setSelection} update={update} />
          ) : null}
          {tab === "info" ? <InfoForm doc={doc} update={update} /> : null}
          {tab === "extras" ? <ExtrasEditor doc={doc} update={update} /> : null}
        </div>
        {tab === "areas" ? <LibraryPanel selection={selection} update={update} /> : null}
      </div>

      {importOpen ? (
        <TakeoffImportModal onClose={() => setImportOpen(false)} update={update} />
      ) : null}
    </div>
  );
}
