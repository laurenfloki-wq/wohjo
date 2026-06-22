// Minimal approval front-door (bot 57 UI). Lists pending gates; a director
// approves/rejects, which resumes or compensates the parked flow. Server
// component reads the queue directly; actions post to /api/fleet/approvals.

import { listPending } from '@platform/hitl';
import { ApprovalActions } from './ApprovalActions';
import { requireDirector } from '../guard';

export const dynamic = 'force-dynamic';

export default async function FleetApprovalsPage() {
  await requireDirector();
  const pending = await listPending();
  return (
    <main
      style={{ maxWidth: 880, margin: '2rem auto', fontFamily: 'system-ui', padding: '0 1rem' }}
    >
      <h1>Fleet approvals</h1>
      <p>
        {pending.length} pending gate{pending.length === 1 ? '' : 's'}. Nothing external is sent
        until a director approves here.
      </p>
      {pending.length === 0 ? (
        <p>No pending approvals.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th>Bot</th>
              <th>Tier</th>
              <th>Proposed action</th>
              <th>Created</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((a) => (
              <tr key={a.id} style={{ borderBottom: '1px solid #eee' }}>
                <td>{a.bot_id}</td>
                <td>{a.tier}</td>
                <td>{a.proposed_action}</td>
                <td>{new Date(a.created_at).toLocaleString('en-AU')}</td>
                <td>
                  <ApprovalActions approvalId={a.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
