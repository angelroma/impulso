# Production cutover to the six-table schema

One-time steps to move the hosted project (`txoorpmblpvqveeudafv`) from the pre-rebuild schema to
the `finance` schema on this branch, load the exported data and publish the Edge Function that
serves the API and the MCP endpoint.

Every step under "Cutover" changes production. Per the constitution, none of them runs without
the owner's explicit approval. Between steps 2 and 6 the hosted MCP does not work.

## Status: done on 2026-11-09

Cutover steps 2, 3, 5 and 6 ran against production with the owner's approval: legacy schemas
dropped, baseline applied, 188 transactions in 2 workspaces loaded, `impulso-api` deployed.
`/health`, the protected-resource metadata and the unauthenticated MCP challenge respond as
expected. Not done: sign-in pages on Cloudflare Pages, `push-config`, and an authenticated tool
call (needs the owner to reconnect the connector).

SQL was run with the CLI instead of the SQL editor; `--file` resolves against `--workdir`:

```bash
npx supabase db query --linked --project-ref txoorpmblpvqveeudafv --workdir apps --file ../docs/production-cutover/01_drop_legacy_schema.sql
```

## Verified locally (2026-11-09)

- `check`, `lint`, `test`, `test-db`, `verify-schema` and `test-integration` pass.
- `backups/import/import.sql` loads into the current schema: 2 workspaces, 10 accounts,
  164 categories, 17 payees, 3 projects, 188 transactions (trial load in a rolled-back
  transaction).

Not verified: the state of the hosted database (migration history, which legacy schemas exist),
the hosted function secrets and the Cloudflare Pages site.

## Before the cutover

0. **Access.** The Supabase CLI must be signed in to the account that owns
   `txoorpmblpvqveeudafv`: `npx supabase projects list` must show it. On 2026-11-09 the signed-in
   account listed only other projects, so nothing below could run.

1. **Fresh export.** If anything was recorded in production after
   `backups/2026-11-09-impulso-hosted.json` was taken, export again and rebuild the import:

   ```bash
   python -I backups/import/build_import.py backups/<new-export>.json backups/import/import.sql <owner_user_id>
   ```

   `backups/` holds personal financial data and is git-ignored. Never commit it.
2. **Owner id.** In the hosted SQL editor, confirm the user the import assigns everything to
   exists: `SELECT id, email FROM auth.users;` must list the `owner_user_id` used above.
3. **Function secrets.** Confirm the hosted function still has `IMPULSO_DATABASE_URL`,
   `IMPULSO_AUTH_ISSUER`, `IMPULSO_MCP_RESOURCE_URL` and `IMPULSO_ALLOWED_ORIGINS`. The cutover
   keeps the `impulso_backend` role and its password, so the database URL stays valid.
4. **Migration history.** See what the hosted project has applied:

   ```bash
   npx supabase migration list --project-ref txoorpmblpvqveeudafv --workdir apps
   ```

## Cutover

1. **Pause use.** Do not record anything through the assistant until step 7.
2. **Drop the legacy schemas.** Run [01_drop_legacy_schema.sql](01_drop_legacy_schema.sql) in the
   hosted SQL editor. It refuses to run unless the legacy `finance.books` table exists and the new
   `finance.workspaces` does not, keeps `auth` and the backend role, and clears the old migration
   history. The legacy audit log (225 events) survives only in the export; the legacy `private`
   schema (encrypted Google tokens, receipts, sync state) was never exported and is lost.
3. **Apply the baseline migration.** Preview, then apply:

   ```bash
   npx supabase db push --dry-run --project-ref txoorpmblpvqveeudafv --workdir apps
   ```

   ```bash
   npx supabase db push --project-ref txoorpmblpvqveeudafv --workdir apps
   ```

   The dry run must list only `20261109180000_create_impulso_baseline.sql`.
4. **Check the backend role.** In the SQL editor:
   `SELECT rolcanlogin FROM pg_roles WHERE rolname = 'impulso_backend';` must be `true`.
5. **Load the data.** Run `backups/import/import.sql` in the hosted SQL editor (it is one
   transaction). Its last result must show the counts listed under "Verified locally", or the
   counts of the rebuilt import.
6. **Deploy the function** (API and MCP):

   ```bash
   npx nx run supabase:deploy
   ```

7. **Sign-in pages (optional).** `impulso-auth` changed on this branch (HTML and CSS only).
   To publish it, build with `npx nx run supabase:build-site` and upload
   `dist/apps/impulso-auth` to the Cloudflare Pages project.
8. **Auth config.** Only if `apps/supabase/config.toml` changed under `[remotes.production]`:
   `npx nx run supabase:push-config`, with the `IMPULSO_AUTH_*` and Google variables set.

## After

1. Reconnect the Impulso connector in the assistant so it reads the new tools and instructions.
   The OAuth flow itself did not change.
2. Ask for context and compare account balances and per-currency totals against the export.
3. Record one small expense, check the balance, then delete it.

## If something fails

- Step 2 fails: nothing changed (single transaction).
- Steps 3 to 5 fail: the legacy data is gone from the database but intact in the export. Fix the
  cause and repeat from the failed step. The import runs in one transaction; if the baseline
  stops halfway, drop the `finance`, `api` and `private` schemas again before retrying.
- Step 6 fails: the previous function version keeps running against a schema it does not know;
  redeploy once the cause is fixed.
