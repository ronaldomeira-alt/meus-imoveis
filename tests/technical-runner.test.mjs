import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {sourceAllowed,childEnvironment,validateAgentInit,runAntigravity,prepareSnapshot,checkFindings} from '../scripts/technical-bridge-runner.mjs';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {readDecision} from '../scripts/technical-read-gate.mjs';

test('Runner never exports credentials, private metadata, images, untracked files or unrestricted agent tools',()=>{
  for(const name of ['.env','src/.env','node_modules/file.js','public/private.jpg','.marketing-release.local/key.js','.agents/skills/private.js','supabase/.temp/key.js'])assert.equal(sourceAllowed(name),false,name);
  assert.equal(sourceAllowed('src/components/agents/CentralBotsView.tsx'),true);
  assert.equal(sourceAllowed('scripts/olx-executor.mjs'),true,'Protected source can be read, never executed');
  const env=childEnvironment({PATH:'ok',USERPROFILE:'ok',SUPABASE_SERVICE_ROLE_KEY:'secret',DEEPINFRA_API_KEY:'secret',TECHNICAL_TOKEN:'secret'});
  assert.deepEqual(env,{PATH:'ok',USERPROFILE:'ok'});
  assert.throws(()=>validateAgentInit({cwd:'C:/safe',tools:['run_command']},'C:/safe'),/fora do escopo/);
  assert.throws(()=>validateAgentInit({cwd:'C:/production',tools:['view_file']},'C:/safe'),/fora da cópia/);
});

test('Snapshot uses the committed revision, excludes keys and rejects invented code evidence',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'crm-technical-test-'));
  try{
    const repo=path.join(root,'repo'),snapshot=path.join(root,'snapshot');await mkdir(path.join(repo,'src'),{recursive:true});
    const git=args=>execFileSync('git',args,{cwd:repo,stdio:'pipe'});
    git(['init','--quiet']);await writeFile(path.join(repo,'src','example.ts'),'export const limit = 10;');await writeFile(path.join(repo,'.env'),'API_KEY=fixture-only');
    git(['add','.']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','--quiet','-m','fixture']);
    await writeFile(path.join(repo,'src','example.ts'),'export const limit = 99;');await writeFile(path.join(repo,'src','uncommitted.ts'),'private fixture');
    const manifest=await prepareSnapshot(repo,snapshot);assert.deepEqual(manifest.files,['src/example.ts']);
    const decision=(name,args)=>readDecision({toolCall:{name,args}},snapshot,manifest.files);
    assert.equal((await decision('view_file',{AbsolutePath:path.join(snapshot,'src','example.ts')})).decision,'allow');
    assert.equal((await decision('view_file',{AbsolutePath:path.join(repo,'.env')})).decision,'deny');
    assert.equal((await decision('view_file',{AbsolutePath:path.join(snapshot,'.agents','hooks.json')})).decision,'deny');
    assert.equal((await decision('grep_search',{SearchPath:snapshot})).decision,'allow');
    assert.equal((await decision('grep_search',{SearchPath:root})).decision,'deny');
    for(const name of ['run_command','write_to_file','call_mcp_tool','schedule','invoke_subagent','ask_permission'])assert.equal((await decision(name,{})).decision,'deny',name);
    assert.equal(await readFile(path.join(snapshot,'src','example.ts'),'utf8'),'export const limit = 10;');
    const result={assessment:'confirmed',findings:[{file:'src/example.ts',evidence:'limit = 10'}]};
    assert.equal((await checkFindings(result,snapshot,manifest)).code_revision,manifest.revision);
    await assert.rejects(checkFindings({...result,findings:[{file:'src/example.ts',evidence:'limit = 99'}]},snapshot,manifest),/confirmar uma evidência/);
    await assert.rejects(checkFindings({...result,findings:[{file:'../.env',evidence:'fixture-only'}]},snapshot,manifest),/confirmar uma evidência/);
  }finally{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'crm-technical-test-'));await rm(root,{recursive:true,force:true});}
});
function fakeProcess(events,exitCode=0) {
  return ()=>{
    const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>child.emit('close',1);
    child.stdin.on('finish',()=>setImmediate(()=>{
      const output=Buffer.from(events.map(e=>JSON.stringify(e)+'\n').join(''));
      for(const byte of output)child.stdout.write(Buffer.from([byte]));child.stdout.end();child.emit('close',exitCode);
    }));return child;
  };
}
test('CLI result must be nonempty and verified; byte splits preserve Portuguese; missing/unsafe init is rejected',async()=>{
  const root='C:/safe',init={event:'init',init:{cwd:root,tools:['view_file','grep_search']}};
  const run=events=>runAntigravity({executable:'fake',root,prompt:'teste',smoke:true,timeoutMs:1000,spawnProcess:fakeProcess(events)});
  assert.equal(await run([init,{event:'result',result:{status:'SUCCESS',response:'Conclusão válida'}}]),'Conclusão válida');
  await assert.rejects(run([init,{event:'result',result:{status:'SUCCESS',response:''}}]),/conclusão válida/);
  await assert.rejects(run([{event:'result',result:{status:'SUCCESS',response:'OK'}}]),/conclusão válida/);
  await assert.rejects(run([{event:'init',init:{cwd:root,tools:['run_command']}},{event:'result',result:{status:'SUCCESS',response:'OK'}}]),/fora do escopo/);
});
