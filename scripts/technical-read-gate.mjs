import path from 'node:path';
import {realpath,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// This fixed hook runs before tools; model text never becomes a command.
export async function readDecision(payload,root,files) {
  const denied={decision:'deny',reason:'Esta investigação permite apenas ler a cópia autorizada do código.'};
  const call=payload?.toolCall;if(!call)return denied;
  if(call.name==='finish')return {decision:'allow'};
  if(!['view_file','grep_search'].includes(call.name))return denied;
  const supplied=call.name==='view_file'?call.args?.AbsolutePath:call.args?.SearchPath;
  if(typeof supplied!=='string' || !supplied.trim())return denied;
  let target,canonical;try{canonical=await realpath(root);target=await realpath(path.resolve(root,supplied));}catch{return denied;}
  const relative=path.relative(canonical,target).replaceAll('\\','/');
  if(relative==='..' || relative.startsWith('../') || path.isAbsolute(relative))return denied;
  if(call.name==='view_file' && relative!=='source-index.json' && !files.includes(relative))return denied;
  if(call.name==='grep_search' && relative && !files.some(file=>file===relative || file.startsWith(relative+'/')))return denied;
  return {decision:'allow'};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>100000)break;}
  try{
    const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),payload=JSON.parse(input);
    if(process.argv[2]==='invocation'){
      await writeFile(path.join(root,'.agents','scope-verified.json'),JSON.stringify({conversationId:payload.conversationId,nonce:process.argv[3]}));
      console.log('{}');
    }else{
      const manifest=JSON.parse(await readFile(path.join(root,'source-index.json'),'utf8'));
      console.log(JSON.stringify(await readDecision(payload,root,manifest.files)));
    }
  }catch{console.log(JSON.stringify({decision:'deny',reason:'Não consegui validar o escopo de leitura.'}));}
}
