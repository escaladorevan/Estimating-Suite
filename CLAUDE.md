# Claude Code Guardrails

This is the V2 rebuild: the app is Evan's three tools — the Estimating Master
bid tracker, FS Estimator, and FS Job Dashboard — connected, and nothing else.
Read `docs/rebuild-plan.md` before adding anything; if a feature isn't in the
plan, it doesn't go in.

- Specs of record: `docs/spec-estimator.md`, `docs/spec-job-dashboard.md`
  (extracted from the source tools in `project/uploads/` — reference only,
  never recreate them as app code).
- Schema of record: `supabase/v2-schema.sql`.
- Structure: one directory per surface under `src/app/` (tracker, estimator,
  jobs); shared logic in `src/lib/` (pure, unit-tested); repositories in
  `src/lib/repos/`.
- Responsibility limits are enforced by ESLint and BLOCK the build:
  400-line file cap. When a file grows past the cap, extract — never raise it.
- Estimates persist as one JSONB document (atomic save). Do not normalize
  line items into tables.

Verify with:

```bash
npm test
npm run typecheck
npm run build   # runs lint first; lint errors fail the build
```
