# Project instructions

## Protected Bot Captador

BOT CAPTADOR IS A PROTECTED PRODUCTION COMPONENT. Its stability takes priority
over Central de Bots and all new features. Changes to the following require
explicit user authorization specifically covering the protected operation:

- `scripts/olx-executor.mjs`, related executor/scheduler/VM scripts;
- Hyper-V VM, its Chrome, port 9222 and Task Scheduler;
- the 09:00 and 19:00 schedules, scraping, filters and campaigns;
- `src/lib/bot-captador/`, `src/components/bot-captador/`, `src/types/bot-captador.ts`;
- `api/bot-captador.js`, `api/_shared/bot-captador.js`;
- operational tables `bot_settings`, `bot_campaigns`, `bot_message_templates`,
  `bot_captures`, `bot_execution_rounds` and especially `bot_capture_tombstones`;
- existing reservation/contact/import/purge RPCs, deduplication, fingerprints,
  queues, response detection, imports and operational configuration.

Do not rename, remove, remodel or modify these to accommodate agents. If a change
is necessary, stop that change, explain the reason, affected files/tables, risks
and an alternative preserving Captador, and obtain explicit authorization.

The Hyper-V VM belongs exclusively to Captador. No other agent may depend on it.
Central, AI, Sentinela, Gestor and Push failures must never stop Captador.
Keep the existing `/bot-captador` route functional independently of Central.

Central's Captador adapter is read-only. It may not invoke operational RPCs,
execute rounds, edit campaigns/settings, manipulate queues/tombstones, run shell
commands, control the VM or alter scheduling. Do not run tests against production
that insert/reserve/delete Captador rows or tombstones. `--scan` enqueues real
records and is not a side-effect-free test.

## Central de Bots V1

- Keep agent persistence and lifecycle separate from protected Captador tables.
- Scope every data query by authenticated `account_id`; enable RLS on new tables.
- Validate JWTs, tool permissions and human approvals on the backend.
- No arbitrary SQL, shell, code changes, commits or deploys by runtime agents.
- Sentinela may observe, investigate and recommend, never repair production in V1.
- An agent cannot grant its own permissions or approve its own requests.
- Never send service-role credentials, provider keys or internal secrets to clients
  or AI context. Use only explicitly allowlisted tools and provider endpoints.
- Reuse existing AudioRecorder and Web Push infrastructure.
- Keep 30-day chat retention separate from operational runs/events/incidents/approvals.
- Missing/unavailable telemetry is unknown, not a successful check or zero activity.
- The feature flag/kill switch must disable Central without affecting Captador.

## Working and releasing

Preserve unrelated local changes. Prefer additive, isolated, reversible changes.
Before edits, inspect the current architecture and make an implementation plan.
Validate security, build, desktop/mobile/PWA and Captador regression before release.
Do not deploy when a Captador regression fails or its required verification is
incomplete. Do not fix Captador merely to make Central's tests pass.
When checks pass, commit and deploy as requested by the user, then verify production.
Record material decisions and limitations in the final report, not extra planning files.
