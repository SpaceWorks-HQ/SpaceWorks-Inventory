# Roles and permissions

[Documentation index](README.md)

Every membership in a space has one role. Roles are ordered
**Owner > Admin > Inventory manager > Staff > Member**; each role can do
everything the roles below it can. The rules live in `lib/roles.ts`
(`ROLE_MATRIX`); every page, Server Action and API endpoint checks them on the
server. Hiding a button is never the only check.

- **Member**: borrows. Browses the catalogue, requests loans, renews and
  cancels their own, self-checks out when the space allows it.
- **Staff**: runs the desk. Approves loan requests, issues and receives
  returns with scans and photos, counts stock, dispatches and receives
  transfers, prints labels, takes cash or bank payments, waives fees and
  returns deposits.
- **Inventory manager**: runs the stock. Edits the catalogue, locations and
  assets, adjusts and receives stock, approves transfers out of the space,
  starts and posts cycle counts, resolves lost or damaged items, sets a
  member's borrowing standing, sees reports and exports, imports
  spreadsheets and owns the inventory settings (thresholds, labels, transfer
  approvals, count schedules, categories, units and suppliers).
- **Admin**: runs the space. Members and invitations, space settings
  (general, lending policy, eligibility, evidence rules, fees, notifications,
  transfers between spaces, branding), payment providers, API keys,
  webhooks and the audit log.
- **Owner**: everything, plus deleting the space and transferring
  ownership. A space always keeps one active owner.

Owners assign any role; admins assign Inventory manager, Staff and Member,
and never act on other admins or owners.

Borrowing standing is separate from the role: a member (of any role) is
**Can borrow**, **Restricted** (automatically while an incident is open or a
loan is overdue, per space setting, or set by a manager) or **Suspended**
(set by a manager). Restricted and suspended members cannot request,
self-check out or be issued loans.

The instance admin (the account created by the setup wizard, or the
`SUPER_ADMIN_EMAIL` account) manages spaces, users and instance settings at
`/admin` behind a fresh authenticator step-up. It is not a space role.

## Matrix

<!-- BEGIN:role-matrix (generated from lib/roles.ts; tests/unit/rbac-doc.test.ts checks it) -->
| Capability | Owner | Admin | Inventory manager | Staff | Member |
| --- | :-: | :-: | :-: | :-: | :-: |
| Browse the catalogue and request loans | Yes | Yes | Yes | Yes | Yes |
| View stock, locations and every loan | Yes | Yes | Yes | Yes | — |
| Approve loan requests | Yes | Yes | Yes | Yes | — |
| Issue and receive returns | Yes | Yes | Yes | Yes | — |
| Count stock | Yes | Yes | Yes | Yes | — |
| Request, dispatch and receive transfers | Yes | Yes | Yes | Yes | — |
| Print QR labels | Yes | Yes | Yes | Yes | — |
| Edit the catalogue and assets | Yes | Yes | Yes | — | — |
| Edit locations | Yes | Yes | Yes | — | — |
| Adjust and receive stock | Yes | Yes | Yes | — | — |
| Start and post cycle counts | Yes | Yes | Yes | — | — |
| Approve transfers | Yes | Yes | Yes | — | — |
| Resolve lost or damaged items, set member access | Yes | Yes | Yes | — | — |
| Reports, valuation and exports | Yes | Yes | Yes | — | — |
| Bulk import and sample data | Yes | Yes | Yes | — | — |
| Inventory settings (thresholds, labels, transfer approvals, count schedules) | Yes | Yes | Yes | — | — |
| Take payments, waive fees, return deposits | Yes | Yes | Yes | Yes | — |
| Lending policy, fees and payment providers | Yes | Yes | — | — | — |
| Members and invitations | Yes | Yes | — | — | — |
| API keys and webhooks | Yes | Yes | — | — | — |
| Audit log | Yes | Yes | — | — | — |
| Space settings | Yes | Yes | — | — | — |
| Delete the space or transfer ownership | Yes | — | — | — | — |
<!-- END:role-matrix -->

## API keys

An API key belongs to a space and acts for the admin who created it, limited
to its scopes (`lib/apiTokens/scopes.ts`). It stops working when it is
revoked, expires, or its creator is no longer an active admin or owner.
