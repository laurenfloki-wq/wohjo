// Phase A (WORKER_PASSKEY_ACCESS) — POST /api/worker/passkey/logout
// Clears the self-issued worker-session cookie (the HttpOnly cookie the client
// cannot clear itself). Safe to call unconditionally on sign-out, even when no
// passkey session exists. Pairs with supabase.auth.signOut() on the client.

import { NextResponse } from 'next/server';
import { clearWorkerSessionCookie } from '@/lib/auth/worker-session';

export async function POST() {
  await clearWorkerSessionCookie();
  return NextResponse.json({ ok: true });
}
