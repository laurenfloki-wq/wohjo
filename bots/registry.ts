// registry.ts — every bot, wired to a uniform trigger contract.
//
// Each entry: id, trigger, gate, optional cron schedule, and a run() that pulls
// inputs (from the POST/cron payload now, from a connector once built+secret),
// runs the bot's pure core, audits, and routes gated output to the approval
// queue (never auto-sends). Generic routes in src/app/api/fleet dispatch here.

import { InputUnavailable, type BotModule } from './runtime';
import { requireInput, settle, loadVia } from './wiring';
import { connectors } from '../platform/index';
import { activeWorkersByCompany, hasProductDb } from '../platform/product-db';

// Handlers (pure cores)
import * as seo from './1-seo-optimisation/handler';
import * as aisearch from './2-ai-search-visibility/handler';
import * as drafting from './3-content-drafting/handler';
import * as publishing from './4-social-publishing/handler';
import * as engagement from './5-social-engagement/handler';
import * as intel from './7-competitor-intel/handler';
import * as newsletter from './8-newsletter/handler';
import * as outreach from './9-sales-outreach/handler';
import * as enrichment from './10-lead-enrichment/handler';
import * as icp from './11-icp-list-building/handler';
import * as scoring from './12-lead-scoring/handler';
import * as hygiene from './13-crm-hygiene/handler';
import * as replyqual from './14-reply-qualification/handler';
import * as quote from './15-proposal-quote/handler';
import * as scheduling from './16-demo-scheduling/handler';
import * as renewal from './17-renewal-expansion/handler';
import * as clientob from './18-client-onboarding/handler';
import * as workerob from './19-worker-onboarding/handler';
import * as onboardhealth from './20-onboarding-health/handler';
import * as churn from './21-churn-risk/handler';
import * as nps from './22-feedback-nps/handler';
import * as support from './23-client-support/handler';
import * as kb from './24-knowledge-base/handler';
import * as tickets from './25-ticket-triage/handler';
import * as evidence from './26-payroll-evidence/handler';
import * as cdraft from './27-contract-drafting/handler';
import * as creview from './28-contract-review/handler';
import * as clifecycle from './29-contract-lifecycle/handler';
import * as regtrack from './31-regulatory-tracker/handler';
import * as resolution from './32-director-resolution/handler';
import * as ipwatch from './33-ip-trademark-watch/handler';
import * as bookkeeping from './34-bookkeeping/handler';
import * as invoicing from './35-invoicing/handler';
import * as recon from './36-reconciliation/handler';
import * as dunning from './37-dunning/handler';
import * as bas from './38-bas-gst/handler';
import * as rd from './39-rd-tax-evidence/handler';
import * as finrep from './40-financial-reporting/handler';
import * as metering from './41-usage-metering/handler';
import * as slo from './47-slo-watchdog/handler';
import * as releasenotes from './45-release-notes/handler';
import * as incident from './44-incident-triage/handler';
import * as security from './43-dependency-security/handler';
import * as brief from './52-daily-brief/handler';
import * as inbox from './53-inbox-triage/handler';
import * as meeting from './54-meeting-notes/handler';
import * as filing from './55-document-filing/handler';
import * as primer from './56-context-primer/handler';
import * as grants from './58-grant-finder/handler';
import { runExpirySweep } from './57-approval-router/handler';

// In-process guards (no own trigger) — listed for completeness.
const inlineNote = (id: string): BotModule => ({
  id,
  trigger: 'inline',
  gate: 'T0',
  run: async () => ({ status: 'skipped', summary: 'in-process library; called by other bots' }),
});

// CI bots — invoked from GitHub Actions, not the HTTP runtime.
const ciNote = (id: string, gate: BotModule['gate']): BotModule => ({
  id,
  trigger: 'github_actions',
  gate,
  run: async () => ({ status: 'skipped', summary: 'runs in GitHub Actions' }),
});

const MODULES: BotModule[] = [
  // ---- Safety spine -------------------------------------------------------
  inlineNote('bot-6-brand-voice-guardian'),
  inlineNote('bot-30-compliance-guard'),
  {
    id: 'bot-57-approval-router',
    trigger: 'schedule',
    gate: 'T1',
    schedule: '*/10 * * * *',
    run: async () => {
      const { expired } = await runExpirySweep();
      return { status: 'ok', summary: `expiry sweep: ${expired} expired`, data: { expired } };
    },
  },

  // ---- Finance ------------------------------------------------------------
  {
    id: bookkeeping.BOT_ID,
    trigger: 'webhook',
    gate: 'T1',
    run: async (ctx) => {
      const ev = requireInput<bookkeeping.StripeChargeEvent>(ctx, 'event', 'connector:Stripe');
      const mapped = bookkeeping.mapStripeToXero(ev);
      return settle(
        bookkeeping.BOT_ID,
        'T1',
        'map Stripe charge to Xero',
        { mapped },
        {
          gstCents: mapped.gstCents,
        },
      );
    },
  },
  {
    id: invoicing.BOT_ID,
    trigger: 'webhook',
    gate: 'T0',
    run: async (ctx) => {
      const input = requireInput<invoicing.InvoiceInput>(ctx, 'invoice', 'connector:Stripe');
      const inv = invoicing.buildInvoice(input);
      return settle(invoicing.BOT_ID, 'T0', `issue invoice ${inv.number}`, { inv });
    },
  },
  {
    id: recon.BOT_ID,
    trigger: 'schedule',
    gate: 'T2',
    schedule: '0 13 * * *',
    run: async (ctx) => {
      const rows = requireInput<recon.ThreeWayRow[]>(ctx, 'rows', 'connector:Stripe+Xero+ledger');
      const breaks = recon.threeWayMatch(rows);
      if (breaks.length === 0)
        return { status: 'ok', summary: 'reconciliation clean', data: { breaks: 0 } };
      return settle(recon.BOT_ID, 'T2', `${breaks.length} reconciliation break(s)`, { breaks });
    },
  },
  {
    id: dunning.BOT_ID,
    trigger: 'webhook',
    gate: 'T2',
    run: async (ctx) => {
      const attempt = requireInput<number>(ctx, 'attempt', 'connector:Stripe');
      const step = dunning.dunningStep(attempt);
      if (step.escalateToHuman)
        return { status: 'ok', summary: 'dunning exhausted; hand off', data: { step } };
      return settle(dunning.BOT_ID, 'T2', `dunning attempt ${attempt}`, { step });
    },
  },
  {
    id: bas.BOT_ID,
    trigger: 'schedule',
    gate: 'T2',
    schedule: '0 6 1 * *',
    run: async (ctx) => {
      const txns = requireInput<bas.PeriodTxn[]>(ctx, 'txns', 'connector:Xero');
      const figures = bas.assembleBas(txns);
      return settle(bas.BOT_ID, 'T2', 'BAS figures ready to lodge', { figures });
    },
  },
  {
    id: rd.BOT_ID,
    trigger: 'schedule',
    gate: 'T1',
    schedule: '0 7 * * 1',
    run: async (ctx) => {
      const items = requireInput<rd.SpendItem[]>(ctx, 'items', 'connector:GitHub+Xero');
      const e = rd.tagEligibleSpend(items);
      return settle(rd.BOT_ID, 'T1', 'R&D eligible spend tagged', {
        totalEligibleCents: e.totalEligibleCents,
      });
    },
  },
  {
    id: finrep.BOT_ID,
    trigger: 'schedule',
    gate: 'T1',
    schedule: '0 6 1 * *',
    run: async (ctx) => {
      // Self-feeds P&L from Xero when XERO_ACCESS_TOKEN is set; cash balance is
      // supplied via input (bank summary) and defaults to 0.
      const f = await loadVia<finrep.MonthFigures>(
        ctx,
        'figures',
        'connector:Xero',
        'XERO_ACCESS_TOKEN',
        async () => {
          const now = new Date();
          const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
          const to = now.toISOString().slice(0, 10);
          const pnl = connectors.xero.parseProfitAndLoss(
            await connectors.xero.getProfitAndLoss(from, to),
          );
          const cashBalanceCents = Number(ctx.input.cashBalanceCents ?? 0);
          return { ...pnl, cashBalanceCents };
        },
      );
      const report = finrep.buildReport(f);
      return settle(finrep.BOT_ID, 'T1', 'monthly financial report', { report });
    },
  },
  {
    id: metering.BOT_ID,
    trigger: 'schedule',
    gate: 'T2',
    schedule: '0 12 * * *',
    run: async (ctx) => {
      // Metered active-worker counts self-feed from the product DB; the billed
      // counts come from Stripe (supplied via input until the Stripe billing
      // read is wired). Without billed counts we cannot verify a mismatch, so
      // we await input rather than silently report "all good".
      let rows: metering.MeteringRow[];
      const provided = ctx.input.rows as metering.MeteringRow[] | undefined;
      if (provided) {
        rows = provided;
      } else if (hasProductDb()) {
        const billed = ctx.input.billed as Record<string, number> | undefined;
        if (!billed) throw new InputUnavailable('connector:Stripe-billed-counts');
        const metered = await activeWorkersByCompany();
        rows = metered.map((m) => ({
          tenantId: m.tenantId,
          meteredActiveWorkers: m.activeWorkers,
          billedActiveWorkers: billed[m.tenantId] ?? 0,
        }));
      } else {
        throw new InputUnavailable('connector:product-DB+Stripe');
      }
      const flags = metering.findMismatches(rows);
      if (flags.length === 0)
        return { status: 'ok', summary: 'usage ties to billing', data: { flags: 0 } };
      return settle(metering.BOT_ID, 'T2', `${flags.length} metering mismatch(es)`, { flags });
    },
  },

  // ---- CRM ----------------------------------------------------------------
  {
    id: enrichment.BOT_ID,
    trigger: 'webhook',
    gate: 'T0',
    run: async (ctx) => {
      const raw = requireInput<enrichment.RawContact[]>(ctx, 'contacts', 'connector:HubSpot');
      const out = enrichment.dedupe(raw.map(enrichment.normalise));
      return settle(
        enrichment.BOT_ID,
        'T0',
        `normalised ${out.length} contacts`,
        {},
        { count: out.length },
      );
    },
  },
  {
    id: icp.BOT_ID,
    trigger: 'schedule',
    gate: 'T1',
    schedule: '0 5 * * 1',
    run: async (ctx) => {
      const pulled = requireInput<icp.Licensee[]>(ctx, 'licensees', 'connector:state-registers');
      const known = requireInput<string[]>(ctx, 'known', 'connector:state-registers');
      const fresh = icp.newLicensees(pulled, new Set(known));
      return settle(icp.BOT_ID, 'T1', `${fresh.length} new licensees`, { fresh });
    },
  },
  {
    id: scoring.BOT_ID,
    trigger: 'webhook',
    gate: 'T0',
    run: async (ctx) => {
      const signals = requireInput<scoring.LeadSignals>(ctx, 'signals', 'connector:HubSpot');
      const scored = scoring.scoreLead(signals);
      return settle(scoring.BOT_ID, 'T0', `lead scored ${scored.score} (${scored.band})`, {
        scored,
      });
    },
  },
  {
    id: hygiene.BOT_ID,
    trigger: 'schedule',
    gate: 'T0',
    schedule: '0 15 * * *',
    run: async (ctx) => {
      // Self-feeds from HubSpot when HUBSPOT_PRIVATE_APP_TOKEN is set.
      const contacts = await loadVia<hygiene.CrmContact[]>(
        ctx,
        'contacts',
        'connector:HubSpot',
        'HUBSPOT_PRIVATE_APP_TOKEN',
        async () => {
          const now = Date.now();
          return (await connectors.hubspot.listContacts()).map((c) =>
            connectors.hubspot.toCrmContact(c, now),
          );
        },
      );
      const plan = hygiene.buildHygienePlan(contacts);
      return settle(hygiene.BOT_ID, 'T0', 'hygiene plan built', { plan });
    },
  },
  {
    id: replyqual.BOT_ID,
    trigger: 'webhook',
    gate: 'T2',
    run: async (ctx) => {
      const text = requireInput<string>(ctx, 'text', 'connector:Gmail');
      const q = replyqual.qualifyReply(text);
      if (!q.shouldDraft)
        return { status: 'ok', summary: `routed ${q.category} -> ${q.route}`, data: { q } };
      return settle(replyqual.BOT_ID, 'T2', `draft reply (${q.category})`, { q });
    },
  },
  {
    id: scheduling.BOT_ID,
    trigger: 'http',
    gate: 'T1',
    run: async (ctx) => {
      const candidates = requireInput<scheduling.Interval[]>(
        ctx,
        'candidates',
        'connector:Google-Calendar',
      );
      const existing = requireInput<scheduling.Interval[]>(
        ctx,
        'existing',
        'connector:Google-Calendar',
      );
      const slots = scheduling.offerSlots(candidates, existing, 3);
      return settle(scheduling.BOT_ID, 'T1', `${slots.length} slots offered`, { slots });
    },
  },
  {
    id: renewal.BOT_ID,
    trigger: 'schedule',
    gate: 'T2',
    schedule: '0 16 * * *',
    run: async (ctx) => {
      const subs = requireInput<renewal.Subscription[]>(ctx, 'subs', 'connector:Stripe+Supabase');
      const flags = renewal.detectRenewalsAndExpansion(subs);
      if (flags.length === 0)
        return { status: 'ok', summary: 'no renewals/expansion', data: { flags: 0 } };
      return settle(renewal.BOT_ID, 'T2', `${flags.length} renewal/expansion flags`, { flags });
    },
  },

  // ---- Client & worker lifecycle -----------------------------------------
  {
    id: clientob.BOT_ID,
    trigger: 'webhook',
    gate: 'T2',
    run: async (ctx) => {
      const step = requireInput<clientob.SetupStep>(ctx, 'step', 'connector:Supabase');
      const next = clientob.nextStep(step);
      const summary = next ? `guide to ${next}` : 'onboarding complete';
      return settle(clientob.BOT_ID, 'T2', summary, { step, next });
    },
  },
  {
    id: workerob.BOT_ID,
    trigger: 'webhook',
    gate: 'T1',
    run: async (ctx) => {
      const current = requireInput<workerob.WorkerStep>(ctx, 'current', 'connector:worker-PWA');
      const to = requireInput<workerob.WorkerStep>(ctx, 'to', 'connector:worker-PWA');
      const result = workerob.applyAdvance(current, to);
      return settle(workerob.BOT_ID, 'T1', `worker step -> ${result}`, { result });
    },
  },
  {
    id: onboardhealth.BOT_ID,
    trigger: 'schedule',
    gate: 'T1',
    schedule: '30 16 * * *',
    run: async (ctx) => {
      const states = requireInput<onboardhealth.OnboardingState[]>(
        ctx,
        'states',
        'connector:Supabase',
      );
      const stalled = onboardhealth.findStalled(states);
      return settle(onboardhealth.BOT_ID, 'T1', `${stalled.length} stalled onboardings`, {
        stalled,
      });
    },
  },
  {
    id: churn.BOT_ID,
    trigger: 'schedule',
    gate: 'T1',
    schedule: '0 17 * * *',
    run: async (ctx) => {
      const signals = requireInput<churn.UsageSignals[]>(ctx, 'signals', 'connector:Supabase');
      const ranked = churn.rankChurn(signals);
      return settle(churn.BOT_ID, 'T1', `${ranked.length} tenants scored`, {
        top: ranked.slice(0, 5),
      });
    },
  },
  {
    id: nps.BOT_ID,
    trigger: 'schedule',
    gate: 'T2',
    schedule: '0 18 * * 2',
    run: async (ctx) => {
      const responses = requireInput<nps.NpsResponse[]>(ctx, 'responses', 'connector:survey');
      const result = nps.computeNps(responses);
      return settle(nps.BOT_ID, 'T2', `NPS ${result.nps}`, { result });
    },
  },

  // ---- Support ------------------------------------------------------------
  {
    id: support.BOT_ID,
    trigger: 'http',
    gate: 'T0',
    run: async (ctx) => {
      const query = requireInput<string>(ctx, 'query', 'chat');
      const sources = (ctx.input.sources as support.RetrievedSource[] | undefined) ?? [];
      const action = support.decideSupportAction(query, sources);
      if (action.kind === 'escalate') {
        return settle(support.BOT_ID, 'T2', `escalate: ${action.reason}`, { query });
      }
      if (action.kind === 'evidence') {
        return {
          status: 'ok',
          summary: 'route to sealed-record evidence (bot 26)',
          data: { kind: action.kind, reason: action.reason },
        };
      }
      if (action.kind === 'clarify') {
        return {
          status: 'ok',
          summary: 'ask a clarifying question',
          data: { kind: action.kind, reason: action.reason },
        };
      }
      return { status: 'ok', summary: 'answer grounded (T0)', data: { kind: action.kind } };
    },
  },
  {
    id: kb.BOT_ID,
    trigger: 'webhook',
    gate: 'T1',
    run: async (ctx) => {
      const text = requireInput<string>(ctx, 'article', 'connector:helpdesk');
      const chunks = kb.chunkText(text);
      return settle(
        kb.BOT_ID,
        'T1',
        `KB article: ${chunks.length} chunks`,
        {},
        { chunks: chunks.length },
      );
    },
  },
  {
    id: tickets.BOT_ID,
    trigger: 'webhook',
    gate: 'T0',
    run: async (ctx) => {
      const t = requireInput<tickets.Ticket>(ctx, 'ticket', 'connector:helpdesk');
      const triaged = tickets.triageTicket(t);
      return settle(tickets.BOT_ID, 'T0', `${triaged.priority} -> ${triaged.queue}`, { triaged });
    },
  },
  {
    id: evidence.BOT_ID,
    trigger: 'http',
    gate: 'T0',
    run: async (ctx) => {
      const record = requireInput<evidence.SealedRecord>(
        ctx,
        'record',
        'connector:Supabase-sealed',
      );
      const e = evidence.buildEvidence(record);
      return settle(
        evidence.BOT_ID,
        'T0',
        `evidence for ${e.sourceId}`,
        {},
        { sourceId: e.sourceId },
      );
    },
  },

  // ---- Legal / compliance -------------------------------------------------
  {
    id: cdraft.BOT_ID,
    trigger: 'http',
    gate: 'T3',
    run: async (ctx) => {
      const type = requireInput<cdraft.ContractType>(ctx, 'type', 'template');
      const clauses = requireInput<string[]>(ctx, 'clauses', 'template');
      const review = cdraft.reviewDraft(type, clauses);
      return settle(cdraft.BOT_ID, 'T3', `draft ${type} contract`, { review });
    },
  },
  {
    id: creview.BOT_ID,
    trigger: 'webhook',
    gate: 'T3',
    run: async (ctx) => {
      const playbook = requireInput<creview.PlaybookClause[]>(ctx, 'playbook', 'playbook');
      const incoming = requireInput<creview.IncomingClause[]>(ctx, 'incoming', 'inbound-contract');
      const deviations = creview.findDeviations(playbook, incoming);
      return settle(creview.BOT_ID, 'T3', `${deviations.length} deviations`, { deviations });
    },
  },
  {
    id: clifecycle.BOT_ID,
    trigger: 'schedule',
    gate: 'T1',
    schedule: '0 19 * * *',
    run: async (ctx) => {
      const contracts = requireInput<clifecycle.Contract[]>(ctx, 'contracts', 'connector:Supabase');
      const alerts = clifecycle.lifecycleAlerts(contracts);
      return settle(clifecycle.BOT_ID, 'T1', `${alerts.length} lifecycle alerts`, { alerts });
    },
  },
  {
    id: regtrack.BOT_ID,
    trigger: 'schedule',
    gate: 'T1',
    schedule: '0 20 * * *',
    run: async (ctx) => {
      const submissions = requireInput<regtrack.Submission[]>(
        ctx,
        'submissions',
        'connector:Supabase',
      );
      const alerts = regtrack.submissionAlerts(submissions);
      return settle(regtrack.BOT_ID, 'T1', `${alerts.length} submission alerts`, { alerts });
    },
  },
  {
    id: resolution.BOT_ID,
    trigger: 'http',
    gate: 'T3',
    run: async (ctx) => {
      const input = requireInput<resolution.ResolutionInput>(ctx, 'resolution', 'manual');
      const entry = resolution.buildRegisterEntry(input);
      return settle(resolution.BOT_ID, 'T3', `director resolution: ${entry.title}`, { entry });
    },
  },
  {
    id: ipwatch.BOT_ID,
    trigger: 'schedule',
    gate: 'T1',
    schedule: '0 21 * * 1',
    run: async (ctx) => {
      const hits = requireInput<ipwatch.RegisterHit[]>(ctx, 'hits', 'connector:IP-registers');
      const flagged = ipwatch.flagHits(hits);
      return settle(ipwatch.BOT_ID, 'T1', `${flagged.length} mark collisions`, { flagged });
    },
  },

  // ---- Growth -------------------------------------------------------------
  {
    id: seo.BOT_ID,
    trigger: 'schedule',
    gate: 'T1',
    schedule: '0 2 * * 1',
    run: async (ctx) => {
      const pages = requireInput<seo.PageSnapshot[]>(ctx, 'pages', 'connector:site-crawl');
      const issues = seo.auditSite(pages);
      return settle(seo.BOT_ID, 'T1', `${issues.length} SEO issues`, { issues });
    },
  },
  {
    id: aisearch.BOT_ID,
    trigger: 'schedule',
    gate: 'T1',
    schedule: '0 3 * * 1',
    run: async (ctx) => {
      const results = requireInput<aisearch.PromptResult[]>(
        ctx,
        'results',
        'connector:answer-engines',
      );
      const scored = results.map(aisearch.presenceScore);
      return settle(aisearch.BOT_ID, 'T1', `${scored.length} prompts scored`, { scored });
    },
  },
  {
    id: drafting.BOT_ID,
    trigger: 'http',
    gate: 'T2',
    run: async (ctx) => {
      const text = requireInput<string>(ctx, 'draft', 'manual');
      const v = drafting.validateContentDraft(text);
      if (!v.ok) return { status: 'skipped', summary: `off-voice: ${v.issues.join('; ')}` };
      return settle(drafting.BOT_ID, 'T2', 'publish content draft', { text });
    },
  },
  {
    id: publishing.BOT_ID,
    trigger: 'schedule',
    gate: 'T1',
    schedule: '0 1 * * *',
    run: async (ctx) => {
      const posts = requireInput<publishing.ScheduledPost[]>(ctx, 'posts', 'connector:social-APIs');
      const due = publishing.duePosts(posts, Date.now());
      return settle(publishing.BOT_ID, 'T1', `${due.length} posts due`, { due });
    },
  },
  {
    id: engagement.BOT_ID,
    trigger: 'webhook',
    gate: 'T2',
    run: async (ctx) => {
      const c = requireInput<engagement.IncomingComment>(ctx, 'comment', 'connector:social-APIs');
      const t = engagement.triageComment(c);
      if (!t.shouldDraft) return { status: 'ok', summary: `${t.intent}; no draft`, data: { t } };
      return settle(engagement.BOT_ID, 'T2', `draft reply (${t.intent})`, { t });
    },
  },
  {
    id: intel.BOT_ID,
    trigger: 'schedule',
    gate: 'T1',
    schedule: '0 4 * * 1',
    run: async (ctx) => {
      const sources = requireInput<intel.Source[]>(ctx, 'sources', 'connector:search+feeds');
      const curated = intel.curateSources(sources, Date.now(), 7 * 86_400_000);
      return settle(intel.BOT_ID, 'T1', `${curated.length} distinct sources`, { curated });
    },
  },
  {
    id: newsletter.BOT_ID,
    trigger: 'schedule',
    gate: 'T2',
    schedule: '0 6 1 * *',
    run: async (ctx) => {
      const input = requireInput<newsletter.NewsletterInput>(
        ctx,
        'newsletter',
        'connector:content-store',
      );
      const email = newsletter.assembleNewsletter(input);
      return settle(newsletter.BOT_ID, 'T2', 'send newsletter', { email });
    },
  },

  // ---- Sales --------------------------------------------------------------
  {
    id: outreach.BOT_ID,
    trigger: 'http',
    gate: 'T2',
    run: async (ctx) => {
      const input = requireInput<outreach.OutreachInput>(
        ctx,
        'outreach',
        'connector:HubSpot+Gmail',
      );
      const email = outreach.buildOutreachEmail(input);
      return settle(outreach.BOT_ID, 'T2', 'send outreach', { email });
    },
  },
  {
    id: quote.BOT_ID,
    trigger: 'http',
    gate: 'T2',
    run: async (ctx) => {
      const tier = requireInput<quote.Quote['tier']>(ctx, 'tier', 'manual');
      const workers = requireInput<number>(ctx, 'activeWorkers', 'manual');
      const q = quote.buildQuote(tier, workers);
      return settle(quote.BOT_ID, 'T2', `quote ${q.totalCents}c`, { q });
    },
  },

  // ---- Engineering (HTTP-invocable; SLO + incident + security) -----------
  {
    id: slo.BOT_ID,
    trigger: 'schedule',
    gate: 'T1',
    schedule: '*/15 * * * *',
    run: async (ctx) => {
      const w = requireInput<slo.SloWindow>(ctx, 'window', 'connector:uptime+Sentry');
      const a = slo.assessBurn(w);
      if (a.rollback) return settle(slo.BOT_ID, 'T1', 'SLO fast burn: rollback', { a });
      return { status: 'ok', summary: `burn ${a.burnRate.toFixed(2)}x`, data: { a } };
    },
  },
  {
    id: incident.BOT_ID,
    trigger: 'webhook',
    gate: 'T2',
    run: async (ctx) => {
      const events = requireInput<incident.SentryEvent[]>(ctx, 'events', 'connector:Sentry');
      const grouped = incident.groupIncidents(events);
      return settle(incident.BOT_ID, 'T2', `${grouped.length} incidents`, { grouped });
    },
  },
  {
    id: security.BOT_ID,
    trigger: 'webhook',
    gate: 'T1',
    run: async (ctx) => {
      const findings = requireInput<security.Finding[]>(ctx, 'findings', 'connector:scanners');
      const triaged = security.triage(findings);
      return settle(security.BOT_ID, 'T1', `${triaged.length} findings triaged`, { triaged });
    },
  },
  ciNote('bot-42-ci-gatekeeper', 'T1'),
  ciNote(releasenotes.BOT_ID, 'T1'),
  ciNote('bot-46-qa-test-generation', 'T2'),
  ciNote(primer.BOT_ID, 'T1'),

  // ---- Internal ops -------------------------------------------------------
  {
    id: brief.BOT_ID,
    trigger: 'schedule',
    gate: 'T1',
    schedule: '0 22 * * *',
    run: async (ctx) => {
      const inputs = requireInput<brief.BriefInputs>(
        ctx,
        'inputs',
        'connector:Stripe+HubSpot+GitHub',
      );
      const sections = brief.assembleBrief(inputs);
      return settle(brief.BOT_ID, 'T1', 'daily brief assembled', { sections });
    },
  },
  {
    id: inbox.BOT_ID,
    trigger: 'webhook',
    gate: 'T2',
    run: async (ctx) => {
      const mail = requireInput<inbox.InboundMail>(ctx, 'mail', 'connector:Gmail');
      const t = inbox.triageMail(mail);
      if (!t.shouldDraft)
        return { status: 'ok', summary: `${t.category}; surface=${t.needsDirector}`, data: { t } };
      return settle(inbox.BOT_ID, 'T2', `draft reply (${t.category})`, { t });
    },
  },
  {
    id: meeting.BOT_ID,
    trigger: 'webhook',
    gate: 'T1',
    run: async (ctx) => {
      const lines = requireInput<string[]>(ctx, 'transcript', 'connector:Drive');
      const actions = meeting.extractActions(lines);
      const decisions = meeting.extractDecisions(lines);
      return settle(
        meeting.BOT_ID,
        'T1',
        `${actions.length} actions, ${decisions.length} decisions`,
        {
          actions,
          decisions,
        },
      );
    },
  },
  {
    id: filing.BOT_ID,
    trigger: 'webhook',
    gate: 'T0',
    run: async (ctx) => {
      const opts = requireInput<Parameters<typeof filing.buildFileName>[0]>(
        ctx,
        'doc',
        'connector:Drive',
      );
      const name = filing.buildFileName(opts);
      return settle(
        filing.BOT_ID,
        'T0',
        `filed ${name}`,
        {},
        { name, retentionYears: filing.retentionYears(opts.type) },
      );
    },
  },
  {
    id: grants.BOT_ID,
    trigger: 'schedule',
    gate: 'T3',
    schedule: '0 8 * * 1',
    run: async (ctx) => {
      const grantList = requireInput<grants.Grant[]>(ctx, 'grants', 'connector:grant-sources');
      const criteria = requireInput<grants.FleetCriteria>(
        ctx,
        'criteria',
        'connector:grant-sources',
      );
      const matched = grants.matchGrants(grantList, criteria);
      return settle(grants.BOT_ID, 'T3', `${matched.length} eligible grants`, { matched });
    },
  },
];

/** Registry keyed by slug (id without the `bot-` prefix), e.g. "34-bookkeeping". */
export const REGISTRY: Record<string, BotModule> = Object.fromEntries(
  MODULES.map((m) => [m.id.replace(/^bot-/, ''), m]),
);

/** Scheduled bots and their cron expressions, for vercel.json generation. */
export function schedules(): Array<{ slug: string; schedule: string }> {
  return Object.entries(REGISTRY)
    .filter(([, m]) => m.schedule)
    .map(([slug, m]) => ({ slug, schedule: m.schedule! }));
}
