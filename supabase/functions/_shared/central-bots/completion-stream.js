import { AgentError } from './core.js';

// Consume SSE incrementally. Never forward reasoning or tool arguments to the UI.
export async function readCompletionStream(response, onText) {
  const reader=response.body?.getReader();
  if(!reader) throw new AgentError('A resposta da IA foi interrompida.',503);
  const decoder=new TextDecoder(),message={role:'assistant',content:''},calls=[];
  let buffer='',done=false,usage=null,total=0;
  function frame(raw) {
    const data=raw.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
    if(!data)return;
    if(data==='[DONE]'){done=true;return;}
    let value;try{value=JSON.parse(data);}catch{throw new AgentError('Resposta de IA inválida.',503);}
    if(value.error)throw new AgentError('A resposta da IA foi interrompida.',503);
    if(value.usage)usage=value.usage;
    const delta=value.choices?.[0]?.delta;
    if(!delta)return;
    for(const part of delta.tool_calls||[]) {
      if(!Number.isInteger(part.index)||part.index<0||part.index>2)throw new AgentError('Limite de ferramentas excedido.',422);
      const call=calls[part.index] ||= {id:'',type:'function',function:{name:'',arguments:''}};
      call.id+=part.id||'';call.function.name+=part.function?.name||'';call.function.arguments+=part.function?.arguments||'';
    }
    if(typeof delta.content==='string') {
      message.content+=delta.content;
      if(message.content.length>16000)throw new AgentError('Resposta de IA grande demais.',503);
      if(!calls.length)onText(message.content);
    }
  }
  try {
    while(!done) {
      const chunk=await reader.read();if(chunk.done)break;
      total+=chunk.value.length;if(total>2000000)throw new AgentError('Resposta de IA grande demais.',503);
      buffer=(buffer+decoder.decode(chunk.value,{stream:true})).replace(/\r\n/g,'\n');
      let boundary;
      while((boundary=buffer.indexOf('\n\n'))>=0){frame(buffer.slice(0,boundary));buffer=buffer.slice(boundary+2);}
    }
    if(!done)throw new AgentError('A resposta da IA foi interrompida. Tente novamente.',503);
    if(calls.length)message.tool_calls=calls;
    return {choices:[{message}],usage};
  } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
}
