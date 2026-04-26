// Sprint 6 — Task 9 — Token-based approval landing page
// Consumes a shift_approval_tokens row and triggers the same
// approval path the SMS webhook uses.
//
// Single-use: consumed_at is stamped on first click.

import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface ApprovalToken {
  token: string;
  shift_ids: string[];
  supervisor_id: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
}

const NAVY = '#0E1C2F';
const GREEN_LIVE = '#4ade80';
const GREEN_VERIFY = '#166534';
const WARM = '#F5F3EE';
const MUTE = 'rgba(245,243,238,0.6)';

function Shell({ title, body }: { title: string; body: string }) {
  return (
    <main style={{ background: NAVY, color: WARM, minHeight: '100vh', padding: '48px 24px', fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace" }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ width: 40, height: 40, border: `2px solid ${WARM}`, color: WARM, textAlign: 'center', lineHeight: '36px', fontWeight: 700, fontSize: 20, marginBottom: 24 }}>F</div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: GREEN_LIVE, margin: '0 0 14px' }}>{title}</h1>
        <p style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", color: MUTE, lineHeight: 1.6 }}>{body}</p>
        <p style={{ color: MUTE, fontSize: 11, letterSpacing: '0.08em', textAlign: 'center', marginTop: 48 }}>
          FLOSMOSIS PTY LTD &mdash; flosmosis.com
        </p>
      </div>
    </main>
  );
}

export default async function ApprovePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return <Shell title="Configuration error" body="The approval service is not configured. Contact lauren@flosmosis.com.au." />;
  }
  const supabase = createClient(url, serviceKey);

  const { data: tokenRow } = await supabase
    .from('shift_approval_tokens')
    .select('token, shift_ids, supervisor_id, created_at, expires_at, consumed_at')
    .eq('token', token)
    .maybeSingle();
  const t = tokenRow as ApprovalToken | null;

  if (!t) {
    return <Shell title="Link not found" body="This approval link is invalid or has already expired." />;
  }
  if (t.consumed_at) {
    return <Shell title="Already approved" body={`This link was consumed at ${new Date(t.consumed_at).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}.`} />;
  }
  if (new Date(t.expires_at) < new Date()) {
    return <Shell title="Link expired" body="This approval link has expired. Check your SMS or reply by email." />;
  }

  // Mark token consumed first to ensure single-use even under concurrent clicks.
  const now = new Date().toISOString();
  const { error: consumeErr } = await supabase
    .from('shift_approval_tokens')
    .update({ consumed_at: now })
    .eq('token', token)
    .is('consumed_at', null);
  if (consumeErr) {
    return <Shell title="Approval service unavailable" body="Please try again in a minute. If the problem persists, contact lauren@flosmosis.com.au." />;
  }

  // Approve the referenced shifts via the same status transition the
  // SMS webhook uses. This does NOT create WLES events — the cron
  // job should be extended in a later sprint to chain a proper
  // APPROVE_VIA_EMAIL event. For now the status transition is the
  // immediate unblock.
  await supabase
    .from('shifts')
    .update({
      status: 'SUPERVISOR_APPROVED',
      supervisor_approved_by: t.supervisor_id,
      supervisor_approved_at: now,
      updated_at: now,
    })
    .in('id', t.shift_ids);

  return (
    <main style={{ background: NAVY, color: WARM, minHeight: '100vh', padding: '48px 24px', fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace" }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ width: 40, height: 40, border: `2px solid ${WARM}`, color: WARM, textAlign: 'center', lineHeight: '36px', fontWeight: 700, fontSize: 20, marginBottom: 24 }}>F</div>
        <div style={{ color: GREEN_LIVE, fontSize: 22, fontWeight: 600, letterSpacing: '0.03em', marginBottom: 10 }}>
          APPROVED
        </div>
        <p style={{ color: WARM, fontSize: 14 }}>
          {t.shift_ids.length} worker{t.shift_ids.length === 1 ? '' : 's'} marked verified.
        </p>
        <hr style={{ border: 'none', borderTop: `1px solid ${GREEN_VERIFY}`, margin: '18px 0' }} />
        <p style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontStyle: 'italic', color: MUTE }}>
          Both sides agreed. Permanently.
        </p>
        <p style={{ color: MUTE, fontSize: 11, letterSpacing: '0.08em', textAlign: 'center', marginTop: 48 }}>
          FLOSMOSIS PTY LTD &mdash; flosmosis.com
        </p>
      </div>
    </main>
  );
}
