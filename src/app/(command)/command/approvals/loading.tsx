import { Card, SkeletonTitle, Skeleton, SkeletonCard } from '@/components/command/ui';

export default function ApprovalsLoading() {
  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 'var(--s-5)',
          margin: '0 0 var(--s-6) 0',
          paddingBottom: 'var(--s-5)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SkeletonTitle />
          <Skeleton width={520} height={14} />
        </div>
      </header>
      <Card style={{ marginBottom: 'var(--s-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--s-4)' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton width={220} height={16} />
            <Skeleton width="40%" height={12} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Skeleton width={120} height={24} radius={999} />
            <Skeleton width={140} height={24} radius={999} />
          </div>
        </div>
      </Card>
      <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--s-4)' }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} width={120} height={36} radius={6} />
        ))}
      </div>
      <SkeletonCard height={140} />
      <div style={{ height: 12 }} />
      <SkeletonCard height={140} />
    </>
  );
}
