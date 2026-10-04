// Real public news + real provider + isolated local PostgreSQL. No production reads/writes,
// push dispatch, publishing, CRM Leads or Captador/Match operations.
// Run: node --use-system-ca --env-file=.env scripts/marketing-real-cycle.mjs
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { database, client } from '../tests/helpers/marketing-db.mjs';
import { BUILTINS } from '../supabase/functions/_shared/central-bots/core.js';
import { setupMarketing, marketingAction } from '../supabase/functions/_shared/bot-marketing/store.js';
import { marketingTick } from '../supabase/functions/_shared/bot-marketing/worker.js';

const outputDir = new URL('../.marketing-validation.local/', import.meta.url);
mkdirSync(outputDir, { recursive: true });
const env = {
  // Local validation may reuse the existing credential, never a client runtime.
  GROQ_API_KEY: process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY,
  AGENT_AI_PROVIDER: 'groq', MARKETING_BOT_ENABLED: 'true',
  MARKETING_MODEL_PRICES: process.env.MARKETING_MODEL_PRICES || '{"openai/gpt-oss-20b":{"input":0.075,"output":0.30}}',
};
if (!env.GROQ_API_KEY) throw Error('Credencial local de IA não disponível.');
const resume = process.argv.includes('--resume');
const snapshotFile = new URL('postgres.tar.gz', outputDir);
const pg = await database(undefined, resume && existsSync(snapshotFile) ? new Blob([readFileSync(snapshotFile)]) : undefined);
const previous = resume ? (await pg.query('select account_id,bot_id from agent_marketing_settings limit 1')).rows[0] : null;
const accountId = previous?.account_id || crypto.randomUUID(), userId = previous ? (await pg.query('select id from auth.users limit 1')).rows[0].id : crypto.randomUUID(), botId = previous?.bot_id || crypto.randomUUID();
const bot = { ...BUILTINS.find(b => b.kind === 'marketing'), id: botId, active: true, provider: 'groq', notifications: false };
const ctx = { db: client(pg), env, accountId, user: { id: userId } };
const started = new Date().toISOString(), outcomes = [];
try {
  if (previous) {
    // Refresh only local worker functions while iterating the unshipped migration.
    const sql = readFileSync(new URL('../supabase/migrations/20261004171533_bot_marketing.sql', import.meta.url),'utf8');
    for (const fn of sql.match(/create function public\.[\s\S]*?end \$\$;/g) || []) await pg.exec(fn.replace('create function','create or replace function'));
  }
  if (!previous) {
  await pg.query('insert into accounts values($1)', [accountId]);
  await pg.query('insert into auth.users values($1)', [userId]);
  await pg.query("insert into agent_bots(id,account_id,slug,name,mission,kind,avatar,notifications) values($1,$2,'marketing','Bot de Marketing','Validação isolada com fontes e IA reais','marketing','marketing',false)", [botId, accountId]);
  await pg.query("insert into agent_runtime_settings(account_id,function_url) values($1,'https://local-validation.invalid')", [accountId]);
  await setupMarketing(ctx, bot);
  }
  await marketingAction(ctx, bot, { operation: 'settings', settings: { enabled: true, max_steps: 20, max_calls: 6 } });
  const dependencies = {
    readInventory: async () => ({ unavailable: true, limits: 'Estoque excluído desta validação externa; leitura real verificada separadamente.' }),
    readInstagram: async () => ({ unavailable: true, status: 'excluded_from_external_validation', limits: 'Legendas excluídas desta validação externa; leitura real verificada separadamente.' }),
  };
  for (let step = 0; step < 20; step++) {
    const result = await marketingTick(ctx, bot, dependencies);
    outcomes.push(result); console.log(JSON.stringify(result));
    if (result.completed || result.failed || result.skipped) break;
  }
  // Allow explicit chat delivery in isolated DB; no push callback is supplied.
  await pg.query('update agent_marketing_settings set next_delivery_at=now()');
  await marketingTick(ctx, bot, dependencies);
  const tasks = (await pg.query('select id,status,phase,steps,calls,reserved_usd,measured_usd,usage,error,checkpoint,created_at,finished_at from agent_marketing_tasks')).rows;
  const ideas = (await pg.query('select id,topic,angle,status,proposal,delivered_at from agent_marketing_ideas')).rows;
  const sources = (await pg.query('select url,identity,access_status,last_checked_at,limits from agent_marketing_sources')).rows;
  const memory = (await pg.query('select id,kind,topic,data from agent_marketing_memory')).rows;
  const chat = (await pg.query('select content,created_at from agent_messages')).rows;
  const report = { started_at: tasks[0]?.created_at || started, finished_at: tasks[0]?.finished_at || new Date().toISOString(), mode: 'real_sources_real_AI_local_PostgreSQL', production_writes: false, push_sent: false,
    external_payload: 'Only public official news and user-declared editorial context; no stock, private data or Instagram captions.',
    outcomes, tasks, ideas, sources, facts: memory.filter(r => r.kind === 'fact'), chat,
    limits: ['Cron real e backend de produção não foram implantados.', 'Persistência testada em PostgreSQL isolado, com dados reais de pesquisa.', 'Nenhum aviso externo foi disparado; UI e push usam fixtures apenas nos testes separados.'] };
  writeFileSync(new URL('evidence.json', outputDir), JSON.stringify(report, null, 2));
  const snapshot = await pg.dumpDataDir();
  writeFileSync(new URL('postgres.tar.gz', outputDir), Buffer.from(await snapshot.arrayBuffer()));
  console.log(`Evidence saved: ${new URL('evidence.json', outputDir).pathname}; completed=${tasks[0]?.status === 'completed'}; ideas=${ideas.length}`);
} finally { await pg.close(); }
// Re-open a different PostgreSQL instance from the on-disk snapshot.
const snapshotPath = new URL('postgres.tar.gz', outputDir);
if (existsSync(snapshotPath)) {
  const resumed = await database(undefined, new Blob([readFileSync(snapshotPath)]));
  try { console.log('After restart:', (await resumed.query('select count(*)::int as tasks from agent_marketing_tasks')).rows[0]); }
  finally { await resumed.close(); }
}
