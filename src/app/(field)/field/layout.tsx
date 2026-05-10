/**
 * /field layout — wraps all /field/* pages.
 * Adds the persistent AdvocacyFooter to every /field/* page.
 */

import type { ReactNode } from 'react';
import AdvocacyFooter from '@/components/field/AdvocacyFooter';

export default function FieldLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div style={{ flex: 1 }}>{children}</div>
      <AdvocacyFooter />
    </div>
  );
}
