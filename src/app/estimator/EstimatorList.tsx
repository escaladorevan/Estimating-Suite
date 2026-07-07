"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listEstimates } from "@/lib/repos/estimates";
import { money } from "@/lib/estimator/math";
import type { EstimateRecord } from "@/lib/types";

export function EstimatorList() {
  const [estimates, setEstimates] = useState<EstimateRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    listEstimates()
      .then((rows) => { if (mounted) setEstimates(rows); })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Estimator</h1>
          <p>{estimates.length} estimate{estimates.length === 1 ? "" : "s"}</p>
        </div>
        <Link className="primary link-button" href="/estimator/new">New Estimate</Link>
      </div>
      <div className="panel table-panel">
        <table className="data-table">
          <thead>
            <tr><th>Project</th><th>Client</th><th>Type</th><th className="num">Base Bid</th><th>Updated</th></tr>
          </thead>
          <tbody>
            {loading ? <tr><td className="empty" colSpan={5}>Loading…</td></tr> : null}
            {!loading && estimates.length === 0 ? (
              <tr><td className="empty" colSpan={5}>No estimates yet. Start one, or open a bid from the Tracker.</td></tr>
            ) : null}
            {estimates.map((estimate) => (
              <tr key={estimate.id}>
                <td>
                  <Link className="row-link" href={`/estimator/${estimate.id}`}>
                    <strong>{estimate.name || "(untitled)"}</strong>
                  </Link>
                </td>
                <td>{estimate.client || "—"}</td>
                <td>{estimate.docType}</td>
                <td className="num">{money(estimate.baseBid)}</td>
                <td>{estimate.updatedAt.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
