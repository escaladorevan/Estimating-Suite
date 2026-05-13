# Estimating Suite

Estimating Suite is being rebuilt from the original prototype bundle into a full-stack web app for FS bid tracking, estimating, proposal generation, job tracking, file storage, and historical margin analysis.

The legacy prototype files remain under `project/` as reference material. The modern app lives under `src/`.

## Source Systems Being Merged

- `project/uploads/Estimating_Master_v4.xlsx`: long-term opportunity, bid, job, CO, and historical tracking source of truth.
- `project/uploads/FS_Estimator_v2_1.html`: estimating/proposal workflow reference.
- `project/uploads/FS Job Dashboard.html`: job execution, files, COs, install calendar, and activity workflow reference.
- Existing `project/*.jsx` files: integration prototype and Supabase bridge reference.

## Modern App Stack

- Next.js + React + TypeScript
- Supabase Auth/Postgres/Storage-ready architecture
- Vitest for business-rule tests
- XLSX import for Estimating Master V4
- jsPDF proposal export

## Run Locally

```bash
npm install
npm run dev
```

Optional Supabase environment:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Apply the new schema from:

```text
supabase/rebuild-schema.sql
```

## Verification

```bash
npm test
npm run typecheck
npm run build
```

The current rebuild includes:

- Master-style opportunity register with workbook import
- Active bid kanban limited to active pursuit work
- Native estimator workspace with FS Estimator V2-style totals
- PDF proposal export
- Jobs list and robust job detail page
- CO approval rollups into current contract value
- File-slot model from FS Job Dashboard
- Bid/job analytics and margin summary
