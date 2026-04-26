// Flostruction — Command API Authentication
// Validates that the caller has a valid Supabase session for /api/command/* routes.
// Non-negotiable: all command routes must verify authentication.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  companyId?: string;
  error?: NextResponse;
}

/**
 * Require a valid Supabase session for command API routes.
 * Returns the authenticated user's ID or a 401 response.
 *
 * Usage in route:
 *   const auth = await requireCommandAuth(request);
 *   if (!auth.authenticated) return auth.error!;
 *   // auth.userId is available
 */
export async function requireCommandAuth(request: Request): Promise<AuthResult> {
  // Check for API key in Authorization header (for CLI/automation)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (token === process.env.COMMAND_API_KEY && process.env.COMMAND_API_KEY) {
      // API key auth — trusted. company_id must be in query/body.
      return { authenticated: true, userId: 'api-key' };
    }
  }

  // Check for valid Supabase session
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        authenticated: false,
        error: NextResponse.json(
          { error: 'Authentication required. Please sign in.' },
          { status: 401 }
        ),
      };
    }

    return {
      authenticated: true,
      userId: user.id,
    };
  } catch {
    return {
      authenticated: false,
      error: NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      ),
    };
  }
}

/**
 * Require a valid Supabase session for field (worker) API routes.
 * Returns the authenticated worker's user ID.
 */
export async function requireFieldAuth(): Promise<AuthResult> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        authenticated: false,
        error: NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        ),
      };
    }

    return {
      authenticated: true,
      userId: user.id,
    };
  } catch {
    return {
      authenticated: false,
      error: NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      ),
    };
  }
}
