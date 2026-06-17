// Pin the fail-closed contract on /api/preview-login.
//
// We do NOT exercise the real auth flow here (it would mutate
// auth.users). We only pin the env-gate: when FLOS_PREVIEW_LOGIN is
// absent or not exactly '1', the route returns 404 and does NOT
// touch the Supabase admin client.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const adminStub = {
  auth: {
    admin: {
      getUserById: vi.fn(),
      updateUserById: vi.fn(),
      generateLink: vi.fn(),
    },
  },
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn().mockReturnValue(adminStub),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [], set: vi.fn() }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn().mockReturnValue({
    auth: {
      verifyOtp: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  }),
}));

vi.mock('postgres', () => ({
  default: vi.fn().mockReturnValue(Object.assign(() => Promise.resolve([]), { end: vi.fn() })),
}));

beforeEach(() => {
  adminStub.auth.admin.getUserById.mockReset();
  adminStub.auth.admin.updateUserById.mockReset();
  adminStub.auth.admin.generateLink.mockReset();
  delete process.env.FLOS_PREVIEW_LOGIN;
});

async function loadHandler() {
  // Fresh import so the route's module-level env reads are evaluated
  // against the per-test env state.
  vi.resetModules();
  const mod = await import('./route');
  return mod.GET;
}

describe('GET /api/preview-login — env-gated fail-closed', () => {
  it('404s when FLOS_PREVIEW_LOGIN is unset', async () => {
    const GET = await loadHandler();
    const res = await GET(new Request('http://test/api/preview-login') as never);
    expect(res.status).toBe(404);
    expect(adminStub.auth.admin.getUserById).not.toHaveBeenCalled();
  });

  it('404s when FLOS_PREVIEW_LOGIN is exactly the string "false"', async () => {
    process.env.FLOS_PREVIEW_LOGIN = 'false';
    const GET = await loadHandler();
    const res = await GET(new Request('http://test/api/preview-login') as never);
    expect(res.status).toBe(404);
  });

  it('404s when FLOS_PREVIEW_LOGIN is the string "1 " (trailing space — not exactly "1")', async () => {
    process.env.FLOS_PREVIEW_LOGIN = '1 ';
    const GET = await loadHandler();
    const res = await GET(new Request('http://test/api/preview-login') as never);
    expect(res.status).toBe(404);
  });

  it('does not even attempt to read the user when the flag is absent', async () => {
    const GET = await loadHandler();
    await GET(new Request('http://test/api/preview-login') as never);
    expect(adminStub.auth.admin.getUserById).not.toHaveBeenCalled();
    expect(adminStub.auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(adminStub.auth.admin.generateLink).not.toHaveBeenCalled();
  });
});
