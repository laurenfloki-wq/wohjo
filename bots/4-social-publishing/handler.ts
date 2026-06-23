// Bot 4 — Social publishing.
//
// Trigger: schedule | Runtime: pg_cron->EF | Gate: T1 (pre-approved) |
// Model: none. Pulls already-approved posts and publishes them on time,
// idempotently. The due-selection and idempotency key are deterministic; only
// posts that cleared the T2 drafting gate (status 'approved') are ever sent.

export const BOT_ID = 'bot-4-social-publishing';

export interface ScheduledPost {
  id: string;
  channel: 'linkedin' | 'instagram';
  status: 'draft' | 'approved' | 'published';
  scheduledForMs: number;
}

/** Idempotency key so a re-run never double-posts. */
export function publishKey(post: ScheduledPost): string {
  return `social-publish:${post.channel}:${post.id}`;
}

/**
 * Pure: select posts due to publish at `nowMs` — approved, not yet published,
 * and scheduled at or before now. Pre-approval (status) is enforced here, so an
 * un-approved post can never be selected for sending.
 */
export function duePosts(posts: ReadonlyArray<ScheduledPost>, nowMs: number): ScheduledPost[] {
  return posts
    .filter((p) => p.status === 'approved' && p.scheduledForMs <= nowMs)
    .sort((a, b) => a.scheduledForMs - b.scheduledForMs);
}
