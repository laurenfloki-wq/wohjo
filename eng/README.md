# Engineering bots (GitHub Actions)

Bots whose runtime is GitHub Actions live here logically; the executable
workflows are under `.github/workflows/` (where Actions requires them):

- Bot 42 CI gatekeeper -> `.github/workflows/fleet-ci-gate.yml` + the `gate`
  job in `fleet-deploy.yml`.
- Bot 45 release notes -> handler in `bots/45-release-notes`, invoked from a
  release workflow.
- Bot 47 SLO watchdog -> handler in `bots/47-slo-watchdog`, fed by the external
  uptime monitor + pg_cron.

Pending: 43 dependency/security, 44 incident triage, 46 QA/test generation.
