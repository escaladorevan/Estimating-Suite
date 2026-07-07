"use client";

import { useState } from "react";
import { OPPORTUNITY_STATUSES } from "@/lib/import/master-workbook";
import type { Opportunity, WinLoss } from "@/lib/types";

export function blankOpportunity(opportunityNumber: string): Opportunity {
  return {
    id: "",
    opportunityNumber,
    month: new Date().toLocaleDateString("en-US", { month: "long" }),
    year: new Date().getFullYear(),
    client: "",
    projectName: "",
    bidDueDate: "",
    drawingStage: "",
    bidType: "",
    sentDate: "",
    submissionMethod: "",
    status: "New",
    winLoss: "",
    jobType: "",
    estValue: 0,
    linkDrawings: "",
    linkSpecs: "",
    linkSchedule: "",
    notes: "",
    bidFeedback: "",
    ntpReceived: false,
    finalCost: null
  };
}

export function OpportunityEditor({
  opportunity,
  onClose,
  onSave
}: {
  opportunity: Opportunity;
  onClose: () => void;
  onSave: (opp: Opportunity) => void;
}) {
  const [draft, setDraft] = useState(opportunity);
  const set = <K extends keyof Opportunity>(key: K, value: Opportunity[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <span className="mono muted">{draft.opportunityNumber}</span>
            <h2>{draft.projectName || "New ITB"}</h2>
          </div>
          <button className="modal-close" onClick={onClose} type="button">✕</button>
        </header>

        <div className="modal-body form-grid">
          <label>Bid #<input onChange={(e) => set("opportunityNumber", e.target.value)} value={draft.opportunityNumber} /></label>
          <label>Client<input onChange={(e) => set("client", e.target.value)} value={draft.client} /></label>
          <label className="span-2">Project<input onChange={(e) => set("projectName", e.target.value)} value={draft.projectName} /></label>
          <label>Bid due<input onChange={(e) => set("bidDueDate", e.target.value)} type="date" value={draft.bidDueDate} /></label>
          <label>Drawing stage<input onChange={(e) => set("drawingStage", e.target.value)} placeholder="CD, IFC, Email…" value={draft.drawingStage} /></label>
          <label>Bid type<input onChange={(e) => set("bidType", e.target.value)} placeholder="Competitive, Budget…" value={draft.bidType} /></label>
          <label>Job type<input onChange={(e) => set("jobType", e.target.value)} placeholder="Commercial, Residential…" value={draft.jobType} /></label>
          <label>Sent date<input onChange={(e) => set("sentDate", e.target.value)} type="date" value={draft.sentDate} /></label>
          <label>Submission<input onChange={(e) => set("submissionMethod", e.target.value)} placeholder="Email, Portal…" value={draft.submissionMethod} /></label>
          <label>Status
            <select onChange={(e) => set("status", e.target.value)} value={draft.status}>
              {OPPORTUNITY_STATUSES.map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>
          <label>Win / Loss
            <select onChange={(e) => set("winLoss", e.target.value as WinLoss)} value={draft.winLoss}>
              <option value="">Waiting</option>
              <option value="Won">Won</option>
              <option value="Lost">Lost</option>
            </select>
          </label>
          <label>Est. value<input onChange={(e) => set("estValue", Number(e.target.value) || 0)} type="number" value={draft.estValue || ""} /></label>
          <label>Final cost<input onChange={(e) => set("finalCost", e.target.value === "" ? null : Number(e.target.value))} type="number" value={draft.finalCost ?? ""} /></label>
          <label className="check-row">
            <input checked={draft.ntpReceived} onChange={(e) => set("ntpReceived", e.target.checked)} type="checkbox" />
            NTP received
          </label>
          <label className="span-2">Drawings link<input onChange={(e) => set("linkDrawings", e.target.value)} value={draft.linkDrawings} /></label>
          <label className="span-2">Specs link<input onChange={(e) => set("linkSpecs", e.target.value)} value={draft.linkSpecs} /></label>
          <label className="span-2">Schedule link<input onChange={(e) => set("linkSchedule", e.target.value)} value={draft.linkSchedule} /></label>
          <label className="span-2">Notes<textarea onChange={(e) => set("notes", e.target.value)} rows={2} value={draft.notes} /></label>
          <label className="span-2">Bid feedback<textarea onChange={(e) => set("bidFeedback", e.target.value)} rows={2} value={draft.bidFeedback} /></label>
        </div>

        <footer className="modal-foot">
          <button onClick={onClose} type="button">Cancel</button>
          <button
            className="primary"
            disabled={!draft.opportunityNumber.trim() || !draft.projectName.trim()}
            onClick={() => onSave(draft)}
            type="button"
          >
            Save
          </button>
        </footer>
      </section>
    </div>
  );
}
