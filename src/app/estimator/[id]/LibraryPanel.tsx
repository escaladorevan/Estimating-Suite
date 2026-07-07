"use client";

import { useEffect, useMemo, useState } from "react";
import { nextUid, type EstimateDocument } from "@/lib/estimator/document";
import { listLibraryItems } from "@/lib/repos/library";
import type { LibraryItem } from "@/lib/types";

type Selection = { areaId: number | null; sectionId: number | null };

export function LibraryPanel({
  selection,
  update
}: {
  selection: Selection;
  update: (mutate: (draft: EstimateDocument) => void) => void;
}) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  useEffect(() => {
    let mounted = true;
    listLibraryItems().then((rows) => { if (mounted) setItems(rows); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const categories = useMemo(() => ["All", ...new Set(items.map((item) => item.category))], [items]);
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return items.filter((item) =>
      (category === "All" || item.category === category) &&
      (!q || item.description.toLowerCase().includes(q) || item.category.toLowerCase().includes(q))
    ).slice(0, 200);
  }, [items, query, category]);

  function add(item: LibraryItem) {
    update((draft) => {
      let area = draft.areas.find((a) => a.id === selection.areaId) ?? draft.areas[0];
      if (!area) {
        area = { id: nextUid(draft), name: "New Area", qty: 1, ignore: false, noPrint: false, sections: [] };
        draft.areas.push(area);
      }
      let section = area.sections.find((s) => s.id === selection.sectionId) ?? area.sections[0];
      if (!section) {
        section = { id: nextUid(draft), name: "Casework", ignore: false, noPrint: false, items: [] };
        area.sections.push(section);
      }
      section.items.push({
        id: nextUid(draft),
        desc: item.description,
        qty: 1,
        unit: item.uom,
        unitCost: item.unitCost,
        drawingRef: "",
        ignore: false,
        noPrint: false
      });
    });
  }

  return (
    <aside className="library-panel panel">
      <h3>Pricing Library</h3>
      <input className="lib-search" onChange={(e) => setQuery(e.target.value)} placeholder="Search…" value={query} />
      <select onChange={(e) => setCategory(e.target.value)} value={category}>
        {categories.map((cat) => <option key={cat}>{cat}</option>)}
      </select>
      <div className="lib-list">
        {filtered.map((item) => (
          <button className="lib-item" key={item.id} onClick={() => add(item)} type="button">
            <span>{item.description}</span>
            <small>{item.uom} — ${item.unitCost}</small>
          </button>
        ))}
        {items.length === 0 ? <p className="muted">Library unavailable offline.</p> : null}
      </div>
    </aside>
  );
}
