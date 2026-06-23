import 'server-only';
import { redirect } from 'next/navigation';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { routeLogger } from '@/lib/logger';

/**
 * Director-only gate for the fleet pages. The middleware already blocks
 * anonymous access; this additionally requires the authenticated user to be a
 * company admin/director (getCompanyIdForSession throws 403 otherwise). On any
 * failure we redirect to the field login rather than leak that the page exists.
 */
export async function requireDirector(): Promise<void> {
  try {
    await getCompanyIdForSession(routeLogger('fleet-page'));
  } catch {
    redirect('/field');
  }
}
