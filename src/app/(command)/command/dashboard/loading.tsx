// Route-level loading skeleton for /command/dashboard (Overview).
// Mirrors the final layout so the shell + the shape of the page paint
// instantly while the server component streams.

import {
  Card, CardHeader, SkeletonTitle, Skeleton, SkeletonCard,
} from '@/components/command/ui';

export default function OverviewLoading() {
  return (
    <>
      <header style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 'var(--s-5)', margin: '0 0 var(--s-6) 0',
        paddingBottom: 'var(--s-5)', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SkeletonTitle />
          <Skeleton width={520} height={14} />
        </div>
      </header>

      <Card style={{ marginBottom: 'var(--s-5)' }} data-emphasis="primary">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--s-4)' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton width={240} height={20} />
            <Skeleton width="80%" height={12} />
          </div>
          <Skeleton width={140} height={24} radius={999} />
        </div>
      </Card>

      <Card sunken style={{ marginBottom: 'var(--s-5)' }}>
        <CardHeader title={<Skeleton width={180} height={16} />} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          <Skeleton height={56} radius={8} />
          <Skeleton height={56} radius={8} />
          <Skeleton height={56} radius={8} />
        </div>
      </Card>

      <SkeletonCard height={96} />

      <div style={{ marginTop: 'var(--s-5)' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 'var(--s-4)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          padding: 'var(--s-4) var(--s-5)',
        }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton width={80} height={10} />
              <Skeleton width={64} height={26} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
