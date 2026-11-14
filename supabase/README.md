# The labs backend

Supabase project `uguiiwmhlqcitxrgqqmh`, West EU (Paris), free plan. Rules for changing it: `.claude/rules/supabase.md`.
The site works fully without it; it adds consented usage events, the owner's dashboard and, later, sign-in and sync.

## Migrations

| File | In the database | Notes |
|---|---|---|
| `20261113150000_labs_backend_v0.sql` | applied 2026-11-13 | profiles, progress, events, usage_events, usage_by_day, row-level security on all |
| `20261113160000_labs_backend_retention_owner.sql` | applied 2026-11-13, through the dashboard's SQL editor | 90-day roll-up, owner recognition, the nightly job `labs-usage-rollup` (03:17 UTC). Not in the migration tool's own history, because that tool asks for a confirmation a headless run cannot give. |
| `20261113180000_labs_backend_visible_time.sql` | applied 2026-11-13, through the dashboard's SQL editor | Visible time is the largest report of each session, summed over sessions (it was the sum of every report); the daily cap counts stored rows only. |

Update this table in the same commit that applies a migration.

## Tests

- `tests/anon_api.mjs`: the anonymous path over the real Data API with the publishable key (36 checks, passing on
  2026-11-13 after all three migrations). Run it after every migration: `node supabase/tests/anon_api.mjs`. It erases what it writes.
- `tests/rls_v0.sql`: the signed-in and owner paths, as one block that rolls itself back and ends with
  `RLS_TESTS_PASSED: <n> checks`. Run on 2026-11-13 after all three migrations, in the dashboard's SQL editor: 52
  checks passed, and no test user or row remained. Run it there after every migration; it writes test users, so
  the Supabase tool asks for a human confirmation.

## Keys

Only the project URL and the publishable key appear in this repository. They are public by design; row-level
security is the guard. No secret key, service_role key or database password belongs in any file here.

## The owner

The dashboard's reads are allowed to a signed-in user whose confirmed address hashes to the value listed in
`private.is_admin()`; no address is stored. Checked on 2026-11-13 with an ad hoc block that rolled itself back:
the owner's confirmed address is recognised and reads usage, another confirmed user is not, and the owner's
address unconfirmed is not. That block names the address, so it is not in this repository.
