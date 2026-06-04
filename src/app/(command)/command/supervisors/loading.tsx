import { SkeletonTitle, Skeleton, SkeletonRow } from '@/components/command/ui';

export default function SupervisorsLoading() {
  return (
    <>
      <header style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 'var(--s-5)', margin: '0 0 var(--s-6) 0',
        paddingBottom: 'var(--s-5)', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SkeletonTitle />
          <Skeleton width={260} height={14} />
        </div>
        <Skeleton width={160} height={44} />
      </header>
      <div style={{
        border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
        background: 'var(--surface)', overflow: 'hidden',
      }}>
        <SkeletonRow columns={4} />
        <SkeletonRow columns={4} />
      </div>
    </>
  );
}
