// Barrel for the FLOSMOSIS bot fleet shared platform.
// Bots import from here: `import { record, guard, complete } from '../../platform';`

export * from './types';
export * from './env';
export { log, botLogger } from './log';
export { db, closeDb, __setDb } from './db';
export { record, verifyChain } from './audit';
export * as guard from './guard';
export {
  GuardError,
  containsEmoji,
  assertNoEmoji,
  assertSpamActCompliant,
  assertGrounded,
} from './guard';
export {
  complete,
  completeJson,
  BudgetExceededError,
  FleetHaltedError,
  type LlmCallOptions,
} from './llm';
export { enqueue, drain, ensureQueue, claimIdempotency, type QueueMessage } from './queue';
export {
  requestApproval,
  resolveApproval,
  listPending,
  sweepExpired,
  type RequestApprovalInput,
  type ResolutionResult,
} from './hitl';
export { checkHealth, botCost, fleetCost, type HealthResult } from './obs';
export * as connectors from './connectors';
