import { NextResponse } from 'next/server';

// ────────────────────────────────────────────────────────────────────
// DISABLED 2026-04-29 per substrate-DD audit follow-on (Hazard 1
// surfaced by cron-substrate-audit-2026-04-29.md when approval-fallback
// was disabled via Path C).
//
// This route was previously rendered as a Next.js page component
// (src/app/approve/[token]/page.tsx) consuming
// shift_approval_tokens rows produced by the now-disabled
// /api/cron/approval-fallback cron. The schema dependency chain:
//
//   shift_approval_tokens table              — missing in production
//   shifts.status enum value                 — page wrote
//                                              'SUPERVISOR_APPROVED';
//                                              production uses 'APPROVED'
//   from-address noreply@flosmosis.com.au    — wrong domain
//
// Since the upstream cron was disabled, no new tokens are ever
// minted, so this page is dormant. Converting to a 410 Gone route
// handler makes the disablement observable (rather than silently
// 500-erroring on a missing-table query if a curious user types a
// guess at /approve/<anything>).
//
// Revival conditions: same as src/app/api/cron/approval-fallback/
// route.ts — the cron must be revived first (which requires schema
// migration + status enum decision + email from-address fix +
// tests). This page rebuild then becomes a downstream task.
// ────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HTML_BODY = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Approval link unavailable — FLOSTRUCTION</title>
  <style>
    html, body { margin: 0; padding: 0; }
    body {
      background: #0E1C2F;
      color: #F5F3EE;
      min-height: 100vh;
      padding: 48px 24px;
      font-family: 'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace;
    }
    .wrap { max-width: 560px; margin: 0 auto; }
    .fmark {
      width: 40px; height: 40px;
      border: 2px solid #F5F3EE;
      color: #F5F3EE;
      text-align: center;
      line-height: 36px;
      font-weight: 700;
      font-size: 20px;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 22px;
      font-weight: 600;
      color: #4ade80;
      margin: 0 0 14px;
    }
    p {
      font-family: 'IBM Plex Serif', Georgia, serif;
      color: rgba(245,243,238,0.6);
      line-height: 1.6;
    }
    .footer {
      color: rgba(245,243,238,0.6);
      font-size: 11px;
      letter-spacing: 0.08em;
      text-align: center;
      margin-top: 48px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="fmark">F</div>
    <h1>Approval link unavailable</h1>
    <p>
      Email-based supervisor approval is paused. If a worker is waiting
      on you to approve a shift, please reply to the SMS you received,
      or contact <a href="mailto:support@flosmosis.com" style="color:#F5F3EE">support@flosmosis.com</a>.
    </p>
    <p class="footer">
      FLOSMOSIS PTY LTD &mdash; flosmosis.com
    </p>
  </div>
</body>
</html>`;

export async function GET() {
  return new NextResponse(HTML_BODY, {
    status: 410,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
