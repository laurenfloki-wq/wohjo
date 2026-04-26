# GPS capture — code truth

Code-truth investigation answering the Privacy Policy note A1
questions. Every claim below is backed by a file+line citation to
the WOHJO source tree as of 2026-04-22.

## Q1. Does the app request "always allow" / "background" location, or only "while using"?

**Only "while using".** The app never requests background or "always
allow" location.

Evidence:
- **No native mobile app exists.** WOHJO Field is a browser PWA
  (`src/app/manifest.ts`; `display: 'standalone'`). iOS and Android
  browsers expose only "while using" to web pages; "always allow" is
  a native-app permission and is unreachable from web code.
- **Permission request code** uses the web `Permissions API`
  without any background extension. See `src/app/(field)/field/home/page.tsx:149`:
  ```ts
  const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
  ```
  and the one-shot probe at `src/app/(field)/field/home/page.tsx:198`:
  ```ts
  navigator.geolocation.getCurrentPosition(
  ```
  Neither `getCurrentPosition` nor `watchPosition` has an "always"
  flag in the web spec. Mobile browsers map both to
  "while using / foreground only".
- **No `navigator.permissions.request({ name: 'background-geolocation' })`**
  or similar opt-in to background. Grep returns zero matches.

## Q2. Is GPS captured only at clock events, or at other times?

**GPS is captured continuously ONLY while the /field/home page is in
the foreground AND the user has an active shift-in-progress state.**
It is NOT captured while the tab is backgrounded, when the page is
closed, on other /field/* sub-routes, or outside a session.

Evidence:
- The sole `watchPosition` invocation in the codebase is in
  `src/lib/intelligence/useGeofenceWatch.ts:71` inside a React hook
  that only mounts on `src/app/(field)/field/home/page.tsx` (no other
  page imports `useGeofenceWatch`).
- The hook short-circuits if permission isn't granted OR no site is
  set: `useGeofenceWatch.ts:58`:
  ```ts
  if (!permissionGranted || !site || typeof navigator === 'undefined') return;
  ```
- When the page unmounts (tab close, route change, backgrounding for
  longer than the browser's inactive-page timer), React runs the
  cleanup effect at `useGeofenceWatch.ts:137`:
  ```ts
  return () => navigator.geolocation.clearWatch(watchId);
  ```
  which cancels the watcher.
- **Boundary-only detection:** the watcher records a geofence event
  exactly once per session and bails on all subsequent callbacks via
  the `detectedThisSessionRef` guard at `useGeofenceWatch.ts:73`:
  ```ts
  if (detectedThisSessionRef.current) return;
  ```
  and `:119`:
  ```ts
  detectedThisSessionRef.current = true;
  ```

**Separately, GPS coordinates are captured at clock events** via
optional body fields `gps_lat`, `gps_lng`, `gps_accuracy_metres` on
`POST /api/field/shift/start` (route.ts:29–32) and `POST
/api/field/shift/end` (route.ts:21–23, 30–32). Those values come from
the page's `getCurrentPosition` call, not from the watcher. All three
fields are optional; the route inserts `null` if absent
(`shift/start/route.ts:68–69`, `shift/end/route.ts:117–119`).

## Q3. Are there any location-based background tasks, geofence-entry listeners, or continuous trackers?

**Background tasks: NO.** `grep -rn "serviceWorker\|BackgroundSync"
src/` returns zero matches. There is no service worker background
sync wired to geolocation.

**Geofence-entry listeners: NO native OS listeners.** The "geofence"
is implemented purely in JavaScript inside `useGeofenceWatch`; it
takes `navigator.geolocation.watchPosition` callbacks and runs a
haversine distance check against the site's stored lat/lng. The
iOS/Android OS-level `GeofencingClient` API is not used (not
available from web code).

**Continuous trackers: NO continuous location capture.** `watchPosition`
is the only stream subscription, and it is short-circuited by
`detectedThisSessionRef` after the first valid detection
(`useGeofenceWatch.ts:73`). After that first detection, callbacks
fire but immediately return; no further persistence or network calls
happen. The watcher is cleaned up when the page unmounts.

**Visibility/pagehide:** `grep -rn "visibilitychange\|pagehide"
src/` returns zero matches. There is no hook that restarts or
resumes location capture after the page is backgrounded and
re-foregrounded.

## Q4. What data is sent and where?

When the geofence boundary is crossed (once per worker-day), the
following row is written to the `geofence_events` Supabase table
(`useGeofenceWatch.ts:103–114`):

| Column | Value |
|---|---|
| `worker_id` | Worker's Supabase row id |
| `site_id` | Site's Supabase row id |
| `detected_at` | ISO timestamp of the crossing |
| `lat` | Latitude at moment of crossing |
| `lng` | Longitude at moment of crossing |
| `accuracy_metres` | Horizontal accuracy in metres |
| `confidence` | `'HIGH' \| 'MEDIUM' \| 'LOW'` (never `'LOW'` gets written — filtered at line 86) |
| `synced_from_offline` | boolean |

That's the ONLY row written. No continuous trail, no breadcrumbs, no
path history.

## Q5. What does the user see before GPS is captured?

The user hits `/field/home` which renders state `PERMISSION`
(`src/app/(field)/field/home/page.tsx:102, 305–310`). That state
renders `PermissionState` (line 336), which shows:

- A primary button `Allow Location Access` that calls
  `getCurrentPosition`.
- A secondary button `Enter times manually` that bypasses location
  entirely.
- Explanatory copy at line 342:
  > "FLOSTRUCTION needs your location to automatically detect when
  > you arrive on site each morning."
- And at line 344:
  > "Your location is only used to record your arrival time. It is
  > never tracked or shared outside your shift record."

After permission is granted, the page transitions to IN_PROGRESS
state and mounts `useGeofenceWatch`. There is no dark pattern,
auto-click, or silent escalation of the permission scope.

## Summary for the Privacy Policy

| Claim | Code-truth |
|---|---|
| "We only capture your location while you are using WOHJO Field in the foreground." | **True.** No background APIs used. Watcher cleaned up on unmount. |
| "We do not request 'always allow' / background location." | **True.** `navigator.permissions.query({ name: 'geolocation' })` — no background scope. |
| "We record your location exactly once per day, when you arrive at site." | **True.** `detectedThisSessionRef` guard + one-event-per-day DB check at `useGeofenceWatch.ts:89–96`. |
| "We additionally record your location at the moment you clock in or out." | **True.** Optional GPS fields on `POST /api/field/shift/{start,end}`. |
| "We never record a continuous location trail." | **True.** No trail storage; only discrete geofence crossings + clock events. |
| "We never share your location with third parties." | **Partially verifiable from code.** Data goes to Supabase (our DB); not to any third-party analytics. Subprocessor list in `legal-review/subprocessor-truth.md` confirms this boundary. |

**No ambiguity found.** The code matches a narrow, consent-forward,
foreground-only, boundary-triggered GPS model.
