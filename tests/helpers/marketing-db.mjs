// Isolated PostgreSQL harness. Cron/network functions are fixtures; no production writes.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
export async function database(path, snapshot) {
  const pg = new PGlite({ ...(path ? { dataDir: path.replaceAll('\\','/') } : {}), ...(snapshot ? { loadDataDir: snapshot } : {}) });
  if ((await pg.query("select to_regclass('public.agent_marketing_tasks') as t")).rows[0].t) return pg;
  await pg.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.accounts(id uuid primary key);
    create function public.current_inventory_account_id() returns uuid language sql stable as $$ select current_setting('test.account',true)::uuid $$;
    create function public.gen_random_bytes(n integer) returns bytea language sql as $$ select decode(repeat('ab',n),'hex') $$;
    create schema cron; create table cron.job(id bigserial primary key,name text,schedule text,command text);
    create function cron.schedule(text,text,text) returns bigint language sql as $$ insert into cron.job(name,schedule,command) values($1,$2,$3) returning id $$;
    create schema net; create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$ select 1::bigint $$;
    create table inventory_properties(account_id uuid,property_id text,property_data jsonb,updated_at timestamptz default now());
    create table marketing_posts(id uuid primary key,caption text,media_urls jsonb,post_type text,channel text,status text,created_by uuid);
  `);
  for (const name of ['20261003170150_central_bots.sql','20261004171533_bot_marketing.sql','20261005010000_central_bots_camada4_state_memory.sql','20261005020000_central_bots_camada5_autonomy.sql']) await pg.exec(readFileSync(`supabase/migrations/${name}`,'utf8').replace(/^create extension[^;]+;/gm,''));
  return pg;
}
const ident = s => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error('Invalid test identifier'); return `"${s}"`; };
export function client(pg) {
  return {
    from(name) { return new Query(pg,name); },
    async rpc(name,args) {
      try {
        const cols = Object.keys(args);
        const result = await pg.query(`select * from public.${ident(name)}(${cols.map((c,i) => `${ident(c)}=>$${i+1}`).join(',')})`,cols.map(c => typeof args[c] === 'object' && args[c] !== null ? JSON.stringify(args[c]) : args[c]));
        const scalar = ['agent_marketing_checkpoint','agent_marketing_reserve','agent_marketing_reserve_chat','agent_marketing_deliver','agent_marketing_feedback_apply','agent_marketing_propose'];
        return { data: scalar.includes(name) ? result.rows[0]?.[name] : result.rows, error:null };
      } catch(e) { return {data:null,error:{message:e.message,code:e.code}}; }
    },
  };
}
class Query {
  constructor(pg,name) { this.pg=pg; this.name=name; this.fields='*'; this.where=[]; this.orders=[]; this.args=[]; this.mode='select'; this.singleMode=false; this.limitValue=null; }
  select(fields='*') { this.fields=fields; return this; }
  insert(data) { this.mode='insert'; this.payload=Array.isArray(data)?data:[data]; return this; }
  upsert(data,options={}) { this.insert(data); this.conflict=options; return this; }
  update(data) { this.mode='update'; this.payload=data; return this; }
  delete() { this.mode='delete'; return this; }
  filter(k,op,v) { this.args.push(typeof v==='object'&&v!==null?JSON.stringify(v):v); this.where.push(`${ident(k)} ${op} $${this.args.length}`); return this; }
  eq(k,v) { return this.filter(k,'=',v); }
  neq(k,v) { return this.filter(k,'<>',v); }
  gt(k,v) { return this.filter(k,'>',v); }
  gte(k,v) { return this.filter(k,'>=',v); }
  lt(k,v) { return this.filter(k,'<',v); }
  lte(k,v) { return this.filter(k,'<=',v); }
  is(k,v) { if (v === null) { this.where.push(`${ident(k)} is null`); return this; } return this.filter(k,'is',v); }
  not(k,op,v) { if (op === 'is' && v === null) { this.where.push(`${ident(k)} is not null`); return this; } return this.filter(k,'<>',v); }
  ilike(k,v) { return this.filter(k,'ilike',v); }
  contains(k,v) { return this.filter(k,'@>',v); }
  or(clause) {
    const parts = clause.split(',').map(part => {
      const segs = part.split('.');
      if (segs.length >= 3 && segs[1] === 'is' && segs[2] === 'null') return `"${segs[0]}" is null`;
      if (segs.length >= 3 && segs[1] === 'gt') {
        const val = segs.slice(2).join('.');
        this.args.push(val);
        return `"${segs[0]}" > $${this.args.length}`;
      }
      return null;
    }).filter(Boolean);
    if (parts.length) this.where.push(`(${parts.join(' or ')})`);
    return this;
  }
  order(k,o={}) { this.orders.push(`${ident(k)} ${o.ascending===false?'desc':'asc'} ${o.nullsFirst?'nulls first':'nulls last'}`); return this; }
  limit(n) { this.limitValue=n; return this; }
  single() { this.singleMode=true; return this; }
  maybeSingle() { this.singleMode=true; return this; }
  then(resolve,reject) { return this.execute().then(resolve,reject); }
  async execute() {
    try {
      const params=[...this.args];
      let sql, fields=this.fields==='*'?'*':this.fields.split(',').map(ident).join(',');
      const where=this.where.length?' where '+this.where.join(' and '):'';
      if(this.mode==='insert') {
        // Match PostgREST's batch behavior: union columns, NULL for missing fields.
        const cols=[...new Set(this.payload.flatMap(p=>Object.keys(p)))];
        const vals=this.payload.map(p=>'('+cols.map(k=>{const v=Object.hasOwn(p,k)?p[k]:null;params.push(typeof v==='object'&&v!==null&&!['tools','notification_events','topics'].includes(k)?JSON.stringify(v):v);return '$'+params.length;}).join(',')+')').join(',');
        sql=`insert into public.${ident(this.name)}(${cols.map(ident).join(',')}) values ${vals}`;
        if(this.conflict) {
          const conflictKeys = new Set(this.conflict.onConflict.split(',').map(s=>s.trim()));
          const updateCols = cols.filter(c => !conflictKeys.has(c));
          sql+=` on conflict (${this.conflict.onConflict.split(',').map(ident).join(',')}) ${this.conflict.ignoreDuplicates || updateCols.length === 0 ? 'do nothing' : 'do update set '+updateCols.map(c=>`${ident(c)}=excluded.${ident(c)}`).join(',')}`;
        }
        sql+=' returning '+fields;
      } else if(this.mode==='update') {
        const set=Object.keys(this.payload).map(k=>{const v=this.payload[k];params.push(typeof v==='object'&&v!==null?JSON.stringify(v):v);return `${ident(k)}=$${params.length}`;});
        sql=`update public.${ident(this.name)} set ${set.join(',')}${where} returning ${fields}`;
      } else if(this.mode==='delete') sql=`delete from public.${ident(this.name)}${where} returning ${fields}`;
      else sql=`select ${fields} from public.${ident(this.name)}${where}${this.orders.length?' order by '+this.orders.join(','):''}${this.limitValue!==null?' limit '+Number(this.limitValue):''}`;
      const result=await this.pg.query(sql,params);
      return {data:this.singleMode?result.rows[0]||null:result.rows,count:result.rows.length,error:null};
    }catch(e){ return {data:null,error:{message:e.message,code:e.code}}; }
  }
}
