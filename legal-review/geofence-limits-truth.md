# Geofence radius limits — code truth

Investigation answering the Privacy Policy note A5 question: is there
a product constraint on maximum geofence radius, and if so where is
it enforced (schema, code, or UI)?

## Answer: **There is NO enforced maximum.**

There is a **default** of 200 metres. There is **no minimum** other
than "positive integer" (implied by the `integer` column type; in
practice PostgreSQL accepts 0 and negatives). There is **no maximum**
enforced at the schema level, at the API level, or at the UI level.

## Evidence

### Schema layer (`src/db/schema.ts`)

```ts
geofence_radius_metres: integer('geofence_radius_metres').default(200),
```

- Type: `integer` — any 32-bit integer is accepted (theoretical
  range −2,147,483,648 to 2,147,483,647 metres).
- Default: `200`.
- No `CHECK` constraint. `pg_constraint` on the `sites` table would
  show it; none defined.
- No range-restriction RLS policy.

### API layer (`src/app/api/command/sites/route.ts`)

POST body:

```ts
geofence_radius_metres?: string;
```

Insert:

```ts
geofence_radius_metres: body.geofence_radius_metres
  ? parseInt(body.geofence_radius_metres)
  : 200,
```

- `parseInt` returns `NaN` on garbage input; `NaN` passed to Postgres
  becomes `NULL`, not a validation error.
- No minimum or maximum check.
- No `z.number().min(...).max(...)` wrapper.
- `src/lib/schemas/index.ts` has no schema for site creation —
  therefore no Zod range validation on the server.

### UI layer (`src/app/(command)/command/sites/page.tsx`)

Input element:

```tsx
<input type="number" ... name="geofence_radius_metres" placeholder="200" />
```

- `type="number"` only constrains to numeric input; it does not set
  `min` or `max` attributes.
- Placeholder `200` is advisory; no hard ceiling enforced.
- The React form state `NewSiteForm.geofence_radius_metres: string`
  is passed through without a validation function.

### Runtime behaviour in `useGeofenceWatch`

The radius value is consumed by `src/lib/intelligence/useGeofenceWatch.ts`
as `site.geofence_radius_metres` passed to `checkGeofence({ siteRadiusMetres })`.
Larger values simply make the "inside geofence" test pass in a wider
area. There is no safety cap at the consumer end either.

### Default enforcement

The default `200` appears in three places:

1. `src/db/schema.ts` — column `default(200)`.
2. `src/app/api/command/sites/route.ts` — fallback when body omits.
3. `src/app/(command)/command/sites/page.tsx` — form `emptyForm`
   value `'200'` + placeholder text `'200'`.

If an admin leaves the field blank in the form, the browser sends
empty string → the API defaults to `200`. If the admin types any
other number, that number passes through unchecked.

## Summary for the Privacy Policy

| Claim to check | Code-truth |
|---|---|
| "Geofence radius defaults to 200 metres." | **True.** |
| "We cap the geofence radius at N metres." | **False** — there is no cap. |
| "The minimum radius is M metres." | **False** — no enforced minimum. A malicious or mistaken admin could set radius to 0 (no one ever inside) or to `1e9` (everyone always inside). |
| "A site's geofence is confined to the work location." | **Currently only by admin honour-system.** The policy can claim intent, but cannot claim an enforced technical boundary. |

## Implied risks (stated, not remediated)

- An admin could set radius to 100,000 m (100 km) to match any worker's
  arrival across a whole metropolitan area — effectively disabling
  the geofence's privacy-protective effect.
- An admin could set radius to 1 m, making geofence detection fail
  and forcing all workers onto manual EOD entry.
- Audit trail: radius changes **are not logged** — `admin_access_log`
  is not written when `POST /api/command/sites` runs. That's a Day 2
  instrumentation gap (distinct from this legal-truth question).

## Recommendation for Lauren (out of scope for this doc, flagged for Day 3)

Three policy-relevant controls worth adding:
1. Server-side validation: `geofence_radius_metres` must be between
   50 and 1,000 metres (tight enough to keep the Privacy Policy
   claim meaningful, loose enough for genuine large-site cases).
2. UI attribute: `<input type="number" min="50" max="1000" />`.
3. `admin_access_log` row written on every `sites` INSERT/UPDATE
   with the new radius recorded, so later audits can prove the
   radius was set within bounds.

None of these are done yet.
