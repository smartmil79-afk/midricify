# MIDRICIFY Phase 1 Architecture

## Tenant model
- `organizations` are tenants.
- `organization_memberships` associates users with tenants and roles.
- All tenant-owned tables must include `organization_id`.
- RLS must be enabled on every tenant-owned table.
- Tenant checks should use helper functions and avoid policy recursion.

## Authentication
- Supabase Auth handles credentials and sessions.
- Profile is created from auth.users.
- Browser uses anon key only.
- Server-side privileged operations use secure server code; service role key must never be exposed in `NEXT_PUBLIC_*`.
- Onboarding should create organization and owner membership atomically through a server-side function or server action.

## Authorization
Authentication answers who the user is; membership and role authorization answer what they can do.
Every mutation must perform server-side checks. UI visibility is not security.

## Auditability
Audit logs should capture actor, organization, action, entity, timestamp, and metadata. Avoid storing secrets or unnecessary personal data in metadata.

## Phase 1 next implementation tasks
1. Wire Supabase sign-in/sign-out and protected routes.
2. Implement transactional organization onboarding.
3. Invite users and assign membership roles.
4. CRUD departments.
5. Audit log write helper.
6. Add automated RLS tenant-isolation tests.
7. Configure CI build checks.
