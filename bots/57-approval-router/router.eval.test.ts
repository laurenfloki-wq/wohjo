// Golden evals — bot 57 (approval router). Pure decision logic, no infra.

import { describe, it, expect } from 'vitest';
import { decideNext } from './handler';
import type { ResolutionResult } from '../../platform/hitl';
import type { ApprovalRequest } from '../../platform/types';

function approval(over: Partial<ApprovalRequest>): ApprovalRequest {
  return {
    id: 'a1',
    bot_id: 'bot-34-bookkeeping',
    tier: 'T2',
    status: 'pending',
    payload: {},
    proposed_action: 'post to Xero',
    parked_queue: 'money',
    parked_msg_id: 42,
    created_at: '2026-06-22T00:00:00Z',
    resolved_at: null,
    resolved_by: null,
    ...over,
  };
}

describe('bot 57 — approval router decideNext', () => {
  it('resumes the parked message on approval', () => {
    const r: ResolutionResult = {
      approval: approval({ status: 'approved' }),
      resume: { queue: 'money', msgId: 42 },
    };
    expect(decideNext(r, 'money-compensate')).toEqual({
      kind: 'resume',
      queue: 'money',
      msgId: 42,
    });
  });

  it('compensates on rejection', () => {
    const r: ResolutionResult = {
      approval: approval({ status: 'rejected' }),
      resume: null,
    };
    expect(decideNext(r, 'money-compensate')).toEqual({
      kind: 'compensate',
      compensationTopic: 'money-compensate',
    });
  });

  it('no-ops on an already-resolved / no-resume approval', () => {
    const r: ResolutionResult = { approval: approval({ status: 'approved' }), resume: null };
    expect(decideNext(r, null)).toEqual({ kind: 'noop' });
  });
});
