# Functional Specification — FS Job Dashboard

Source: `project/uploads/FS Job Dashboard.html` (single-file HTML/JS app; storage = File System Access API against a shared OneDrive folder containing `jobs.json` + `files/` subfolders). Extracted 2026-07-06 as the spec of record for the Jobs surface of the rebuild.

---

## 1. Data Model

### 1.1 Job entity

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | string | auto-suggested | Job number, e.g. `G047`. Pattern: PM-initial letter + zero-padded number. Uppercased on save. Primary key; duplicates rejected on create. |
| `pm` | enum `'G'\|'P'\|'J'` | `'G'` | Project manager code (Geoff/Pat/Joe). Required. |
| `client` | string | — | Required. Uppercased on save. |
| `project` | string | `''` | Project description. |
| `status` | enum | `'ready'` | `ready | active | completed | installed | void`. |
| `value` | number | `0` | Original contract value in dollars. |
| `installStart` | ISO date | `''` | Install window start. |
| `installEnd` | ISO date | `''` (falls back to start) | Install window end. |
| `crewSize` | int 1–6 | `1` | 6 means "6+ installers". |
| `gc` | string | `''` | GC name. |
| `notes` | string | `''` | Free text. |
| `files` | array | `[]` | `{name, path, size, slot}` — one per slot key max; replacing overwrites. |
| `changeOrders` | array | `[]` | See §4. |
| `activityLog` | array | `[]` | `{note, by, created}`, newest first. |
| `created` / `updated` | ISO datetime | | |

**Derived:** `currentContractValue(job) = value + Σ amount of changeOrders where status === 'approved'`. Duration = `max(1, round((end−start)/day)+1)` inclusive days.

## 2. Views

### 2.1 Dashboard (default)
- Header subtitle: `"{active} active · {inProgress} in progress · {done} completed"`.
- **4 stat cards:** Active Jobs; Installing ≤ 21 Days (window overlaps [now, now+21d]); Completed/Installed; YTD Revenue (Σ currentContractValue over non-void).
- **Two columns:** *Installing Soon* — up to 6 cards from the ≤21-day list sorted by start (date tile tinted by PM color; `id · PM · range · N days`; client bold; project + crew tag; status badge). *In Progress* — up to 6 status-`active` jobs. All cards click → job detail.

### 2.2 All Jobs table
- Filters (AND-combined): text search over `id+client+project+gc+notes`; PM select; Status select. Right-aligned "X of Y jobs" count.
- Columns (sorted by numeric part of job id; whole row clickable): **Job #** (mono blue), **Client** (bold), **Project**, **PM** (color dot + name), **Status** (pill), **Value** (right-aligned current contract; green + `+N CO` pill when approved COs exist), **Install Window** (`Mon D → Mon D (N days)`), **Crew** (`👷 N`), **Docs** (`📎 N` pill or `—`).

### 2.3 Install Calendar
- Month grid Sun–Sat with prev/next. Legend: PM dots (Geoff purple #7c3aed, Pat amber #d97706, Joe blue #0284c7) + capacity swatches.
- **Capacity summary bar:** "{Month} — N job(s) installing · X crew-days booked" + meter; crew-days = Σ crewSize per job per in-month day of window. Levels: ≤10 Light (green), ≤20 Moderate (amber), ≤30 Heavy (orange), >30 Very busy (red).
- **Day cells:** background by total crew booked that day (0 white; 1–2 green; 3–5 yellow; 6–8 orange; 9+ red); corner `👷N` tag; up to 3 job pills (`"{id}: {client}"`, PM-tinted, click → detail); "+N more" overflow. Jobs render on every day of their window. Today highlighted.

## 3. Job Detail (one scroll — the PM view)

**Header:** `"{id} — {CLIENT}"`, project subtitle, **Edit Job** button, close.

Body, top to bottom:
1. **Overview grid** (3-col, 8 cells): Project Manager (dot + name), Status (badge), Contract Value (current; green + `orig $X +$Y CO` sub-line when COs), Install Start, Install End (or "Same day"), Duration & Crew (`N day(s) · 👷 N`), GC, Job Number.
2. **Notes callout** (amber, only if notes non-empty).
3. **Update Status:** 4 pill buttons (ready/active/completed/installed; void only via edit form). Current highlighted. One click, saves immediately.
4. **📎 Job Documents:** 2-col grid of **6 slots** — Drawings 📐, Specifications 📋, Schedule 📅, PO/Contract 📄, Proposal 💼, Other 📎. Filled = green card, file name, size, "Click to open", ✓. Empty = dashed gray, dimmed, "No file attached". One file per slot; replace by re-upload.
5. **💰 Change Orders:** summary box "Original Contract → Current Contract" + CO total delta; list of COs (`CO n`, description, `date · by name`, status chip ⏳ Submitted / ✅ Approved, amount ±$; **Approve** button when not approved; ✕ remove with confirm); **inline add form** (description, amount ±, status select, "+ Add Change Order"). Adding/approving updates the contract figure live and mirrors an activity entry.
6. **📝 Activity Log:** newest-first entries (2-letter avatar, note, `name · Mon D, hh:mm`); quick-add textarea + **Post**. Auto-entries: CO added, CO approved. Status changes not auto-logged.

## 4. Change Orders

Fields: `description` (required), `amount` (float, may be negative), `status` (`submitted | approved`), `by`, `date`, `created`. Numbered by position. Approval is one-way. `current = original + Σ approved`. Submitted COs affect nothing but the list. CO-adjusted value surfaces: jobs table Value, YTD Revenue, detail overview, CO summary box.

## 5. Statuses & enums

| Key | Label | Meaning |
|---|---|---|
| `ready` | Ready to Start | Not yet begun |
| `active` | In Progress | In shop/production |
| `completed` | Completed | Built, pre-install |
| `installed` | Installed | Field install done |
| `void` | Void | Cancelled — excluded from calendar, revenue, installing-soon |

PMs: G=Geoff (purple), P=Pat (amber), J=Joe (blue). Crew 1–6 (6="6+"). Cell capacity thresholds ≤2/≤5/≤8/9+.

## 6. Not present in the source tool
No job delete, no CO edit/un-approve, no removal of saved files (replace only), no auth, no pagination/sort controls, single-year assumption.
