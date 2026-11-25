# MIDRICIFY Accounting A1 — Implementation Record

## Status

A1 (Fiscal Calendar and Chart of Accounts) has been implemented and verified in the **MIDRICIFY-Test** Supabase project only. Production has not been changed.

## Database changes

- Added `accounting_fiscal_years` and `accounting_periods`.
- Added `chart_of_accounts` with tenant-scoped account codes and same-organisation parent references.
- Added four permissions: `finance.period.view`, `finance.period.manage`, `finance.accounts.view`, and `finance.accounts.manage`.
- Enabled RLS on all three tables. Policies are limited to authenticated users and use `has_org_permission`.
- Revoked `anon` and authenticated table privileges before granting the minimum required authenticated privileges.
- Added a fiscal-year generator that uses `organizations.fiscal_year_start_month`, creates twelve monthly periods, and is idempotent for an organisation/fiscal-year start date.
- Added database guards against overlapping/out-of-year accounting periods and cyclic chart-of-account parent relationships.
- Added indexes for the new user-reference foreign keys.

## Test and verification

- The complete DDL was first validated inside a transaction and rolled back.
- The A1 migration was then applied to the test project as migration version `20261125203147`.
- The foreign-key index follow-up was applied as migration version `20261125203252`.
- Verified all three tables have RLS enabled and the expected authenticated-only policies and grants.
- Exercised fiscal-year generation as an authenticated company administrator: FY2026 generated twelve periods from 1 January through 31 December 2026. The test transaction was rolled back, so no sample fiscal year or chart accounts were left behind.
- Exercised the overlap and hierarchy-cycle guards; both rejected invalid changes. The test transaction was rolled back.
- Supabase security advisors reported no new findings for the A1 tables. Existing project-level findings remain (23 authenticated-executable SECURITY DEFINER functions and leaked-password protection disabled).
- Performance advisors reported no unindexed foreign keys for the A1 tables. The project still has pre-existing performance/security notices.

## Important deployment hold

The repository's pre-existing migration files use short names such as `0001_...` rather than the timestamp versions recorded in the remote migration history. The existing local files and remote migration history therefore need a controlled baseline reconciliation before anyone runs `supabase db push`. Do not push the full migration directory to production until that reconciliation and a production backup/rollback review are complete.

## Next phase

Proceed to A2 (journal engine) only after A1 has been reviewed and the migration-history baseline is reconciled. A1 does not yet create journal entries, journal lines, posting RPCs, or financial reports.
