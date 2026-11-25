# MIDRICIFY Master ERP Architecture
**Status:** Architecture baseline — proposed design, not yet implemented  
**Product direction:** General-purpose, multi-tenant ERP with configurable industry editions  
**Repository:** `smartmil79-afk/midricify`

## 1. Product vision

MIDRICIFY is one ERP platform with a shared operational and financial core. Organizations activate modules according to their needs and select an industry edition that configures terminology, workflows, dashboards, templates and optional capabilities.

Industry editions must not create separate applications, duplicate customer/vendor/product records, or fork the core codebase.

### Design principles
1. **Multi-tenant by design:** every business record belongs to an organization; cross-tenant access is denied by default.
2. **Modular:** modules have explicit dependencies and can be enabled per organization.
3. **Industry-configurable:** editions configure the platform; they do not fork it.
4. **One source of truth:** shared master data is reused across procurement, inventory, sales, finance and maintenance.
5. **Accounting integrity:** posted financial transactions are balanced, auditable and corrected through reversals rather than silent edits.
6. **Inventory integrity:** stock changes are recorded as traceable movements; balances are derived or reconciled from the movement ledger.
7. **Authorization at every layer:** UI visibility is not authorization. Server actions and database RPC/RLS policies enforce access.
8. **API and integration ready:** external systems connect through documented, permission-scoped interfaces.
9. **Progressive delivery:** no module is considered production-ready until migrations, authorization, tests, deployment and operational monitoring pass.

## 2. Platform architecture

### Shared platform services
- Tenant and organization management
- Company, branch, department and location hierarchy
- Authentication, membership, roles and granular permissions
- Module catalogue, edition configuration and subscription entitlements
- Workflow and approval engine
- Notifications and task inbox
- Document and attachment service
- Audit/event history
- Numbering and fiscal-period configuration
- Reporting, dashboards and export services
- Integration/API credentials and webhook delivery

### Business modules
| Domain | Core capabilities | Depends on |
|---|---|---|
| Procurement | Requisitions, RFQ, quotations, vendor selection, PO, receiving | Core, vendors, budgets |
| Finance & accounting | General ledger, journals, AP, AR, cash/bank, tax, financial statements | Core, chart of accounts |
| Inventory & warehouse | Items, warehouses, bins, batches, serials, transfers, valuation, counts | Core, item master |
| Sales & distribution | CRM/outlets, field reps, visits, quotes, orders, dispatch, collections | Core, inventory, finance |
| Asset & maintenance (CMMS) | Asset register, preventive plans, work orders, technicians, downtime, spare parts | Core, inventory, finance |
| Manufacturing | BOM, routing, production orders, material issue, output, WIP and costing | Inventory, finance, quality |
| Quality management | Inspections, sampling, nonconformance, corrective actions, release | Procurement, inventory, manufacturing |
| HR & payroll | Employee records, attendance, leave, payroll and approvals | Core, finance |
| Fleet & logistics | Vehicles, trips, fuel, service, dispatch and operating costs | Core, maintenance, inventory |
| Projects & construction | Projects, phases, budgets, materials, timesheets and cost tracking | Procurement, inventory, finance |

## 3. Industry editions

Editions are configuration bundles over the same modules and data model.

| Edition | Typical enabled modules | Industry-specific configuration |
|---|---|---|
| General Business | Procurement, finance, inventory, assets | Departments, approval matrix, standard reports |
| Manufacturing | General Business + manufacturing + quality + CMMS | BOMs, production routing, batch controls, yield and downtime KPIs |
| Distribution & Wholesale | Sales, inventory, procurement, finance, fleet | Territories, routes, price lists, credit limits, outlet visits |
| Retail | Inventory, sales/POS, finance, procurement | Stores, tills, promotions, price books, replenishment |
| Construction | Projects, procurement, inventory, finance, assets | BOQ, project phases, site stores, retention and project costing |
| Agriculture & Agribusiness | Inventory, procurement, production, quality, fleet | Farms/sites, feed or input recipes, livestock/crop cycles, harvest/batch tracking |

An organization may start with one edition and add modules later. Edition selection supplies defaults; administrators can configure eligible options subject to subscription entitlements.

## 4. Canonical data model

All tenant-owned business tables should include `organization_id`, timestamps and appropriate creator/updater references. Use UUID primary keys. Enforce tenant boundaries with RLS and database constraints; do not rely on client-supplied organization IDs without validating active membership.

### Organization and access
- organizations
- organization_memberships
- departments
- locations / branches
- roles
- permissions
- organization_role_permissions
- member_role_assignments (if multiple roles per member are supported)
- module_catalog
- organization_modules
- industry_editions
- organization_edition_settings
- subscription_plans / subscriptions / usage_entitlements
- audit_logs

### Shared master data
- parties (or a shared party identity model)
- vendors and vendor_contacts
- customers and customer_contacts
- items / products / services
- item_categories and units_of_measure
- currencies and exchange_rates
- tax_codes
- payment_terms
- document_sequences
- attachments and notes

A party may act as both customer and vendor. Keep role-specific commercial settings in related customer/vendor profiles rather than creating duplicate identities.

### Procurement
- purchase_requests and purchase_request_items
- approval_workflows / approval_steps / approval_decisions
- rfqs / rfq_items / rfq_vendors
- vendor_quotations / vendor_quotation_items
- purchase_orders / purchase_order_items
- goods_receipts / goods_receipt_items
- supplier_returns

### Inventory
- warehouses / warehouse_locations (bins)
- inventory_lots / serial_numbers
- inventory_transactions (append-only movement ledger)
- inventory_reservations
- stock_counts / stock_count_lines
- stock_transfers / stock_transfer_lines
- inventory_cost_layers or valuation records
- reorder_rules

### Finance
- chart_of_accounts
- fiscal_years / accounting_periods
- journal_entries / journal_lines
- accounts_payable / supplier_invoices / supplier_payments
- accounts_receivable / customer_invoices / customer_receipts
- bank_accounts / bank_transactions / reconciliations
- tax_transactions
- cost_centers / dimensions
- fixed_assets / depreciation_runs

### Sales, maintenance and production
- sales_territories / sales_representatives / customer_outlets / customer_visits
- sales_orders / sales_order_lines / deliveries / collections
- assets / asset_components / maintenance_plans / work_orders / work_order_tasks
- maintenance_downtime / meter_readings / spare_part_issues
- bills_of_material / routings / production_orders / material_issues / production_outputs
- quality_inspections / quality_results / nonconformance_records

This is a logical model. Exact table design, normalization and migration order must be validated against the existing schema before implementation.

## 5. Critical cross-module workflows

### Procure-to-pay
Requisition → budget check → approval → RFQ/quotation (when required) → PO → goods receipt and inspection → supplier invoice matching → payment approval → bank/payment posting → GL journal.

Controls:
- PO quantities and prices are traceable to approved procurement.
- Three-way match compares PO, accepted receipt and supplier invoice.
- Partial receipts and partial invoices are supported.
- Commitments and actual expenditure are not double-counted.
- Posted payments create auditable accounting entries.

### Order-to-cash
Customer/outlet → price and credit validation → sales order → stock reservation → pick/pack/dispatch → invoice → collection → bank reconciliation → GL posting.

### Inventory movement
Every receipt, issue, transfer, return, adjustment and production consumption creates a movement record with source document, item, quantity, unit, warehouse/bin, lot/serial (where applicable), cost and actor. Transfers have dispatch and receipt legs so in-transit stock is visible.

### Maintenance-to-inventory
Maintenance request → approval/triage → work order → reserve spare parts → issue parts and record labour/services → complete inspection → update asset service history and downtime → charge costs to asset, department or cost centre.

### Plan-to-produce
Demand/production plan → BOM and routing validation → material availability → production order → material issue → WIP tracking → quality checks → finished-goods receipt → production variance and cost posting.

## 6. Accounting and inventory design rules

### General ledger
- Use a double-entry journal model: total debits must equal total credits per journal.
- Draft journals may be edited; posted journals are immutable.
- Corrections use reversal and replacement journals with references.
- Close periods to prevent unauthorized backdated postings.
- Maintain source-document references and idempotency keys for integrations.
- Support base currency and transaction currency with recorded exchange rates.
- Reports derive from posted ledger entries, not dashboard-only calculations.

### Inventory costing
Support configurable costing methods by organization/item policy, initially prioritizing moving weighted average and FIFO. Do not silently mix costing methods within a valuation pool. Landed cost is allocated to receipt lines using a configured basis (quantity, value, weight, volume or manual allocation), with the allocation basis recorded. Cost adjustments must reconcile to the GL.

### Stock controls
- Negative stock is blocked by default; any exception is explicitly configured and audited.
- Batch/lot and expiry controls are enabled for relevant item categories.
- Serial tracking is enabled for serialized equipment.
- Unit conversions are explicit and validated.
- Cycle counts produce reviewed adjustments, not direct balance overwrites.

## 7. Authorization, tenant isolation and audit

Use least-privilege permissions grouped by domain, for example:
- `procurement.request.create`, `procurement.request.approve`, `procurement.po.manage`
- `finance.journal.create`, `finance.journal.post`, `finance.ap.manage`, `finance.bank.reconcile`
- `inventory.item.manage`, `inventory.receive`, `inventory.issue`, `inventory.transfer`, `inventory.adjust`
- `sales.order.create`, `sales.order.approve`, `sales.collection.record`
- `maintenance.work_order.manage`, `maintenance.work_order.close`
- `manufacturing.order.release`, `quality.inspection.approve`
- `organization.members.manage`, `organization.roles.manage`, `organization.modules.manage`

Company administrators may receive a documented administrative bypass, but privileged actions remain audited. Approval authority, transaction limits and separation-of-duties rules are separate from simple module access. A user should not approve their own transaction where policy prohibits it.

Every sensitive mutation must:
1. Authenticate the user.
2. Resolve active organization membership on the server.
3. Check module entitlement.
4. Check the specific permission and approval authority.
5. Validate the transaction and its state transition.
6. Execute atomically in a database transaction/RPC where multiple records must change together.
7. Write an audit event.
8. Return a consistent typed action result.

RLS policies must enforce tenant isolation independently of UI/server-action checks. SECURITY DEFINER functions require a fixed safe search_path, narrow grants, explicit tenant/membership checks and review.

## 8. Module activation and subscriptions

Use a module catalogue with stable keys, dependencies, edition defaults and plan entitlements. An organization module record should include status, activation date, configuration and optional trial/expiry information.

Activation rules:
- A module cannot activate until its dependencies are active.
- Deactivation must not delete historical transactions.
- Read-only access to historical records follows an explicit retention policy.
- Subscription checks happen server-side and in database mutation paths for billable capabilities.
- Feature flags are for controlled rollout; they are not a substitute for authorization.
- Provide plan limits for users, branches, warehouses, transactions and storage only where commercially required.

## 9. Application navigation and UX

Use a consistent shell with:
- Global organization/company and branch selector
- Search and command navigation
- Notifications and approvals inbox
- Role-aware sidebar
- Module dashboards
- Recent activity and audit history

Proposed navigation groups:
1. Overview
2. Procurement
3. Finance
4. Inventory
5. Sales & Distribution
6. Maintenance & Assets
7. Manufacturing & Quality
8. HR & Payroll
9. Fleet & Projects
10. Reports
11. Administration & Subscriptions

Hide unavailable modules from normal navigation, but also enforce entitlements and permissions on all routes and mutations.

## 10. Technical direction

Retain the existing Next.js App Router and Supabase/PostgreSQL foundation unless a measured requirement justifies a change.

Recommended boundaries:
- `src/modules/<domain>` for domain UI, schemas and application services
- `src/lib/auth` and `src/lib/permissions` for shared authorization
- `src/lib/tenant` for active organization context
- `supabase/migrations` for ordered database changes
- Server actions/API routes as thin adapters over validated domain services
- Database RPCs for atomic financial, inventory and approval transitions
- Shared typed result contracts and validation schemas

Avoid a large rewrite. Introduce modules incrementally around stable domain contracts. Use database constraints and unique indexes for numbering/idempotency and concurrency-sensitive operations.

## 11. Delivery roadmap and acceptance gates

### Gate 0 — Stabilize the existing foundation
- Resolve current TypeScript/build failures.
- Confirm latest GitHub commit is deployed and Vercel reports READY.
- Verify migrations are applied to the intended database.
- Complete role/permission enforcement in server actions and database RPCs.
- Add tenant-isolation, permission-matrix and workflow tests.
- Resolve outstanding security-advisor findings or document accepted risks.

### Gate 1 — Accounting foundation
- Chart of accounts, fiscal periods and journal engine.
- Balanced posting, reversal, audit and period-close controls.
- AP/AR and cash/bank subledgers.
- Trial balance and core financial statements.
- Reconcile procurement/expense workflows to accounting postings.

### Gate 2 — Advanced inventory
- Item/UOM master, warehouses, bins and movement ledger.
- Receipts, issues, transfers, reservations and cycle counts.
- Lot/serial/expiry tracking and valuation.
- Barcode support and stock reports.
- Reconcile inventory valuation to GL.

### Gate 3 — Sales force automation and distribution
- Customer/outlet CRM, territories and representatives.
- Visit planning, offline-tolerant mobile order capture and activity reporting.
- Pricing, credit limits, sales orders, dispatch and collections.
- Connect order fulfilment to inventory and accounting.

### Gate 4 — Maintenance and asset management
- Asset register, meter readings and service history.
- Preventive schedules, work orders, checklists and downtime.
- Spare-parts reservation/issue and maintenance costing.
- Mobile technician workflows and maintenance KPIs.

### Gate 5 — Industry editions
- Manufacturing, distribution, retail, construction, agriculture and general business presets.
- Edition-specific setup wizard, roles, workflows, dashboards and reports.
- Validate each edition with representative end-to-end scenarios.

### Gate 6 — Advanced operations
- Manufacturing execution, quality, HR/payroll, fleet, projects and external integrations.

A gate is complete only when code, migrations, automated tests, security checks, deployment and user-visible verification all pass. A GitHub commit alone is not a release.

## 12. Immediate project constraints and known status

The existing repository began as a procurement/financial-management SaaS foundation and has grown to include procurement requests, purchase orders, receiving, budgets, RFQ/sourcing and expenses. Some README statements describe earlier scaffold stages and should not be treated as proof of current production readiness.

At the time this architecture was drafted:
- The most recent permission-helper typing fix was committed to GitHub as `e2aeebaae5014d654c359dc45676d80c5cee8c21`.
- The latest confirmed Vercel production deployment was an earlier failed build on commit `804b6808c8870e2b5f6e41be29aa67edebbc55c8`.
- The latest fix had no confirmed Vercel deployment.
- Vercel's deployment API had returned a daily deployment-limit error.
- Database permission enforcement across all RPCs and production migration status still require verification.

Therefore this document establishes the target architecture only. It does not claim that the new modules, schema, or integrations have been implemented or deployed.

## 13. Definition of done for the architecture phase

Before module implementation begins, maintain:
- A reviewed entity-relationship diagram and migration dependency map.
- A module/dependency/entitlement catalogue.
- A permission matrix by role and transaction action.
- End-to-end workflow diagrams for procure-to-pay, order-to-cash, inventory movement and maintenance-to-inventory.
- A reporting and audit-event catalogue.
- A staged migration and rollback plan.
- A test plan covering tenant isolation, concurrency, financial balancing, inventory valuation and approvals.

**Architecture decision:** Build one configurable ERP core, then deliver independently testable modules and industry editions on top of it.