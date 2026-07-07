"use client";

import { useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import { deleteChangeOrder, addActivity, saveChangeOrder } from "@/lib/repos/jobs";
import { uploadSlotFile } from "@/lib/repos/files";
import { FILE_SLOT_LABELS, FILE_SLOTS, currentContractValue, type ActivityEvent, type ChangeOrder, type Job, type ProjectFile } from "@/lib/types";
import { money } from "@/lib/estimator/math";

const SLOT_ICONS: Record<string, string> = { drawings: "📐", specs: "📋", schedule: "📅", contract: "📄", proposal: "💼", other: "📎" };

export function DocSlots({
  jobId,
  files,
  setFiles,
  setNotice,
  author
}: {
  jobId: string;
  files: ProjectFile[];
  setFiles: Dispatch<SetStateAction<ProjectFile[]>>;
  setNotice: (notice: string) => void;
  author: string;
}) {
  async function upload(slot: (typeof FILE_SLOTS)[number], event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setNotice(`Uploading ${file.name}…`);
    try {
      const saved = await uploadSlotFile({ ownerType: "job", ownerId: jobId, slot, file, uploadedBy: author });
      if (saved) {
        setFiles((current) => [...current.filter((f) => f.slot !== slot), saved]);
        setNotice(`Stored ${file.name}.`);
      }
    } catch {
      setNotice(`Upload failed — ${file.name} was not stored.`);
    }
  }

  return (
    <section className="panel">
      <h3>📎 Job Documents</h3>
      <div className="doc-slots">
        {FILE_SLOTS.map((slot) => {
          const file = files.find((f) => f.slot === slot);
          return (
            <label className={`doc-slot${file ? " filled" : ""}`} key={slot}>
              <span className="slot-label">{SLOT_ICONS[slot]} {FILE_SLOT_LABELS[slot]}</span>
              {file ? (
                <a href={file.url} onClick={(e) => e.stopPropagation()} rel="noreferrer" target="_blank">
                  {file.name} <small>· Click to open ✓</small>
                </a>
              ) : (
                <span className="muted">No file attached — click to upload</span>
              )}
              <input hidden onChange={(e) => void upload(slot, e)} type="file" />
            </label>
          );
        })}
      </div>
    </section>
  );
}

export function ChangeOrdersSection({
  job,
  changeOrders,
  setChangeOrders,
  setNotice,
  author,
  activitySink
}: {
  job: Job;
  changeOrders: ChangeOrder[];
  setChangeOrders: Dispatch<SetStateAction<ChangeOrder[]>>;
  setNotice: (notice: string) => void;
  author: string;
  activitySink: (event: ActivityEvent) => void;
}) {
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"submitted" | "approved">("submitted");
  const today = new Date().toISOString().slice(0, 10);
  const currentValue = currentContractValue(job, changeOrders);
  const coTotal = currentValue - job.contractValue;

  async function mirror(note: string) {
    const event = await addActivity(job.id, author, note).catch(() => null);
    if (event) activitySink(event);
  }

  async function add() {
    if (!desc.trim()) { setNotice("Change order needs a description."); return; }
    try {
      const saved = await saveChangeOrder({
        id: "", jobId: job.id, description: desc, amount: Number(amount) || 0,
        status, submittedDate: today, approvedDate: status === "approved" ? today : "",
        createdBy: author, notes: ""
      });
      setChangeOrders((current) => [...current, saved]);
      void mirror(`Change order added: "${saved.description}" ${money(saved.amount)} — ${saved.status}`);
      setDesc(""); setAmount("");
    } catch { setNotice("Could not save the change order."); }
  }

  async function approve(co: ChangeOrder) {
    try {
      const saved = await saveChangeOrder({ ...co, status: "approved", approvedDate: today });
      setChangeOrders((current) => current.map((row) => (row.id === saved.id ? saved : row)));
      void mirror(`CO approved: "${saved.description}" (${money(saved.amount)})`);
    } catch { setNotice("Could not approve the change order."); }
  }

  async function remove(co: ChangeOrder) {
    if (!window.confirm("Remove this change order?")) return;
    try {
      await deleteChangeOrder(co.id);
      setChangeOrders((current) => current.filter((row) => row.id !== co.id));
    } catch { setNotice("Could not remove the change order."); }
  }

  return (
    <section className="panel">
      <h3>💰 Change Orders</h3>
      <div className="co-summary">
        <div><span>Original Contract</span><strong>{money(job.contractValue)}</strong></div>
        <span className="arrow">→</span>
        <div><span>Current Contract</span><strong className="co-value big">{money(currentValue)}</strong></div>
        {coTotal !== 0 ? <span className={`co-delta${coTotal < 0 ? " neg" : ""}`}>CO total: {coTotal > 0 ? "+" : "−"}{money(Math.abs(coTotal))}</span> : null}
      </div>
      {changeOrders.length === 0 ? <p className="muted">No change orders yet.</p> : null}
      {changeOrders.map((co, index) => (
        <div className="co-row" key={co.id}>
          <span className="co-num">CO {index + 1}</span>
          <div className="co-body">
            <strong>{co.description}</strong>
            <small className="muted">
              {co.submittedDate || "—"} · by {co.createdBy || "—"} ·{" "}
              <span className={co.status === "approved" ? "chip ok" : "chip wait"}>
                {co.status === "approved" ? "✅ Approved" : "⏳ Submitted"}
              </span>
            </small>
          </div>
          <strong className={co.amount < 0 ? "neg" : "pos"}>{co.amount < 0 ? "−" : "+"}{money(Math.abs(co.amount))}</strong>
          {co.status !== "approved" ? <button className="ghost-button small" onClick={() => void approve(co)} type="button">Approve</button> : null}
          <button className="danger-link" onClick={() => void remove(co)} type="button">✕</button>
        </div>
      ))}
      <div className="co-add">
        <input onChange={(e) => setDesc(e.target.value)} placeholder="Description (e.g. Added blocking per RFI-4)" value={desc} />
        <input onChange={(e) => setAmount(e.target.value)} placeholder="Amount (+/−)" step="0.01" type="number" value={amount} />
        <select onChange={(e) => setStatus(e.target.value as "submitted" | "approved")} value={status}>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
        </select>
        <button className="primary" onClick={() => void add()} type="button">+ Add Change Order</button>
      </div>
    </section>
  );
}

export function ActivityLog({
  jobId,
  activity,
  setActivity,
  setNotice,
  author
}: {
  jobId: string;
  activity: ActivityEvent[];
  setActivity: Dispatch<SetStateAction<ActivityEvent[]>>;
  setNotice: (notice: string) => void;
  author: string;
}) {
  const [note, setNote] = useState("");

  async function post() {
    if (!note.trim()) return;
    try {
      const saved = await addActivity(jobId, author, note);
      if (saved) setActivity((current) => [saved, ...current]);
      setNote("");
    } catch { setNotice("Could not post the note."); }
  }

  return (
    <section className="panel">
      <h3>📝 Activity Log</h3>
      {activity.length === 0 ? <p className="muted">No activity yet. Post a note below.</p> : null}
      {activity.map((event) => (
        <div className="activity-row" key={event.id}>
          <span className="avatar">{event.author.slice(0, 2).toUpperCase()}</span>
          <div>
            <p>{event.note}</p>
            <small className="muted">{event.author} · {new Date(event.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small>
          </div>
        </div>
      ))}
      <div className="activity-add">
        <textarea onChange={(e) => setNote(e.target.value)} placeholder="Post a note… (e.g. Delivered boxes to site, 3rd floor staging)" rows={2} value={note} />
        <button className="primary" onClick={() => void post()} type="button">Post</button>
      </div>
    </section>
  );
}
