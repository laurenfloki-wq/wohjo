// Flostruction — Service-role client confinement (finding C, 2026-06-10)
//
// The service-role client bypasses RLS. 45 of 58 API routes called
// createServiceClient() directly; each direct call holds the bypass
// key and nothing enforces the company_id scoping discipline beyond
// convention. This module is the chokepoint: route handlers must not
// import createServiceClient directly (ESLint guard, warn during the
// incremental migration, error once zero direct calls remain) — they
// receive a pre-scoped repository from src/lib/db/repositories/*
// instead.
//
// THIS IS THE ONLY MODULE PERMITTED TO CALL createServiceClient().

import { createServiceClient } from '@/lib/supabase/server';

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * Service-role client for use INSIDE repository factories only
 * (src/lib/db/repositories/*). Repositories bind every query to a
 * companyId / workerId at construction, so routes never see the raw
 * bypass-RLS client.
 */
export function getServiceClient(): ServiceClient {
  return createServiceClient();
}

/**
 * Unscoped service-role client for system jobs that are cross-company
 * BY DESIGN and carry no session companyId: cron/* schedules,
 * webhooks/twilio/*, stripe/webhook. The name is deliberately loud.
 *
 * Do NOT use this from a request handler that has a session — derive
 * companyId via getCompanyIdForSession / requireCompanyMembership and
 * use a scoped repository instead. "System jobs need it" is not a
 * blanket exemption for request handlers.
 */
export function getServiceClientForSystemJob(): ServiceClient {
  return createServiceClient();
}
