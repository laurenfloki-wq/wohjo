// Flostruction — Worker MFA challenges repository (W1.4, 2026-06-10)
//
// Worker scope bound at the factory; query shapes byte-identical to
// the previous worker/mfa route inlines. The challenge insert keeps
// its route literal with worker_id supplied by the binding.

import { getServiceClient } from '@/lib/db/service-client';

/** Worker-scoped MFA challenge access for worker/mfa routes. */
export function workerMfaChallengesRepo(workerId: string) {
  const db = getServiceClient();
  return {
    // issue + challenge delivery-failure cleanup — relocated verbatim.
    // Deliberately id-keyed only (the id comes from the challenge just
    // issued for THIS worker); worker-predicate hardening is a W2/SG-1
    // candidate, not this slice.
    consumeById: (challengeId: string) =>
      db
        .from('worker_mfa_challenges')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', challengeId),

    // challenge whitelist path — invalidate prior unconsumed challenges
    // for the same (worker, action) pair; relocated verbatim.
    consumeOpenFor: (action: string) =>
      db
        .from('worker_mfa_challenges')
        .update({ consumed_at: new Date().toISOString() })
        .eq('worker_id', workerId)
        .eq('challenge_for', action)
        .is('consumed_at', null),

    // challenge whitelist insert — worker_id from the binding.
    insertChallenge: (row: Record<string, unknown>) =>
      db
        .from('worker_mfa_challenges')
        .insert({ ...row, worker_id: workerId })
        .select('id, expires_at')
        .single(),
  };
}
