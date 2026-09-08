# Fall 2026 semester reset

The committed reset artifact is a PII-free template. The ignored workbooks in
`Enrolled Students List - UMS/` are the only roster source.

From the repository root, regenerate the local executable SQL with:

```powershell
node scripts/generate-fall-2026-reset.mjs
```

The generator validates the three workbooks, normalizes comma-delimited names
to single spaces without changing capitalization, checks 136 unique ERPs and
the 46/46/44 class counts, verifies SQL literal escaping, and writes:

`supabase/manual/generated/fall-2026-semester-reset.sql`

Before running the generated SQL in the Supabase SQL editor:

1. Take and verify a recoverable database backup.
2. Confirm the selected Supabase project manually.
3. Replace the project-ref and operator placeholders in the generated SQL.
4. Run the complete file as one transaction and review its NOTICE output.
5. If it fails, issue `ROLLBACK;`; do not retry partial statements.

The generated file and source workbooks are ignored and must not be committed.
