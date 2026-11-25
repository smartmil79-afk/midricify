# MIDRICIFY Data Model & Authorization Design
**Status:** Design specification; review against live database before migrations  
**Branch:** `architecture/erp-master-blueprint`  
**Depends on:** `docs/ERP_MASTER_ARCHITECTURE.md`

## 1. Existing schema observations

The current main-branch migrations already establish:
- `organizations` with base currency, country, timezone and fiscal-year start.
- `profiles`, `departments`, `organization_memberships`, `permissions`, global `role_permissions` and `audit_logs` (migration 0001).
- Procurement, purchase requests, purchase orders, receiving, budgets and AP-related objects in later migrations.
- Workspace-specific `organization_role_permissions` and a permission-management RPC (migration 0021).
- `has_org_permission(organization_id, permission_key)` and RFQ/supplier quotation tables (migration 0022).
- The current membership model has one role per organization membership, with a fixed role check constraint. It does not yet provide a general multi-role assignment model.

This design extends these foundations; it does not assume that every table described below already exists or that every migration is applied to production.

## 2. Proposed relational conventions

### Tenant ownership
- Every tenant-owned root record carries a non-null `organization_id`.
- Child records should either carry the same `organization_id` or be protected through a composite foreign key to a tenant-scoped parent. Prefer both where it improves query safety and RLS simplicity.
- Add tenant-aware uniqueness, for example `unique (organization_id, code)`.
- For parent-child integrity, use composite unique keys such as `unique (organization_id, id)` and composite foreign keys such as `(organization_id, warehouse_id) references warehouses(organization_id,id)`.
- Avoid globally unique business numbers unless the business requirement is truly global.
- Use `numeric(20,4)` or an explicitly chosen precision for quantities and `numeric(20,2)` (or currency-specific precision) for monetary values. Never use floating-point types for money.

### Common columns
For mutable business records: `id uuid primary key`, `organization_id uuid not null`, `created_at`, `created_by`, `updated_at`, `updated_by`, and a constrained status. Use `deleted_at` only for entities where soft deletion is appropriate; posted financial and inventory transactions must not be soft-deleted to hide history.

### Shared party identity
Introduce a normalized party model only after mapping existing `vendors` and customer records:
- `parties`: legal/display name, party type, registration/tax identifiers and contact defaults.
- `party_addresses`, `party_contacts`.
- `vendor_profiles` and `customer_profiles` reference a party and store role-specific terms, credit settings and status.
Do not migrate existing vendor data until duplicate detection and foreign-key impact have been reviewed.

### Product and service catalogue
- `items`: organization-scoped SKU, name, description, item type, category, base UOM, tracking policy, active state.
- `item_units` / `unit_conversions`: explicit numerator/denominator conversion, effective dates and rounding policy.
- `item_categories`, `price_lists`, `item_barcodes`.
- Batch, serial and expiry tracking are item policies, not ad-hoc text fields on stock balances.

## 3. Finance schema proposal

### Ledger
- `chart_of_accounts`: organization, account code, name, account type, normal balance, parent, control-account flag, active status.
- `fiscal_years` and `accounting_periods`: date ranges and open/closed/locked states.
- `journal_entries`: journal number, posting date, period, source type/id, status, description, currency and idempotency key.
- `journal_lines`: account, debit, credit, transaction currency, base-currency amounts, exchange rate, cost centre and dimensions.
- Enforce non-negative debit/credit and exactly one positive side per line. Enforce balanced totals and posting state in a database transaction/RPC; a simple row CHECK cannot enforce a sum across lines.
- Posted journals are immutable. Reversal creates a new journal linked to the original.

### Subledgers
- AP: supplier invoices, invoice lines, credit notes, payment batches and payment allocations.
- AR: customer invoices, credit notes, receipts and receipt allocations.
- Cash/bank: bank accounts, cash accounts, imported bank transactions, reconciliation sessions and matched ledger lines.
- Tax: tax codes, effective rates and tax transaction details.
- Fixed assets: asset register, asset classes, acquisition, depreciation runs, disposals and GL integration.
- Each subledger document has a defined posting event and account mapping. Never create a GL entry merely because a draft document was saved.

### Posting lifecycle
`draft → approved (where required) → posted → reversed`.
A document may have its own business lifecycle, but accounting posting status must be tracked separately. Use an atomic RPC that validates permissions, period status, balancing, source idempotency, and subledger state before posting.

## 4. Inventory schema proposal

### Warehouse topology
- `warehouses`: organization, code, name, branch/location, active status.
- `warehouse_bins`: organization, warehouse, parent bin, code, bin type and capacity metadata.
- Composite tenant-aware FKs must prevent a bin from referencing another organization's warehouse.

### Movement ledger
Use append-only `inventory_transactions` with:
- organization, item, warehouse/bin, movement type, quantity, UOM, signed base quantity
- source document type/id/line id
- lot/serial references
- unit cost, extended cost, currency and valuation layer reference
- effective timestamp, posted timestamp, actor and idempotency key

A stock balance table or materialized view may be maintained for fast reads, but it is a cache/projection. The movement ledger remains the traceable source. Reconciliation jobs compare projections to ledger totals.

### Receiving and transfers
- Accepted goods receipt lines create positive movements.
- Rejected quantities do not enter available stock.
- Transfers create an outbound movement and an in-transit balance, then an inbound movement on destination receipt.
- Reservations reduce available-to-promise but do not alter on-hand quantity.
- Returns and adjustments require reason codes, permissions and audit entries.

### Valuation
Choose costing policy at the organization/item valuation pool level. FIFO requires cost layers; weighted average requires atomic recalculation at receipt/posting. Landed costs must allocate to receipt item lines with a recorded allocation method and rounding residual handling. Inventory valuation postings reconcile to configured inventory/clearing/expense accounts.

## 5. Module dependency and entitlement catalogue

Stable module keys (proposed):
| Key | Module | Required dependencies |
|---|---|---|
| `core` | Platform core | none |
| `procurement` | Procurement | core |
| `finance` | Finance & accounting | core |
| `inventory` | Inventory & warehouse | core |
| `sales` | Sales & distribution | core, inventory; finance for invoicing |
| `maintenance` | Asset & maintenance | core; inventory for spare parts; finance for cost posting |
| `manufacturing` | Manufacturing | inventory, finance; quality recommended |
| `quality` | Quality management | core; inventory/manufacturing/procurement integrations |
| `hr` | HR & payroll | core; finance for payroll posting |
| `fleet` | Fleet & logistics | core; maintenance and finance integrations optional |
| `projects` | Projects & construction | core, procurement; finance and inventory integrations |

Use an organization-module entitlement record with `organization_id`, `module_key`, `status`, `enabled_at`, `expires_at`, `configuration`, and actor metadata. Add a unique constraint on `(organization_id,module_key)`. Enforce dependencies and plan limits in a server-side activation service and re-check entitlements in sensitive mutation paths.

Industry editions should be records/configuration bundles:
- edition key and version
- default module set
- workflow templates
- role/permission presets
- terminology and document templates
- dashboard/report presets
- optional industry-specific validation rules

An edition does not grant privileges beyond the organization's actual permission grants or subscription entitlements.

## 6. Permission catalogue proposal

Use granular action permissions. The list below is a target catalogue, not a claim that these keys are already seeded.

### Platform and administration
- `organization.view`, `organization.manage`
- `members.view`, `members.manage`
- `roles.view`, `roles.manage`
- `organization.modules.manage`
- `audit.view`

### Procurement
- `procurement.request.view`, `procurement.request.create`, `procurement.request.edit_own`
- `procurement.request.approve`, `procurement.request.reject`
- `procurement.rfq.view`, `procurement.rfq.manage`
- `procurement.po.view`, `procurement.po.create`, `procurement.po.approve`
- `procurement.receiving.view`, `procurement.receiving.record`, `procurement.receiving.inspect`

### Finance
- `finance.accounts.view`, `finance.accounts.manage`
- `finance.journal.view`, `finance.journal.create`, `finance.journal.post`, `finance.journal.reverse`
- `finance.ap.view`, `finance.ap.manage`, `finance.ap.approve`, `finance.ap.pay`
- `finance.ar.view`, `finance.ar.manage`, `finance.ar.collect`
- `finance.bank.view`, `finance.bank.reconcile`
- `finance.period.close`, `finance.reports.view`

### Inventory
- `inventory.items.view`, `inventory.items.manage`
- `inventory.warehouse.manage`
- `inventory.receive`, `inventory.issue`, `inventory.transfer`
- `inventory.adjust`, `inventory.count`, `inventory.costing.manage`
- `inventory.reports.view`

### Sales and distribution
- `sales.customers.view`, `sales.customers.manage`
- `sales.visits.manage`, `sales.orders.view`, `sales.orders.create`, `sales.orders.approve`
- `sales.dispatch.manage`, `sales.collections.record`, `sales.reports.view`

### Maintenance and assets
- `assets.view`, `assets.manage`
- `maintenance.request.create`, `maintenance.work_order.view`, `maintenance.work_order.manage`, `maintenance.work_order.close`
- `maintenance.plan.manage`, `maintenance.spare_parts.issue`, `maintenance.reports.view`

### Manufacturing and quality
- `manufacturing.bom.manage`, `manufacturing.order.create`, `manufacturing.order.release`, `manufacturing.order.complete`
- `quality.inspection.record`, `quality.inspection.approve`, `quality.nonconformance.manage`

### Other modules
- `hr.employee.view`, `hr.employee.manage`, `hr.payroll.prepare`, `hr.payroll.approve`
- `fleet.vehicle.manage`, `fleet.trip.manage`, `fleet.fuel.record`
- `projects.manage`, `projects.costs.view`

## 7. Initial role-to-permission baseline

This is a recommended starting template only. Organization administrators must be able to customize grants. Transaction limits, department scope and separation of duties are additional policies, not implied by a permission key.

| Role | Default scope |
|---|---|
| company_admin | Workspace administration and all module permissions, subject to audit and subscription entitlements |
| requester | Create/view own requests; view permitted catalogue and own request status |
| department_head | Department-scoped request review/approval within assigned authority |
| procurement_officer | Vendor, RFQ, quotation, PO preparation and receiving coordination |
| finance_officer | Budgets, AP/AR processing, bank operations and finance reports; posting/payment separation as configured |
| accountant | Journals and accounting records within assigned duties; no automatic payment authority |
| storekeeper | Physical receiving, issue, transfer and stock counts; no inventory cost-policy administration |
| auditor | Read-only access to authorized records, reports and audit history |
| executive_approver | Approval actions within delegated limits; no implicit ability to create or pay own transactions |

Do not blindly map legacy roles to new privileges. Before applying grants, export current organization-specific grants, compare with current application checks, and prepare a reviewed migration plan. Preserve company_admin protection.

## 8. Approval policy model

Permissions answer “may this user perform this action?” Approval policies answer “may this user approve this particular transaction?”

A future approval policy model should support:
- workflow key and version
- organization, module and document type
- conditions (amount, department, currency, category, project, location)
- ordered or parallel approval stages
- role/permission or named approver selector
- amount limits and delegation dates
- self-approval restriction
- escalation and due dates
- immutable decision history

Approval decisions must be evaluated server-side against the transaction's current state and the user's active membership at decision time.

## 9. Migration strategy

Do not ship a single giant migration. Use small, reversible, additive migrations and staged backfills.

1. Inventory current production and test schemas, migration history, RLS, RPCs and data volumes.
2. Create an ERD and map every existing table to the canonical domains.
3. Identify duplicates and inconsistent tenant keys.
4. Add new tables and indexes without changing existing behavior.
5. Add tenant-aware constraints and RLS policies.
6. Backfill data in batches with counts and reconciliation reports.
7. Add dual-read/dual-write only where needed and time-box it.
8. Switch application reads/writes after tests pass.
9. Keep compatibility views or adapters for one release where needed.
10. Remove obsolete fields only after production usage confirms they are unused.

Every migration must include a rollback/forward-repair plan, test on a disposable/test project first, and verify row counts, constraints, RLS and RPC grants before production.

## 10. Required test matrix

### Tenant isolation
- Organization A cannot select, mutate, reference or infer Organization B records.
- Child rows cannot reference a parent in another organization.
- RPCs reject forged organization IDs.
- Storage attachments follow the same tenant boundary.

### Authorization
- Each role is tested for allowed and denied actions.
- Missing grants, permission lookup errors and inactive memberships fail closed.
- Entitlement-disabled modules reject mutations even if a user has a permission.
- Approval limits and self-approval rules are enforced server-side.

### Finance
- Every posted journal balances in transaction and base currency according to policy.
- Concurrent posting cannot duplicate a source posting.
- Closed periods reject postings.
- Reversal retains original history and produces equal/opposite entries.
- Subledger control accounts reconcile to GL.

### Inventory
- Concurrent issues cannot oversell available stock.
- Transfers reconcile across source, in-transit and destination.
- Lot/serial and expiry constraints are respected.
- FIFO/weighted-average valuation is deterministic under concurrency.
- Stock valuation reconciles to the GL.

### Operations
- Partial receipts/invoices/deliveries behave correctly.
- Workflow state transitions reject stale or duplicate submissions.
- Audit logs capture actor, action, source, timestamp and organization.
- Mobile/offline sales submissions are idempotent when synchronized.

## 11. Open design decisions to resolve during discovery

These are not blockers for documenting the model, but must be resolved before related migrations:
- Whether one organization may contain multiple legal entities with separate books.
- Whether multiple roles per user are required, or one role plus scoped delegation is sufficient.
- Whether stock is valued per warehouse, per legal entity, or per organization/item pool.
- Whether accounting uses a single base currency per organization or per legal entity.
- Whether offline-first field sales is a launch requirement.
- Required Nigerian tax rules and effective dates, plus any other country-specific tax packs.
- Whether production and maintenance need serial/lot traceability across all sites.
- Data retention, backup and disaster-recovery targets.

**Decision rule:** Do not implement schema changes until current live/test schemas, migration history and existing workflows have been reconciled with this target model.