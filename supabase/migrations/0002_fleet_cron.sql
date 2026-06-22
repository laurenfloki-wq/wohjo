-- Fleet schedule registration. Defines fleet_register_cron(base_url, cron_secret)
-- which (re)registers a pg_cron job per scheduled bot, invoking the Vercel route
-- /api/fleet/run/<slug> via pg_net with the CRON_SECRET bearer. Call it once
-- after deploy with the real app URL:
--
--   select fleet_register_cron('https://app.flosmosis.com', '<CRON_SECRET>');
--
-- Idempotent: unschedules any existing fleet_* jobs first. Scheduled bots return
-- awaiting_input until their connector + secret exist; the schedule still fires.

create or replace function fleet_register_cron(base_url text, cron_secret text)
returns int
language plpgsql
set search_path = ''
as $$
declare
  jobs jsonb := jsonb_build_object(
    '57-approval-router', '*/10 * * * *',
    '36-reconciliation',  '0 13 * * *',
    '41-usage-metering',  '0 12 * * *',
    '38-bas-gst',         '0 6 1 * *',
    '39-rd-tax-evidence', '0 7 * * 1',
    '40-financial-reporting', '0 6 1 * *',
    '11-icp-list-building', '0 5 * * 1',
    '13-crm-hygiene',     '0 15 * * *',
    '17-renewal-expansion', '0 16 * * *',
    '20-onboarding-health', '30 16 * * *',
    '21-churn-risk',      '0 17 * * *',
    '22-feedback-nps',    '0 18 * * 2',
    '29-contract-lifecycle', '0 19 * * *',
    '31-regulatory-tracker', '0 20 * * *',
    '33-ip-trademark-watch', '0 21 * * 1',
    '1-seo-optimisation', '0 2 * * 1',
    '2-ai-search-visibility', '0 3 * * 1',
    '4-social-publishing', '0 1 * * *',
    '7-competitor-intel', '0 4 * * 1',
    '8-newsletter',       '0 6 1 * *',
    '47-slo-watchdog',    '*/15 * * * *',
    '52-daily-brief',     '0 22 * * *',
    '58-grant-finder',    '0 8 * * 1'
  );
  slug text;
  sched text;
  jobname text;
  n int := 0;
begin
  -- Clear existing fleet jobs.
  perform cron.unschedule(jobid)
  from cron.job
  where jobname like 'fleet_%';

  for slug, sched in select * from jsonb_each_text(jobs) loop
    jobname := 'fleet_' || slug;
    perform cron.schedule(
      jobname,
      sched,
      format(
        $cmd$select net.http_get(url => %L, headers => jsonb_build_object('Authorization', %L))$cmd$,
        base_url || '/api/fleet/run/' || slug,
        'Bearer ' || cron_secret
      )
    );
    n := n + 1;
  end loop;

  -- Durable money/evidence worker, every minute.
  perform cron.schedule(
    'fleet_worker',
    '* * * * *',
    format(
      $cmd$select net.http_get(url => %L, headers => jsonb_build_object('Authorization', %L))$cmd$,
      base_url || '/api/fleet/worker',
      'Bearer ' || cron_secret
    )
  );
  n := n + 1;

  return n;
end;
$$;
