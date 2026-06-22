// Fleet dashboard — read-only operational view. Answers "is it running, what has
// each bot done, what is it costing, and what needs me". Server component reading
// the fleet DB directly; no secret needed in the browser.

import Link from 'next/link';
import { fleetActivity, recentLedger, pendingApprovalCount, fleetCost } from '@platform/obs';
import { REGISTRY } from '@bots/registry';

export const dynamic = 'force-dynamic';

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

export default async function FleetDashboard() {
  const [activity, recent, pending, costAud] = await Promise.all([
    fleetActivity(),
    recentLedger(40),
    pendingApprovalCount(),
    fleetCost(),
  ]);
  const seen = new Map(activity.map((a) => [a.botId, a]));
  const allBots = Object.values(REGISTRY).map((m) => m.id);

  return (
    <main
      style={{ maxWidth: 1000, margin: '2rem auto', fontFamily: 'system-ui', padding: '0 1rem' }}
    >
      <h1>FLOSMOSIS fleet</h1>
      <p>
        {allBots.length} bots registered &middot; <strong>{pending}</strong> pending approval
        {pending === 1 ? '' : 's'} (<Link href="/fleet/approvals">review</Link>) &middot; spend this
        month: <strong>{costAud.toFixed(2)} AUD</strong>
      </p>

      <h2>Bot activity</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
            <th>Bot</th>
            <th>Last run</th>
            <th>Last status</th>
            <th>Runs (24h)</th>
          </tr>
        </thead>
        <tbody>
          {allBots.map((id) => {
            const a = seen.get(id);
            return (
              <tr key={id} style={{ borderBottom: '1px solid #eee' }}>
                <td>{id}</td>
                <td>{ago(a?.lastRunAt ?? null)}</td>
                <td>{a?.lastStatus ?? '—'}</td>
                <td>{a?.runs24h ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Recent activity</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
            <th>When</th>
            <th>Bot</th>
            <th>Action</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((e) => (
            <tr key={e.id} style={{ borderBottom: '1px solid #eee' }}>
              <td>{ago(e.createdAt)}</td>
              <td>{e.botId}</td>
              <td>{e.action}</td>
              <td>
                <code style={{ fontSize: 12 }}>{JSON.stringify(e.detail).slice(0, 120)}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
