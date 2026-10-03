// Run with: deno run --node-modules-dir=none --lock=tests/central-bots-rls.deno.lock --allow-read --allow-env tests/central-bots-rls.test.mjs
// PostgreSQL is in memory. Cron/pg_net/pgcrypto are test doubles, never production.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from 'npm:@electric-sql/pglite@0.5.8';

const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.accounts(id uuid primary key);
    create function public.current_inventory_account_id() returns uuid language sql stable as $$ select current_setting('test.account', true)::uuid $$;
    create function public.gen_random_bytes(n integer) returns bytea language sql as $$ select decode(repeat('ab', n), 'hex') $$;
    create schema cron; create table cron.job(id bigserial primary key, name text, schedule text, command text);
    create function cron.schedule(text,text,text) returns bigint language sql as $$ insert into cron.job(name,schedule,command) values($1,$2,$3) returning id $$;
    create schema net;
    create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer) returns bigint language sql as $$ select 1::bigint $$;
    create table public.bot_settings(id integer primary key, protected_value text);
    insert into public.bot_settings values (1,'unchanged');
  `);
  const sql = readFileSync(
    'supabase/migrations/20261003170150_central_bots.sql',
    'utf8',
  );
  await db.exec(
    sql.replace(
      /^create extension if not exists (?:pg_cron|pg_net) with schema \w+;\r?$/gm,
      '',
    ),
  );
  const accounts = [crypto.randomUUID(), crypto.randomUUID()],
    bots = [],
    conversations = [];
  const user = crypto.randomUUID();
  await db.query('insert into auth.users values($1)', [user]);
  for (const account of accounts) {
    await db.query('insert into accounts values($1)', [account]);
    const bot = (
      await db.query(
        "insert into agent_bots(account_id,slug,name,mission,kind) values($1,'test','Test Bot','Read only test mission','custom') returning id",
        [account],
      )
    ).rows[0].id;
    bots.push(bot);
    const conv = (
      await db.query(
        'insert into agent_conversations(account_id,bot_id) values($1,$2) returning id',
        [account, bot],
      )
    ).rows[0].id;
    conversations.push(conv);
    await db.query(
      "insert into agent_messages(account_id,conversation_id,client_message_id,role,content) values($1,$2,$3,'user','Visible fixture')",
      [account, conv, crypto.randomUUID()],
    );
    await db.query(
      "insert into agent_messages(account_id,conversation_id,client_message_id,role,content,expires_at) values($1,$2,$3,'user','Expired fixture',now()-interval '1 day')",
      [account, conv, crypto.randomUUID()],
    );
    await db.query(
      "insert into agent_runtime_settings(account_id,function_url) values($1,'https://example.test/function')",
      [account],
    );
    await db.query(
      "insert into agent_runs(account_id,bot_id,trigger_type,status) values($1,$2,'chat','completed')",
      [account, bot],
    );
    await db.query(
      "insert into agent_events(account_id,bot_id,type) values($1,$2,'fixture')",
      [account, bot],
    );
    await db.query(
      "insert into agent_incidents(account_id,bot_id,fingerprint,component,expected,observed,impact,confidence) values($1,$2,'test','test','available','unknown','low',0.5)",
      [account, bot],
    );
    await db.query(
      "insert into agent_approvals(account_id,bot_id,action,reason) values($1,$2,'run_report','Test approval')",
      [account, bot],
    );
    await db.query(
      'insert into agent_schedules(account_id,bot_id,interval_minutes) values($1,$2,60)',
      [account, bot],
    );
  }
  const tables = [
    'agent_bots',
    'agent_conversations',
    'agent_messages',
    'agent_runs',
    'agent_events',
    'agent_incidents',
    'agent_approvals',
    'agent_schedules',
  ];
  await db.query("select set_config('test.account',$1,false)", [accounts[0]]);
  await db.exec('set role authenticated');
  for (const table of tables) {
    const selected = (await db.query(`select * from ${table}`)).rows;
    assert.equal(
      selected.length,
      1,
      `${table}: only current account and unexpired chat`,
    );
    assert.equal(selected[0].account_id, accounts[0]);
    await assert.rejects(db.query(`delete from ${table}`), /permission denied/);
  }
  await assert.rejects(
    db.query('select * from agent_runtime_settings'),
    /permission denied/,
  );
  await assert.rejects(
    db.query(
      "update agent_approvals set status='approved',decided_by=$1,decided_at=now()",
      [user],
    ),
    /permission denied/,
  );
  await assert.rejects(
    db.query('select * from agent_claim_due_schedule($1,$2)', [
      accounts[0],
      bots[0],
    ]),
    /permission denied/,
  );
  await db.exec('reset role; set role anon');
  for (const table of [...tables, 'agent_runtime_settings'])
    await assert.rejects(
      db.query(`select * from ${table}`),
      /permission denied/,
    );
  await db.exec('reset role');
  await assert.rejects(
    db.query(
      'insert into agent_conversations(account_id,bot_id) values($1,$2)',
      [accounts[0], bots[1]],
    ),
    /foreign key/,
  );
  await assert.rejects(
    db.query("update agent_approvals set status='approved'"),
    /check constraint/,
  );
  await db.exec('set role service_role');
  assert.equal(
    (
      await db.query('select * from agent_claim_due_schedule($1,$2)', [
        accounts[0],
        bots[0],
      ])
    ).rows.length,
    1,
  );
  assert.equal(
    (
      await db.query('select * from agent_claim_due_schedule($1,$2)', [
        accounts[0],
        bots[0],
      ])
    ).rows.length,
    0,
  );
  await db.query(
    'update agent_runtime_settings set enabled=false where account_id=$1',
    [accounts[1]],
  );
  assert.equal(
    (
      await db.query('select * from agent_claim_due_schedule($1,$2)', [
        accounts[1],
        bots[1],
      ])
    ).rows.length,
    0,
  );
  await db.exec('reset role');
  const cleanup = (
    await db.query(
      "select command from cron.job where name='central-bots-chat-retention'",
    )
  ).rows[0].command;
  await db.exec(cleanup);
  assert.equal(
    (await db.query('select count(*)::int as n from agent_messages')).rows[0].n,
    2,
  );
  for (const table of [
    'agent_events',
    'agent_runs',
    'agent_incidents',
    'agent_approvals',
  ])
    assert.equal(
      (await db.query(`select count(*)::int as n from ${table}`)).rows[0].n,
      2,
    );
  assert.equal(
    (await db.query('select protected_value from bot_settings')).rows[0]
      .protected_value,
    'unchanged',
  );
  console.log(
    'PostgreSQL in-memory: migration, RLS, account isolation, denied writes, expiry, approvals, schedule claims and protected-table isolation passed.',
  );
  console.log(
    'Hosted pg_cron/pg_net/pgcrypto and Supabase deployment still require live verification.',
  );
} finally {
  await db.close();
}
