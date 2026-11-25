# MIDRICIFY Accounting Foundation — Functional & Database Specification
**Status:** Design specification for Gate 1; not applied to any database  
**Target branch:** `architecture/erp-master-blueprint`  
**Observed baseline:** MIDRICIFY-Test database inspected 2026-11-25

## 1. Purpose and scope

Build a reliable, multi-tenant accounting foundation that connects existing procurement, budgets, expenses and Accounts Payable to a double-entry General Ledger. The accounting engine must be reusable by every industry edition.

This document defines the first accounting release:
1. Organization chart of accounts.
2. Fiscal years and accounting periods.
3. Journal entry and journal line engine.
4. Draft, review, post and reverse lifecycle.
5. Source-document posting integration contract.
6. Trial balance and core ledger reports.
7. Security, audit, tests and migration rollout.

Accounts Receivable, bank reconciliation, tax returns, fixed asset depreciation and advanced consolidation are subsequent increments, but the model should not block them.

## 2. Existing schema findings

The inspected test database already contains:
- `organizations.base_currency` and `organizations.fiscal_year_start_month`.
- `ap_invoices`, `ap_invoice_items` and `ap_invoice_payments`.
- Purchase orders, purchase order items, goods receipts and receipt items.
- Department budgets, budget transfers and expense requests.
- `inventory_stock`, which currently stores an item description, unit and quantity-on-hand rather than a normalized item master and movement ledger.
- Audit logs and organization-scoped memberships/permissions.

The existing AP workflow supports PO-linked invoice entry, three-way match, invoice approval and payment recording. The inspected AP migration does not create a general ledger journal when an invoice is approved or paid. Therefore, those records must not be treated as already posted accounting entries.

The existing `ap_invoice_payments` records are not a bank ledger. They capture payment references, dates, amounts, method and recorder. They do not provide bank accounts, statement lines or reconciliation.

Existing schema and workflow behavior must be preserved. Do not rewrite or silently backfill old AP/payment/expense rows into posted journals without an approved reconciliation process.

## 3. Accounting principles and invariants

### Double-entry
- Every posted journal has at least two lines.
- Total debits equal total credits in the organization's base currency, to the configured precision.
- Each line references an active posting account belonging to the same organization.
- A journal cannot post to a closed accounting period.
- Posted journals are immutable.
- Corrections are made using a linked reversal journal and, if needed, a corrected replacement journal.
- Draft and pending-review journals do not affect the General Ledger or financial statements.

### Currency
- Organization base currency is sourced from `organizations.base_currency`.
- Each journal records transaction currency and an immutable exchange-rate snapshot.
- Each line records transaction debit/credit and base debit/credit values.
- Exchange rates must be positive; rate source and effective date should be stored.
- Rounding is performed under one documented currency precision policy. Any rounding difference must be posted to an explicitly configured rounding account, not silently discarded.

### Period controls
- Fiscal years and periods are organization-scoped.
- A period has a date range and status: `open`, `soft_closed`, or `closed`.
- Soft-closed periods require a specific permission and reason to post adjustments.
- Closed periods reject posting.
- Period close records actor, timestamp, balances/check results and optional close notes.

### Source integrity and idempotency
- Each automated journal identifies its source domain, source record and posting event.
- A unique idempotency key prevents a source event being posted twice.
- Posting and source status transition occur atomically.
- Manual journals require a meaningful description and audit trail.
- Source documents are never mutated to make a journal balance.

## 4. Proposed data model

All tenant-owned tables carry `organization_id`. Prefer composite foreign keys such as `(organization_id, account_id)` to prevent cross-tenant references. UUID identifiers; `numeric` for monetary values, never floating-point.

### Fiscal calendar
**`accounting_fiscal_years`**
- id, organization_id
- name, start_date, end_date
- status (open, soft_closed, closed)
- created_by, created_at, closed_by, closed_at

**`accounting_periods`**
- id, organization_id, fiscal_year_id
- period_number, name, start_date, end_date
- status (open, soft_closed, closed)
- closed_by, closed_at, close_note
- unique organization/year/period number; non-overlapping period dates

Default period generation follows the organization's configured fiscal-year start month. The fiscal year label convention (start year vs end year) must be consistent and documented.

### Chart of accounts
**`chart_of_accounts`**
- id, organization_id
- account_code, account_name
- account_type: asset, liability, equity, revenue, cost_of_sales, expense, other_income, other_expense
- normal_balance: debit or credit
- parent_account_id (nullable)
- is_control_account, is_system_account, is_active
- allow_manual_posting
- description, created_by, created_at, updated_at
- unique (organization_id, account_code)

Parent-child hierarchy must be same-tenant and cycle-free. Posting is allowed only to active leaf accounts unless an explicitly supported control-account design permits otherwise. Control accounts should generally receive subledger-generated postings, not ad-hoc manual entries.

Provide configurable starter templates, not a universal hard-coded chart. Nigeria/NGN starter mapping can be supplied as an optional template, with tax accounts configurable by the organization's accountant.

### Journals
**`journal_entries`**
- id, organization_id, journal_number
- fiscal_year_id, accounting_period_id
- journal_date, posting_date
- description, reference
- transaction_currency, exchange_rate_to_base, rate_effective_date, rate_source
- status: draft, pending_approval, approved, posted, reversed, rejected
- source_type, source_id, posting_event, idempotency_key
- total_debit_base, total_credit_base
- created_by, reviewed_by, approved_by, posted_by
- created_at, approved_at, posted_at
- reversal_of_journal_id (nullable)
- unique organization/journal number; unique organization/idempotency key when present

**`journal_lines`**
- id, organization_id, journal_entry_id, line_number
- account_id, description
- transaction_debit, transaction_credit
- base_debit, base_credit
- exchange_rate snapshot or inherited journal rate
- optional dimensions: department_id, cost_center_id, branch/location_id, project_id
- created_at
- unique journal/line number

Line checks: amounts non-negative; exactly one of debit/credit is positive for a normal line; no zero-value line; account and dimensions belong to the same organization. If future multi-currency journals require multiple transaction currencies in one journal, the header currency assumption must be revised before implementation rather than worked around.

### Posting configuration
**`accounting_posting_rules`**
- organization_id, event_key, debit_account_id / credit_account_id mapping or a structured rule model
- optional tax, inventory, discount and variance account mappings
- enabled, effective dates, created_by, updated_at

Rules are configuration, not executable user-supplied SQL. Validate all mapped accounts and prevent cross-tenant or inactive mappings.

### Audit and attachments
Use existing `audit_logs` for high-level business events, and maintain journal-specific immutable event history if audit requirements need before/after line-level detail. Attachments link to source documents/journals through private storage policies; never make financial evidence public by default.

## 5. Standard posting flows

Posting mappings are configurable and must be reviewed by the organization's finance administrator. The entries below are illustrative accounting patterns, not tax advice.

### Supplier invoice approval / accrual
For a PO/GRN-matched supplier invoice, the accounting policy determines whether receipt accruals are recognized before invoice arrival.

At invoice posting:
- Debit inventory, expense, or an appropriate receipt-clearing account.
- Debit recoverable input tax only where configured and supported.
- Credit accounts payable control for the supplier invoice total.

Do not post an AP invoice merely because it is created or matched. Posting occurs only after authorized approval and period validation. Existing approved AP invoices may require a controlled migration/reconciliation, not automatic retroactive posting.

### Supplier payment
At payment posting:
- Debit accounts payable control.
- Credit the selected bank/cash account.

The payment record and GL journal must be created atomically. Partial payments reduce the payable balance. Payment cannot exceed the approved invoice's remaining amount. Reversals/voids require explicit workflow and linked reversing entries.

### Expense request
An expense request submission/approval is a workflow and budget commitment, not necessarily a posted expense. If the organization uses accrual accounting, expense recognition follows the configured recognition event and supporting evidence. Payment creates a separate cash/bank credit and payable/liability debit as appropriate. Do not double-book approved expenses and supplier invoices for the same source cost.

### Goods receipt and inventory
The long-term design should support:
- Debit inventory / credit goods-received-not-invoiced (GRNI) on accepted receipt, where perpetual inventory accrual is enabled.
- Clear GRNI against AP on supplier invoice posting.
- Post price/quantity variances to configured variance accounts where required.

The current stock table is too coarse to be the final inventory valuation subledger. Do not connect GL valuation directly to its quantity field without first implementing the movement ledger and valuation layer.

### Sales (future integration)
- Invoice: debit receivables; credit revenue and output tax.
- Cost of goods sold: debit COGS; credit inventory.
- Receipt: debit bank/cash; credit receivables.
These flows belong to the future sales module.

## 6. Journal lifecycle and atomic posting

1. **Draft:** creator prepares header and lines; no GL impact.
2. **Submit:** validate line structure, account status, period, totals and permissions; status becomes pending_approval.
3. **Approve:** separate authorized reviewer approves; self-approval blocked where dual control is configured.
4. **Post:** database transaction locks journal/period as needed; revalidates all invariants; allocates immutable posting number; writes posted state and audit event.
5. **Reverse:** create a new journal with opposite base and transaction debits/credits, link it to the original, and post it through an authorized reversal flow.
6. **Reject:** record actor, reason and timestamp; rejected journals do not affect balances.

Posting must use a database transaction and row-level locking to prevent concurrent duplicate posting or period-close races. Idempotency is required for all source-generated postings. A failed posting must leave no partial lines or status changes.

## 7. Reporting requirements

All reports use posted journal lines only and respect organization, date range, dimensions and currency selection.

Initial reports:
- Trial Balance (opening, period debit, period credit, closing)
- General Ledger detail by account
- Journal register
- Account activity and balances
- Profit & Loss / Income Statement
- Balance Sheet
- Cash movement summary only when cash/bank mappings are configured
- Period comparison and year-to-date views

Report totals must reconcile: trial balance debits equal credits; P&L net result flows to retained earnings/equity under the configured close process. Balance sheet assets equal liabilities plus equity. Do not present a cash-flow statement as authoritative until cash-flow classifications and bank/cash movements are implemented.

## 8. Permissions

New permission keys (to be added in a reviewed migration after the role matrix is approved):
- `finance.accounts.view`
- `finance.accounts.manage`
- `finance.period.view`
- `finance.period.manage`
- `finance.journal.view`
- `finance.journal.create`
- `finance.journal.submit`
- `finance.journal.approve`
- `finance.journal.post`
- `finance.journal.reverse`
- `finance.reports.view`
- `finance.posting_rules.manage`

Keep current legacy `accounting.manage/view`, `finance.manage/view`, `invoices.manage` keys during compatibility rollout. Do not remove or rename them until all UI guards, server actions, database functions, grants and existing role matrices have been migrated.

Separation-of-duties rules are independent of permissions. Posting authority may have transaction limits and cannot be inferred solely from a role name.

## 9. Migration sequence

**A1 — Fiscal calendar and chart of accounts**
- fiscal years and periods
- chart of accounts and account hierarchy
- optional starter chart template records
- RLS, explicit Data API grants only for required roles, indexes and constraints

**A2 — Journal engine**
- journal headers and lines
- lifecycle events, idempotency constraints
- atomic validate/approve/post/reverse functions
- fixed safe search_path, caller identity and membership validation
- revoke default PUBLIC/anon execution; grant only necessary authenticated RPCs

**A3 — Reporting**
- trial balance and GL queries/views
- views use `security_invoker = true` where supported
- avoid broad table exposure; reports enforce tenant membership and permissions

**A4 — AP integration**
- posting rules and source event integration
- approved invoice posting
- payment posting
- controlled migration/reconciliation of historical records
- verify invoice paid status agrees with posted payments and AP control balance

**A5 — Expense and budget integration**
- map approved/paid expense lifecycle to commitments and ledger events
- ensure no duplicate recognition against AP invoice sources
- preserve budget commitments and actuals reconciliation

**A6 — Bank and cash foundation**
- bank/cash accounts, statement imports, transaction matching and reconciliation
- payment workflow references a real cash/bank account
- reconcile bank balance to GL control account

Do not collapse these into one migration. Create migrations using the installed Supabase CLI workflow and verify migration history before applying to any shared environment.

## 10. Supabase security and exposure rules

The Supabase changelog says new public-schema tables require explicit grants for Data API access after the October 30, 2026 rollout. RLS and grants are separate controls. Every migration must explicitly choose which roles can reach each table, enable RLS, and add narrow organization/permission policies. Do not grant anon access to financial records. See official changelog: https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically

Prefer SECURITY INVOKER. Any SECURITY DEFINER function must have:
- fixed safe search_path;
- auth.uid() validation;
- active membership and permission checks inside the function;
- tenant-scoped record lookup and mutation;
- explicit revoke from PUBLIC/anon;
- minimal execute grants;
- tests for direct RPC invocation.

## 11. Known security work before accounting release

The current test DB Security Advisor reported:
- 23 SECURITY DEFINER functions callable by authenticated users, including existing AP invoice and payment RPCs. These may be intentional application endpoints, but each needs review for fixed search_path, internal authorization, narrow grants and tenant checks.
- Leaked-password protection is disabled.

Do not blindly revoke all authenticated access to existing RPCs because the app depends on some of them. Review each function and retain only intended authenticated endpoints. Enable leaked-password protection after evaluating auth configuration and rollout impact.

## 12. Acceptance tests

### Journal correctness
- Balanced journal posts successfully.
- Unbalanced journal is rejected.
- Empty, one-line, negative, zero and dual-sided lines are rejected.
- Inactive/non-posting account is rejected.
- Closed period rejects posting.
- Draft/pending/rejected journals do not appear in GL reports.
- Posted journal cannot be edited or deleted.
- Reversal exactly offsets original and references it.

### Tenant and authorization
- A member of organization A cannot read, approve, post or reverse organization B journals.
- Suspended/invited members cannot post.
- User without exact permission is denied at server and RPC layer.
- Company-admin administrative actions are audited.
- Direct RPC invocation cannot bypass checks.
- Data API grants are least privilege; anon has no financial access.

### Concurrency and idempotency
- Two simultaneous posting attempts create only one posted journal.
- Replayed source event does not create a duplicate.
- Concurrent period close and journal posting resolve safely.
- Document numbers remain unique under concurrency.

### Reconciliation
- Trial balance debit equals credit.
- AP subledger control balance agrees with AP GL control account after integration.
- Payment total never exceeds invoice total.
- Inventory-to-GL reconciliation remains disabled until inventory valuation is implemented.
- Historical unposted records are clearly identified and excluded from GL.

## 13. Release gates

No accounting release is complete until:
1. Migrations are generated through the approved CLI process and committed.
2. Test database migration history matches expected order.
3. RLS, grants, functions and advisor findings are reviewed.
4. Automated tests pass for two-tenant isolation, journal lifecycle, concurrency and idempotency.
5. UI/server actions use consistent typed results and server-side permission checks.
6. Vercel build reports READY for the commit containing the code.
7. End-to-end test entries reconcile across AP, GL and reports.
8. Production migration is applied only after explicit release review and backup/rollback plan.

**Current status:** Specification only. No accounting tables, functions, permissions, data or production deployment have been changed by this document.
