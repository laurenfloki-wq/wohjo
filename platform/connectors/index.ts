// Connectors — typed wrappers per provider, each with its own scoped
// credential (HARD CONSTRAINT 5). Direct SDK / fetch; no n8n, no broker
// required (OAuth-lifecycle providers like Xero refresh via a shared helper).

export * as stripe from './stripe';
export * as hubspot from './hubspot';
