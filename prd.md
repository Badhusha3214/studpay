# StudPay — Admin Panel & Seller Order Listing
## Product Requirements Document

**Product:** StudPay (NFC-based School Canteen Payment System)
**Author:** Badhusha, DevMorphix IT Solutions
**Status:** Draft
**Version:** 0.1
**Date:** July 12, 2026

---

## 1. Background

StudPay currently supports NFC tap-to-pay for students, parent-managed wallets with daily spending limits and an emergency fund, allergy flags at checkout, and parent-approval holds for junk-food purchases by younger students. The system runs across three apps: `backend` (Express + Postgres/Supabase), `frontend` (Ionic Vue, student/parent facing), and `cashier` (Ionic Vue, shop-owner facing).

There is currently no interface for a school to manage its own data (students, shops, cashiers) without direct database access, and no way for a shop owner to review their own transaction history. Both are required before StudPay can be handed to a second school or sold as a product rather than run as a one-off deployment.

## 2. Goals

- Give each school a self-service Admin Panel so onboarding and day-to-day management don't require developer involvement.
- Give shop owners/cashiers visibility into their own sales via an Order Listing view.
- Lay the groundwork for multi-school (multi-tenant) operation, even if only one school uses it today.

### Non-goals (for this phase)

- Super-admin / cross-school DevMorphix ops console (future phase).
- Billing/subscription management.
- Native mobile admin app — web-responsive is sufficient.

## 3. Users

| Role | Description | Primary surface |
|---|---|---|
| School Admin | Office staff/principal managing the school's StudPay deployment | Admin Panel |
| Shop Owner / Cashier | Runs a canteen/shop counter, processes taps | Cashier app, new Orders tab |
| Parent | Existing user, wallet + approvals | Frontend app (unchanged) |
| Student | Existing user, wallet | Frontend app (unchanged) |

## 4. Scope

### 4.1 School Admin Panel

**4.1.1 Dashboard**
- Total wallet balance across all students (sum, not per-student detail)
- Today's transaction volume (count + amount)
- Active vs inactive card count
- Pending parent-approval holds count (link to detail)

**4.1.2 Student Management**
- List/search/filter students (by grade, status, name, card ID)
- Add student (manual form)
- Bulk import via CSV (template provided; validates rows, reports errors per row, doesn't partially commit on failure)
- Edit student: grade, daily spend limit, transaction count limit, allergies, guardian contact
- Deactivate/reactivate student (soft delete, preserves transaction history)
- View individual student wallet: balance, emergency fund balance, recent transactions

**4.1.3 Shop & Cashier Management**
- Add/edit shop (name, location/counter, active status)
- Add/edit cashier accounts, assign to a shop
- Deactivate a cashier account (e.g., staff turnover) without deleting historical orders

**4.1.4 Parent Approval Oversight**
- List of pending purchase holds (grade ≤ 5 junk-food flow), with time-in-queue
- Ability to see holds that have timed out or been rejected, for pattern-spotting

**4.1.5 Reports**
- Daily/weekly/custom-range spending report, filterable by shop/grade
- Export as CSV
- Emergency fund usage report — which students/families are drawing on it frequently

**4.1.6 Access Control**
- Admin login separate from student/parent/cashier auth, same JWT/Supabase mechanism
- Single role for v1 (School Admin); no need for sub-roles yet

### 4.2 Seller Order Listing (Cashier app)

**4.2.1 Order List**
- Table/list of orders scoped to the logged-in cashier's shop only
- Columns: timestamp, student name or masked ID (configurable per school's privacy preference), item(s), amount, status (completed / pending approval / rejected / refunded)
- Filter by date range and status
- Search by student name
- Cursor-based pagination

**4.2.2 Live Updates**
- New orders appear without manual refresh (polling every 5–10s is acceptable for v1; WebSocket is a future optimization)

**4.2.3 Daily Summary Strip**
- Today's total sales, transaction count, pending approvals — shown above the list

**4.2.4 Refund / Dispute Flow**
- Cashier can flag/reverse a transaction
- Reversal writes an audit log entry (who, when, original amount, reason)
- Refunds above a configurable threshold require School Admin approval (queued, not instant)

**4.2.5 Export**
- CSV export of the current filtered view, for the shop owner's own bookkeeping

## 5. Data Model Changes

### New: `orders` table
One row per purchase — separate from wallet ledger entries, so seller-facing queries and financial reconciliation don't collide.

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| shop_id | uuid | FK → shops |
| student_id | uuid | FK → students |
| cashier_device_id | uuid | which device processed it |
| items | jsonb | line items |
| amount | numeric | |
| status | enum | completed, pending_approval, rejected, refunded |
| approved_by | uuid, nullable | parent/admin who approved a held purchase |
| created_at | timestamptz | |
| refunded_at | timestamptz, nullable | |
| refund_reason | text, nullable | |

### New: `shops` table (if not already present)
`id, name, location, school_id, active`

### New: `audit_log` table
`id, actor_id, actor_role, action, entity, entity_id, before, after, created_at` — every wallet mutation and refund gets an entry here. Needed for parent disputes and admin accountability.

### Existing tables
- `students` — already has allergies, daily limits; add `school_id` if not present, for multi-tenancy.
- Wallet ledger — remains separate from `orders`; `orders.id` referenced from ledger entries where applicable.

## 6. API Additions

| Method | Route | Purpose |
|---|---|---|
| GET | `/admin/dashboard` | summary stats |
| GET | `/admin/students` | list/search/filter |
| POST | `/admin/students` | add student |
| POST | `/admin/students/bulk-import` | CSV import |
| PATCH | `/admin/students/:id` | edit/deactivate |
| GET | `/admin/shops` | list shops |
| POST | `/admin/shops` | add shop |
| POST | `/admin/cashiers` | add cashier account |
| PATCH | `/admin/cashiers/:id` | edit/deactivate |
| GET | `/admin/approvals` | pending/timed-out/rejected holds |
| GET | `/admin/reports/spending` | date range + filters, CSV export |
| GET | `/shop/orders` | seller-scoped, filter/paginate |
| PATCH | `/shop/orders/:id/refund` | initiate refund |
| GET | `/shop/orders/export` | CSV export, current filters |

All `/shop/*` routes must verify the authenticated cashier's `shop_id` matches the requested resource — no cross-shop data access.
All `/admin/*` routes must verify the authenticated admin's `school_id` matches the requested resource — no cross-school data access.

## 7. Non-Functional Requirements

- **Security:** admin and cashier routes rate-limited; refunds and student edits write to `audit_log`; allergy data restricted to roles that need it at checkout, not exposed via general list endpoints.
- **Multi-tenancy readiness:** every new table carries `school_id` (directly or via `shop_id`/`student_id`), even though v1 ships to one school, so a second school doesn't require a schema migration.
- **Performance:** order list must stay responsive past 10k+ rows per shop — cursor pagination, indexed on `(shop_id, created_at)`.
- **Data correctness:** refund and order-status transitions wrapped in DB transactions to prevent double-refunds or race conditions with concurrent cashier taps.

## 8. Open Questions

1. Should student names be fully visible to cashiers, or masked (e.g., first name + last initial) for privacy? Depends on school preference — consider making this a per-school setting.
2. Refund approval threshold — flat amount, or percentage of student's daily limit?
3. Does School Admin need multiple sub-accounts (e.g., office staff vs principal) in v1, or is a single admin login sufficient for now?
4. CSV import — is there an existing student data source (school ERP/SIS) to map the template against, or is this fully manual for now?

## 9. Milestones (suggested)

| Phase | Deliverable |
|---|---|
| 1 | `orders` + `audit_log` tables, `/shop/orders` routes |
| 2 | Seller Order Listing UI in `cashier` app |
| 3 | Admin backend routes (students, shops, cashiers) |
| 4 | Admin Panel UI — dashboard, student management |
| 5 | Reports, CSV export, refund approval flow |
| 6 | Parent approval oversight view |

## 10. Success Criteria

- A school admin can onboard a new student, deactivate a lost card, and pull a weekly spending report without contacting DevMorphix.
- A shop owner can see today's orders and issue a refund without needing database access.
- No cross-shop or cross-school data leakage in any new endpoint.

---

## 11. Code Quality & Infrastructure Fixes (July 2026)

The following issues were identified during a full project audit and have been resolved:

### 11.1 Security

| Issue | Fix |
|---|---|
| `.env` / `.dev.vars` with real secrets (DB password, JWT secret, Supabase keys) were in the repo | Created `.env.example` and `.dev.vars.example` templates with placeholder values. Updated `.gitignore` to exclude these files. **Action required:** rotate all exposed credentials immediately. |
| Hyperdrive binding ID was a placeholder (`REPLACE_WITH_REAL_HYPERDRIVE_ID`) | Added setup instructions in `wrangler.toml` comments. Replace with real ID before deploying. |
| Stale `studpay.db` SQLite file committed | Deleted. The app now uses PostgreSQL exclusively. |

### 11.2 Multi-Tenancy Enforcement

| Issue | Fix |
|---|---|
| `school_id` column existed on tables but no route filtered by it — cross-school data leakage possible | Added `school_id` filtering to all admin routes: `/admin/dashboard`, `/admin/analytics/overview`, `/admin/shops`, `/admin/staff`, `/admin/approvals`, `/admin/refunds`, `/admin/reports/spending`, `/admin/reports/emergency-fund`. Also added filtering to `/students` and `/nfc/cards` list endpoints. |
| No `getSchoolId()` helper | Added to `middleware/auth.js` — extracts `school_id` from the JWT payload. |
| Seed data lacked `school_id` | All demo users now have `school_id = 'school-demo-001'`. |
| New shop creation didn't set `school_id` | `POST /admin/shops` now writes the admin's `school_id` to the new shop row. |

### 11.3 Database Performance

| Issue | Fix |
|---|---|
| `family.js` (`getChildrenFor`, `getParentFor`) did full table scans of `students` filtering in JavaScript | Rewrote to use SQL queries with `WHERE surname = ? AND lower(split_part(email, '@', 2)) = ?`. |
| No index on surname + email domain for family lookup | Added `idx_students_surname_domain` partial index on `students(surname, lower(split_part(email, '@', 2)))`. |
| Added `surname` column with auto-population trigger | New column on `students` table; a `BEFORE INSERT OR UPDATE` trigger extracts the last word from `name` and lowercases it. |
| Missing indexes for common query patterns | Added: `idx_students_role_active`, `idx_students_school_id`, `idx_shops_school_id`, `idx_transactions_student_type`, `idx_cards_uid_active`. |

### 11.4 Frontend Error Handling

| Issue | Fix |
|---|---|
| 28 `try/finally` blocks across 12 views had no `catch` — API failures caused silent unhandled promise rejections | Added `catch (err) { console.error(...) }` to all 28 instances across: `HistoryView`, `admin/AnalyticsView`, `admin/ApprovalsView`, `admin/DashboardView`, `admin/RefundsView` (3x), `admin/StudentsView` (5x), `admin/StaffAccountsView` (4x), `admin/ShopsView` (3x), `admin/CardsView` (2x), `admin/ReportsView` (3x), `cashier/OrdersView` (3x), `cashier/DashboardView`. |

### 11.5 Linting & Formatting

| What | Details |
|---|---|
| ESLint (backend) | `.eslintrc.json` — extends `eslint:recommended`, warns on `no-console` and `no-unused-vars`. |
| ESLint (frontend) | `.eslintrc.json` — extends `vue3-recommended` + `@typescript-eslint/recommended`. |
| Prettier (both) | `.prettierrc` — single quotes, trailing commas, 120 char width, LF line endings. |
| Lint scripts | `npm run lint` and `npm run lint:fix` added to both `package.json` files. |
| Format scripts | `npm run format` added to both `package.json` files. |

### 11.6 CI/CD

| What | Details |
|---|---|
| GitHub Actions | `.github/workflows/ci.yml` — runs on push to `main`/`develop` and PRs to `main`. |
| Jobs | `backend-lint`, `frontend-lint`, `frontend-typecheck` (`vue-tsc --noEmit`), `frontend-build`. |
| Node version | Pinned to `22` across all jobs. |

### 11.7 Test Framework

| What | Details |
|---|---|
| Vitest | Added to both `backend/package.json` and `frontend/package.json` as a dev dependency. |
| Config | `frontend/vitest.config.ts` — jsdom environment, `@` alias, globals enabled. |
| Scripts | `npm run test` (single run) and `npm run test:watch` (watch mode) in both packages. |
| Test location | `src/**/*.{test,spec}.{ts,js}` — no tests written yet, but the framework is ready. |

### 11.8 Remaining Items

| Item | Status |
|---|---|
| Capacitor iOS | Not added. The `frontend/package.json` has an `ios` script, but generating the native project requires running `npx cap add ios` locally (needs Xcode). |
| Real test coverage | Vitest is configured but no test files exist yet. Priority: wallet transaction tests, auth middleware tests, family lookup tests. |
| PRD Open Questions (§8) | Still unresolved — need product decisions on student name masking, refund thresholds, admin sub-accounts, and CSV import mapping. |