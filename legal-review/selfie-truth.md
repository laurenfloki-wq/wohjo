# Selfie / camera / biometric verification — exhaustive code-truth audit

**Investigation trigger:** Lauren's urgent interrupt of Day 2 sprint
requesting exhaustive search before striking clauses from the Privacy
Policy draft (note A2) and Drafting Notes (A2, C1).

**Outcome:** **ZERO biometric capture code anywhere in the WOHJO
codebase.** Not live, not dormant, not commented-out, not conditionally
flagged. The product does not capture, process, store, or transmit any
camera data, photo, face, biometric template, or fingerprint.

## Search methodology

15 patterns searched across `src/`, `public/`, root config files,
`package.json`, and `package-lock.json`. All file types considered:
`.ts, .tsx, .js, .jsx, .json, .html, .md, .yml, .yaml, .plist, .xml,
.entitlements`. My own legal-review documents excluded from counts.

## Pattern-by-pattern results

| # | Pattern | Hits in source | Classification |
|---|---|---|---|
| 1 | `camera` / `Camera` (word boundary) | 0 | clean |
| 2 | `getUserMedia` | 0 | clean |
| 3 | `MediaStream` | 0 | clean |
| 4 | `MediaRecorder` | 0 | clean |
| 5 | `ImageCapture` | 0 | clean |
| 6 | `selfie` / `Selfie` / `SELFIE` | 0 | clean |
| 7 | `face` / `Face` (word boundary) | 0 | clean |
| 8 | `biometric` / `Biometric` | **1** | false positive — legal prose, see below |
| 9 | `expo-camera` | 0 | clean |
| 10 | `expo-image-picker` | 0 | clean |
| 11 | `react-native-camera` | 0 | clean |
| 12 | `react-native-image-picker` | 0 | clean |
| 13 | `<input type="file" accept="image/...">` / `capture="user"` / `capture="environment"` | 0 | clean |
| 14 | `NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription` | 0 | clean (no `.plist` files in repo) |
| 15 | `android.permission.CAMERA` / `READ_MEDIA_IMAGES` | 0 | clean (no `AndroidManifest.xml` in repo) |

## The single `biometric` match — classification (d) false positive

**File:** `src/app/privacy/page.tsx`
**Line:** 309
**Five-line context:**

```tsx
<p><strong>⚠️ Regulatory analysis:</strong> Under the Privacy Act 1988 (Cth), "sensitive information" is defined in s 6(1) and includes information about health, genetics, biometrics, criminal record, and sexual orientation — but does NOT explicitly include location data. GPS coordinates are therefore classified as <strong>personal information</strong> (not sensitive information) under the current Act. However:</p>
```

**Classification:** (d) false positive.

**Why:** the word "biometrics" appears once in a paragraph of legal
prose discussing the Privacy Act 1988 definition of "sensitive
information". The paragraph's purpose is to distinguish GPS
coordinates (which the product does capture) from the statutory
category of sensitive information (which includes biometrics but
which the product does NOT capture). It is a reference to the
statute's definition, not a reference to any product feature.

## No mobile native build exists

This is a separate and important finding. The audit also looked for
the mobile-platform plumbing that would be required if selfie
verification were even possible:

| Artefact | Present? | Implication |
|---|---|---|
| iOS `Info.plist` | **No** — `find` for `*.plist` returns zero files in the repo | iOS permission strings can't exist; iOS camera access is physically impossible |
| iOS `.entitlements` file | No | Same |
| `AndroidManifest.xml` | No | Android permission declarations can't exist; Android camera access is physically impossible |
| `capacitor.config.ts` / `capacitor.config.json` | No | Capacitor not installed |
| `app.json` / `app.config.js` (Expo) | No | Expo not installed |
| `cordova-plugin-*` | No | Cordova not installed |
| `react-native` package in deps | No | RN not installed |
| `expo-camera` / `expo-image-picker` / `react-native-camera` / `react-native-image-picker` | No | Camera modules absent |
| Any native build directory (`ios/`, `android/`) | No | Would be visible at repo root; isn't |

**The product is a pure web Progressive Web App** (PWA) served by
Next.js 16 on Vercel. There is no native iOS or Android shell, no
Capacitor wrapper, no Expo project. The web platform's
`navigator.mediaDevices.getUserMedia()` API is the ONLY technical
path through which camera access could ever occur — and that API is
not called anywhere in the source tree (pattern 2 above, 0 hits).

## Dependency-tree confirmation

`package.json` runtime dependencies — full list with classifier:

```
@hookform/resolvers     react-hook-form resolver — no camera
@radix-ui/react-*       accessible UI primitives — no camera
@rolldown/binding-*     bundler binding — no camera
@serwist/next           service-worker framework — no camera
@supabase/ssr           supabase auth cookies — no camera
@supabase/supabase-js   supabase client — no camera
class-variance-authority  tailwind variant util — no camera
clsx                    class-name helper — no camera
drizzle-orm             ORM — no camera
framer-motion           animation — no camera
html2canvas             ⚠ DOM→canvas rasteriser (rasterises receipt DOM, not a camera — see §7 below)
idb-keyval              IndexedDB wrapper — no camera
lucide-react            icon set — no camera
next                    framework — no camera
pino                    logger — no camera
postgres                pg driver — no camera
react / react-dom       framework — no camera
react-hook-form         form lib — no camera
resend                  email — no camera
serwist                 SW runtime — no camera
tailwind-merge          class-name helper — no camera
twilio                  SMS SDK — no camera
zod                     schema — no camera
zustand                 state mgr — no camera
```

`package-lock.json` cross-check for transitively-installed camera or
vision packages: grep for `"expo-camera"`, `"expo-image-picker"`,
`"react-native-camera"`, `"react-native-image-picker"`, `"face-api"`,
`"@mediapipe"`, `"opencv"`, `"@ionic-native"`, `"cordova-plugin-camera"`
— **zero matches**. No biometric or camera dependency is transitively
pulled in by any other package.

## What `html2canvas` actually does — §7

One-and-only place the repo produces image data is
`src/components/field/ShareReceiptButton.tsx:21-28`:

```ts
const html2canvas = (await import('html2canvas')).default;
const canvas = await html2canvas(receiptRef.current, {
  backgroundColor: '#ffffff',
  scale: 2,
  useCORS: true,
  logging: false,
});
return new Promise<Blob | null>((resolve) => {
  canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0);
});
```

`html2canvas` inspects the DOM node passed to it (the worker's
receipt card — a `<div>` of text and numbers), walks its computed
styles, and paints those styles into an off-screen `<canvas>`. The
resulting PNG is the receipt-as-picture. No camera is opened. No
user is photographed. The only pixel data involved is pixels the
browser was already painting onto the page. This is classification
(a): legitimate non-biometric use.

## Schema confirmation

No column in any production table stores image data or biometric
templates. `workers`, `supervisors`, `shifts`, `shift_events`,
`sites`, `companies`, `exports`, `admin_access_log`,
`webhook_idempotency`, `geofence_events`, `founding_leads` — none
have a `photo`, `selfie`, `avatar`, `face_encoding`, `portrait`,
`image_url`, or similarly-named column.

## Summary matrix

| Classifier the audit was asked to assign | Count |
|---|---|
| (a) legitimate non-biometric use | 1 (html2canvas receipt rasteriser) |
| (b) biometric capture code (live) | **0** |
| (c) dead code / commented out | 0 |
| (d) false positive | 1 (`biometric` word in Privacy Act discussion in Privacy Policy page) |

## Outcome for Lauren

- **Zero biometric capture code, live or dormant.**
- **Confirmed** for every search dimension specifically called out in
  the urgent brief.
- **No mobile entitlements** because there is no mobile native build.
- **No dependency-tree smuggle** — package-lock.json verified clean.

Lauren can strike the selfie/biometric clause from the Privacy Policy
draft and Drafting Notes A2 and C1 without risk of misrepresentation.
The product does not, and by current architecture cannot, capture
biometrics.

---

*This doc supersedes the earlier version (2026-04-22 morning) which
used a smaller search pattern. Previous content preserved in git
history.*
