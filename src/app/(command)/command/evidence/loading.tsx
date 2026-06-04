import { Card, CardHeader, SkeletonTitle, Skeleton, SkeletonCard } from '@/components/command/ui';

export default function EvidenceLoading() {
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
        <Skeleton width={180} height={44} />
      </header>
      <Card style={{ marginBottom: 'var(--s-5)' }}>
        <CardHeader title={<Skeleton width={120} height={16} />} />
        <div style={{ display: 'flex', gap: 'var(--s-4)' }}>
          <Skeleton width={170} height={44} />
          <Skeleton width={170} height={44} />
          <Skeleton width={140} height={44} />
        </div>
      </Card>
      <SkeletonCard height={180} />
    </>
  );
}
