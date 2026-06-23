import { describe, it, expect } from 'vitest';
import { triageMail, type InboundMail } from './handler';
const m = (over: Partial<InboundMail>): InboundMail => ({
  fromDomain: 'acme.com',
  subject: '',
  body: '',
  isReplyToOurThread: false,
  ...over,
});
describe('bot 53 — inbox triage', () => {
  it('treats unknown external as customer needing a director, drafts reply', () => {
    const t = triageMail(m({ fromDomain: 'lead.com', subject: 'Question about pricing' }));
    expect(t.category).toBe('customer');
    expect(t.needsDirector).toBe(true);
    expect(t.shouldDraft).toBe(true);
  });
  it('classifies vendors and internal without drafting', () => {
    expect(triageMail(m({ fromDomain: 'stripe.com' })).category).toBe('vendor');
    expect(triageMail(m({ fromDomain: 'flosmosis.com' })).shouldDraft).toBe(false);
  });
  it('detects spam and newsletters', () => {
    expect(triageMail(m({ fromDomain: 'x.com', subject: 'lottery winner' })).category).toBe('spam');
    expect(
      triageMail(m({ fromDomain: 'news.com', subject: 'weekly update digest' })).category,
    ).toBe('newsletter');
  });
});
