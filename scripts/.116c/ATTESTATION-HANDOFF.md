# Full-graph attestation hand-off — chat-Claude verification packet

## Purpose

This packet lets chat-Claude (with live production read access) verify
that the 10 dimensions of catalog state captured in this PR's reference
files match what live production actually contains. Each dimension is
listed with: the count, the immune fingerprint, and the EXACT pg_catalog
query that produced both — paste into `psql` against production and
compare.

## Immune fingerprint formula

Engine- and collation-immune. Per-line `md5` is fixed-width hex (no
collation), sort is bytewise. Run on the query output's `line` column,
one row per line:

```javascript
md5(lines.map(md5).sort().join(''));
```

Equivalent in SQL:

```sql
SELECT md5(string_agg(md5(line), '' ORDER BY md5(line))) AS immune_fp
FROM (
  <dimension query>
) AS q(line);
```

## Per-dimension table

Every cell below is reproducible: run the SQL on live production, count
the rows, run the immune-fp aggregation. The numbers must match exactly.

| #   | dimension         | count | immune_fp                          | reference file               |
| --- | ----------------- | ----- | ---------------------------------- | ---------------------------- |
| 1   | rls_state         | 25    | `1843d3371f11986347e55a05f0815888` | `prod-rls-state.txt`         |
| 2   | policies          | 43    | `ccd794211cdf2fa27671b60731627804` | `prod-policies.txt`          |
| 3   | indexes           | 97    | `6fb867da36f7496410d136b78b3165f8` | `prod-indexes.txt`           |
| 4   | functions         | 11    | `9255453731ee2d2d343468b4a8974c6b` | `prod-functions-def.txt`     |
| 5   | triggers          | 9     | `650f3cd90b99c0193db95b13678249fc` | `prod-triggers-def.txt`      |
| 6   | defaults          | 77    | `5b96d03261a37e739b66e1eace23bd36` | `prod-defaults.txt`          |
| 7   | generated_columns | 1     | `0232ca98c88569785c391c9828968341` | `prod-generated-columns.txt` |
| 8   | view_body         | 1     | `f1d29066dc7e1d6ec333608c0941cb9d` | `prod-view-body.txt`         |
| 9   | extensions        | 4     | `bb82fb529eb9884e914dc0ad04d93442` | `prod-extensions.txt`        |
| 10  | zero_asserts      | 3     | `e9759194f8035273c9f082fbcead3383` | `prod-zero-asserts.txt`      |

## Exact pg_catalog queries

Newlines in multi-line bodies (policies, functions, triggers, view_body)
are normalised to the literal two-character sequence `\n` so each row is
one reference-file line. Use the same `replace(..., chr(10), '\n')` in
production verification.

### 1. rls_state (25)

```sql
SELECT c.relname || ' : ' || c.relrowsecurity::text || ' : ' || c.relforcerowsecurity::text AS line
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY 1;
```

### 2. policies (43)

```sql
SELECT replace(
         schemaname || '.' || tablename || ' :: ' || policyname || ' :: ' || cmd || ' :: ' ||
         coalesce(array_to_string(array(select unnest(roles) order by 1), ','), '') || ' :: ' ||
         coalesce(qual, '') || ' :: ' || coalesce(with_check, ''),
         chr(10), '\n'
       ) AS line
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY 1;
```

### 3. indexes (97)

```sql
SELECT pg_get_indexdef(i.indexrelid) AS line
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY 1;
```

### 4. functions (11)

```sql
SELECT replace(pg_get_functiondef(p.oid), chr(10), '\n') AS line
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY 1;
```

#### Per-function md5 (rebuild — for pinpoint localisation)

If the dimension-level immune_fp diverges between rebuild and live
production, run this query against live production and compare each
`(name, md5)` row to the table below. Functions whose md5 differs are
the bodies that need reconciliation.

```sql
SELECT (regexp_match(line, 'FUNCTION public\.(\w+)'))[1] AS name,
       md5(line) AS line_md5
FROM (
  SELECT replace(pg_get_functiondef(p.oid), chr(10), '\n') AS line
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
) q
ORDER BY 1;
```

Rebuild values (computed from `scripts/.116c/prod-functions-def.txt`,
the committed reference produced by CI on commit `9652624`, harness
fp `9255453731ee2d2d343468b4a8974c6b`):

| name                               | rebuild line md5                   | search_path observed                                      |
| ---------------------------------- | ---------------------------------- | --------------------------------------------------------- |
| `admins_set_updated_at`            | `1cca4138d268c1f978eea55061cb9268` | `'pg_catalog', 'public'`                                  |
| `approve_supervisor_batch`         | `96dbcca13ed48cdb9800963ff5f07ffe` | `'pg_catalog', 'public'`                                  |
| `bulk_create_workers`              | `5d076d9c7005bf0d15c38764f15af1b2` | `'public', 'extensions'`                                  |
| `current_user_company_id`          | `69fc2144c818705cdaf09e2c9c5da96e` | `'public'`                                                |
| `enforce_shift_status_transitions` | `5311f344cf73ab57b33139db4a14eaf7` | `'pg_catalog', 'public'`                                  |
| `export_finalise`                  | `663c2945afcc8cfb2052cb2940f56009` | `'public', 'extensions'`                                  |
| `process_flostruction_export`      | `01a7a8ef2780e8302030818ccb5f15fb` | `'public'`                                                |
| `provision_tenant_from_checkout`   | `97fcc66c455bd13060af711159de2ec6` | `'public'`                                                |
| `set_updated_at_now`               | `d91bdaf56f1def5438baad5d41ba0faf` | `'pg_catalog', 'public'`                                  |
| `set_worker_disputes_updated_at`   | `0099362a5381cec64887ed3ed1c4f047` | `''` (empty — already matches the dispatched target body) |
| `validate_shift_event_chain`       | `371b3e6e54df1cbefb06332fce6e966f` | `'pg_catalog', 'public'`                                  |

Helper: `scripts/.116c/inspect-functions.mjs` reproduces this table
from the committed reference file in seconds.

**2026-06-09 attestation result.** chat-Claude attested 9 of 10
dimensions clean against live production; functions diverges
(committed fp `9255453731ee2d2d343468b4a8974c6b`, live-prod target fp
`826e981f41eacc874d8280f12c22d3d9`). The dispatch identified
`set_worker_disputes_updated_at` as the diverging body and gave the
exact production form — but the rebuild already emits that exact form
(`SET search_path TO ''`, body byte-identical to dispatched target).
Run the per-function md5 query against live production and report
which row's md5 actually differs; that is the body that needs
reconciliation. No function definition is changed pre-emptively.

### 5. triggers (9)

```sql
SELECT replace(pg_get_triggerdef(t.oid), chr(10), '\n') AS line
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
ORDER BY 1;
```

### 6. defaults (77, attgenerated = '')

```sql
SELECT c.relname || ':' || a.attname || ':DEFAULT:' || pg_get_expr(d.adbin, d.adrelid) AS line
FROM pg_attrdef d
JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
JOIN pg_class c ON c.oid = d.adrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attgenerated = ''
ORDER BY 1;
```

### 7. generated_columns (1, attgenerated = 's')

```sql
SELECT c.relname || ':' || a.attname || ':STORED:' || pg_get_expr(d.adbin, d.adrelid) AS line
FROM pg_attrdef d
JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
JOIN pg_class c ON c.oid = d.adrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attgenerated = 's'
ORDER BY 1;
```

Today: `companies:abn_digits:STORED:...` only.

### 8. view_body (1)

```sql
SELECT replace(
         'public.v_anchor_verification :: ' || pg_get_viewdef('public.v_anchor_verification'::regclass, true),
         chr(10), '\n'
       ) AS line;
```

### 9. extensions (4)

```sql
SELECT extname AS line
FROM pg_extension
ORDER BY 1;
```

Expected: `pg_stat_statements`, `pgcrypto`, `plpgsql`, `uuid-ossp`.
`supabase_vault` is platform-managed and verified separately by the
drift-gate's positive assertion (out of the rebuild contract — the
extension's secrets are not rebuildable).

### 10. zero_asserts (3)

```sql
SELECT 'sequences:'    || count(*)::text AS line FROM information_schema.sequences WHERE sequence_schema = 'public'
UNION ALL
SELECT 'enum_types:'   || count(*)::text         FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e'
UNION ALL
SELECT 'domain_types:' || count(*)::text         FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'd';
```

Expected: `sequences:0`, `enum_types:0`, `domain_types:0`.

## Verification recipe

Paste this once into psql against production to verify all 10 in one
go (replace `<query>` with each of the queries above):

```sql
WITH q AS (<query>)
SELECT count(*) AS n,
       md5(string_agg(md5(line), '' ORDER BY md5(line))) AS immune_fp
FROM q;
```

If every `(n, immune_fp)` pair matches the table above, the chain is
attested: empty DB + genesis + 87 tracked migrations rebuilds to live
production exactly, across all 10 dimensions.
