import type { Metadata } from 'next';
import MarketingPage from '@/components/marketing/MarketingPage';

// Flostruction marketing landing v5 — root route (/)
// Design source of truth: flostruction-v5.html (approved 2026-06-10).
// No navigation to /field, /verify, /command — public-facing only.
export const metadata: Metadata = {
  title: 'FLOSTRUCTION — verified hours',
  description:
    'Workforce time verification for Australian construction and labour hire. Every hour verified at the point of work and sealed into a permanent, tamper-evident record.',
};

export default function Home() {
  return <MarketingPage />;
}
