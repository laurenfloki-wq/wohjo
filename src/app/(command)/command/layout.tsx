import type { ReactNode } from 'react';
import CommandShell from '@/components/command/CommandShell';
import { Toaster } from '@/components/command/ui';

/**
 * /command surface layout.
 *
 * The operator shell is a cream margin sidebar (labelled, collapsible)
 * + a slim always-visible integrity topbar, both owned by CommandShell.
 * The `.flos-content` class on the page inner keeps content in a single
 * centred column to the right of the sidebar. Token source of truth:
 * src/styles/command-tokens.css.
 */
export default function CommandLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="command-light"
      style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}
    >
      <CommandShell>{children}</CommandShell>
      <Toaster />
    </div>
  );
}
