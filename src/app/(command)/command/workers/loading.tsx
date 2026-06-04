import { SkeletonTitle, Skeleton, SkeletonRow } from '@/components/command/ui';

export default function WorkersLoading() {
  return (
    <>
      <header style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 'var(--s-5)', margin: '0 0 var(--s-6) 0',
        paddingBottom: 'var(--s-5)', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SkeletonTitle />
          <Skeleton width={200} height={14} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Skeleton width={160} height={44} />
          <Skeleton width={130} height={44} />
        </div>
      </header>
      <div style={{
        border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
        background: 'var(--surface)', overflow: 'hidden',
      }}>
        <SkeletonRow columns={6} />
        <SkeletonRow columns={6} />
        <SkeletonRow columns={6} />
      </div>
    </>
  );
}
