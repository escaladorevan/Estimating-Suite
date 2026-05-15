# Agent Guardrails

This repository is now the modern Next/Supabase app. The old CDN prototype code has been removed to prevent accidental work in the wrong architecture.

## Production App

- Production app code lives in `src/`.
- Production schema of record is `supabase/rebuild-production-schema.sql`.
- Production docs live in `README.md`, `docs/product-lodestar.md`, `docs/product-blueprint-v1.md`, `docs/production-app-roadmap.md`, and `docs/agent-handoff.md`.
- Before starting feature work, read `docs/product-lodestar.md` and `docs/production-app-roadmap.md`; identify the roadmap slice being advanced.
- Use shared status values from `src/lib/status-constants.ts` instead of duplicating strings.
- Use repository helpers in `src/lib/*-repository.ts` for Supabase mapping and persistence.
- Keep business math in shared lib modules so UI, PDFs, analytics, and snapshots agree.

## Reference Uploads

- `project/uploads/` may contain old workbooks, PDFs, and standalone HTML tools used as source-system references.
- Do not recreate `index.html`, `project/*.js`, or `project/*.jsx` as production app code.
- If old estimator/dashboard behavior is useful, port the concept into `src/` and the repository helpers.

## Before Commit

Run:

```bash
npm test
npm run typecheck
npm run build
```

On Windows PowerShell, use `npm.cmd` if `npm.ps1` is blocked.

In handoff notes, PR descriptions, or final summaries, name the roadmap slice advanced by the work.
