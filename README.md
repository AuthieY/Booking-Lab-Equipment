# Lab Equipment Booking App

Mobile-first React + Firebase app for booking lab instruments with:
- Multi-instrument overview calendar
- Single-instrument day/week calendar
- Conflict-aware booking
- Quantity-based booking
- Admin instrument management, notebook, and logs

## Tech Stack
- React 18 + Vite
- Firebase Auth (anonymous) + Firestore
- TailwindCSS + custom design system tokens

## Setup
1. Create a `.env` file (optional, app has current fallback values):
```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
VITE_APP_ID=booking-lab
```
2. Install dependencies and run:
```bash
npm install
npm run dev
```

## Tests
```bash
npm test
```
Current tests cover local-date handling and booking slot expansion rules.

## Security Model
Authorization is enforced by Firestore security rules via proof-of-password memberships:
- Passwords never leave the browser. Logging in derives a PBKDF2-SHA256 proof and writes a
  `memberships/{labName__uid}` doc; rules accept it only if the proof matches the lab's
  secret in `lab_secrets` / `lab_user_secrets` — collections no client can ever read
  (this is what prevents offline brute-force).
- Every read and write of lab data (instruments, bookings, aggregates, notes, logs) requires
  a membership in that lab; instrument management and report/booking cleanup require the
  ADMIN role; bookings, notes, and logs must carry the membership's verified `userName`.
- Legacy labs and lab users (readable credential records) are migrated automatically on
  first login: rules force every migrated value to be derived from the stored records, so
  the migration cannot be abused to inject attacker-controlled secrets.
- The rules are covered by an emulator test suite: `npm run test:rules` (requires Java for
  the Firestore emulator; firebase-tools 13.x runs on Java 11).

### Deploying the rules
```bash
firebase deploy --only firestore
```
Notes for the switchover:
- Existing signed-in sessions become invalid once the rules deploy; the app detects the
  permission error and returns users to the sign-in gate. Signing in again migrates each
  lab/user to the new format automatically.
- Labs or lab users still on plaintext pins (never signed in since hashed credentials
  shipped) cannot auto-migrate: have each role sign in once BEFORE deploying, or recreate
  the lab / have an admin delete the lab user afterwards.
- Lab names cannot contain `/` (they are embedded in membership doc ids).

## Data and Performance Notes
- Member booking stream is scoped to a rolling date window around the current view, not full-history.
- Booking writes/cancels are transaction-based and maintain per-slot aggregate docs for safer concurrency.
- Member view uses a short-lived local warm-start cache (instruments/bookings) to reduce reopen latency.
- Admin logs are read only for the recent 2 months in UI.
- Long-term log retention cleanup should run on backend scheduler (Cloud Function/cron), not in client UI.
- Optional profiling in development:
  - Enable: `localStorage.setItem('booking_perf_debug', '1')`
  - Disable: `localStorage.removeItem('booking_perf_debug')`
  - Recent measurements are stored in `localStorage.booking_perf_events`.

## Recommended Next Backend Step
- Add a scheduled cleanup job to physically delete logs older than 2 months.
