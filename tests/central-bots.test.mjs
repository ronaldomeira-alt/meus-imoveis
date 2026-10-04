import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  authorize,
  createAgentHandler,
} from '../supabase/functions/_shared/central-bots/handler.js';
import {
  AgentError,
  BUILTINS,
  rangeArgs,
  maintenanceDossier,
  redactOperationalData,
} from '../supabase/functions/_shared/central-bots/core.js';
import { expectedCaptureSlot, isDailyInspectionDue } from '../supabase/functions/_shared/central-bots/sentinel.js';
import {
  allowedTools,
  executeTool,
} from '../supabase/functions/_shared/central-bots/tools.js';
import {
  createAIProvider,
  groundedReply,
} from '../supabase/functions/_shared/central-bots/ai-provider.js';
import {
  getBot,
  decideApproval,
} from '../supabase/functions/_shared/central-bots/service.js';

const account = '11111111-1111-4111-8111-111111111111',
  botId = '22222222-2222-4222-8222-222222222222';
const env = {
  CENTRAL_BOTS_ENABLED: 'true',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service',
  SUPABASE_ANON_KEY: 'test-anon',
};
function factoryFixture({
  email = 'ronaldomeira@gmail.com',
  authError = false,
  enabled = true,
  accountId = account,
} = {}) {
  const calls = [];
  const factory = (_url, key) => ({
    auth: {
      getUser: async (token) => {
        calls.push(['auth', token]);
        return {
          data: { user: authError ? null : { id: botId, email } },
          error: authError,
        };
      },
    },
    rpc: async (name) => {
      calls.push(['rpc', name, key]);
      return { data: accountId, error: null };
    },
    from: (table) => {
      const query = {
        select() {
          return this;
        },
        eq(field, value) {
          calls.push([table, field, value]);
          return this;
        },
        maybeSingle: async () => ({
          data:
            table === 'agent_runtime_settings'
              ? { enabled, cron_secret: 'test-cron-secret' }
              : null,
          error: null,
        }),
      };
      return query;
    },
  });
  return { factory, calls };
}
function req(body, headers = {}) {
  return new Request('https://example.supabase.co/functions/v1/central-bots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

test('kill switch and CORS reject requests before opening a database client', async () => {
  const factory = () => {
    throw new Error('Must not connect');
  };
  const disabled = createAgentHandler(
    { ...env, CENTRAL_BOTS_ENABLED: 'false' },
    { factory },
  );
  assert.equal((await disabled(req({ action: 'list' }))).status, 503);
  const handler = createAgentHandler(env, { factory });
  assert.equal(
    (await handler(req({ action: 'list' }, { origin: 'https://evil.example' })))
      .status,
    403,
  );
  assert.equal(
    (
      await handler(
        new Request('https://example.test', {
          method: 'OPTIONS',
          headers: { origin: 'https://ronaldomeira.com.br' },
        }),
      )
    ).status,
    204,
  );
});
test('JWT must validate server-side and account is resolved independently of request body', async () => {
  const { factory, calls } = factoryFixture();
  await assert.rejects(
    authorize(req({}), {}, env, factory),
    (e) => e.status === 401,
  );
  const ctx = await authorize(
    req({}, { authorization: 'Bearer signed-test-token' }),
    { account_id: botId },
    env,
    factory,
  );
  assert.equal(ctx.accountId, account);
  assert.ok(
    calls.some(
      (c) =>
        c[0] === 'rpc' &&
        c[1] === 'current_inventory_account_id' &&
        c[2] === 'test-anon',
    ),
  );
  for (const fixture of [
    { authError: true },
    { email: 'another@example.com' },
    { accountId: null },
    { enabled: false },
  ]) {
    await assert.rejects(
      authorize(
        req({}, { authorization: 'Bearer invalid' }),
        {},
        env,
        factoryFixture(fixture).factory,
      ),
      AgentError,
    );
  }
});
test('cron requires a dedicated token scoped to the supplied account and bot', async () => {
  const { factory, calls } = factoryFixture();
  const body = { action: 'tick', account_id: account, bot_id: botId };
  for (const secret of ['', 'wrong-token', 'test-cron-secret-extra']) {
    await assert.rejects(
      authorize(req(body, { 'x-central-cron': secret }), body, env, factory),
      (e) => e.status === 401,
    );
  }
  const ctx = await authorize(
    req(body, { 'x-central-cron': 'test-cron-secret' }),
    body,
    env,
    factory,
  );
  assert.equal(ctx.accountId, account);
  assert.equal(ctx.user, null);
  assert.ok(
    calls.some(
      (c) =>
        c[0] === 'agent_runtime_settings' &&
        c[1] === 'account_id' &&
        c[2] === account,
    ),
  );
  await assert.rejects(
    decideApproval(ctx, { approval_id: botId, decision: 'approve' }),
    AgentError,
  );
});
test('handler rejects oversized, malformed and unrecognized actions without exposing secrets', async () => {
  const { factory } = factoryFixture();
  const handler = createAgentHandler(env, { factory });
  const response = await handler(
    req(
      { action: 'execute_sql', sql: 'delete from bot_captures' },
      { authorization: 'Bearer token' },
    ),
  );
  assert.equal(response.status, 403);
  assert.doesNotMatch(await response.text(), /test-service|test-cron-secret/);
  assert.equal(
    (await handler(req({}, { 'content-length': '4000001' }))).status,
    413,
  );
  assert.equal(
    (
      await handler(
        new Request('https://example.test', {
          method: 'POST',
          body: 'not json',
        }),
      )
    ).status,
    400,
  );
});
test('all built-ins and custom bots are bounded by the server tool allowlist', async () => {
  for (const bot of BUILTINS) assert.ok(allowedTools(bot).length);
  const captador = {
    ...BUILTINS[1],
    tools: [...BUILTINS[1].tools, 'execute_sql', 'getPendingApprovals'],
  };
  assert.ok(
    !allowedTools(captador).some((t) =>
      ['execute_sql', 'getPendingApprovals'].includes(t.name),
    ),
  );
  assert.equal(
    allowedTools({
      kind: 'custom',
      tools: ['execute_sql', 'getCaptureSummary'],
    }).length,
    1,
  );
  await assert.rejects(
    executeTool({}, captador, null, 'execute_sql', {}),
    (e) => e.status === 403,
  );
  await assert.rejects(
    executeTool({}, captador, null, 'getCaptureSummary', { account_id: botId }),
    AgentError,
  );
  const auditOnly = {
    db: { from: () => ({ insert: async () => ({ data: null, error: null }) }) },
  };
  await assert.rejects(
    executeTool(auditOnly, captador, null, 'getCaptureSummary', { days: 0 }),
    AgentError,
  );
  for (const args of [
    { days: 91 },
    { limit: 31 },
    { days: 1.5 },
    { limit: '10' },
  ])
    assert.throws(() => rangeArgs(args), AgentError);
  assert.match(rangeArgs({ period: 'today' }).since, /T03:00:00.000Z$/);
  assert.throws(() => rangeArgs({ period: 'future' }), AgentError);
});
test('cross-account bot lookup stays scoped even with a valid UUID', async () => {
  const { factory, calls } = factoryFixture();
  await assert.rejects(
    getBot({ db: factory('', ''), accountId: account }, botId),
    (e) => e.status === 404,
  );
  assert.ok(
    calls.some(
      (c) => c[0] === 'agent_bots' && c[1] === 'account_id' && c[2] === account,
    ),
  );
});
test('expected schedules honor Sao Paulo and grace period without inventing an hourly Captador round', () => {
  const campaigns = [{ is_active: true, schedule_times: ['09:00', '19:00'] }];
  assert.equal(
    expectedCaptureSlot(
      campaigns,
      new Date('2026-10-03T12:20:00Z'),
    ).toISOString(),
    '2026-10-02T22:00:00.000Z',
  );
  assert.equal(
    expectedCaptureSlot(
      campaigns,
      new Date('2026-10-03T13:31:00Z'),
    ).toISOString(),
    '2026-10-03T12:00:00.000Z',
  );
  assert.equal(
    expectedCaptureSlot(
      campaigns,
      new Date('2026-10-03T23:00:00Z'),
    ).toISOString(),
    '2026-10-03T12:00:00.000Z',
  );
  assert.equal(
    expectedCaptureSlot([{ ...campaigns[0], is_active: false }]),
    null,
  );
});
test('dossier can never authorize repairs or self-approval', () => {
  const dossier = maintenanceDossier({
    id: botId,
    dossier: {
      execution_allowed: true,
      authorization: { status: 'approved' },
      scope: 'write',
    },
  });
  assert.equal(dossier.execution_allowed, false);
  assert.equal(dossier.authorization, null);
  assert.equal(dossier.scope, 'read_only_investigation');
});
test('deep inspection runs once per Sao Paulo day, not after a jitter-sensitive 24-hour interval', () => {
  assert.equal(isDailyInspectionDue(null), true);
  assert.equal(isDailyInspectionDue('2026-10-03T03:07:05Z', new Date('2026-10-04T03:07:01Z')), true);
  assert.equal(isDailyInspectionDue('2026-10-03T03:07:05Z', new Date('2026-10-04T02:59:00Z')), false);
});
test('AI adapters require server-only credentials and reject ungrounded numbers', () => {
  assert.throws(
    () => createAIProvider({ VITE_GROQ_API_KEY: 'browser-key' }),
    AgentError,
  );
  assert.throws(
    () =>
      createAIProvider({
        GROQ_API_KEY: 'test',
        AGENT_GROQ_MODEL: '../?url=evil',
      }),
    AgentError,
  );
  assert.match(
    groundedReply('999 contatos', [{ data: { count: 3 } }]),
    /Prefiro não te passar um resultado incerto/,
  );
  assert.equal(
    groundedReply('3 contatos', [{ data: { count: 3 } }]),
    '3 contatos',
  );
  assert.match(
    groundedReply('Tudo funcionando.', []),
    /confirmar os dados.*segurança/,
  );
});
test('operational evidence redacts credentials before reaching AI or chat sources', () => {
  const cleaned = redactOperationalData(
    {
      secret: 'hidden',
      log: 'Bearer sensitive-value api_key=another-sensitive-value',
      nested: [{ value: 'provider-value-that-is-secret' }],
      count: 3,
    },
    { GROQ_API_KEY: 'provider-value-that-is-secret' },
  );
  assert.doesNotMatch(
    JSON.stringify(cleaned),
    /sensitive-value|provider-value|hidden/,
  );
  assert.equal(cleaned.count, 3);
});
test('Gemini returns reasoning signatures intact on the next request', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return Response.json({
      candidates: [
        {
          content: {
            role: 'model',
            parts: [
              {
                functionCall: { name: 'getCaptureSummary', args: {} },
                thoughtSignature: 'test-signature',
              },
            ],
          },
        },
      ],
    });
  };
  try {
    const provider = createAIProvider({ GEMINI_API_KEY: 'test-key' });
    const reply = await provider.complete({
      messages: [{ role: 'user', content: 'Resumo' }],
      tools: allowedTools(BUILTINS[1]),
    });
    await provider.complete({
      messages: [
        { role: 'user', content: 'Resumo' },
        reply,
        { role: 'tool', name: 'getCaptureSummary', content: '{"count":3}' },
      ],
      tools: [],
    });
    assert.equal(
      calls[1].contents[1].parts[0].thoughtSignature,
      'test-signature',
    );
  } finally {
    globalThis.fetch = original;
  }
});
test('migration isolates tables, RLS, retention, approvals and scheduling', () => {
  const sql = readFileSync(
    'supabase/migrations/20261003170150_central_bots.sql',
    'utf8',
  );
  const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map(
    (m) => m[1],
  );
  assert.equal(tables.length, 9);
  assert.ok(tables.every((t) => t.startsWith('agent_')));
  assert.match(sql, /enable row level security/);
  assert.match(sql, /account_id = public.current_inventory_account_id\(\)/);
  assert.match(
    sql,
    /revoke all on public.agent_runtime_settings from public, anon, authenticated/,
  );
  assert.doesNotMatch(sql, /security definer/i);
  assert.match(
    sql,
    /delete from public.agent_messages where expires_at <= now\(\)/,
  );
  assert.doesNotMatch(
    sql,
    /delete from public.agent_(events|runs|incidents|approvals)/,
  );
  assert.match(sql, /status <> 'pending' and decided_by is not null/);
  assert.match(sql, /skip locked/);
  assert.match(sql, /where status = 'running'/);
  assert.doesNotMatch(
    sql,
    /(?:alter|update|delete from|insert into)\s+(?:table\s+)?public\.bot_/i,
  );
});
test('protected Captador and existing push implementation match the audited baseline', () => {
  const paths = [
    'scripts/olx-executor.mjs',
    'src/lib/bot-captador',
    'src/components/bot-captador',
    'src/types/bot-captador.ts',
    'api/bot-captador.js',
    'api/_shared/bot-captador.js',
    'api/_shared/web-push-service.js',
    'public/sw.js',
  ];
  const diff = execFileSync(
    'git',
    ['diff', '0923c4267dc8fb29127ec8c43a1884d5fb4143da', '--', ...paths],
    { encoding: 'utf8' },
  );
  assert.equal(
    diff,
    '',
    'Protected production files must not change for Central',
  );
  const adapter = readFileSync(
    'supabase/functions/_shared/central-bots/captador-adapter.js',
    'utf8',
  );
  assert.doesNotMatch(adapter, /\.(insert|update|delete|upsert|rpc)\s*\(/);
  for (const file of readdirSync('supabase/functions/_shared/central-bots')) {
    const source = readFileSync(
      `supabase/functions/_shared/central-bots/${file}`,
      'utf8',
    );
    assert.doesNotMatch(
      source,
      /child_process|puppeteer|https?:[^\s'"]*:9222|olx-executor\.mjs|eval\(/,
    );
  }
});
