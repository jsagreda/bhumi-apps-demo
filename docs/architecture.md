# Architecture notes

This document expands on the design of the Bhumi Yoga studio operating system.
It is a faithful description of the production architecture; the public repo
ships sanitized config and fictional data.

## Principle: one source of truth

The whole system is built around a single Firestore database shared by four
client apps. There is **no custom backend server** — clients talk to Firebase
directly, and all authorization lives in Firestore Security Rules. This keeps
the stack small and the data consistent: there is exactly one record for a
student, one for a booking, one for a transaction.

## Data flow: a class, end to end

1. A **student** signs in to the **Calendar** (Google or phone OTP) and books a
   class. This creates an `agendamientos` document and atomically increments the
   matching `slots` counter inside a Firestore transaction, so capacity can
   never be exceeded even under concurrent bookings.
2. An **instructor** opens the **Studio Manager**, sees the session, and marks
   attendance. The attended date is appended to the student's `fechas[]` array
   on their `students` document.
3. The **admin** opens the **ERP**. The same `students` data drives package
   revenue and instructor payroll; store sales and expenses are recorded as
   `transactions`, and dashboards compute KPIs (excluding transfers and
   opening-balance adjustments).

No data is retyped between these steps — each app is a different view and set of
permissions over the same records.

## Authentication & roles

- **Students** authenticate through the Calendar and receive a `student` role in
  `userProfiles`.
- **Admins/instructors** are identified by their studio email domain, checked
  both in `firestore.rules` and in an `INSTRUCTOR_NAMES` map in each app's
  `firebase.ts`.
- Every app waits for `onAuthStateChanged` to resolve before starting Firestore
  listeners.

## Packages & attendance

Packages use numeric tiers (e.g. 1, 4, 6, 8, 12, and an unlimited tier).
Attendance is stored as an array of date strings on the student document. On
renewal, the previous dates are archived into `historialFechas` and the renewal
is logged for auditing. Validity defaults to 30 days and is computed from the
start date when no explicit end date exists.

## Deployment

All four apps deploy to a single Firebase project across four Hosting sites
(public web, calendar, studio manager, ERP). The React apps are built with Vite;
the Calendar and Public Web are static and ship as-is.

A documented git workflow (feature → develop → main) gates production releases,
and built ERP output must be recompiled before deploy because it is not tracked
in version control.
