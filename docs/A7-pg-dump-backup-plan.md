# A7 — Daily Postgres backup plan

**Status:** DRAFT only. No deploy. No secrets provisioned tonight.
**Posture:** Primary = Supabase's native PITR. Secondary = daily
`pg_dump` pushed to object storage (R2 first; S3 fallback).

## 1. Primary: Supabase built-in backup

Supabase Pro tier includes:

| Feature | Retention | How to restore |
|---|---|---|
| Point-in-time recovery (PITR) | 7 days (Pro), up to 28 days (Team) | Supabase dashboard → Database → Backups → Restore |
| Daily snapshot | 7 days (Pro) | Same place |

**Action required on Lauren's side:**
- Confirm the project is on Pro (currently shows "FREE" in the
  dashboard header — PITR is Pro-only).
- In Supabase dashboard → Project Settings → Add-ons, upgrade to Pro
  if Lauren wants PITR as the primary.
- Alternative (cheaper, still valid primary): keep on Free tier,
  rely entirely on the A7 `pg_dump` secondary below. Accept 24h RPO.

**Why we still want a secondary:** Supabase's backup is scoped to
the Supabase org; if that org is compromised or accidentally deleted,
the backups go with it. An off-platform copy (R2/S3) is the
belt-and-braces.

## 2. Secondary: daily `pg_dump` to object storage

### 2.1 Storage target (choose in the morning)

| Option | Egress cost | Setup complexity | Recommended |
|---|---|---|---|
| Cloudflare R2 | Free (no egress fees) | 10 min — account + API token | **Default** |
| AWS S3 | $0.09/GB out | 15 min — IAM user + bucket + policy | Fallback if R2 unavailable |
| Backblaze B2 | $0.01/GB out | 10 min | Also fine |

**Bucket name parameter:** `flosmosis-db-backups-prod` (default).
Change via the `BACKUP_BUCKET` env var if a different name is
preferred (e.g. if R2 namespace collides).

### 2.2 Scheduler (choose in the morning)

Three viable options — pick based on budget vs. convenience:

| Option | Cost | Setup | Notes |
|---|---|---|---|
| **Railway cron** (scheduled service) | ~$1/mo baseline + per-run compute | 20 min — new Railway project, Dockerfile, cron schedule `0 15 * * *` UTC = 01:00 AEST | Default recommendation. Railway runs the script; Supabase read is via `pg_dump` over the direct connection URL (port 5432, not pooler). |
| **GitHub Actions schedule** | Free on public, $0 on private if under 2k min/month | 10 min | Caveats: public IP churns — need to allowlist Supabase egress. Script lives in the WOHJO repo. |
| **Fly.io machines + cron** | ~$2/mo | 30 min | Overkill for a nightly job. |

**Default choice: Railway cron** (fits Lauren's existing stack; she
already uses Vercel for the app and can add Railway for infra
without learning a new product).

### 2.3 Dockerfile for the Railway service

```Dockerfile
FROM postgres:16-alpine
RUN apk add --no-cache aws-cli curl
WORKDIR /app
COPY backup.sh /app/backup.sh
RUN chmod +x /app/backup.sh
CMD ["/app/backup.sh"]
```

### 2.4 `backup.sh` — single file, idempotent per run

```bash
#!/usr/bin/env sh
set -eu

# Required env (Railway "Variables"):
#   DATABASE_URL              — Supabase direct-connection URL (not pooler)
#                                 Get from: Supabase dashboard → Database → Settings →
#                                 Connection string → URI → "Direct connection".
#                                 Must be the postgres role, NOT service_role.
#   BACKUP_BUCKET             — default "flosmosis-db-backups-prod"
#   BACKUP_PROVIDER           — "r2" | "s3" | "b2"
#   AWS_ACCESS_KEY_ID         — R2 API token (access key) or S3 IAM user key
#   AWS_SECRET_ACCESS_KEY     — R2 API token secret or S3 IAM secret
#   AWS_ENDPOINT_URL          — R2 ONLY: https://<account-id>.r2.cloudflarestorage.com
#                                 S3 leaves this unset
#   BACKUP_ALERT_WEBHOOK      — optional: Resend or Slack URL to ping on failure
#
# Optional env:
#   BACKUP_RETENTION_DAYS     — default 90 (quarterly retention)

BUCKET="${BACKUP_BUCKET:-flosmosis-db-backups-prod}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="/tmp/flosmosis_pgdump_${STAMP}.sql.gz"

echo "[$STAMP] starting pg_dump…"
pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --dbname="$DATABASE_URL" \
  --file=/tmp/flosmosis_pgdump_${STAMP}.dump

# gzip the custom-format dump for cheaper storage
gzip -9 /tmp/flosmosis_pgdump_${STAMP}.dump
mv /tmp/flosmosis_pgdump_${STAMP}.dump.gz "$OUT"

SIZE=$(stat -c %s "$OUT")
echo "[$STAMP] dump completed, size=$SIZE bytes"

# Upload
if [ "${BACKUP_PROVIDER:-r2}" = "r2" ]; then
  aws s3 cp "$OUT" "s3://$BUCKET/daily/${STAMP}.sql.gz" \
    --endpoint-url "$AWS_ENDPOINT_URL"
else
  aws s3 cp "$OUT" "s3://$BUCKET/daily/${STAMP}.sql.gz"
fi
echo "[$STAMP] upload OK"

# Checksum and upload alongside
SHA=$(sha256sum "$OUT" | cut -d' ' -f1)
echo "$SHA  flosmosis_pgdump_${STAMP}.sql.gz" > /tmp/checksum.txt
if [ "${BACKUP_PROVIDER:-r2}" = "r2" ]; then
  aws s3 cp /tmp/checksum.txt "s3://$BUCKET/daily/${STAMP}.sha256" \
    --endpoint-url "$AWS_ENDPOINT_URL"
else
  aws s3 cp /tmp/checksum.txt "s3://$BUCKET/daily/${STAMP}.sha256"
fi

# Retention: delete dumps older than N days (90 by default).
RETENTION="${BACKUP_RETENTION_DAYS:-90}"
CUTOFF=$(date -u -d "-${RETENTION} days" +%Y%m%dT%H%M%SZ)
if [ "${BACKUP_PROVIDER:-r2}" = "r2" ]; then
  aws s3 ls "s3://$BUCKET/daily/" --endpoint-url "$AWS_ENDPOINT_URL" | \
    awk -v cutoff="$CUTOFF" '$4 < cutoff"" { print $4 }' | \
    while read -r f; do
      aws s3 rm "s3://$BUCKET/daily/$f" --endpoint-url "$AWS_ENDPOINT_URL"
    done
else
  aws s3 ls "s3://$BUCKET/daily/" | \
    awk -v cutoff="$CUTOFF" '$4 < cutoff"" { print $4 }' | \
    while read -r f; do
      aws s3 rm "s3://$BUCKET/daily/$f"
    done
fi

echo "[$STAMP] retention sweep complete (keep=${RETENTION}d)"

rm -f "$OUT" /tmp/checksum.txt
echo "[$STAMP] done"
```

### 2.5 Railway project config

- Project name: `flosmosis-db-backup`
- Service type: **Cron Job** (not web service)
- Schedule (UTC): `0 15 * * *`  →  01:00 AEST daily (after any supervisor
  batch runs at 06:30 AEST and well before user activity starts).
- Resource plan: Starter (512 MB RAM is plenty; pg_dump of a small DB
  completes in under 1 minute).
- Region: `us-east1` (cheapest; egress to R2/S3 isn't priced per region
  for these providers).

### 2.6 Restoration drill (quarterly)

Once per quarter, Lauren should exercise the restore path:
1. Spin up a throwaway Supabase project.
2. Download the latest dump: `aws s3 cp s3://flosmosis-db-backups-prod/daily/<latest>.sql.gz .`
3. `gunzip <latest>.sql.gz`
4. `pg_restore -d <throwaway-project-direct-url> --no-owner --no-acl <latest>.sql`
5. Spot-check: row counts match, RLS policies present,
   `webhook_idempotency` + `admin_access_log` + `shift_events` all there.
6. Destroy the throwaway project.

Record each drill in `gate-reports/` so we have evidence that backups
actually restore.

### 2.7 Monitoring

- Railway → service → "Deployments" shows the last run's exit code.
- If `BACKUP_ALERT_WEBHOOK` is set, append a failure-ping to `backup.sh`
  (trap ERR + curl).
- Day 2 housekeeping: add a `/api/cron/verify-last-backup` route that
  pings the storage bucket and confirms a dump from the last 36 hours
  exists — runs at 06:00 AEST daily and emails if the check fails.

## 3. What's BLOCKED tonight

- Cannot create the Railway project — needs Lauren's Railway account.
- Cannot provision R2/S3 credentials — needs Lauren's Cloudflare/AWS login.
- Cannot set `DATABASE_URL` on Railway — that's the Supabase direct-connect
  URL which shouldn't be pasted into agent output.
- Cannot decide between Pro-tier Supabase primary vs Free-tier + A7-only —
  has a cost implication ($25/month for Pro).

## 4. What's READY to execute tomorrow (checklist)

- [ ] Decide: upgrade Supabase to Pro (PITR) or keep Free-tier + rely on A7.
- [ ] Create Cloudflare R2 account (or AWS S3 + IAM user).
- [ ] Create bucket `flosmosis-db-backups-prod` (or choose alternative name).
- [ ] Grant bucket to the API token/IAM user.
- [ ] Create Railway project "flosmosis-db-backup".
- [ ] Copy `docs/A7-pg-dump-backup-plan.md` Dockerfile + backup.sh into
      the project.
- [ ] Set Railway env vars (DATABASE_URL, BACKUP_BUCKET, AWS_*_KEY,
      AWS_ENDPOINT_URL if R2).
- [ ] Set cron schedule `0 15 * * *`.
- [ ] Trigger one manual run, verify the dump lands in the bucket.
- [ ] Download and `pg_restore` into a throwaway Supabase to prove
      the restore path (Section 2.6).
- [ ] Record the drill result in `gate-reports/A7-backup-drill-<date>.md`.
