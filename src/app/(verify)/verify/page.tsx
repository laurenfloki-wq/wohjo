// Flostruction Verify — Supervisor Backup Interface
// /verify?token=[supervisor.verify_token]
// Token-based auth — no login required for SMS link clicks.
// Primary channel is SMS. Flostruction Verify is optionality for detail or catch-up.

import { Suspense } from 'react';
import VerifyClient from '@/components/verify/VerifyClient';

export default function VerifyPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#f8f9fa', display: 'flex', justifyContent: 'center', alignItems: 'center' }}><div style={{ fontSize: '14px', color: '#666' }}>Loading...</div></div>}>
      <VerifyClient />
    </Suspense>
  );
}
