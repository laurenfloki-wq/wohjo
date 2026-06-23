// Bot 29 — Contract lifecycle.
//
// Trigger: daily | Runtime: pg_cron->EF | Gate: T1 | Model: none. Tracks
// expiries, renewals, and obligations; reminds. Deterministic — no expiry is
// missed because the detection is a pure date comparison.

export const BOT_ID = 'bot-29-contract-lifecycle';

export interface Contract {
  id: string;
  counterparty: string;
  expiresInDays: number;
  autoRenews: boolean;
  /** Days before expiry that notice must be given to avoid auto-renewal. */
  noticePeriodDays: number;
}

export interface LifecycleAlert {
  id: string;
  counterparty: string;
  kind: 'expiring' | 'notice_window_closing' | 'expired';
  expiresInDays: number;
}

/**
 * Pure: alerts for contracts expiring within `horizonDays`, in the notice
 * window for an auto-renewing contract, or already expired. Most urgent first
 * (already expired, then soonest).
 */
export function lifecycleAlerts(
  contracts: ReadonlyArray<Contract>,
  horizonDays = 60,
): LifecycleAlert[] {
  const alerts: LifecycleAlert[] = [];
  for (const c of contracts) {
    if (c.expiresInDays < 0) {
      alerts.push({
        id: c.id,
        counterparty: c.counterparty,
        kind: 'expired',
        expiresInDays: c.expiresInDays,
      });
    } else if (c.autoRenews && c.expiresInDays <= c.noticePeriodDays) {
      alerts.push({
        id: c.id,
        counterparty: c.counterparty,
        kind: 'notice_window_closing',
        expiresInDays: c.expiresInDays,
      });
    } else if (c.expiresInDays <= horizonDays) {
      alerts.push({
        id: c.id,
        counterparty: c.counterparty,
        kind: 'expiring',
        expiresInDays: c.expiresInDays,
      });
    }
  }
  return alerts.sort((a, b) => a.expiresInDays - b.expiresInDays);
}
