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

## Security Notes
- Lab/member credentials are now stored as hashed credential records (PBKDF2-SHA256) instead of plaintext.
- Legacy plaintext credentials are auto-migrated to hashed format after a successful login.
- You still need strict Firestore security rules for production.

## Data and Performance Notes
- Member booking stream is scoped to a rolling date window around the current view, not full-history.
- Booking writes/cancels are transaction-based and maintain per-slot aggregate docs for safer concurrency.
- Admin logs are read only for the recent 2 months in UI.
- Long-term log retention cleanup should run on backend scheduler (Cloud Function/cron), not in client UI.
- Optional profiling in development:
  - Enable: `localStorage.setItem('booking_perf_debug', '1')`
  - Disable: `localStorage.removeItem('booking_perf_debug')`
  - Recent measurements are stored in `localStorage.booking_perf_events`.

## Recommended Next Backend Step
- Add a scheduled cleanup job to physically delete logs older than 2 months.
