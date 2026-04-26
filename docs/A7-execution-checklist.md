# A7 — Executable morning checklist (expanded)

**Companion to:** `docs/A7-pg-dump-backup-plan.md`
**Time budget:** 45–60 minutes end-to-end if all accounts exist.
**Result:** first nightly dump lands in R2 tomorrow night, restore
drill proves it works.

**What's in this doc:** every UI click, every field value, every
expected screen. Follow top-to-bottom; do NOT skip ahead.

---

## Step 1 — Create the Cloudflare R2 account (5 min)

If Lauren already has a Cloudflare account, skip to **Step 1.5**.

1. Open `https://dash.cloudflare.com/sign-up` in a new tab.
2. Sign up with `lauren@flosmosis.com` (after F2 Resend verification — or the current `lauren.flosmosis@gmail.com` if F2 isn't done yet).
3. Verify the email link Cloudflare sends.
4. Sign in to the dashboard.

### Step 1.5 — Enable R2 (free-tier, 3 min)

1. In the Cloudflare dashboard left sidebar, click **R2 Object Storage**.
2. Cloudflare will prompt to enable R2 — requires a credit card on file (R2's free tier is 10 GB storage + 10 million Class-A operations/month, no egress fees; payment info is collected but won't be charged while inside free tier).
3. Accept the R2 terms and click **Agree & Purchase** (yes, the button says "purchase" even on free tier — this is a plan enrolment, not a charge).
4. Wait for the green "R2 is active" banner.

**Expected:** R2 dashboard shows "Overview" with `0 buckets`.

---

## Step 2 — Create the backup bucket (2 min)

1. R2 dashboard → **Create bucket**.
2. **Bucket name:** `flosmosis-db-backups-prod`. (If Cloudflare says "bucket name taken globally", append `-au`: `flosmosis-db-backups-prod-au`.)
3. **Location hint:** `Asia-Pacific (APAC)`.
4. **Default storage class:** Standard.
5. Click **Create bucket**.

**Expected:** bucket page with breadcrumb `R2 > flosmosis-db-backups-prod`, zero objects.

---

## Step 3 — Get R2 API credentials (5 min)

1. R2 dashboard left sidebar → **Manage R2 API Tokens**.
2. Click **Create API Token**.
3. **Token name:** `flosmosis-backup-writer`.
4. **Permissions:** `Object Read & Write`.
5. **Specify bucket:** tick the `flosmosis-db-backups-prod` bucket only.
6. **TTL:** leave blank (token doesn't expire; safer for a scheduled cron than short-lived tokens).
7. **Client IP Address Filtering:** leave blank.
8. Click **Create API Token**.

Cloudflare shows a ONE-TIME screen with:

- **Access Key ID** — copy to a safe place (1Password/Bitwarden).
- **Secret Access Key** — copy.
- **Jurisdiction-specific endpoint** — copy the one shown as `https://<account-id>.r2.cloudflarestorage.com`.

**Do not leave this page without copying all three.** Cloudflare will
not show the Secret Access Key again.

**Expected:** you now have three values for use in Step 5.

---

## Step 4 — Create the Railway project (10 min)

### Step 4.1 — Sign in to Railway

1. Open `https://railway.app`.
2. Sign in with GitHub (recommended) using Lauren's existing GitHub account.

### Step 4.2 — Create a new project

1. Dashboard → **New Project**.
2. Choose **Empty Project** (do NOT pick "Deploy from GitHub" — we're going to configure manually).
3. Project name: `flosmosis-db-backup`.

### Step 4.3 — Create the cron service

1. Inside the empty project, click **+ Create** → **Empty Service**.
2. Service name: `pg-dump-daily`.
3. Click **Settings** tab on the service.
4. Scroll to **Source** → **Connect Repo** → choose a repo that will hold the backup Dockerfile. Either:
   - **Option a (recommended):** create a new GitHub repo called `flosmosis-db-backup` with just these files:
     - `Dockerfile` (copy from `docs/A7-pg-dump-backup-plan.md` §2.3)
     - `backup.sh` (copy from `docs/A7-pg-dump-backup-plan.md` §2.4, make executable `chmod +x backup.sh`)
     - `README.md` (one-liner "Daily pg_dump to R2. Managed by Railway.")
   - **Option b:** put the same files inside the WOHJO repo under `infrastructure/backup/`.
5. Railway will detect the Dockerfile and start building. Cancel the build for now — we haven't set env vars yet.

### Step 4.4 — Set environment variables

Settings tab → **Variables** → **Raw Editor** → paste:

```
DATABASE_URL=<from Supabase direct-connect URL; see Step 4.5>
BACKUP_BUCKET=flosmosis-db-backups-prod
BACKUP_PROVIDER=r2
AWS_ACCESS_KEY_ID=<from Step 3>
AWS_SECRET_ACCESS_KEY=<from Step 3>
AWS_ENDPOINT_URL=<from Step 3, the https://<account-id>.r2.cloudflarestorage.com URL>
BACKUP_RETENTION_DAYS=90
```

### Step 4.5 — Get the Supabase DATABASE_URL

1. Supabase dashboard → Project Settings → Database.
2. Scroll to **Connection string** section.
3. Switch to the **URI** tab.
4. Find **Direct connection** (NOT "Transaction pooler" — pg_dump needs a direct connection for schema access).
5. Copy the string that looks like `postgres://postgres:<password>@db.rwnxnnudljpgyfwbnosu.supabase.co:5432/postgres`.
6. Paste as the `DATABASE_URL` value in Step 4.4.

### Step 4.6 — Configure the cron schedule

Railway doesn't have a first-class cron UI yet. Use the "Scheduled" service type:

1. Service Settings → **Deploy** tab.
2. **Start Command:** `/app/backup.sh` (Dockerfile CMD handles it; this override is for clarity).
3. **Custom Schedule:** `0 15 * * *`  (UTC = 01:00 AEST).
4. **Restart Policy:** `Never` (each run is one-shot).
5. Save.

---

## Step 5 — First manual trigger (5 min)

1. Service → **Deployments** tab.
2. Click **Deploy** → **Deploy without schedule** (runs the service once, immediately).
3. Wait 30-90 seconds for build + run.
4. Watch the logs. Expected log sequence:
   - `[<timestamp>] starting pg_dump…`
   - `[<timestamp>] dump completed, size=<N> bytes`
   - `upload: /tmp/flosmosis_pgdump_*.sql.gz to s3://...`
   - `[<timestamp>] upload OK`
   - `[<timestamp>] retention sweep complete (keep=90d)`
   - `[<timestamp>] done`

**If you see** `pg_dump: error: connection failed` → Supabase `DATABASE_URL` is wrong. Re-check Step 4.5. Most common mistake: copied the pooler URL not the direct-connect URL.

**If you see** `upload failed: AccessDenied` → R2 API token lacks write scope. Re-check Step 3, ensure `Object Read & Write` was chosen.

**If you see** `upload failed: NoSuchBucket` → the bucket name in `BACKUP_BUCKET` doesn't match what you created in Step 2. Check for `-au` suffix.

---

## Step 6 — Verify the object landed in R2 (2 min)

1. Cloudflare R2 → `flosmosis-db-backups-prod` bucket.
2. You should see a folder `daily/` containing two objects:
   - `<timestamp>.sql.gz` — the dump.
   - `<timestamp>.sha256` — checksum companion.
3. Click the `.sha256` object → **Download** → open in a text editor.
4. Confirm the hash matches the expected shape (64 hex chars then a space then the filename).

**Expected:** dump size for a small early-stage DB is ~100-500 KB; checksum file is ~85 bytes.

---

## Step 7 — Restore drill (15 min)

Prove the backup actually restores before relying on it.

### Step 7.1 — Create a throwaway Supabase project

1. Supabase dashboard → **New project**.
2. Name: `flosmosis-restore-drill`.
3. Region: same as prod (check prod first).
4. Wait ~2 min for provisioning.

### Step 7.2 — Download the latest dump

On Lauren's local machine (not Cowork — needs real AWS CLI network access):

```bash
# Install rclone (simpler than aws-cli for R2)
# brew install rclone  (macOS)
# or https://rclone.org/install/

# Configure rclone for R2
rclone config
# Follow prompts: New remote → name "r2" → storage "Cloudflare R2" → paste access key, secret, endpoint
# Save

# List the bucket
rclone ls r2:flosmosis-db-backups-prod/daily/

# Download the latest dump
rclone copy r2:flosmosis-db-backups-prod/daily/<latest-timestamp>.sql.gz .
gunzip <latest-timestamp>.sql.gz
```

### Step 7.3 — Restore into the throwaway project

1. Supabase dashboard for the restore-drill project → Project Settings → Database → Connection string → Direct connection.
2. Run `pg_restore`:

```bash
pg_restore \
  --dbname=<throwaway-direct-connect-url> \
  --no-owner \
  --no-acl \
  --verbose \
  <latest-timestamp>.sql
```

Expect 10-30 seconds for a small DB.

### Step 7.4 — Spot-check row counts

Open the Supabase SQL Editor for the throwaway project and run:

```sql
SELECT 'companies', count(*) FROM companies
UNION ALL SELECT 'shifts', count(*) FROM shifts
UNION ALL SELECT 'shift_events', count(*) FROM shift_events
UNION ALL SELECT 'workers', count(*) FROM workers
UNION ALL SELECT 'webhook_idempotency', count(*) FROM webhook_idempotency
UNION ALL SELECT 'admin_access_log', count(*) FROM admin_access_log;
```

Compare against prod's same query. Counts should match (+/- whatever went through in the restore window).

### Step 7.5 — Destroy the throwaway

Throwaway project → Settings → Danger zone → **Delete project**.

---

## Step 8 — Record the drill (5 min)

Create `gate-reports/A7-backup-drill-2026-04-22.md` with:

- Drill start time.
- Backup object name restored from.
- Row-count comparison prod vs restore (paste the SQL output from Step 7.4).
- Any issues encountered.
- Drill outcome: **PASS** / **FAIL**.
- Next drill scheduled for: `2026-07-22` (quarterly cadence).

Once the drill passes and the record is filed, A7 is closed.

---

## Blocked rails (requires you to give Cowork access to creds)

If you would prefer Cowork to automate Steps 4-6 tomorrow morning
(after you grant credential access via a `.env.railway` file in
Desktop or Downloads), just say so in chat. The script is ready to
take:

```
RAILWAY_API_TOKEN=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
SUPABASE_DIRECT_URL=
```

Cowork will NOT create the Cloudflare account or fetch R2 tokens —
those require Lauren's browser session with Cloudflare. Steps 1-3
are always manual.
