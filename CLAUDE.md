# Claude Code Guardrails

Work in the modern Next/Supabase stack.

- New production work belongs under `src/`.
- The schema of record is `supabase/rebuild-production-schema.sql`.
- `index.html` and `project/` are legacy prototype reference files only.
- Do not update `project/supabase.js` for production persistence.
- If legacy behavior is useful, port the concept into the Next app and its repository helpers.
- Read `docs/agent-handoff.md` before making architecture or persistence changes.

Verify with:

```bash
npm test
npm run typecheck
npm run build
```
