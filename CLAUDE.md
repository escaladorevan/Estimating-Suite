# Claude Code Guardrails

Work in the modern Next/Supabase stack.

- New production work belongs under `src/`.
- The schema of record is `supabase/rebuild-production-schema.sql`.
- The old CDN prototype files have been removed. Do not recreate `index.html`, `project/supabase.js`, or `project/*.jsx`.
- `project/uploads/` is reference material only: source workbooks, PDFs, and old standalone tools for comparison/import mapping.
- If legacy behavior is useful, port the concept into the Next app and its repository helpers.
- Read `docs/agent-handoff.md` before making architecture or persistence changes.

Verify with:

```bash
npm test
npm run typecheck
npm run build
```
