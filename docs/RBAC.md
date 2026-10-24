# Roles and permissions

[Documentation index](README.md)

Every membership in a space has one role. Roles are ordered
**Inventory manager > Staff > Member**, plus **Technician**; each of the first
three can do everything the roles below it can. There is no separate admin or owner role (owner decisions,
2026-10-24, [DECISIONS.md](DECISIONS.md)). The rules live in `lib/roles.ts`
(`ROLE_MATRIX`); every page, Server Action and API endpoint checks them on the
server. Hiding a button is never the only check.

- **Member**: borrows. Browses the catalogue, requests loans, renews and
  cancels their own, self-checks out when the space allows it.
- **Staff**: runs the desk. Approves loan requests, issues and receives
  returns with scans and photos, counts stock, dispatches and receives
  transfers, prints labels, takes cash or bank payments, waives fees and
  returns deposits.
- **Inventory manager**: runs the space. Edits the catalogue, locations and
  assets, adjusts and receives stock, approves transfers out of the space,
  starts and posts cycle counts, resolves lost or damaged items, sets a
  member's borrowing standing, sees reports and exports, imports
  spreadsheets, and owns every setting (general, lending policy,
  eligibility, evidence rules, fees, notifications, transfers between
  spaces, branding, thresholds, labels, count schedules, categories, units
  and suppliers), payment providers, members and invitations, API keys,
  webhooks, the audit log and deleting the space. Only inventory managers see
  money: the Finance page, money reports and exports, spend columns, repair
  amounts and payouts.
- **Technician**: repairs only, and needs an authenticator app. Sees the
  repairs sent to them, accepts or declines, records fix notes, photos, parts
  and the amount they ask, and sees whether it is paid. Nothing else in the
  space (ranked below Member, so no member page opens for them). External
  technicians have no account: each repair request gets them a private link.

Whoever creates a space (the setup wizard, or the instance admin naming a
manager under `/admin`) becomes its first inventory manager. Managers assign
every role and manage everyone, other managers included. A space always keeps
at least one active inventory manager: demoting, suspending or removing the
last one, or the last one leaving, is refused inside a transaction that locks
the manager rows (`lib/membership.ts`).

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
| Capability | Inventory manager | Staff | Member | Technician |
| --- | :-: | :-: | :-: | :-: |
| Browse the catalogue and request loans | Yes | Yes | Yes | — |
| View stock, locations and every loan | Yes | Yes | — | — |
| Approve loan requests | Yes | Yes | — | — |
| Issue and receive returns | Yes | Yes | — | — |
| Count stock | Yes | Yes | — | — |
| Request, dispatch and receive transfers | Yes | Yes | — | — |
| Print QR labels | Yes | Yes | — | — |
| Edit the catalogue and assets | Yes | — | — | — |
| Edit locations | Yes | — | — | — |
| Adjust and receive stock | Yes | — | — | — |
| Start and post cycle counts | Yes | — | — | — |
| Approve transfers | Yes | — | — | — |
| Resolve lost or damaged items, set member access | Yes | — | — | — |
| Reports, valuation and exports | Yes | — | — | — |
| Bulk import and sample data | Yes | — | — | — |
| Inventory settings (thresholds, labels, transfer approvals, count schedules) | Yes | — | — | — |
| Take payments, waive fees, return deposits | Yes | Yes | — | — |
| Lending policy, fees and payment providers | Yes | — | — | — |
| Members and invitations | Yes | — | — | — |
| API keys and webhooks | Yes | — | — | — |
| Audit log | Yes | — | — | — |
| Space settings | Yes | — | — | — |
| Report a damaged or broken item | Yes | Yes | Yes | — |
| See every repair (without amounts) | Yes | Yes | — | — |
| Work on repairs sent to them | Yes | Yes | — | Yes |
| Technicians, repair requests, verifying fixes | Yes | — | — | — |
| Approve and pay repair amounts | Yes | — | — | — |
| Finance: ledger, money reports and exports | Yes | — | — | — |
| Delete the space | Yes | — | — | — |
<!-- END:role-matrix -->

## API keys

An API key belongs to a space and acts for the inventory manager who created
it, limited to its scopes (`lib/apiTokens/scopes.ts`). It stops working when
it is revoked, expires, or its creator is no longer an active inventory
manager.
