"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useAuth } from "@/lib/auth";
import { listOpportunities, saveOpportunity } from "@/lib/repos/opportunities";
import { readMasterWorkbook, runMasterImport } from "@/lib/import/run-import";
import { OPPORTUNITY_STATUSES } from "@/lib/import/master-workbook";
import type { Opportunity } from "@/lib/types";
import { OpportunityEditor, blankOpportunity } from "./OpportunityEditor";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function TrackerView() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "admin" || profile?.role === "estimator";
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Open");
  const [editing, setEditing] = useState<Opportunity | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let mounted = true;
    listOpportunities()
      .then((rows) => { if (mounted) setOpportunities(rows); })
      .catch(() => { if (mounted) setNotice("Could not load opportunities."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return opportunities.filter((opp) => {
      const matchesQuery = !q || `${opp.opportunityNumber} ${opp.client} ${opp.projectName} ${opp.status}`.toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "All" ? true :
        statusFilter === "Open" ? !["Won", "Lost", "Archived"].includes(opp.status) :
        opp.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [opportunities, query, statusFilter]);

  const totalValue = filtered.reduce((sum, opp) => sum + opp.estValue, 0);

  async function persist(opp: Opportunity) {
    setNotice(`Saving ${opp.opportunityNumber}…`);
    try {
      const saved = await saveOpportunity(opp);
      setOpportunities((current) => {
        const exists = current.some((o) => o.id === saved.id || o.opportunityNumber === saved.opportunityNumber);
        return exists
          ? current.map((o) => (o.id === saved.id || o.opportunityNumber === saved.opportunityNumber ? saved : o))
          : [saved, ...current];
      });
      setNotice(`Saved ${saved.opportunityNumber}.`);
      setEditing(null);
    } catch {
      setNotice(`Save failed — ${opp.opportunityNumber} was not stored.`);
    }
  }

  async function importWorkbook(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setNotice("Reading workbook…");
    try {
      const parsed = await readMasterWorkbook(await file.arrayBuffer());
      setNotice(`Importing ${parsed.opportunities.length} bids, ${parsed.jobs.length} jobs, ${parsed.changeOrders.length} COs…`);
      const result = await runMasterImport(parsed, profile?.fullName ?? "Import");
      setOpportunities(await listOpportunities());
      setNotice(
        `Imported ${result.opportunities} bids, ${result.jobs} jobs, ${result.changeOrders} COs.` +
        (result.failures.length ? ` ${result.failures.length} failed: ${result.failures.slice(0, 3).join(", ")}…` : "")
      );
    } catch {
      setNotice("Import failed — nothing may have been saved. Check the file and try again.");
    }
  }

  function nextOpportunityNumber(): string {
    const year = String(new Date().getFullYear()).slice(-2);
    const pattern = new RegExp(`^Q-${year}-(\\d{3})$`);
    const max = Math.max(0, ...opportunities.map((o) => Number(o.opportunityNumber.match(pattern)?.[1] ?? 0)));
    return `Q-${year}-${String(max + 1).padStart(3, "0")}`;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Bid Tracker</h1>
          <p>{filtered.length} of {opportunities.length} bids · {money.format(totalValue)}</p>
          {notice ? <p className="muted">{notice}</p> : null}
        </div>
        {canEdit ? (
          <div className="header-actions">
            <label className="ghost-button">
              Import Master V4
              <input accept=".xlsx,.xls" hidden onChange={(e) => void importWorkbook(e)} type="file" />
            </label>
            <button className="primary" onClick={() => setEditing(blankOpportunity(nextOpportunityNumber()))} type="button">
              New ITB
            </button>
          </div>
        ) : null}
      </div>

      <div className="toolbar">
        <input
          className="search"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bid #, client, project…"
          value={query}
        />
        <select onChange={(e) => setStatusFilter(e.target.value)} value={statusFilter}>
          <option>Open</option>
          {OPPORTUNITY_STATUSES.map((status) => <option key={status}>{status}</option>)}
          <option>All</option>
        </select>
      </div>

      <div className="panel table-panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Bid #</th>
              <th>Client</th>
              <th>Project</th>
              <th>Due</th>
              <th>Stage</th>
              <th>Sent</th>
              <th>Status</th>
              <th>Win?</th>
              <th className="num">Est. Value</th>
              <th>NTP</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td className="empty" colSpan={10}>Loading…</td></tr> : null}
            {!loading && filtered.length === 0 ? (
              <tr><td className="empty" colSpan={10}>No bids match. Create a New ITB or import the Master workbook.</td></tr>
            ) : null}
            {filtered.map((opp) => (
              <tr key={opp.id || opp.opportunityNumber} onClick={() => canEdit && setEditing(opp)}>
                <td className="mono">{opp.opportunityNumber}</td>
                <td><strong>{opp.client || "—"}</strong></td>
                <td>{opp.projectName}</td>
                <td>{opp.bidDueDate || "—"}</td>
                <td>{opp.drawingStage || "—"}</td>
                <td>{opp.sentDate || "—"}</td>
                <td><span className={`status status-${opp.status.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{opp.status}</span></td>
                <td>{opp.winLoss || "—"}</td>
                <td className="num">{opp.estValue ? money.format(opp.estValue) : "—"}</td>
                <td>{opp.ntpReceived ? "Yes" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing ? (
        <OpportunityEditor
          onClose={() => setEditing(null)}
          onSave={(opp) => void persist(opp)}
          opportunity={editing}
        />
      ) : null}
    </div>
  );
}
