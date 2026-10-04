import {test} from 'node:test';
import assert from 'node:assert/strict';
import {database,client} from './helpers/marketing-db.mjs';
import {BUILTINS} from '../supabase/functions/_shared/central-bots/core.js';
import {listCentral} from '../supabase/functions/_shared/central-bots/service.js';

test('Central list with Marketing uses valid batch columns and preserves existing bots and user settings',{timeout:30000},async()=>{
  const pg=await database();
  try {
    const account=crypto.randomUUID(),user=crypto.randomUUID();
    await pg.query('insert into accounts values($1)',[account]);await pg.query('insert into auth.users values($1)',[user]);
    const ctx={db:client(pg),accountId:account,user:{id:user},env:{SUPABASE_URL:'https://example.test',MARKETING_BOT_ENABLED:'true'}};
    // The pre-fix mixed batch fails even before conflict handling: existing rows
    // do not protect an INSERT against a NOT NULL violation.
    const mixed=await ctx.db.from('agent_bots').upsert(BUILTINS.map(bot=>({...bot,account_id:account,created_by:user})),{onConflict:'account_id,slug',ignoreDuplicates:true});
    assert.equal(mixed.error?.code,'23502');
    const first=await listCentral(ctx);
    assert.equal(first.bots.length,4);assert.ok(first.bots.every(b=>b.autonomy));
    assert.equal(first.bots.find(b=>b.kind==='marketing').autonomy,'propose');
    assert.deepEqual(first.bots.find(b=>b.kind==='gestor').notification_events,['incident','approval']);
    const ids=first.bots.map(b=>b.id);
    await pg.query("update agent_bots set mission='Missão personalizada preservada',notifications=false where account_id=$1 and slug='gestor'",[account]);
    const second=await listCentral(ctx);
    assert.deepEqual(second.bots.map(b=>b.id),ids);
    assert.equal(second.bots.find(b=>b.kind==='gestor').mission,'Missão personalizada preservada');
    assert.equal(second.bots.find(b=>b.kind==='gestor').notifications,false);
  }finally{await pg.close();}
});
