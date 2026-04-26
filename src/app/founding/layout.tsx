// Flostruction — Founding Page Layout (metadata)
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FLOSTRUCTION Founding Customer Programme \u2014 Verified Hours for Labour Hire',
  description: 'Join 20 founding labour hire companies before 1 July. 60 days free. $399/month locked for 3 years. Your crew live in 48 hours.',
  openGraph: {
    title: 'FLOSTRUCTION Founding Customer Programme',
    description: 'Join 20 founding labour hire companies before 1 July. 60 days free. $399/month locked for 3 years.',
    type: 'website',
    url: 'https://flosmosis.com/founding',
  },
};

export default function FoundingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
