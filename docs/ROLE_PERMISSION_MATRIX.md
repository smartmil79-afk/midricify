# MIDRICIFY Role & Permission Matrix
**Status:** Proposed target matrix; current database grants separately recorded below.  
**Tenant:** Organization-scoped role grants. Company administrator is a protected platform role.

## 1. Authorization model

MIDRICIFY uses three independent checks:
1. **Membership:** authenticated user has an active membership in the selected organization.
2. **Entitlement:** organization subscription/edition has the module enabled.
3. **Permission and transaction authority:** role grant permits the operation, and approval limits/separation-of-duties rules permit this particular transaction.

A visible menu item is not authorization. Every route, server action, API endpoint and sensitive database function must enforce the relevant checks. RLS must independently enforce tenant boundaries.

Company administrators have a documented administrative bypass for organization operations, but privileged actions remain audited. They must not be able to bypass immutable accounting rules, tenant boundaries or safety constraints such as balanced journals.

## 2. Existing roles observed

- company_admin
- requester
- department_head
- procurement_officer
- auditor
- finance_officer
- accountant
- storekeeper
- executive_approver

The current membership schema stores one role per membership. Multiple-role assignment is a future design option and must not be assumed by application code today.

## 3. Existing permission grants observed in MIDRICIFY-Test

This table reflects the organization-role grants returned by the inspected test database on 2026-11-25. Blank means no organization-specific grant was returned for that key; it does not mean the permission does not exist in the global catalogue.

| Permission key | Current organization role grants |
|---|---|
| audit.view | auditor |
| budget.manage | finance_officer |
| budget.view | auditor, finance_officer, procurement_officer |
| budgets.manage | finance_officer |
| budgets.view | department_head, finance_officer |
| inventory.manage | storekeeper |
| procurement.manage | procurement_officer |
| procurement.request.approve | executive_approver, procurement_officer |
| procurement.request.create | procurement_officer, requester |
| procurement.rfq.manage | procurement_officer |
| procurement.rfq.view | auditor, procurement_officer |
| requests.approve | department_head, executive_approver, procurement_officer |

Permission catalogue keys also include accounting.manage/view, departments.manage/view, finance.manage/view, invoices.manage, members.manage, organization.manage/view, requests.create, users.manage/view and workspace.manage. The test organization had no organization-specific grants for those keys at the time of inspection.

## 4. Target permission namespace

Use consistent domain.action keys for new capabilities. Do not silently rename existing keys; support legacy keys during a reviewed migration and update all code/RPC references together.

### Platform and administration
- organization.profile.view / organization.profile.manage
- organization.members.view / organization.members.manage
- organization.roles.view / organization.roles.manage
- organization.modules.view / organization.modules.manage
- organization.audit.view

### Procurement
- procurement.request.create / procurement.request.view / procurement.request.approve
- procurement.rfq.view / procurement.rfq.manage
- procurement.po.view / procurement.po.create / procurement.po.approve
- procurement.receipt.view / procurement.receipt.create / procurement.receipt.inspect
- procurement.vendor.view / procurement.vendor.manage

### Finance and accounting
- finance.accounts.view / finance.accounts.manage
- finance.journal.create / finance.journal.approve / finance.journal.post / finance.journal.reverse
- finance.ap.view / finance.ap.manage / finance.ap.pay
- finance.ar.view / finance.ar.manage / finance.ar.receive
- finance.bank.view / finance.bank.manage / finance.bank.reconcile
- finance.period.view / finance.period.close
- finance.reports.view
- finance.budget.view / finance.budget.manage / finance.budget.transfer

### Inventory and warehouse
- inventory.items.view / inventory.items.manage
- inventory.warehouse.view / inventory.warehouse.manage
- inventory.receive / inventory.issue / inventory.transfer
- inventory.adjust / inventory.count
- inventory.costing.view / inventory.costing.manage
- inventory.lot_serial.manage

### Sales and distribution
- sales.customer.view / sales.customer.manage
- sales.territory.manage / sales.visit.record
- sales.order.create / sales.order.view / sales.order.approve
- sales.dispatch.manage / sales.collection.record
- sales.price.manage / sales.credit_limit.manage
- sales.reports.view

### Maintenance and assets
- assets.view / assets.manage
- maintenance.request.create / maintenance.request.approve
- maintenance.plan.manage
- maintenance.work_order.create / maintenance.work_order.assign / maintenance.work_order.close
- maintenance.spare_parts.issue
- maintenance.costs.view / maintenance.reports.view

### Manufacturing and quality
- manufacturing.bom.view / manufacturing.bom.manage
- manufacturing.order.create / manufacturing.order.release / manufacturing.order.complete
- manufacturing.material.issue / manufacturing.output.record
- quality.inspection.record / quality.inspection.approve
- quality.nonconformance.manage

## 5. Proposed role defaults

These are recommended starting grants, not changes already applied to the database. Organization administrators should be able to tailor non-protected roles within policy.

| Role | Default access intent |
|---|---|
| company_admin | Organization configuration, module administration and all business domains; all privileged actions audited |
| requester | Create/view own requests, view permitted status, submit expense requests |
| department_head | Department requests, department budget visibility, departmental approvals within delegated limits |
| procurement_officer | Vendors, RFQs, quotations, purchase orders, receiving coordination; approval only where policy grants |
| auditor | Read-only cross-domain reports and audit trail; no transaction mutation |
| finance_officer | Budgets, AP/AR, journals and finance reports; posting/payment separated by policy |
| accountant | Chart of accounts, journals, reconciliation and reports; payment rights separately granted |
| storekeeper | Warehouse receipts/issues/transfers/counts; cannot approve own adjustments beyond configured threshold |
| executive_approver | High-value approvals and executive reports; no routine record mutation by default |

## 6. Separation of duties and approval authority

Permissions answer whether a user may attempt an action. Approval policy answers whether the user may approve this transaction.

- A requester should not approve their own request where separation of duties is required.
- The person preparing a journal should not post it where dual control is enabled.
- Supplier invoice entry and supplier payment release should be separate privileges.
- Inventory adjustment creation and approval should be separable.
- Work-order completion and maintenance cost approval may require different roles.
- Approval limits must be organization-configurable and currency-aware.
- Approval decisions must record approver, timestamp, decision, note, policy/limit applied and source document.
- Escalation and delegation must be time-bounded and audited.

## 7. Enforcement contract

Every protected mutation must check, in order:
1. authenticated session;
2. active membership and organization context;
3. module entitlement and dependency activation;
4. permission grant for the exact action;
5. approval limit and separation-of-duties rules;
6. document status and business validation;
7. atomic database mutation;
8. audit event.

Database RPCs must not rely solely on the Next.js server action having checked permission. SECURITY DEFINER routines must validate caller identity and tenant membership themselves, use a fixed safe search_path, revoke default PUBLIC execution and receive narrow grants. Prefer SECURITY INVOKER where practical.

## 8. Acceptance tests

For each permission key, test:
- granted role can perform the intended action in its own organization;
- ungranted role is denied;
- suspended/invited membership is denied;
- user from a different organization cannot read or mutate the record;
- disabled module/expired entitlement blocks billable module actions;
- direct RPC/API invocation is denied even when the UI is bypassed;
- company-admin bypass is limited to documented admin actions and remains audited;
- approval limits and self-approval rules are enforced;
- role grant changes take effect safely and cannot modify the protected company_admin role.

## 9. Rollout plan

1. Inventory every existing permission key, UI guard, server action and database function.
2. Map legacy permission keys to the target namespace without breaking existing routes.
3. Add missing catalogue entries and default grants in a migration only after the role matrix is approved.
4. Enforce checks in server actions and database mutation functions.
5. Add positive and negative tests across two organizations.
6. Run Supabase security/performance advisors.
7. Deploy to preview, verify, then promote only after the production build and DB migration are confirmed.

**Important:** This document is a proposed policy baseline. It does not grant permissions or change any database rows.
