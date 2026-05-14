# Agent Guardrails

This repository has two eras of code. Work in the modern app unless the user explicitly asks for legacy prototype reference work.

## Production App

- Production app code lives in `src/`.
- Production schema of record is `supabase/rebuild-production-schema.sql`.
- Production docs live in `README.md`, `docs/product-blueprint-v1.md`, and `docs/agent-handoff.md`.
- Use shared status values from `src/lib/status-constants.ts` instead of duplicating strings.
- Use repository helpers in `src/lib/*-repository.ts` for Supabase mapping and persistence.
- Keep business math in shared lib modules so UI, PDFs, analytics, and snapshots agree.

## Legacy Reference

- `index.html` and `project/` are legacy CDN/prototype reference files.
- Do not add production persistence, estimator, bid, job, or Supabase behavior to `project/*.js`.
- If you need behavior from the old estimator/dashboard, port the idea into `src/` instead.

## Before Commit

Run:

```bash
npm test
npm run typecheck
npm run build
```

On Windows PowerShell, use `npm.cmd` if `npm.ps1` is blocked.
